// Защита входа от подбора пароля.
// 1) По IP: не больше IP_MAX неудачных попыток за IP_WINDOW_MS. Считаются только ошибки, успешные входы не мешают (в офисе за одним IP работает много людей).
// 2) По учётной записи: после COOLDOWN_FROM-й ошибки подряд вход ставится на паузу, и пауза растёт (30 с, 1, 2, 4, 8 мин, не дольше lockMinutes).
//    Так посторонний, знающий табельный номер, не может заблокировать коллегу на 15 минут пятью попытками. Правильный пароль в паузу тоже не принимается,
//    иначе пауза не мешала бы подбору. Схема БД не меняется: используем users.failed_attempts и users.locked_until.
//    locked_until при каждой ошибке хранит конец паузы; если пауза давно закончилась (прошло больше lockMinutes), счётчик ошибок считается нулевым.
import { config } from './config.js';

export const IP_MAX = Number(process.env.LOGIN_IP_MAX) || 20;
export const IP_WINDOW_MS = 10 * 60e3;
export const COOLDOWN_FROM = 5;

const hits = new Map<string, number[]>();
const fresh = (list: number[] | undefined, now: number) => (list ?? []).filter((t) => now - t < IP_WINDOW_MS);

/** Сколько секунд этому IP ждать, если он исчерпал лимит неудачных попыток; 0 — можно пробовать. */
export function ipWait(ip: string, now = Date.now()): number {
  const list = fresh(hits.get(ip), now);
  if (list.length < IP_MAX) return 0;
  return Math.max(1, Math.ceil((list[list.length - IP_MAX] + IP_WINDOW_MS - now) / 1000));
}
/** Записывает неудачную попытку и возвращает, сколько их уже за окно. */
export function ipFail(ip: string, now = Date.now()): number {
  const list = fresh(hits.get(ip), now);
  list.push(now);
  hits.set(ip, list);
  const n = list.length;
  if (hits.size > 5000) for (const [k, v] of hits) if (!fresh(v, now).length) hits.delete(k);     // память не должна расти бесконечно
  return n;
}
export const ipReset = () => hits.clear();

/** Длина паузы (секунды) после n-й ошибки подряд. */
export function cooldownSec(n: number): number {
  if (n < COOLDOWN_FROM) return 0;
  return Math.min(30 * 2 ** (n - COOLDOWN_FROM), config.lockMinutes * 60);
}
/** Ошибок подряд к этому моменту: если с конца прошлой паузы прошло больше lockMinutes, начинаем с нуля. */
export function streak(failed: number, lockedUntil: Date | string | null, now = Date.now()): number {
  if (!lockedUntil) return failed;
  return now - new Date(lockedUntil).getTime() > config.lockMinutes * 60e3 ? 0 : failed;
}
