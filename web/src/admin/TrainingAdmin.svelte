<script lang="ts">
  import { confirmBox } from '../lib/dialog.svelte';
  // Админка обучения: курсы и уроки по дням, редактор тестов, сценарии тренажёра, запись сотрудников и наставники.
  import { api, ApiError } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { fmtDate } from '../lib/format';
  import { wt } from '../lib/w18n';
  import Segmented from '../components/Segmented.svelte';
  import '../training/training.css';

  const KINDS: [string, string][] = [['read', 'Материал'], ['video', 'Видео'], ['task', 'Задание'], ['quiz', 'Тест'], ['scenario', 'Тренажёр'], ['practice', 'Практика'], ['exam', 'Экзамен']];
  const AREAS: [string, string][] = [['', '— без области —'], ['product', 'Продукт и гарантия'], ['crm', 'CRM'], ['safety', 'Безопасность'], ['situation', 'Ситуации'], ['uz', 'Узбекские фразы']];
  const kindName = (k: string) => KINDS.find((x) => x[0] === k)?.[1] ?? k;

  let tab: 'plan' | 'scen' | 'enr' = $state('plan');
  let ov: any = $state(null), msg = $state(''), err = $state(''), busy = $state(false);
  let courseId: number | null = $state(null);
  let lessons: any[] = $state([]), scenarios: any[] = $state([]), enr: any[] = $state([]), people: any[] = $state([]);

  const flash = (m: string) => { msg = m; err = ''; setTimeout(() => { if (msg === m) msg = ''; }, 4000); };
  const fail = (e: unknown) => { err = e instanceof ApiError ? `Ошибка: ${e.code}` : 'Не удалось выполнить'; msg = ''; };

  async function loadOv() {
    try {
      ov = await api.get('/api/admin/training');
      if (!courseId || !ov.courses.some((c: any) => c.id === courseId)) courseId = (ov.courses.find((c: any) => c.is_default) ?? ov.courses[0])?.id ?? null;
      if (courseId) await loadLessons();
    } catch (e) { fail(e); }
  }
  async function loadLessons() { if (courseId) lessons = (await api.get(`/api/admin/training/courses/${courseId}/lessons`)).lessons; }
  async function loadScen() { scenarios = (await api.get('/api/admin/training/scenarios')).scenarios; }
  async function loadEnr() {
    enr = (await api.get('/api/admin/training/enrollments')).rows;
    if (!people.length) people = (await api.get('/api/admin/training/people')).people;
  }
  loadOv();
  $effect(() => { if (tab === 'scen' && !scenarios.length) loadScen().catch(fail); if (tab === 'enr') loadEnr().catch(fail); });

  const course = $derived(ov?.courses.find((c: any) => c.id === courseId) ?? null);
  const days = $derived([...new Set(lessons.map((l) => l.day))].sort((a: number, b: number) => a - b));

  /* ---------- курсы ---------- */
  let cEdit: any = $state(null);
  async function saveCourse() {
    busy = true;
    try {
      if (cEdit.id) await api.patch(`/api/admin/training/courses/${cEdit.id}`, cEdit);
      else { const r = await api.post('/api/admin/training/courses', cEdit); courseId = r.course.id; }
      cEdit = null; await loadOv(); flash('Сохранено');
    } catch (e) { fail(e); } finally { busy = false; }
  }
  async function setDefault() { try { await api.patch(`/api/admin/training/courses/${courseId}`, { is_default: true }); await loadOv(); flash('Курс стал основным: на него записываются новички'); } catch (e) { fail(e); } }
  async function toggleCourse() { try { await api.patch(`/api/admin/training/courses/${courseId}`, { active: !course.active }); await loadOv(); } catch (e) { fail(e); } }
  async function delCourse() {
    if (!await confirmBox(`Удалить курс «${course.title_ru}» вместе с уроками и записями сотрудников?`)) return;
    try { await api.del(`/api/admin/training/courses/${courseId}`); courseId = null; await loadOv(); flash('Курс удалён'); }
    catch (e) { err = e instanceof ApiError && e.code === 'default' ? 'Основной курс удалить нельзя: сначала назначьте основным другой.' : 'Не удалось удалить'; }
  }
  async function restore() {
    if (!await confirmBox('Добавить недостающие стандартные уроки и сценарии? Ваши уроки и правки не удаляются и не меняются.')) return;
    busy = true;
    try { const r = await api.post(`/api/admin/training/courses/${courseId}/restore-defaults`); await loadOv(); scenarios = []; flash(`Добавлено уроков: ${r.lessons}, сценариев: ${r.scenarios}`); }
    catch (e) { err = e instanceof ApiError && e.code === 'not_default' ? 'Возврат плана доступен только для основного курса.' : 'Не удалось выполнить'; } finally { busy = false; }
  }

  /* ---------- уроки ---------- */
  const critToText = (c: any[]) => (c ?? []).map((x) => `${x.ru} | ${x.uz ?? ''} | ${(x.kw ?? []).join(', ')}`).join('\n');
  const textToCrit = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = l.split('|').map((s) => s.trim());
    const [ru, uz, kw] = p.length === 2 ? [p[0], '', p[1]] : [p[0], p[1] ?? '', p[2] ?? ''];
    return { ru, uz, kw: kw.split(',').map((s) => s.trim()).filter(Boolean) };
  });
  const lines = (t: string) => t.split('\n').map((s) => s.trim()).filter(Boolean);

  let ed: any = $state(null);
  function editLesson(l: any | null, day = 1) {
    err = '';
    ed = l ? {
      id: l.id, day: l.day, kind: l.kind, area: l.area ?? '', title_ru: l.title_ru, title_uz: l.title_uz, body_ru: l.body_ru, body_uz: l.body_uz, video_url: l.video_url, link: l.link, pass_score: l.pass_score, active: l.active,
      quiz: (l.quiz ?? []).map((q: any) => ({ q_ru: q.q_ru, q_uz: q.q_uz ?? '', o_ru: (q.o_ru ?? []).join('\n'), o_uz: (q.o_uz ?? []).join('\n'), a: q.a, e_ru: q.e_ru ?? '', e_uz: q.e_uz ?? '' })),
      open_q: (l.open_q ?? []).map((o: any) => ({ q_ru: o.q_ru, q_uz: o.q_uz ?? '', crit: critToText(o.crit), model_ru: o.model_ru ?? '', model_uz: o.model_uz ?? '' })),
    } : { id: 0, day, kind: 'read', area: '', title_ru: '', title_uz: '', body_ru: '', body_uz: '', video_url: '', link: '', pass_score: 70, active: true, quiz: [], open_q: [] };
  }
  async function saveLesson() {
    if (!ed.title_ru.trim()) { err = 'Укажите название (RU)'; return; }
    for (const q of ed.quiz) if (lines(q.o_ru).length < 2) { err = 'В каждом вопросе нужно минимум 2 варианта (по одному в строке)'; return; }
    busy = true; err = '';
    const body = {
      day: Number(ed.day), kind: ed.kind, area: ed.area, title_ru: ed.title_ru, title_uz: ed.title_uz, body_ru: ed.body_ru, body_uz: ed.body_uz, video_url: ed.video_url.trim(), link: ed.link.trim(), pass_score: Number(ed.pass_score), active: ed.active,
      quiz: ed.quiz.map((q: any) => ({ q_ru: q.q_ru, q_uz: q.q_uz, o_ru: lines(q.o_ru), o_uz: lines(q.o_uz), a: Number(q.a), e_ru: q.e_ru, e_uz: q.e_uz })),
      open_q: ed.open_q.map((o: any) => ({ q_ru: o.q_ru, q_uz: o.q_uz, crit: textToCrit(o.crit), model_ru: o.model_ru, model_uz: o.model_uz })),
    };
    try {
      if (ed.id) await api.patch(`/api/admin/training/lessons/${ed.id}`, body); else await api.post(`/api/admin/training/courses/${courseId}/lessons`, body);
      ed = null; await loadOv(); flash('Урок сохранён');
    } catch (e) {
      const c = e instanceof ApiError ? e.code : '';
      err = c === 'link' ? 'Ссылка должна начинаться с #/ (раздел портала) или http(s)://' : c === 'video' ? 'Ссылка на видео должна начинаться с http(s)://' : c === 'day' ? 'День — число от 1 до 60' : 'Не удалось сохранить';
    } finally { busy = false; }
  }
  async function delLesson(l: any) {
    if (!await confirmBox(`Удалить урок «${l.title_ru}»? Прогресс сотрудников по нему тоже удалится.`)) return;
    try { await api.del(`/api/admin/training/lessons/${l.id}`); await loadOv(); } catch (e) { fail(e); }
  }
  async function move(l: any, dir: 'up' | 'down') { try { await api.post(`/api/admin/training/lessons/${l.id}/move`, { dir }); await loadLessons(); } catch (e) { fail(e); } }
  async function toggleLesson(l: any) { try { await api.patch(`/api/admin/training/lessons/${l.id}`, { active: !l.active }); await loadLessons(); } catch (e) { fail(e); } }
  const addQ = () => ed.quiz.push({ q_ru: '', q_uz: '', o_ru: '', o_uz: '', a: 0, e_ru: '', e_uz: '' });
  const addOpen = () => ed.open_q.push({ q_ru: '', q_uz: '', crit: '', model_ru: '', model_uz: '' });
  const dayLessons = (d: number) => lessons.filter((l) => l.day === d);

  /* ---------- сценарии ---------- */
  let sed: any = $state(null);
  function editScenario(s: any | null) {
    err = '';
    sed = s ? { ...s, options: s.options.map((o: any) => ({ ...o })), criteria: critToText(s.criteria), forbid: critToText(s.forbid) } : {
      id: 0, title_ru: '', title_uz: '', area: 'situation', client_lang: 'ru', client_ru: '', client_uz: '', context_ru: '', context_uz: '', active: true, sort: 0,
      options: [{ rating: 'best', t_ru: '', t_uz: '', why_ru: '', why_uz: '' }, { rating: 'ok', t_ru: '', t_uz: '', why_ru: '', why_uz: '' }, { rating: 'bad', t_ru: '', t_uz: '', why_ru: '', why_uz: '' }],
      criteria: '', forbid: '', model_ru: '', model_uz: '', why_ru: '', why_uz: '' };
  }
  async function saveScenario() {
    busy = true; err = '';
    const body = { ...sed, criteria: textToCrit(sed.criteria), forbid: textToCrit(sed.forbid), sort: Number(sed.sort) || 0 };
    try {
      if (sed.id) await api.patch(`/api/admin/training/scenarios/${sed.id}`, body); else await api.post('/api/admin/training/scenarios', body);
      sed = null; await loadScen(); flash('Сценарий сохранён');
    } catch { err = 'Проверьте: название, реплика клиента, минимум 2 варианта (один «лучший»), образцовый ответ и обоснование.'; } finally { busy = false; }
  }
  async function delScenario(s: any) {
    if (!await confirmBox(`Удалить сценарий «${s.title_ru}»?`)) return;
    try { await api.del(`/api/admin/training/scenarios/${s.id}`); await loadScen(); } catch (e) { fail(e); }
  }
  async function toggleScenario(s: any) { try { await api.patch(`/api/admin/training/scenarios/${s.id}`, { active: !s.active }); await loadScen(); } catch (e) { fail(e); } }

  /* ---------- запись и наставники ---------- */
  let nu: { user_id: string; course_id: string; mentor_id: string } = $state({ user_id: '', course_id: '', mentor_id: '' });
  $effect(() => { if (!nu.course_id && courseId) nu.course_id = String(courseId); });
  async function enroll() {
    if (!nu.user_id || !nu.course_id) return;
    try { await api.post('/api/admin/training/enrollments', { user_id: Number(nu.user_id), course_id: Number(nu.course_id), mentor_id: nu.mentor_id ? Number(nu.mentor_id) : null }); nu.user_id = ''; await loadEnr(); flash('Сотрудник записан'); }
    catch (e) { fail(e); }
  }
  async function setMentor(e: any, v: string) { try { await api.patch(`/api/admin/training/enrollments/${e.id}`, { mentor_id: v ? Number(v) : null }); await loadEnr(); flash('Наставник назначен'); } catch (x) { fail(x); } }
  async function unenroll(e: any) {
    if (!await confirmBox(`Отписать ${e.name} от курса? Прогресс по курсу будет потерян.`)) return;
    try { await api.del(`/api/admin/training/enrollments/${e.id}`); await loadEnr(); } catch (x) { fail(x); }
  }
  const courseName = (id: number) => ov?.courses.find((c: any) => c.id === id)?.title_ru ?? id;
