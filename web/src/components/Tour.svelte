<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import { tour, next, back, skip, closePoint } from '../lib/tour.svelte';
  import { portal } from '../lib/portal';

  const cur = $derived(tour.active ? tour.steps[tour.i] : null);
  const spec = $derived(cur ? { targets: cur.targets, title: cur.title[app.lang], text: cur.text[app.lang] } : tour.point ? { targets: tour.point.targets, title: tour.point.title, text: tour.point.text } : null);
  const open = $derived(!!spec);
  let rect: { x: number; y: number; w: number; h: number } | null = $state(null), box: HTMLElement | undefined = $state(), tipStyle = $state(''), viaMore = $state(false), tipEl: HTMLElement | undefined = $state();

  const visible = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).getClientRects().length > 0;
  /** Первый видимый элемент из списка (на телефоне боковое меню скрыто — берём нижнюю панель, а если пункта там нет — «Ещё»). */
  function find(targets: string[]): { el: HTMLElement | null; more: boolean } {
    for (const [i, t] of targets.entries()) { const el = document.querySelector(`[data-tour="${t}"]`); if (visible(el)) return { el, more: t === 'tab-more' && i > 0 }; }
    return { el: null, more: false };
  }

  async function place() {
    if (!spec) return;
    await tick();
    const { el, more } = find(spec.targets);
    viaMore = more;
    if (!el) { rect = null; tipStyle = ''; return; }
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect(), pad = 6;
    rect = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
    const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(340, vw - 24), th = 190;
    let left: number, top: number;
    if (vw > 880 && r.right + w + 24 < vw) { left = r.right + 18; top = Math.min(Math.max(12, r.top - 10), vh - th - 12); }                 // справа от пункта меню
    else if (r.bottom + th + 18 < vh) { left = Math.min(Math.max(12, r.left), vw - w - 12); top = r.bottom + 14; }                             // под элементом
    else { left = Math.min(Math.max(12, r.left), vw - w - 12); top = Math.max(12, r.top - th - 14); }                                         // над элементом (нижняя панель)
    tipStyle = `left:${left}px;top:${top}px;width:${w}px`;
    // реальная высота подсказки известна только после отрисовки: если она перекрывает элемент, сдвигаем
    await tick();
    const h = tipEl?.offsetHeight ?? th;
    if (top + h > vh - 8) top = Math.max(8, vh - h - 8);
    if (top < r.bottom && top + h > r.top && left < r.right && left + w > r.left) top = r.top - h - 14 >= 8 ? r.top - h - 14 : Math.min(vh - h - 8, r.bottom + 14);
    tipStyle = `left:${left}px;top:${top}px;width:${w}px`;
  }
  // меню может ещё раскрываться: измеряем сразу и после анимации
  $effect(() => { spec; tour.group; if (!spec) return; place(); const t1 = setTimeout(place, 120), t2 = setTimeout(place, 420); return () => { clearTimeout(t1); clearTimeout(t2); }; });
  const key = (e: KeyboardEvent) => { if (!open) return; if (e.key === 'Escape') (tour.active ? skip() : closePoint()); else if (tour.active && e.key === 'ArrowRight') next(); else if (tour.active && e.key === 'ArrowLeft') back(); };
</script>

<svelte:window onresize={place} onkeydown={key} />

{#if open && spec}
  <div use:portal class="tr-layer" role="dialog" aria-modal="true" aria-label={spec.title} bind:this={box}>
    <div class="tr-block" role="presentation"></div>
    {#if rect}<div class="tr-spot" style="left:{rect.x}px;top:{rect.y}px;width:{rect.w}px;height:{rect.h}px"></div>{:else}<div class="tr-dim"></div>{/if}
    <div class="tr-tip card" class:center={!rect} style={tipStyle} bind:this={tipEl}>
      <div class="tr-h">{spec.title}</div>
      <p class="tr-t">{spec.text}</p>
      {#if viaMore}<p class="muted xs">{wt('tr_more_hint')}</p>{/if}
      <div class="tr-f">
        {#if tour.active}
          <span class="muted xs">{wt('tr_step', { i: tour.i + 1, n: tour.steps.length })}</span>
          <span class="sp"></span>
          <button class="btn sm" onclick={skip}>{wt('tr_skip')}</button>
          {#if tour.i > 0}<button class="btn sm" onclick={back}>{wt('tr_back')}</button>{/if}
          <button class="btn sm grad" onclick={next}>{tour.i >= tour.steps.length - 1 ? wt('tr_done') : wt('tr_next')}</button>
        {:else}
          <span class="sp"></span><button class="btn sm grad" onclick={closePoint}>{wt('tr_got')}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.tr-layer) { position: fixed; inset: 0; z-index: 3000; }
  :global(.tr-block) { position: absolute; inset: 0; }
  :global(.tr-dim) { position: absolute; inset: 0; background: rgba(0, 0, 0, .6); }
  :global(.tr-spot) { position: absolute; border-radius: 14px; box-shadow: 0 0 0 9999px rgba(0, 0, 0, .62), 0 0 0 3px var(--accent); transition: all .2s ease; pointer-events: none; }
  :global(.tr-tip) { position: absolute; padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 24px 60px rgba(0, 0, 0, .5); }
  :global(.tr-tip.center) { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(380px, calc(100vw - 24px)); }
  :global(.tr-h) { font-weight: 800; font-size: 17px; }
  :global(.tr-t) { font-size: 14px; line-height: 1.45; color: var(--muted); margin: 0; }
  :global(.tr-f) { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
</style>
