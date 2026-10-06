<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { api, ApiError } from '../lib/api';
  import { app, go, has } from '../lib/state.svelte';
  import { fmtDateTime } from '../lib/format';
  import { md } from '../lib/md';
  import { et, eHas } from './e18n';
  import AiFeedback from '../components/AiFeedback.svelte';

  type Kind = 'test_new' | 'test_edit' | 'article_new' | 'article_edit' | 'library_add' | 'assign';
  const lang = $derived(app.lang);
  const loc = (o: any, base: string) => (lang === 'uz' && o?.[`${base}_uz`]) || o?.[`${base}_ru`] || '';

  /* ---------- маршрут: #/editor?draft=<id> ---------- */
  const draftId = $derived.by(() => {
    const m = /[?&]draft=(\d+)/.exec(app.route);
    return m ? Number(m[1]) : null;
  });

  let meta: any = $state(null), metaErr = $state('');
  let tab = $state<'create' | 'drafts'>('create');
  let kind = $state<Kind | ''>('');
  const kinds = $derived<Kind[]>(meta?.kinds ?? []);
  const aiOn = $derived(!!meta?.ai?.available);
  const isAdmin = $derived(has('admin') && app.user?.roles.includes('admin'));
  const kindDesc: Record<string, string> = { test_new: 'e_kd_test_new', test_edit: 'e_kd_test_edit', article_new: 'e_kd_article_new', article_edit: 'e_kd_article_edit', library_add: 'e_kd_library_add', assign: 'e_kd_assign' };

  function emsg(e: unknown, ctx: 'create' | 'load' | 'act' = 'act'): string {
    if (!(e instanceof ApiError)) return et(ctx === 'load' ? 'e_err_load' : 'e_err');
    const b = e.body ?? {};
    if (e.status === 503 && e.code === 'ai_off') return et('e_err_ai_off') + (b.reason ? ` (${b.reason})` : '');
    if (e.status === 502 && e.code === 'ai_error') return et('e_err_ai_error') + (b.detail ? ` [${b.detail}]` : '');
    if (e.status === 422 || (e.status === 400 && b.field)) {
      const f = String(b.field ?? '');
      const m = /^(question|item)_(\d+)(?:_.*)?$/.exec(f);
      if (m) return et(`e_f422_${m[1]}`, { n: m[2] });
      return eHas(`e_f422_${f}`) ? et(`e_f422_${f}`) : et('e_err_invalid') + (f ? ` (${f})` : '');
    }
    if (e.status === 404 && b.field === 'target') return et('e_f422_target');
    if (e.status === 403) return et('e_err_forbidden');
    if (e.status === 404) return et('e_err_not_found');
    if (e.status === 409 && eHas(`e_err_${e.code}`)) return et(`e_err_${e.code}`);
    return et('e_err');
  }

  async function loadMeta() {
    try {
      meta = await api.get('/api/ai/editor/meta');
      if (!kind && meta.kinds.length) kind = meta.kinds[0];
    } catch (e) { metaErr = emsg(e, 'load'); }
  }
  loadMeta();

  /* ---------- люди для назначений ---------- */
  let people: { id: number; name: string }[] = $state([]), peopleLoaded = false;
  async function loadPeople() {
    if (peopleLoaded) return;
    peopleLoaded = true;
    try {
      if (has('hr')) people = (await api.get('/api/people')).people.map((p: any) => ({ id: p.id, name: p.name }));
      else people = (await api.get('/api/panel')).items.map((p: any) => ({ id: p.id, name: p.name }));
    } catch { people = []; }
  }
  $effect(() => { if (kind === 'assign') loadPeople(); });
  const pname = (id: number) => people.find((p) => p.id === id)?.name ?? `#${id}`;

  /* ---------- «Создать» ---------- */
  let busy = $state(false), err = $state('');
  let topic = $state(''), count = $state(8), testSlug = $state(''), articleId = $state(''), sectionId = $state('');
  let manTitle = $state(''), manBody = $state('');
  let libItem = $state({ kind: 'book', title: '', author: '', url: '', descr: '' });
  let asMode = $state<'test' | 'task'>('task'), asTest = $state(''), asTitle = $state(''), asDue = $state(''), asNote = $state(''), asUsers: number[] = $state([]), asSearch = $state('');
  const quizzes = $derived<any[]>((meta?.tests ?? []).filter((t: any) => t.scoring === 'quiz'));
  const allTests = $derived<any[]>(meta?.tests ?? []);
  const needsAi = $derived(kind === 'test_new' || kind === 'test_edit' || kind === 'article_edit');
  const shownPeople = $derived(people.filter((p) => !asSearch.trim() || p.name.toLowerCase().includes(asSearch.trim().toLowerCase())));
  $effect(() => { if (!sectionId && meta?.sections?.length) sectionId = String(meta.sections[0].id); });

  $effect(() => { kind; err = ''; });

  async function create(body: Record<string, unknown>) {
    busy = true; err = '';
    try {
      const r = await api.post('/api/ai/drafts', body);
      topic = ''; manTitle = ''; manBody = ''; libItem = { kind: 'book', title: '', author: '', url: '', descr: '' };
      go(`/editor?draft=${r.id}`);
    } catch (e) { err = emsg(e, 'create'); } finally { busy = false; }
  }
  function generate() {
    if (!kind) return;
    err = '';
    if (!topic.trim()) { err = et('e_f422_instruction'); return; }
    const b: Record<string, unknown> = { kind, instruction: topic.trim() };
    if (kind === 'test_new') b.count = Number(count) || 8;
    if (kind === 'test_edit') { if (!testSlug) { err = et('e_f422_test'); return; } b.slug = testSlug; }
    if (kind === 'article_edit') { if (!articleId) { err = et('e_f422_article'); return; } b.article_id = Number(articleId); }
    if (kind === 'article_new') b.section_id = Number(sectionId) || undefined;
    create(b);
  }
  function createManual() {
    if (kind === 'article_new') {
      if (!manTitle.trim() || !manBody.trim()) { err = et('e_f422_title_body'); return; }
      create({ kind, payload: { title_ru: manTitle.trim(), body_ru: manBody.trim(), section_id: Number(sectionId) || undefined } });
    } else if (kind === 'library_add') {
      if (!libItem.title.trim()) { err = et('e_f422_item', { n: 1 }); return; }
      create({ kind, payload: { items: [{ ...libItem }] } });
    }
  }
  function createAssign() {
    err = '';
    if (!asUsers.length) { err = et('e_as_pick_people'); return; }
    if (asMode === 'test') {
      if (!asTest) { err = et('e_as_pick_test'); return; }
      create({ kind: 'assign', payload: { mode: 'test', test_slug: asTest, note: asNote, user_ids: asUsers } });
    } else {
      if (!asTitle.trim()) { err = et('e_as_need_title'); return; }
      create({ kind: 'assign', payload: { mode: 'task', title: asTitle.trim(), note: asNote, due: asDue || null, user_ids: asUsers } });
    }
  }
  const toggleUser = (id: number) => { asUsers = asUsers.includes(id) ? asUsers.filter((x) => x !== id) : [...asUsers, id]; };

  /* ---------- «Черновики» ---------- */
  let list: any[] | null = $state(null), listErr = $state(''), filter = $state('');
  async function loadList() {
    listErr = '';
    try { list = (await api.get(`/api/ai/drafts${filter ? `?status=${filter}` : ''}`)).items; } catch (e) { listErr = emsg(e, 'load'); list = []; }
  }
  $effect(() => { filter; if (tab === 'drafts' && draftId == null) loadList(); });
  $effect(() => { if (draftId != null) tab = 'drafts'; });
  const stCls = (s: string) => (s === 'applied' ? 'pill-ok' : s === 'draft' ? 'pill-warn' : 'muted');

  /* ---------- деталь черновика ---------- */
  let d: any = $state(null), canApply = $state(false), dErr = $state(''), dMsg = $state(''), dLoading = $state(false);
  let ed: any = $state(null), el = $state<'ru' | 'uz'>('ru'), working = $state(''), saving = $state(false);
  const pv = $derived(ed ?? d?.payload);
  const editable = $derived(d?.status === 'draft' && canApply);

  async function loadDraft(id: number) {
    dLoading = true; dErr = ''; dMsg = ''; ed = null; d = null;
    try {
      const r = await api.get(`/api/ai/drafts/${id}`);
      d = r.draft; canApply = !!r.can_apply; el = lang;
      if (d.kind === 'assign') loadPeople();
    } catch (e) { dErr = emsg(e, 'load'); } finally { dLoading = false; }
  }
  $effect(() => { const id = draftId; if (id != null) loadDraft(id); else { d = null; ed = null; } });

  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  function startEdit() { ed = clone(d.payload); el = lang; dMsg = ''; dErr = ''; }
  async function saveEdit() {
    saving = true; dErr = '';
    try { await api.patch(`/api/ai/drafts/${d.id}`, { payload: ed }); await loadDraft(d.id); dMsg = et('e_saved'); }
    catch (e) { dErr = emsg(e); } finally { saving = false; }
  }
  async function act(a: 'apply' | 'reject' | 'rollback') {
    if (a !== 'reject' && !confirm(et(a === 'apply' ? 'e_confirm_apply' : 'e_confirm_rollback'))) return;
    working = a; dErr = ''; dMsg = '';
    try {
      await api.post(`/api/ai/drafts/${d.id}/${a}`);
      await loadDraft(d.id);
      dMsg = et(`e_done_${a}`);
    } catch (e) {
      dErr = emsg(e);
      if (e instanceof ApiError && e.status === 409) { const keep = dErr; await loadDraft(d.id); dErr = keep; }
    } finally { working = ''; }
  }
  function targetLink(t: string | null): { href: string } | null {
    if (!t) return null;
    if (t.startsWith('test:')) return { href: `#/tests/take/${t.slice(5)}` };
    if (t.startsWith('article:')) return { href: `#/kb/${t.slice(8)}` };
    if (t.startsWith('library:')) return { href: '#/library' };
    if (t === 'assign:task') return { href: '#/tasks' };
    if (t.startsWith('assign:test')) return { href: '#/tests/team' };
    return null;
  }
  const sectionName = (id: number) => { const s = (meta?.sections ?? []).find((x: any) => x.id === id); return s ? loc(s, 'title') : ''; };
  const qLoc = (qq: any, base: string) => (lang === 'uz' && qq?.[`${base}_uz`]) || qq?.[`${base}_ru`] || '';
  const optLoc = (qq: any, i: number) => (lang === 'uz' && qq.opts_uz?.[i]) || qq.opts_ru[i];
  function removeQ(i: number) { ed.questions.splice(i, 1); }
  function removeItem(i: number) { ed.items.splice(i, 1); }
  const missingUrl = $derived(d?.kind === 'library_add' && (pv?.items ?? []).some((i: any) => !String(i.url ?? '').trim()));
