<script lang="ts">
  import { api } from '../lib/api';
  import { app, go } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import { HELP } from '../lib/help-content';
  import { fillPaths, hubLabel, navHubs, adminHome } from '../lib/nav';
  import { GL_TEXT, filterGlossary, filterRetired, type GlossaryEntry } from '../lib/glossary';
  import { pointAt } from '../lib/tour.svelte';
  import { topics, loadTopics, type TopicMeta } from '../lib/help.svelte';
  import AskLeader from '../team/AskLeader.svelte';

  loadTopics();
  let q = $state(''), asking = $state(false), res: any = $state(null), openId = $state(''), asked = $state('');
  // темы сгруппированы по разделам меню; режим «Управление» и утилиты внизу колонки — отдельные группы (hubLabel знает manage и util)
  const GROUPS = ['home', 'chat', 'work', 'learn', 'grow', 'company', 'team', 'manage', 'util'];
  const gname = (g: string) => hubLabel(g);
  const title = (t: TopicMeta) => t.title[app.lang];
  const steps = (id: string) => (HELP[id]?.[app.lang] ?? HELP[id]?.ru ?? []).map(fillPaths);
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

  // «Словарь портала» (ТЗ №4, E4): единственное значение каждого названия. Поле фильтра ищет по названию и определению на обоих языках
  // и по старым названиям: «Развитие» находит строку «Развитие → теперь «Рост»».
  let gq = $state(''), glOpen = $state(false);
  const gl = (k: keyof typeof GL_TEXT) => GL_TEXT[k][app.lang];
  const glossary = $derived(filterGlossary(gq)), retired = $derived(filterRetired(gq));
  // ссылка на раздел: первая видимая вкладка раздела; режим «Управление» — его первая вкладка; утилиты — свой адрес; раздела нет у человека — ссылки нет
  const hubHref = (g: GlossaryEntry): string | null => (g.href ?? (g.hub === 'manage' ? adminHome() : navHubs().find((h) => h.id === g.hub)?.items[0]?.href ?? null));
</script>

<header class="page-head"><div><h1>{wt('hp_title')}</h1><p class="sub">{wt('hp_sub')}</p></div><div class="head-actions"><AskLeader /></div></header>

<section class="card stack u-49f14f8">
  <h3 class="card-title">{wt('hp_q_title')}</h3>
  <form class="row u-33fcd4c" onsubmit={ask}>
    <input class="u-97445a8" bind:value={q} placeholder={wt('hp_ask_ph')} />
    <button class="btn grad" disabled={asking || q.trim().length < 3}>{wt('hp_ask')}</button>
  </form>
  {#if asking}<span class="spin"></span>{/if}
  {#if res}
    {#if res.topic}
      {@const t = topicById(res.topic.id)}
      <div class="hp-res">
        {#if res.answer}<p class="small">{res.ai ? '' : ''}{res.answer}</p>{/if}
        <b>{title(res.topic)}</b>
        <ol class="hp-steps">{#each steps(res.topic.id) as s}<li>{s}</li>{/each}</ol>
        <div class="row wrap u-33fcd4c">{#if t}<button class="btn grad sm" onclick={() => show(t)}>{wt('hp_show')}</button>{/if}<a class="btn sm" href={'#' + res.topic.route}>{wt('hp_where')}</a></div>
        {#if res.alternatives?.length}<div class="muted xs">{#each res.alternatives as a}<button class="g-act" onclick={() => (openId = a.id)}>{title(a)}</button> {/each}</div>{/if}
      </div>
    {:else}<p class="muted small">{wt('hp_none')}</p>{/if}
  {/if}
</section>

<details class="card gl" bind:open={glOpen}>
  <summary>{gl('title')}</summary>
  <div class="stack gl-body">
    <input type="search" bind:value={gq} placeholder={gl('ph')} aria-label={gl('title')} />
    {#if glossary.length}
      <dl class="gl-list">
        {#each glossary as g (g.term.ru)}
          {@const href = g.hub ? hubHref(g) : null}
          <div class="gl-row">
            <dt>{g.term[app.lang]}</dt>
            <dd>{g.def[app.lang]}{#if href} <a class="gl-go" href={'#' + href}>{gl('go')} →</a>{/if}</dd>
          </div>
        {/each}
      </dl>
    {/if}
    {#if retired.length}
      <p class="small gl-old"><b>{gl('retired')}:</b> {#each retired as r, i}{#if i}; {/if}<span>{r.old[app.lang]} → {gl('now')} {r.now[app.lang]}</span>{/each}.</p>
    {:else if !glossary.length}<p class="muted small">{gl('none')}</p>{/if}
  </div>
</details>

<div class="row u-0fb9216"><h3 class="card-title u-1169661">{wt('hp_topics')}</h3><span class="sp"></span></div>
<input class="u-87c136d" placeholder={wt('hp_search_ph')} bind:value={q} />

<div class="stack">
  {#each GROUPS as g}
    {#if groupOf(g).length}
      <section class="card">
        <h3 class="card-title u-fdf33f2">{gname(g)}</h3>
        <div class="hp-list">
          {#each groupOf(g) as t (t.id)}
            <div class="hp-item" class:open={openId === t.id} id={t.id}>
              <button class="hp-q" onclick={() => (openId = openId === t.id ? '' : t.id)} aria-expanded={openId === t.id}><span>{title(t)}</span><span class="hp-c">{openId === t.id ? '−' : '+'}</span></button>
              {#if openId === t.id}
                <ol class="hp-steps">{#each steps(t.id) as s}<li>{s}</li>{/each}</ol>
                <div class="row wrap u-baca9a4"><button class="btn grad sm" onclick={() => show(t)}>{wt('hp_show')}</button><a class="btn sm" href={'#' + t.route}>{wt('hp_where')}</a></div>
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
  .gl { margin-top: var(--sp-4); }
  .gl summary { cursor: pointer; font-weight: 600; font-size: var(--fs-3); }
  .gl-body { margin-top: var(--sp-3); }
  .gl-list { margin: 0; display: grid; }
  .gl-row { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: var(--sp-1) var(--sp-4); padding: var(--sp-3) 0; border-bottom: 1px solid var(--border); }
  .gl-row:last-child { border-bottom: 0; }
  .gl-row dt { font-weight: 600; }
  .gl-row dd { margin: 0; line-height: var(--lh-body); }
  .gl-go { white-space: nowrap; }
  .gl-old { line-height: var(--lh-body); }
  @media (max-width: 640px) { .gl-row { grid-template-columns: 1fr; } }
</style>
