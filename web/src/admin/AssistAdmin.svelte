<script lang="ts">
  import { confirmBox, promptBox, alertBox } from '../lib/dialog.svelte';
  import { api, ApiError } from '../lib/api';
  import { fmtDateTime } from '../lib/format';
  import FormNode from './FormNode.svelte';
  import Modal from '../components/Modal.svelte';

  let { collection }: { collection: string | null } = $props();

  let cols: any[] = $state([]), active: any = $state(null), releases: any[] = $state([]), note = $state(''), toast = $state('');
  const loadCols = async () => { const r = await api.get('/api/admin/assist/collections'); cols = r.collections; active = r.active; };
  const loadReleases = async () => (releases = (await api.get('/api/admin/assist/releases')).releases);
  let report: { misses: any[]; top: any[] } = $state({ misses: [], top: [] });
  const loadReport = async () => { try { report = await api.get('/api/admin/assist/search-report'); } catch { /* нет доступа — блок скрыт */ } };
  loadCols(); loadReleases(); loadReport();

  const groups = $derived.by(() => { const m = new Map<string, any[]>(); for (const c of cols) (m.get(c.grp) ?? m.set(c.grp, []).get(c.grp)!).push(c); return [...m]; });
  const changedTotal = $derived(cols.reduce((n, c) => n + c.changed, 0));
  const say = (m: string) => { toast = m; setTimeout(() => (toast = ''), 2500); };

  async function publish() {
    await api.post('/api/admin/assist/publish', { note }); note = ''; await loadCols(); await loadReleases(); say('Выпуск опубликован — операторы видят новую версию');
  }
  async function activate(r: any, restore: boolean) {
    if (!await confirmBox(restore ? `Вернуть и рабочую копию, и выпуск к версии №${r.id}? Несохранённые правки пропадут.` : `Сделать активным выпуск №${r.id}? Рабочая копия останется как есть.`)) return;
    await api.post(`/api/admin/assist/releases/${r.id}/activate`, { restore }); await loadCols(); await loadReleases(); say('Готово');
  }

  /* ----- редактор коллекции ----- */
  let meta: any = $state(null), items: any[] = $state([]), sel: string | null = $state(null), q = $state('');
  let draft: any = $state(null), orig = '', tab = $state<'form' | 'json'>('form'), jsonText = $state(''), jsonErr = $state(''), saving = $state(false);

  async function loadItems() {
    const r = await api.get(`/api/admin/assist/${collection}/items`); meta = r.collection; items = r.items;
    if (!items.some((i) => i.key === sel)) { sel = null; draft = null; }
    if (sel === null && items.length && meta.kind !== 'array') pick(items[0].key);
  }
  $effect(() => { if (collection) { sel = null; draft = null; q = ''; loadItems(); } });

  async function pick(key: string) {
    if (dirty && !await confirmBox('Есть несохранённые правки. Перейти без сохранения?')) return;
    const it = items.find((i) => i.key === key)!;
    sel = key; draft = $state.snapshot(it.data) as any; orig = JSON.stringify(it.data); tab = 'form'; jsonErr = '';
  }
  const dirty = $derived(draft !== null && JSON.stringify($state.snapshot(draft)) !== orig);
  const label = (it: any) => {
    const d = it.data;
    if (d && typeof d === 'object' && !Array.isArray(d)) for (const k of ['name', 'n', 'title', 'reg', 'q', 'l', 'id']) if (typeof d[k] === 'string' && d[k]) return d[k];
    if (typeof d === 'string') return d.slice(0, 80);
    return it.key;
  };
  const shown = $derived(items.filter((i) => !q || (i.key + label(i) + (typeof i.data === 'string' ? '' : JSON.stringify(i.data))).toLowerCase().includes(q.toLowerCase())).slice(0, 300));

  function toJson() { jsonText = JSON.stringify($state.snapshot(draft), null, 2); jsonErr = ''; tab = 'json'; }
  function fromJson(): boolean { try { draft = JSON.parse(jsonText); jsonErr = ''; return true; } catch (e: any) { jsonErr = 'Ошибка JSON: ' + e.message; return false; } }
  function toForm() { if (fromJson()) tab = 'form'; }

  async function save() {
    if (tab === 'json' && !fromJson()) return;
    saving = true;
    try { await api.put(`/api/admin/assist/${collection}/items/${encodeURIComponent(sel!)}`, { data: $state.snapshot(draft) }); orig = JSON.stringify($state.snapshot(draft)); await loadItems(); await loadCols(); say('Сохранено в рабочей копии. Чтобы увидели операторы — опубликуйте выпуск.'); }
    finally { saving = false; }
  }
  async function remove() {
    if (!await confirmBox('Удалить элемент?')) return;
    await api.del(`/api/admin/assist/${collection}/items/${encodeURIComponent(sel!)}`); sel = null; draft = null; await loadItems(); await loadCols();
  }
  const blankOf = (v: any): any => Array.isArray(v) ? [] : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blankOf(x)])) : typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : '';
  async function addItem() {
    let key: string | undefined; let data: any = items.length ? blankOf(items[0].data) : {};
    if (meta.kind === 'map') { key = await promptBox('Ключ нового элемента (латиница, без пробелов)') ?? ''; if (!key) return; }
    else if (meta.id_field) { const id = await promptBox(`Значение поля «${meta.id_field}» (уникальный id)`); if (!id) return; data[meta.id_field] = id; }
    try { const r = await api.post(`/api/admin/assist/${collection}/items`, { key, data }); await loadItems(); await loadCols(); pick(r.key); }
    catch (e) { if (e instanceof ApiError && e.code === 'exists') alertBox('Такой ключ уже есть'); else throw e; }
  }

  let importing = $state(false);
  async function importJson(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (!f) return;
    try {
      const value = JSON.parse(await f.text());
      if (!await confirmBox(`Заменить всю коллекцию «${meta.title}» содержимым файла?`)) return;
      await api.post(`/api/admin/assist/${collection}/import.json`, { value }); await loadItems(); await loadCols(); say('Импортировано');
    } catch (x) { alertBox(x instanceof ApiError && x.code === 'bad_shape' ? `Неверная структура: нужен ${x.body.expected}` : 'Файл не разобран'); }
    (e.currentTarget as HTMLInputElement).value = '';
  }
  async function importXlsx(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (!f) return;
    if (!await confirmBox(`Заменить всю коллекцию «${meta.title}» данными из Excel?`)) return;
    const fd = new FormData(); fd.append('file', f);
    try { const r = await api.upload(`/api/admin/assist/${collection}/import.xlsx`, fd); await loadItems(); await loadCols(); say(`Импортировано строк: ${r.rows}`); } catch { alertBox('Не удалось разобрать Excel'); }
    (e.currentTarget as HTMLInputElement).value = '';
  }
