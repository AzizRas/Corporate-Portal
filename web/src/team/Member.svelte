<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { fmtTime, fmtDate } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import './team.css';

  let { id }: { id: number } = $props();
  const uz = $derived(app.lang === 'uz');
  const L = $derived(uz
    ? { back: 'Jamoaga', manager: 'Rahbar', hired: 'Ishga kirgan', today: 'Bugun', schedule: 'Keyingi 2 hafta (o‘zgarishlar)', noChanges: 'Odatdagi jadval bo‘yicha', att: 'Kelish (14 kun)', tasks: 'Vazifalar', tests: 'Testlar', history: 'Tarix', none: 'Yo‘q', growth: 'Rivojlanish va 360°', talk: '1:1 suhbat', task: 'Vazifa berish', test: 'Test tayinlash', done: 'bajarildi', due: 'muddat', off: 'Dam olish', work: 'Ish kuni', leave: 'Ta’til', pending: 'kutilmoqda', came: 'keldi', left: 'ketdi', intern: 'stajyor', direct: 'to‘g‘ridan-to‘g‘ri' }
    : { back: 'К команде', manager: 'Руководитель', hired: 'В компании с', today: 'Сегодня', schedule: 'Ближайшие 2 недели (изменения графика)', noChanges: 'По обычному графику', att: 'Приход (14 дней)', tasks: 'Задачи', tests: 'Тесты', history: 'История', none: 'Нет', growth: 'Развитие и 360°', talk: 'Беседа 1:1', task: 'Поставить задачу', test: 'Назначить тест', done: 'выполнено', due: 'срок', off: 'Выходной', work: 'Рабочий', leave: 'Отпуск', pending: 'ждёт решения', came: 'пришёл', left: 'ушёл', intern: 'стажёр', direct: 'прямой подчинённый' });
  const EV: Record<string, [string, string]> = { hired: ['Принят', 'Qabul qilindi'], transfer: ['Перевод', 'Ko‘chirish'], transfer_applied: ['Перевод вступил в силу', 'Ko‘chirish kuchga kirdi'], to_staff: ['Переведён в штат', 'Shtatga o‘tkazildi'], vacation: ['Отпуск', 'Ta’til'], sick: ['Больничный', 'Kasallik'], dismiss: ['Уволен', 'Bo‘shatildi'], restore: ['Восстановлен', 'Tiklandi'] };

  let data: any = $state(null), err: unknown = $state(null);
  const load = () => { err = null; api.get(`/api/team/member/${id}`).then((r) => (data = r)).catch((e) => (err = e)); };
  $effect(() => { id; load(); });
</script>

<a class="small" href="#/team">← {L.back}</a>
{#if err}<ErrorState error={err} retry={load} />
{:else if !data}<Skeleton rows={6} />
{:else}
  {@const p = data.person}
  <section class="card tm-hero">
    <Avatar u={{ id: p.id, name: p.name, avatar_v: p.avatar_v }} size={64} />
    <div class="tm-body">
      <h2>{p.name}</h2>
      <p class="muted small">{p.position}{#if p.node} · {p.node}{/if}{#if p.employment === 'intern'} · <span class="chip">{L.intern}</span>{/if}</p>
      <p class="muted xs">{L.manager}: {p.manager_name ?? '—'}{#if p.direct} · {L.direct}{/if}{#if p.hired_at} · {L.hired} {fmtDate(p.hired_at)}{/if}</p>
    </div>
    <div class="tm-actions">
      <a class="btn sm grad" href="#/growth/person/{p.id}">{L.growth}</a>
      <a class="btn sm" href="#/growth/person/{p.id}">{L.talk}</a>
      <a class="btn sm" href="#/tasks">{L.task}</a>
      <a class="btn sm" href="#/tests">{L.test}</a>
    </div>
  </section>

  <div class="grid tm-cols">
    <section class="card stack">
      <h3 class="card-title">{L.today}</h3>
      {#if data.today}
        <p>{data.today.kind === 'leave' ? L.leave : data.today.kind === 'off' ? L.off : `${L.work} ${data.today.shift ?? ''}`}{#if data.today.pending} · <span class="warn-ink">{L.pending}</span>{/if}</p>
        {#if data.today.marked_at}<p class="ok-ink small">✓ {L.came} {fmtTime(data.today.marked_at)}</p>{/if}
      {/if}
      <h4 class="tm-sub">{L.schedule}</h4>
      {#each data.schedule as d}<div class="tm-row"><span>{fmtDate(d.day)}</span><span>{d.kind === 'off' ? L.off : L.work}{#if d.status !== 'approved'} · {L.pending}{/if}</span></div>{:else}<p class="muted small">{L.noChanges}</p>{/each}
      <h4 class="tm-sub">{L.att}</h4>
      {#each data.attendance as a}<div class="tm-row"><span>{fmtDate(a.day)}</span><span>{a.came ? `${L.came} ${fmtTime(a.came)}` : '—'}{#if a.left} · {L.left} {fmtTime(a.left)}{/if}</span></div>{:else}<p class="muted small">{L.none}</p>{/each}
    </section>
    <section class="card stack">
      <h3 class="card-title">{L.tasks}</h3>
      {#each data.tasks as t}<div class="tm-row"><span class:muted={!!t.done_at}>{t.title}</span><span class="xs muted">{t.done_at ? L.done : t.due ? `${L.due} ${fmtDate(t.due)}` : ''}</span></div>{:else}<p class="muted small">{L.none}</p>{/each}
      <h3 class="card-title">{L.tests}</h3>
      {#each data.tests as t}<div class="tm-row"><span>{uz ? t.title_uz : t.title_ru}</span><span class="xs muted">{t.done_at ? L.done : L.pending}</span></div>{:else}<p class="muted small">{L.none}</p>{/each}
      <h3 class="card-title">{L.history}</h3>
      {#each data.history as h}<div class="tm-row"><span>{EV[h.event]?.[uz ? 1 : 0] ?? h.event}</span><span class="xs muted">{fmtDate(h.at)}</span></div>{:else}<p class="muted small">{L.none}</p>{/each}
    </section>
  </div>
{/if}
