<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import { refreshNotify } from '../lib/notify.svelte';
  import { disablePush, enablePush, pushState } from '../lib/push';

  let p: any = $state(null), quiet = $state(false), msg = $state(''), busy = $state(false);
  api.get('/api/me/notify-prefs').then((r) => { p = { ...r.prefs, quiet_from: r.prefs.quiet_from ?? '22:00', quiet_to: r.prefs.quiet_to ?? '07:00' }; quiet = !!r.prefs.quiet_from; });
  let ps: 'off' | 'denied' | 'on' | 'idle' = $state('off'), pbusy = $state(false);
  pushState().then((s) => (ps = s)).catch(() => {});
  async function togglePush() {
    pbusy = true;
    try { if (ps === 'on') { await disablePush(); ps = 'idle'; } else { const r = await enablePush(); ps = r === 'on' ? 'on' : r === 'denied' ? 'denied' : 'off'; } }
    catch { msg = wt('ch_err'); } finally { pbusy = false; }
  }
  async function save() {
    busy = true; msg = '';
    try {
      await api.put('/api/me/notify-prefs', { chat: p.chat, mentions: p.mentions, news: p.news, quiet_from: quiet ? p.quiet_from : null, quiet_to: quiet ? p.quiet_to : null });
      msg = wt('np_saved'); await refreshNotify();
    } catch { msg = wt('ch_err'); } finally { busy = false; }
  }
</script>

<section class="card stack">
  <h3 class="card-title">{wt('np_title')}</h3>
  {#if p}
    <label class="chk"><input type="checkbox" bind:checked={p.chat} /> {wt('np_chat')}</label>
    <label class="chk"><input type="checkbox" bind:checked={p.mentions} /> {wt('np_mentions')}</label>
    <label class="chk"><input type="checkbox" bind:checked={p.news} /> {wt('np_news')}</label>
    <label class="chk"><input type="checkbox" bind:checked={quiet} /> {wt('np_quiet')}</label>
    {#if quiet}
      <div class="row u-f3d7ce7"><label class="f u-5d50d57">{wt('np_from')}<input type="time" bind:value={p.quiet_from} required /></label><label class="f u-5d50d57">{wt('np_to')}<input type="time" bind:value={p.quiet_to} required /></label></div>
    {/if}
    {#if ps !== 'off'}
      <div class="row u-f3d7ce7">
        <button class="btn" onclick={togglePush} disabled={pbusy || ps === 'denied'}>{ps === 'on' ? (app.lang === 'uz' ? 'Bu qurilmada push-ni o‘chirish' : 'Отключить push на этом устройстве') : (app.lang === 'uz' ? 'Bu qurilmada push-ni yoqish' : 'Включить push на этом устройстве')}</button>
        {#if ps === 'denied'}<span class="muted xs">{app.lang === 'uz' ? 'Brauzerda bloklangan' : 'Запрещено в настройках браузера'}</span>{/if}
      </div>
    {/if}
    <p class="muted xs">{wt('np_hint')}</p>
    {#if msg}<div class="alert ok">{msg}</div>{/if}
    <button class="btn grad" onclick={save} disabled={busy}>{app.lang === 'uz' ? 'Saqlash' : 'Сохранить'}</button>
  {:else}<span class="spin"></span>{/if}
</section>
