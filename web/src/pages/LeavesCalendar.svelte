<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { fmtDate, monthLong } from '../lib/format';
  import './hr.css';

  const uz = $derived(app.lang === 'uz');
  const L = $derived(uz
    ? { title: 'Ta’tillar kalendari', vac: 'Tasdiqlangan ta’til', sick: 'Kasallik', pending: 'Tasdiq kutilmoqda', conflicts: 'Bir lavozimdagi ta’tillar kesishadi', requests: 'Tasdiqlash uchun arizalar', approve: 'Tasdiqlash', reject: 'Rad etish', reason: 'Sabab (ixtiyoriy)', none: 'Arizalar yo‘q', empty: 'Ma’lumot yo‘q', prev: 'Oldingi oy', next: 'Keyingi oy', who: 'Xodim' }
    : { title: 'Календарь отпусков', vac: 'Утверждённый отпуск', sick: 'Больничный', pending: 'Ждёт согласования', conflicts: 'Пересекаются отпуска на одной должности', requests: 'Заявки на согласование', approve: 'Согласовать', reject: 'Отклонить', reason: 'Причина (необязательно)', none: 'Заявок нет', empty: 'Нет данных', prev: 'Предыдущий месяц', next: 'Следующий месяц', who: 'Сотрудник' });

  const pad = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  let ym = $state(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`);
  let data: any = $state(null), fail = $state(false), reason = $state(''), busy = $state(false);

  const days = $derived.by(() => { const [y, m] = ym.split('-').map(Number); return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${ym}-${pad(i + 1)}`); });
  async function load() {
    fail = false;
    try { data = await api.get(`/api/leaves/calendar?from=${days[0]}&to=${days.at(-1)}`); } catch { fail = true; }
  }
  $effect(() => { ym; load(); });
  function shift(d: number) { const [y, m] = ym.split('-').map(Number), n = new Date(y, m - 1 + d, 1); ym = `${n.getFullYear()}-${pad(n.getMonth() + 1)}`; }

  const nameOf = (id: number) => data?.people.find((p: any) => p.id === id)?.name ?? '';
  const cell = (uid: number, day: string) => data?.items.find((i: any) => i.user_id === uid && i.from_date <= day && day <= i.to_date);
  const inConflict = (uid: number, day: string) => data?.conflicts.some((c: any) => c.users.includes(uid) && c.from <= day && day <= c.to);
  const pendingList = $derived((data?.items ?? []).filter((i: any) => i.status === 'pending'));
  const wk = (day: string) => { const d = new Date(day).getDay(); return d === 0 || d === 6; };
  async function decide(it: any, approve: boolean) {
    busy = true;
    try { await api.post(`/api/leaves/${String(it.id).slice(1)}/decide`, { approve, note: reason }); reason = ''; await load(); } finally { busy = false; }
  }
</script>

<header class="page-head"><div><h1>{L.title}</h1></div></header>

<section class="card stack">
  <div class="row hr-mon">
    <button class="btn sm" onclick={() => shift(-1)} aria-label={L.prev}>←</button>
    <b>{monthLong(ym)}</b>
    <button class="btn sm" onclick={() => shift(1)} aria-label={L.next}>→</button>
    <span class="hr-legend"><i class="lg vac"></i>{L.vac}<i class="lg sick"></i>{L.sick}<i class="lg pending"></i>{L.pending}</span>
  </div>

  {#if data?.conflicts?.length}
    <div class="alert">{L.conflicts}: {#each data.conflicts as c, i}{i ? '; ' : ''}{c.users.map(nameOf).join(' и ')} ({fmtDate(c.from)} — {fmtDate(c.to)}){/each}</div>
  {/if}

  {#if fail}<p class="muted">{L.empty}</p>
  {:else if data}
    <div class="hr-gantt" style:--n={days.length}>
      <div class="hr-g head"><span class="nm">{L.who}</span>{#each days as d}<span class="dy" class:we={wk(d)}>{Number(d.slice(8))}</span>{/each}</div>
      {#each data.people as p (p.id)}
        <div class="hr-g">
          <span class="nm" title={p.position}>{p.name}</span>
          {#each days as d}{@const c = cell(p.id, d)}<span class="dy" class:we={wk(d)} class:vac={c?.status === 'approved' && c.kind === 'vacation'} class:sick={c?.kind === 'sick'} class:pending={c?.status === 'pending'} class:clash={c && inConflict(p.id, d)} title={c ? `${c.kind === 'sick' ? L.sick : L.vac}` : ''}></span>{/each}
        </div>
      {:else}<p class="muted">{L.empty}</p>{/each}
    </div>
  {/if}
</section>

<section class="card stack">
  <h3 class="card-title">{L.requests}</h3>
  {#each pendingList as it (it.id)}
    <div class="hr-row">
      <span><b>{nameOf(it.user_id)}</b> · {fmtDate(it.from_date)} — {fmtDate(it.to_date)} <span class="muted">{it.note}</span></span>
      <button class="btn sm grad" disabled={busy} onclick={() => decide(it, true)}>{L.approve}</button>
      <button class="btn sm" disabled={busy} onclick={() => decide(it, false)}>{L.reject}</button>
    </div>
  {:else}<p class="muted small">{L.none}</p>{/each}
  {#if pendingList.length}<label class="f">{L.reason}<input bind:value={reason} maxlength="300" /></label>{/if}
</section>
