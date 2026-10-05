// Разбор ссылки на видео: YouTube (watch, youtu.be, shorts, embed, live) и Vimeo — встроенный плеер,
// прямые mp4/webm/ogg — тег <video>, всё остальное — просто кнопка-ссылка.
export type Embed =
  | { kind: 'youtube' | 'vimeo' | 'iframe'; src: string }
  | { kind: 'file'; src: string; mime: string }
  | { kind: 'link'; src: string };

const YT_HOSTS = /^(www\.|m\.|music\.)?youtube(-nocookie)?\.com$/;
const ID = /^[A-Za-z0-9_-]{6,20}$/;
const FILES: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', ogv: 'video/ogg', mov: 'video/mp4' };

/** Секунды из t=90, t=1m30s, start=90. */
function seconds(v: string | null): number {
  if (!v) return 0;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
}

export function parseVideo(raw: string): Embed | null {
  const s = (raw || '').trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  let yt: string | null = null;
  if (host === 'youtu.be') yt = parts[0] ?? null;
  else if (YT_HOSTS.test(host)) {
    if (parts[0] === 'watch') yt = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) yt = parts[1] ?? null;
  }
  if (yt && ID.test(yt)) {
    const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'));
    return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt}?rel=0${start ? `&start=${start}` : ''}` };
  }

  if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find((p) => /^\d{5,}$/.test(p));
    if (id) {
      const hash = u.searchParams.get('h') ?? (parts.length > 1 && /^[0-9a-f]{8,}$/i.test(parts[parts.length - 1]) && parts[parts.length - 1] !== id ? parts[parts.length - 1] : null);
      return { kind: 'vimeo', src: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}` };
    }
  }

  const ext = (parts[parts.length - 1] ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (FILES[ext]) return { kind: 'file', src: u.href, mime: FILES[ext] };
  return { kind: 'link', src: u.href };
}
