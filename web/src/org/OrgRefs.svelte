<script lang="ts">
  import { ot } from './oc18n';
  import RefAvatar from './RefAvatar.svelte';

  // Ряд справочных подразделений: вышестоящие или чужие. Рисуются отдельно от дерева, без линий и стрелок.
  let { refs, title, lang, onpick }: { refs: any[]; title: string; lang: string; onpick: (r: any) => void } = $props();
  const nm = (r: any) => (lang === 'uz' && r.name_uz) || r.name_ru;
</script>

{#if refs.length}
  <section class="rr" aria-label={title}>
    <h4>{title} <span class="muted xs">· {ot('refHint')}</span></h4>
    <div class="row">
      {#each refs as r (r.id)}
        <button type="button" class="rb" onclick={() => onpick(r)}>
          <span class="rk">{ot('ref')}</span>
          <b class="rn">{nm(r)}</b>
          {#if r.note}<span class="rt">{r.note}</span>{/if}
          <span class="av">{#each r.people.slice(0, 4) as p (p.id)}<RefAvatar {p} size={26} />{/each}{#if r.people.length > 4}<span class="more">+{r.people.length - 4}</span>{/if}</span>
          <span class="muted xs">{ot('contactsN')} {r.people.length}</span>
        </button>
      {/each}
    </div>
  </section>
{/if}

<style>
  .rr { margin: 0 0 14px; }
  h4 { margin: 0 0 8px; font-size: 13px; color: var(--muted); font-weight: 600; }
  .row { display: flex; flex-wrap: wrap; gap: 12px; }
  .rb { width: 220px; border: 1.5px dashed color-mix(in srgb, var(--muted) 70%, transparent); background: var(--card); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left; cursor: pointer; font: inherit; color: var(--text); }
  .rb:hover { background: var(--card-2); border-style: solid; }
  .rk { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
  .rn { font-size: 15px; overflow-wrap: anywhere; }
  .rt { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .av { display: inline-flex; margin: 4px 0 2px; align-items: center; }
  .av :global(.av), .av :global(.ra) { margin-left: -6px; box-shadow: 0 0 0 2px var(--card); }
  .av > :global(:first-child) { margin-left: 0; }
  .more { margin-left: 4px; font-size: 11px; color: var(--muted); }
</style>
