// Разбор ссылки на материал: видео YouTube/Vimeo встраиваем, mp4/webm показываем в <video>, остальное — обычная ссылка.
export type Embed =
  | { type: 'iframe'; provider: 'youtube' | 'vimeo'; src: string }
  | { type: 'video'; src: string }
  | { type: 'link'; href: string; host: string }
  | { type: 'none' };

const YT_HOST = /^(?:www\.|m\.|music\.)?youtube(?:-nocookie)?\.com$/;
const ID = /^[\w-]{11}$/;

/** «90», «1m30s», «1h2m3s» → секунды. */
function seconds(v: string | null): number {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

export function parseEmbed(raw: string): Embed {
  const s = (raw ?? '').trim();
  if (!s) return { type: 'none' };
  let u: URL;
  try { u = new URL(s); } catch { return { type: 'none' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { type: 'none' };
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  let yt: string | undefined;
  if (host === 'youtu.be') yt = parts[0];
  else if (YT_HOST.test(host)) {
    if (parts[0] === 'watch') yt = u.searchParams.get('v') ?? undefined;
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) yt = parts[1];
  }
  if (yt && ID.test(yt)) {
    const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'));
    return { type: 'iframe', provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0${start ? `&start=${start}` : ''}` };
  }

  if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
    const i = parts.findIndex((p) => /^\d{5,}$/.test(p));
    if (i >= 0) {
      const hash = /^[0-9a-f]{6,}$/i.test(parts[i + 1] ?? '') ? parts[i + 1] : u.searchParams.get('h');
      return { type: 'iframe', provider: 'vimeo', src: `https://player.vimeo.com/video/${parts[i]}?dnt=1${hash ? `&h=${hash}` : ''}` };
    }
  }

  if (/\.(mp4|webm|ogg|m4v)$/i.test(u.pathname)) return { type: 'video', src: u.href };
  return { type: 'link', href: u.href, host: host.replace(/^www\./, '') };
}
