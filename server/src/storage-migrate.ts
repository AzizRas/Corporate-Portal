// Перенос файлов резюме из базы в S3-совместимое хранилище. Запуск: npm run storage:migrate -w server (нужны S3_* переменные).
// Безопасно повторять: переносятся только строки, где файл ещё лежит в базе. Размер базы вернётся после VACUUM FULL hire_resumes.
import crypto from 'node:crypto';
import { pool, q } from './db.js';
import { putFile, storageKind } from './storage.js';

export async function migrateResumes(limit = 1000): Promise<number> {
  if (storageKind() !== 's3') throw new Error('Хранилище S3 не настроено: задайте S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY');
  const rows = (await q('SELECT id,mime,data FROM hire_resumes WHERE data IS NOT NULL AND storage_key IS NULL ORDER BY id LIMIT $1', [limit])).rows;
  for (const r of rows) {
    const key = `resume/${crypto.randomUUID()}`;
    await putFile(key, r.data, r.mime);
    await q('UPDATE hire_resumes SET storage_key=$2, data=NULL WHERE id=$1 AND storage_key IS NULL', [r.id, key]);
  }
  return rows.length;
}

if (process.argv[1]?.endsWith('storage-migrate.ts') || process.argv[1]?.endsWith('storage-migrate.js')) {
  let total = 0;
  for (;;) { const n = await migrateResumes(); total += n; if (n < 1000) break; }
  console.log(`[storage] перенесено файлов резюме: ${total}`);
  await pool.end();
}
