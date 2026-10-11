<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app, loadMe } from '../lib/state.svelte';
  import './twofactor.css';

  let { forced = false }: { forced?: boolean } = $props();
  const uz = $derived(app.lang === 'uz');
  const L = $derived(uz
    ? { title: 'Ikki bosqichli himoya (2FA)', on: 'Yoqilgan', off: 'O‘chirilgan', hint: 'Kirishda paroldan tashqari Google Authenticator, Authy yoki 1Password ilovasidagi 6 xonali kod so‘raladi.', forcedHint: 'Administrator va buxgalteriya uchun ikki bosqichli himoya majburiy. Davom etish uchun uni yoqing.', enable: 'Yoqish', pw: 'Joriy parol', scan: 'QR-kodni ilovada skanerlang yoki kalitni qo‘lda kiriting:', code: 'Ilovadagi 6 xonali kod', confirm: 'Tasdiqlash', recTitle: 'Zaxira kodlar', recHint: 'Telefon yo‘qolsa, kirish uchun ishlating. Har biri bir marta ishlaydi. Hozir saqlab qo‘ying — keyin ko‘rsatilmaydi.', done: 'Saqlab qo‘ydim', disable: 'O‘chirish', required: 'Sizning rolingiz uchun o‘chirib bo‘lmaydi', bad: 'Kod yoki parol noto‘g‘ri', fail: 'Xatolik', cancel: 'Bekor qilish', copy: 'Nusxalash' }
    : { title: 'Двухфакторная защита (2FA)', on: 'Включена', off: 'Выключена', hint: 'При входе, кроме пароля, спрашивается 6-значный код из приложения Google Authenticator, Authy или 1Password.', forcedHint: 'Для администратора и бухгалтерии двухфакторная защита обязательна. Включите её, чтобы продолжить.', enable: 'Включить', pw: 'Текущий пароль', scan: 'Отсканируйте QR-код в приложении или введите ключ вручную:', code: '6-значный код из приложения', confirm: 'Подтвердить', recTitle: 'Резервные коды', recHint: 'Если потеряете телефон, войдёте по одному из них. Каждый работает один раз. Сохраните сейчас — позже они не показываются.', done: 'Я сохранил(а)', disable: 'Отключить', required: 'Для вашей роли отключить нельзя', bad: 'Неверный код или пароль', fail: 'Не получилось', cancel: 'Отмена', copy: 'Копировать' });

  let step = $state<'idle' | 'password' | 'scan' | 'codes' | 'disable'>('idle');
  let pw = $state(''), code = $state(''), setup: { secret: string; qr: string } | null = $state(null), codes: string[] = $state([]), msg = $state(''), busy = $state(false);
  const enabled = $derived(!!app.user?.totp_enabled);
  const required = $derived(!!app.user?.must_setup_2fa || (app.user?.roles ?? []).some((r) => r === 'admin' || r === 'accountant'));

  const fail = (e: unknown) => { msg = e instanceof ApiError && (e.code === 'bad_code' || e.code === 'bad_old') ? L.bad : e instanceof ApiError && e.code === 'required' ? L.required : L.fail; };
  async function start() {
    busy = true; msg = '';
    try { const r = await api.post('/api/me/2fa/setup', { password: pw }); setup = r; step = 'scan'; code = ''; } catch (e) { fail(e); } finally { busy = false; }
  }
  async function verifyCode() {
    busy = true; msg = '';
    try { const r = await api.post('/api/me/2fa/enable', { code }); codes = r.recovery_codes; step = 'codes'; pw = code = ''; } catch (e) { fail(e); } finally { busy = false; }
  }
  async function finish() { step = 'idle'; codes = []; setup = null; await loadMe(); }
  async function disable() {
    busy = true; msg = '';
    try { await api.post('/api/me/2fa/disable', { password: pw, code }); pw = code = ''; step = 'idle'; await loadMe(); } catch (e) { fail(e); } finally { busy = false; }
  }
  async function copy() { try { await navigator.clipboard.writeText(codes.join('\n')); } catch { /* буфер недоступен */ } }
</script>

<section class="card stack tf">
  <div class="row tf-head"><h3 class="card-title">{L.title}</h3><span class="chip" class:tf-on={enabled}>{enabled ? L.on : L.off}</span></div>
  <p class="muted small">{forced ? L.forcedHint : L.hint}</p>

  {#if step === 'idle'}
    {#if !enabled}<button class="btn grad" onclick={() => { step = 'password'; msg = ''; }}>{L.enable}</button>
    {:else if !required}<button class="btn" onclick={() => { step = 'disable'; msg = ''; }}>{L.disable}</button>
    {:else}<p class="muted xs">{L.required}</p>{/if}
  {:else if step === 'password'}
    <label class="f">{L.pw}<input type="password" bind:value={pw} autocomplete="current-password" /></label>
    {#if msg}<div class="alert">{msg}</div>{/if}
    <div class="row"><button class="btn grad" onclick={start} disabled={busy || !pw}>{L.enable}</button><button class="btn" onclick={() => (step = 'idle')}>{L.cancel}</button></div>
  {:else if step === 'scan' && setup}
    <p class="small">{L.scan}</p>
    <img class="tf-qr" src={setup.qr} alt="QR" width="220" height="220" />
    <code class="tf-key">{setup.secret}</code>
    <label class="f">{L.code}<input bind:value={code} inputmode="numeric" autocomplete="one-time-code" maxlength="6" /></label>
    {#if msg}<div class="alert">{msg}</div>{/if}
    <button class="btn grad" onclick={verifyCode} disabled={busy || code.length !== 6}>{L.confirm}</button>
  {:else if step === 'codes'}
    <h4>{L.recTitle}</h4>
    <p class="muted small">{L.recHint}</p>
    <div class="tf-codes">{#each codes as c}<code>{c}</code>{/each}</div>
    <div class="row"><button class="btn" onclick={copy}>{L.copy}</button><button class="btn grad" onclick={finish}>{L.done}</button></div>
  {:else if step === 'disable'}
    <label class="f">{L.pw}<input type="password" bind:value={pw} autocomplete="current-password" /></label>
    <label class="f">{L.code}<input bind:value={code} autocomplete="one-time-code" maxlength="10" /></label>
    {#if msg}<div class="alert">{msg}</div>{/if}
    <div class="row"><button class="btn danger" onclick={disable} disabled={busy || !pw || !code}>{L.disable}</button><button class="btn" onclick={() => (step = 'idle')}>{L.cancel}</button></div>
  {/if}
</section>
