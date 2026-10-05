import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import compress from '@fastify/compress';
import fstatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
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

export async function buildApp() {
  const app = Fastify({ logger: config.isProd ? { level: 'info' } : false, trustProxy: true, genReqId: () => Math.random().toString(36).slice(2, 10) });

  await app.register(cookie);
  await app.register(compress);
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });

  registerAuth(app);

  app.get('/healthz', async (_req, reply) => {
    try { await q('SELECT 1'); return { ok: true }; } catch { return reply.code(503).send({ ok: false }); }
  });

  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(payrollRoutes);
  await app.register(attendanceRoutes);
  await app.register(kbRoutes);
  await app.register(assistRoutes);
  await app.register(pathRoutes);
  await app.register(settingsRoutes);

  app.setErrorHandler((err: any, req, reply) => {
    req.log.error(err);
    if (process.env.DEBUG_ERRORS) console.error('[error]', err.message);
    if (err.validation || err.statusCode === 400) return reply.code(400).send({ error: 'invalid' });
    reply.code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500).send({ error: err.statusCode && err.statusCode < 500 ? err.code || 'error' : 'server' });
  });

  // собранный интерфейс (если есть) + SPA-фолбэк
  if (fs.existsSync(path.join(config.webDir, 'index.html'))) {
    await app.register(fstatic, { root: config.webDir, maxAge: '1h' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
      return reply.type('text/html').send(fs.readFileSync(path.join(config.webDir, 'index.html')));
    });
  }
  return app;
}
