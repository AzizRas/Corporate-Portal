<script lang="ts">
  import { app } from '../lib/state.svelte';
  type Share = 'self' | 'lead' | 'lead_hr';
  let { value = $bindable('lead'), onchange }: { value?: Share; onchange?: (v: Share) => void } = $props();
  const uz = $derived(app.lang === 'uz');
  const OPTS: [Share, string, string][] = [
    ['self', 'Только я', 'Faqat men'],
    ['lead', 'Я и мой руководитель', 'Men va rahbarim'],
    ['lead_hr', 'Я, руководитель и HR', 'Men, rahbarim va HR'],
  ];
  function pick(v: Share) { value = v; onchange?.(v); }
</script>

<div class="t-share" role="radiogroup" aria-label={uz ? 'Natijani kim ko‘radi' : 'Кто видит результат'}>
  <div class="muted small">{uz ? 'Natijani kim ko‘radi (keyin o‘zgartirish mumkin):' : 'Кто видит результат (можно поменять позже):'}</div>
  <div class="tabs">
    {#each OPTS as [v, ru, u]}<button type="button" role="radio" aria-checked={value === v} class:on={value === v} onclick={() => pick(v)}>{uz ? u : ru}</button>{/each}
  </div>
</div>
