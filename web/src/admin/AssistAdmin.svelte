<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { fmtDateTime } from '../lib/format';
  import FormNode from './FormNode.svelte';
  import Modal from '../components/Modal.svelte';

  let { collection }: { collection: string | null } = $props();

  let cols: any[] = $state([]), active: any = $state(null), releases: any[] = $state([]), note = $state(''), toast = $state('');
  const loadCols = async () => { const r = await api.get('/api/admin/assist/collections'); cols = r.collections; active = r.active; };
  const loadReleases = async () => (releases = (await api.get('/api/admin/assist/releases')).releases);
  loadCols(); loadReleases();

  const groups = $derived.by(() => { const m = new Map<string, any[]>(); for (const c of cols) (m.get(c.grp) ?? m.set(c.grp, []).get(c.grp)!).push(c); return [...m]; });
  const changedTotal = $derived(cols.reduce((n, c) => n + c.changed, 0));
  const say = (m: string) => { toast = m; setTimeout(() => (toast = ''), 2500); };

  async function publish() {
    await api.post('/api/admin/assist/publish', { note }); note = ''; await loadCols(); await loadReleases(); say('Выпуск опубликован — операторы видят новую версию');
  }
  async function activate(r: any, restore: boolean) {
    if (!confirm(restore ? `Вернуть и рабочую копию, и выпуск к версии №${r.id}? Несохранённые правки пропадут.` : `Сделать активным выпуск №${r.id}? Рабочая копия останется как есть.`)) return;
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

  function pick(key: string) {
    if (dirty && !confirm('Есть несохранённые правки. Перейти без сохранения?')) return;
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
    if (!confirm('Удалить элемент?')) return;
    await api.del(`/api/admin/assist/${collection}/items/${encodeURIComponent(sel!)}`); sel = null; draft = null; await loadItems(); await loadCols();
  }
  const blankOf = (v: any): any => Array.isArray(v) ? [] : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blankOf(x)])) : typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : '';
  async function addItem() {
    let key: string | undefined; let data: any = items.length ? blankOf(items[0].data) : {};
    if (meta.kind === 'map') { key = prompt('Ключ нового элемента (латиница, без пробелов)') ?? ''; if (!key) return; }
    else if (meta.id_field) { const id = prompt(`Значение поля «${meta.id_field}» (уникальный id)`); if (!id) return; data[meta.id_field] = id; }
    try { const r = await api.post(`/api/admin/assist/${collection}/items`, { key, data }); await loadItems(); await loadCols(); pick(r.key); }
    catch (e) { if (e instanceof ApiError && e.code === 'exists') alert('Такой ключ уже есть'); else throw e; }
  }

  let importing = $state(false);
  async function importJson(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (!f) return;
    try {
      const value = JSON.parse(await f.text());
      if (!confirm(`Заменить всю коллекцию «${meta.title}» содержимым файла?`)) return;
      await api.post(`/api/admin/assist/${collection}/import.json`, { value }); await loadItems(); await loadCols(); say('Импортировано');
    } catch (x) { alert(x instanceof ApiError && x.code === 'bad_shape' ? `Неверная структура: нужен ${x.body.expected}` : 'Файл не разобран'); }
    (e.currentTarget as HTMLInputElement).value = '';
  }
  async function importXlsx(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (!f) return;
    if (!confirm(`Заменить всю коллекцию «${meta.title}» данными из Excel?`)) return;
    const fd = new FormData(); fd.append('file', f);
    try { const r = await api.upload(`/api/admin/assist/${collection}/import.xlsx`, fd); await loadItems(); await loadCols(); say(`Импортировано строк: ${r.rows}`); } catch { alert('Не удалось разобрать Excel'); }
    (e.currentTarget as HTMLInputElement).value = '';
  }
</script>

