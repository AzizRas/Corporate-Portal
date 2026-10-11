<script lang="ts">
  import { A } from './store.svelte';
  import { at } from './i18n';
  import ModelRes from './ModelRes.svelte';
  import Say from './Say.svelte';
  const D = $derived(A.data!);
  const groups = $derived([...new Set((D.DATA as any[]).map((d) => d.group))]);
  const SAFE = [
    ['gas', 'sf_gas', 'sf_gas_h'], ['smoke', 'sf_smoke', 'sf_smoke_h'], ['shock', 'sf_shock', 'sf_shock_h'], ['water', 'sf_water', 'sf_water_h'],
  ] as const;
  let devEl: HTMLElement | undefined = $state();
</script>

<div class="as-crumbs"><a href="#/assist">{at('new_call')}</a> / {at('rt_start')}</div>
<h1 class="as-h1">{at('safe_h')}</h1>
<p class="as-sub">{at('safe_sub')}</p>
<Say label={at('ask_label')} ru={at('safe_ask')} uzText="Gaz hidi, tutun yoki kuygan hid bormi? Texnika tok uryaptimi? Rozetka yonida suv yo‘qmi?" />
<div class="as-router">
  {#each SAFE as [k, t, h]}
    <a class="as-rbtn red" href="#/assist/safe/{k}"><b>{at(t)}</b><span>{at(h)}</span></a>
  {/each}
  <button class="as-rbtn u-7a174e5" onclick={() => devEl?.scrollIntoView({ behavior: 'smooth' })}>
    <b class="u-c3176bf">{at('sf_none')}</b><span>{at('sf_none_h')}</span>
  </button>
</div>

<div class="u-109e0a6" bind:this={devEl}></div>
<h2 class="as-h2">{at('dev_h')}</h2>
<p class="as-sub">{at('dev_sub')}</p>
<div class="stack u-04391f0">
  <label class="f u-1169661">{at('model_lbl')}<input autocomplete="off" placeholder="7WM4S1070GCS1" bind:value={A.extras.model} /></label>
  <ModelRes raw={A.extras.model} />
</div>
{#each groups as gr}
  <div class="as-lbl5">{gr}</div>
  <div class="as-router">
    {#each (D.DATA as any[]).filter((d) => d.group === gr) as d}
      <a class="as-rbtn" href="#/assist/app/{d.id}"><b><span aria-hidden="true">{d.g}</span> {d.name}</b><span>{d.crm ? `CRM: ${d.crm}` : at('no_crm_val')}</span></a>
    {/each}
  </div>
{/each}
