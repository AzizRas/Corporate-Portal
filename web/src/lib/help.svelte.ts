// Список тем справки (id, название, куда вести, какую кнопку подсвечивать) — один запрос на сессию.
import { api } from './api';

export interface TopicMeta { id: string; group: string; title: { ru: string; uz: string }; route: string; target: string | null }
export const topics = $state({ list: [] as TopicMeta[], loaded: false });
let loading: Promise<void> | null = null;
export function loadTopics() {
  if (topics.loaded) return Promise.resolve();
  loading ??= api.get('/api/help/topics').then((r) => { topics.list = r.topics; topics.loaded = true; }).catch(() => { loading = null; });
  return loading;
}
