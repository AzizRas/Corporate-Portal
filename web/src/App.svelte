<script lang="ts">
  import { app, loadMe, applyTheme } from './lib/state.svelte';
  import { t } from './lib/i18n';
  import { api } from './lib/api';
  import Login from './pages/Login.svelte';
  import Shell from './components/Shell.svelte';
  import Router from './Router.svelte';

  applyTheme();
  loadMe();
  window.addEventListener('session-expired', () => { app.user = null; });

  let pw1 = $state(''), pw2 = $state(''), msg = $state(''), busy = $state(false);
  async function changePw(e: Event) {
    e.preventDefault();
    if (pw1.length < 8) { msg = t('pw_weak'); return; }
    if (pw1 !== pw2) { msg = app.lang === 'uz' ? 'Parollar mos kelmadi' : 'Пароли не совпадают'; return; }
    busy = true;
    try { await api.patch('/api/me', { password: pw1 }); await loadMe(); pw1 = pw2 = ''; msg = ''; }
    catch { msg = t('error'); } finally { busy = false; }
  }
  async function consent() {
    await api.post('/api/me/consent', { kind: 'data' });
    app.consents = [...app.consents, 'data'];
  }
</script>

{#if !app.ready}
  <div class="center-screen"><span class="spin"></span></div>
{:else if !app.user}
  <Login />
{:else if app.user.must_change_password}
  <div class="center-screen">
    <form class="card login-box stack" onsubmit={changePw}>
      <h2>{t('pw_title')}</h2>
      <p class="muted small">{t('pw_sub')}</p>
      <label class="f">{t('pw_new')}<input type="password" bind:value={pw1} autocomplete="new-password" required /></label>
      <label class="f">{app.lang === 'uz' ? 'Parolni takrorlang' : 'Повторите пароль'}<input type="password" bind:value={pw2} autocomplete="new-password" required /></label>
      {#if msg}<div class="alert">{msg}</div>{/if}
      <button class="btn grad block" disabled={busy}>{t('save')}</button>
    </form>
  </div>
{:else if !app.consents.includes('data')}
  <div class="center-screen">
    <div class="card login-box stack">
      <h2>{t('consent_title')}</h2>
      <p class="muted">{t('consent_text')}</p>
      <button class="btn grad block" onclick={consent}>{t('consent_btn')}</button>
    </div>
  </div>
{:else}
  <Shell><Router /></Shell>
{/if}
