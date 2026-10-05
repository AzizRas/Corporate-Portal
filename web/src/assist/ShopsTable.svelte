<script lang="ts">
  import { A, copy } from './store.svelte';
  import { at } from './i18n';
  const D = $derived(A.data!);
</script>
<div class="tbl"><table>
  <thead><tr><th>{at('shop_n')}</th><th>{at('shop_city')}</th><th>{at('shop_addr')}</th></tr></thead>
  <tbody>
    {#each D.SHOPS as s}
      <tr><td><b>{s.n}</b></td><td>{s.city}</td><td>{s.addr}<button class="cp" onclick={() => copy(`${s.city}, ${s.addr}`, at('copied'))}>{at('copy')}</button></td></tr>
    {/each}
  </tbody>
</table></div>
<p class="as-hint">{at('shop_src')}</p>
