<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { app } from '../lib/state.svelte';
  import { tt } from './tr18n';
  import { T, loadMe } from './store.svelte';
  import Plan from './Plan.svelte';
  import Lesson from './Lesson.svelte';
  import Trainer from './Trainer.svelte';
  import Ready from './Ready.svelte';
  import './training.css';

  // маршруты: #/training («Мой старт» у новичка), #/training/courses («Курсы»), #/training/lesson/<id>, #/training/trainer, #/training/ready;
  // #/training/team переехал в «Мою команду» (REDIRECTS). Вкладки раздела «Обучение» рисует HubTabs, своих рядов вкладок у страницы нет.
  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean).slice(1).map(decodeURIComponent));
  const sec = $derived(parts[0] === 'courses' ? 'plan' : parts[0] || 'plan');
  $effect(() => { loadMe(); });
</script>

<div class="tr">
  <header class="page-head">
    <div><h1>{tt('title')}<PageHelp topic="training_plan" /></h1><p class="sub">{tt('sub')}</p></div>
  </header>

  {#if T.status === 'error' && !T.me}
    <div class="card"><p class="muted">{tt('error')}</p><button class="btn u-56f4356" onclick={() => { T.status = 'idle'; loadMe(true); }}>{tt('retry')}</button></div>
  {:else if !T.me}
    <div class="tr-center"><span class="spin"></span></div>
  {:else if sec === 'lesson'}{#key parts[1]}<Lesson id={Number(parts[1])} />{/key}
  {:else if sec === 'trainer'}<Trainer />
  {:else if sec === 'ready'}<Ready />
  {:else}<Plan />{/if}
</div>
