<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { fmtTime, fmtDate } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import './team.css';

  const L = $derived(app.lang === 'uz'
    ? { direct: 'To‘g‘ridan-to‘g‘ri', all: 'Butun shoxobcha', search: 'Ism yoki lavozim', shift: 'Smena', off: 'Dam olish', leave: 'Ta’til', sick: 'Kasallik', pending: 'ariza', came: 'keldi', notCame: 'hali belgilanmagan', overdue: 'muddati o‘tgan vazifa', tests: 'test tayinlangan', talk: '1:1', noTalk: '1:1 bo‘lmagan', days: 'kun oldin', empty: 'Jamoangizda hali hech kim yo‘q', emptyHint: 'Tuzilmada sizni bo‘linma rahbari qilib tayinlashsa, xodimlar shu yerda ko‘rinadi.', people: 'kishi', of: 'dan', hr: 'HR ko‘rinishi: barcha xodimlar' }
    : { direct: 'Прямые', all: 'Вся ветка', search: 'Имя или должность', shift: 'Смена', off: 'Выходной', leave: 'Отпуск', sick: 'Больничный', pending: 'заявка', came: 'пришёл', notCame: 'ещё не отметился', overdue: 'просроченных задач', tests: 'тестов назначено', talk: '1:1', noTalk: 'бесед 1:1 не было', days: 'дн. назад', empty: 'В вашей команде пока никого', emptyHint: 'Когда в «Структуре» вас назначат руководителем узла, сотрудники появятся здесь.', people: 'чел.', of: 'из', hr: 'Вид HR: все сотрудники' });

  let scope = $state<'direct' | 'all'>('all'), needle = $state(''), data: any = $state(null), err: unknown = $state(null);
  let tm: ReturnType<typeof setTimeout>;
  async function load() {
    err = null;
    try { data = await api.get(`/api/team/overview?scope=${scope}${needle.trim() ? `&q=${encodeURIComponent(needle.trim())}` : ''}`); } catch (e) { err = e; }
  }
  $effect(() => { scope; load(); });
  const onSearch = () => { clearTimeout(tm); tm = setTimeout(load, 300); };
  const ago = (d: string | null) => (d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86_400_000)) : null);
</script>

<section class="card stack tm">
  {#if data}
    <div class="tm-head">
      <div class="tm-nodes">
        {#if data.nodes.length}{#each data.nodes as n}<span class="chip">{n.name}</span>{/each}{:else if data.hr_view}<span class="muted small">{L.hr}</span>{/if}
        <span class="muted small">{data.direct} {L.direct.toLowerCase()} · {data.total} {L.people}</span>
      </div>
      <div class="tabs tm-scope"><button class:on={scope === 'direct'} onclick={() => (scope = 'direct')}>{L.direct}</button><button class:on={scope === 'all'} onclick={() => (scope = 'all')}>{L.all}</button></div>
      <input class="tm-q" type="search" placeholder={L.search} bind:value={needle} oninput={onSearch} />
    </div>
  {/if}
  {#if err}<ErrorState error={err} retry={load} />
  {:else if !data}<Skeleton rows={5} />
  {:else if !data.members.length}<EmptyState title={L.empty} hint={L.emptyHint} />
  {:else}
    <div class="tm-grid">
      {#each data.members as m (m.id)}
        <a class="tm-card" href="#/team/{m.id}">
          <Avatar u={{ id: m.id, name: m.name, avatar_v: m.avatar_v }} size={44} />
          <span class="tm-body">
            <b class="clip1">{m.name}</b>
            <span class="muted xs clip1">{m.position}{#if scope === 'all' && m.node} · {m.node}{/if}</span>
            <span class="tm-today">
              {#if m.today?.kind === 'leave'}<span class="tm-st leave">{m.today.leave === 'sick' ? L.sick : L.leave}</span>
              {:else if m.today?.kind === 'off'}<span class="tm-st off">{L.off}</span>
              {:else if m.today}<span class="tm-st work">{L.shift} {m.today.shift}</span>
                {#if m.today.marked_at}<span class="xs ok-ink">✓ {L.came} {fmtTime(m.today.marked_at)}</span>{:else}<span class="xs muted">{L.notCame}</span>{/if}{/if}
              {#if m.today?.pending}<span class="xs warn-ink">· {L.pending}</span>{/if}
            </span>
            <span class="tm-flags">
              {#if m.tasks_overdue}<span class="tm-flag bad">{m.tasks_overdue} {L.overdue}</span>{/if}
              {#if m.tests_pending}<span class="tm-flag">{m.tests_pending} {L.tests}</span>{/if}
              <span class="tm-flag" class:bad={!m.last_talk || (ago(m.last_talk) ?? 0) > 45}>{m.last_talk ? `${L.talk}: ${ago(m.last_talk)} ${L.days}` : L.noTalk}</span>
            </span>
          </span>
        </a>
      {/each}
    </div>
  {/if}
</section>
