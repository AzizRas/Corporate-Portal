<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import Modal from '../components/Modal.svelte';

  let { pipelineId, onclose, ondone }: { pipelineId: number; onclose: () => void; ondone?: () => void } = $props();
  const uz = $derived(app.lang === 'uz');
  const L = $derived(uz
    ? { title: 'Xodimni rasmiylashtirish', name: 'F.I.Sh.', phone: 'Telefon', position: 'Lavozim', code: 'Lavozim kodi', node: 'Tuzilmadagi bo‘linma', type: 'Turi', intern: 'Stajyor', staff: 'Shtat', start: 'Ishga chiqish', prob: 'Sinov muddati tugashi', noProb: 'sinov muddatisiz', salary: 'Maosh (so‘m)', login: 'Login', lang: 'Til', mentor: 'Murabbiy', course: 'Moslashuv kursi', none: '—', go: 'Rasmiylashtirish', cancel: 'Bekor qilish', done: 'Xodim yaratildi', once: 'Parol faqat bir marta ko‘rsatiladi. Xodimga bering yoki chop eting.', url: 'Portal manzili', pass: 'Vaqtinchalik parol', print: 'Chop etish', copy: 'Nusxalash', close: 'Yopish', already: 'Bu nomzod allaqachon rasmiylashtirilgan', taken: 'Bu login band', invalid: 'Maydonlarni tekshiring', err: 'Xatolik', open: 'Kartochkani ochish' }
    : { title: 'Оформить сотрудника', name: 'ФИО', phone: 'Телефон', position: 'Должность', code: 'Код должности', node: 'Подразделение в структуре', type: 'Тип', intern: 'Стажёр', staff: 'Штат', start: 'Дата выхода', prob: 'Конец испытательного срока', noProb: 'без испытательного срока', salary: 'Оклад (сум)', login: 'Логин', lang: 'Язык', mentor: 'Наставник', course: 'Курс адаптации', none: '—', go: 'Оформить', cancel: 'Отмена', done: 'Сотрудник создан', once: 'Пароль показывается один раз. Передайте его сотруднику или распечатайте карточку.', url: 'Адрес портала', pass: 'Временный пароль', print: 'Печать', copy: 'Копировать', close: 'Закрыть', already: 'Этот кандидат уже оформлен', taken: 'Такой логин уже занят', invalid: 'Проверьте поля', err: 'Не получилось', open: 'Открыть карточку' });

  let meta: any = $state(null), f: any = $state(null), busy = $state(false), msg = $state(''), res: any = $state(null), noProb = $state(false);
  $effect(() => {
    api.get(`/api/hire/pipeline/${pipelineId}/onboard`).then((r) => { meta = r; f = { ...r.prefill, mentor_id: '' }; }).catch(() => (msg = L.err));
  });
  async function submit(e: Event) {
    e.preventDefault(); busy = true; msg = '';
    try {
      res = await api.post(`/api/hire/pipeline/${pipelineId}/onboard`, { ...f, probation_end: noProb ? null : f.probation_end, salary: f.salary === '' ? null : f.salary, node_id: Number(f.node_id), mentor_id: f.mentor_id || null, course_id: f.course_id || null });
      ondone?.();
    } catch (x) { msg = x instanceof ApiError ? ({ already: L.already, login_taken: L.taken, invalid: L.invalid } as any)[x.code] ?? L.err : L.err; } finally { busy = false; }
  }
  async function copy() { try { await navigator.clipboard.writeText(`${res.name}\n${L.url}: ${res.url}\n${L.login}: ${res.login}\n${L.pass}: ${res.password}`); } catch { /* буфер недоступен */ } }
</script>

<Modal {onclose} wide>
  {#if res}
    <div class="stack ob-card">
      <h2>{L.done}</h2>
      <p class="muted small">{L.once}</p>
      <div class="ob-access">
        <img src={res.qr} alt="QR" width="160" height="160" />
        <div class="stack">
          <div><span class="muted xs">{L.name}</span><br /><b>{res.name}</b></div>
          <div><span class="muted xs">{L.url}</span><br /><b>{res.url}</b></div>
          <div><span class="muted xs">{L.login}</span><br /><b class="ob-mono">{res.login}</b></div>
          <div><span class="muted xs">{L.pass}</span><br /><b class="ob-mono">{res.password}</b></div>
        </div>
      </div>
      <div class="row wrap"><button class="btn" onclick={() => window.print()}>{L.print}</button><button class="btn" onclick={copy}>{L.copy}</button><a class="btn" href="#/team/{res.user_id}">{L.open}</a><button class="btn grad" onclick={onclose}>{L.close}</button></div>
    </div>
  {:else if meta?.done}
    <p>{L.already}</p><a class="btn" href="#/team/{meta.done.user_id}">{L.open}</a>
  {:else if f}
    <form class="stack" onsubmit={submit}>
      <h2>{L.title}</h2>
      <div class="grid ob-grid">
        <label class="f">{L.name}<input bind:value={f.name} required /></label>
        <label class="f">{L.phone}<input bind:value={f.phone} /></label>
        <label class="f">{L.position}<input bind:value={f.position} required /></label>
        <label class="f">{L.code}<select bind:value={f.position_code}>{#each meta.positions as p}<option value={p.code}>{uz ? p.uz : p.ru}</option>{/each}</select></label>
        <label class="f">{L.node}<select bind:value={f.node_id} required><option value="">{L.none}</option>{#each meta.nodes as n}<option value={n.id}>{n.name}</option>{/each}</select></label>
        <label class="f">{L.type}<select bind:value={f.employment}><option value="intern">{L.intern}</option><option value="staff">{L.staff}</option></select></label>
        <label class="f">{L.start}<input type="date" bind:value={f.start_date} required /></label>
        <label class="f">{L.prob}<input type="date" bind:value={f.probation_end} disabled={noProb} /></label>
        <label class="f">{L.salary}<input type="number" min="0" step="1000" bind:value={f.salary} /></label>
        <label class="f">{L.login}<input bind:value={f.login} required pattern="[a-z0-9_.\-]{'{'}3,32{'}'}" /></label>
        <label class="f">{L.lang}<select bind:value={f.lang}><option value="ru">Русский</option><option value="uz">O‘zbekcha</option></select></label>
        <label class="f">{L.mentor}<select bind:value={f.mentor_id}><option value="">{L.none}</option>{#each meta.mentors as m}<option value={m.id}>{m.name}</option>{/each}</select></label>
        <label class="f">{L.course}<select bind:value={f.course_id}><option value="">{L.none}</option>{#each meta.courses as c}<option value={c.id}>{uz ? c.title_uz || c.title_ru : c.title_ru}</option>{/each}</select></label>
      </div>
      <label class="chk"><input type="checkbox" bind:checked={noProb} /> {L.noProb}</label>
      {#if msg}<div class="alert">{msg}</div>{/if}
      <div class="row"><button type="button" class="btn" onclick={onclose}>{L.cancel}</button><button class="btn grad" disabled={busy || !f.node_id}>{L.go}</button></div>
    </form>
  {:else if msg}<div class="alert">{msg}</div>{:else}<span class="spin"></span>{/if}
</Modal>

<style>
  .ob-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .ob-access { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; padding: 14px; border: 1px dashed var(--border); border-radius: 14px; }
  .ob-access img { background: #fff; border-radius: 10px; padding: 6px; }
  .ob-mono { font-family: ui-monospace, monospace; font-size: 18px; letter-spacing: .04em; }
</style>
