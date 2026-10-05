import { api } from '../lib/api';

// Общие данные раздела: «Мой план» (прогресс, флаги ИИ и прав). Подстраницы обновляют его после действий.
export const T = $state({ me: null as any, status: 'idle' as 'idle' | 'loading' | 'ready' | 'error' });

export async function loadMe(force = false) {
  if (T.status === 'loading' || (T.status === 'ready' && !force)) return;
  if (T.status !== 'ready') T.status = 'loading';
  try { T.me = await api.get('/api/training/me'); T.status = 'ready'; }
  catch { T.status = T.me ? 'ready' : 'error'; }
}
