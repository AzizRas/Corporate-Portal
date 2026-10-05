// Минимальный и безопасный markdown: заголовки, списки, цитаты, жирный/курсив, код, ссылки, картинки.
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const safeUrl = (u: string) => (/^(https?:|\/|#|mailto:|tel:)/i.test(u) ? u : '#');

function inline(s: string) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, a, u) => `<img alt="${a}" src="${safeUrl(u.replace(/&amp;/g, '&'))}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${safeUrl(u.replace(/&amp;/g, '&'))}" target="_blank" rel="noopener">${t}</a>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
}

export function md(src: string): string {
  const lines = (src || '').replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null, para: string[] = [];
  const flushP = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    let m;
    if (!line.trim()) { flushP(); closeList(); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flushP(); closeList(); const n = Math.min(m[1].length + 1, 3); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if ((m = /^>\s?(.*)$/.exec(line))) { flushP(); closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if ((m = /^\s*(?:[-*]\s+(?:\[[ x]\]\s+)?)(.*)$/.exec(line))) {
      flushP(); if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      const done = /\[x\]/i.test(line) ? '☑ ' : /\[ \]/.test(line) ? '☐ ' : '';
      out.push(`<li>${done}${inline(m[1])}</li>`); continue;
    }
    if ((m = /^\s*\d+\.\s+(.*)$/.exec(line))) { flushP(); if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    closeList(); para.push(line);
  }
  flushP(); closeList();
  return out.join('\n');
}
