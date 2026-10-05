<script lang="ts">
  import type { Snippet } from 'svelte';
  let { onclose, wide = false, children }: { onclose: () => void; wide?: boolean; children: Snippet } = $props();
</script>
<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
<div class="modal-back" role="presentation" onmousedown={(e) => e.target === e.currentTarget && onclose()}>
  <div class="modal" class:wide role="dialog" aria-modal="true">{@render children()}</div>
</div>
