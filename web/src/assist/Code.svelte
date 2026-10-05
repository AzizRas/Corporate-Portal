<script lang="ts">
  import { copy } from './store.svelte';
  import { at } from './i18n';
  let { v, small = '' }: { v: string; small?: string } = $props();
</script>
<code>{v}</code><button class="cp" onclick={() => copy(v, `${at('copied')}: ${v.slice(0, 50)}`)}>{at('copy')}</button>{#if small}<small>{small}</small>{/if}
