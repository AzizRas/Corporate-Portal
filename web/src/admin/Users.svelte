<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import Modal from '../components/Modal.svelte';

  const ROLES = [['employee', 'Сотрудник'], ['newbie', 'Новичок'], ['mentor', 'Наставник'], ['manager', 'Руководитель'], ['hr', 'HR'], ['accountant', 'Бухгалтерия'], ['editor', 'Редактор базы'], ['admin', 'Админ']];
  let users: any[] = $state([]), depts: any[] = $state([]), edit: any = $state(null), isNew = $state(false), msg = $state(''), tempPw = $state(''), q = $state('');
  const load = () => api.get('/api/admin/users').then((r) => (users = r.users));
  load(); api.get('/api/departments').then((r) => (depts = r.departments));
  const shown = $derived(users.filter((u) => !q || (u.name + u.login + (u.tab_number ?? '')).toLowerCase().includes(q.toLowerCase())));
  const deptName = (id: number) => depts.find((d) => d.id === id)?.name_ru ?? '';

  const blank = () => ({ name: '', login: '', tab_number: '', position: '', position_code: 'op', dept_id: '', manager_id: '', lang: 'ru', roles: ['employee'], active: true, shift_start: '09:00', shift_end: '18:00' });
  function open(u: any | null) { isNew = !u; edit = u ? { ...u, roles: [...u.roles], shift_start: u.shift_start?.slice(0, 5), shift_end: u.shift_end?.slice(0, 5) } : blank(); msg = ''; tempPw = ''; }
  const toggleRole = (r: string) => (edit.roles = edit.roles.includes(r) ? edit.roles.filter((x: string) => x !== r) : [...edit.roles, r]);

  async function save() {
    msg = '';
    try {
      const body = { ...edit, dept_id: edit.dept_id || null, manager_id: edit.manager_id || null };
      if (isNew) { const r = await api.post('/api/admin/users', body); tempPw = r.password; isNew = false; edit.id = r.id; }
      else { await api.patch(`/api/admin/users/${edit.id}`, body); edit = null; }
      await load();
    } catch (e) { msg = e instanceof ApiError ? ({ exists: 'Такой логин или табельный уже есть', invalid: 'Заполните имя и логин (латиница)', self_lock: 'Нельзя заблокировать себя' } as any)[e.code] ?? e.code : 'Ошибка'; }
  }
  async function reset() { tempPw = (await api.post(`/api/admin/users/${edit.id}/reset-password`)).password; }
</script>

<div class="row" style="margin-bottom:16px"><input type="search" placeholder="Поиск" bind:value={q} style="max-width:320px" /><span class="sp"></span><button class="btn grad" onclick={() => open(null)}>+ Сотрудник</button></div>
<div class="card scroll-x" style="padding:12px 16px">
  <table class="table">
    <thead><tr><th>Таб.</th><th>ФИО</th><th>Должность</th><th>Отдел</th><th>Роли</th><th></th></tr></thead>
    <tbody>
      {#each shown as u}
        <tr style:opacity={u.active ? 1 : .5}><td>{u.tab_number ?? ''}</td><td><b>{u.name}</b><div class="muted xs">{u.login}</div></td><td>{u.position}</td><td>{deptName(u.dept_id)}</td>
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
      <label class="f">Отдел<select bind:value={edit.dept_id}><option value="">—</option>{#each depts as d}<option value={d.id}>{d.name_ru}</option>{/each}</select></label>
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
