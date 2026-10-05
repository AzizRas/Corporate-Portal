<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { fmtTime } from '../lib/format';
  import Modal from '../components/Modal.svelte';

  let st: any = $state(null), busy = $state(false), msg = $state(''), msgKind = $state<'ok' | 'bad'>('ok');
  let needReason = $state(false), reason = $state(''), qr = $state('');
  let consentFor: 'geo' | 'selfie' | null = $state(null);
  let cam: HTMLVideoElement | null = $state(null), stream: MediaStream | null = null, photo = '';
  let camOpen = $state(false), pending: Record<string, unknown> | null = null;

  const load = () => api.get('/api/attendance/state').then((r) => (st = r));
  load();
  const methodLabel = (m: string) => ({ geo: t('att_geo'), qr: t('att_qr'), selfie: t('att_selfie'), wifi: t('att_wifi') } as any)[m] ?? m;

  const getPos = () => new Promise<{ lat: number; lng: number }>((res, rej) =>
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }));

  async function ensureConsent(): Promise<boolean> {
    for (const k of ['geo', 'selfie'] as const) {
      if (st.methods[k] && !st.consents.includes(k)) { consentFor = k; return false; }
    }
    return true;
  }
  async function giveConsent() {
    await api.post('/api/me/consent', { kind: consentFor });
    st.consents = [...st.consents, consentFor]; consentFor = null; mark();
  }

  async function mark(extra: Record<string, unknown> = {}) {
    if (!(await ensureConsent())) return;
    busy = true; msg = '';
    try {
      const body: Record<string, unknown> = { ...extra };
      if (st.methods.geo && !('lat' in body)) { try { Object.assign(body, await getPos()); } catch { /* причина запросится ниже */ } }
      if (st.methods.qr && qr) body.qr = qr;
      if (st.methods.selfie && !body.photo) {
        pending = body; await openCamera(); busy = false; return;
      }
      await send(body);
    } finally { busy = false; }
  }
  async function send(body: Record<string, unknown>) {
    busy = true;
    try {
      const r = await api.post('/api/attendance/mark', body);
      msg = r.mark.status === 'pending' ? t('att_pending') : r.mark.kind === 'in' ? t('att_ok_in') : t('att_ok_out'); msgKind = 'ok';
      needReason = false; reason = ''; await load();
    } catch (e) {
      if (e instanceof ApiError && e.body?.need_reason) { needReason = true; pending = body; msg = t('att_reason_need'); msgKind = 'bad'; }
      else { msg = t('error'); msgKind = 'bad'; }
    } finally { busy = false; }
  }
  async function manual(e: Event) { e.preventDefault(); await send({ ...(pending ?? {}), reason }); }

  async function openCamera() {
    camOpen = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      await Promise.resolve();
      setTimeout(() => { if (cam) { cam.srcObject = stream; cam.play(); } }, 30);
    } catch { camOpen = false; msg = t('att_camera_err'); msgKind = 'bad'; needReason = true; }
  }
  function closeCamera() { stream?.getTracks().forEach((x) => x.stop()); stream = null; camOpen = false; }
  async function snap() {
    if (!cam) return;
    const c = document.createElement('canvas'); const w = 480; c.width = w; c.height = Math.round((cam.videoHeight / cam.videoWidth) * w) || 360;
    c.getContext('2d')!.drawImage(cam, 0, 0, c.width, c.height);
    const data = c.toDataURL('image/jpeg', 0.7); closeCamera();
    await send({ ...(pending ?? {}), photo: data });
  }
</script>

<header class="page-head"><div><h1>{t('att_title')}</h1><p class="sub">{t('att_time_server')}</p></div></header>

{#if !st}<span class="spin"></span>{:else}
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <section class="card hl">
      <div class="stack">
        <button class="btn grad block" style="padding:34px;font-size:26px;border-radius:28px" disabled={busy} onclick={() => mark()}>
          {busy ? '…' : st.next === 'in' ? t('att_in') : t('att_out')}
        </button>
        {#if st.methods.qr}<input placeholder={t('att_qr_ph')} bind:value={qr} autocomplete="off" />{/if}
        <div class="row wrap">{#each Object.entries(st.methods).filter(([, v]) => v) as [k]}<span class="chip">{methodLabel(k)}</span>{/each}</div>
        {#if msg}<div class="alert" class:ok={msgKind === 'ok'}>{msg}</div>{/if}
        {#if needReason}
          <form class="stack" onsubmit={manual}>
            <textarea placeholder={t('att_reason')} bind:value={reason} required></textarea>
            <button class="btn">{t('att_send_manual')}</button>
          </form>
        {/if}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>{t('att_today')}</h3></div>
      <div class="list">
        {#each st.today as m}
          <div><span>{m.kind === 'in' ? t('att_in') : t('att_out')}
            {#if m.late_min}<span class="pill-warn small"> · {t('att_late')} {m.late_min} {t('att_min')}</span>{/if}
            {#if m.status === 'pending'}<span class="pill-warn small"> · {t('att_pending')}</span>{/if}</span><b>{fmtTime(m.at)}</b></div>
        {:else}<p class="muted">{t('att_no_marks')}</p>{/each}
      </div>
    </section>
  </div>
{/if}

{#if consentFor}
  <Modal onclose={() => (consentFor = null)}>
    <h2>{consentFor === 'geo' ? t('att_geo') : t('att_selfie')}</h2>
    <p class="muted">{consentFor === 'geo' ? t('att_consent_geo') : t('att_consent_selfie', { n: st.photo_days })}</p>
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" onclick={() => (consentFor = null)}>{t('cancel')}</button><button class="btn grad" onclick={giveConsent}>{t('consent_btn')}</button></div>
  </Modal>
{/if}
{#if camOpen}
  <Modal onclose={closeCamera}>
    <video bind:this={cam} playsinline muted style="width:100%;border-radius:18px;background:#000;transform:scaleX(-1)"></video>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" onclick={closeCamera}>{t('cancel')}</button><button class="btn grad" onclick={snap}>{t('att_take')}</button></div>
  </Modal>
{/if}