</script>

<header class="page-head">
  <div><h1>{et('e_title')}<PageHelp topic="ai_editor" /></h1><p class="sub">{et('e_sub')}</p></div>
</header>

<div class="alert info ed-banner" role="note">
  <span class="ed-shield" aria-hidden="true">🛡</span>
  <div><b>{et('e_banner_t')}</b> {et('e_banner')}</div>
</div>

{#if metaErr}
  <div class="alert">{metaErr}</div>
{:else if !meta}
  <span class="spin"></span>
{:else}
  <nav class="tabs" aria-label="tabs">
    <button class:on={tab === 'create'} onclick={() => { tab = 'create'; if (draftId != null) go('/editor'); }}>{et('e_tab_create')}</button>
    <button class:on={tab === 'drafts'} onclick={() => { tab = 'drafts'; if (draftId != null) go('/editor'); }}>{et('e_tab_drafts')}</button>
  </nav>

  {#if tab === 'create'}
    {#if !kinds.length}
      <div class="card"><p class="muted">{et('e_none_kinds')}</p></div>
    {:else}
      <div class="ed-kinds" role="radiogroup">
        {#each kinds as k}
          <button class="ed-kind" class:on={kind === k} role="radio" aria-checked={kind === k} onclick={() => (kind = k)}>
            <b>{et(`e_k_${k}`)}</b><span class="xs">{et(kindDesc[k])}</span>
          </button>
        {/each}
      </div>

      <section class="card stack ed-form">
        {#if !aiOn && kind && kind !== 'assign'}
          <div class="alert info">
            {et(needsAi ? 'e_ai_off' : 'e_ai_off_manual')}
            {#if isAdmin && meta.ai.reason}<div class="xs muted" style="margin-top:4px">{et('e_ai_reason')}: {meta.ai.reason}</div>{/if}
          </div>
        {/if}

        {#if kind === 'test_new'}
          <label class="f">{et('e_topic')}<input type="text" bind:value={topic} placeholder={et('e_topic_ph')} maxlength="300" /></label>
          <label class="f ed-narrow">{et('e_count')}<input type="number" min="4" max="15" bind:value={count} /></label>
        {:else if kind === 'test_edit'}
          {#if !quizzes.length}<p class="muted small">{et('e_no_quiz')}</p>{/if}
          <label class="f">{et('e_pick_test')}
            <select bind:value={testSlug}><option value="">{et('e_pick')}</option>{#each quizzes as t}<option value={t.slug}>{loc(t, 'title')}</option>{/each}</select></label>
          <label class="f">{et('e_what_fix')}<textarea bind:value={topic} placeholder={et('e_what_fix_ph')} maxlength="1500"></textarea></label>
        {:else if kind === 'article_new'}
          <label class="f">{et('e_pick_section')}
            <select bind:value={sectionId}>{#each meta.sections as s}<option value={String(s.id)}>{loc(s, 'title')}</option>{/each}</select></label>
          <label class="f">{et('e_topic')}<input type="text" bind:value={topic} placeholder={et('e_topic_ph')} maxlength="300" /></label>
        {:else if kind === 'article_edit'}
          <label class="f">{et('e_pick_article')}
            <select bind:value={articleId}><option value="">{et('e_pick')}</option>{#each meta.articles as a}<option value={String(a.id)}>{a.title_ru}</option>{/each}</select></label>
          <label class="f">{et('e_what_fix')}<textarea bind:value={topic} placeholder={et('e_what_fix_ph')} maxlength="1500"></textarea></label>
        {:else if kind === 'library_add'}
          <label class="f">{et('e_topic')}<input type="text" bind:value={topic} placeholder={et('e_topic_ph')} maxlength="300" /></label>
          <p class="muted xs">{et('e_lib_ai_note')}</p>
        {/if}

        {#if kind && kind !== 'assign'}
          {#if err && kind !== 'article_new' && kind !== 'library_add'}<div class="alert" role="alert">{err}</div>{/if}
          <div class="row wrap">
            <button class="btn grad" disabled={busy || !aiOn} onclick={generate}>{busy ? et('e_generating') : et('e_generate')}</button>
            {#if busy}<span class="spin"></span><span class="muted small">{et('e_gen_wait')}</span>{/if}
          </div>
        {/if}

        {#if kind === 'article_new'}
          <hr class="ed-hr" />
          <h3 class="card-title">{et('e_manual')}</h3>
          <label class="f">{et('e_manual_t')}<input type="text" bind:value={manTitle} maxlength="200" /></label>
          <label class="f">{et('e_manual_body')}<textarea bind:value={manBody} rows="7" maxlength="8000"></textarea></label>
          <div><button class="btn" disabled={busy} onclick={createManual}>{busy ? et('e_creating') : et('e_manual_create')}</button></div>
        {:else if kind === 'library_add'}
          <hr class="ed-hr" />
          <h3 class="card-title">{et('e_manual')}</h3>
          <div class="ed-2">
            <label class="f">{et('e_item_kind')}<select bind:value={libItem.kind}>{#each ['book', 'video', 'link', 'article', 'course'] as k}<option value={k}>{et(`e_k_${k}`)}</option>{/each}</select></label>
            <label class="f">{et('e_item_title')}<input type="text" bind:value={libItem.title} maxlength="200" /></label>
            <label class="f">{et('e_item_author')}<input type="text" bind:value={libItem.author} maxlength="200" /></label>
            <label class="f">{et('e_item_url')}<input type="text" bind:value={libItem.url} placeholder="https://" maxlength="500" /></label>
          </div>
          <label class="f">{et('e_item_descr')}<textarea bind:value={libItem.descr} rows="3" maxlength="1000"></textarea></label>
          <div><button class="btn" disabled={busy} onclick={createManual}>{busy ? et('e_creating') : et('e_manual_create')}</button></div>
        {:else if kind === 'assign'}
          <div class="tabs" style="margin-bottom:0" role="radiogroup" aria-label={et('e_as_mode')}>
            <button class:on={asMode === 'task'} role="radio" aria-checked={asMode === 'task'} onclick={() => (asMode = 'task')}>{et('e_as_task')}</button>
            <button class:on={asMode === 'test'} role="radio" aria-checked={asMode === 'test'} onclick={() => (asMode = 'test')}>{et('e_as_test')}</button>
          </div>
          {#if asMode === 'test'}
            <label class="f">{et('e_as_test_pick')}
              <select bind:value={asTest}><option value="">{et('e_pick')}</option>{#each allTests as t}<option value={t.slug}>{loc(t, 'title')}</option>{/each}</select></label>
          {:else}
            <div class="ed-2">
              <label class="f">{et('e_as_title')}<input type="text" bind:value={asTitle} maxlength="200" /></label>
              <label class="f">{et('e_as_due')}<input type="date" bind:value={asDue} /></label>
            </div>
          {/if}
          <label class="f">{et('e_as_note')}<textarea bind:value={asNote} rows="2" maxlength="1000"></textarea></label>
          <div>
            <div class="row wrap" style="margin-bottom:8px;gap:8px">
              <b class="small">{et('e_as_people')}</b><span class="muted xs">{et('e_as_chosen', { n: asUsers.length })}</span><span class="sp"></span>
              <button class="btn sm" onclick={() => (asUsers = [...new Set([...asUsers, ...shownPeople.map((p) => p.id)])])}>{et('e_as_all')}</button>
              <button class="btn sm" onclick={() => (asUsers = [])}>{et('e_as_none')}</button>
            </div>
            <input type="search" bind:value={asSearch} placeholder={et('e_as_search')} />
            {#if !people.length}<p class="muted small" style="margin-top:10px">{et('e_as_no_people')}</p>{/if}
            <div class="ed-people">
              {#each shownPeople as p (p.id)}
                <label class="chk ed-person"><input type="checkbox" checked={asUsers.includes(p.id)} onchange={() => toggleUser(p.id)} /><span>{p.name}</span></label>
              {/each}
            </div>
          </div>
          {#if err}<div class="alert" role="alert">{err}</div>{/if}
          <div><button class="btn grad" disabled={busy} onclick={createAssign}>{busy ? et('e_creating') : et('e_as_create')}</button></div>
        {/if}
        {#if err && (kind === 'article_new' || kind === 'library_add')}<div class="alert" role="alert">{err}</div>{/if}
      </section>
    {/if}

  {:else if draftId == null}
    <!-- ===== список ===== -->
    <div class="tabs" role="group" aria-label="status">
      {#each ['', 'draft', 'applied', 'rejected', 'rolled_back'] as s}
        <button class:on={filter === s} onclick={() => (filter = s)}>{s ? et(`e_st_${s}`) : et('e_filter_all')}</button>
      {/each}
    </div>
    {#if listErr}<div class="alert">{listErr}</div>{/if}
    {#if !list}<span class="spin"></span>
    {:else if !list.length}<div class="card"><p class="muted">{et('e_none')}</p></div>
    {:else}
      <div class="card ed-list">
        <div class="list">
          {#each list as it (it.id)}
            <a class="ed-row" href="#/editor?draft={it.id}">
              <div class="ed-row-main">
                <b>{it.title}</b>
                <div class="muted xs">
                  {et(`e_k_${it.kind}`)} · {it.ai ? et('e_by_ai') : et('e_by_manual')} · {it.by_name ?? '—'} · {fmtDateTime(it.created_at)}
                </div>
              </div>
              <span class="chip {stCls(it.status)}">{et(`e_st_${it.status}`)}</span>
            </a>
          {/each}
        </div>
      </div>
    {/if}

  {:else}
    <!-- ===== деталь ===== -->
    <p class="small" style="margin-bottom:12px"><a href="#/editor">← {et('e_back')}</a></p>
    {#if dLoading}<span class="spin"></span>
    {:else if !d}<div class="alert">{dErr || et('e_err_not_found')}</div>
    {:else}
      <section class="card stack">
        <div class="row wrap" style="align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div class="muted xs">{et(`e_k_${d.kind}`)}</div>
            <h2 class="ed-h2">{d.title}</h2>
            <div class="muted xs">
              {d.ai ? et('e_by_ai') : et('e_by_manual')} · {et('e_author')}: {d.by_name ?? '—'} · {fmtDateTime(d.created_at)}
              {#if d.source?.startsWith('question:')} · {et('e_d_from_q')}{/if}
            </div>
          </div>
          <span class="chip {stCls(d.status)}">{et(`e_st_${d.status}`)}</span>
        </div>

        {#if dMsg}<div class="alert ok" role="status">{dMsg}
          {#if d.status === 'applied' && targetLink(d.target)} · <a href={targetLink(d.target)!.href}>{et('e_open_result')}</a>{/if}</div>{/if}
        {#if dErr}<div class="alert" role="alert">{dErr}</div>{/if}
        {#if d.ai && d.status === 'draft' && !ed}<div class="alert info small">✨ {et('e_ai_hint')}</div>{/if}
        {#if d.status === 'applied' && !dMsg && targetLink(d.target)}<div><a class="btn sm" href={targetLink(d.target)!.href}>{et('e_open_result')}</a></div>{/if}

        <!-- ----- содержимое ----- -->
        {#if ed}
          <div class="row wrap" style="gap:8px">
            <span class="muted small">{et('e_f_lang')}:</span>
            <div class="tabs" style="margin:0">
              <button class:on={el === 'ru'} onclick={() => (el = 'ru')}>RU</button><button class:on={el === 'uz'} onclick={() => (el = 'uz')}>UZ</button>
            </div>
          </div>
          {#if d.kind === 'test_new' || d.kind === 'test_edit'}
            <label class="f">{et('e_f_title')}<input type="text" bind:value={ed[`title_${el}`]} maxlength="150" /></label>
            <label class="f">{et('e_f_descr')}<textarea rows="2" bind:value={ed[`descr_${el}`]} maxlength="500"></textarea></label>
            <label class="f ed-narrow">{et('e_f_minutes')}<input type="number" min="1" max="60" bind:value={ed.minutes} /></label>
            {#each ed.questions as qq, i (i)}
              <div class="ed-q">
                <div class="row" style="gap:8px"><b>{i + 1}.</b><span class="sp"></span>
                  {#if ed.questions.length > 3}<button class="btn sm danger" onclick={() => removeQ(i)}>{et('e_f_remove')}</button>{/if}</div>
                <label class="f">{et('e_f_question')}<textarea rows="2" bind:value={qq[`q_${el}`]} maxlength="400"></textarea></label>
                {#each qq.opts_ru as _o, k}
                  <div class="ed-opt">
                    <input type="radio" name="c{i}" checked={qq.correct === k} onchange={() => (qq.correct = k)} aria-label={et('e_f_correct')} title={et('e_f_correct')} />
                    <input type="text" bind:value={qq[`opts_${el}`][k]} placeholder="{et('e_f_option')} {k + 1}" maxlength="300" />
                  </div>
                {/each}
                <label class="f" style="margin:8px 0 0">{et('e_f_why')}<textarea rows="2" bind:value={qq[`why_${el}`]} maxlength="600"></textarea></label>
              </div>
            {/each}
          {:else if d.kind === 'article_new' || d.kind === 'article_edit'}
            <label class="f">{et('e_f_section')}
              <select bind:value={ed.section_id}>{#each meta.sections as s}<option value={s.id}>{loc(s, 'title')}</option>{/each}</select></label>
            <label class="f">{et('e_f_title')}<input type="text" bind:value={ed[`title_${el}`]} maxlength="200" /></label>
            <label class="f">{et('e_f_body')}<textarea rows="14" bind:value={ed[`body_${el}`]} maxlength="8000"></textarea></label>
            <label class="f">{et('e_f_tags')}<input type="text" bind:value={ed.tags} maxlength="200" /></label>
            {#if d.kind === 'article_edit'}<label class="f">{et('e_f_changes')}<input type="text" bind:value={ed.changes} maxlength="400" /></label>{/if}
          {:else if d.kind === 'library_add'}
            {#each ed.items as it, i (i)}
              <div class="ed-q">
                <div class="row" style="gap:8px"><b>{i + 1}.</b><span class="sp"></span>
                  {#if ed.items.length > 1}<button class="btn sm danger" onclick={() => removeItem(i)}>{et('e_f_remove')}</button>{/if}</div>
                <div class="ed-2">
                  <label class="f">{et('e_item_kind')}<select bind:value={it.kind}>{#each ['book', 'video', 'link', 'article', 'course'] as k}<option value={k}>{et(`e_k_${k}`)}</option>{/each}</select></label>
                  <label class="f">{et('e_item_title')}<input type="text" bind:value={it.title} maxlength="200" /></label>
                  <label class="f">{et('e_item_author')}<input type="text" bind:value={it.author} maxlength="200" /></label>
                  <label class="f">{et('e_item_url')}<input type="text" bind:value={it.url} placeholder="https://" maxlength="500" /></label>
                </div>
                <label class="f" style="margin:0">{et('e_item_descr')}<textarea rows="2" bind:value={it.descr} maxlength="1000"></textarea></label>
              </div>
            {/each}
          {:else if d.kind === 'assign'}
            {#if ed.mode === 'task'}
              <label class="f">{et('e_as_title')}<input type="text" bind:value={ed.title} maxlength="200" /></label>
              <label class="f ed-narrow">{et('e_as_due')}<input type="date" bind:value={ed.due} /></label>
            {/if}
            <label class="f">{et('e_as_note')}<textarea rows="2" bind:value={ed.note} maxlength="1000"></textarea></label>
          {/if}
          <div class="row wrap">
            <button class="btn grad" disabled={saving} onclick={saveEdit}>{et('e_save')}</button>
            <button class="btn" disabled={saving} onclick={() => (ed = null)}>{et('e_cancel')}</button>
          </div>
        {:else if pv}
          {#if d.kind === 'test_new' || d.kind === 'test_edit'}
            <div>
              {#if lang === 'uz' && pv.title_uz && pv.title_uz !== d.title}<b>{pv.title_uz}</b>{/if}
              {#if loc(pv, 'descr')}<p class="small">{loc(pv, 'descr')}</p>{/if}
              <p class="muted xs">{et('e_pv_questions')}: {pv.questions.length} · {pv.minutes} {et('e_pv_minutes')}</p>
            </div>
            <ol class="ed-qs">
              {#each pv.questions as qq}
                <li>
                  <b>{qLoc(qq, 'q')}</b>
                  <ul class="ed-opts">
                    {#each qq.opts_ru as _o, k}
                      <li class:ok={qq.correct === k}><span class="ed-mark" aria-hidden="true">{qq.correct === k ? '✓' : ''}</span>{optLoc(qq, k)}{#if qq.correct === k}<span class="xs ed-ok"> · {et('e_pv_correct')}</span>{/if}</li>
                    {/each}
                  </ul>
                  {#if qLoc(qq, 'why')}<p class="muted xs"><b>{et('e_pv_why')}:</b> {qLoc(qq, 'why')}</p>{/if}
                </li>
              {/each}
            </ol>
          {:else if d.kind === 'article_new' || d.kind === 'article_edit'}
            <div class="muted xs">{et('e_pv_section')}: {sectionName(pv.section_id) || pv.section_id}{#if pv.tags} · {et('e_pv_tags')}: {pv.tags}{/if}{#if pv.changes} · {pv.changes}{/if}</div>
            <div class="md card" style="background:var(--card-2)"><h2 style="margin-top:0">{loc(pv, 'title')}</h2>{@html md(loc(pv, 'body'))}</div>
          {:else if d.kind === 'library_add'}
            {#if missingUrl && d.status === 'draft'}<div class="alert">{et('e_pv_url_missing')}</div>{/if}
            <div class="ed-cards">
              {#each pv.items as it}
                <div class="ed-card">
                  <span class="chip" style="padding:3px 10px;font-size:12px">{et(`e_k_${it.kind}`)}</span>
                  <b>{it.title}</b>
                  {#if it.author}<span class="muted small">{it.author}</span>{/if}
                  {#if it.descr}<span class="small">{it.descr}</span>{/if}
                  {#if it.url}<span class="xs" style="overflow-wrap:anywhere">{et('e_pv_url_ok')}: <a href={it.url} target="_blank" rel="noopener">{it.url}</a></span>
                  {:else}<span class="xs pill-warn">{et('e_pv_url_missing')}</span>{/if}
                </div>
              {/each}
            </div>
          {:else if d.kind === 'assign'}
            <div class="stack" style="gap:8px">
              <div><span class="chip">{pv.mode === 'test' ? et('e_pv_mode_test') : et('e_pv_mode_task')}</span></div>
              <b>{pv.mode === 'test' ? (loc(allTests.find((t: any) => t.slug === pv.test_slug), 'title') || pv.test_slug) : pv.title}</b>
              {#if pv.due}<div class="small">{et('e_pv_due')}: {pv.due}</div>{/if}
              {#if pv.note}<div class="small">{et('e_pv_note')}: {pv.note}</div>{/if}
              <div class="small"><b>{et('e_pv_people')} ({pv.user_ids.length}):</b></div>
              <div class="row wrap" style="gap:6px">{#each pv.user_ids as id}<span class="chip" style="padding:4px 12px;font-size:13px">{pname(id)}</span>{/each}</div>
            </div>
          {/if}
        {/if}

        <!-- ----- действия ----- -->
        {#if d.status === 'draft' && !ed}
          {#if d.kind in { test_new: 1, test_edit: 1, article_new: 1, article_edit: 1, library_add: 1, assign: 1 }}<p class="muted small">{et(`e_c_${d.kind}`)}</p>{/if}
          {#if editable}
            <div class="row wrap">
              <button class="btn grad" disabled={!!working || missingUrl} onclick={() => act('apply')}>{working === 'apply' ? et('e_applying') : et('e_apply')}</button>
              <button class="btn" disabled={!!working} onclick={startEdit}>{et('e_edit')}</button>
              <button class="btn danger" disabled={!!working} onclick={() => act('reject')}>{et('e_reject')}</button>
            </div>
          {:else}<div class="alert">{et('e_err_forbidden')}</div>{/if}
        {:else if d.status === 'draft' && ed}
          <p class="muted xs">{et('e_unsaved')}</p>
        {:else if d.status === 'applied'}
          <p class="muted small">{et('e_rolled_note')}</p>
          {#if canApply}<div><button class="btn danger" disabled={!!working} onclick={() => act('rollback')}>{et('e_rollback')}</button></div>{/if}
        {/if}
        {#if d.decided_at}<div class="muted xs">{et('e_d_decided')}: {fmtDateTime(d.decided_at)}</div>{/if}

        {#if d.ai}<div><AiFeedback role="editor" refId={`draft:${d.id}`} /></div>{/if}
      </section>
    {/if}
  {/if}
{/if}

<style>
  .ed-banner { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 18px; border: 1px solid var(--border); line-height: 1.5; }
  .ed-shield { font-size: 20px; line-height: 1.3; }
  .ed-kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .ed-kind { text-align: left; display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 18px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; }
  .ed-kind span { color: var(--muted); line-height: 1.35; }
  .ed-kind.on { background: var(--chip-on-bg); color: var(--chip-on-ink); border-color: transparent; }
  .ed-kind.on span { color: inherit; opacity: .8; }
  .ed-form { max-width: 820px; }
  .ed-narrow { max-width: 220px; }
  .ed-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
  .ed-hr { border: 0; border-top: 1px solid var(--border); width: 100%; margin: 4px 0; }
  .ed-people { max-height: 260px; overflow: auto; margin-top: 10px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2px 12px; border: 1px solid var(--border); border-radius: 14px; padding: 8px 12px; }
  .ed-person { padding: 7px 0; font-size: 14px; }
  .ed-list { padding: 8px 24px; }
  .ed-row { text-decoration: none; color: var(--text); }
  .ed-row:hover b { text-decoration: underline; }
  .ed-row-main { min-width: 0; flex: 1; }
  .ed-row-main b { overflow-wrap: anywhere; }
  .ed-h2 { font-size: 22px; margin: 2px 0 4px; overflow-wrap: anywhere; }
  .ed-q { border: 1px solid var(--border); border-radius: 16px; padding: 14px; background: var(--card-2); }
  .ed-opt { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  .ed-opt input[type='radio'] { width: 20px; height: 20px; flex: none; accent-color: var(--good); }
  .ed-qs { padding-left: 22px; display: flex; flex-direction: column; gap: 16px; }
  .ed-opts { list-style: none; padding: 0; margin: 8px 0; display: flex; flex-direction: column; gap: 6px; }
  .ed-opts li { padding: 8px 12px; border-radius: 12px; background: var(--card-2); border: 1px solid var(--border); display: flex; gap: 8px; align-items: baseline; overflow-wrap: anywhere; }
  .ed-opts li.ok { border-color: var(--good); background: color-mix(in srgb, var(--good) 12%, transparent); }
  .ed-mark { width: 14px; flex: none; color: var(--good); font-weight: 700; }
  .ed-ok { color: var(--good); white-space: nowrap; }
  .ed-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .ed-card { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; padding: 16px; border-radius: 18px; background: var(--card-2); border: 1px solid var(--border); min-width: 0; }
  @media (max-width: 640px) {
    .ed-2 { grid-template-columns: 1fr; }
    .ed-list { padding: 4px 16px; }
    .ed-row { flex-wrap: wrap; }
    .ed-kinds { grid-template-columns: 1fr 1fr; }
    .ed-narrow { max-width: none; }
  }
</style>
