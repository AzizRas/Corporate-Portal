<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { fmtDate } from '../lib/format';
  import { wt } from '../lib/w18n';
  import Segmented from '../components/Segmented.svelte';

  // Вики по Karpathy: источники → черновики страниц (в «ИИ-редакторе»), схема, проверка, журнал, ответы ИИ
  let tab = $state<'src' | 'schema' | 'lint' | 'log' | 'ans'>('src');
  let sources: any[] = $state([]), schema = $state(''), lint: any = $state(null), log: any[] = $state([]), answers: any[] = $state([]), msg = $state('');
  let nt = $state({ title: '', text: '' }), file: File | null = $state(null), busy = $state(false);
  const ST: Record<string, string> = { new: 'в очереди', ingesting: 'обрабатывается', done: 'готово', failed: 'ошибка' };
  const load = async () => {
    if (tab === 'src') sources = (await api.get('/api/kb/sources')).items;
    if (tab === 'schema') schema = (await api.get('/api/kb/schema')).schema;
    if (tab === 'lint') lint = (await api.get('/api/kb/lint')).report;
    if (tab === 'log') log = (await api.get('/api/kb/log')).items;
    if (tab === 'ans') answers = (await api.get('/api/kb/answers')).items;
  };
  $effect(() => { tab; msg = ''; load(); });
  async function addText(e: Event) {
    e.preventDefault(); busy = true; msg = '';
    try {
      if (file) { const fd = new FormData(); fd.append('title', nt.title); fd.append('file', file); await api.upload('/api/kb/sources', fd); }
      else await api.post('/api/kb/sources', nt);
      nt = { title: '', text: '' }; file = null; msg = 'Источник добавлен: ИИ подготовит черновики страниц — они появятся в «ИИ-редакторе»'; await load();
    } catch (x) { msg = x instanceof ApiError ? ({ duplicate: 'Такой источник уже есть', empty: 'Нужны название и текст', too_big: 'Файл больше 15 МБ' } as any)[x.code] ?? x.code : 'Ошибка'; }
    finally { busy = false; }
  }
  async function reingest(s: any) { await api.post(`/api/kb/sources/${s.id}/ingest`); msg = 'Поставлено в очередь'; }
  async function saveSchema() { await api.put('/api/kb/schema', { schema }); msg = 'Сохранено'; }
  async function runLint() { busy = true; lint = (await api.post('/api/kb/lint')).report; busy = false; }
  async function reindex() { await api.post('/api/kb/reindex'); msg = 'Переиндексация запущена'; }
  async function saveAns(a: any) { const r = await api.post(`/api/kb/answers/${a.id}/save`); a.draft_id = r.draft_id; }
</script>

