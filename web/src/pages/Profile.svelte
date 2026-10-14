<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { api, ApiError } from '../lib/api';
  import { app, setLang, setTheme, logout, loadMe, go } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { st } from '../lib/s18n';
  import Avatar from '../components/Avatar.svelte';
  import { wt, roleLabel } from '../lib/w18n';
  import { setDensity, pickDensity, type Density } from '../lib/density';
  import WellnessSettings from '../wellness/WellnessSettings.svelte';
  import Payroll from './Payroll.svelte';
  import NotifyPrefs from '../components/NotifyPrefs.svelte';
  import Segmented from '../components/Segmented.svelte';
  import TwoFactor from '../components/TwoFactor.svelte';
  import TelegramLink from '../components/TelegramLink.svelte';
  import { restartTour } from '../lib/tour.svelte';

  // tab: «me» (#/profile — фото и статус), «settings» (#/profile/settings) и «pay» (#/pay — «Зарплата и KPI» в разделе «Моя работа»); документы и отпуск переехали в «Заявки» (#/requests)
  let { tab = 'me' }: { tab?: string } = $props();

  let oldPw = $state(''), newPw = $state(''), newPw2 = $state(''), msg = $state(''), ok = $state(false);
  async function change(e: Event) {
    e.preventDefault(); msg = '';
    if (newPw.length < 8) { msg = t('pw_weak'); ok = false; return; }
    if (newPw !== newPw2) { msg = app.lang === 'uz' ? 'Parollar mos kelmadi' : 'Пароли не совпадают'; ok = false; return; }
    try { await api.patch('/api/me', { password: newPw, old_password: oldPw }); msg = t('pw_ok'); ok = true; oldPw = newPw = newPw2 = ''; }
    catch (x) { msg = x instanceof ApiError && x.code === 'bad_old' ? t('login_bad') : t('error'); ok = false; }
  }
  let dens: Density = $state(pickDensity((() => { try { return localStorage.getItem('density'); } catch { return null; } })(), app.user?.roles ?? []));
  const chooseDens = (d: Density) => { dens = d; setDensity(d, app.user?.roles ?? []); };
  let loMsg = $state('');
  async function logoutOthers() { loMsg = ''; try { const r = await api.post('/api/me/logout-others'); loMsg = wt('lo_done', { n: r.closed }); } catch { loMsg = t('error'); } }
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
</script>

{#if tab !== 'pay'}
  <header class="page-head"><div><h1>{t('profile_title')}<PageHelp topic="profile_photo" /></h1><p class="sub">{app.user?.name} · {app.user?.position}</p></div></header>
  <!-- «Профиль» и «Настройки» — две страницы одной карточки внизу колонки; это переключатель, а не ряд вкладок раздела -->
  <div class="mb-4"><Segmented label={wt('ut_profile_settings')} value={tab === 'settings' ? 'settings' : 'me'} options={[{ id: 'me', label: wt('i2_profile') }, { id: 'settings', label: wt('i2_settings') }]} onchange={(id) => go(id === 'settings' ? '/profile/settings' : '/profile')} /></div>
{/if}
{#if tab === 'pay'}<Payroll />
{:else if tab === 'settings'}
<div class="grid u-0e12b30">
  <section class="card stack">
    <div><div class="muted small">{t('profile_lang')}</div>
      <div class="tabs u-c94d43e"><button class:on={app.lang === 'ru'} onclick={() => setLang('ru')}>Русский</button><button class:on={app.lang === 'uz'} onclick={() => setLang('uz')}>O‘zbekcha</button></div></div>
    <div><div class="muted small">{t('profile_theme')}</div>
      <div class="tabs u-c94d43e">
        {#each [['system', 'theme_system'], ['light', 'theme_light'], ['dark', 'theme_dark']] as [v, k]}
          <button class:on={app.theme === v} onclick={() => setTheme(v as any)}>{t(k as any)}</button>
        {/each}</div></div>
    <div><div class="muted small">{wt('dn_title')}</div><div class="tabs u-c94d43e">{#each ['normal', 'compact'] as d}<button class:on={dens === d} onclick={() => chooseDens(d as Density)}>{wt(d === 'normal' ? 'dn_normal' : 'dn_compact')}</button>{/each}</div><p class="muted xs u-fe7b497">{wt('dn_hint')}</p></div>
    <div class="row wrap u-33fcd4c"><button class="btn danger" onclick={logout}>{t('nav_logout')}</button><button class="btn" onclick={logoutOthers}>{wt('lo_others')}</button></div>
    <p class="muted xs">{loMsg || wt('lo_others_hint')}</p>
  </section>
  <section class="card stack"><h3 class="card-title">{wt('tr_restart')}</h3><p class="muted small">{wt('tr_restart_hint')}</p><button class="btn grad u-c9adc42" onclick={restartTour}>{wt('tr_restart')}</button></section>
  <NotifyPrefs />
  <TwoFactor />
  <TelegramLink />
  <section class="card stack"><h3 class="card-title">{st('pf_wellness')}</h3><WellnessSettings /></section>
  <form class="card stack" onsubmit={change}>
    <h3 class="card-title">{t('profile_pw')}</h3>
    <label class="f u-1169661">{t('pw_old')}<input type="password" bind:value={oldPw} autocomplete="current-password" required /></label>
    <label class="f u-1169661">{t('pw_new')}<input type="password" bind:value={newPw} autocomplete="new-password" required /></label>
    <label class="f u-1169661">{app.lang === 'uz' ? 'Parolni takrorlang' : 'Повторите пароль'}<input type="password" bind:value={newPw2} autocomplete="new-password" required /></label>
    {#if msg}<div class="alert" class:ok>{msg}</div>{/if}
    <button class="btn grad">{t('save')}</button>
  </form>
</div>

{:else}
<div class="grid u-0e12b30">
  <form class="card stack" onsubmit={saveProfile}>
    <h3 class="card-title">{st('pf_photo')}</h3>
    <div class="row u-3c1a400">
      <Avatar u={{ ...app.user!, bday: false }} size={96} />
      <div class="stack u-33fcd4c">
        <label class="btn sm u-3b6a3a6">{app.user?.avatar_v ? st('pf_photo_change') : st('pf_photo_add')}<input type="file" accept="image/*" class="sr" onchange={pickPhoto} disabled={busy} /></label>
        {#if app.user?.avatar_v}<button type="button" class="btn sm" onclick={dropPhoto}>{st('pf_photo_del')}</button>{/if}
        <span class="muted xs">{st('pf_crop')}</span>
      </div>
    </div>
    {#if perr}<div class="alert">{perr}</div>{/if}
    <label class="f u-1169661">{st('pf_status')}<input maxlength="80" bind:value={status} placeholder={st('pf_status_ph')} /></label>
    <label class="f u-1169661">{st('pf_birthday')}<input type="date" bind:value={birthday} /></label>
    <!-- роли словами (E6): блок переехал сюда из «Настроек» -->
    <div><div class="muted small">{t('role')}</div><div class="row wrap u-8a77e5a">{#each app.user?.roles ?? [] as r}<span class="chip">{roleLabel(r)}</span>{/each}</div></div>
    {#if pmsg}<div class="alert ok">{pmsg}</div>{/if}
    <button class="btn grad">{t('save')}</button>
  </form>
</div>
{/if}
