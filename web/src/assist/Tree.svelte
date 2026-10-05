<script lang="ts">
  import { untrack } from 'svelte';
  import { A, openTree } from './store.svelte';
  import { go } from '../lib/state.svelte';
  import { at } from './i18n';
  import { hashFor } from './logic';
  import Outcome from './Outcome.svelte';

  let { kind, appId = null, symId, fromApp = null }: { kind: 'dev' | 'flow' | 'safe'; appId?: string | null; symId: string; fromApp?: string | null } = $props();
  const D = $derived(A.data!);

  // что за дерево: симптом техники, сценарий звонка или экран безопасности
  const app = $derived(kind === 'dev' ? (D.DATA as any[]).find((d) => d.id === appId) : kind === 'safe' && fromApp ? (D.DATA as any[]).find((d) => d.id === fromApp) : null);
  const sym = $derived.by(() => {
    if (kind === 'dev') return app?.symptoms.find((s: any) => s.id === symId);
    if (kind === 'flow') return (D.FLOWS as any[]).find((f) => f.id === symId);
    const o = D.SAFE?.[symId];
    return o ? { name: o.title, start: 'x', nodes: { x: { out: o } } } : null;
  });

  // ссылка симптома на экран безопасности или на другое дерево
  $effect(() => { if (kind === 'dev' && sym?.go) go(hashFor(sym.go, appId).slice(1)); });

  $effect(() => {
    if (!sym || sym.go) return;
    untrack(() => {
      const t = A.tree;
      if (!t || t.kind !== kind || t.symId !== symId || t.appId !== (kind === 'safe' ? fromApp : appId)) {
        openTree({ kind, appId: kind === 'safe' ? fromApp : appId, symId, safeKey: kind === 'safe' ? symId : undefined, start: sym.start });
      }
    });
  });

  const t = $derived(A.tree && A.tree.kind === kind && A.tree.symId === symId ? A.tree : null);
  const nd = $derived(t && sym ? sym.nodes[t.node] : null);

  function choose(i: number) {
    if (!t || !nd?.opts) return;
    const o = nd.opts[i];
    if (!o) return;
    if (o.go) { go(hashFor(o.go, app?.id ?? fromApp).slice(1)); return; }
    t.path.push({ q: nd.q, a: o.l, node: t.node });
    t.node = o.to;
    window.scrollTo({ top: 0 });
  }
  function back() {
    if (!t) return;
    if (!t.path.length) { leave(); return; }
    const last = t.path.pop()!;
    t.node = last.node;
  }
  function leave() {
    if (kind === 'dev') go(`/assist/app/${appId}`);
    else if (kind === 'safe') go('/assist/safety');
    else go('/assist');
  }
  function restart() { if (t && sym) { t.path = []; t.node = sym.start; window.scrollTo({ top: 0 }); } }

  function key(e: KeyboardEvent) {
    const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.key === 'Escape') { back(); return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && nd?.opts) choose(n - 1);
  }
  const crumbs = $derived(kind === 'flow' ? at('crumb_call') : kind === 'safe' ? at('crumb_safe') : at('crumb_sym'));
</script>

<svelte:window onkeydown={key} />

{#if !sym}
  <div class="box gap">{at('not_found')} <a href="#/assist">{at('new_call')}</a></div>
{:else if t}
  <div class="as-crumbs">
    {#if kind === 'dev'}<a href="#/assist/safety">{at('rt_start')}</a> / <a href="#/assist/app/{app.id}">{app.name}</a> / {at('crumb_sym')}
    {:else if kind === 'safe'}<a href="#/assist/safety">{at('rt_start')}</a> / {at('crumb_safe')}
    {:else}<a href="#/assist">{at('new_call')}</a> / {crumbs}{/if}
  </div>
  <h1 class="as-h1">{sym.name}</h1>

  {#if kind === 'dev' && A.brandId === 'ziffler' && app && ((app.id === 'ac' && sym.id === 'a4') || (app.id === 'washer' && sym.id === 'w6'))}
    <div class="box ok"><b>Ziffler:</b> {at('ziffler_hint')} <a class="cp" href="#/assist/codes">{at('nav_codes')}</a></div>
  {/if}

  {#if !nd}
    <div class="box warn"><b>{at('tree_err')}.</b> {at('tree_err_t', { n: t.node })}</div>
  {:else}
    {#if nd.q}<p class="as-sub">{at('step_hint', { n: t.path.length + 1, m: Math.min(nd.opts.length, 9) })}</p>{/if}
    <div class="rail">
      {#each t.path as s}
        <div class="step"><span class="dot done" aria-hidden="true">✓</span><div><div class="lbl">{s.q}</div><div class="val">{s.a}</div></div></div>
      {/each}
      {#if nd.q}
        <div class="step">
          <span class="dot" aria-hidden="true">{t.path.length + 1}</span>
          <p class="q">{nd.q}</p>
          {#if nd.hint}<p class="as-hint" style="font-size:14px">{nd.hint}</p>{/if}
          <div class="opts">
            {#each nd.opts as o, i}
              <button class="opt" onclick={() => choose(i)}><kbd>{i + 1}</kbd><span>{o.l}</span>{#if o.go}<span class="go">→ {at('section')}</span>{/if}</button>
            {/each}
          </div>
        </div>
      {:else}
        <div class="step">
          <span class="dot done" aria-hidden="true">✓</span>
          <Outcome o={nd.out} {kind} {app} {sym} path={t.path} node={t.node} {symId} onRestart={restart} onToApp={leave} />
        </div>
      {/if}
    </div>
    {#if t.path.length}<div><button class="btn" onclick={back}>← {at('step_back')}</button></div>{/if}
  {/if}
{:else}
  <span class="spin"></span>
{/if}
