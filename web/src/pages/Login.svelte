<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { loadMe } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { app } from '../lib/state.svelte';
  import ThemeToggle from '../components/ThemeToggle.svelte';

  let login = $state(''), password = $state(''), code = $state(''), second = $state(false), err = $state(''), busy = $state(false);
  const uz = $derived(app.lang === 'uz');
  async function submit(e: Event) {
    e.preventDefault(); busy = true; err = '';
    try {
      const r = await api.post('/api/login', { login, password, ...(second ? { code: code.trim() } : {}) });
      if (r?.need_2fa) { second = true; code = ''; } else await loadMe();   // пароль верный, но нужен код из приложения
    }
    catch (x) { err = x instanceof ApiError && x.code === 'bad_code' ? (uz ? 'Kod noto‘g‘ri' : 'Неверный код') : x instanceof ApiError && x.code === 'locked' ? t('login_locked') : x instanceof ApiError && x.status === 429 ? t('login_locked') : t('login_bad'); }
    finally { busy = false; }
  }
</script>

<div class="center-screen">
  <form class="card login-box stack" onsubmit={submit}>
    <div class="row"><div class="logo u-41d7d7e"><i></i>Qadam</div><span class="sp"></span><ThemeToggle /></div>
    <div><h2 class="u-81351bd">{t('login_title')}</h2><p class="muted small u-96ad609">{t('login_sub')}</p></div>
    {#if !second}
    <label class="f u-1169661">{t('login_id')}<input bind:value={login} autocomplete="username" required /></label>
    <label class="f u-1169661">{t('login_pw')}<input type="password" bind:value={password} autocomplete="current-password" required /></label>
    {:else}
    <p class="muted small">{uz ? 'Ilovadagi 6 xonali kodni yoki zaxira kodni kiriting.' : 'Введите 6-значный код из приложения или резервный код.'}</p>
    <label class="f u-1169661">{uz ? 'Kod' : 'Код'}<input bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="10" required /></label>
    {/if}
    {#if err}<div class="alert">{err}</div>{/if}
    <button class="btn grad block" disabled={busy}>{t('login_btn')}</button>
  </form>
</div>
