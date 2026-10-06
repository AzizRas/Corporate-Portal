<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app, setLang, setTheme, logout, loadMe } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { st } from '../lib/s18n';
  import Avatar from '../components/Avatar.svelte';
  import { wt } from '../lib/w18n';
  import WellnessSettings from '../wellness/WellnessSettings.svelte';
  import Payroll from './Payroll.svelte';

  let { tab = 'me' }: { tab?: string } = $props();

  let oldPw = $state(''), newPw = $state(''), msg = $state(''), ok = $state(false);
  async function change(e: Event) {
    e.preventDefault(); msg = '';
    if (newPw.length < 8) { msg = t('pw_weak'); ok = false; return; }
    try { await api.patch('/api/me', { password: newPw, old_password: oldPw }); msg = t('pw_ok'); ok = true; oldPw = newPw = ''; }
    catch (x) { msg = x instanceof ApiError && x.code === 'bad_old' ? t('login_bad') : t('error'); ok = false; }
  }
  let status = $state(app.user?.status ?? ''), birthday = $state(app.user?.birthday ?? ''), pmsg = $state(''), perr = $state(''), busy = $state(false);
  async function saveProfile(e: Event) {
    e.preventDefault(); pmsg = '';
    await api.patch('/api/me/profile', { status, birthday: birthday || null });
    await loadMe(); pmsg = st('pf_saved');
  }
  // фото: обрезаем до квадрата 256×256 и сжимаем в JPEG прямо в браузере
  async function pickPhoto(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (!f) return;
    perr = ''; busy = true;
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(f); });
      const side = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 256;
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
      await api.post('/api/me/avatar', { data: c.toDataURL('image/jpeg', 0.85) });
      await loadMe();
    } catch { perr = st('pf_photo_err'); } finally { busy = false; (e.currentTarget as HTMLInputElement).value = ''; }
  }
  async function dropPhoto() { await api.del('/api/me/avatar'); await loadMe(); }
  const roleName: Record<string, string> = { employee: 'Оператор', newbie: 'Новичок', senior: 'Старший оператор', mentor: 'Наставник', manager: 'Супервайзер', head: 'Руководитель отдела', hr: 'HR', accountant: 'Бухгалтерия', editor: 'Редактор базы', admin: 'Администратор' };
</script>

<header class="page-head"><div><h1>{t('profile_title')}</h1><p class="sub">{app.user?.name} · {app.user?.position}</p></div></header>
<nav class="tabs">
  <a href="#/profile" class:on={tab === 'me'}>{wt('i_mydata')}</a>
  <a href="#/profile/pay" class:on={tab === 'pay'}>{st('n_pay')}</a>
  <a href="#/profile/settings" class:on={tab === 'settings'}>{wt('i_settings')}</a>
</nav>
{#if tab === 'pay'}<Payroll />
{:else if tab === 'settings'}
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
  <section class="card stack"><h3 class="card-title">{st('pf_wellness')}</h3><WellnessSettings /></section>
  <form class="card stack" onsubmit={change}>
    <h3 class="card-title">{t('profile_pw')}</h3>
    <label class="f" style="margin:0">{t('pw_old')}<input type="password" bind:value={oldPw} autocomplete="current-password" required /></label>
    <label class="f" style="margin:0">{t('pw_new')}<input type="password" bind:value={newPw} autocomplete="new-password" required /></label>
    {#if msg}<div class="alert" class:ok>{msg}</div>{/if}
    <button class="btn grad">{t('save')}</button>
  </form>
</div>

{:else}
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
  <form class="card stack" onsubmit={saveProfile}>
    <h3 class="card-title">{st('pf_photo')}</h3>
    <div class="row" style="gap:18px;flex-wrap:wrap">
      <Avatar u={{ ...app.user!, bday: false }} size={96} />
      <div class="stack" style="gap:8px">
        <label class="btn sm" style="cursor:pointer">{app.user?.avatar_v ? st('pf_photo_change') : st('pf_photo_add')}<input type="file" accept="image/*" class="sr" onchange={pickPhoto} disabled={busy} /></label>
        {#if app.user?.avatar_v}<button type="button" class="btn sm" onclick={dropPhoto}>{st('pf_photo_del')}</button>{/if}
        <span class="muted xs">{st('pf_crop')}</span>
      </div>
    </div>
    {#if perr}<div class="alert">{perr}</div>{/if}
    <label class="f" style="margin:0">{st('pf_status')}<input maxlength="80" bind:value={status} placeholder={st('pf_status_ph')} /></label>
    <label class="f" style="margin:0">{st('pf_birthday')}<input type="date" bind:value={birthday} /></label>
    {#if pmsg}<div class="alert ok">{pmsg}</div>{/if}
    <button class="btn grad">{t('save')}</button>
  </form>
</div>
{/if}
