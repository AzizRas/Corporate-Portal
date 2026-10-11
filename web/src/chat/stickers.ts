// Встроенные стикеры: векторные, рисуются здесь, на сервере хранятся только коды (server/src/stickers.ts).
export const STICKERS = ['smile', 'laugh', 'love', 'cool', 'wink', 'cry', 'angry', 'wow', 'sleep', 'think', 'party', 'shy', 'heart', 'fire', 'thumb', 'star'] as const;
export const REACTIONS = ['👍', '❤️', '🔥', '😂', '👏', '🎉'] as const;

const dot = (x: number, y: number, r = 5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#4a2a10"/>`;
const arcEye = (x: number) => `<path d="M${x - 8} 46 Q${x} 35 ${x + 8} 46" fill="none" stroke="#4a2a10" stroke-width="4" stroke-linecap="round"/>`;
const smile = '<path d="M30 60 Q50 80 70 60" fill="none" stroke="#4a2a10" stroke-width="4.5" stroke-linecap="round"/>';
const heartPath = (cx: number, cy: number, s: number, fill: string) => `<path transform="translate(${cx - 12 * s} ${cy - 11 * s}) scale(${s})" d="M12 22S1 14.5 1 7.5A5.5 5.5 0 0 1 12 5a5.5 5.5 0 0 1 11 2.5C23 14.5 12 22 12 22z" fill="${fill}"/>`;
const brow = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#4a2a10" stroke-width="4.5" stroke-linecap="round"/>`;

const face = (inner: string, fill = 'url(#f)') => `<circle cx="50" cy="50" r="44" fill="${fill}" stroke="#d98a12" stroke-width="2.5"/><ellipse cx="38" cy="26" rx="14" ry="7" fill="#fff" opacity=".28"/>${inner}`;

const PARTS: Record<string, string> = {
  smile: face(dot(35, 42) + dot(65, 42) + smile),
  laugh: face(arcEye(35) + arcEye(65) + '<path d="M26 56 Q50 94 74 56 Z" fill="#7a2d12"/><path d="M36 74 Q50 66 64 74 Q50 84 36 74z" fill="#ff7a8a"/>'),
  love: face(heartPath(35, 42, 0.8, '#e11d48') + heartPath(65, 42, 0.8, '#e11d48') + smile),
  cool: face('<rect x="20" y="34" width="26" height="16" rx="6" fill="#1f2937"/><rect x="54" y="34" width="26" height="16" rx="6" fill="#1f2937"/><path d="M46 41h8" stroke="#1f2937" stroke-width="3"/>' + smile),
  wink: face(dot(35, 42) + '<path d="M57 44 Q65 38 73 44" fill="none" stroke="#4a2a10" stroke-width="4" stroke-linecap="round"/>' + smile),
  cry: face(dot(35, 42) + dot(65, 42) + '<path d="M32 72 Q50 56 68 72" fill="none" stroke="#4a2a10" stroke-width="4.5" stroke-linecap="round"/><path d="M30 50 q-5 10 0 14 q5 -4 0 -14z M70 50 q-5 10 0 14 q5 -4 0 -14z" fill="#38bdf8"/>'),
  angry: face(dot(35, 46, 4.5) + dot(65, 46, 4.5) + brow(24, 33, 44, 40) + brow(76, 33, 56, 40) + '<path d="M32 72 Q50 58 68 72" fill="none" stroke="#4a2a10" stroke-width="4.5" stroke-linecap="round"/>', 'url(#a)'),
  wow: face('<circle cx="35" cy="42" r="8" fill="#fff" stroke="#4a2a10" stroke-width="2.5"/><circle cx="65" cy="42" r="8" fill="#fff" stroke="#4a2a10" stroke-width="2.5"/>' + dot(35, 43, 3.5) + dot(65, 43, 3.5) + '<ellipse cx="50" cy="70" rx="8" ry="10" fill="#7a2d12"/>'),
  sleep: face('<path d="M27 46 H43 M57 46 H73" stroke="#4a2a10" stroke-width="4" stroke-linecap="round"/><path d="M42 68 Q50 72 58 68" fill="none" stroke="#4a2a10" stroke-width="4" stroke-linecap="round"/><text x="70" y="28" font-size="18" font-weight="700" fill="#2563eb" font-family="sans-serif">Z</text><text x="80" y="16" font-size="12" font-weight="700" fill="#2563eb" font-family="sans-serif">z</text>'),
  think: face(dot(35, 44) + dot(65, 44) + brow(54, 32, 76, 28) + '<path d="M36 68 H62" stroke="#4a2a10" stroke-width="4.5" stroke-linecap="round"/><text x="78" y="26" font-size="20" font-weight="700" fill="#2563eb" font-family="sans-serif">?</text>'),
  party: face(dot(35, 50) + dot(65, 50) + '<path d="M30 64 Q50 84 70 64" fill="none" stroke="#4a2a10" stroke-width="4.5" stroke-linecap="round"/>') + '<path d="M50 -2 L34 30 H66 Z" fill="#a855f7" stroke="#7e22ce" stroke-width="2"/><circle cx="50" cy="-2" r="5" fill="#f43f5e"/><circle cx="12" cy="20" r="3" fill="#22c55e"/><circle cx="90" cy="30" r="3" fill="#3b82f6"/><circle cx="88" cy="70" r="3" fill="#f43f5e"/><circle cx="10" cy="64" r="3" fill="#eab308"/>',
  shy: face(arcEye(35) + arcEye(65) + '<circle cx="24" cy="58" r="8" fill="#fb7185" opacity=".6"/><circle cx="76" cy="58" r="8" fill="#fb7185" opacity=".6"/><path d="M40 66 Q50 74 60 66" fill="none" stroke="#4a2a10" stroke-width="4" stroke-linecap="round"/>'),
  heart: heartPath(50, 50, 3.6, 'url(#h)'),
  fire: '<path d="M50 6 C54 24 78 34 78 62 A28 28 0 0 1 22 62 C22 48 32 40 36 30 C40 38 44 38 46 36 C50 28 46 16 50 6z" fill="url(#fl)"/><path d="M50 50 C54 60 64 62 64 72 A14 14 0 0 1 36 72 C36 64 46 60 50 50z" fill="#fde047"/>',
  thumb: '<path d="M18 44h16v40H18z" fill="#d98a12"/><path d="M34 44l16-30c8 0 12 6 10 16l-2 10h24a8 8 0 0 1 8 10l-6 26a10 10 0 0 1-10 8H34z" fill="url(#f)" stroke="#d98a12" stroke-width="2.5" stroke-linejoin="round"/>',
  star: '<path d="M50 6l12 26 28 4-20 20 5 28-25-14-25 14 5-28L10 36l28-4z" fill="url(#s)" stroke="#d98a12" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="42" cy="30" rx="8" ry="4" fill="#fff" opacity=".4"/>',
};

const DEFS = '<defs><radialGradient id="f" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#ffe666"/><stop offset="1" stop-color="#f5a623"/></radialGradient><radialGradient id="a" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#ff9a76"/><stop offset="1" stop-color="#ea4c2e"/></radialGradient><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#be123c"/></linearGradient><linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#dc2626"/></linearGradient><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>';

/** Готовая SVG-разметка стикера; неизвестный код — пустая строка. Строки статичные, пользовательского текста в них нет. */
export const stickerSvg = (code: string): string => (PARTS[code] ? `<svg viewBox="-4 -8 108 108" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${code}">${DEFS}${PARTS[code]}</svg>` : '');

/** Эмодзи для панели ввода — по группам. */
export const EMOJI_GROUPS: { icon: string; list: string[] }[] = [
  { icon: '😀', list: '😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 😉 😍 🥰 😘 😎 🤩 🥳 😇 🤗 🤔 😐 😴 😮 😢 😭 😡 🥺 😬 🙄 😏'.split(' ') },
  { icon: '👍', list: '👍 👎 👏 🙌 🙏 🤝 💪 ✌️ 👌 🤞 👋 🤙 ☝️ 👀 🧠 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 💯 🔥 ✨ ⭐ 🎉 🎊 🏆'.split(' ') },
  { icon: '🍕', list: '☕ 🍵 🍕 🍔 🍟 🍎 🍌 🍉 🍰 🎂 🍫 🍪 🥗 🍜 🍣 🥟 🍇 🥤 🍺 🍷'.split(' ') },
  { icon: '💼', list: '💼 📌 📎 📅 📝 📊 📈 💻 📱 ☎️ ✉️ 🔔 ⏰ ✅ ❌ ⚠️ ❓ ❗ 💡 🔒 🎯 🚀 🏠 🚗 ✈️ 🌴 ☀️ 🌧️ ⚽ 🎵'.split(' ') },
];
