<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import Modal from '../components/Modal.svelte';

  // Конструктор тестов: свой тест-профиль (шкалы и утверждения) или тест знаний (вопросы с одним верным ответом).
  type L2 = { ru: string; uz: string };
  const T = (ru = '', uz = ''): L2 => ({ ru, uz });
  const AGREE: L2[] = [T('Совсем не согласен(на)', 'Umuman qo‘shilmayman'), T('Скорее не согласен(на)', 'Ko‘proq qo‘shilmayman'), T('Отчасти', 'Qisman'), T('Скорее согласен(на)', 'Ko‘proq qo‘shilaman'), T('Полностью согласен(на)', 'To‘liq qo‘shilaman')];
  let tests: any[] = $state([]), edit: any = $state(null), msg = $state(''), rel: Record<string, any> = $state({});
  const load = () => api.get('/api/admin/tests').then((r) => (tests = r.tests));
  load();
  function blank(scoring: 'profile' | 'quiz') {
    edit = { id: null, kind: scoring === 'quiz' ? 'prof' : 'psych', scoring, title_ru: '', title_uz: '', descr_ru: '', descr_uz: '', minutes: 5,
      config: scoring === 'profile'
        ? { intro: T(), scale: { min: 1, max: 5, labels: AGREE.map((x) => ({ ...x })) }, scales: [{ id: 'A', name: T(), low: T(), high: T() }], questions: [{ q: T(), s: 'A', rev: false }, { q: T(), s: 'A', rev: false }] }
        : { intro: T(), questions: [{ q: T(), opts: [{ t: T() }, { t: T() }], correct: 0, why: T() }, { q: T(), opts: [{ t: T() }, { t: T() }], correct: 0, why: T() }] } };
    msg = '';
  }
  const open = (t: any) => { edit = JSON.parse(JSON.stringify(t)); msg = ''; };
  async function save() {
    msg = '';
    try {
      if (edit.id) await api.patch(`/api/admin/tests/${edit.id}`, edit);
      else await api.post('/api/admin/tests', edit);
      edit = null; await load();
    } catch (e) { msg = e instanceof ApiError ? `Проверьте поля: ${e.body?.detail ?? e.code}` : 'Ошибка'; }
  }
  async function toggle(t: any) { await api.patch(`/api/admin/tests/${t.id}`, { active: !t.active }); await load(); }
  async function reliability(t: any) { rel[t.slug] = await api.get(`/api/tests/${t.slug}/reliability`).catch(() => ({ n: 0, scales: {} })); }
  const nextId = () => String.fromCharCode(65 + (edit.config.scales?.length ?? 0));
</script>

