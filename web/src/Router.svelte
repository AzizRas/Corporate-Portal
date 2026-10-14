<script lang="ts">
  import { app, can } from './lib/state.svelte';
  import { routeSection, landing, navCtx, routeOpen } from './lib/nav';
  import { REDIRECTS, isGated } from './lib/nav-core';
  import { t } from './lib/i18n';
  import { wt } from './lib/w18n';
  import Home from './pages/Home.svelte';
  import Lazy from './components/Lazy.svelte';

  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean));
  const qs = $derived(app.route.split('?')[1] ?? '');
  const query = $derived(new URLSearchParams(qs));
  // адрес «/» открывает главную (а если её закрыли для подразделения — первый доступный раздел)
  const head = $derived(parts[0] || landing());
  const path = $derived('/' + parts.join('/'));
  // старый адрес → новый, до отрисовки страницы: закладки, push, Telegram, QR и уведомления продолжают работать (правила — nav-core.ts → REDIRECTS)
  const moved = $derived.by(() => { const to = REDIRECTS(path, qs, navCtx()); return to && to !== app.route ? to : null; });
  $effect(() => { if (moved) location.replace('#' + moved); });
  const closed = $derived((() => { const s = routeSection(parts); return !!s && !can(s); })());
  // адреса, где доступ решают роли (/team, /admin, /hire, /training/lead, /inbox, /requests): пункт меню за адрес должен быть виден
  const denied = $derived(!moved && isGated(path) && !routeOpen(app.route));
  const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
  const num = (s: string | undefined | null) => Number(s ?? '');
  // карточка человека: руководитель и HR открывают «Мою команду» (рабочий вид), остальные и своя — карточку роста
  const personRich = $derived(parts[0] === 'people' && !!parts[1] && query.get('tab') !== 'growth' && num(parts[1]) !== app.user?.id && (navCtx().hasTeam || navCtx().roles.includes('hr') || navCtx().roles.includes('admin')));

  const adminLoader = () => import('./admin/Admin.svelte');
  const platformLoader = () => import('./admin/PlatformAdmin.svelte');
  const assistLoader = () => import('./assist/Assist.svelte');
  const growthLoader = () => import('./growth/Growth.svelte');
  const hireLoader = () => import('./hire/Hire.svelte');
  // тяжёлые разделы грузятся при первом открытии, а не вместе с первым экраном (код каждого — отдельным файлом)
  const trainingLoader = () => import('./training/Training.svelte');
  const trainingTeamLoader = () => import('./training/Team.svelte');
  const testsLoader = () => import('./tests/Tests.svelte');
  const testTeamLoader = () => import('./tests/TestTeam.svelte');
  const libraryLoader = () => import('./library/Library.svelte');
  const structureLoader = () => import('./org/Structure.svelte');
  const assistantLoader = () => import('./ai/Assistant.svelte');
  const editorLoader = () => import('./ai/Editor.svelte');
  const teamLoader = () => import('./pages/Team.svelte');
  const memberLoader = () => import('./team/Member.svelte');
  const queueLoader = () => import('./team/Queue.svelte');
  const personLoader = () => import('./growth/Person.svelte');
  const talkLoader = () => import('./growth/Talk.svelte');
  const reserveLoader = () => import('./growth/Reserve.svelte');
  const leavesLoader = () => import('./pages/LeavesCalendar.svelte');
  const hrLoader = () => import('./pages/HrHub.svelte');
  const reviewAdminLoader = () => import('./pages/ReviewAdmin.svelte');
  const requestsLoader = () => import('./pages/HrRequests.svelte');
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

