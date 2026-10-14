<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { fmtDate } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import { promptBox } from '../lib/dialog.svelte';
  import './hr.css';
  import ReviewAdmin from './ReviewAdmin.svelte';

  const uz = $derived(app.lang === 'uz');
  const L = $derived(uz
    ? { title: 'Kadrlar', prob: 'Sinov muddati', an: 'Tahlil', exit: 'Chiqish suhbati', left: 'kun qoldi', over: 'muddati o‘tgan', pass: 'O‘tdi', ext: 'Uzaytirish', fail: 'O‘tmadi', none: 'Sinov muddatidagi xodimlar yo‘q', active: 'jarayonda', passed: 'o‘tdi', failed: 'o‘tmadi', extended: 'uzaytirildi', newEnd: 'Yangi tugash sanasi (YYYY-MM-DD)', head: 'Xodimlar soni', turn: 'Kadrlar almashinuvi (12 oy)', tth: 'Vakansiyani yopish (o‘rtacha kun)', units: 'Bo‘linmalar', flow: 'Qabul / bo‘shatish', src: 'Nomzod manbalari', why: 'Ketish sabablari', probS: 'Sinov muddati', who: 'Xodim', reason: 'Asosiy sabab', q1: 'Ishda nima yoqardi?', q2: 'Nima ketishga sabab bo‘ldi?', q3: 'Nimani o‘zgartirish kerak?', q4: 'Qaytishni xohlaysizmi?', save: 'Saqlash', saved: 'Saqlandi' }
    : { title: 'Кадры', prob: 'Испытательный срок', an: 'Аналитика', exit: 'Выходное интервью', left: 'дн. осталось', over: 'срок прошёл', pass: 'Прошёл', ext: 'Продлить', fail: 'Не прошёл', none: 'Сотрудников на испытательном сроке нет', active: 'идёт', passed: 'пройден', failed: 'не пройден', extended: 'продлён', newEnd: 'Новая дата окончания (ГГГГ-ММ-ДД)', head: 'Численность', turn: 'Текучесть (12 мес.)', tth: 'Закрытие вакансии (в среднем, дн.)', units: 'Подразделения', flow: 'Приём / увольнения', src: 'Источники кандидатов', why: 'Причины ухода', probS: 'Испытательный срок', who: 'Сотрудник', reason: 'Главная причина', q1: 'Что нравилось в работе?', q2: 'Что стало причиной ухода?', q3: 'Что стоит изменить?', q4: 'Хотели бы вернуться?', save: 'Сохранить', saved: 'Сохранено' });
  // tab задаёт страницу адресом (/admin/onboarding → prob, /admin/analytics → an, /admin/offboarding → exit); вкладки режима «Управление» рисует HubTabs, своего ряда у страницы нет
  let { tab: tabProp = undefined }: { tab?: 'prob' | 'an' | 'exit' | 'rev' } = $props();
  const tab = $derived<'prob' | 'an' | 'exit' | 'rev'>(tabProp ?? 'prob');
  let probs: any[] | null = $state(null), an: any = $state(null), msg = $state('');
  const loadProbs = () => api.get('/api/hr/probations').then((r) => (probs = r.items)).catch(() => (probs = []));
  $effect(() => { if (tab === 'prob') loadProbs(); if (tab === 'an' && !an) api.get('/api/hr/analytics').then((r) => (an = r)).catch(() => {}); if (tab === 'exit' && !archive) api.get('/api/org/archive').then((r) => (archive = r.people ?? [])).catch(() => (archive = [])); });
  async function decide(p: any, status: string) {
    let ends_on: string | undefined;
    if (status === 'extended') { const v = await promptBox(L.newEnd, { value: p.ends_on }); if (!v) return; ends_on = v; }
    try { await api.post(`/api/hr/probations/${p.user_id}/decide`, { status, ends_on }); await loadProbs(); } catch (e) { msg = e instanceof ApiError ? e.code : 'error'; }
  }
  let archive: any[] | null = $state(null), ex = $state({ uid: '', reason: '', q1: '', q2: '', q3: '', q4: '' });
  async function saveExit() {
    msg = '';
    try { await api.post(`/api/hr/exit-interview/${ex.uid}`, { reason: ex.reason, answers: { q1: ex.q1, q2: ex.q2, q3: ex.q3, q4: ex.q4 } }); msg = L.saved; ex = { uid: '', reason: '', q1: '', q2: '', q3: '', q4: '' }; }
    catch { msg = 'error'; }
  }
  const max = (a: any[], k: string) => Math.max(1, ...a.map((x) => x[k] ?? 0));
