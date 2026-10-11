// Заголовки безопасности: запрет встраивания в чужие страницы (clickjacking), политика загрузки ресурсов (CSP) и HSTS.

/** Интерфейс портала: свои скрипты и API; шрифты Google Fonts; видео YouTube/Vimeo во встроенных окнах; картинки и видео материалов могут быть с любого https-сайта. */
export const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",     // inline нужен для style="..." в разметке компонентов
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/** Страница помощника оператора (/assist) собрана одним файлом со своими встроенными скриптами и стилями. */
export const ASSIST_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(url: string, isProd: boolean): Record<string, string> {
  const p = url.split('?')[0];
  const h: Record<string, string> = { 'x-frame-options': 'DENY' };
  if (!p.startsWith('/api/')) h['content-security-policy'] = p === '/assist' ? ASSIST_CSP : APP_CSP;
  // HSTS: браузер запомнит, что сайт только по https. Без includeSubDomains и preload, чтобы не затронуть чужие поддомены.
  if (isProd) h['strict-transport-security'] = 'max-age=31536000';
  return h;
}
