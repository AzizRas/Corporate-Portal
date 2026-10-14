// Опрос уведомлений: непрочитанные сообщения чата, новости, упоминания, решения по выходным. Браузерные уведомления — если разрешены.
import { api } from './api';
import { app } from './state.svelte';
import { st } from './s18n';

export const notif = $state({ prefs: null as null | { quiet_from: string | null; quiet_to: string | null }, chat: {} as Record<string, { n: number; mentions: number; muted?: boolean }>, chat_total: 0, inbox_todo: 0, items: [] as any[], unread: 0, toasts: [] as { id: number; title: string; body: string; link: string | null }[] });
let seen = 0, started = false, timer: ReturnType<typeof setInterval> | undefined, baseTitle = document.title;

// тихие часы: без всплывающих и браузерных уведомлений (счётчики остаются)
function quietNow() {
  const p = notif.prefs; if (!p?.quiet_from || !p.quiet_to) return false;
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [f, to] = [p.quiet_from, p.quiet_to];
  return f <= to ? t >= f && t < to : t >= f || t < to;
}
const canPush = () => 'Notification' in window && Notification.permission === 'granted';
export async function enableBrowserNotifications() {
  if (!('Notification' in window)) return false;
  return (await Notification.requestPermission()) === 'granted';
}

async function tick() {
  if (!app.user) return;
  try {
    const r = await api.get('/api/notify');
    const fresh = r.items.filter((i: any) => !i.read && i.id > seen);
    const firstRun = seen === 0 && !started;
    if (r.items.length) seen = Math.max(seen, ...r.items.map((i: any) => i.id));
    const prevChat = notif.chat_total;
    notif.chat = r.chat; notif.chat_total = r.chat_total; notif.inbox_todo = r.inbox_todo ?? 0; notif.items = r.items; notif.unread = r.unread; notif.prefs = r.prefs;
    if (!firstRun && !quietNow()) {
      for (const i of fresh.slice(0, 3)) {
        notif.toasts.push({ id: i.id, title: i.title, body: i.body, link: i.link });
        setTimeout(() => { notif.toasts = notif.toasts.filter((x) => x.id !== i.id); }, 7000);
        if (document.hidden && canPush()) try { new Notification(i.title, { body: i.body }); } catch { /* */ }
      }
      if (r.chat_total > prevChat && document.hidden && canPush()) try { new Notification(st('nt_new_msgs'), { body: `+${r.chat_total - prevChat}` }); } catch { /* */ }
    }
    started = true;
    const n = r.chat_total + r.unread;
    document.title = n ? `(${n}) ${baseTitle}` : baseTitle;
  } catch { /* временно нет связи */ }
}
export function startNotify() {
  if (timer) return;
  tick();
  timer = setInterval(() => { if (!document.hidden) tick(); }, 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}
export const refreshNotify = tick;
export async function markRead(ids?: number[]) {
  await api.post('/api/notify/read', ids ? { ids } : { all: true });
  await tick();
}
