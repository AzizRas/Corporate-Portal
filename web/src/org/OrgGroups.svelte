<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import Avatar from '../components/Avatar.svelte';
  import { wt } from '../lib/w18n';
  import { ot } from './oc18n';
  import { matches, type OcModel, type OcNode } from './oc-model';

  let { m, divs, q, onpick }: { m: OcModel; divs: OcNode[]; q: string; onpick: (n: OcNode) => void } = $props();
  let all: Record<number, boolean> = $state({});
  const LIMIT = 10;
  const filtering = $derived(!!q.trim());

  // по каждому подразделению: узлы, где есть люди (при поиске — только совпавшие)
  const cards = $derived(divs.map((d) => {
    const secs = m.sub(d.id).map((n) => ({ n, people: filtering ? n.people.filter((p) => matches(p, q)) : n.people })).filter((s) => s.people.length);
    const count = secs.reduce((a, s) => a + s.people.length, 0);
    return { d, secs, count };
  }).filter((c) => !filtering || c.count));
  const rel = (n: OcNode, d: OcNode) => (n.id === d.id ? '' : m.pathOf(n).split(' / ').slice(m.pathOf(d).split(' / ').length).join(' / '));
</script>

<div class="gr">
  {#each cards as c (c.d.id)}
    {@const col = m.colorOf(c.d)}
    {@const full = all[c.d.id] || filtering}
    <section class="dv" style:--dc={col}>
      <header>
        <button type="button" class="dh" onclick={() => onpick(c.d)}>
          <span class="dn"><b>{m.nm(c.d)}</b><span class="muted xs">{wt(`o_k_${c.d.kind}`)}</span></span>
          <span class="dc">{c.d.total}</span>
        </button>
        <div class="hd">
          {#if c.d.head}<Avatar u={c.d.head} size={30} /><span><b>{c.d.head.name}</b><span class="muted xs"> · {c.d.head.position || ot('head')}</span></span>{:else}<span class="muted small">{ot('noHead')}</span>{/if}
        </div>
      </header>
      {#if !c.secs.length}<p class="muted small pad">{ot('none')}</p>{/if}
      {#each c.secs as s, si (s.n.id)}
        {@const before = c.secs.slice(0, si).reduce((a, x) => a + x.people.length, 0)}
        {#if full || before < LIMIT}
          <div class="sec">
            {#if rel(s.n, c.d)}<button type="button" class="sh" onclick={() => onpick(s.n)}>{rel(s.n, c.d)} <span class="muted xs">{s.people.length}</span></button>{/if}
            {#each s.people.slice(0, full ? undefined : Math.max(1, LIMIT - before)) as p (p.id)}
              <div class="pr" class:hit={matches(p, q)}>
                <Avatar u={p} size={34} />
                <span class="pi"><b>{p.name}</b><span class="muted xs">{p.position}</span></span>
                {#if p.employment === 'intern'}<span class="chip sm">{ot('intern')}</span>{/if}
                {#if p.on_leave}<span class="chip sm"><Icon inline name="palm" /> {ot('onLeave')}</span>{/if}
              </div>
            {/each}
          </div>
        {/if}
      {/each}
      {#if !full && c.count > LIMIT}<button type="button" class="more" onclick={() => (all[c.d.id] = true)}>{ot('more', { n: c.count - LIMIT })}</button>
      {:else if all[c.d.id] && !filtering && c.count > LIMIT}<button type="button" class="more" onclick={() => (all[c.d.id] = false)}>{ot('less')}</button>{/if}
    </section>
  {:else}<p class="muted">{filtering ? ot('nothing') : ot('empty')}</p>{/each}
</div>

<style>
  .gr { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; align-items: start; }
  .dv { background: var(--card); border: 1px solid var(--border); border-top: 4px solid var(--dc); border-radius: 16px; overflow: hidden; }
  header { background: color-mix(in srgb, var(--dc) 12%, var(--card)); padding: 12px 14px 12px; display: flex; flex-direction: column; gap: 10px; }
  .dh { display: flex; justify-content: space-between; align-items: center; gap: 10px; border: 0; background: none; padding: 0; text-align: left; cursor: pointer; font: inherit; color: var(--text); }
  .dn { display: flex; flex-direction: column; min-width: 0; }
  .dn b { font-size: 17px; overflow-wrap: anywhere; }
  .dc { min-width: 36px; height: 36px; border-radius: 50%; background: var(--dc); color: #0e0e10; display: grid; place-items: center; font-weight: 700; padding: 0 6px; flex: none; }
  .hd { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .hd span { min-width: 0; overflow-wrap: anywhere; }
  .pad { padding: 14px; }
  .sec { padding: 4px 14px; }
  .sh { border: 0; background: none; padding: 10px 0 4px; font: inherit; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); cursor: pointer; text-align: left; }
  .sh:hover { color: var(--text); }
  .pr { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--border); }
  .sec .pr:first-of-type { border-top: 0; }
  .pr.hit { background: color-mix(in srgb, var(--accent) 14%, transparent); border-radius: 8px; padding-left: 6px; }
  .pi { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.3; }
  .pi b { font-weight: 600; font-size: 14px; overflow-wrap: anywhere; }
  .chip.sm { padding: 2px 8px; font-size: 11px; }
  .more { width: 100%; border: 0; border-top: 1px solid var(--border); background: none; padding: 11px; color: var(--accent-ink); font: inherit; font-weight: 600; cursor: pointer; }
  .more:hover { background: var(--card-2); }
</style>