{#if toast}<div class="alert ok" style="position:sticky;top:8px;z-index:5;margin-bottom:14px">{toast}</div>{/if}

{#if !collection}
  <div class="card hl stack" style="margin-bottom:24px">
    <div class="row wrap"><div><h3 class="card-title">Активный выпуск</h3><div style="font-weight:700;font-size:18px;margin-top:4px">{active ? `№${active.id} · ${fmtDateTime(active.created_at)}` : '—'}</div><div class="muted small">{active?.note}</div></div>
      <span class="sp"></span>
      <div class="row wrap"><input placeholder="Что изменилось (заметка)" bind:value={note} style="min-width:240px" /><button class="btn grad" onclick={publish}>Опубликовать выпуск{changedTotal ? ` (${changedTotal} правок)` : ''}</button></div></div>
    <p class="muted small">Операторы видят только опубликованный выпуск. Правки сохраняются в рабочую копию и не влияют на помощника, пока вы не опубликуете. Любой прошлый выпуск можно вернуть.</p>
  </div>

  {#each groups as [g, list]}
    <h3 class="card-title" style="margin:20px 0 10px">{g}</h3>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
      {#each list as c}
        <a class="card" href="#/admin/assist/{c.name}" style="padding:18px 20px;text-decoration:none;color:inherit">
          <div style="font-weight:700">{c.title}</div><div class="muted xs" style="margin:4px 0 8px">{c.descr}</div>
          <div class="row"><span class="chip" style="font-size:12px;padding:3px 10px">{c.kind === 'array' ? 'список' : c.kind === 'map' ? 'справочник' : 'значение'} · {c.n}</span>{#if c.changed}<span class="amber xs">● изменено: {c.changed}</span>{/if}</div></a>
      {/each}
    </div>
  {/each}

  <h3 class="card-title" style="margin:28px 0 10px">История выпусков</h3>
  <div class="card" style="padding:8px 20px"><div class="list">
    {#each releases as r}<div><span><b>№{r.id}</b> · {fmtDateTime(r.created_at)} · {r.by_name ?? 'система'}<div class="muted xs">{r.note}</div></span>
      <span class="row">{#if r.active}<span class="chip on">активен</span>{:else}<button class="btn sm" onclick={() => activate(r, false)}>Сделать активным</button><button class="btn sm" onclick={() => activate(r, true)}>Вернуть всё</button>{/if}</span></div>{/each}
  </div></div>
{:else if meta}
  <div class="row wrap" style="margin-bottom:16px"><a href="#/admin/assist">← Все разделы</a><h2 style="font-size:22px">{meta.title}</h2><span class="sp"></span>
    <button class="btn sm" onclick={() => (window.location.href = `/api/admin/assist/${collection}/export.json`)}>Экспорт JSON</button>
    <label class="btn sm">Импорт JSON<input type="file" accept=".json" class="sr" onchange={importJson} /></label>
    {#if meta.kind !== 'value'}<button class="btn sm" onclick={() => (window.location.href = `/api/admin/assist/${collection}/export.xlsx`)}>Экспорт Excel</button>
      <label class="btn sm">Импорт Excel<input type="file" accept=".xlsx" class="sr" onchange={importXlsx} /></label>{/if}
  </div>

  <div class="grid" style="grid-template-columns:{meta.kind === 'value' || (items.length <= 1 && meta.kind === 'map') ? '1fr' : 'minmax(240px,320px) minmax(0,1fr)'};align-items:start">
    {#if meta.kind !== 'value' && !(items.length <= 1 && meta.kind === 'map')}
      <aside class="card" style="padding:16px;position:sticky;top:12px;max-height:calc(100vh - 40px);overflow:auto">
        <div class="row" style="margin-bottom:10px"><input type="search" placeholder="Поиск" bind:value={q} /><button class="btn sm grad" onclick={addItem}>+</button></div>
        <div class="stack" style="gap:4px">
          {#each shown as it}
            <button class="nav" class:on={sel === it.key} onclick={() => pick(it.key)} style="padding:8px 10px;font-size:14px"><span style="overflow:hidden;text-overflow:ellipsis">{label(it)}</span></button>
          {/each}
          {#if items.length > shown.length}<p class="muted xs">Показано {shown.length} из {items.length} — уточните поиск</p>{/if}
        </div>
      </aside>
    {/if}

    <section class="card" style="min-width:0">
      {#if draft === null}<p class="muted">Выберите элемент слева</p>
      {:else}
        <div class="row wrap" style="margin-bottom:14px;position:sticky;top:0;background:var(--card);padding:6px 0;z-index:3">
          <div class="tabs" style="margin:0"><button class:on={tab === 'form'} onclick={toForm}>Форма</button><button class:on={tab === 'json'} onclick={toJson}>JSON</button></div>
          <span class="muted xs">{meta.name}/{sel}</span><span class="sp"></span>
          {#if dirty}<span class="amber xs">● не сохранено</span>{/if}
          {#if meta.kind !== 'value'}<button class="btn sm danger" onclick={remove}>Удалить</button>{/if}
          <button class="btn sm grad" disabled={saving || (!dirty && tab === 'form')} onclick={save}>Сохранить</button>
        </div>
        {#if tab === 'form'}{#key sel}<FormNode bind:value={draft} />{/key}
        {:else}<textarea bind:value={jsonText} spellcheck="false" style="min-height:60vh;font-family:ui-monospace,monospace;font-size:13px"></textarea>{#if jsonErr}<div class="alert" style="margin-top:8px">{jsonErr}</div>{/if}{/if}
      {/if}
    </section>
  </div>
{/if}
