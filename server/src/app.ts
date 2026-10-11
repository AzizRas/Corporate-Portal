import { hireOnboardRoutes } from './modules/hire-onboard.js';
import { teamRoutes } from './modules/team.js';
import { storageKind } from './storage.js';
import { hrRequestRoutes } from './modules/hr-requests.js';
import { pushRoutes } from './push.js';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import compress from '@fastify/compress';
import fstatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { securityHeaders } from './security-headers.js';
import { q } from './db.js';
import { registerAuth } from './auth.js';
import { authRoutes } from './modules/auth.js';
import { usersRoutes } from './modules/users.js';
import { payrollRoutes } from './modules/payroll.js';
import { attendanceRoutes } from './modules/attendance.js';
import { kbRoutes } from './modules/kb.js';
import { assistRoutes } from './modules/assist.js';
import { pathRoutes } from './modules/path.js';
import { settingsRoutes } from './modules/settings.js';
import { growthRoutes } from './modules/growth.js';
import { communityRoutes } from './modules/community.js';
import { socialRoutes } from './modules/social.js';
import { searchRoutes } from './modules/search.js';
import { orgRoutes } from './modules/org.js';
import { chatRoutes } from './modules/chat.js';
import { aiAdminRoutes } from './modules/ai-admin.js';
import { aiEditorRoutes } from './modules/ai-editor.js';
import { taskRoutes } from './modules/tasks.js';
import { aiAnalystRoutes } from './modules/ai-analyst.js';
import { aiSupervisorRoutes } from './modules/ai-supervisor.js';
import { onboardingRoutes } from './modules/onboarding.js';
import { questionRoutes } from './modules/questions.js';
import { scheduleRoutes } from './modules/schedule.js';
import { trainingRoutes } from './modules/training.js';
import { testsRoutes } from './modules/tests.js';
import { libraryRoutes } from './modules/library.js';
import { wellnessRoutes } from './modules/wellness.js';
import { hireRoutes } from './modules/hire.js';
import { accessAdminRoutes } from './modules/access-admin.js';
import { usageRoutes } from './modules/usage.js';

// index.html ссылается на файлы с хэшем в имени: после выкладки он должен подтягиваться заново, иначе вместо новых файлов будут ссылки на удалённые (белый экран).
// Файлы в /assets/ неизменны (хэш меняется вместе с содержимым), их можно держать в кэше год.
export const INDEX_CACHE = 'no-cache';
export const ASSET_CACHE = 'public, max-age=31536000, immutable';
export function staticCache(file: string): string {
  const rel = path.relative(config.webDir, file).split(path.sep);
  if (rel[0] === 'assets') return ASSET_CACHE;
  if (/\.html?$/i.test(file) || path.basename(file) === 'sw.js') return INDEX_CACHE;     // service worker обязан обновляться сразу
  return 'public, max-age=3600';       // иконка, manifest: имена без хэша, час не страшен
}

export async function buildApp() {
  const app = Fastify({ logger: config.isProd ? { level: 'info' } : false, trustProxy: process.env.TRUST_PROXY ? (process.env.TRUST_PROXY === 'true' ? true : process.env.TRUST_PROXY.split(',').map((x) => x.trim())) : (!config.isProd || !!process.env.RAILWAY_ENVIRONMENT), genReqId: () => Math.random().toString(36).slice(2, 10) });

  await app.register(cookie);
  await app.register(compress);
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    for (const [k, v] of Object.entries(securityHeaders(req.url, config.isProd))) reply.header(k, v);
    if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });

  registerAuth(app);

  app.get('/healthz', async (_req, reply) => {
    // ok оставлен для прежних проверок, остальное — для мониторинга (Railway, UptimeRobot)
    try { await q('SELECT 1'); return { ok: true, status: 'ok', db: 'connected', storage: storageKind(), uptime: Math.round(process.uptime()), time: new Date().toISOString() }; }
    catch { return reply.code(503).send({ ok: false, status: 'unhealthy', db: 'down', time: new Date().toISOString() }); }
  });

  await app.register(pushRoutes);
  await app.register(teamRoutes);
  await app.register(hireOnboardRoutes);
  await app.register(hrRequestRoutes);
  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(payrollRoutes);
  await app.register(attendanceRoutes);
  await app.register(kbRoutes);
  await app.register(assistRoutes);
  await app.register(pathRoutes);
  await app.register(settingsRoutes);
  await app.register(growthRoutes);
  await app.register(communityRoutes);
  await app.register(socialRoutes);
  await app.register(searchRoutes);
  await app.register(orgRoutes);
  await app.register(chatRoutes);
  await app.register(aiAdminRoutes);
  await app.register(aiEditorRoutes);
  await app.register(taskRoutes);
  await app.register(aiAnalystRoutes);
  await app.register(aiSupervisorRoutes);
  await app.register(onboardingRoutes);
  await app.register(questionRoutes);
  await app.register(scheduleRoutes);
  await app.register(trainingRoutes);
  await app.register(testsRoutes);
  await app.register(libraryRoutes);
  await app.register(wellnessRoutes);
  await app.register(hireRoutes);
  await app.register(accessAdminRoutes);
  await app.register(usageRoutes);

  app.setErrorHandler((err: any, req, reply) => {
    req.log.error(err);
    if (process.env.DEBUG_ERRORS) console.error('[error]', err.message);
    if (err.validation || err.statusCode === 400) return reply.code(400).send({ error: 'invalid' });
    reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({ error: err.statusCode && err.statusCode < 500 ? err.code || 'error' : 'server' });
  });

  // собранный интерфейс (если есть) + SPA-фолбэк
  if (fs.existsSync(path.join(config.webDir, 'index.html'))) {
    const indexHtml = fs.readFileSync(path.join(config.webDir, 'index.html'));      // читаем один раз при старте, а не на каждый переход по ссылке
    await app.register(fstatic, { root: config.webDir, cacheControl: false, setHeaders: (res, file) => res.setHeader('cache-control', staticCache(file)) });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
      // старый хэшированный файл после выкладки: честный 404, а не страница вместо скрипта
      if (req.url.startsWith('/assets/')) return reply.code(404).header('cache-control', 'no-store').type('text/plain').send('not found');
      // переход по ссылке на любой адрес SPA: это тоже index.html, поэтому кэшировать его нельзя
      return reply.type('text/html').header('cache-control', INDEX_CACHE).send(indexHtml);
    });
  }
  return app;
}