</script>

<header class="page-head"><div><h1>{tab === 'rev' ? (uz ? '360° baholash' : 'Оценка 360°') : L[tab]}</h1></div></header>

{#if msg}<div class="alert">{msg}</div>{/if}
{#if tab === 'rev'}<ReviewAdmin />
{:else if tab === 'prob'}
  <section class="card stack">
    {#if !probs}<Skeleton rows={4} />
    {:else if !probs.length}<EmptyState title={L.none} />
    {:else}{#each probs as p (p.user_id)}
      <div class="hr-row">
        <span class="row"><Avatar u={{ id: p.user_id, name: p.name, avatar_v: p.avatar_v }} size={34} /><span><a href="#/team/{p.user_id}"><b>{p.name}</b></a><br /><span class="muted xs">{p.position} · {fmtDate(p.starts_on)} — {fmtDate(p.ends_on)}</span></span></span>
        <span class="hr-st st-{p.status === 'passed' ? 'approved' : p.status === 'failed' ? 'rejected' : 'pending'}">{(L as any)[p.status]}{#if p.status === 'active' || p.status === 'extended'} · {p.days_left >= 0 ? `${p.days_left} ${L.left}` : L.over}{/if}</span>
        {#if p.status === 'active' || p.status === 'extended'}
          <button class="btn sm grad" onclick={() => decide(p, 'passed')}>{L.pass}</button>
          <button class="btn sm" onclick={() => decide(p, 'extended')}>{L.ext}</button>
          <button class="btn sm danger" onclick={() => decide(p, 'failed')}>{L.fail}</button>
        {/if}
      </div>
    {/each}{/if}
  </section>
{:else if tab === 'an'}
  {#if !an}<Skeleton rows={6} />{:else}
    <div class="grid hr-grid">
      <section class="card"><div class="muted small">{L.head}</div><div class="big-num">{an.headcount}</div></section>
      <section class="card"><div class="muted small">{L.turn}</div><div class="big-num">{an.turnover_pct}%</div></section>
      <section class="card"><div class="muted small">{L.tth}</div><div class="big-num">{an.time_to_hire_days ?? '—'}</div></section>
      <section class="card"><div class="muted small">{L.probS}</div><div class="small">✓ {an.probation.passed} · ✕ {an.probation.failed} · … {an.probation.active}</div></section>
    </div>
    <div class="grid hr-grid">
      <section class="card stack"><h3 class="card-title">{L.flow}</h3>
        {#each an.flow as f}<div class="hr-bar"><span>{f.m}</span><i class="in" style:width={`${(f.hired / max(an.flow, 'hired')) * 100}%`}></i><b>+{f.hired}</b><i class="out" style:width={`${(f.dismissed / max(an.flow, 'dismissed')) * 100}%`}></i><b>−{f.dismissed}</b></div>{/each}</section>
      <section class="card stack"><h3 class="card-title">{L.units}</h3>{#each an.units as u}<div class="hr-row"><span>{u.node}</span><b>{u.n}</b></div>{/each}</section>
      <section class="card stack"><h3 class="card-title">{L.src}</h3>{#each an.sources as s}<div class="hr-row"><span>{s.source}</span><b>{s.n}</b></div>{/each}</section>
      <section class="card stack"><h3 class="card-title">{L.why}</h3>{#each an.dismiss_reasons as r}<div class="hr-row"><span>{r.reason}</span><b>{r.n}</b></div>{/each}</section>
    </div>
  {/if}
{:else if tab === 'exit'}
  <section class="card stack">
    <label class="f">{L.who}<select bind:value={ex.uid}><option value=""></option>{#each archive ?? [] as u}<option value={u.id}>{u.name}</option>{/each}</select></label>
    <label class="f">{L.reason}<input bind:value={ex.reason} maxlength="200" /></label>
    {#each ['q1', 'q2', 'q3', 'q4'] as k}<label class="f">{(L as any)[k]}<textarea bind:value={(ex as any)[k]} maxlength="1000"></textarea></label>{/each}
    <button class="btn grad" disabled={!ex.uid} onclick={saveExit}>{L.save}</button>
  </section>
{/if}
