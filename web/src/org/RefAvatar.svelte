<script lang="ts">
  import Avatar from '../components/Avatar.svelte';
  import { initials } from '../lib/format';

  // Фото контакта справочного подразделения: загруженное фото, профиль сотрудника портала или инициалы
  let { p, size = 38 }: { p: { id: number; user_id: number | null; name: string; avatar_v: number; has_photo: boolean; photo_v: number }; size?: number } = $props();
</script>

{#if p.has_photo}
  <span class="ra" style="width:{size}px;height:{size}px"><img src="/api/org/ref-people/{p.id}/photo?v={p.photo_v}" alt={p.name} loading="lazy" /></span>
{:else if p.user_id}
  <Avatar u={{ id: p.user_id, name: p.name, avatar_v: p.avatar_v }} {size} />
{:else}
  <span class="ra ini" style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.36)}px" title={p.name}>{initials(p.name)}</span>
{/if}

<style>
  .ra { display: inline-grid; place-items: center; flex: none; border-radius: 50%; overflow: hidden; background: var(--card-2); }
  .ra img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ini { color: var(--text); font-weight: 700; border: 1px dashed var(--muted); }
</style>