</script>

{#if toast}<div class="alert ok u-68ea08b">{toast}</div>{/if}

{#if !collection}
  <div class="card hl stack u-8677744">
    <div class="row wrap"><div><h3 class="card-title">Активный выпуск</h3><div class="u-2dd05d2">{active ? `№${active.id} · ${fmtDateTime(active.created_at)}` : '—'}</div><div class="muted small">{active?.note}</div></div>
      <span class="sp"></span>
      <div class="row wrap"><input class="u-5bd1668" placeholder="Что изменилось (заметка)" bind:value={note} /><button class="btn grad" onclick={publish}>Опубликовать выпуск{changedTotal ? ` (${changedTotal} правок)` : ''}</button></div></div>
    <p class="muted small">Операторы видят только опубликованный выпуск. Правки сохраняются в рабочую копию и не влияют на помощника, пока вы не опубликуете. Любой прошлый выпуск можно вернуть.</p>
  </div>

  {#each groups as [g, list]}
    <h3 class="card-title u-57d9a22">{g}</h3>
    <div class="grid u-222434f">
      {#each list as c}
        <a class="card u-20cc3a0" href="#/admin/assist/{c.name}">
          <div class="u-e3ec02a">{c.title}</div><div class="muted xs u-54eb290">{c.descr}</div>
          <div class="row"><span class="chip u-8ea26a6">{c.kind === 'array' ? 'список' : c.kind === 'map' ? 'справочник' : 'значение'} · {c.n}</span>{#if c.changed}<span class="amber xs">● изменено: {c.changed}</span>{/if}</div></a>
      {/each}
    </div>
  {/each}

  <h3 class="card-title u-855107b">Что операторы искали и не нашли (60 дней)</h3>
  <div class="card u-34116c7">
    {#if report.misses.length}
      <div class="list">{#each report.misses as m}<div><span><b>{m.query}</b><div class="muted xs">последний раз {fmtDateTime(m.last)}</div></span><span class="chip">{m.n}×</span></div>{/each}</div>
      <p class="muted xs u-6926ebb">Добавьте недостающие слова в «Деревья неисправностей» (поля tags и uz симптома) или новые сценарии — и опубликуйте выпуск.</p>
    {:else}<p class="muted u-2156831">Пока все запросы находили ответ.</p>{/if}
  </div>

  <h3 class="card-title u-855107b">История выпусков</h3>
  <div class="card u-34116c7"><div class="list">
    {#each releases as r}<div><span><b>№{r.id}</b> · {fmtDateTime(r.created_at)} · {r.by_name ?? 'система'}<div class="muted xs">{r.note}</div></span>
      <span class="row">{#if r.active}<span class="chip on">активен</span>{:else}<button class="btn sm" onclick={() => activate(r, false)}>Сделать активным</button><button class="btn sm" onclick={() => activate(r, true)}>Вернуть всё</button>{/if}</span></div>{/each}
  </div></div>
{:else if meta}
  <div class="row wrap u-87c136d"><a href="#/admin/assist">← Все разделы</a><h2 class="u-881f70f">{meta.title}</h2><span class="sp"></span>
    <button class="btn sm" onclick={() => (window.location.href = `/api/admin/assist/${collection}/export.json`)}>Экспорт JSON</button>
    <label class="btn sm">Импорт JSON<input type="file" accept=".json" class="sr" onchange={importJson} /></label>
    {#if meta.kind !== 'value'}<button class="btn sm" onclick={() => (window.location.href = `/api/admin/assist/${collection}/export.xlsx`)}>Экспорт Excel</button>
      <label class="btn sm">Импорт Excel<input type="file" accept=".xlsx" class="sr" onchange={importXlsx} /></label>{/if}
  </div>

  <div class="grid ai-start" style:grid-template-columns={meta.kind === 'value' || (items.length <= 1 && meta.kind === 'map') ? '1fr' : 'minmax(240px,320px) minmax(0,1fr)'}>
    {#if meta.kind !== 'value' && !(items.length <= 1 && meta.kind === 'map')}
      <aside class="card u-0dc8493">
        <div class="row u-761d3ad"><input type="search" placeholder="Поиск" bind:value={q} /><button class="btn sm grad" onclick={addItem} aria-label="Добавить элемент">+</button></div>
        <div class="stack u-d767683">
          {#each shown as it}
            <button class="nav u-dccf443" class:on={sel === it.key} onclick={() => pick(it.key)}><span class="u-bc65559">{label(it)}</span></button>
          {/each}
          {#if items.length > shown.length}<p class="muted xs">Показано {shown.length} из {items.length} — уточните поиск</p>{/if}
        </div>
      </aside>
    {/if}

    <section class="card u-3922d32">
      {#if draft === null}<p class="muted">Выберите элемент слева</p>
      {:else}
        <div class="row wrap u-9e177fa">
          <div class="tabs u-1169661"><button class:on={tab === 'form'} onclick={toForm}>Форма</button><button class:on={tab === 'json'} onclick={toJson}>JSON</button></div>
          <span class="muted xs">{meta.name}/{sel}</span><span class="sp"></span>
          {#if dirty}<span class="amber xs">● не сохранено</span>{/if}
          {#if meta.kind !== 'value'}<button class="btn sm danger" onclick={remove}>Удалить</button>{/if}
          <button class="btn sm grad" disabled={saving || (!dirty && tab === 'form')} onclick={save}>Сохранить</button>
        </div>
        {#if tab === 'form'}{#key sel}<FormNode bind:value={draft} />{/key}
        {:else}<textarea class="u-ef85edd" bind:value={jsonText} spellcheck="false"></textarea>{#if jsonErr}<div class="alert u-8a77e5a">{jsonErr}</div>{/if}{/if}
      {/if}
    </section>
  </div>
{/if}
