<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { loadMe } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import ThemeToggle from '../components/ThemeToggle.svelte';

  let login = $state(''), password = $state(''), err = $state(''), busy = $state(false);
  async function submit(e: Event) {
    e.preventDefault(); busy = true; err = '';
    try { await api.post('/api/login', { login, password }); await loadMe(); }
    catch (x) { err = x instanceof ApiError && x.code === 'locked' ? t('login_locked') : x instanceof ApiError && x.status === 429 ? t('login_locked') : t('login_bad'); }
    finally { busy = false; }
  }
</script>

<div class="center-screen">
  <form class="card login-box stack" onsubmit={submit}>
    <div class="row"><div class="logo" style="padding:0"><i></i>Qadam</div><span class="sp"></span><ThemeToggle /></div>
    <div><h2 style="font-size:24px">{t('login_title')}</h2><p class="muted small" style="margin-top:4px">{t('login_sub')}</p></div>
    <label class="f" style="margin:0">{t('login_id')}<input bind:value={login} autocomplete="username" required /></label>
    <label class="f" style="margin:0">{t('login_pw')}<input type="password" bind:value={password} autocomplete="current-password" required /></label>
    {#if err}<div class="alert">{err}</div>{/if}
    <button class="btn grad block" disabled={busy}>{t('login_btn')}</button>
  </form>
</div>
