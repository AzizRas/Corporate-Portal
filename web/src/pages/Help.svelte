<script lang="ts">
  import { api } from '../lib/api';
  import { app, go } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import { HELP } from '../lib/help-content';
  import { pointAt } from '../lib/tour.svelte';
  import { topics, loadTopics, type TopicMeta } from '../lib/help.svelte';
  import AskLeader from '../team/AskLeader.svelte';

  loadTopics();
  let q = $state(''), asking = $state(false), res: any = $state(null), openId = $state(''), asked = $state('');
  const GROUPS = ['main', 'learn', 'know', 'people', 'profile', 'manage'];
  const gname = (g: string) => wt(`g_${g}`);
  const title = (t: TopicMeta) => t.title[app.lang];
  const steps = (id: string) => HELP[id]?.[app.lang] ?? HELP[id]?.ru ?? [];
  const filtered = $derived(topics.list.filter((t) => !q.trim() || `${t.title.ru} ${t.title.uz} ${steps(t.id).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase())));
  const groupOf = (g: string) => filtered.filter((t) => t.group === g);

  // «спросить, как сделать»: тема подбирается по словам, а при работающем ИИ — моделью
  async function ask(e: Event) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    asking = true; res = null; asked = q.trim();
    try { res = await api.post('/api/help/ask', { query: asked }); if (res.topic) openId = res.topic.id; }
    catch { res = { topic: null, alternatives: [] }; } finally { asking = false; }
  }
  /** Подсветить кнопку на экране: переходим на страницу и показываем, где нажать. */
  function show(t: TopicMeta) {
    const targets = t.target ? [t.target, 'tab-' + t.target.replace(/^nav-/, ''), 'tab-more'] : [];
    go(t.route);
    setTimeout(() => pointAt(targets, title(t), steps(t.id)[0] ?? '', t.group), 450);
  }
  const topicById = (id: string) => topics.list.find((t) => t.id === id);
</script>

<header class="page-head"><div><h1>{wt('hp_title')}</h1><p class="sub">{wt('hp_sub')}</p></div><div class="head-actions"><AskLeader /></div></header>

<section class="card stack" style="margin-bottom:20px">
  <h3 class="card-title">{wt('hp_q_title')}</h3>
  <form class="row" style="gap:8px" onsubmit={ask}>
    <input style="flex:1" bind:value={q} placeholder={wt('hp_ask_ph')} />
    <button class="btn grad" disabled={asking || q.trim().length < 3}>{wt('hp_ask')}</button>
  </form>
  {#if asking}<span class="spin"></span>{/if}
  {#if res}
    {#if res.topic}
      {@const t = topicById(res.topic.id)}
      <div class="hp-res">
        {#if res.answer}<p class="small">{res.ai ? '✨ ' : ''}{res.answer}</p>{/if}
        <b>{title(res.topic)}</b>
        <ol class="hp-steps">{#each steps(res.topic.id) as s}<li>{s}</li>{/each}</ol>
        <div class="row wrap" style="gap:8px">{#if t}<button class="btn grad sm" onclick={() => show(t)}>{wt('hp_show')}</button>{/if}<a class="btn sm" href={'#' + res.topic.route}>{wt('hp_where')}</a></div>
        {#if res.alternatives?.length}<div class="muted xs">{#each res.alternatives as a}<button class="g-act" onclick={() => (openId = a.id)}>{title(a)}</button> {/each}</div>{/if}
      </div>
    {:else}<p class="muted small">{wt('hp_none')}</p>{/if}
  {/if}
</section>

<div class="row" style="gap:10px;margin-bottom:12px"><h3 class="card-title" style="margin:0">{wt('hp_topics')}</h3><span class="sp"></span></div>
<input placeholder={wt('hp_search_ph')} bind:value={q} style="margin-bottom:16px" />

<div class="stack">
  {#each GROUPS as g}
    {#if groupOf(g).length}
      <section class="card">
        <h3 class="card-title" style="margin-bottom:8px">{gname(g)}</h3>
        <div class="hp-list">
          {#each groupOf(g) as t (t.id)}
            <div class="hp-item" class:open={openId === t.id} id={t.id}>
              <button class="hp-q" onclick={() => (openId = openId === t.id ? '' : t.id)} aria-expanded={openId === t.id}><span>{title(t)}</span><span class="hp-c">{openId === t.id ? '−' : '+'}</span></button>
              {#if openId === t.id}
                <ol class="hp-steps">{#each steps(t.id) as s}<li>{s}</li>{/each}</ol>
                <div class="row wrap" style="gap:8px;margin:6px 0 10px"><button class="btn grad sm" onclick={() => show(t)}>{wt('hp_show')}</button><a class="btn sm" href={'#' + t.route}>{wt('hp_where')}</a></div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/each}
</div>

<style>
  .hp-res { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 14px; background: var(--card-2); }
  .hp-steps { margin: 4px 0 0; padding-left: 22px; display: flex; flex-direction: column; gap: 6px; line-height: 1.5; font-size: 14px; }
  .hp-list { display: flex; flex-direction: column; }
  .hp-item { border-bottom: 1px solid var(--border); padding: 2px 0; }
  .hp-item:last-child { border-bottom: 0; }
  .hp-q { display: flex; justify-content: space-between; align-items: center; width: 100%; border: 0; background: none; color: inherit; font: inherit; font-weight: 600; padding: 12px 4px; cursor: pointer; text-align: left; gap: 12px; }
  .hp-c { color: var(--muted); font-size: 20px; line-height: 1; }
</style>
