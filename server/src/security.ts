import crypto from 'node:crypto';

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const good = Buffer.from(hashHex, 'hex');
  return h.length === good.length && crypto.timingSafeEqual(h, good);
}

/** Хэш считается scrypt-ом; синхронная версия блокирует весь сервер на 50–100 мс, поэтому в запросах используем асинхронную. */
const scryptAsync = (pw: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => crypto.scrypt(pw, salt, 64, (e, key) => (e ? reject(e) : resolve(key))));

export async function hashPasswordAsync(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scryptAsync(pw, salt)).toString('hex')}`;
}

export async function verifyPasswordAsync(pw: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = (stored ?? '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const h = await scryptAsync(pw, Buffer.from(saltHex, 'hex'));
  const good = Buffer.from(hashHex, 'hex');
  return h.length === good.length && crypto.timingSafeEqual(h, good);
}

export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (n = 32) => crypto.randomBytes(n).toString('base64url');

export function randomPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
}
