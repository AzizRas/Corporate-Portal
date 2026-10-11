// Web Push на клиенте: регистрация service worker и подписка устройства на уведомления.
import { api } from './api';

export const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function registerSW() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

const b64 = (s: string) => {
  const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** 'off' — не поддерживается или сервер без ключей, 'denied' — запрещено в браузере, 'on'/'idle' — подписано/не подписано. */
export async function pushState(): Promise<'off' | 'denied' | 'on' | 'idle'> {
  if (!pushSupported()) return 'off';
  const k = await api.get('/api/push/key').catch(() => null);
  if (!k?.enabled || !k.key) return 'off';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'idle';
}

export async function enablePush(): Promise<'on' | 'denied' | 'off'> {
  if (!pushSupported()) return 'off';
  const k = await api.get('/api/push/key');
  if (!k?.enabled || !k.key) return 'off';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(k.key) }));
  await api.post('/api/push/subscribe', sub.toJSON());
  return 'on';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
