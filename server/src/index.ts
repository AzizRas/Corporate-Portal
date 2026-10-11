import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { pool } from './db.js';
import { ensureBase } from './seed.js';
import { seedHireTemplates } from './hire-templates.js';
import { cleanupPhotos } from './modules/attendance.js';
import { applyDueTransfers } from './org-core.js';
import { hireDigest } from './modules/hire.js';
import { recordUsageSnapshot, refreshWeeklyAi } from './modules/usage.js';

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

  // ежедневная очистка просроченных селфи (при старте и раз в час проверяем)
  const clean = () => cleanupPhotos().then((n) => n && console.log(`[portal] удалено фото: ${n}`)).catch((e) => console.error('[cleanup]', e));
  setTimeout(clean, 10_000);
  // переводы с датой вступают в силу в свой день
  const transfers = () => applyDueTransfers().then((n) => n && console.log(`[portal] применено переводов: ${n}`)).catch((e) => console.error('[transfers]', e));
  setTimeout(transfers, 15_000);
  setInterval(transfers, 3600_000).unref();
  setInterval(clean, 3600_000).unref();

  // сводка по просроченным этапам найма: раз в сутки (повторный запуск в тот же день ничего не делает)
  const digest = () => hireDigest().then((n) => n && console.log(`[portal] найм: просрочено карточек ${n}`)).catch((e) => console.error('[hire]', e));
  setTimeout(digest, 20_000);
  setInterval(digest, 3600_000).unref();

  // использование разделов: раз в неделю снимок для тренда и короткий вывод ИИ для админа (проверяем раз в час, повторы ничего не делают)
  const usage = () => recordUsageSnapshot().then(() => refreshWeeklyAi()).catch((e) => console.error('[usage]', e));
  setTimeout(usage, 30_000);
  setInterval(usage, 3600_000).unref();

  const stop = async () => { await app.close(); await pool.end(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
main().catch((e) => { console.error('[portal] ошибка запуска:', e); process.exit(1); });
