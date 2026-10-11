<script lang="ts">
  import Avatar from '../components/Avatar.svelte';
  import { wt } from '../lib/w18n';
  import { ot } from './oc18n';
  import { matches, type OcModel, type OcNode } from './oc-model';

  let { m, top, q, picked, onpick }: { m: OcModel; top: OcNode[]; q: string; picked: number | null; onpick: (n: OcNode) => void } = $props();
  let open: Record<number, boolean> = $state({});
  // подразделения и отделы раскрыты, группы свёрнуты; при поиске раскрывается путь к найденным
  const hit = (n: OcNode) => n.people.some((p) => matches(p, q));
  const hasMatchBelow = (n: OcNode, self = true): boolean => !!q.trim() && ((self && hit(n)) || (m.kids.get(n.id) ?? []).some((c) => hasMatchBelow(c, true)));
  const openByQuery = (n: OcNode) => open[n.id] ?? (q.trim() ? (m.kids.get(n.id) ?? []).some((c) => hasMatchBelow(c, true)) || n.kind !== 'group' : n.kind !== 'group');
</script>

{#snippet card(n: OcNode)}
  {@const ch = m.kids.get(n.id) ?? []}
  <div class="box" class:picked={picked === n.id} class:hit={hit(n)} class:mine={n.mine} style:--dc={m.colorOf(n)}>
    <span class="bav">
      {#if n.head}<Avatar u={n.head} size={44} />{:else}<span class="bav-none">{n.kind === 'root' ? '★' : '·'}</span>{/if}
    </span>
    <button type="button" class="bbody" onclick={() => onpick(n)} aria-label={m.nm(n)}>
      <span class="bk">{wt(`o_k_${n.kind}`)}</span>
      <b class="bn">{m.nm(n)}</b>
      <span class="bh">{n.head ? n.head.name : ot('noHead')}</span>
      {#if n.people.length}
        <span class="stack-av">{#each n.people.slice(0, 5) as p (p.id)}<Avatar u={p} size={24} />{/each}{#if n.people.length > 5}<span class="more">+{n.people.length - 5}</span>{/if}</span>
      {/if}
      <span class="bc"><b>{n.total}</b> {ot('people')}{#if n.total !== n.direct && n.direct} · {n.direct} {ot('direct')}{/if}</span>
    </button>
    {#if ch.length}
      <button type="button" class="tgl" aria-expanded={openByQuery(n)} aria-label={openByQuery(n) ? ot('collapse') : ot('expand')} onclick={() => (open[n.id] = !openByQuery(n))}>{openByQuery(n) ? '−' : `+${ch.length}`}</button>
    {/if}
  </div>
{/snippet}

{#snippet tree(list: OcNode[])}
  <ul>
    {#each list as n (n.id)}
      {@const ch = m.kids.get(n.id) ?? []}
      <li>
        {@render card(n)}
        {#if ch.length && openByQuery(n)}{@render tree(ch)}{/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div class="oc" role="tree">{@render tree(top)}</div>

<style>
  .oc { --line: color-mix(in srgb, var(--muted) 55%, transparent); overflow: auto; padding: 24px 8px 28px; background: var(--card); border: 1px solid var(--border); border-radius: 16px; min-height: 280px; }
  .oc ul { display: flex; justify-content: center; margin: 0; padding: 22px 0 0; position: relative; list-style: none; width: max-content; min-width: 100%; }
  .oc > ul { padding-top: 0; }
  .oc li { display: flex; flex-direction: column; align-items: center; position: relative; padding: 22px 7px 0; }
  .oc > ul > li { padding-top: 0; }
  .oc li::before, .oc li::after { content: ''; position: absolute; top: 0; right: 50%; width: 50%; height: 22px; border-top: 2px solid var(--line); }
  .oc li::after { right: auto; left: 50%; border-left: 2px solid var(--line); }
  .oc > ul > li::before, .oc > ul > li::after { display: none; }
  .oc li:only-child::before, .oc li:only-child::after { display: none; }
  .oc li:only-child { padding-top: 0; }
  .oc li:first-child::before, .oc li:last-child::after { border: 0 none; }
  .oc li:last-child::before { border-right: 2px solid var(--line); border-radius: 0 8px 0 0; }
  .oc li:first-child::after { border-radius: 8px 0 0 0; }
  .oc ul ul::before { content: ''; position: absolute; top: 0; left: 50%; border-left: 2px solid var(--line); height: 22px; }

  .box { position: relative; width: 196px; margin-top: 22px; }
  .bav { position: absolute; top: -22px; left: 50%; transform: translateX(-50%); z-index: 1; border-radius: 50%; box-shadow: 0 0 0 3px var(--card); display: grid; }
  .bav-none { width: 44px; height: 44px; border-radius: 50%; background: var(--card-2); color: var(--muted); display: grid; place-items: center; font-weight: 700; }
  .bbody { width: 100%; border: 1px solid color-mix(in srgb, var(--dc) 55%, var(--border)); border-top: 4px solid var(--dc); background: color-mix(in srgb, var(--dc) 13%, var(--card)); border-radius: 12px; padding: 28px 10px 10px; display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; cursor: pointer; font: inherit; color: var(--text); }
  .bbody:hover { background: color-mix(in srgb, var(--dc) 22%, var(--card)); }
  .picked .bbody { outline: 2px solid var(--text); outline-offset: 2px; }
  .hit .bbody { box-shadow: 0 0 0 3px var(--accent); }
  .mine .bbody { border-color: var(--text); }
  .bk { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
  .bn { font-size: 14px; line-height: 1.2; overflow-wrap: anywhere; }
  .bh { font-size: 12px; color: var(--muted); overflow-wrap: anywhere; }
  .bc { font-size: 12px; color: var(--muted); margin-top: 2px; }
  .bc b { color: var(--text); }
  .stack-av { display: inline-flex; margin-top: 6px; align-items: center; }
  .stack-av :global(.av) { margin-left: -6px; box-shadow: 0 0 0 2px var(--card); }
  .stack-av :global(.av:first-child) { margin-left: 0; }
  .more { margin-left: 4px; font-size: 11px; color: var(--muted); }
  .tgl { position: absolute; left: 50%; bottom: -11px; transform: translateX(-50%); min-width: 26px; height: 22px; padding: 0 7px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--text); font-size: 12px; font-weight: 700; cursor: pointer; z-index: 2; }
  .tgl:hover { background: var(--chip); }
  .oc li:has(> ul) > .box { margin-bottom: 11px; }
</style>
