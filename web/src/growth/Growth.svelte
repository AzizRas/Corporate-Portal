<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { app, has, lead } from '../lib/state.svelte';
  import { gt } from './g18n';
  import Survey from './Survey.svelte';
  import Talk from './Talk.svelte';
  import Mentor from './Mentor.svelte';
  import Reserve from './Reserve.svelte';
  import Person from './Person.svelte';
  import './growth.css';

  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean).slice(1).map(decodeURIComponent));
  const tab = $derived(parts[0] || 'survey');
  const tabs = $derived([
    { id: 'survey', l: gt('tab_survey') }, { id: 'talk', l: gt('tab_talk') }, { id: 'mentor', l: gt('tab_mentor') },
    ...((lead() || has('hr')) ? [{ id: 'reserve', l: gt('tab_reserve') }] : []),
  ]);
</script>

<header class="page-head">
  <div><h1>{gt('title')}<PageHelp topic="growth_survey" /></h1><p class="sub">{gt('sub')}</p></div>
</header>
{#if tab !== 'person'}
  <nav class="tabs">{#each tabs as tb}<a href="#/growth/{tb.id}" class:on={tab === tb.id}>{tb.l}</a>{/each}</nav>
{/if}

{#if tab === 'survey'}<Survey />
{:else if tab === 'talk'}<Talk who={parts[1] ? Number(parts[1]) : null} />
{:else if tab === 'mentor'}<Mentor />
{:else if tab === 'reserve' && (lead() || has('hr'))}<Reserve />
{:else if tab === 'person'}<Person id={Number(parts[1])} />
{:else}<div class="card"><p class="muted">404</p></div>{/if}
