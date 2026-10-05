<script lang="ts">
  import { notif, markRead, enableBrowserNotifications } from '../lib/notify.svelte';
  import { st } from '../lib/s18n';
  import { go } from '../lib/state.svelte';
  import { fmtDateTime } from '../lib/format';
  import Icon from './Icon.svelte';

  let open = $state(false);
  const total = $derived(notif.unread + notif.chat_total);
  const kindIcon = (k: string) => ({ news: '📢', mention: '＠', reply: '↩', dayoff: '📅', training: '🎓', test: '📝' } as any)[k] ?? '🔔';
  let permState = $state(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  async function enable() { await enableBrowserNotifications(); permState = Notification.permission; }
  async function openItem(i: any) { open = false; if (!i.read) await markRead([i.id]); if (i.link) go(i.link.replace(/^#/, '')); }
</script>

<div class="bell-wrap">
  <button class="bell" aria-label={st('nt_title')} onclick={() => (open = !open)}>
    <i><Icon name="bell" /></i>
    {#if total}<b>{total > 99 ? '99+' : total}</b>{/if}
  </button>
  {#if open}
    <div class="bell-back" role="presentation" onclick={() => (open = false)}></div>
    <div class="bell-pop card">
      <div class="row"><b>{st('nt_title')}</b><span class="sp"></span>{#if notif.unread}<button class="g-act" onclick={() => markRead()}>{st('nt_read_all')}</button>{/if}</div>
      {#if notif.chat_total}
        <a class="n-item chat" href="#/chat" onclick={() => (open = false)}><span class="ic">💬</span><div><b>{st('nt_new_msgs')}</b><div class="muted xs">+{notif.chat_total}</div></div></a>
      {/if}
      <div class="n-list">
        {#each notif.items as i (i.id)}
          <button class="n-item" class:unread={!i.read} onclick={() => openItem(i)}>
            <span class="ic">{kindIcon(i.kind)}</span>
            <div style="min-width:0"><b>{i.title}</b>{#if i.body && !i.body.startsWith('#')}<div class="muted small clip">{i.body}</div>{/if}<div class="muted xs">{fmtDateTime(i.created_at)}</div></div>
          </button>
        {:else}{#if !notif.chat_total}<p class="muted small" style="padding:14px 4px">{st('nt_none')}</p>{/if}{/each}
      </div>
      {#if 'Notification' in window}
        {#if permState === 'granted'}<p class="muted xs">✓ {st('nt_enabled')}</p>
        {:else if permState !== 'denied'}<button class="btn sm" onclick={enable}>{st('nt_enable')}</button>{/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .bell-wrap { position: relative; }
  .bell { position: relative; border: 1px solid var(--border); background: var(--card); width: 44px; height: 44px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; color: var(--text); }
  .bell i { display: block; width: 22px; height: 22px; }
  .bell :global(svg) { width: 22px; height: 22px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .bell b { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--grad); color: #fff; font-size: 11px; display: grid; place-items: center; }
  .bell-back { position: fixed; inset: 0; z-index: 59; }
  .bell-pop { position: absolute; right: 0; top: 52px; width: min(380px, calc(100vw - 24px)); z-index: 60; padding: 16px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 20px 50px rgba(0,0,0,.35); }
  .n-list { max-height: min(60vh, 420px); overflow: auto; display: flex; flex-direction: column; gap: 2px; }
  .n-item { display: flex; gap: 12px; align-items: flex-start; text-align: left; border: 0; background: none; color: inherit; padding: 10px; border-radius: 14px; cursor: pointer; width: 100%; text-decoration: none; }
  .n-item:hover { background: var(--card-2); text-decoration: none; }
  .n-item.unread { background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .n-item .ic { font-size: 20px; line-height: 1.2; flex: none; }
  .clip { overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  @media (max-width: 880px) { .bell-pop { position: fixed; right: 12px; left: 12px; top: 64px; width: auto; } }
</style>
