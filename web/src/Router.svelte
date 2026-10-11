<script lang="ts">
  import { app, has, go, can } from './lib/state.svelte';
  import { routeSection } from './lib/nav';
  import { t } from './lib/i18n';
  import Home from './pages/Home.svelte';
  import Path from './pages/Path.svelte';
  import Attendance from './pages/Attendance.svelte';
  import Kb from './pages/Kb.svelte';
  import Profile from './pages/Profile.svelte';
  import More from './pages/More.svelte';
  import Team from './pages/Team.svelte';
  import Chat from './chat/Chat.svelte';
  import News from './news/News.svelte';
  import Schedule from './pages/Schedule.svelte';
  import Training from './training/Training.svelte';
  import Tests from './tests/Tests.svelte';
  import Library from './library/Library.svelte';
  import Help from './pages/Help.svelte';
  import Structure from './org/Structure.svelte';
  import Tasks from './team/Tasks.svelte';
  import Queue from './team/Queue.svelte';
  import Editor from './ai/Editor.svelte';
  import Assistant from './ai/Assistant.svelte';
  import Reports from './pages/Reports.svelte';

  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean));
  const head = $derived(parts[0] ?? '');
  const closed = $derived((() => { const s = routeSection(parts); return !!s && !can(s); })());
  const adminLoader = () => import('./admin/Admin.svelte');
  const assistLoader = () => import('./assist/Assist.svelte');
  const growthLoader = () => import('./growth/Growth.svelte');
  const hireLoader = () => import('./hire/Hire.svelte');
</script>

{#key head}
  {#if closed}<div class="card"><p class="muted">{app.lang === 'uz' ? 'Bu bo‘lim sizga ochiq emas' : 'Раздел недоступен для вашего подразделения'}</p><a href="#/">{t('nav_home')}</a></div>
  {:else if head === '' || head === 'chat'}<Chat channel={head === 'chat' ? decodeURIComponent(parts[1] ?? 'general') : 'general'} />
  {:else if head === 'home'}<Home />
  {:else if head === 'news'}<News />
  {:else if head === 'schedule'}<Schedule />
  {:else if head === 'training'}<Training />
  {:else if head === 'tests'}<Tests />
  {:else if head === 'library'}<Library />
  {:else if head === 'path'}<Path />
  {:else if head === 'pay'}<Profile tab="pay" />
  {:else if head === 'help'}<Help />
  {:else if head === 'structure'}<Structure />
  {:else if head === 'tasks'}<Tasks />
  {:else if head === 'queue'}<Queue />
  {:else if head === 'editor'}<Editor />
  {:else if head === 'assistant'}<Assistant />
  {:else if head === 'reports'}<Reports />
  {:else if head === 'att'}<Attendance />
  {:else if head === 'kb'}<Kb id={parts[1] ? Number(parts[1]) : null} />
  {:else if head === 'growth'}
    {#await growthLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'hire' && has('hr', 'recruiter', 'manager', 'head')}
    {#await hireLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default parts={parts.slice(1)} />
    {/await}
  {:else if head === 'assist'}
    {#await assistLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'profile'}<Profile tab={parts[1] ?? 'me'} />
  {:else if head === 'more'}<More />
  {:else if head === 'team'}<Team />
  {:else if head === 'admin'}
    {#await adminLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default parts={parts.slice(1)} />
    {/await}
  {:else}
    <div class="card"><p class="muted">404</p><a href="#/">{t('nav_home')}</a></div>
  {/if}
{/key}