<div class="row wrap u-87c136d"><span class="sp"></span><button class="btn" onclick={() => blank('quiz')}>+ Тест знаний</button><button class="btn grad" onclick={() => blank('profile')}>+ Тест-профиль (шкалы)</button></div>
<div class="card scroll-x">
  <table class="table">
    <thead><tr><th>Тест</th><th>Тип</th><th>Прохождений</th><th></th></tr></thead>
    <tbody>
      {#each tests as t (t.id)}
        <tr class:muted={!t.active}><td><b>{t.title_ru}</b><div class="muted xs">{t.slug}{t.custom ? ' · свой' : ' · встроенный'}</div>
          {#if rel[t.slug]}<div class="xs">n={rel[t.slug].n}: {Object.entries(rel[t.slug].scales).map(([k, v]) => `${k} α=${v ?? '—'}`).join(', ') || 'нужно ≥ 30 ответов'}</div>{/if}</td>
          <td>{t.kind === 'psych' ? 'психологический' : 'профессиональный'} · {t.scoring}</td><td>{t.results}</td>
          <td class="row wrap">{#if t.custom}<button class="btn sm" onclick={() => open(t)}>Править</button>{/if}
            {#if t.scoring === 'profile'}<button class="btn sm" onclick={() => reliability(t)}>Надёжность</button>{/if}
            <button class="btn sm" onclick={() => toggle(t)}>{t.active ? 'Выключить' : 'Включить'}</button></td></tr>
      {/each}
    </tbody>
  </table>
</div>

{#if edit}
  <Modal onclose={() => (edit = null)} wide>
    <div class="stack">
      <h2>{edit.id ? 'Правка теста' : edit.scoring === 'profile' ? 'Новый тест-профиль' : 'Новый тест знаний'}</h2>
      <div class="grid ta-grid">
        <label class="f">Название (рус)<input bind:value={edit.title_ru} /></label>
        <label class="f">Название (узб)<input bind:value={edit.title_uz} /></label>
        <label class="f">Описание (рус)<textarea bind:value={edit.descr_ru}></textarea></label>
        <label class="f">Описание (узб)<textarea bind:value={edit.descr_uz}></textarea></label>
        <label class="f">Вид<select bind:value={edit.kind}><option value="psych">психологический</option><option value="prof">профессиональный</option></select></label>
        <label class="f">Минут<input type="number" min="1" max="60" bind:value={edit.minutes} /></label>
      </div>
      {#if edit.scoring === 'profile'}
        <h3>Шкалы</h3>
        {#each edit.config.scales as sc, i}
          <div class="grid ta-grid ta-box">
            <label class="f">Код<input bind:value={sc.id} maxlength="12" /></label>
            <label class="f">Название (рус)<input bind:value={sc.name.ru} /></label>
            <label class="f">Название (узб)<input bind:value={sc.name.uz} /></label>
            <label class="f">Если низко (рус)<input bind:value={sc.low.ru} /></label>
            <label class="f">Если высоко (рус)<input bind:value={sc.high.ru} /></label>
            <button class="btn sm danger" disabled={edit.config.scales.length < 2} onclick={() => edit.config.scales.splice(i, 1)}>Удалить</button>
          </div>
        {/each}
        <button class="btn sm" onclick={() => edit.config.scales.push({ id: nextId(), name: T(), low: T(), high: T() })}>+ Шкала</button>
        <h3>Утверждения (шкала ответа 1–5: «совсем не согласен» … «полностью согласен»)</h3>
        {#each edit.config.questions as qq, i}
          <div class="grid ta-grid ta-box">
            <label class="f">Текст (рус)<input bind:value={qq.q.ru} /></label>
            <label class="f">Текст (узб)<input bind:value={qq.q.uz} /></label>
            <label class="f">Шкала<select bind:value={qq.s}>{#each edit.config.scales as sc}<option value={sc.id}>{sc.id} — {sc.name.ru}</option>{/each}</select></label>
            <label class="chk"><input type="checkbox" bind:checked={qq.rev} /> обратный</label>
            <button class="btn sm danger" disabled={edit.config.questions.length < 3} onclick={() => edit.config.questions.splice(i, 1)}>Удалить</button>
          </div>
        {/each}
        <button class="btn sm" onclick={() => edit.config.questions.push({ q: T(), s: edit.config.scales[0].id, rev: false })}>+ Утверждение</button>
      {:else}
        <h3>Вопросы</h3>
        {#each edit.config.questions as qq, i}
          <div class="ta-box stack">
            <div class="grid ta-grid"><label class="f">Вопрос (рус)<input bind:value={qq.q.ru} /></label><label class="f">Вопрос (узб)<input bind:value={qq.q.uz} /></label></div>
            {#each qq.opts as op, k}
              <div class="row"><input type="radio" name="c{i}" checked={qq.correct === k} onchange={() => (qq.correct = k)} title="Верный" /><input bind:value={op.t.ru} placeholder="Вариант (рус)" /><input bind:value={op.t.uz} placeholder="Variant (o‘zb)" />
                <button class="btn sm" disabled={qq.opts.length < 3} onclick={() => { qq.opts.splice(k, 1); if (qq.correct >= qq.opts.length) qq.correct = 0; }}>✕</button></div>
            {/each}
            <div class="row"><button class="btn sm" disabled={qq.opts.length >= 8} onclick={() => qq.opts.push({ t: T() })}>+ Вариант</button><input bind:value={qq.why.ru} placeholder="Пояснение к ответу (рус)" /><span class="sp"></span><button class="btn sm danger" disabled={edit.config.questions.length < 3} onclick={() => edit.config.questions.splice(i, 1)}>Удалить вопрос</button></div>
          </div>
        {/each}
        <button class="btn sm" onclick={() => edit.config.questions.push({ q: T(), opts: [{ t: T() }, { t: T() }], correct: 0, why: T() })}>+ Вопрос</button>
      {/if}
      {#if msg}<div class="alert">{msg}</div>{/if}
      <div class="row"><span class="sp"></span><button class="btn" onclick={() => (edit = null)}>Отмена</button><button class="btn grad" onclick={save}>Сохранить</button></div>
    </div>
  </Modal>
{/if}

<style>
  .ta-grid { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); align-items: end; }
  .ta-box { border: 1px solid var(--border); border-radius: 12px; padding: 10px; }
</style>
