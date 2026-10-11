<script lang="ts">
  import { app, has, go, can } from './lib/state.svelte';
  import { routeSection, landing } from './lib/nav';
  import { t } from './lib/i18n';
  import Home from './pages/Home.svelte';

  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean));
  // адрес «/» открывает главную (а если её закрыли для подразделения — первый доступный раздел)
  const head = $derived(parts[0] || landing());
  const closed = $derived((() => { const s = routeSection(parts); return !!s && !can(s); })());
  const adminLoader = () => import('./admin/Admin.svelte');
  const assistLoader = () => import('./assist/Assist.svelte');
  const growthLoader = () => import('./growth/Growth.svelte');
  const hireLoader = () => import('./hire/Hire.svelte');
  // тяжёлые разделы грузятся при первом открытии, а не вместе с первым экраном (код каждого — отдельным файлом)
  const trainingLoader = () => import('./training/Training.svelte');
  const testsLoader = () => import('./tests/Tests.svelte');
  const libraryLoader = () => import('./library/Library.svelte');
  const structureLoader = () => import('./org/Structure.svelte');
  const queueLoader = () => import('./team/Queue.svelte');
  const editorLoader = () => import('./ai/Editor.svelte');
  const assistantLoader = () => import('./ai/Assistant.svelte');
  const reportsLoader = () => import('./pages/Reports.svelte');
  const teamLoader = () => import('./pages/Team.svelte');
  const tasksLoader = () => import('./team/Tasks.svelte');
  const pathLoader = () => import('./pages/Path.svelte');
  const attLoader = () => import('./pages/Attendance.svelte');
  const kbLoader = () => import('./pages/Kb.svelte');
  const profileLoader = () => import('./pages/Profile.svelte');
  const moreLoader = () => import('./pages/More.svelte');
  const chatLoader = () => import('./chat/Chat.svelte');
  const newsLoader = () => import('./news/News.svelte');
  const scheduleLoader = () => import('./pages/Schedule.svelte');
  const helpLoader = () => import('./pages/Help.svelte');
</script>

{#key head}
  {#if closed}<div class="card"><p class="muted">{app.lang === 'uz' ? 'Bu bo‘lim sizga ochiq emas' : 'Раздел недоступен для вашего подразделения'}</p><a href="#/">{t('nav_home')}</a></div>
  {:else if head === 'chat'}
    {#await chatLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default channel={parts[0] === 'chat' ? decodeURIComponent(parts[1] ?? 'general') : 'general'} />
    {/await}
  {:else if head === 'home'}<Home />
  {:else if head === 'news'}
    {#await newsLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'schedule'}
    {#await scheduleLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'training'}
    {#await trainingLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'tests'}
    {#await testsLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'library'}
    {#await libraryLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'path'}
    {#await pathLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'pay'}
    {#await profileLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default tab="pay" />
    {/await}
  {:else if head === 'help'}
    {#await helpLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'structure'}
    {#await structureLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'tasks'}
    {#await tasksLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'queue'}
    {#await queueLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'editor'}
    {#await editorLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'assistant'}
    {#await assistantLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'reports'}
    {#await reportsLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'att'}
    {#await attLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'kb'}
    {#await kbLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default id={parts[1] ? Number(parts[1]) : null} />
    {/await}
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
  {:else if head === 'profile'}
    {#await profileLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default tab={parts[1] ?? 'me'} />
    {/await}
  {:else if head === 'more'}
    {#await moreLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
  {:else if head === 'team'}
    {#await teamLoader()}
      <span class="spin"></span>
    {:then m}
      <m.default />
    {/await}
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
