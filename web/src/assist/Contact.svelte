<script lang="ts">
  import { A, copy } from './store.svelte';
  import { at } from './i18n';
  import { fmtTel } from './logic';
  import ScPick from './ScPick.svelte';
  let { k }: { k: string } = $props();
  const D = $derived(A.data!);
  const v = $derived(D.CONTACTS?.[k]);
</script>
{#if k === 'parts' && !v}
  <div class="box ok"><b>{at('ct_parts')}.</b> {at('ct_parts_t')} <b>{fmtTel('771081146')}</b><button class="cp" onclick={() => copy(fmtTel('771081146'), at('copied'))}>{at('copy')}</button></div>
  <ScPick label={at('sc_region')} />
{:else if v}
  <div class="box ok"><b>{at('ct_' + k)}:</b> <b>{v}</b><button class="cp" onclick={() => copy(v, at('copied'))}>{at('copy')}</button></div>
{:else}
  <div class="box gap"><b>{at('ct_' + k)}:</b> {at('ct_missing')}</div>
{/if}
