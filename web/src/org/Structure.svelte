<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { api, ApiError } from '../lib/api';
  import { app, has } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import { fmtDate, fmtDateTime } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import Modal from '../components/Modal.svelte';
  import Icon from '../components/Icon.svelte';
  import OrgChart from './OrgChart.svelte';
  import { ot } from './oc18n';

  let tree: any = $state(null), selected: number | null = $state(null), people: any[] = $state([]), noAccess = $state(false), loadingP = $state(false);
  let tab = $state<'chart' | 'tree' | 'archive' | 'log' | 'deleg'>('chart');
  let allPeople: any[] = $state([]), open: Record<number, boolean> = $state({});
  let dragId: number | null = $state(null), dropId: number | null = $state(null), toast = $state('');

  const lang = $derived(app.lang);
  const nm = (n: any) => (lang === 'uz' && n.name_uz) || n.name_ru;
  const kindL = (k: string) => wt(`o_k_${k}`);
  const nodes = $derived<any[]>(tree?.nodes ?? []);
  const byId = $derived(new Map<number, any>(nodes.map((n) => [n.id, n])));
  const kids = $derived.by(() => {
    const m = new Map<number | null, any[]>();
    for (const n of nodes) { const a = m.get(n.parent_id) ?? []; a.push(n); m.set(n.parent_id, a); }
    for (const a of m.values()) a.sort((x, y) => x.sort - y.sort || x.id - y.id);
    return m;
  });
  const sel = $derived(selected != null ? byId.get(selected) : null);
  const canEdit = $derived(!!tree?.can_edit), canLife = $derived(!!tree?.can_lifecycle);
  const isLead = $derived(has('manager', 'head'));

  const flash = (m: string) => { toast = m; setTimeout(() => (toast = ''), 3500); };
  async function loadTree() {
    tree = await api.get('/api/org/tree');
    if (selected == null || !byId.has(selected)) {
      const mine = nodes.find((n: any) => n.mine) ?? nodes.find((n: any) => n.can_open && n.kind !== 'root') ?? nodes[0];
      if (mine) await pick(mine);
    }
  }
  async function pick(n: any) {
    selected = n.id; noAccess = false;
    if (!n.can_open) { people = []; noAccess = true; return; }
    loadingP = true;
    try { people = (await api.get(`/api/org/nodes/${n.id}/people`)).people; } catch { people = []; noAccess = true; } finally { loadingP = false; }
  }
  const reload = async () => { const id = selected; await loadTree(); if (id != null && byId.has(id)) await pick(byId.get(id)); };
  const loadPeople = async () => { if (!allPeople.length) allPeople = (await api.get('/api/people')).people; };
  loadTree();

  /* ----- перетаскивание: админ переносит узел на другой ----- */
  const descendant = (rootId: number, id: number): boolean => id === rootId || (kids.get(rootId) ?? []).some((c) => descendant(c.id, id));
  const canDrop = (drag: any, target: any) => !!drag && drag.id !== target.id && drag.kind !== 'root' && tree.child_kinds[target.kind]?.includes(drag.kind) && !descendant(drag.id, target.id) && drag.parent_id !== target.id;
  async function drop(target: any) {
    const d = dragId != null ? byId.get(dragId) : null;
    dragId = null; dropId = null;
    if (!d || !canDrop(d, target)) return;
    try { await api.post(`/api/org/nodes/${d.id}/move`, { parent_id: target.id }); open[target.id] = true; await reload(); flash('✓'); }
    catch (e) { flash(e instanceof ApiError && e.code === 'cycle' ? wt('o_err_cycle') : e instanceof ApiError && e.code === 'bad_level' ? wt('o_err_level') : wt('o_err')); }
  }
  async function order(n: any, dir: 'up' | 'down') { await api.post(`/api/org/nodes/${n.id}/order`, { dir }); await reload(); }

  /* ----- диалоги ----- */
  let dlg: { type: string; node?: any; person?: any } | null = $state(null);
  let f: Record<string, any> = $state({}), err = $state(''), busy = $state(false), result = $state('');
  const todayIso = () => new Date().toISOString().slice(0, 10);
  function show(type: string, o: { node?: any; person?: any } = {}) {
    dlg = { type, ...o }; err = ''; result = ''; busy = false;
    f = { name_ru: '', name_uz: '', kind: '', head: '', allowed: ['chat', 'training'], parent: '', node: '', date: '', leave: 'vacation', from: todayIso(), to: todayIso(), deputy: '', reason: '', confirm: '', to_user: '' };
    if (type === 'add') f.kind = tree.child_kinds[o.node.kind][0] ?? '';
    if (type === 'edit') { f.name_ru = o.node.name_ru; f.name_uz = o.node.name_uz; f.head = o.node.head?.id ?? ''; f.allowed = [...o.node.allowed]; f.parent = o.node.parent_id ?? ''; }
    if (['add', 'edit', 'leave', 'deleg'].includes(type)) loadPeople();
  }
  const close = () => (dlg = null);
  const ecode = (e: unknown) => (e instanceof ApiError ? e.code : 'error');
  const msg = (c: string) => ({ bad_level: wt('o_err_level'), cycle: wt('o_err_cycle'), not_empty: wt('o_not_empty'), reason_required: wt('o_reason'), confirm_mismatch: wt('o_delete_hint') } as Record<string, string>)[c] ?? wt('o_err');
  async function run(fn: () => Promise<any>, after?: (r: any) => void) {
    busy = true; err = '';
    try { const r = await fn(); if (after) after(r); else close(); await reload(); }
    catch (e) { err = msg(ecode(e)); } finally { busy = false; }
  }
  const submit = () => {
    const d = dlg!, n = d.node, p = d.person;
    if (d.type === 'add') return run(() => api.post('/api/org/nodes', { parent_id: n.id, kind: f.kind, name_ru: f.name_ru, name_uz: f.name_uz, head_user_id: f.head || null, allowed: f.allowed }), () => { open[n.id] = true; close(); });
    if (d.type === 'edit') return run(async () => {
      await api.patch(`/api/org/nodes/${n.id}`, { name_ru: f.name_ru, name_uz: f.name_uz, head_user_id: f.head || null, ...(n.kind === 'external' ? { allowed: f.allowed } : {}) });
      if (f.parent && Number(f.parent) !== n.parent_id) await api.post(`/api/org/nodes/${n.id}/move`, { parent_id: Number(f.parent) });
    });
    if (d.type === 'delete') return run(() => api.del(`/api/org/nodes/${n.id}`), () => { selected = null; close(); });
    if (d.type === 'transfer') return run(() => api.post(`/api/org/users/${p.id}/transfer`, { node_id: Number(f.node), date: f.date || undefined }));
    if (d.type === 'staff') return run(() => api.post(`/api/org/users/${p.id}/to-staff`));
    if (d.type === 'leave') return run(() => api.post(`/api/org/users/${p.id}/leave`, { kind: f.leave, from: f.from, to: f.to, deputy_id: f.deputy || undefined }));
    if (d.type === 'dismiss') return run(() => api.post(`/api/org/users/${p.id}/dismiss`, { reason: f.reason }));
    if (d.type === 'restore') return run(() => api.post(`/api/org/users/${p.id}/restore`), (r) => { result = `${wt('o_restored_pw')} ${r.password}`; });
    if (d.type === 'purge') return run(() => api.post(`/api/org/users/${p.id}/delete`, { confirm_name: f.confirm }));
    if (d.type === 'deleg') return run(() => api.post('/api/org/delegations', { to_user_id: Number(f.to_user), from: f.from, to: f.to }), () => { close(); loadDeleg(); });
  };

  /* ----- допуски для выбора ----- */
  const parents = (n: any) => nodes.filter((p) => tree.child_kinds[p.kind]?.includes(n.kind) && !descendant(n.id, p.id));
  const transferTargets = $derived(nodes.filter((n) => n.kind !== 'root'));
  const pathOf = (id: number): string => { const n = byId.get(id); return n ? [n.parent_id != null && byId.get(n.parent_id)?.kind !== 'root' ? pathOf(n.parent_id) : '', nm(n)].filter(Boolean).join(' / ') : ''; };

  /* ----- вкладки: архив, журнал, замещение ----- */
  let archive: any[] = $state([]), log: any[] = $state([]), deleg: any[] = $state([]);
  const loadArchive = async () => (archive = (await api.get('/api/org/archive')).people);
  const loadLog = async () => (log = (await api.get('/api/org/log')).items);
  const loadDeleg = async () => (deleg = (await api.get('/api/org/delegations')).items);
  $effect(() => { if (tab === 'archive') loadArchive(); else if (tab === 'log') loadLog(); else if (tab === 'deleg') loadDeleg(); });
  async function dropDeleg(id: number) { await api.del(`/api/org/delegations/${id}`); await loadDeleg(); }
  const LOG_RU: Record<string, string> = { org_node_create: 'Создан узел', org_node_rename: 'Узел изменён', org_head_set: 'Назначен руководитель узла', org_node_move: 'Узел перенесён', org_node_reorder: 'Порядок изменён', org_node_delete: 'Узел удалён',
    org_import: 'Импорт из Excel', org_export: 'Экспорт в Excel', emp_transfer: 'Перевод сотрудника', emp_to_staff: 'Перевод в штат', emp_leave: 'Отпуск / больничный', emp_leave_cancel: 'Отпуск отменён', emp_delegate: 'Права делегированы',
    emp_delegate_cancel: 'Делегирование снято', emp_dismiss: 'Увольнение', emp_restore: 'Восстановление из архива', emp_delete: 'Полное удаление' };
  const LOG_UZ: Record<string, string> = { org_node_create: 'Bo‘linma yaratildi', org_node_rename: 'Bo‘linma o‘zgardi', org_head_set: 'Bo‘linma rahbari tayinlandi', org_node_move: 'Bo‘linma ko‘chirildi', org_node_reorder: 'Tartib o‘zgardi', org_node_delete: 'Bo‘linma o‘chirildi',
    org_import: 'Exceldan import', org_export: 'Excelga eksport', emp_transfer: 'Xodim ko‘chirildi', emp_to_staff: 'Shtatga o‘tkazildi', emp_leave: 'Ta’til / kasallik', emp_leave_cancel: 'Ta’til bekor qilindi', emp_delegate: 'Huquqlar topshirildi',
    emp_delegate_cancel: 'Topshirish bekor qilindi', emp_dismiss: 'Ishdan bo‘shatish', emp_restore: 'Arxivdan tiklash', emp_delete: 'Butunlay o‘chirish' };
  const logL = (a: string) => ((lang === 'uz' ? LOG_UZ : LOG_RU)[a] ?? a);
  const metaTxt = (m: any) => (m ? Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(' · ').slice(0, 140) : '');

  /* ----- Excel ----- */
  let imp: { file: File; res: any } | null = $state(null), impBusy = $state(false);
  async function pickImport(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]; (e.currentTarget as HTMLInputElement).value = '';
    if (file) await runImport(file, false);
  }
  async function runImport(file: File, commit: boolean) {
    impBusy = true;
    const fd = new FormData(); fd.append('commit', commit ? '1' : '0'); fd.append('file', file);
    try { imp = { file, res: await api.upload('/api/org/import.xlsx', fd) }; if (commit) await reload(); }
    catch (e) { imp = { file, res: e instanceof ApiError ? e.body : { errors: [{ sheet: '', row: 0, msg: wt('o_err') }] } }; }
    finally { impBusy = false; }
  }
  const sectionsAll = $derived<string[]>(tree?.sections ?? []);
  const toggleSec = (s: string) => { f.allowed = f.allowed.includes(s) ? f.allowed.filter((x: string) => x !== s) : [...f.allowed, s]; };
