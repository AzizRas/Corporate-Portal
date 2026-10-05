<script lang="ts">
  import { A, uz } from './store.svelte';
  import { at } from './i18n';
  let { id }: { id: string } = $props();
  const D = $derived(A.data!);
  const app = $derived((D.DATA as any[]).find((d) => d.id === id));
  const hint = (s: string) => { const w = String(s || '').split(/\s+/).filter(Boolean); return w.length ? `UZ: ${uz(w.slice(0, 4).join(' '))}${w.length > 4 ? '…' : ''}` : ''; };
</script>

{#if !app}
  <div class="box gap">{at('not_found')} <a href="#/assist">{at('new_call')}</a></div>
{:else}
  <div class="as-crumbs"><a href="#/assist/safety">{at('rt_start')}</a> / {app.name}</div>
  <h1 class="as-h1"><span aria-hidden="true">{app.g}</span> {app.name}</h1>
  {#if app.crm}
    <div class="box ok">{at('app_crm')}: <code>{app.crm}</code> — {at('one_value')}.
      {#if app.crmAlt} {at('or')} <code>{app.crmAlt.v}</code> — {app.crmAlt.when}.{/if}{#if app.crmNote} {app.crmNote}{/if}</div>
  {:else}
    <div class="box gap"><b>{at('app_nocrm', { n: app.name })}</b> {at('app_nocrm_t')}</div>
  {/if}
  {#if !app.route}
    <a class="as-rbtn red" href="#/assist/safety" style="padding:12px 18px"><b>{at('danger_q')}</b><span>{at('danger_t')}</span></a>
  {/if}
  <p class="as-sub">{at('app_pick')}</p>
  <div class="as-sym">
    {#each app.symptoms as s, i}
      <a class="as-symbtn" class:red={s.red} href={s.go ? `#/assist/safe/${s.go.split(':')[1]}` : `#/assist/sym/${app.id}/${s.id}`}>
        <span class="n">{String(i + 1).padStart(2, '0')}</span>
        <span>{s.name}{#if A.cl === 'uz' && s.uz}<small>{hint(s.uz)}</small>{/if}</span>
        <span class="arr">→</span>
      </a>
    {/each}
  </div>
  <p class="as-hint">{at('app_team')}: <b>{app.team}</b>. {at('app_team_t')}</p>
{/if}