<!-- виды одной страницы «Источники базы» — переключатель, а не вкладки раздела: вкладки группы «Контент» рисует HubTabs -->
<div class="mb-4"><Segmented label={wt('ai_a_wiki')} value={tab} options={[{ id: 'src', label: 'Источники' }, { id: 'schema', label: 'Схема вики' }, { id: 'lint', label: 'Проверка' }, { id: 'log', label: 'Журнал' }, { id: 'ans', label: 'Ответы ИИ' }]} onchange={(id) => (tab = id as typeof tab)} /></div>
{#if msg}<div class="alert ok">{msg}</div>{/if}

{#if tab === 'src'}
  <section class="card stack">
    <p class="muted small">Источник — регламент, инструкция, письмо, выгрузка. Он не меняется; ИИ читает его и предлагает новые статьи и правки существующих. Черновики проверяет редактор.</p>
    <form class="stack" onsubmit={addText}>
      <label class="f">Название<input bind:value={nt.title} maxlength="200" /></label>
      <label class="f">Файл (PDF, DOCX, TXT)<input type="file" accept=".pdf,.docx,.txt,.md,.odt,.rtf" onchange={(e) => (file = e.currentTarget.files?.[0] ?? null)} /></label>
      {#if !file}<label class="f">…или текст<textarea rows="6" bind:value={nt.text}></textarea></label>{/if}
      <div class="row"><button class="btn grad" disabled={busy}>Добавить источник</button><span class="sp"></span><button type="button" class="btn sm" onclick={reindex}>Переиндексировать всё</button></div>
    </form>
  </section>
  <section class="card scroll-x">
    <table class="table"><thead><tr><th>Источник</th><th>Статус</th><th>Черновиков</th><th>Добавлен</th><th></th></tr></thead>
      <tbody>{#each sources as s}<tr><td><b>{s.title}</b><div class="muted xs">{s.filename ?? 'текст'} · {s.chars} симв.</div>{#if s.error}<div class="xs bad-ink">{s.error}</div>{/if}</td><td>{ST[s.status]}</td><td>{s.drafts}</td><td class="xs">{fmtDate(s.created_at)}<br />{s.added_by ?? ''}</td>
        <td><button class="btn sm" onclick={() => reingest(s)}>Обработать снова</button></td></tr>{:else}<tr><td colspan="5" class="muted">Источников пока нет</td></tr>{/each}</tbody></table>
    <p class="small"><a href="#/editor">→ Черновики в ИИ-редакторе</a></p>
  </section>
{:else if tab === 'schema'}
  <section class="card stack">
    <p class="muted small">Правила вики: типы страниц, стиль, как ссылаться. ИИ следует им при подготовке черновиков и ответов.</p>
    <textarea rows="16" bind:value={schema}></textarea>
    <button class="btn grad" onclick={saveSchema}>Сохранить</button>
  </section>
{:else if tab === 'lint'}
  <section class="card stack">
    <div class="row"><span class="muted small">{lint ? `Проверено ${fmtDate(lint.at)} · статей ${lint.total}` : 'Ещё не проверялось'}</span><span class="sp"></span><button class="btn grad sm" disabled={busy} onclick={runLint}>Проверить сейчас</button></div>
    {#if lint}
      <h3 class="card-title">Пора пересмотреть ({lint.stale.length})</h3>{#each lint.stale as a}<div><a href="#/kb/{a.id}">{a.title_ru}</a> <span class="muted xs">{a.owner ?? 'без ответственного'}</span></div>{/each}
      <h3 class="card-title">Похожие заголовки — возможные дубли ({lint.duplicates.length})</h3>{#each lint.duplicates as d}<div class="small"><a href="#/kb/{d.a}">{d.ta}</a> ≈ <a href="#/kb/{d.b}">{d.tb}</a></div>{/each}
      <h3 class="card-title">Вопросы без ответа ({lint.gaps.length + lint.unanswered.length})</h3>{#each [...lint.gaps, ...lint.unanswered] as g}<div class="small">«{g.query}» — {g.n}</div>{/each}
      {#if lint.orphans.length}<h3 class="card-title">Страницы без ссылок на них ({lint.orphans.length})</h3>{#each lint.orphans as a}<div class="small"><a href="#/kb/{a.id}">{a.title_ru}</a></div>{/each}{/if}
    {/if}
  </section>
{:else if tab === 'log'}
  <section class="card">{#each log as l}<div class="small"><span class="muted xs">{fmtDate(l.at)}</span> <b>{l.op}</b> {l.summary} <span class="muted xs">{l.name ?? ''}</span></div>{/each}</section>
{:else}
  <section class="card scroll-x">
    <table class="table"><thead><tr><th>Вопрос</th><th>Ответ</th><th>Оценка</th><th></th></tr></thead>
      <tbody>{#each answers as a}<tr><td>{a.question}<div class="muted xs">{a.name ?? ''} · {fmtDate(a.created_at)}</div></td><td class="small">{a.grounded ? '' : '(нет опоры в базе) '}{a.answer.slice(0, 200)}</td><td>{a.feedback === 1 ? 'полезно' : a.feedback === -1 ? 'не то' : ''}</td>
        <td>{#if a.draft_id}<span class="muted xs">черновик #{a.draft_id}</span>{:else if a.grounded}<button class="btn sm" onclick={() => saveAns(a)}>В статью</button>{/if}</td></tr>{/each}</tbody></table>
  </section>
{/if}

<style>.bad-ink { color: #dc2626; }</style>
