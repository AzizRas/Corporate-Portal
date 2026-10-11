<script lang="ts">
  import { notif, markRead, enableBrowserNotifications } from '../lib/notify.svelte';
  import { st } from '../lib/s18n';
  import { wt } from '../lib/w18n';
  import { go } from '../lib/state.svelte';
  import { fmtDateTime, stripEmoji } from '../lib/format';
  import { portal } from '../lib/portal';
  import Icon from './Icon.svelte';

  let open = $state(false), btn: HTMLButtonElement | undefined = $state(), pos = $state('');
  const total = $derived(notif.unread + notif.chat_total);
  const kindIcon = (k: string) => ({ news: 'news', mention: 'chat', reply: 'chat', dayoff: 'schedule', training: 'training', test: 'tests', task: 'tests' } as Record<string, string>)[k] ?? 'bell';
  let permState = $state(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  async function enable() { await enableBrowserNotifications(); permState = Notification.permission; }

  // группы «Сегодня» и «Раньше»
  const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const today = $derived(notif.items.filter((i) => sameDay(i.created_at)));
  const earlier = $derived(notif.items.filter((i) => !sameDay(i.created_at)));
  const groups = $derived([{ label: wt('nt_today'), list: today }, { label: wt('nt_earlier'), list: earlier }]);

  // Панель живёт в <body> (portal) и позиционируется от кнопки: боковая колонка с прокруткой и blur её не обрезает.
  function place() {
    if (!btn) return;
    const r = btn.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    if (vw <= 880) { pos = `left:12px;right:12px;top:68px;max-height:${vh - 150}px`; return; }
    const w = Math.min(400, vw - 24), left = Math.max(12, Math.min(r.left, vw - w - 12));
    pos = r.top > vh / 2
      ? `left:${left}px;width:${w}px;bottom:${vh - r.top + 10}px;max-height:${r.top - 24}px`
      : `left:${left}px;width:${w}px;top:${r.bottom + 10}px;max-height:${vh - r.bottom - 24}px`;
  }
  const cleanTitle = (t: string) => t.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '') || t;
  function toggle() { if (!open) place(); open = !open; }
  async function openItem(i: any) { open = false; if (!i.read) await markRead([i.id]); if (i.link) go(i.link.replace(/^#/, '')); }
  async function markOne(e: Event, i: any) { e.stopPropagation(); await markRead([i.id]); }
</script>

<svelte:window onresize={() => open && place()} onkeydown={(e) => open && e.key === 'Escape' && (open = false)} />

<button class="bell" bind:this={btn} aria-label={st('nt_title')} aria-expanded={open} onclick={toggle}>
  <i><Icon name="bell" /></i>
  {#if total}<b>{total > 99 ? '99+' : total}</b>{/if}
</button>

{#if open}
  <div use:portal class="np-layer">
    <div class="np-back" role="presentation" onclick={() => (open = false)}></div>
    <div class="np-pop card" style={pos} role="dialog" aria-label={st('nt_title')}>
      <div class="row np-head">
        <b>{st('nt_title')}</b>
        {#if notif.unread}<span class="chip">{wt('nt_unread_n', { n: notif.unread })}</span>{/if}
        <span class="sp"></span>
        {#if notif.unread}<button class="g-act" onclick={() => markRead()}>{st('nt_read_all')}</button>{/if}
        <button class="np-x" aria-label={wt('nt_close')} onclick={() => (open = false)}><Icon name="close" /></button>
      </div>
      <div class="np-body">
        {#if notif.chat_total}
          <a class="n-item chat" href="#/chat" onclick={() => (open = false)}><span class="ic"><Icon inline name="chat" /></span><div><b>{st('nt_new_msgs')}</b><div class="muted xs">+{notif.chat_total}</div></div></a>
        {/if}
        {#each groups as g (g.label)}
          {#if g.list.length}
            <div class="np-group">{g.label}</div>
            {#each g.list as i (i.id)}
              <div class="n-row" class:unread={!i.read}>
                <button class="n-item" onclick={() => openItem(i)}>
                  <span class="ic"><Icon inline name={kindIcon(i.kind)} /></span>
                  <div class="u-3922d32"><b>{cleanTitle(i.title)}</b>{#if i.body && !i.body.startsWith('#')}<div class="muted small clip">{i.body}</div>{/if}<div class="muted xs">{fmtDateTime(i.created_at)}</div></div>
                </button>
                {#if !i.read}<button class="n-mark" title={wt('nt_mark')} aria-label={wt('nt_mark')} onclick={(e) => markOne(e, i)}><Icon name="check" /></button>{/if}
              </div>
            {/each}
          {/if}
        {/each}
        {#if !notif.items.length && !notif.chat_total}<p class="muted small u-3c84007">{st('nt_none')}</p>{/if}
      </div>
      {#if 'Notification' in window}
        <div class="np-foot">
          {#if permState === 'granted'}<span class="muted xs">✓ {st('nt_enabled')}</span>
          {:else if permState !== 'denied'}<button class="btn sm" onclick={enable}>{st('nt_enable')}</button>{/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bell { position: relative; border: 1px solid var(--border); background: var(--card); width: 44px; height: 44px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; color: var(--text); flex: none; }
  .bell i { display: block; width: 22px; height: 22px; }
  .bell :global(svg) { width: 22px; height: 22px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .bell b { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--grad); color: #fff; font-size: 11px; display: grid; place-items: center; }
  /* отдельный слой поверх всего интерфейса */
  :global(.np-layer) { position: fixed; inset: 0; z-index: 2000; }
  :global(.np-back) { position: absolute; inset: 0; background: rgba(0, 0, 0, .25); }
  :global(.np-pop) { position: absolute; padding: 14px; display: flex; flex-direction: column; gap: 6px; box-shadow: 0 24px 60px rgba(0, 0, 0, .45); overflow: hidden; }
  :global(.np-head) { gap: 8px; padding: 2px 2px 6px; flex: none; flex-wrap: nowrap; white-space: nowrap; }
  :global(.np-head .chip) { padding: 3px 10px; font-size: 12px; }
  :global(.np-x) { border: 0; background: none; color: var(--muted); width: 30px; height: 30px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; }
  :global(.np-x:hover) { color: var(--text); background: var(--card-2); }
  :global(.np-x svg) { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; }
  :global(.np-body) { overflow-y: auto; display: flex; flex-direction: column; gap: 2px; min-height: 0; }
  :global(.np-group) { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); padding: 10px 8px 4px; }
  :global(.np-foot) { flex: none; padding-top: 6px; }
  :global(.n-row) { display: flex; align-items: flex-start; gap: 4px; border-radius: 14px; }
  :global(.n-row.unread) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  :global(.n-row .n-item) { flex: 1; min-width: 0; }
  :global(.n-mark) { flex: none; margin: 8px 6px 0 0; border: 1px solid var(--border); background: var(--card); color: var(--muted); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; }
  :global(.n-mark:hover) { color: var(--text); }
  :global(.n-mark svg) { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
  :global(.n-item) { display: flex; gap: 12px; align-items: flex-start; text-align: left; border: 0; background: none; color: inherit; padding: 10px; border-radius: 14px; cursor: pointer; width: 100%; text-decoration: none; }
  :global(.n-item:hover) { background: var(--card-2); text-decoration: none; }
  :global(.n-item .ic) { font-size: 20px; line-height: 1.2; flex: none; }
  :global(.np-pop .clip) { overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
</style>
