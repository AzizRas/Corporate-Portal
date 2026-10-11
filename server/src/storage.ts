// Хранилище файлов: резюме, вложения чата и селфи при приходе.
// По умолчанию — диск (UPLOAD_DIR), как раньше. Если заданы S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY и S3_SECRET_KEY, файлы уходят в S3-совместимое
// хранилище (AWS S3, Cloudflare R2, MinIO, Backblaze B2): диск на Railway не постоянный, а резюме в базе раздувают её копии.
// Подпись запросов — AWS Signature V4, без внешних библиотек. Старые файлы с диска продолжают читаться (запасной путь).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export interface S3Conf { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string }
export const s3Conf = (): S3Conf | null => {
  const e = process.env;
  if (!e.S3_ENDPOINT || !e.S3_BUCKET || !e.S3_ACCESS_KEY || !e.S3_SECRET_KEY) return null;
  return { endpoint: e.S3_ENDPOINT.replace(/\/+$/, ''), bucket: e.S3_BUCKET, accessKey: e.S3_ACCESS_KEY, secretKey: e.S3_SECRET_KEY, region: e.S3_REGION || 'auto' };
};
export const storageKind = (): 'disk' | 's3' => (s3Conf() ? 's3' : 'disk');

const sha256Hex = (d: crypto.BinaryLike) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (k: crypto.BinaryLike, d: string) => crypto.createHmac('sha256', k).update(d).digest();
const uriEncode = (s: string, keepSlash: boolean) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`).replace(/%2F/g, keepSlash ? '/' : '%2F');

export interface SignInput { method: string; host: string; path: string; query?: string; headers?: Record<string, string>; payloadHash: string; date: Date; region: string; service?: string; accessKey: string; secretKey: string }
/** AWS Signature V4: возвращает заголовки запроса, включая Authorization. path — уже закодированный путь. */
export function signV4(i: SignInput): Record<string, string> {
  const service = i.service ?? 's3';
  const amz = i.date.toISOString().replace(/[:-]|\.\d{3}/g, '');          // 20130524T000000Z
  const day = amz.slice(0, 8);
  const headers: Record<string, string> = { ...Object.fromEntries(Object.entries(i.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: i.host, 'x-amz-content-sha256': i.payloadHash, 'x-amz-date': amz };
  const names = Object.keys(headers).sort();
  const canonical = [i.method, i.path, i.query ?? '', ...names.map((n) => `${n}:${headers[n]}`), '', names.join(';'), i.payloadHash].join('\n');
  const scope = `${day}/${i.region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretKey}`, day), i.region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

async function s3(method: 'PUT' | 'GET' | 'DELETE', key: string, body?: Buffer, mime?: string): Promise<Response> {
  const c = s3Conf()!;
  const url = new URL(c.endpoint);
  const p = `/${uriEncode(c.bucket, false)}/${uriEncode(key, true)}`;
  const payloadHash = body ? sha256Hex(body) : sha256Hex('');
  const headers = signV4({ method, host: url.host, path: (url.pathname.replace(/\/$/, '') || '') + p, payloadHash, date: new Date(), region: c.region, accessKey: c.accessKey, secretKey: c.secretKey, headers: mime ? { 'content-type': mime } : {} });
  return fetch(`${url.origin}${(url.pathname.replace(/\/$/, '') || '')}${p}`, { method, headers, body: body as any, signal: AbortSignal.timeout(30_000) });
}

/** Ключ файла: только безопасные символы, без выхода из каталога. */
export const safeKey = (k: string) => k.split(/[\\/]+/).filter((x) => x && x !== '.' && x !== '..').join('/');

export async function putFile(key: string, buf: Buffer, mime = 'application/octet-stream'): Promise<void> {
  const k = safeKey(key);
  if (s3Conf()) {
    const r = await s3('PUT', k, buf, mime);
    if (!r.ok) throw new Error(`storage_put_${r.status}`);
    return;
  }
  const file = path.join(config.uploadDir, k);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
}
/** Читает файл; null — нет такого. В режиме S3 старые файлы с диска тоже находятся. */
export async function getFile(key: string): Promise<Buffer | null> {
  const k = safeKey(key);
  if (s3Conf()) {
    const r = await s3('GET', k);
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status !== 404) throw new Error(`storage_get_${r.status}`);
  }
  return fs.readFile(path.join(config.uploadDir, k)).catch(() => null);
}
export async function deleteFile(key: string): Promise<void> {
  const k = safeKey(key);
  if (s3Conf()) await s3('DELETE', k).catch(() => {});
  await fs.rm(path.join(config.uploadDir, k), { force: true }).catch(() => {});
}
