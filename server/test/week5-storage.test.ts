// P6: хранилище файлов. Подпись AWS SigV4 проверена по примеру из документации AWS; фиктивное S3 в памяти; резюме, вложения чата, селфи, перенос из базы.
// Запуск: npx tsx --test test/week5-storage.test.ts (БД portal_test_week5storage пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week5storage`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'portal-test-uploads-week5');
for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_REGION']) delete process.env[k];

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let st: typeof import('../src/storage.js');
const realFetch = globalThis.fetch;
const bucket = new Map<string, { body: Buffer; mime: string }>();
const calls: { method: string; url: string; auth: string; hash: string }[] = [];
let failPut = false;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week5storage WITH (FORCE)');
  await createDb(admin, 'portal_test_week5storage');
  await admin.end();
  fs.rmSync(process.env.UPLOAD_DIR!, { recursive: true, force: true }); fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  st = await import('../src/storage.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  // фиктивное S3: путь /<bucket>/<ключ>
  globalThis.fetch = (async (url: any, init: any) => {
    const u = new URL(String(url));
    if (u.host !== 's3.example.test') return realFetch(url, init);
    const key = decodeURIComponent(u.pathname.replace(/^\/mybucket\//, ''));
    const h = init.headers as Record<string, string>;
    calls.push({ method: init.method, url: String(url), auth: h.authorization ?? '', hash: h['x-amz-content-sha256'] ?? '' });
    if (!/^AWS4-HMAC-SHA256 Credential=AKTEST\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/.test(h.authorization ?? '')) return new Response('bad sig', { status: 403 });
    if (init.method === 'PUT') { if (failPut) return new Response('boom', { status: 500 }); bucket.set(key, { body: Buffer.from(init.body), mime: h['content-type'] }); return new Response('', { status: 200 }); }
    if (init.method === 'GET') { const o = bucket.get(key); return o ? new Response(o.body, { status: 200 }) : new Response('nf', { status: 404 }); }
    if (init.method === 'DELETE') { bucket.delete(key); return new Response('', { status: 204 }); }
    return new Response('', { status: 405 });
  }) as any;
});
after(async () => { globalThis.fetch = realFetch; for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) delete process.env[k]; await app.close(); await pool.end(); });

const useS3 = () => { Object.assign(process.env, { S3_ENDPOINT: 'https://s3.example.test', S3_BUCKET: 'mybucket', S3_ACCESS_KEY: 'AKTEST', S3_SECRET_KEY: 'secret' }); };
const noS3 = () => { for (const k of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) delete process.env[k]; };

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const mp = (who: any, url: string, buf: Buffer, filename: string, fields: Record<string, string> = {}) => {
  const b = '----st';
  const parts = Object.entries(fields).map(([k, v]) => `--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join('');
  const body = Buffer.concat([Buffer.from(parts), Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--\r\n`)]);
  return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': `multipart/form-data; boundary=${b}` }, ...who });
};
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');

