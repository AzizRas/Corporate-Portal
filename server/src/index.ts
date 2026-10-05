import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { pool } from './db.js';
import { ensureBase } from './seed.js';
import { cleanupPhotos } from './modules/attendance.js';

async function main() {
  await migrate();
  await ensureBase();
  const app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[portal] http://localhost:${config.port}`);

  // ежедневная очистка просроченных селфи (при старте и раз в час проверяем)
  const clean = () => cleanupPhotos().then((n) => n && console.log(`[portal] удалено фото: ${n}`)).catch((e) => console.error('[cleanup]', e));
  setTimeout(clean, 10_000);
  setInterval(clean, 3600_000).unref();

  const stop = async () => { await app.close(); await pool.end(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
main().catch((e) => { console.error('[portal] ошибка запуска:', e); process.exit(1); });
