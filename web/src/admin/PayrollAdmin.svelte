<script lang="ts">
  import { confirmBox } from '../lib/dialog.svelte';
  import { api, ApiError, download } from '../lib/api';
  import { fmtMoney, monthLong, nowMonth } from '../lib/format';
  import Modal from '../components/Modal.svelte';

  let periods: any[] = $state([]), month = $state(nowMonth()), file: File | null = $state(null), result: any = $state(null), msg = $state(''), busy = $state(false);
  let rows: any[] | null = $state(null), formula: any = $state(null), fmsg = $state('');
  const load = () => api.get('/api/admin/payroll').then((r) => (periods = r.periods));
  load(); api.get('/api/settings/payroll_formula').then((r) => (formula = r.value));

  async function upload(e: Event) {
    e.preventDefault(); if (!file) return; busy = true; msg = ''; result = null;
    const fd = new FormData(); fd.append('month', month); fd.append('file', file);
    try { result = await api.upload('/api/admin/payroll/upload', fd); await load(); }
    catch (x) { msg = x instanceof ApiError && x.code === 'published' ? 'Этот месяц уже опубликован — сначала снимите публикацию' : 'Не удалось загрузить файл'; }
    finally { busy = false; }
  }
  async function publish(p: any, force = false) {
    try { await api.post(`/api/admin/payroll/${p.id}/publish`, { force }); await load(); result = null; }
    catch (x) {
      if (x instanceof ApiError && x.code === 'has_errors' && await confirmBox(`В файле ${x.body.errors.length} ошибок — эти строки не попадут к сотрудникам. Опубликовать остальное?`)) await publish(p, true);
    }
  }
  const unpublish = async (p: any) => { if (await confirmBox('Скрыть месяц от сотрудников?')) { await api.post(`/api/admin/payroll/${p.id}/unpublish`); await load(); } };
  const remove = async (p: any) => { if (await confirmBox('Удалить черновик?')) { await api.del(`/api/admin/payroll/${p.id}`); await load(); } };
  const preview = async (p: any) => (rows = (await api.get(`/api/admin/payroll/${p.id}/rows`)).rows);
  async function saveFormula() { await api.put('/api/admin/settings/payroll_formula', { value: formula }); fmsg = 'Сохранено'; }
</script>

<div class="grid u-e3865e7">
  <form class="card stack" onsubmit={upload}>
    <h3 class="card-title">Загрузить ведомость (.xlsx)</h3>
    <p class="muted small">Таблица с колонками ФИО, Фикс, Сумма, Бонус, Итого ЗП (Штраф и Удержания — по желанию). Строка заголовков может быть не первой. Сотрудники ищутся по ФИО (регистр и лишние пробелы не важны). Перед публикацией есть предпросмотр.</p>
    <label class="f u-1169661">Месяц<input type="month" bind:value={month} required /></label>
    <input type="file" accept=".xlsx" onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} required />
    <div class="row"><button class="btn grad" disabled={busy}>Загрузить</button><button type="button" class="btn" onclick={() => download('/api/payroll/template')}>Скачать шаблон</button></div>
    {#if msg}<div class="alert">{msg}</div>{/if}
    {#if result}
      {@const hard = result.errors.filter((e) => e.level !== 'warn')}
      <div class="alert" class:ok={!hard.length}>Принято строк: <b>{result.rows}</b>, ошибок: <b>{hard.length}</b>, предупреждений: <b>{result.errors.length - hard.length}</b></div>
      {#if result.errors.length}<div class="small u-05665e9">{#each result.errors as er}<div class={er.level === 'warn' ? 'pill-warn' : 'pill-bad'}>{er.level === 'warn' ? '⚠' : '✕'} строка {er.row}: {er.msg}</div>{/each}</div>{/if}
    {/if}
  </form>

  {#if formula}
    <section class="card stack">
      <h3 class="card-title">Формула расчёта (показывается сотруднику)</h3>
      <label class="f u-1169661">Текст, RU<textarea bind:value={formula.text_ru}></textarea></label>
      <label class="f u-1169661">Текст, UZ<textarea bind:value={formula.text_uz}></textarea></label>
      <label class="chk"><input type="checkbox" bind:checked={formula.calc.enabled} /> Калькулятор «что если»</label>
      {#if formula.calc.enabled}
        <div class="row"><label class="f u-0935c1f">Макс. бонус<input type="number" bind:value={formula.calc.bonus_max} /></label>
          <label class="f u-0935c1f">Порог KPI, %<input type="number" bind:value={formula.calc.min_pct} /></label></div>
      {/if}
      <button class="btn grad" onclick={saveFormula}>Сохранить</button>{#if fmsg}<div class="alert ok">{fmsg}</div>{/if}
    </section>
  {/if}
</div>

<div class="card scroll-x u-4bfc9e6">
  <table class="table"><thead><tr><th>Месяц</th><th>Файл</th><th>Строк</th><th>Ошибок</th><th>Статус</th><th></th></tr></thead>
    <tbody>
      {#each periods as p}
        <tr><td><b>{monthLong(p.month)}</b></td><td>{p.file_name}</td><td>{p.rows}</td><td class:pill-bad={p.errors.some((e) => e.level !== 'warn')}>{p.errors.filter((e) => e.level !== 'warn').length}{#if p.errors.some((e) => e.level === 'warn')} <span class="pill-warn">(+{p.errors.filter((e) => e.level === 'warn').length} ⚠)</span>{/if}</td>
          <td>{p.status === 'published' ? '✓ опубликован' : 'черновик'}</td>
          <td class="row wrap"><button class="btn sm" onclick={() => preview(p)}>Предпросмотр</button>
            {#if p.status === 'draft'}<button class="btn sm grad" onclick={() => publish(p)}>Опубликовать</button><button class="btn sm danger" onclick={() => remove(p)}>Удалить</button>
            {:else}<button class="btn sm" onclick={() => unpublish(p)}>Снять с публикации</button>{/if}</td></tr>
      {/each}
    </tbody></table>
</div>

{#if rows}
  <Modal onclose={() => (rows = null)} wide>
    <h2>Предпросмотр <span class="muted small">(суммы в сумах)</span></h2>
    <div class="scroll-x"><table class="table"><thead><tr><th>ФИО</th><th>Фикс</th><th>Сумма</th><th>Бонус</th><th>Штраф</th><th>Удерж.</th><th>Итого</th></tr></thead><tbody>
      {#each rows as r}<tr><td>{r.name}</td><td>{fmtMoney(r.data.fixed)}</td><td>{fmtMoney(r.data.earned)}</td><td>{fmtMoney(r.data.bonus)}</td><td>{fmtMoney(r.data.penalty)}</td><td>{fmtMoney(r.data.deductions)}</td><td><b>{fmtMoney(r.data.total)}</b></td></tr>{/each}
    </tbody></table></div>
  </Modal>
{/if}
