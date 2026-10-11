import { q } from './db.js';
import { tzDate } from './settings.js';
import { pushTo } from './push.js';

/** Уведомление одному или нескольким сотрудникам (колокольчик + браузерное уведомление на клиенте). */
export async function notify(userIds: number[], kind: string, title: string, body = '', link: string | null = null) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  // сотрудник мог отключить объявления или упоминания в настройках уведомлений
  await q(
    `INSERT INTO notifications(user_id,kind,title,body,link) SELECT x,$2,$3,$4,$5 FROM unnest($1::int[]) AS x
      WHERE NOT EXISTS (SELECT 1 FROM notify_prefs p WHERE p.user_id=x AND ((NOT p.news AND $2='news') OR (NOT p.mentions AND $2 IN ('mention','reply'))))`,
    [ids, kind, title.slice(0, 200), body.slice(0, 400), link],
  );
  void pushTo(ids, { title, body, url: link ?? '/#/' }, { kind });   // и на телефон, если подписан; ошибки push не мешают
}

/** SQL-выражение «сегодня день рождения» для пользователя с алиасом a (по Ташкенту). */
export const bdaySql = (a = 'u') => `(${a}.birthday IS NOT NULL AND to_char(${a}.birthday,'MM-DD') = '${tzDate().slice(5)}')`;
