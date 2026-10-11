<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { friendlyError } from '../lib/errors';
  // Понятная ошибка вместо кода и кнопка «Повторить».
  let { error, retry }: { error?: unknown; retry?: () => void } = $props();
  const uz = $derived(app.lang === 'uz');
</script>

<div class="alert err" role="alert">
  <span>{friendlyError(error, app.lang)}</span>
  {#if retry}<button type="button" class="btn sm" onclick={retry}>{uz ? 'Qayta urinish' : 'Повторить'}</button>{/if}
</div>

<style>
  .err { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .err span { flex: 1; min-width: 200px; }
</style>
