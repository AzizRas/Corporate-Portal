<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  // Страница #/library: поиск и фильтры, «Рекомендовано мне» по зонам роста, статусы «хочу / читаю / изучено».
  import { api } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { lt, ln } from './l18n';
  import { parseEmbed } from './embed';
  import LibCard from './LibCard.svelte';
  import LibForm from './LibForm.svelte';
  import LibPlayer from './LibPlayer.svelte';
  import './library.css';

  let data: any = $state(null), err = $state(false);
  let text = $state(''), kind = $state(''), category = $state(''), status = $state(''), all = $state(false);
  let form: any = $state(null), playing: any = $state(null);
  let timer: ReturnType<typeof setTimeout> | undefined, seq = 0;

  async function load() {
    const my = ++seq;
    const p = new URLSearchParams();
    if (text.trim()) p.set('q', text.trim());
    if (kind) p.set('kind', kind);
    if (category) p.set('category', category);
    if (status) p.set('status', status);
    if (all) p.set('all', '1');
    try { const r = await api.get(`/api/library?${p}`); if (my === seq) { data = r; err = false; } } catch { if (my === seq) err = true; }
  }
  load();
  // поиск — с небольшой задержкой, остальные фильтры — сразу
  function typing() { clearTimeout(timer); timer = setTimeout(load, 250); }

  const filtering = $derived(!!(text.trim() || kind || category || status || all));
  const total = $derived(data ? data.items.length : 0);

  function patchLocal(id: number, my: any) {
    for (const list of [data.items, data.recommended]) for (const it of list) if (it.id === id) it.my = my;
  }
  async function setStatus(id: number, s: string | null) {
    const before = data.items.find((x: any) => x.id === id)?.my ?? data.recommended.find((x: any) => x.id === id)?.my ?? null;
    patchLocal(id, s ? { status: s, note: before?.note ?? '' } : null);
    try {
      await api.put(`/api/library/${id}/progress`, { status: s });
      const r = await api.get('/api/library?' + new URLSearchParams(all ? { all: '1' } : {}));
      data.done = r.done; data.recommended = r.recommended;
    } catch { patchLocal(id, before); }
  }
  async function toggle(it: any) {
    if (it.active && !confirm(lt('hide_q'))) return;
    try {
      if (it.active) await api.del(`/api/library/${it.id}`);
      else await api.put(`/api/library/${it.id}`, { ...it, comp: it.comp, active: true });
      await load();
    } catch { err = true; }
  }
  const saved = () => { form = null; load(); };
</script>

<header class="page-head">
  <div><h1>{lt('title')}<PageHelp topic="library" /></h1><p class="sub">{lt('sub')}</p></div>
  <div class="head-actions">
    {#if data}<span class="chip grad">✓ {lt('done_cnt')}: {data.done}</span>{/if}
    {#if data?.can_edit}<button class="btn grad" onclick={() => (form = {})}>＋ {lt('add')}</button>{/if}
  </div>
</header>

{#if err && !data}<div class="alert">{lt('err')}</div>
{:else if !data}<span class="spin"></span>
{:else}
  {#if !filtering && data.recommended.length}
    <section class="l-rec">
      <h2 class="l-sec">{lt('rec_title')}</h2>
      <p class="muted small">{lt('rec_sub')}</p>
      <div class="l-gaps"><span class="muted xs">{lt('rec_gaps')}:</span>{#each data.gaps as g}<span class="l-tag comp">{ln(g.name)}</span>{/each}</div>
      <div class="l-grid">
        {#each data.recommended as it (it.id)}
          <LibCard {it} onstatus={setStatus} onplay={(x) => (playing = x)} onedit={(x) => (form = x)} onhide={toggle} canEdit={data.can_edit} />
        {/each}
      </div>
    </section>
  {/if}

  <div class="l-bar">
    <input class="s" type="search" placeholder={lt('search')} bind:value={text} oninput={typing} aria-label={lt('search')} />
    <select bind:value={category} onchange={load} aria-label={lt('all_cat')}><option value="">{lt('all_cat')}</option>{#each data.categories as c}<option value={c}>{c}</option>{/each}</select>
    <select bind:value={status} onchange={load} aria-label={lt('all_status')}><option value="">{lt('all_status')}</option>{#each ['wish', 'reading', 'done'] as s}<option value={s}>{lt('s_' + s)}</option>{/each}</select>
    {#if data.can_edit}<label class="chk small"><input type="checkbox" bind:checked={all} onchange={load} />{lt('show_hidden')}</label>{/if}
  </div>
  <div class="l-kinds">
    <button class:on={!kind} onclick={() => { kind = ''; load(); }}>{lt('all')}</button>
    {#each ['book', 'video', 'article', 'course', 'link'] as k}<button class:on={kind === k} onclick={() => { kind = k; load(); }}>{lt('k_' + k)}</button>{/each}
  </div>

  {#if !total}<div class="card"><p class="muted">{lt('empty')}</p></div>{/if}
  <div class="l-grid">
    {#each data.items as it (it.id)}
      <LibCard {it} onstatus={setStatus} onplay={(x) => (playing = x)} onedit={(x) => (form = x)} onhide={toggle} canEdit={data.can_edit} />
    {/each}
  </div>
{/if}

{#if form}<LibForm item={form.id ? form : null} categories={data.categories} comps={data.comps} onclose={() => (form = null)} onsaved={saved} />{/if}
{#if playing}
  <Modal wide onclose={() => (playing = null)}>
    <h2 style="font-size:19px">{playing.title}</h2>
    <LibPlayer e={parseEmbed(playing.url)} title={playing.title} />
    {#if playing.author}<p class="muted small" style="margin-top:10px">{playing.author}</p>{/if}
    <div class="row" style="margin-top:14px;justify-content:flex-end"><a class="btn" href={playing.url} target="_blank" rel="noopener noreferrer">{lt('read')}</a><button class="btn" onclick={() => (playing = null)}>✕</button></div>
  </Modal>
{/if}
