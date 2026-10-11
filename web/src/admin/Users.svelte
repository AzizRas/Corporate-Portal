<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { fmtDate } from '../lib/format';

  const ROLES = [['employee', 'Сотрудник'], ['newbie', 'Новичок'], ['mentor', 'Наставник'], ['senior', 'Старший оператор'], ['manager', 'Супервайзер'], ['head', 'Руководитель отдела'], ['hr', 'HR'], ['recruiter', 'Рекрутер'], ['accountant', 'Бухгалтерия'], ['editor', 'Редактор базы'], ['admin', 'Админ']];
  let users: any[] = $state([]), depts: any[] = $state([]), edit: any = $state(null), isNew = $state(false), msg = $state(''), tempPw = $state(''), q = $state('');
  let imp: any = $state(null);
  async function runImport(commit: boolean) {
    imp.busy = true;
    const fd = new FormData(); fd.append('dept_id', imp.dept); fd.append('commit', commit ? '1' : '0'); fd.append('file', imp.file);
    try { imp.res = await api.upload('/api/admin/users/import', fd); if (commit) await load(); }
    catch { imp.err = 'Не удалось прочитать файл: нужна таблица с колонкой «ФИО»'; } finally { imp.busy = false; }
  }
  function downloadCreds() {
    const rows = imp.res.rows.filter((r: any) => r.status === 'new');
    const csv = '\ufeffФИО;Логин;Пароль;Должность\n' + rows.map((r: any) => [r.name, r.login, r.password, r.position].join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'logins.csv'; a.click();
  }
  const load = () => api.get('/api/admin/users').then((r) => (users = r.users));
  load(); api.get('/api/departments').then((r) => (depts = r.departments));
  // узлы структуры: сотрудник размещается в узле дерева, отдел определяется по нему
  let orgNodes: any[] = $state([]);
  api.get('/api/org/tree').then((r) => (orgNodes = r.nodes)).catch(() => {});
  const nodePath = (id: number | null): string => { const n = orgNodes.find((x) => x.id === id); return n ? [n.parent_id != null && orgNodes.find((x) => x.id === n.parent_id)?.kind !== 'root' ? nodePath(n.parent_id) : '', n.name_ru].filter(Boolean).join(' / ') : ''; };
  const shown = $derived(users.filter((u) => !q || (u.name + u.login + (u.tab_number ?? '')).toLowerCase().includes(q.toLowerCase())));
  const deptName = (id: number) => depts.find((d) => d.id === id)?.name_ru ?? '';

  const blank = () => ({ name: '', login: '', tab_number: '', position: '', position_code: 'op', dept_id: '', node_id: '', manager_id: '', lang: 'ru', roles: ['employee'], active: true, shift_start: '09:00', shift_end: '18:00' });
  function open(u: any | null) { isNew = !u; edit = u ? { ...u, roles: [...u.roles], shift_start: u.shift_start?.slice(0, 5), shift_end: u.shift_end?.slice(0, 5) } : blank(); msg = ''; tempPw = ''; }
  const toggleRole = (r: string) => (edit.roles = edit.roles.includes(r) ? edit.roles.filter((x: string) => x !== r) : [...edit.roles, r]);

  async function save() {
    msg = '';
    try {
      const body = { ...edit, dept_id: edit.node_id ? undefined : edit.dept_id || null, node_id: edit.node_id || null, manager_id: edit.manager_id || null };
      if (isNew) { const r = await api.post('/api/admin/users', body); tempPw = r.password; isNew = false; edit.id = r.id; }
      else { await api.patch(`/api/admin/users/${edit.id}`, body); edit = null; }
      await load();
    } catch (e) { msg = e instanceof ApiError ? ({ exists: 'Такой логин или табельный уже есть', invalid: 'Заполните имя и логин (латиница)', self_lock: 'Нельзя заблокировать себя' } as any)[e.code] ?? e.code : 'Ошибка'; }
  }
  async function reset() { tempPw = (await api.post(`/api/admin/users/${edit.id}/reset-password`)).password; }
</script>

<div class="row" style="margin-bottom:16px"><input type="search" placeholder="Поиск" bind:value={q} style="max-width:320px" /><span class="sp"></span><button class="btn" onclick={() => (imp = { dept: '', file: null, res: null, busy: false })}>Импорт из Excel</button><button class="btn grad" onclick={() => open(null)}>+ Сотрудник</button></div>
<div class="card scroll-x" style="padding:12px 16px">
  <table class="table">
    <thead><tr><th>Таб.</th><th>ФИО</th><th>Должность</th><th>Отдел</th><th>Роли</th><th></th></tr></thead>
    <tbody>
      {#each shown as u}
        <tr style:opacity={u.active ? 1 : .5}><td>{u.tab_number ?? ''}</td><td><b>{u.name}</b><div class="muted xs">{u.login}</div></td><td>{u.position}</td><td>{nodePath(u.node_id) || deptName(u.dept_id)}{#if u.employment === 'intern'} <span class="chip">стажёр</span>{/if}</td>
          <td>{#each u.roles as r}<span class="chip" style="padding:2px 8px;font-size:12px;margin:1px">{r}</span>{/each}</td><td><button class="btn sm" onclick={() => open(u)}>Править</button></td></tr>
      {/each}
    </tbody>
  </table>
</div>

{#if edit}
  <Modal onclose={() => (edit = null)} wide>
    <h2>{isNew ? 'Новый сотрудник' : edit.name}</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 16px">
      <label class="f">ФИО<input bind:value={edit.name} /></label>
      <label class="f">Логин (латиница){#if !isNew}<input value={edit.login} disabled />{:else}<input bind:value={edit.login} />{/if}</label>
      <label class="f">Табельный №<input bind:value={edit.tab_number} /></label>
      <label class="f">Должность<input bind:value={edit.position} /></label>
      <label class="f">Код должности<select bind:value={edit.position_code}>{#each ['op', 'sr', 'sv', 'hd', 'wh', 'ex'] as c}<option>{c}</option>{/each}</select></label>
      <label class="f">Узел структуры<select bind:value={edit.node_id}><option value="">— (по отделу)</option>{#each orgNodes.filter((n) => n.kind !== 'root') as n}<option value={n.id}>{nodePath(n.id)}</option>{/each}</select></label>
      {#if !edit.node_id}<label class="f">Отдел<select bind:value={edit.dept_id}><option value="">—</option>{#each depts as d}<option value={d.id}>{d.name_ru}</option>{/each}</select></label>{/if}
      <label class="f">Руководитель<select bind:value={edit.manager_id}><option value="">—</option>{#each users as m}<option value={m.id}>{m.name}</option>{/each}</select></label>
      <label class="f">Язык<select bind:value={edit.lang}><option value="ru">RU</option><option value="uz">UZ</option></select></label>
      <label class="f">Смена с<input type="time" bind:value={edit.shift_start} /></label>
      <label class="f">Смена до<input type="time" bind:value={edit.shift_end} /></label>
    </div>
    <div class="muted small" style="margin-bottom:8px">Роли (можно несколько)</div>
    <div class="row wrap" style="margin-bottom:14px">{#each ROLES as [r, l]}<label class="chk chip" class:on={edit.roles.includes(r)}><input type="checkbox" class="sr" checked={edit.roles.includes(r)} onchange={() => toggleRole(r)} />{l}</label>{/each}</div>
    {#if !isNew}<label class="chk" style="margin-bottom:14px"><input type="checkbox" bind:checked={edit.active} /> Активен (при снятии фото прихода удаляются)</label>{/if}
    {#if tempPw}<div class="alert ok">Временный пароль (показывается один раз): <b style="user-select:all">{tempPw}</b></div>{/if}
    {#if msg}<div class="alert">{msg}</div>{/if}
    <div class="row" style="justify-content:flex-end;margin-top:12px">
      {#if !isNew}<button class="btn" onclick={reset}>Сбросить пароль</button>{/if}
      <span class="sp"></span><button class="btn" onclick={() => (edit = null)}>Закрыть</button><button class="btn grad" onclick={save}>Сохранить</button>
    </div>
  </Modal>
{/if}

{#if imp}
  <Modal onclose={() => (imp = null)} wide>
    <h2>Импорт сотрудников из Excel</h2>
    {#if !imp.res?.committed}
      <p class="muted small" style="margin-bottom:12px">Нужны колонки «ФИО», «Должность», «Дата приёма» (можно тот же файл с зарплатой). Каждому создаётся логин (латиницей, например <b>kosimjonov.davron</b>) и пароль из 6 цифр; при первом входе сотрудник задаёт свой. Уже существующие ФИО пропускаются.</p>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <label class="f">Отдел<select bind:value={imp.dept}><option value="">—</option>{#each depts as d}<option value={d.id}>{d.name_ru}</option>{/each}</select></label>
        <label class="f">Файл .xlsx<input type="file" accept=".xlsx" onchange={(e) => { imp.file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null; imp.res = null; imp.err = ''; }} /></label>
      </div>
      {#if imp.err}<div class="alert">{imp.err}</div>{/if}
      {#if imp.res}
        <div class="scroll-x" style="max-height:340px;overflow:auto;margin:8px 0"><table class="table"><thead><tr><th>ФИО</th><th>Должность</th><th>Принят</th><th>Логин</th><th></th></tr></thead><tbody>
          {#each imp.res.rows as r}<tr style:opacity={r.status === 'new' ? 1 : .5}><td>{r.name}</td><td>{r.position}</td><td>{r.hired ? fmtDate(r.hired) : ''}</td><td>{r.login ?? ''}</td><td class="xs">{r.status === 'new' ? 'будет создан' : 'уже есть'}</td></tr>{/each}
        </tbody></table></div>
      {/if}
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" onclick={() => (imp = null)}>Отмена</button>
        {#if !imp.res}<button class="btn grad" disabled={!imp.file || imp.busy} onclick={() => runImport(false)}>Проверить</button>
        {:else}<button class="btn grad" disabled={imp.busy || !imp.res.rows.some((r) => r.status === 'new')} onclick={() => runImport(true)}>Создать {imp.res.rows.filter((r) => r.status === 'new').length}</button>{/if}</div>
    {:else}
      <div class="alert ok" style="margin-bottom:12px">Создано: {imp.res.rows.filter((r) => r.status === 'new').length}. Пароли показаны один раз — сохраните список и передайте сотрудникам.</div>
      <div class="scroll-x" style="max-height:340px;overflow:auto"><table class="table"><thead><tr><th>ФИО</th><th>Логин</th><th>Пароль</th></tr></thead><tbody>
        {#each imp.res.rows.filter((r) => r.status === 'new') as r}<tr><td>{r.name}</td><td><b style="user-select:all">{r.login}</b></td><td><b style="user-select:all">{r.password}</b></td></tr>{/each}
      </tbody></table></div>
      <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn grad" onclick={downloadCreds}>Скачать список (CSV для Excel)</button><button class="btn" onclick={() => (imp = null)}>Закрыть</button></div>
    {/if}
  </Modal>
{/if}
