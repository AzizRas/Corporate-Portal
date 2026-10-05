<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app, setLang, setTheme, logout } from '../lib/state.svelte';
  import { t } from '../lib/i18n';

  let oldPw = $state(''), newPw = $state(''), msg = $state(''), ok = $state(false);
  async function change(e: Event) {
    e.preventDefault(); msg = '';
    if (newPw.length < 8) { msg = t('pw_weak'); ok = false; return; }
    try { await api.patch('/api/me', { password: newPw, old_password: oldPw }); msg = t('pw_ok'); ok = true; oldPw = newPw = ''; }
    catch (x) { msg = x instanceof ApiError && x.code === 'bad_old' ? t('login_bad') : t('error'); ok = false; }
  }
  const roleName: Record<string, string> = { employee: 'Сотрудник', newbie: 'Новичок', mentor: 'Наставник', manager: 'Руководитель', hr: 'HR', accountant: 'Бухгалтерия', editor: 'Редактор базы', admin: 'Администратор' };
</script>

<header class="page-head"><div><h1>{t('profile_title')}</h1><p class="sub">{app.user?.name} · {app.user?.position}</p></div></header>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
  <section class="card stack">
    <div><div class="muted small">{t('profile_lang')}</div>
      <div class="tabs" style="margin:8px 0 0"><button class:on={app.lang === 'ru'} onclick={() => setLang('ru')}>Русский</button><button class:on={app.lang === 'uz'} onclick={() => setLang('uz')}>O‘zbekcha</button></div></div>
    <div><div class="muted small">{t('profile_theme')}</div>
      <div class="tabs" style="margin:8px 0 0">
        {#each [['system', 'theme_system'], ['light', 'theme_light'], ['dark', 'theme_dark']] as [v, k]}
          <button class:on={app.theme === v} onclick={() => setTheme(v as any)}>{t(k as any)}</button>
        {/each}</div></div>
    <div><div class="muted small">{t('role')}</div><div class="row wrap" style="margin-top:8px">{#each app.user?.roles ?? [] as r}<span class="chip">{roleName[r] ?? r}</span>{/each}</div></div>
    <button class="btn danger" onclick={logout}>{t('nav_logout')}</button>
  </section>
  <form class="card stack" onsubmit={change}>
    <h3 class="card-title">{t('profile_pw')}</h3>
    <label class="f" style="margin:0">{t('pw_old')}<input type="password" bind:value={oldPw} autocomplete="current-password" required /></label>
    <label class="f" style="margin:0">{t('pw_new')}<input type="password" bind:value={newPw} autocomplete="new-password" required /></label>
    {#if msg}<div class="alert" class:ok>{msg}</div>{/if}
    <button class="btn grad">{t('save')}</button>
  </form>
</div>
