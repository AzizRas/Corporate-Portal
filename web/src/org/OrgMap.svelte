<script lang="ts">
  import { initials } from '../lib/format';
  import { wt } from '../lib/w18n';
  import { ot } from './oc18n';
  import { matches, type OcModel, type OcNode } from './oc-model';

  let { m, top, q, picked, onpick }: { m: OcModel; top: OcNode[]; q: string; picked: number | null; onpick: (n: OcNode) => void } = $props();

  // слева направо: колонка — уровень вложенности, строка — порядок узлов; родитель стоит по середине своих детей
  const COLW = 210, ROW = 128, PADX = 70, PADY = 40;
  const lay = $derived.by(() => {
    const pos = new Map<number, { x: number; y: number; n: OcNode }>();
    let rows = 0, maxD = 0;
    const walk = (n: OcNode, d: number): number => {
      maxD = Math.max(maxD, d);
      const ch = m.kids.get(n.id) ?? [];
      let y: number;
      if (!ch.length) y = rows++ * ROW;
      else { const ys = ch.map((c) => walk(c, d + 1)); y = (ys[0] + ys[ys.length - 1]) / 2; }
      pos.set(n.id, { x: d * COLW, y, n });
      return y;
    };
    for (const t of top) walk(t, 0);
    return { pos, w: maxD * COLW + PADX * 2 + 40, h: Math.max(1, rows - 1) * ROW + PADY * 2 + 110 };
  });
  const edges = $derived([...lay.pos.values()].filter((p) => p.n.parent_id != null && lay.pos.has(p.n.parent_id)).map((p) => ({ from: lay.pos.get(p.n.parent_id!)!, to: p })));
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const hit = (n: OcNode) => n.people.some((p) => matches(p, q));
  const px = (x: number) => x + PADX, py = (y: number) => y + PADY;
</script>

<div class="map">
  <svg width={lay.w} height={lay.h} viewBox={`0 0 ${lay.w} ${lay.h}`} role="group" aria-label={ot('vMap')}>
    <defs>{#each [...lay.pos.values()] as p (p.n.id)}{#if p.n.head?.avatar_v}<clipPath id={`oc-c-${p.n.id}`}><circle cx={px(p.x)} cy={py(p.y) - 4} r="21" /></clipPath>{/if}{/each}</defs>
    {#each edges as e (e.to.n.id)}
      <path d={`M ${px(e.from.x) + 30} ${py(e.from.y) + 20} C ${px(e.from.x) + COLW / 2} ${py(e.from.y) + 20}, ${px(e.to.x) - COLW / 2} ${py(e.to.y) + 20}, ${px(e.to.x) - 30} ${py(e.to.y) + 20}`} class="edge" />
    {/each}
    {#each [...lay.pos.values()] as p (p.n.id)}
      {@const n = p.n}
      {@const c = m.colorOf(n)}
      <g class="node" class:picked={picked === n.id} class:hit={hit(n)} role="button" tabindex="0" aria-label={m.nm(n)} onclick={() => onpick(n)} onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onpick(n)}>
        <ellipse cx={px(p.x)} cy={py(p.y) + 20} rx="32" ry="12" class="plat" style:stroke={c} />
        <ellipse cx={px(p.x)} cy={py(p.y) + 20} rx="22" ry="8" class="plat2" style:fill={c} />
        {#if n.head?.avatar_v}
          <circle cx={px(p.x)} cy={py(p.y) - 4} r="23" style:fill={c} />
          <image href={`/api/avatar/${n.head.id}?v=${n.head.avatar_v}`} x={px(p.x) - 21} y={py(p.y) - 25} width="42" height="42" clip-path={`url(#oc-c-${n.id})`} preserveAspectRatio="xMidYMid slice" />
        {:else}
          <circle cx={px(p.x)} cy={py(p.y) - 4} r="22" style:fill={c} class="face" />
          <text x={px(p.x)} y={py(p.y) + 1} text-anchor="middle" class="ini">{n.head ? initials(n.head.name) : n.kind === 'root' ? '★' : '·'}</text>
        {/if}
        <g transform={`translate(${px(p.x) + 20} ${py(p.y) - 24})`}><circle r="11" class="badge" /><text y="4" text-anchor="middle" class="bt">{n.total}</text></g>
        <text x={px(p.x)} y={py(p.y) + 48} text-anchor="middle" class="nm">{cut(m.nm(n), 24)}</text>
        <text x={px(p.x)} y={py(p.y) + 64} text-anchor="middle" class="sb">{cut(n.head ? n.head.name : ot('noHead'), 26)}</text>
        <text x={px(p.x)} y={py(p.y) + 79} text-anchor="middle" class="sb k">{wt(`o_k_${n.kind}`)}</text>
      </g>
    {/each}
  </svg>
</div>

<style>
  .map { overflow: auto; background: var(--card); border: 1px solid var(--border); border-radius: 16px; min-height: 280px; }
  svg { display: block; }
  .edge { fill: none; stroke: color-mix(in srgb, var(--muted) 60%, transparent); stroke-width: 1.6; stroke-dasharray: 2 5; stroke-linecap: round; }
  .node { cursor: pointer; outline: none; }
  .plat { fill: var(--card-2); stroke-width: 1.6; }
  .plat2 { opacity: .22; }
  .face { stroke: var(--card); stroke-width: 2; }
  .ini { fill: #0e0e10; font-weight: 700; font-size: 14px; pointer-events: none; }
  .badge { fill: var(--text); }
  .bt { fill: var(--bg); font-size: 11px; font-weight: 700; }
  .nm { fill: var(--text); font-size: 13px; font-weight: 700; }
  .sb { fill: var(--muted); font-size: 11.5px; }
  .sb.k { text-transform: uppercase; letter-spacing: .06em; font-size: 10px; }
  .node:hover .plat, .node:focus-visible .plat { stroke-width: 3; }
  .picked .plat { stroke-width: 3.5; }
  .hit .plat { stroke: var(--accent); stroke-width: 4; }
</style>
