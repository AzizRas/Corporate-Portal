import { startChatListener } from './modules/chat.js';
import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { pool } from './db.js';
import { ensureBase } from './seed.js';
import { seedHireTemplates } from './hire-templates.js';
import { cleanupPhotos } from './modules/attendance.js';
import { applyDueTransfers, syncAllManagers } from './org-core.js';
import { hireDigest } from './modules/hire.js';
import { probationReminders } from './modules/hire-onboard.js';
import { recordUsageSnapshot, refreshWeeklyAi } from './modules/usage.js';
import { every, startWorker, stopJobs } from './jobs.js';
import { registerJobHandlers } from './job-handlers.js';
import { lintKb, reindexStale } from './kb-rag.js';
import { getSetting } from './settings.js';

async function main() {
  if (config.isProd && !(process.env.DATABASE_URL || process.env.POSTGRES_URL)) {
    console.error('[portal] Не задана DATABASE_URL.\nRailway: сервис портала → Variables → New Variable → Add Reference → Postgres → DATABASE_URL.\nЕсли PostgreSQL ещё нет: + New → Database → Add PostgreSQL.');
    process.exit(1);
  }
  await migrate();
  await ensureBase();
  await seedHireTemplates().then((n) => n && console.log(`[portal] добавлено шаблонов найма: ${n}`)).catch((e) => console.error('[hire-templates]', e));
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[portal] http://localhost:${config.port}`);

  // фоновые задачи (ТЗ №3, I3): периодические — под advisory-lock (при нескольких экземплярах работает один), очередь jobs — FOR UPDATE SKIP LOCKED
  registerJobHandlers();
  await startChatListener().catch((e) => console.error('[chat-listen]', e));
  startWorker();
  const log = (what: string) => (n: unknown) => { if (n) console.log(`[portal] ${what}: ${n}`); };
  every('cleanup', 3600_000, () => cleanupPhotos().then(log('удалено фото')), 10_000);
  // переводы с датой вступают в силу в свой день; руководитель пересчитывается по структуре
  every('transfers', 3600_000, () => applyDueTransfers().then(log('применено переводов')).then(() => syncAllManagers()).then(log('руководитель пересчитан по структуре')), 15_000);
  // просроченные этапы найма (раз в сутки — повтор ничего не делает) и напоминания об испытательном сроке
  every('hire', 3600_000, () => hireDigest().then(log('найм: просрочено карточек')).then(() => probationReminders()).then(log('напоминаний об испытательном сроке')), 20_000);
  // использование разделов: раз в неделю снимок и короткий вывод ИИ
  every('usage', 3600_000, () => recordUsageSnapshot().then(() => refreshWeeklyAi()), 30_000);
  // база знаний: переиндексация изменённых статей и еженедельная проверка вики
  every('kb_reindex', 120_000, () => reindexStale().then(log('переиндексировано статей')), 25_000);
  every('kb_lint', 3600_000, async () => {
    const last = (await getSetting<any>('kb_lint', null))?.at;
    if (!last || Date.now() - Date.parse(last) > 7 * 86_400_000) await lintKb();
  }, 60_000);

  const stop = async () => { stopJobs(); await app.close(); await pool.end(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
main().catch((e) => { console.error('[portal] ошибка запуска:', e); process.exit(1); });
