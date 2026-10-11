<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { fmtDate } from '../lib/format';
  import { confirmBox } from '../lib/dialog.svelte';
  import './hr.css';

  const uz = $derived(app.lang === 'uz');
  const L = $derived(uz
    ? { cert: 'Ish joyidan ma’lumotnoma', certHint: 'PDF QR-kod bilan: haqiqiyligini istalgan kishi tekshirishi mumkin.', lang: 'Til', purpose: 'Qayerga (ixtiyoriy)', salary: 'Ish haqini ko‘rsatish', order: 'Ma’lumotnoma olish', issued: 'Olingan ma’lumotnomalar', none: 'Hali yo‘q', dl: 'PDF yuklab olish', revoked: 'Bekor qilingan', leave: 'Ta’tilga ariza', from: 'Boshlanishi', to: 'Tugashi', kind: 'Turi', vac: 'Ta’til', sick: 'Kasallik', note: 'Izoh', send: 'Yuborish', mine: 'Mening arizalarim', pending: 'Ko‘rib chiqilmoqda', approved: 'Tasdiqlangan', rejected: 'Rad etilgan', cancelled: 'Bekor qilingan', cancel: 'Bekor qilish', err: 'Xatolik', overlap: 'Bu sanalarda boshqa ariza yoki ta’til bor', past: 'O‘tgan sanaga ta’til olib bo‘lmaydi', many: 'Bir kunda 5 tadan ortiq ma’lumotnoma olib bo‘lmaydi', cancelQ: 'Arizani bekor qilasizmi?' }
    : { cert: 'Справка с места работы', certHint: 'PDF с QR-кодом: подлинность может проверить любой человек.', lang: 'Язык', purpose: 'Для чего (необязательно)', salary: 'Указать зарплату', order: 'Заказать справку', issued: 'Выданные справки', none: 'Пока нет', dl: 'Скачать PDF', revoked: 'Отозвана', leave: 'Заявка на отпуск', from: 'С', to: 'По', kind: 'Вид', vac: 'Отпуск', sick: 'Больничный', note: 'Комментарий', send: 'Отправить', mine: 'Мои заявки', pending: 'На согласовании', approved: 'Согласовано', rejected: 'Отклонено', cancelled: 'Отменена', cancel: 'Отменить', err: 'Не получилось', overlap: 'На эти даты уже есть заявка или отпуск', past: 'Отпуск нельзя оформить задним числом', many: 'Не больше 5 справок в сутки', cancelQ: 'Отменить заявку?' });

  let certs: any[] = $state([]), reqs: any[] = $state([]), msg = $state(''), ok = $state(false), busy = $state(false);
  let clang = $state<'ru' | 'uz'>('ru'), purpose = $state(''), withSalary = $state(false);
  let from = $state(''), to = $state(''), kind = $state<'vacation' | 'sick'>('vacation'), note = $state('');
  const load = () => { api.get('/api/hr/certificates').then((r) => (certs = r.items)).catch(() => {}); api.get('/api/leaves/mine').then((r) => (reqs = r.items)).catch(() => {}); };
  load();
  $effect(() => { clang = uz ? 'uz' : 'ru'; });

  const fail = (e: any) => { const c = String(e?.message ?? ''); msg = c.includes('overlap') ? L.overlap : c.includes('past') ? L.past : c.includes('too_many') ? L.many : L.err; ok = false; };
  async function order() {
    busy = true; msg = '';
    try {
      const r = await api.post('/api/hr/certificates', { lang: clang, purpose, with_salary: withSalary });
      purpose = ''; load();
      const a = document.createElement('a'); a.href = `/api/hr/certificates/${r.id}/pdf`; a.download = ''; document.body.appendChild(a); a.click(); a.remove();   // сразу скачиваем
    } catch (e) { fail(e); } finally { busy = false; }
  }
  async function request() {
    busy = true; msg = '';
    try { await api.post('/api/leaves/request', { from, to, kind, note }); from = to = note = ''; ok = true; msg = L.pending; load(); } catch (e) { fail(e); } finally { busy = false; }
  }
  async function cancel(r: any) { if (await confirmBox(L.cancelQ)) { await api.post(`/api/leaves/${r.id}/cancel`).catch(() => {}); load(); } }
  const stName = (s: string) => (L as any)[s] ?? s;
</script>

<div class="grid hr-grid">
  <section class="card stack">
    <h3 class="card-title">{L.cert}</h3>
    <p class="muted small">{L.certHint}</p>
    <div class="tabs"><button class:on={clang === 'ru'} onclick={() => (clang = 'ru')}>Русский</button><button class:on={clang === 'uz'} onclick={() => (clang = 'uz')}>O‘zbekcha</button></div>
    <label class="f">{L.purpose}<input bind:value={purpose} maxlength="120" /></label>
    <label class="chk"><input type="checkbox" bind:checked={withSalary} /> {L.salary}</label>
    <button class="btn grad" onclick={order} disabled={busy}>{L.order}</button>
    <h4 class="hr-sub">{L.issued}</h4>
    {#each certs as c (c.id)}
      <div class="hr-row">
        <span>{fmtDate(c.issued_at)}{#if c.purpose} · <span class="muted">{c.purpose}</span>{/if}</span>
        {#if c.revoked}<span class="chip">{L.revoked}</span>{:else}<a class="btn sm" href="/api/hr/certificates/{c.id}/pdf" download>{L.dl}</a>{/if}
      </div>
    {:else}<p class="muted small">{L.none}</p>{/each}
  </section>

  <section class="card stack">
    <h3 class="card-title">{L.leave}</h3>
    <div class="tabs"><button class:on={kind === 'vacation'} onclick={() => (kind = 'vacation')}>{L.vac}</button><button class:on={kind === 'sick'} onclick={() => (kind = 'sick')}>{L.sick}</button></div>
    <div class="row hr-dates"><label class="f">{L.from}<input type="date" bind:value={from} /></label><label class="f">{L.to}<input type="date" bind:value={to} /></label></div>
    <label class="f">{L.note}<input bind:value={note} maxlength="300" /></label>
    {#if msg}<div class="alert" class:ok>{msg}</div>{/if}
    <button class="btn grad" onclick={request} disabled={busy || !from || !to}>{L.send}</button>
    <h4 class="hr-sub">{L.mine}</h4>
    {#each reqs as r (r.id)}
      <div class="hr-row">
        <span>{fmtDate(r.from_date)} — {fmtDate(r.to_date)} · <span class="muted">{r.kind === 'sick' ? L.sick : L.vac}</span></span>
        <span class="hr-st st-{r.status}">{stName(r.status)}</span>
        {#if r.status === 'pending'}<button class="btn sm" onclick={() => cancel(r)}>{L.cancel}</button>{/if}
      </div>
      {#if r.decision_note}<p class="muted xs hr-note">{r.decision_note}</p>{/if}
    {:else}<p class="muted small">{L.none}</p>{/each}
  </section>
</div>
