<script lang="ts">
  import { lt, ln } from './l18n';
  import { parseEmbed } from './embed';

  let { it, canEdit = false, onstatus, onplay, onedit, onhide }: {
    it: any; canEdit?: boolean; onstatus: (id: number, s: string | null) => void; onplay: (it: any) => void; onedit: (it: any) => void; onhide: (it: any) => void;
  } = $props();
  const ICONS: Record<string, string> = { book: '📖', video: '🎬', link: '🔗', article: '📰', course: '🎓' };
  const e = $derived(parseEmbed(it.url));
  const tags = $derived(String(it.tags || '').split(',').map((x: string) => x.trim()).filter(Boolean).slice(0, 4));
</script>

<article class="card l-card" class:off={!it.active}>
  <div class="l-top">
    <div class="l-ic" aria-hidden="true">{ICONS[it.kind] ?? '📄'}</div>
    <div style="min-width:0">
      <h3>{it.title}</h3>
      {#if it.author}<div class="au">{it.author}</div>{/if}
    </div>
  </div>
  {#if it.descr}<p class="ds">{it.descr}</p>{/if}
  <div class="l-tags">
    <span class="l-tag">{lt('k_' + it.kind)}</span>
    {#if it.category}<span class="l-tag">{it.category}</span>{/if}
    {#if it.level}<span class="l-tag">{lt('l_' + it.level)}</span>{/if}
    {#if it.comp_name}<span class="l-tag comp">{lt('develops')}: {ln(it.comp_name)}</span>{/if}
    {#each tags as tg}<span class="l-tag">#{tg}</span>{/each}
    {#if !it.active}<span class="l-tag off">{lt('hidden')}</span>{/if}
  </div>
  <div class="l-st" role="group">
    {#each ['wish', 'reading', 'done'] as s}
      <button class:on={it.my?.status === s} class:done={s === 'done'} aria-pressed={it.my?.status === s} onclick={() => onstatus(it.id, it.my?.status === s ? null : s)}>{lt('s_' + s)}</button>
    {/each}
  </div>
  <div class="l-act">
    {#if e.type === 'iframe' || e.type === 'video'}<button class="btn sm primary" onclick={() => onplay(it)}>▶ {lt('watch')}</button>
    {:else if e.type === 'link'}<a class="btn sm primary" href={e.href} target="_blank" rel="noopener noreferrer">{lt('open')} · {e.host}</a>
    {:else}<span class="muted xs">{lt('no_link')}</span>{/if}
    <span class="sp"></span>
    {#if canEdit}
      <button class="btn sm" onclick={() => onedit(it)}>{lt('edit')}</button>
      <button class="btn sm" onclick={() => onhide(it)}>{it.active ? lt('hide') : lt('show')}</button>
    {/if}
  </div>
</article>
