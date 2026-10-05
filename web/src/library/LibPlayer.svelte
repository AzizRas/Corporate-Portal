<script lang="ts">
  import type { Embed } from './embed';
  let { e, small = false, title = '' }: { e: Embed; small?: boolean; title?: string } = $props();
</script>
{#if e.type === 'iframe'}
  <div class="l-player" class:sm={small}>
    <iframe src={e.src} {title} loading="lazy" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
  </div>
{:else if e.type === 'video'}
  <div class="l-player" class:sm={small}><video src={e.src} controls preload="metadata" playsinline><track kind="captions" /></video></div>
{/if}