test('Подпись AWS SigV4 совпадает с примером из документации AWS (GET Object с Range)', () => {
  const h = st.signV4({
    method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', headers: { Range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', date: new Date('2013-05-24T00:00:00Z'), region: 'us-east-1',
    accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });
  assert.equal(h.authorization, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  assert.equal(h['x-amz-date'], '20130524T000000Z');
  // и пример PUT Object с телом и заголовком хранилища
  const put = st.signV4({
    method: 'PUT', host: 'examplebucket.s3.amazonaws.com', path: '/test%24file.text', headers: { Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
    payloadHash: '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072', date: new Date('2013-05-24T00:00:00Z'), region: 'us-east-1',
    accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });
  assert.match(put.authorization, /Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd$/);
});

test('Режим по умолчанию — диск: ключи безопасны, без S3 всё работает как раньше', async () => {
  noS3();
  assert.equal(st.storageKind(), 'disk');
  assert.equal(st.safeKey('../../etc/passwd'), 'etc/passwd'); assert.equal(st.safeKey('a\\b/../c.txt'), 'a/b/c.txt'); assert.equal(st.safeKey('chat/x.png'), 'chat/x.png');
  await st.putFile('t/one.txt', Buffer.from('диск'));
  assert.equal((await st.getFile('t/one.txt'))!.toString(), 'диск'); assert.equal(await st.getFile('t/нет.txt'), null);
  await st.deleteFile('t/one.txt'); assert.equal(await st.getFile('t/one.txt'), null);
  // резюме в базе, как раньше
  const hr = await login('hr');
  const a = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Диана', last_name: 'Тестова', position: 'Оператор' })).json().applicant;
  const up = await mp(hr, `/api/hire/applicants/${a.id}/resume`, PDF, 'cv.pdf');
  assert.equal(up.statusCode, 200);
  const row = (await pool.query(`SELECT data IS NOT NULL AS db, storage_key FROM hire_resumes WHERE id=$1`, [up.json().resume.id])).rows[0];
  assert.deepEqual([row.db, row.storage_key], [true, null]);
  assert.equal((await get(hr, `/api/hire/resumes/${up.json().resume.id}/file`)).rawPayload.equals(PDF), true);
});

test('S3: резюме уходит в хранилище, в базе только ключ; скачивается; удаляется вместе с кандидатом и при обезличивании', async () => {
  useS3(); bucket.clear(); calls.length = 0;
  assert.equal(st.storageKind(), 's3');
  const hr = await login('hr'), adm = await login('admin', 'admin-test-1');
  const a = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Эльмира', last_name: 'Хранилова', position: 'Оператор' })).json().applicant;
  const up = await mp(hr, `/api/hire/applicants/${a.id}/resume`, PDF, 'cv.pdf');
  assert.equal(up.statusCode, 200, up.body);
  const id = up.json().resume.id;
  const row = (await pool.query(`SELECT data, storage_key, size FROM hire_resumes WHERE id=$1`, [id])).rows[0];
  assert.equal(row.data, null, 'в базе файла нет'); assert.match(row.storage_key, /^resume\/[0-9a-f-]{36}$/); assert.equal(row.size, PDF.length);
  assert.ok(bucket.get(row.storage_key)!.body.equals(PDF), 'файл в хранилище'); assert.equal(bucket.get(row.storage_key)!.mime, 'application/pdf');
  assert.ok(calls.every((c) => c.auth.startsWith('AWS4-HMAC-SHA256 ')), 'каждый запрос подписан');
  assert.equal(calls[0].hash.length, 64);
  const dl = await get(hr, `/api/hire/resumes/${id}/file`);
  assert.equal(dl.statusCode, 200); assert.ok(dl.rawPayload.equals(PDF)); assert.match(String(dl.headers['content-disposition']), /attachment/);
  // обезличивание удаляет и файл
  assert.equal((await send(adm, 'POST', `/api/hire/applicants/${a.id}/anonymize`)).statusCode, 200);
  assert.equal(bucket.has(row.storage_key), false, 'файл удалён из хранилища при обезличивании');
  // удаление кандидата
  const b = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Бахром', last_name: 'Удаляев', position: 'Кладовщик' })).json().applicant;
  const up2 = await mp(hr, `/api/hire/applicants/${b.id}/resume`, PDF, 'cv2.pdf');
  const key2 = (await pool.query(`SELECT storage_key FROM hire_resumes WHERE id=$1`, [up2.json().resume.id])).rows[0].storage_key;
  assert.ok(bucket.has(key2));
  assert.equal((await send(adm, 'DELETE', `/api/hire/applicants/${b.id}`)).statusCode, 200);
  assert.equal(bucket.has(key2), false, 'файл удалён из хранилища вместе с кандидатом');
  assert.equal(bucket.size, 0);
});

test('S3: сбой хранилища — понятная ошибка и никакой записи в базе; старые резюме из базы по-прежнему скачиваются', async () => {
  useS3(); bucket.clear();
  const hr = await login('hr');
  const a = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Гулнора', last_name: 'Сбойная', position: 'Оператор' })).json().applicant;
  failPut = true;
  const bad = await mp(hr, `/api/hire/applicants/${a.id}/resume`, PDF, 'cv.pdf');
  failPut = false;
  assert.equal(bad.statusCode, 502); assert.equal(bad.json().error, 'storage');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM hire_resumes WHERE applicant_id=$1`, [a.id])).rows[0].n, 0, 'записи нет');
  // старая запись: файл в базе
  const old = (await pool.query(`INSERT INTO hire_resumes(applicant_id,filename,mime,size,data,created_by) VALUES($1,'old.pdf','application/pdf',$2,$3,(SELECT id FROM users WHERE login='hr')) RETURNING id`, [a.id, PDF.length, PDF])).rows[0].id;
  assert.ok((await get(hr, `/api/hire/resumes/${old}/file`)).rawPayload.equals(PDF), 'резюме из базы читается и в режиме S3');
  // запись со ссылкой на пропавший файл — 404, а не падение
  const lost = (await pool.query(`INSERT INTO hire_resumes(applicant_id,filename,mime,size,storage_key,created_by) VALUES($1,'lost.pdf','application/pdf',5,'resume/нет-такого',(SELECT id FROM users WHERE login='hr')) RETURNING id`, [a.id])).rows[0].id;
  const lostRes = await get(hr, `/api/hire/resumes/${lost}/file`); assert.equal(lostRes.statusCode, 404, lostRes.body);
});

test('S3: вложения чата — загрузка, скачивание, удаление вместе с сообщением; старый файл с диска читается', async () => {
  useS3(); bucket.clear();
  const op1 = await login('op1'), op2 = await login('op2');
  const ch = (await get(op1, '/api/chat/channels')).json().channels.find((c: any) => c.kind === 'company' || c.id === 'general')?.id ?? 'general';
  const r = await mp(op1, `/api/chat/${ch}/upload`, Buffer.from('итоги смены'), 'отчёт.txt', { body: 'Смотрите' });
  assert.equal(r.statusCode, 200, r.body);
  const file = (await pool.query(`SELECT id,path FROM chat_files ORDER BY id DESC LIMIT 1`)).rows[0];
  assert.match(file.path, /^chat\/[0-9a-f-]{36}\.txt$/); assert.ok(bucket.has(file.path), 'лежит в хранилище');
  assert.equal(fs.existsSync(path.join(process.env.UPLOAD_DIR!, file.path)), false, 'на диск не пишется');
  const dl = await get(op2, `/api/chat/file/${file.id}`);
  assert.equal(dl.statusCode, 200); assert.equal(dl.body, 'итоги смены');
  assert.equal((await send(op1, 'DELETE', `/api/chat/message/${r.json().id}`)).statusCode, 200);
  assert.equal(bucket.has(file.path), false, 'файл удалён из хранилища вместе с сообщением');
  // файл, загруженный до перехода на S3, лежит на диске: читается
  fs.mkdirSync(path.join(process.env.UPLOAD_DIR!, 'chat'), { recursive: true });
  fs.writeFileSync(path.join(process.env.UPLOAD_DIR!, 'chat', 'legacy.txt'), 'со старого диска');
  const m = (await pool.query(`INSERT INTO chat_messages(channel,user_id,body) VALUES($1,(SELECT id FROM users WHERE login='op1'),'старое') RETURNING id`, [ch])).rows[0].id;
  const f2 = (await pool.query(`INSERT INTO chat_files(message_id,name,mime,size,path) VALUES($1,'legacy.txt','text/plain',16,'chat/legacy.txt') RETURNING id`, [m])).rows[0].id;
  assert.equal((await get(op2, `/api/chat/file/${f2}`)).body, 'со старого диска');
});

test('Перенос: резюме из базы уходят в хранилище, строки обновляются, повторный запуск ничего не делает', async () => {
  noS3();
  const { migrateResumes } = await import('../src/storage-migrate.js');
  await assert.rejects(migrateResumes(), /не настроено/);
  useS3(); bucket.clear();
  const hr = await login('hr');
  const a = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Дилшод', last_name: 'Переносов', position: 'Оператор' })).json().applicant;
  const ids: number[] = [];
  for (let i = 0; i < 3; i++) ids.push((await pool.query(`INSERT INTO hire_resumes(applicant_id,filename,mime,size,data,created_by) VALUES($1,$2,'application/pdf',$3,$4,(SELECT id FROM users WHERE login='hr')) RETURNING id`, [a.id, `r${i}.pdf`, PDF.length, PDF])).rows[0].id);
  const n = await migrateResumes();
  assert.ok(n >= 3);
  const rows = (await pool.query(`SELECT id, data, storage_key FROM hire_resumes WHERE id = ANY($1::int[])`, [ids])).rows;
  assert.ok(rows.every((r) => r.data === null && /^resume\//.test(r.storage_key) && bucket.has(r.storage_key)), 'файлы в хранилище, в базе освободилось место');
  assert.equal(await migrateResumes(), 0, 'повторно переносить нечего');
  assert.ok((await get(hr, `/api/hire/resumes/${ids[0]}/file`)).rawPayload.equals(PDF), 'после переноса скачивается');
  // ограничение таблицы: строка без файла и без ключа невозможна
  await assert.rejects(pool.query(`INSERT INTO hire_resumes(applicant_id,filename,mime,size,created_by) VALUES($1,'x','application/pdf',1,(SELECT id FROM users WHERE login='hr'))`, [a.id]), /hire_resumes_has_body/);
});

test('Селфи при приходе используют то же хранилище (ключ в базе, файл в хранилище, удаление по сроку)', () => {
  const src = fs.readFileSync(new URL('../src/modules/attendance.ts', import.meta.url), 'utf8');
  assert.match(src, /putFile\(rel, Buffer\.from\(m\[1\], 'base64'\), 'image\/jpeg'\)/); assert.match(src, /getFile\(m\.photo_path\)/); assert.match(src, /deleteFile\(m\.photo_path\)/);
  assert.doesNotMatch(src, /fs\.(writeFile|readFile|rm)/, 'прямой работы с диском не осталось');
  noS3();
});
