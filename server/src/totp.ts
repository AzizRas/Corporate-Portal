// TOTP (RFC 6238) на нативном crypto: секрет, коды, шифрование секрета в базе, резервные коды.
import crypto from 'node:crypto';
import { config } from './config.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const b32encode = (buf: Buffer): string => {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};
export const b32decode = (s: string): Buffer => {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
};

export const newSecret = () => b32encode(crypto.randomBytes(20));
export const STEP = 30;

/** Код для шага времени: HOTP по RFC 4226 с динамическим усечением. */
export function hotp(secret: string, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}
export const totpAt = (secret: string, ms = Date.now()) => hotp(secret, Math.floor(ms / 1000 / STEP));

/** Проверяет код с допуском ±1 шаг (часы телефона). Возвращает шаг, на котором совпало, и только если он новее lastStep (повтор того же кода не проходит). */
export function verifyTotp(secret: string, code: string, lastStep = 0, ms = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(ms / 1000 / STEP);
  for (const d of [0, -1, 1]) {
    const step = now + d;
    const a = Buffer.from(hotp(secret, step)), b = Buffer.from(code);
    if (step > lastStep && crypto.timingSafeEqual(a, b)) return step;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer = 'Qadam') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

/* ---- хранение секрета: зашифрован, чтобы дамп базы без ключа не раскрывал второй фактор ---- */
const key = () => crypto.createHash('sha256').update(process.env.TOTP_KEY || process.env.SESSION_SECRET || `qadam-totp:${config.databaseUrl}`).digest();
export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function openSecret(sealed: string): string | null {
  try {
    const [iv, tag, enc] = sealed.split('.').map((x) => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return null; }
}

/* ---- резервные коды: на случай потери телефона; хранятся хэшами, каждый работает один раз ---- */
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export function newRecoveryCodes(n = 8): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: n }, () => crypto.randomBytes(5).toString('hex'));
  return { plain, hashed: plain.map(sha) };
}
export const isRecoveryCode = (s: string) => /^[0-9a-f]{10}$/.test(s.trim().toLowerCase());
/** Если код есть среди сохранённых — возвращает список без него, иначе null. */
export function useRecovery(hashed: string[], code: string): string[] | null {
  const h = sha(code.trim().toLowerCase());
  return hashed.includes(h) ? hashed.filter((x) => x !== h) : null;
}

/** Для каких ролей второй фактор обязателен. */
export const TOTP_REQUIRED_ROLES = ['admin', 'accountant'] as const;
export const totpRequired = (roles: string[]) => TOTP_REQUIRED_ROLES.some((r) => roles.includes(r));
/** Жёсткое требование на сервере: включается только переменной TOTP_ENFORCE=1. По умолчанию выключено: 2FA можно включить сотруднику в профиле добровольно. */
let enforceSetting = false, enforceAt = 0;
/** Настройка из админки; вызывается из хука авторизации, обновляется не чаще раза в 30 с. */
export async function refreshTotpSetting(force = false) {
  if (!force && Date.now() - enforceAt < 30_000) return;
  enforceAt = Date.now();
  const { getSetting } = await import('./settings.js');
  enforceSetting = !!(await getSetting<boolean>('totp_enforce', false));
}
export const setTotpEnforceCache = (v: boolean) => { enforceSetting = v; enforceAt = Date.now(); };
export const totpEnforced = () => (process.env.TOTP_ENFORCE === '0' ? false : process.env.TOTP_ENFORCE === '1' || enforceSetting);
