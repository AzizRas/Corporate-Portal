<script lang="ts">
  import { initials } from '../lib/format';
  // u — любой объект с id и name; avatar_v > 0 означает, что загружено фото; bday — сегодня день рождения
  let { u, size = 40, ring = false }: { u: { id: number; name: string; avatar_v?: number; bday?: boolean }; size?: number; ring?: boolean } = $props();
</script>

<span class="av" class:ring style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.36)}px" title={u.name}>
  {#if u.avatar_v}<img src="/api/avatar/{u.id}?v={u.avatar_v}" alt={u.name} loading="lazy" />{:else}{initials(u.name)}{/if}
  {#if u.bday}<i class="cake" style="font-size:{Math.max(12, Math.round(size * 0.42))}px" aria-label="🎂">🎂</i>{/if}
</span>

<style>
  .av { position: relative; display: inline-grid; place-items: center; flex: none; border-radius: 50%; color: #fff; font-weight: 700;
    background: radial-gradient(circle at 30% 30%, #f8b4a6, #c4604f); }
  .av img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block; }
  .ring { box-shadow: 0 0 0 2px var(--card), 0 0 0 4px var(--accent); }
  .cake { position: absolute; right: -4px; bottom: -4px; font-style: normal; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
</style>
