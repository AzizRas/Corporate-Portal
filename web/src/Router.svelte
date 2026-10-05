<script lang="ts">
  import { app, has, go } from './lib/state.svelte';
  import { t } from './lib/i18n';
  import Home from './pages/Home.svelte';
  import Path from './pages/Path.svelte';
  import Payroll from './pages/Payroll.svelte';
  import Attendance from './pages/Attendance.svelte';
  import Kb from './pages/Kb.svelte';
  import Profile from './pages/Profile.svelte';
  import More from './pages/More.svelte';
  import Team from './pages/Team.svelte';

  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean));
  const head = $derived(parts[0] ?? '');
  const adminLoader = () => import('./admin/Admin.svelte');
  const assistLoader = () => import('./assist/Assist.svelte');
</script>

{#key head}
  {#if head === ''}<Home />
  {:else if head === 'path'}<Path />
  {:else if head === 'pay'}<Payroll />
  {:else if head === 'att'}<Attendance />
  {:else if head === 'kb'}<Kb id={parts[1] ? Number(parts[1]) : null} />
  {:else if head === 'assist'}
    {#await assistLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'profile'}<Profile />
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
