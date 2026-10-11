<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import PageHelp from '../components/PageHelp.svelte';
  import { api } from '../lib/api';
  import { app, go, has } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { md } from '../lib/md';
  import { pick, fmtDate } from '../lib/format';
  import KbAsk from '../components/KbAsk.svelte';

  let { id }: { id: number | null } = $props();
  let sections: any[] = $state([]), items: any[] = $state([]), q = $state(new URLSearchParams(location.hash.split('?')[1] ?? '').get('q') ?? '');
  let section: number | null = $state(null), art: any = $state(null), vote: boolean | null = $state(null), asked = $state(false), loading = $state(false);
  let timer: any;

  api.get('/api/kb/sections').then((r) => (sections = r.sections));
  async function run() {
    loading = true;
    const r = await api.get(`/api/kb/search?q=${encodeURIComponent(q)}${section ? `&section=${section}` : ''}`);
    items = r.items; loading = false; asked = false;
  }
  $effect(() => { if (id == null) { q; section; clearTimeout(timer); timer = setTimeout(run, 250); } });
  $effect(() => { if (id != null) api.get(`/api/kb/articles/${id}`).then((r) => { art = r.article; vote = r.article.my_vote; }).catch(() => (art = null)); });

  const secName = (sid: number) => { const s = sections.find((x) => x.id === sid); return s ? pick(s, 'title') : ''; };
  async function rate(h: boolean) { vote = h; await api.post(`/api/kb/articles/${id}/feedback`, { helpful: h }); }
  async function ask() { await api.post('/api/kb/unanswered', { query: q }); asked = true; }
</script>

{#if id != null}
  <a href="#/kb" class="small">← {t('back')}</a>
  {#if art}
    <article class="card u-578820d">
      <span class="chip u-da12f28">{secName(art.section_id)}</span>
      <h1 class="u-e3fe353">{pick(art, 'title')}<PageHelp topic="kb_search" /></h1>
      <p class="muted small u-9540c9b">{t('kb_owner')}: {art.owner_name ?? '—'} · {t('kb_updated')}: {fmtDate(art.updated_at)}
        {#if art.overdue}<span class="pill-warn"> · {t('kb_overdue')}</span>{/if}
        {#if art.status !== 'published'}<span class="pill-warn"> · {art.status}</span>{/if}</p>
      <div class="md">{@html md((app.lang === 'uz' && art.body_uz) || art.body_ru)}</div>
      <div class="row u-e143a47">
        <span class="muted">{t('kb_helpful')}</span>
        <button class="btn sm" class:primary={vote === true} onclick={() => rate(true)}><Icon inline name="thumb-up" /> {t('yes')}</button>
        <button class="btn sm" class:primary={vote === false} onclick={() => rate(false)}><Icon inline name="thumb-down" /> {t('no')}</button>
        {#if vote !== null}<span class="pill-ok small">{t('kb_thanks')}</span>{/if}
      </div>
    </article>
  {:else}<span class="spin"></span>{/if}
{:else}
  <header class="page-head"><div><h1>{t('kb_title')}</h1><p class="sub">{t('kb_sub')}</p></div></header>
  <KbAsk />
  <div class="stack u-1d34c09">
    <input class="u-8706d56" type="search" placeholder={t('kb_ph')} bind:value={q} />
    <div class="tabs u-1169661">
      <button class:on={!section} onclick={() => (section = null)}>{t('kb_all')}</button>
      {#each sections as s}<button class:on={section === s.id} onclick={() => (section = s.id)}>{pick(s, 'title')} · {s.n}</button>{/each}
    </div>
    {#each items as a}
      <a class="card u-92e112d" href="#/kb/{a.id}">
        <div class="u-e215abf">{pick(a, 'title')}</div>
        {#if a.snippet_ru}<p class="muted small u-fe7b497">{(app.lang === 'uz' && a.snippet_uz) || a.snippet_ru}</p>{/if}
      </a>
    {/each}
    {#if !loading && !items.length}
      <div class="card"><p>{t('kb_empty')}</p>
        {#if q.trim()}<p class="muted small u-1388c02">{t('kb_ask')}</p>
          {#if asked}<div class="alert ok">{t('kb_asked')}</div>{:else}<button class="btn grad" onclick={ask}>{t('send')}: «{q}»</button>{/if}{/if}
      </div>
    {/if}
  </div>
{/if}
