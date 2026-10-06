<script lang="ts">
  import { app, has, go } from './lib/state.svelte';
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
  import Reports from './pages/Reports.svelte';

  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean));
  const head = $derived(parts[0] ?? '');
  const adminLoader = () => import('./admin/Admin.svelte');
  const assistLoader = () => import('./assist/Assist.svelte');
  const growthLoader = () => import('./growth/Growth.svelte');
</script>

{#key head}
  {#if head === '' || head === 'chat'}<Chat channel={head === 'chat' ? decodeURIComponent(parts[1] ?? 'general') : 'general'} />
  {:else if head === 'home'}<Home />
  {:else if head === 'news'}<News />
  {:else if head === 'schedule'}<Schedule />
  {:else if head === 'training'}<Training />
  {:else if head === 'tests'}<Tests />
  {:else if head === 'library'}<Library />
  {:else if head === 'path'}<Path />
  {:else if head === 'pay'}<Profile tab="pay" />
  {:else if head === 'help'}<Help />
  {:else if head === 'reports'}<Reports />
  {:else if head === 'att'}<Attendance />
  {:else if head === 'kb'}<Kb id={parts[1] ? Number(parts[1]) : null} />
  {:else if head === 'growth'}
    {#await growthLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
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