{#if !moved}
  {#key head}
    {#if denied}
      <section class="card stack">
        <h2>{wt('na_title')}</h2>
        <p class="muted">{wt('na_text')}</p>
        <div><a class="btn grad" href="#/home">{wt('na_home')}</a></div>
      </section>
    {:else if closed}<div class="card"><p class="muted">{app.lang === 'uz' ? 'Bu bo‘lim sizga ochiq emas' : 'Раздел недоступен для вашего подразделения'}</p><a href="#/">{t('nav_home')}</a></div>
    {:else if head === 'chat'}
      <!-- #/chat без номера — список: первый чат с непрочитанным, иначе первый в списке (Общий заранее не открывается и не помечается прочитанным); /chat/<номер>/info — панель «Информация» -->
      <Lazy load={chatLoader} channel={parts[1] ? dec(parts[1]) : null} info={parts[2] === 'info'} />
    {:else if head === 'home'}<Home />
    {:else if head === 'inbox'}<Lazy load={tasksLoader} title="inbox" />
    {:else if head === 'requests'}<Lazy load={requestsLoader} />
    {:else if head === 'news'}<Lazy load={newsLoader} />
    {:else if head === 'schedule'}<Lazy load={scheduleLoader} />
    {:else if head === 'training' && parts[1] === 'lead'}<Lazy load={assistantLoader} />
    {:else if head === 'training'}
      <!-- /training («Мой старт» у новичка), /training/courses, /training/lesson/<номер>, /training/trainer, /training/ready и /training/ready/<номер> показывает одна страница обучения -->
      <Lazy load={trainingLoader} />
    {:else if head === 'tests'}<Lazy load={testsLoader} />
    {:else if head === 'library'}<Lazy load={libraryLoader} />
    {:else if head === 'path'}<Lazy load={pathLoader} />
    {:else if head === 'pay'}<Lazy load={profileLoader} tab="pay" />
    {:else if head === 'help'}<Lazy load={helpLoader} />
    {:else if head === 'people'}
      {#if !parts[1]}<Lazy load={structureLoader} tab="chart" />
      {:else if personRich}<Lazy load={memberLoader} id={num(parts[1])} />
      {:else}<Lazy load={personLoader} id={num(parts[1])} />{/if}
    {:else if head === 'surveys'}<Lazy load={testsLoader} filter="psych" heading="surveys" />
    {:else if head === 'att'}<Lazy load={attLoader} />
    {:else if head === 'kb'}<Lazy load={kbLoader} id={parts[1] ? num(parts[1]) : null} />
    {:else if head === 'growth' && parts[1] === 'self'}<Lazy load={testsLoader} filter="psych" heading="self" />
    {:else if head === 'growth'}<Lazy load={growthLoader} />
    {:else if head === 'hire'}<Lazy load={hireLoader} parts={parts.slice(1)} />
    {:else if head === 'assist'}<Lazy load={assistLoader} />
    {:else if head === 'profile'}<Lazy load={profileLoader} tab={parts[1] ?? 'me'} />
    {:else if head === 'more'}<Lazy load={moreLoader} />
    {:else if head === 'team'}
      {#if !parts[1]}<Lazy load={teamLoader} />
      {:else if parts[1] === 'schedule'}
        <Lazy load={scheduleLoader} view="team" />
        {#if query.get('view') === 'leaves'}<Lazy load={leavesLoader} />{/if}
      {:else if parts[1] === 'newbies'}<Lazy load={trainingTeamLoader} />
      {:else if parts[1] === 'learning'}<Lazy load={testTeamLoader} />
      {:else if parts[1] === 'growth'}
        {#if query.get('user')}<Lazy load={talkLoader} who={num(query.get('user'))} />{:else}<Lazy load={reserveLoader} />{/if}
      {:else if parts[1] === 'tasks'}<Lazy load={tasksLoader} title="team_tasks" />
      {:else if parts[1] === 'hire'}<Lazy load={hireLoader} parts={['req']} />
      {:else}<div class="card"><p class="muted">404</p><a href="#/">{t('nav_home')}</a></div>{/if}
    {:else if head === 'admin'}
      <!-- режим «Управление»: новые адреса показывают существующие страницы на нужной вкладке (J1 разнесёт их по отдельным страницам), остальное — Admin.svelte -->
      {#if parts[1] === 'org'}<Lazy load={structureLoader} tab="tree" />
      {:else if parts[1] === 'onboarding'}<Lazy load={hrLoader} tab="prob" />
      {:else if parts[1] === 'offboarding'}<Lazy load={hrLoader} tab="exit" />
      {:else if parts[1] === 'analytics'}<Lazy load={hrLoader} tab="an" />
      {:else if parts[1] === 'leaves'}
        {#if query.get('view') === 'schedule'}<Lazy load={scheduleLoader} view="team" />{/if}
        <Lazy load={leavesLoader} />
      {:else if parts[1] === 'reviews'}<Lazy load={reviewAdminLoader} />
      {:else if parts[1] === 'reserve'}<Lazy load={reserveLoader} />
      {:else if parts[1] === 'questions'}<Lazy load={queueLoader} />
      {:else if parts[1] === 'editor'}<Lazy load={editorLoader} />
      {:else if parts[1] === 'stickers' || parts[1] === 'security'}<Lazy load={platformLoader} />
      {:else}<Lazy load={adminLoader} parts={parts.slice(1)} />{/if}
    {:else}
      <div class="card"><p class="muted">404</p><a href="#/">{t('nav_home')}</a></div>
    {/if}
  {/key}
{/if}
