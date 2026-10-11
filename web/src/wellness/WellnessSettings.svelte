<script lang="ts">
  // Блок настроек напоминаний для профиля: включить/выключить, интервал, разрешение браузерных уведомлений, статистика.
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { wt } from './w18n';

  const OPTIONS = [30, 45, 60, 90, 120];
  let stats: any = $state(null), msg = $state(''), bad = $state(false), perm = $state(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);

  const loadStats = () => api.get('/api/wellness/stats').then((r) => (stats = r)).catch(() => {});
  onMount(() => {
    loadStats();
    window.addEventListener('wellness-logged', loadStats);
    return () => window.removeEventListener('wellness-logged', loadStats);
  });

  async function save(patch: { wellness?: boolean; wellness_min?: number }) {
    const u = app.user!;
    const prev = { wellness: u.wellness, wellness_min: u.wellness_min };
    Object.assign(u, patch);
    try { await api.patch('/api/me/profile', patch); msg = wt('s_saved'); bad = false; }
    catch { Object.assign(u, prev); msg = wt('s_err'); bad = true; }
    setTimeout(() => (msg = ''), 2200);
  }
  async function askPermission() {
    if (typeof Notification === 'undefined') return;
    try { perm = await Notification.requestPermission(); } catch { perm = Notification.permission; }
  }
</script>

{#if app.user}
  <!-- профиль уже оборачивает блок в карточку с заголовком, поэтому здесь только содержимое -->
  <div class="ws">
    <p class="muted small u-87c136d">{wt('s_sub')}</p>
    <div class="ws-msg" class:bad aria-live="polite">{msg}</div>

    <label class="ws-sw">
      <input type="checkbox" role="switch" checked={app.user.wellness} onchange={(e) => save({ wellness: e.currentTarget.checked })} />
      <span class="trk" aria-hidden="true"></span><b>{wt('s_on')}</b>
    </label>

    <div class="ws-blk" class:dim={!app.user.wellness}>
      <div class="ws-l">{wt('s_every')}</div>
      <div class="ws-opts" role="radiogroup" aria-label={wt('s_every')}>
        {#each OPTIONS as m}
          <button role="radio" aria-checked={app.user.wellness_min === m} class:on={app.user.wellness_min === m} disabled={!app.user.wellness} onclick={() => save({ wellness_min: m })}>{m} {wt('s_min')}</button>
        {/each}
      </div>
      <p class="muted xs u-8a77e5a">{wt('s_hours', { from: app.user.shift_start, to: app.user.shift_end })}</p>
    </div>

    <div class="ws-blk">
      <div class="ws-l">{wt('s_notif')}</div>
      {#if perm === 'granted'}<p class="small pill-ok">✓ {wt('s_notif_granted')}</p>
      {:else if perm === 'denied'}<p class="small pill-bad">{wt('s_notif_denied')}</p>
      {:else if perm === 'unsupported'}<p class="small muted">{wt('s_notif_off')}</p>
      {:else}<button class="btn sm" onclick={askPermission}>🔔 {wt('s_notif_btn')}</button><p class="muted xs u-fe7b497">{wt('s_notif_hint')}</p>{/if}
    </div>

    <div class="ws-blk">
      <div class="ws-l">{wt('s_stats')}</div>
      {#if stats}
        <div class="ws-stats">
          {#each [['s_today', stats.today], ['s_week', stats.week]] as [k, s]}
            <div><span class="muted xs">{wt(k as string)}</span><b>{(s as any).done}</b><small>{wt('s_done')} · {(s as any).skip} {wt('s_skipped')} · {(s as any).snooze} {wt('s_snoozed')}</small></div>
          {/each}
        </div>
      {/if}
      <button class="btn sm u-56f4356" onclick={() => window.dispatchEvent(new Event('wellness-preview'))}>{wt('s_preview')}</button>
    </div>
  </div>
{/if}

<style>
  .ws-sw { display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 18px; position: relative; }
  .ws-sw input { position: absolute; opacity: 0; width: 44px; height: 26px; margin: 0; cursor: pointer; }
  .trk { width: 44px; height: 26px; border-radius: 99px; background: var(--track); border: 1px solid var(--border); position: relative; flex: none; transition: background .15s; }
  .trk::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.3); transition: transform .15s; }
  input:checked + .trk { background: var(--accent); border-color: transparent; }
  input:checked + .trk::after { transform: translateX(18px); }
  input:focus-visible + .trk { outline: 2px solid var(--accent); outline-offset: 2px; }
  .ws-blk { padding-top: 16px; margin-top: 16px; border-top: 1px solid var(--border); }
  .ws-blk.dim { opacity: .55; }
  .ws-l { font-size: 13px; color: var(--muted); font-weight: 600; margin-bottom: 8px; }
  .ws-opts { display: flex; gap: 8px; flex-wrap: wrap; }
  .ws-opts button { padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font-weight: 600; font-size: 13px; cursor: pointer; }
  .ws-opts button.on { background: var(--chip-on-bg); color: var(--chip-on-ink); border-color: transparent; }
  .ws-opts button:disabled { cursor: default; }
  .ws-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .ws-stats > div { padding: 12px 14px; border-radius: 16px; background: var(--card-2); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; }
  .ws-stats b { font-size: 28px; font-weight: 700; line-height: 1.1; }
  .ws-stats small { color: var(--muted); font-size: 11.5px; }
  .ws-msg { min-height: 18px; font-size: 13px; color: var(--good); margin: -8px 0 8px; }
  .ws-msg.bad { color: var(--bad); }
</style>
