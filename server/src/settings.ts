import { q } from './db.js';

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await q('SELECT value FROM settings WHERE key=$1', [key]);
  return r.rows[0] ? (r.rows[0].value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await q(
    `INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()`,
    [key, JSON.stringify(value)],
  );
}

/** Месяц YYYY-MM и дата по Ташкенту. */
export const tzDate = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(d);
export const tzMonth = (d = new Date()) => tzDate(d).slice(0, 7);
export const tzMinutes = (d = new Date()) => {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).split(':');
  return Number(p[0]) * 60 + Number(p[1]);
};
