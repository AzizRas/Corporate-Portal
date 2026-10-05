<script lang="ts">
  import { parseVideo } from './embed';
  import { tt } from './tr18n';
  let { url }: { url: string } = $props();
  const e = $derived(parseVideo(url));
</script>

{#if e && (e.kind === 'youtube' || e.kind === 'vimeo' || e.kind === 'iframe')}
  <div class="tr-video">
    <iframe src={e.src} title="video" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"></iframe>
  </div>
{:else if e && e.kind === 'file'}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video class="tr-video-file" controls preload="metadata" playsinline><source src={e.src} type={e.mime} /></video>
{:else if e}
  <a class="btn" href={e.src} target="_blank" rel="noopener noreferrer">▶ {tt('video_open')}</a>
{/if}
