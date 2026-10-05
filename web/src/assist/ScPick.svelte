<script lang="ts">
  import { A } from './store.svelte';
  import { at } from './i18n';
  import { scById } from './logic';
  import ScCard from './ScCard.svelte';
  let { label = '' }: { label?: string } = $props();
  const D = $derived(A.data!);
  const cur = $derived(A.extras.sc ? scById(D, A.extras.sc) : null);
</script>
<div class="stack" style="gap:10px">
  <label class="f" style="margin:0">{label || at('sc_pick')}
    <select bind:value={A.extras.sc}>
      <option value="">{at('sc_choose')}</option>
      {#each D.SC as s}<option value={s.id}>{s.reg} · {s.crm}</option>{/each}
    </select>
  </label>
  {#if cur}<ScCard s={cur} />{/if}
</div>
