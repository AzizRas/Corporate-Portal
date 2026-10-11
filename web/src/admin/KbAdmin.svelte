<script lang="ts">
  import { promptBox } from '../lib/dialog.svelte';
  import { api } from '../lib/api';
  import { has } from '../lib/state.svelte';
  import { md } from '../lib/md';
  import { fmtDate } from '../lib/format';
  import Modal from '../components/Modal.svelte';

  let list: any[] = $state([]), unanswered: any[] = $state([]), sections: any[] = $state([]), depts: any[] = $state([]);
  let edit: any = $state(null), lang = $state<'ru' | 'uz'>('ru'), preview = $state(false), versions: any[] = $state([]), msg = $state('');
  const load = async () => { const r = await api.get('/api/kb/manage'); list = r.articles; unanswered = r.unanswered; };
  load(); api.get('/api/kb/sections').then((r) => (sections = r.sections)); api.get('/api/departments').then((r) => (depts = r.departments));
  const secName = (id: number) => sections.find((s) => s.id === id)?.title_ru ?? '';
  const STATUS: Record<string, string> = { draft: 'черновик', review: 'на проверке', published: 'опубликовано' };

  async function open(id: number | null) {
    msg = ''; versions = [];
    if (id) { const a = (await api.get(`/api/kb/articles/${id}`)).article; edit = { ...a, dept_ids: a.dept_ids ?? [] }; versions = (await api.get(`/api/kb/articles/${id}/versions`)).versions; }
    else edit = { id: null, section_id: sections[0]?.id, title_ru: '', title_uz: '', body_ru: '', body_uz: '', tags: '', dept_ids: [], review_months: 6, status: 'draft' };
  }
  async function save() {
    if (edit.id) await api.put(`/api/kb/articles/${edit.id}`, edit);
    else edit.id = (await api.post('/api/kb/articles', edit)).id;
    msg = 'Сохранено'; await load(); versions = (await api.get(`/api/kb/articles/${edit.id}/versions`)).versions;
  }
  async function setStatus(s: string) { await save(); await api.post(`/api/kb/articles/${edit.id}/status`, { status: s }); edit.status = s; await load(); }
  async function restore(v: number) { await api.post(`/api/kb/articles/${edit.id}/restore/${v}`); await open(edit.id); await load(); }
  const toggleDept = (id: number) => (edit.dept_ids = edit.dept_ids.includes(id) ? edit.dept_ids.filter((x: number) => x !== id) : [...edit.dept_ids, id]);
  async function resolve(u: any) { await api.post('/api/kb/unanswered/resolve', { ids: u.ids }); await load(); }
  async function newFrom(u: any) { await open(null); edit.title_ru = u.query; await resolve(u); }
  async function addSection() { const t = await promptBox('Название раздела'); if (t) { await api.post('/api/kb/sections', { title_ru: t, title_uz: t }); sections = (await api.get('/api/kb/sections')).sections; } }
</script>

<div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(280px,1fr)">
  <section class="card">
    <div class="row" style="margin-bottom:12px"><h3 class="card-title">Статьи</h3><span class="sp"></span>{#if has('hr')}<button class="btn sm" onclick={addSection}>+ Раздел</button>{/if}<button class="btn sm grad" onclick={() => open(null)}>+ Статья</button></div>
    <div class="list">
      {#each list as a}
        <div><span><b>{a.title_ru}</b><div class="muted xs">{secName(a.section_id)} · {a.owner_name ?? '—'} · v{a.version} · {fmtDate(a.updated_at)} {#if a.overdue}<span class="pill-warn">· пора пересмотреть</span>{/if}</div></span>
          <span class="row"><span class="chip" style="font-size:12px;padding:3px 10px">{STATUS[a.status]}</span><button class="btn sm" onclick={() => open(a.id)}>Править</button></span></div>
      {/each}
    </div>
  </section>
  <section class="card">
    <h3 class="card-title" style="margin-bottom:12px">Не нашли ответ ({unanswered.length})</h3>
    <div class="list">
      {#each unanswered as u}<div><span class="small">{u.query} <span class="muted">×{u.n}</span></span><span class="row"><button class="btn sm" onclick={() => newFrom(u)}>Статья</button><button class="btn sm" onclick={() => resolve(u)}>✓</button></span></div>{:else}<p class="muted small">Очередь пуста</p>{/each}
    </div>
  </section>
</div>

{#if edit}
  <Modal onclose={() => (edit = null)} wide>
    <h2>{edit.id ? 'Статья' : 'Новая статья'}</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px">
      <label class="f">Раздел<select bind:value={edit.section_id}>{#each sections as s}<option value={s.id}>{s.title_ru}</option>{/each}</select></label>
      <label class="f">Пересмотр, мес.<input type="number" bind:value={edit.review_months} /></label>
      <label class="f">Теги (для поиска)<input bind:value={edit.tags} /></label>
    </div>
    <div class="tabs"><button class:on={lang === 'ru'} onclick={() => (lang = 'ru')}>RU</button><button class:on={lang === 'uz'} onclick={() => (lang = 'uz')}>UZ</button><button class:on={preview} onclick={() => (preview = !preview)}>Предпросмотр</button></div>
    <label class="f">Заголовок ({lang})<input bind:value={edit[`title_${lang}`]} /></label>
    {#if preview}<div class="md card" style="background:var(--card-2)">{@html md(edit[`body_${lang}`])}</div>
    {:else}<label class="f">Текст ({lang}) — markdown: ## заголовок, - список, **жирный**, [ссылка](url), ![картинка](url)<textarea bind:value={edit[`body_${lang}`]} style="min-height:240px;font-family:ui-monospace,monospace"></textarea></label>{/if}
    <div class="muted small" style="margin-bottom:6px">Для каких отделов (пусто = для всех)</div>
    <div class="row wrap" style="margin-bottom:14px">{#each depts as d}<label class="chk chip" class:on={edit.dept_ids.includes(d.id)}><input type="checkbox" class="sr" checked={edit.dept_ids.includes(d.id)} onchange={() => toggleDept(d.id)} />{d.name_ru}</label>{/each}</div>
    {#if versions.length}<details style="margin-bottom:14px"><summary class="muted small" style="cursor:pointer">История версий ({versions.length})</summary>
      <div class="list">{#each versions as v}<div><span class="small">v{v.version} · {fmtDate(v.at)} · {v.by_name ?? ''}</span><button class="btn sm" onclick={() => restore(v.version)}>Откатить</button></div>{/each}</div></details>{/if}
    {#if msg}<div class="alert ok">{msg}</div>{/if}
    <div class="row wrap" style="justify-content:flex-end">
      <span class="chip">{STATUS[edit.status]}</span><span class="sp"></span>
      <button class="btn" onclick={save}>Сохранить</button>
      {#if edit.status === 'draft'}<button class="btn" onclick={() => setStatus('review')}>На проверку</button>{/if}
      {#if edit.status !== 'published'}<button class="btn grad" onclick={() => setStatus('published')}>Опубликовать</button>{:else}<button class="btn" onclick={() => setStatus('draft')}>Снять с публикации</button>{/if}
    </div>
  </Modal>
{/if}
