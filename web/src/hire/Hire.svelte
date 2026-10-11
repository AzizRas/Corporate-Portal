<script lang="ts">
  import { hs, loadMeta, isAdm, toast, dismiss, ht } from './store.svelte';
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

  const head = $derived(parts[0] ?? '');
  const tabs = $derived([['', 'hVac'], ['people', 'hPeople'], ['req', 'hReq'], ['cal', 'hCal'], ['rep', 'hRep'], ...(isAdm() ? [['cfg', 'hCfg']] : [])]);
  const cur = $derived(head === 'v' ? '' : head === 'a' ? 'people' : head);
</script>

<header class="page-head"><div><h1>{ht('hTitleP')}</h1><p class="sub">{ht('hSubP')}</p></div></header>

{#if !ready}<p class="muted"><span class="spin"></span></p>
{:else if failed || !hs.meta}<p class="alert">{ht('hNoAccess')}</p>
{:else}
  <div class="tabs" role="tablist">
    {#each tabs as [h, k]}<a role="tab" aria-selected={cur === h} class:on={cur === h} href={`#/hire${h ? '/' + h : ''}`}>{ht(k)}</a>{/each}
  </div>
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