</script>

<header class="page-head">
  <div><h1>{wt('o_title')}<PageHelp topic="structure" /></h1><p class="sub">{wt('o_sub')}</p></div>
  {#if canLife}
    <div class="head-actions row" style="gap:8px;flex-wrap:wrap">
      <a class="btn sm" href="/api/org/export.xlsx" download>{wt('o_export')}</a>
      {#if canEdit}<label class="btn sm" style="cursor:pointer">{wt('o_import')}<input type="file" accept=".xlsx" class="sr" onchange={pickImport} /></label>{/if}
    </div>
  {/if}
</header>

{#if app.user?.acting}<div class="alert info" style="margin-bottom:14px">{wt('o_acting')}</div>{/if}
{#if toast}<div class="alert" style="margin-bottom:14px">{toast}</div>{/if}

<nav class="tabs">
  <button class:on={tab === 'chart'} onclick={() => (tab = 'chart')}>{ot('tabChart')}</button>
  <button class:on={tab === 'tree'} onclick={() => (tab = 'tree')}>{ot('tabList')}</button>
  {#if canLife}<button class:on={tab === 'archive'} onclick={() => (tab = 'archive')}>{wt('o_tab_archive')}</button><button class:on={tab === 'log'} onclick={() => (tab = 'log')}>{wt('o_tab_log')}</button>{/if}
  {#if isLead || canEdit}<button class:on={tab === 'deleg'} onclick={() => (tab = 'deleg')}>{wt('o_tab_deleg')}</button>{/if}
</nav>

{#if imp}
  <section class="card stack" style="margin-bottom:16px">
    {#if imp.res.errors?.length}
      <h3 class="card-title">{wt('o_import_err')}</h3>
      <div class="list">{#each imp.res.errors as e}<div><span class="small">{e.sheet ? `${e.sheet}, ` : ''}{e.row ? `строка ${e.row}: ` : ''}{e.msg}</span></div>{/each}</div>
    {:else}
      <p class="small">{wt('o_import_sum', { n: imp.res.nodes_new ?? 0, u: imp.res.users_new ?? 0, up: imp.res.users_update ?? 0 })}</p>
      {#if imp.res.created?.length}
        <p class="muted small">{wt('o_import_pw')}</p>
        <div class="list">{#each imp.res.created as c}<div><span>{c.name} <span class="muted xs">({c.login})</span></span><b>{c.password}</b></div>{/each}</div>
      {/if}
      {#if !imp.res.committed}<button class="btn grad" disabled={impBusy} onclick={() => runImport(imp!.file, true)}>{wt('o_import_apply')}</button>{/if}
    {/if}
    <button class="btn sm" onclick={() => (imp = null)}>{wt('o_cancel')}</button>
    <span class="muted xs">{wt('o_import_hint')}</span>
  </section>
{/if}

{#if tab === 'chart'}
  <OrgChart canManage={canLife || canEdit || isLead} onmanage={(id) => { tab = 'tree'; const n = byId.get(id); if (n) pick(n); }} />
{:else if tab === 'tree'}
  {#if !tree}<span class="spin"></span>{:else}
  <div class="org-grid">
    <section class="card org-tree">
      {#if canEdit}<p class="muted xs" style="margin-bottom:8px">{wt('o_move_hint')}</p>{/if}
      {#snippet branch(pid: number | null, depth: number)}
        {#each kids.get(pid) ?? [] as n (n.id)}
          {@const ch = kids.get(n.id) ?? []}
          <div class="tn">
            <div class="tn-row" class:sel={selected === n.id} class:drop={dropId === n.id} style="padding-left:{6 + depth * 18}px"
              role="treeitem" aria-selected={selected === n.id} tabindex="0" draggable={canEdit && n.kind !== 'root'}
              ondragstart={() => (dragId = n.id)} ondragend={() => { dragId = null; dropId = null; }}
              ondragover={(e) => { const d = dragId != null ? byId.get(dragId) : null; if (d && canDrop(d, n)) { e.preventDefault(); dropId = n.id; } }}
              ondragleave={() => dropId === n.id && (dropId = null)} ondrop={(e) => { e.preventDefault(); drop(n); }}
              onclick={() => pick(n)} onkeydown={(e) => e.key === 'Enter' && pick(n)}>
              {#if ch.length}<button class="tn-t" aria-label="toggle" onclick={(e) => { e.stopPropagation(); open[n.id] = !(open[n.id] ?? depth < 2); }}><svg viewBox="0 0 24 24" style="transform:rotate({(open[n.id] ?? depth < 2) ? 90 : 0}deg)"><path d="M9 6l6 6-6 6" /></svg></button>{:else}<span class="tn-t"></span>{/if}
              <span class="tn-k k-{n.kind}">{kindL(n.kind)}</span>
              <b class="tn-n">{nm(n)}</b>
              {#if n.head}<span class="muted xs tn-h">{n.head.name}</span>{/if}
              <span class="tn-c muted xs">{n.total}</span>
            </div>
            {#if ch.length && (open[n.id] ?? depth < 2)}{@render branch(n.id, depth + 1)}{/if}
          </div>
        {/each}
      {/snippet}
      <div role="tree">{@render branch(null, 0)}</div>
    </section>

    <section class="card org-node stack">
      {#if sel}
        <div class="row" style="align-items:flex-start;gap:12px;flex-wrap:wrap">
          <div style="min-width:0;flex:1">
            <div class="muted xs">{kindL(sel.kind)}{#if sel.kind !== 'root'} · {pathOf(sel.id)}{/if}</div>
            <h2 style="margin:2px 0">{nm(sel)}</h2>
            <div class="small muted">{wt('o_head')}: <b style="color:var(--text)">{sel.head?.name ?? wt('o_no_head')}</b> · {wt('o_direct')}: {sel.direct} · {wt('o_total')}: {sel.total}</div>
            {#if sel.kind === 'external'}<div class="small" style="margin-top:6px">{wt('o_external_note')}<br />{#each sel.allowed as s}<span class="chip" style="margin:4px 4px 0 0">{wt(`o_s_${s}`)}</span>{/each}</div>{/if}
          </div>
          {#if canEdit}
            <div class="row wrap" style="gap:6px">
              {#if tree.child_kinds[sel.kind]?.length}<button class="btn sm" onclick={() => show('add', { node: sel })}>{wt('o_add_in')}</button>{/if}
              <button class="btn sm" onclick={() => show('edit', { node: sel })}>{wt('o_edit')}</button>
              {#if sel.kind !== 'root'}
                <button class="btn sm" aria-label="up" onclick={() => order(sel, 'up')}>↑</button><button class="btn sm" aria-label="down" onclick={() => order(sel, 'down')}>↓</button>
                <button class="btn sm danger" onclick={() => show('delete', { node: sel })}>{wt('o_delete')}</button>
              {/if}
            </div>
          {/if}
        </div>

        <h3 class="card-title">{wt('o_people')}</h3>
        {#if noAccess}<p class="muted small">{wt('o_no_access')}</p>
        {:else if loadingP}<span class="spin"></span>
        {:else if !people.length}<p class="muted small">{wt('o_people_none')}</p>
        {:else}
          <div class="org-people">
            {#each people as p (p.id)}
              <div class="op-row">
                <Avatar u={{ ...p, bday: false }} size={38} />
                <div class="op-info">
                  <b>{p.name}</b> <span class="chip" class:warn={p.employment === 'intern'}>{p.employment === 'intern' ? wt('o_e_intern') : wt('o_e_staff')}</span>
                  {#if p.on_leave}<span class="chip">🌴 {wt('o_on_leave')}</span>{/if}
                  {#if p.pending_transfer}<span class="chip">↪ {wt('o_pending_tr', { d: fmtDate(p.pending_transfer.effective_date) })}</span>{/if}
                  <div class="muted xs">{p.position}</div>
                </div>
                {#if canLife || isLead}
                  <div class="row wrap" style="gap:6px;justify-content:flex-end">
                    {#if canLife}<button class="btn sm" onclick={() => show('transfer', { person: p })}>{wt('o_a_transfer')}</button>{/if}
                    {#if canLife && p.employment === 'intern'}<button class="btn sm" onclick={() => show('staff', { person: p })}>{wt('o_a_staff')}</button>{/if}
                    <button class="btn sm" onclick={() => show('leave', { person: p })}>{wt('o_a_leave')}</button>
                    {#if canLife}<button class="btn sm danger" onclick={() => show('dismiss', { person: p })}>{wt('o_a_dismiss')}</button>{/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </section>
  </div>
  {/if}
{:else if tab === 'archive'}
  <section class="card">
    {#if !archive.length}<p class="muted">{wt('o_arch_none')}</p>{:else}
      <div class="list">
        {#each archive as p (p.id)}
          <div style="align-items:flex-start;gap:12px;flex-wrap:wrap">
            <span style="min-width:0"><b>{p.name}</b> <span class="muted xs">({p.login})</span><br /><span class="muted xs">{p.position} · {p.node_path}</span><br />
              <span class="xs">{wt('o_dismissed')}: {p.dismissed_at ? fmtDate(p.dismissed_at) : '—'}{#if p.dismiss_reason} · {wt('o_reason_l')}: {p.dismiss_reason}{/if}</span></span>
            <span class="row" style="gap:6px"><button class="btn sm" onclick={() => show('restore', { person: p })}>{wt('o_restore')}</button>
              {#if canEdit}<button class="btn sm danger" onclick={() => show('purge', { person: p })}>{wt('o_delete_person')}</button>{/if}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
{:else if tab === 'log'}
  <section class="card">
    {#if !log.length}<p class="muted">{wt('o_log_none')}</p>{:else}
      <div class="list">{#each log as l (l.id)}<div style="align-items:flex-start"><span><b>{logL(l.action)}</b> <span class="muted xs">{metaTxt(l.meta)}</span></span><span class="muted xs" style="text-align:right">{l.by_name ?? '—'}<br />{fmtDateTime(l.created_at)}</span></div>{/each}</div>
    {/if}
  </section>
{:else}
  <section class="card stack">
    <h3 class="card-title">{wt('o_deleg_title')}</h3>
    <p class="muted small">{wt('o_deleg_hint')}</p>
    <button class="btn grad" style="align-self:flex-start" onclick={() => show('deleg')}>{wt('o_deleg_add')}</button>
    {#if !deleg.length}<p class="muted small">{wt('o_deleg_none')}</p>{:else}
      <div class="list">{#each deleg as d (d.id)}<div><span class="small">{d.from_name} → <b>{d.to_name}</b> · {fmtDate(d.from_date)} — {fmtDate(d.to_date)}</span>
        {#if d.from_user_id === app.user?.id || canEdit}<button class="btn sm" onclick={() => dropDeleg(d.id)}>{wt('o_cancel')}</button>{/if}</div>{/each}</div>
    {/if}
  </section>
{/if}

{#if dlg}
  <Modal onclose={close}>
    <form class="stack" onsubmit={(e) => { e.preventDefault(); submit(); }}>
      {#if dlg.type === 'add' || dlg.type === 'edit'}
        <h2>{dlg.type === 'add' ? wt('o_add_in') : wt('o_edit')}: {nm(dlg.node)}</h2>
        {#if dlg.type === 'add'}
          <label class="f">{wt('o_kind')}<select bind:value={f.kind}>{#each tree.child_kinds[dlg.node.kind] as k}<option value={k}>{kindL(k)}</option>{/each}</select></label>
        {/if}
        <label class="f">{wt('o_name_ru')}<input bind:value={f.name_ru} required maxlength="100" /></label>
        <label class="f">{wt('o_name_uz')}<input bind:value={f.name_uz} maxlength="100" /></label>
        <label class="f">{wt('o_head')}<select bind:value={f.head}><option value="">{wt('o_no_head')}</option>{#each allPeople as p}<option value={p.id}>{p.name} — {p.position}</option>{/each}</select></label>
        {#if dlg.type === 'edit' && dlg.node.kind !== 'root'}
          <label class="f">→<select bind:value={f.parent}>{#each parents(dlg.node) as p}<option value={p.id}>{kindL(p.kind)}: {nm(p)}</option>{/each}</select></label>
        {/if}
        {#if (dlg.type === 'add' && f.kind === 'external') || (dlg.type === 'edit' && dlg.node.kind === 'external')}
          <div><div class="muted small">{wt('o_allowed')}</div><div class="row wrap" style="gap:6px;margin-top:6px">
            {#each sectionsAll as s}<button type="button" class="chip" class:on={f.allowed.includes(s)} onclick={() => toggleSec(s)}>{f.allowed.includes(s) ? '✓ ' : ''}{wt(`o_s_${s}`)}</button>{/each}</div></div>
        {/if}
      {:else if dlg.type === 'delete'}
        <h2>{wt('o_delete')}: {nm(dlg.node)}</h2><p class="muted">{wt('o_not_empty')}</p>
      {:else if dlg.type === 'transfer'}
        <h2>{wt('o_a_transfer')}: {dlg.person.name}</h2>
        <label class="f">{wt('o_transfer_to')}<select bind:value={f.node} required><option value="">{wt('o_pick')}</option>{#each transferTargets as n}<option value={n.id}>{kindL(n.kind)}: {pathOf(n.id)}</option>{/each}</select></label>
        <label class="f">{wt('o_transfer_date')}<input type="date" bind:value={f.date} /></label>
        <p class="muted small">{wt('o_transfer_note')}</p>
      {:else if dlg.type === 'staff'}
        <h2>{wt('o_a_staff')}: {dlg.person.name}</h2><p class="muted">{wt('o_e_intern')} → {wt('o_e_staff')}</p>
      {:else if dlg.type === 'leave'}
        <h2>{wt('o_a_leave')}: {dlg.person.name}</h2>
        <div class="tabs" style="margin:0"><button type="button" class:on={f.leave === 'vacation'} onclick={() => (f.leave = 'vacation')}>{wt('o_vacation')}</button><button type="button" class:on={f.leave === 'sick'} onclick={() => (f.leave = 'sick')}>{wt('o_sick')}</button></div>
        <div class="row" style="gap:10px"><label class="f" style="flex:1;margin:0">{wt('o_from')}<input type="date" bind:value={f.from} required /></label><label class="f" style="flex:1;margin:0">{wt('o_to')}<input type="date" bind:value={f.to} required /></label></div>
        <label class="f">{wt('o_deputy')}<select bind:value={f.deputy}><option value="">{wt('o_none')}</option>{#each allPeople.filter((p) => p.id !== dlg!.person.id) as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
        <p class="muted small">{wt('o_leave_note')}</p>
      {:else if dlg.type === 'dismiss'}
        <h2>{wt('o_a_dismiss')}: {dlg.person.name}</h2>
        <label class="f">{wt('o_reason')}<textarea bind:value={f.reason} required maxlength="300"></textarea></label>
        <p class="muted small">{wt('o_dismiss_warn')}</p>
      {:else if dlg.type === 'restore'}
        <h2>{wt('o_restore')}: {dlg.person.name}</h2>
        {#if result}<div class="alert ok" style="user-select:all">{result}</div>{/if}
      {:else if dlg.type === 'purge'}
        <h2>{wt('o_delete_person')}</h2><p class="muted">{wt('o_delete_hint')} <b>{dlg.person.name}</b></p><input bind:value={f.confirm} required placeholder={dlg.person.name} />
      {:else if dlg.type === 'deleg'}
        <h2>{wt('o_deleg_title')}</h2>
        <label class="f">{wt('o_deleg_to')}<select bind:value={f.to_user} required><option value="">{wt('o_pick')}</option>{#each allPeople.filter((p) => p.id !== app.user?.id) as p}<option value={p.id}>{p.name} — {p.position}</option>{/each}</select></label>
        <div class="row" style="gap:10px"><label class="f" style="flex:1;margin:0">{wt('o_from')}<input type="date" bind:value={f.from} required /></label><label class="f" style="flex:1;margin:0">{wt('o_to')}<input type="date" bind:value={f.to} required /></label></div>
        <p class="muted small">{wt('o_deleg_hint')}</p>
      {/if}
      {#if err}<div class="alert">{err}</div>{/if}
      <div class="row" style="gap:8px;justify-content:flex-end">
        <button type="button" class="btn" onclick={close}>{result ? 'OK' : wt('o_cancel')}</button>
        {#if !result}<button class="btn grad" disabled={busy}>{dlg.type === 'dismiss' || dlg.type === 'delete' || dlg.type === 'purge' ? wt('o_confirm') : wt('o_save')}</button>{/if}
      </div>
    </form>
  </Modal>
{/if}

<style>
  .org-grid { display: grid; grid-template-columns: minmax(300px, 420px) 1fr; gap: 20px; align-items: start; }
  .org-tree { padding: 14px 10px; overflow-x: auto; }
  .tn-row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 12px; cursor: pointer; min-height: 40px; border: 1px dashed transparent; }
  .tn-row:hover { background: var(--card-2); }
  .tn-row.sel { background: var(--nav-on); }
  .tn-row.drop { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); }
  .tn-t { width: 22px; height: 22px; border: 0; background: none; color: var(--muted); display: grid; place-items: center; cursor: pointer; flex: none; padding: 0; }
  .tn-t svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s; }
  .tn-k { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; padding: 2px 7px; border-radius: 8px; background: var(--chip); color: var(--muted); flex: none; }
  .tn-k.k-external { background: color-mix(in srgb, #f59e0b 25%, transparent); color: inherit; }
  .tn-n { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tn-h { margin-left: auto; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
  .tn-c { flex: none; min-width: 22px; text-align: right; }
  .org-people { display: flex; flex-direction: column; gap: 4px; }
  .op-row { display: flex; align-items: center; gap: 12px; padding: 10px 6px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  .op-row:last-child { border-bottom: 0; }
  .op-row .chip { padding: 2px 10px; font-size: 12px; }
  .op-info { flex: 1 1 220px; min-width: 0; }
  .chip.warn { background: color-mix(in srgb, #f59e0b 25%, transparent); }
  .chip.on { background: var(--chip-on-bg); color: var(--chip-on-ink); }
  button.chip { cursor: pointer; border: 1px solid var(--border); }
  @media (max-width: 980px) { .org-grid { grid-template-columns: 1fr; } }
</style>
