// Обработчики очереди фоновых задач (см. jobs.ts).
import { onJob } from './jobs.js';
import { indexArticle, ingestSource, lintKb, reindexStale } from './kb-rag.js';
import { q } from './db.js';
import { decide, decideAvailable } from './ai-decide.js';

export function registerJobHandlers() {
  onJob('kb_ingest', (p) => ingestSource(Number(p.id), p.user_id ? Number(p.user_id) : null));
  onJob('kb_reindex', (p) => (p.article_id ? indexArticle(Number(p.article_id)) : reindexStale(500)));
  onJob('kb_lint', () => lintKb());
  // вопрос в очереди: к какому разделу базы знаний он относится и срочный ли (Jev)
  onJob('route_question', async (p) => {
    if (!(await decideAvailable('route'))) return;
    const qn = (await q('SELECT body FROM open_questions WHERE id=$1', [Number(p.id)])).rows[0];
    if (!qn) return;
    const secs = (await q('SELECT id, slug, title_ru FROM kb_sections ORDER BY sort,id')).rows;
    if (!secs.length) return;
    const d = await decide('route', qn.body, {
      section: { type: 'choice', instructions: 'К какому разделу базы знаний относится вопрос?', criteria: Object.fromEntries(secs.map((s) => [s.slug, s.title_ru])) },
      urgent: { type: 'noul', instructions: 'Вопрос срочный: мешает работать с клиентом прямо сейчас или касается денег и графика на ближайшие дни?' },
    });
    if (!d) return;
    const sec = d.section && d.section.confidence >= 0.5 ? secs.find((s) => s.slug === d.section.choice)?.id ?? null : null;
    await q('UPDATE open_questions SET section_id=COALESCE($2,section_id), urgent=$3 WHERE id=$1', [Number(p.id), sec, !!(d.urgent?.yes && d.urgent.confidence >= 0.6)]);
  });
}