</script>

<div class="tr">
  {#if ov}
    {#if !ov.ai}
      <div class="alert info u-87c136d"><b>ИИ выключен.</b> Не задан OPENROUTER_API_KEY — тренажёр, проверка уроков и интервью работают во встроенном режиме
        (готовые вопросы и сверка по ключевым словам). Сотрудники видят пометку «ИИ не подключён». Чтобы включить ИИ, добавьте ключ в переменные сервиса; модель — TRAIN_MODEL, лимит — {ov.ai_limit} запросов в сутки на человека.</div>
    {:else}
      <div class="alert ok u-87c136d">ИИ подключён (модель {ov.model}, лимит {ov.ai_limit} запросов в сутки на человека). ИИ опирается только на текст урока или сценария.</div>
    {/if}
  {/if}
  {#if msg}<div class="alert ok u-da12f28">{msg}</div>{/if}
  {#if err && !ed && !sed}<div class="alert u-da12f28">{err}</div>{/if}

  <!-- виды одной страницы «Курсы и уроки» — переключатель, а не вкладки раздела: вкладки группы «Курсы и тесты» рисует HubTabs -->
  <div class="mb-4"><Segmented label={wt('ai_a_training')} value={tab} options={[{ id: 'plan', label: 'Курсы и уроки' }, { id: 'scen', label: 'Сценарии тренажёра' }, { id: 'enr', label: 'Запись и наставники' }]} onchange={(id) => (tab = id as typeof tab)} /></div>

  {#if !ov}<span class="spin"></span>
  {:else if tab === 'plan'}
    <div class="tra-grid">
      <aside>
        {#each ov.courses as c}
          <button class="tra-course" class:on={c.id === courseId} onclick={() => { courseId = c.id; loadLessons(); }}>
            <b>{c.title_ru}</b>
            <div class="muted xs">{c.lessons} ур. · записано {c.enrolled}{#if c.is_default} · основной{/if}{#if !c.active} · выключен{/if}</div>
          </button>
        {/each}
        <button class="btn sm" onclick={() => (cEdit = { title_ru: '', title_uz: '', descr_ru: '', descr_uz: '' })}>+ Новый курс</button>
      </aside>

      {#if course}
        <section class="card">
          <div class="card-head u-e3db048">
            <div><h3 class="u-79ef5bb">{course.title_ru}</h3><div class="muted small">{course.descr_ru}</div></div>
            <div class="tra-btns">
              <button class="btn sm" onclick={() => (cEdit = { ...course })}>Править</button>
              {#if !course.is_default}<button class="btn sm" onclick={setDefault}>Сделать основным</button>{/if}
              <button class="btn sm" onclick={toggleCourse}>{course.active ? 'Выключить' : 'Включить'}</button>
              {#if !course.is_default}<button class="btn sm danger" onclick={delCourse}>Удалить</button>{/if}
            </div>
          </div>
          <div class="row wrap u-eed49c3">
            <button class="btn grad sm" onclick={() => editLesson(null, days[days.length - 1] ?? 1)}>+ Урок</button>
            {#if course.is_default}<button class="btn sm" disabled={busy} onclick={restore}>Вернуть план по умолчанию</button>{/if}
          </div>
          {#if course.is_default}<p class="muted xs">«Вернуть план по умолчанию» добавляет недостающие стандартные уроки и сценарии, ничего не удаляя и не меняя.</p>{/if}

          {#each days as d}
            <div class="tra-day">
              <header><b>День {d}</b><button class="btn sm" onclick={() => editLesson(null, d)}>+ в день {d}</button></header>
              {#each dayLessons(d) as l, i}
                <div class="tra-les" class:off={!l.active}>
                  <div class="t"><b>{l.title_ru}</b>
                    <div class="muted xs">{kindName(l.kind)}{#if l.quiz.length} · вопросов: {l.quiz.length} · проходной {l.pass_score}%{/if}{#if l.video_url} · ▶ видео{/if}{#if l.link} · {l.link}{/if}{#if !l.active} · скрыт{/if}</div></div>
                  <div class="tra-btns">
                    <button class="tra-icon" title="Выше" disabled={i === 0} onclick={() => move(l, 'up')}>↑</button>
                    <button class="tra-icon" title="Ниже" disabled={i === dayLessons(d).length - 1} onclick={() => move(l, 'down')}>↓</button>
                    <button class="tra-icon" title={l.active ? 'Скрыть' : 'Показать'} onclick={() => toggleLesson(l)}>{l.active ? '◉' : '○'}</button>
                    <button class="btn sm" onclick={() => editLesson(l)}>Править</button>
                    <button class="tra-icon" title="Удалить" onclick={() => delLesson(l)}>✕</button>
                  </div>
                </div>
              {/each}
            </div>
          {:else}<p class="muted">В курсе пока нет уроков.</p>{/each}
        </section>
      {/if}
    </div>

  {:else if tab === 'scen'}
    <div class="row wrap u-2b583d7"><button class="btn grad sm" onclick={() => editScenario(null)}>+ Сценарий</button>
      <span class="muted small">Сценарии видят все сотрудники в разделе «Тренажёр».</span></div>
    <div class="card">
      {#each scenarios as s}
        <div class="tra-les" class:off={!s.active}>
          <div class="t"><b>{s.title_ru}</b><div class="muted xs">{s.client_lang === 'uz' ? 'клиент по-узбекски' : 'клиент по-русски'} · вариантов {s.options.length} · критериев {s.criteria.length}{#if !s.active} · скрыт{/if}</div>
            <div class="muted small">«{s.client_ru}»</div></div>
          <div class="tra-btns">
            <button class="tra-icon" title={s.active ? 'Скрыть' : 'Показать'} onclick={() => toggleScenario(s)}>{s.active ? '◉' : '○'}</button>
            <button class="btn sm" onclick={() => editScenario(s)}>Править</button>
            <button class="tra-icon" title="Удалить" onclick={() => delScenario(s)}>✕</button>
          </div>
        </div>
      {:else}<p class="muted">Сценариев нет. «Вернуть план по умолчанию» на вкладке «Курсы и уроки» добавит стандартные.</p>{/each}
    </div>

  {:else}
    <section class="card u-49f14f8">
      <h3 class="u-da12f28">Записать сотрудника на курс</h3>
      <div class="tra-form">
        <label class="f">Сотрудник
          <select bind:value={nu.user_id}><option value="">—</option>{#each people as p}<option value={String(p.id)}>{p.name}{p.position ? ` · ${p.position}` : ''}{p.roles.includes('newbie') ? ' (новичок)' : ''}</option>{/each}</select></label>
        <label class="f">Курс
          <select bind:value={nu.course_id}>{#each ov.courses as c}<option value={String(c.id)}>{c.title_ru}</option>{/each}</select></label>
        <label class="f">Наставник
          <select bind:value={nu.mentor_id}><option value="">— не назначен —</option>{#each people as p}<option value={String(p.id)}>{p.name}</option>{/each}</select></label>
      </div>
      <button class="btn grad" disabled={!nu.user_id} onclick={enroll}>Записать</button>
      <p class="muted xs u-8a77e5a">Новички с ролью «newbie» записываются на основной курс сами при первом заходе в раздел.</p>
    </section>
    <section class="card">
      <div class="scroll-x">
        <table class="table">
          <thead><tr><th>Сотрудник</th><th>Курс</th><th>Прогресс</th><th>Наставник</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            {#each enr as e}
              <tr>
                <td><b>{e.name}</b><div class="muted xs">{e.position}</div></td>
                <td>{courseName(e.course_id)}<div class="muted xs">с {fmtDate(e.started_at)}</div></td>
                <td>{e.done}/{e.total}</td>
                <td><select class="g-sel" value={e.mentor_id ? String(e.mentor_id) : ''} onchange={(ev) => setMentor(e, (ev.currentTarget as HTMLSelectElement).value)}>
                  <option value="">—</option>{#each people as p}<option value={String(p.id)}>{p.name}</option>{/each}</select></td>
                <td class="small">{#if e.cleared_at}<span class="pill-ok">допущен</span>{:else if e.ready_at}<span class="pill-warn">готов, ждёт допуска</span>{:else}<span class="muted">учится</span>{/if}</td>
                <td><button class="tra-icon" title="Отписать" onclick={() => unenroll(e)}>✕</button></td>
              </tr>
            {:else}<tr><td colspan="6" class="muted">Пока никто не записан.</td></tr>{/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<!-- курс -->
{#if cEdit}
  <Modal onclose={() => (cEdit = null)}>
    <h2>{cEdit.id ? 'Курс' : 'Новый курс'}</h2>
    <label class="f">Название (RU)<input bind:value={cEdit.title_ru} /></label>
    <label class="f">Название (UZ)<input bind:value={cEdit.title_uz} /></label>
    <label class="f">Описание (RU)<textarea rows="2" bind:value={cEdit.descr_ru}></textarea></label>
    <label class="f">Описание (UZ)<textarea rows="2" bind:value={cEdit.descr_uz}></textarea></label>
    <div class="row u-65878ff"><button class="btn" onclick={() => (cEdit = null)}>Отмена</button><button class="btn grad" disabled={busy || !cEdit.title_ru.trim()} onclick={saveCourse}>Сохранить</button></div>
  </Modal>
{/if}

<!-- урок -->
{#if ed}
  <Modal wide onclose={() => (ed = null)}>
    <h2>{ed.id ? 'Урок' : 'Новый урок'}</h2>
    <div class="tra-form">
      <label class="f">День<input type="number" min="1" max="60" bind:value={ed.day} /></label>
      <label class="f">Тип<select bind:value={ed.kind}>{#each KINDS as k}<option value={k[0]}>{k[1]}</option>{/each}</select></label>
      <label class="f">Область (для рекомендаций после интервью)<select bind:value={ed.area}>{#each AREAS as a}<option value={a[0]}>{a[1]}</option>{/each}</select></label>
      <label class="chk f u-53cf909"><input type="checkbox" bind:checked={ed.active} /> Показывать сотрудникам</label>
      <label class="f">Название (RU)<input bind:value={ed.title_ru} /></label>
      <label class="f">Название (UZ)<input bind:value={ed.title_uz} /></label>
      <label class="f wide">Текст урока (RU) — простой markdown: ## заголовок, - список, **жирный**, &gt; цитата<textarea rows="9" bind:value={ed.body_ru}></textarea></label>
      <label class="f wide">Текст урока (UZ, латиница)<textarea rows="9" bind:value={ed.body_uz}></textarea></label>
      <label class="f">Видео (YouTube, Vimeo или прямая ссылка mp4/webm)<input bind:value={ed.video_url} placeholder="https://youtu.be/…" /></label>
      <label class="f">Ссылка на материал (#/assist/p/crm или https://…)<input bind:value={ed.link} placeholder="#/assist/p/crm" /></label>
      {#if ed.kind === 'quiz' || ed.kind === 'exam'}<label class="f">Проходной балл, %<input type="number" min="1" max="100" bind:value={ed.pass_score} /></label>{/if}
    </div>

    <h3 class="u-f4e719a">Вопросы теста ({ed.quiz.length})</h3>
    <p class="muted xs">Варианты — по одному в строке; сотруднику они показываются в перемешанном порядке. Разбор виден сразу после ответа. Для kind «Тест» и «Экзамен» нужен минимум один вопрос.</p>
    {#each ed.quiz as q, i}
      <div class="tra-q">
        <div class="head"><b>Вопрос {i + 1}</b><button class="tra-icon" title="Удалить вопрос" onclick={() => ed.quiz.splice(i, 1)}>✕</button></div>
        <div class="tra-form">
          <label class="f">Вопрос (RU)<input bind:value={q.q_ru} /></label>
          <label class="f">Вопрос (UZ)<input bind:value={q.q_uz} /></label>
          <label class="f">Варианты (RU), по строке<textarea rows="4" bind:value={q.o_ru}></textarea></label>
          <label class="f">Варианты (UZ), столько же строк<textarea rows="4" bind:value={q.o_uz}></textarea></label>
          <label class="f">Верный вариант
            <select bind:value={q.a}>{#each lines(q.o_ru) as o, k}<option value={k}>{k + 1}. {o.slice(0, 60)}</option>{/each}</select></label>
          <span></span>
          <label class="f">Разбор (RU)<textarea rows="3" bind:value={q.e_ru}></textarea></label>
          <label class="f">Разбор (UZ)<textarea rows="3" bind:value={q.e_uz}></textarea></label>
        </div>
      </div>
    {/each}
    <button class="btn sm" onclick={addQ}>+ Вопрос</button>

    <h3 class="u-66be9e2">Вопросы «своими словами» (для ИИ-проверки и встроенной сверки)</h3>
    <p class="muted xs">Критерии — по строке: «что должно быть (RU) | то же (UZ) | ключевые слова через запятую». Критерий засчитан, если встретилось любое слово (пишите основы слов, регистр и «ё» не важны). Пройдено при ≥ 50% критериев. Без ключа ИИ используются именно эти вопросы.</p>
    {#each ed.open_q as o, i}
      <div class="tra-q">
        <div class="head"><b>Вопрос {i + 1}</b><button class="tra-icon" title="Удалить" onclick={() => ed.open_q.splice(i, 1)}>✕</button></div>
        <div class="tra-form">
          <label class="f">Вопрос (RU)<input bind:value={o.q_ru} /></label>
          <label class="f">Вопрос (UZ)<input bind:value={o.q_uz} /></label>
          <label class="f wide">Критерии<textarea rows="4" bind:value={o.crit} placeholder="закрыть кран | gaz kranini yopish | кран, kran"></textarea></label>
          <label class="f">Образцовый ответ (RU)<textarea rows="3" bind:value={o.model_ru}></textarea></label>
          <label class="f">Образцовый ответ (UZ)<textarea rows="3" bind:value={o.model_uz}></textarea></label>
        </div>
      </div>
    {/each}
    <button class="btn sm" onclick={addOpen}>+ Вопрос «своими словами»</button>

    {#if err}<div class="alert u-56f4356">{err}</div>{/if}
    <div class="tra-modal-foot"><button class="btn" onclick={() => (ed = null)}>Отмена</button><button class="btn grad" disabled={busy} onclick={saveLesson}>Сохранить урок</button></div>
  </Modal>
{/if}

<!-- сценарий -->
{#if sed}
  <Modal wide onclose={() => (sed = null)}>
    <h2>{sed.id ? 'Сценарий тренажёра' : 'Новый сценарий'}</h2>
    <div class="tra-form">
      <label class="f">Название (RU)<input bind:value={sed.title_ru} /></label>
      <label class="f">Название (UZ)<input bind:value={sed.title_uz} /></label>
      <label class="f">Область<select bind:value={sed.area}>{#each AREAS.slice(1) as a}<option value={a[0]}>{a[1]}</option>{/each}</select></label>
      <label class="f">Язык клиента<select bind:value={sed.client_lang}><option value="ru">русский</option><option value="uz">узбекский</option></select></label>
      <label class="f">Реплика клиента (RU / перевод)<textarea rows="2" bind:value={sed.client_ru}></textarea></label>
      <label class="f">Реплика клиента (UZ)<textarea rows="2" bind:value={sed.client_uz}></textarea></label>
      <label class="f">Что видно в CRM (RU), подсказка<input bind:value={sed.context_ru} /></label>
      <label class="f">Что видно в CRM (UZ)<input bind:value={sed.context_uz} /></label>
    </div>

    <h3 class="u-f4e719a">Варианты ответа ({sed.options.length})</h3>
    <p class="muted xs">Нужно минимум 2 варианта и хотя бы один «лучший». Сотруднику они показываются в перемешанном порядке. «Почему» — разбор варианта.</p>
    {#each sed.options as o, i}
      <div class="tra-q">
        <div class="head"><select class="u-30e741d" bind:value={o.rating}><option value="best">лучший</option><option value="ok">приемлемый</option><option value="bad">плохой</option></select>
          <button class="tra-icon" title="Удалить" onclick={() => sed.options.splice(i, 1)}>✕</button></div>
        <div class="tra-form">
          <label class="f">Ответ (RU)<textarea rows="2" bind:value={o.t_ru}></textarea></label>
          <label class="f">Ответ (UZ)<textarea rows="2" bind:value={o.t_uz}></textarea></label>
          <label class="f">Почему (RU)<textarea rows="2" bind:value={o.why_ru}></textarea></label>
          <label class="f">Почему (UZ)<textarea rows="2" bind:value={o.why_uz}></textarea></label>
        </div>
      </div>
    {/each}
    <button class="btn sm" onclick={() => sed.options.push({ rating: 'ok', t_ru: '', t_uz: '', why_ru: '', why_uz: '' })}>+ Вариант</button>

    <h3 class="u-66be9e2">Критерии свободного ответа</h3>
    <p class="muted xs">По строке: «что должно быть (RU) | то же (UZ) | ключевые слова через запятую (основы слов на ru и uz)». Оценка: ≥ 66% критериев — лучший, ≥ 34% — приемлемо; слова из «Чего быть не должно» понижают оценку. ИИ при наличии ключа оценивает по тем же критериям.</p>
    <div class="tra-form">
      <label class="f wide">Что должно быть<textarea rows="5" bind:value={sed.criteria} placeholder="извинение | uzr | извин, жаль, uzr, kechir"></textarea></label>
      <label class="f wide">Чего быть не должно<textarea rows="3" bind:value={sed.forbid} placeholder="обещание точного времени | aniq vaqtga va’da | обещаю, завтра в"></textarea></label>
      <label class="f">Образцовый ответ (RU)<textarea rows="4" bind:value={sed.model_ru}></textarea></label>
      <label class="f">Образцовый ответ (UZ)<textarea rows="4" bind:value={sed.model_uz}></textarea></label>
      <label class="f">Обоснование «Потому что…» (RU)<textarea rows="4" bind:value={sed.why_ru}></textarea></label>
      <label class="f">Обоснование (UZ)<textarea rows="4" bind:value={sed.why_uz}></textarea></label>
      <label class="f">Порядок в списке<input type="number" bind:value={sed.sort} /></label>
      <label class="chk f u-53cf909"><input type="checkbox" bind:checked={sed.active} /> Показывать сотрудникам</label>
    </div>
    {#if err}<div class="alert u-56f4356">{err}</div>{/if}
    <div class="tra-modal-foot"><button class="btn" onclick={() => (sed = null)}>Отмена</button><button class="btn grad" disabled={busy} onclick={saveScenario}>Сохранить сценарий</button></div>
  </Modal>
{/if}
