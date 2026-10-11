<script lang="ts">
  import type { Snippet } from 'svelte';
  // Пустое состояние: что здесь будет и что сделать, чтобы оно появилось. action — кнопка или ссылка.
  let { title, hint = '', children }: { title: string; hint?: string; children?: Snippet } = $props();
</script>

<div class="empty" role="note">
  <b>{title}</b>
  {#if hint}<p class="muted small">{hint}</p>{/if}
  {#if children}<div class="act">{@render children()}</div>{/if}
</div>

<style>
  .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 22px 16px; border: 1px dashed var(--border); border-radius: 14px; }
  .empty p { margin: 0; max-width: 46ch; }
  .act { margin-top: 8px; }
</style>
