<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { app } from '../lib/state.svelte';
  import { gt } from './g18n';
  import Survey from './Survey.svelte';
  import Reviews from './Reviews.svelte';
  import Talk from './Talk.svelte';
  import Mentor from './Mentor.svelte';
  import Person from './Person.svelte';
  import './growth.css';

  // #/growth/reviews («Оценка 360°»), #/growth/talk («Встречи и цели»), #/growth/mentor («ИИ-советник»); вкладки раздела «Рост» рисует HubTabs, своего ряда у страницы нет.
  // #/growth/reserve, #/growth/survey, #/growth/person/<номер> переехали (REDIRECTS), «Кадровый резерв» открывают «Рост команды» и «Управление».
  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean).slice(1).map(decodeURIComponent));
  const tab = $derived(parts[0] || 'reviews');
</script>

<header class="page-head">
  <div><h1>{gt('title')}<PageHelp topic="growth_survey" /></h1><p class="sub">{gt('sub')}</p></div>
</header>

{#if tab === 'reviews'}<Reviews />
{:else if tab === 'survey'}<Survey />
{:else if tab === 'talk'}<Talk who={parts[1] ? Number(parts[1]) : null} />
{:else if tab === 'mentor'}<Mentor />
{:else if tab === 'person'}<Person id={Number(parts[1])} />
{:else}<div class="card"><p class="muted">404</p></div>{/if}
