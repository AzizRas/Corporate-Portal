<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import { refreshNotify } from '../lib/notify.svelte';

  let p: any = $state(null), quiet = $state(false), msg = $state(''), busy = $state(false);
  api.get('/api/me/notify-prefs').then((r) => { p = { ...r.prefs, quiet_from: r.prefs.quiet_from ?? '22:00', quiet_to: r.prefs.quiet_to ?? '07:00' }; quiet = !!r.prefs.quiet_from; });
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
      <div class="row" style="gap:10px"><label class="f" style="flex:1;margin:0">{wt('np_from')}<input type="time" bind:value={p.quiet_from} required /></label><label class="f" style="flex:1;margin:0">{wt('np_to')}<input type="time" bind:value={p.quiet_to} required /></label></div>
    {/if}
    <p class="muted xs">{wt('np_hint')}</p>
    {#if msg}<div class="alert ok">{msg}</div>{/if}
    <button class="btn grad" onclick={save} disabled={busy}>{app.lang === 'uz' ? 'Saqlash' : 'Сохранить'}</button>
  {:else}<span class="spin"></span>{/if}
</section>
