<script lang="ts">
  import { hs, loadMeta, isAdm, toast, dismiss, ht } from './store.svelte';
  import { app } from '../lib/state.svelte';
  import { pageTitle } from '../lib/nav';
  import Vacancies from './Vacancies.svelte';
  import Board from './Board.svelte';
  import People from './People.svelte';
  import Applicant from './Applicant.svelte';
  import Requests from './Requests.svelte';
  import Interviews from './Interviews.svelte';
  import Reports from './Reports.svelte';
  import HireCfg from './HireCfg.svelte';

  let { parts }: { parts: string[] } = $props();
  let ready = $state(false), failed = $state(false);
  loadMeta().then((ok) => { failed = !ok; ready = true; });

  // Вкладки найма (вакансии, кандидаты, заявки, собеседования, отчёты, настройки) в режиме «Управление» рисует HubTabs: адреса /hire, /hire/people, /hire/req, /hire/cal, /hire/rep, /hire/cfg
  // и пункты группы «Найм» (nav.ts). Своего ряда вкладок у страницы нет; руководитель без ролей найма открывает её как «Подбор» (/team/hire) с parts=['req'].
  const head = $derived(parts[0] ?? '');
</script>

<!-- заголовок — подпись открытой вкладки («Вакансии», «Кандидаты», у руководителя «Подбор»): название раздела «Найм» уже показывает HubTabs -->
<header class="page-head"><div><h1>{pageTitle(app.route, ht('hTitleP'))}</h1><p class="sub">{ht('hSubP')}</p></div></header>

{#if !ready}<p class="muted"><span class="spin"></span></p>
{:else if failed || !hs.meta}<p class="alert">{ht('hNoAccess')}</p>
{:else}
  {#key parts.join('/')}
    {#if head === 'v' && parts[1]}<Board id={Number(parts[1])} />
    {:else if head === 'people'}<People />
    {:else if head === 'a' && parts[1]}<Applicant id={Number(parts[1])} />
    {:else if head === 'req'}<Requests />
    {:else if head === 'cal'}<Interviews />
    {:else if head === 'rep'}<Reports />
    {:else if head === 'cfg' && isAdm()}<HireCfg />
    {:else}<Vacancies />{/if}
  {/key}
{/if}

<div class="toasts" role="status" aria-live="polite">
  {#each hs.toasts as t (t.id)}<button type="button" class="toast" class:bad={t.bad} onclick={() => dismiss(t.id)}>{t.text}</button>{/each}
</div>

<style>
  .toast { background: var(--card); border: 1px solid var(--border); color: var(--text); font: inherit; }
  .toast.bad { color: var(--bad); border-color: var(--bad); }
</style>
