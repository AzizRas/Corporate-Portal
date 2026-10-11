// Рисует PNG-иконки приложения (PWA и push) без внешних библиотек: node scripts/make-icons.mjs
// Знак — буква «Q» из кольца и хвостика на бирюзовом градиенте, в цвет бренда портала.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]); };
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const o = y * (size * 4 + 1) + 1 + x * 4, [r, g, b, a] = px(x, y); raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// знак «Q» в единичных координатах 0..1: кольцо и косой хвостик
function glyph(u, v) {
  const dx = u - 0.5, dy = v - 0.47, d = Math.hypot(dx, dy);
  const ring = d > 0.2 && d < 0.31;
  // хвост: отрезок от (0.56,0.58) до (0.74,0.76), толщина 0.07
  const ax = 0.56, ay = 0.58, bx = 0.74, by = 0.76, px = u - ax, py = v - ay, ex = bx - ax, ey = by - ay;
  const t = Math.max(0, Math.min(1, (px * ex + py * ey) / (ex * ex + ey * ey)));
  const tail = Math.hypot(px - ex * t, py - ey * t) < 0.045;
  return ring || tail;
}
const roundedIn = (u, v, r) => { const x = Math.abs(u - 0.5) - (0.5 - r), y = Math.abs(v - 0.5) - (0.5 - r); return Math.hypot(Math.max(x, 0), Math.max(y, 0)) <= r; };
const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));

function render(size, kind) {
  const SS = 3;
  return png(size, (X, Y) => {
    let acc = [0, 0, 0, 0];
    for (let i = 0; i < SS; i++) for (let j = 0; j < SS; j++) {
      const u = (X + (i + 0.5) / SS) / size, v = (Y + (j + 0.5) / SS) / size;
      let c = [0, 0, 0, 0];
      if (kind === 'badge') { if (glyph(u, v)) c = [255, 255, 255, 255]; }
      else if (roundedIn(u, v, kind === 'maskable' ? 0 : 0.22)) {
        const bg = mix([37, 207, 232], [20, 120, 220], (u + v) / 2);
        c = glyph(kind === 'maskable' ? 0.5 + (u - 0.5) / 0.8 : u, kind === 'maskable' ? 0.5 + (v - 0.5) / 0.8 : v) ? [255, 255, 255, 255] : [...bg, 255];
      }
      acc = acc.map((s, k) => s + c[k] * (k === 3 ? 1 : c[3] / 255));
    }
    const n = SS * SS, a = acc[3] / n;
    return a ? [acc[0] / n / (a / 255), acc[1] / n / (a / 255), acc[2] / n / (a / 255), a].map((x) => Math.min(255, Math.round(x))) : [0, 0, 0, 0];
  });
}

const out = path.join(import.meta.dirname, '..', 'web', 'public');
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, 'any'));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, 'any'));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, 'maskable'));
fs.writeFileSync(path.join(out, 'badge-72.png'), render(72, 'badge'));
console.log('иконки записаны в', out);
