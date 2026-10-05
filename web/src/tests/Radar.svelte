<script lang="ts">
  // Радар на чистом SVG: оси задаются массивом, значения 0–100.
  let { axes, label = '' }: { axes: { id: string; value: number; title?: string }[]; label?: string } = $props();
  const C = 130, R = 82;
  const pt = (k: number, r: number) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / axes.length;
    return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
  };
  const poly = (r: (k: number) => number) => axes.map((_, k) => pt(k, r(k)).map((n) => n.toFixed(1)).join(',')).join(' ');
  const aria = $derived(`${label} ${axes.map((a) => `${a.id} ${a.value}%`).join(', ')}`);
</script>

<div class="t-radar">
  <svg viewBox="0 0 {C * 2} {C * 2}" role="img" aria-label={aria}>
    {#each [25, 50, 75, 100] as p}<polygon points={poly(() => (R * p) / 100)} fill="none" stroke="var(--border)" stroke-width="1" />{/each}
    {#each axes as _, k}{@const [x, y] = pt(k, R)}<line x1={C} y1={C} x2={x} y2={y} stroke="var(--border)" stroke-width="1" />{/each}
    <polygon points={poly((k) => (R * Math.max(axes[k].value, 3)) / 100)} fill="color-mix(in srgb, var(--accent) 30%, transparent)" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" />
    {#each axes as a, k}
      {@const [x, y] = pt(k, (R * Math.max(a.value, 3)) / 100)}
      {@const [lx, ly] = pt(k, R + 26)}
      <circle cx={x} cy={y} r="4.5" fill="var(--accent)" stroke="var(--card)" stroke-width="2" />
      <text x={lx} y={ly - 3} text-anchor="middle" font-size="20" font-weight="800" fill="var(--text)">{a.id}</text>
      <text x={lx} y={ly + 14} text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--muted)">{a.value}%</text>
    {/each}
  </svg>
</div>
