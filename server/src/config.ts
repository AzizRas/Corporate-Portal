import path from 'node:path';

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3000),
  databaseUrl:
    process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgres://portal:portal@localhost:5432/portal',
  isProd: process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT,
  sessionDays: 30,
  uploadDir: process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads'),
  webDir: process.env.WEB_DIR || path.resolve(process.cwd(), '../web/dist'),
  assistSource: process.env.ASSIST_TEMPLATE || path.resolve(process.cwd(), '../assist/template.html'),
  adminLogin: (process.env.ADMIN_LOGIN || 'admin').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  tz: 'Asia/Tashkent',
  maxFailedLogins: 10,
  lockMinutes: 15,
};
