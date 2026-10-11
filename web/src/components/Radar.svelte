<script lang="ts">
  import { st } from '../lib/s18n';
  import { pick } from '../lib/format';

  // «Колесо баланса» по компетенциям: сейчас, прошлый месяц, требование целевой должности. Линии сглажены.
  let { items, max = 4 }: { items: { name_ru: string; name_uz: string; cur: number; req: number; prev: number | null }[]; max?: number } = $props();
  const W = 640, H = 440, cx = W / 2, cy = H / 2, R = 150;
  const n = $derived(items.length);
  const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i: number, v: number) => [cx + Math.cos(ang(i)) * R * Math.min(Math.max(v, 0), max) / max, cy + Math.sin(ang(i)) * R * Math.min(Math.max(v, 0), max) / max];
  // замкнутая кривая Catmull-Rom → кубические Безье
  function smooth(pts: number[][]) {
    const k = pts.length; if (k < 3) return '';
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < k; i++) {
      const p0 = pts[(i - 1 + k) % k], p1 = pts[i], p2 = pts[(i + 1) % k], p3 = pts[(i + 2) % k];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  }
  const ring = (lv: number) => smooth(Array.from({ length: n }, (_, i) => pt(i, lv)));
  const nowPath = $derived(smooth(items.map((c, i) => pt(i, c.cur))));
  const reqPath = $derived(smooth(items.map((c, i) => pt(i, c.req))));
  const hasPrev = $derived(items.some((c) => c.prev != null));
  const prevPath = $derived(hasPrev ? smooth(items.map((c, i) => pt(i, c.prev ?? 0))) : '');
  const label = (i: number) => {
    const a = ang(i), x = cx + Math.cos(a) * (R + 20), y = cy + Math.sin(a) * (R + 20);
    const c = Math.cos(a);
    return { x, y: y + 4, anchor: Math.abs(c) < 0.25 ? 'middle' : c > 0 ? 'start' : 'end' };
  };
  // длинные названия переносим на две строки
  const wrap = (t: string) => {
    if (t.length <= 16) return [t];
    const w = t.split(' '); let a = '', i = 0;
    while (i < w.length && (a + ' ' + w[i]).trim().length <= 16) a = (a + ' ' + w[i++]).trim();
    const b = w.slice(i).join(' ');
    return b ? [a || w[0], b.length > 20 ? b.slice(0, 19) + '…' : b] : [a];
  };
  const empty = $derived(!items.length || items.every((c) => !c.cur));
</script>

<div class="rd">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label={st('rd_title')}>
    {#each [1, 2, 3, 4] as lv}<path d={ring(lv)} class="grid" />{/each}
    {#each items as _, i}<line x1={cx} y1={cy} x2={pt(i, max)[0]} y2={pt(i, max)[1]} class="spoke" />{/each}
    {#if n >= 3}
      {#if hasPrev}<path d={prevPath} class="prev" />{/if}
      <path d={reqPath} class="req" />
      {#if !empty}<path d={nowPath} class="now" />{/if}
      {#each items as c, i}{#if c.cur}<circle cx={pt(i, c.cur)[0]} cy={pt(i, c.cur)[1]} r="3.5" class="dot" />{/if}{/each}
    {/if}
    {#each items as c, i}
      {@const l = label(i)}
      <text x={l.x} y={l.y - (wrap(pick(c, 'name')).length - 1) * 7} text-anchor={l.anchor} class="lb">{#each wrap(pick(c, 'name')) as ln, k}<tspan x={l.x} dy={k ? 15 : 0}>{ln}</tspan>{/each}</text>
    {/each}
  </svg>
  <div class="lg">
    <span><i class="now"></i>{st('rd_now')}</span>
    {#if hasPrev}<span><i class="prev"></i>{st('rd_prev')}</span>{/if}
    <span><i class="req"></i>{st('rd_req')}</span>
  </div>
  {#if empty}<p class="muted small u-91a8701">{st('rd_empty')}</p>{/if}
</div>

<style>
  .rd { width: 100%; }
  svg { width: 100%; height: auto; display: block; overflow: visible; }
  .grid { fill: none; stroke: var(--border); stroke-width: 1; }
  .spoke { stroke: var(--border); stroke-width: 1; opacity: .7; }
  .now { fill: color-mix(in srgb, var(--accent) 24%, transparent); stroke: var(--accent); stroke-width: 2.4; stroke-linejoin: round; }
  .req { fill: none; stroke: #f59e0b; stroke-width: 2; stroke-dasharray: 2 5; stroke-linecap: round; }
  .prev { fill: none; stroke: var(--muted); stroke-width: 1.6; stroke-dasharray: 6 5; }
  .dot { fill: var(--accent); }
  .lb { font-size: 12.5px; font-weight: 700; fill: var(--text); }
  .lg { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; font-size: 13px; color: var(--muted); margin-top: 6px; }
  .lg i { display: inline-block; width: 22px; height: 0; border-top: 3px solid var(--accent); vertical-align: middle; margin-right: 6px; border-radius: 2px; }
  .lg i.prev { border-top: 2px dashed var(--muted); }
  .lg i.req { border-top: 3px dotted #f59e0b; }
  @media (max-width: 560px) { .lb { font-size: 14px; } }
</style>
