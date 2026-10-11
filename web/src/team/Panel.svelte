<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { pt } from './p18n';
  import { fmtDate } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import Modal from '../components/Modal.svelte';
  import AiFeedback from '../components/AiFeedback.svelte';

  type Item = any;
  let data: any = $state(null), failed = $state(false), loading = $state(true);
  let hints: Record<number, { hint: string; talk?: string }> = $state({});
  let aiErr = $state(false), aiDetail = $state('');
  let dismissed: Record<number, boolean> = $state({});
  let toast = $state('');

  const items = $derived<Item[]>(shown);
  const sum = $derived(data?.summary);
  const aiOn = $derived(data?.ai?.available === true);
  const isAdminNote = $derived(!!data?.ai && data.ai.available === false && !!data.ai.reason);
  const today = new Date().toISOString().slice(0, 10);
  const flash = (m: string) => { toast = m; setTimeout(() => (toast = ''), 3500); };

  // Зона может быть в сотни людей: сервер отдаёт страницами по PAGE человек (сначала те, у кого сигнал или признаки), есть поиск по имени.
  const PAGE = 40;
  let shown: Item[] = $state([]), total = $state(0), needle = $state(''), more = $state(false);
  let tm: ReturnType<typeof setTimeout>;
  async function load(append = false) {
    try {
      const offset = append ? shown.length : 0;
      const r = await api.get(`/api/panel?limit=${PAGE}&offset=${offset}${needle.trim() ? `&q=${encodeURIComponent(needle.trim())}` : ''}`);
      data = r; total = r.total; shown = append ? [...shown, ...r.items] : r.items;
      if (r.ai?.available) loadHints(r.items);
    } catch { failed = true; } finally { loading = false; more = false; }
  }
  const onSearch = () => { clearTimeout(tm); tm = setTimeout(() => load(), 300); };
  const loadMore = () => { more = true; load(true); };
  // подсказки ИИ — по запросу и только тем, кому они нужны (есть признаки или сигнал), не больше 12 за раз
  async function loadHints(list: Item[]) {
    const ids = list.filter((p) => p.flags.length || p.signal).slice(0, 12).map((p) => p.id);
    if (!ids.length) return;
    try {
      const r = await api.post('/api/panel/hints', { ids });
      hints = { ...hints, ...(r.hints ?? {}) };
      if (r.ai?.error) { aiErr = true; aiDetail = r.ai.detail ?? ''; }
    } catch { /* подсказок просто нет */ }
  }
  load();
  // сводка по подразделениям: только HR и администратор
  let units: any[] = $state([]), sigs: any = $state(null);
  if (app.user?.roles.some((r) => r === 'hr' || r === 'admin')) api.get('/api/panel/units').then((r) => { units = r.units ?? []; sigs = r.signals ?? null; }).catch(() => {});

  async function talked(p: Item) {
    try { await api.post(`/api/panel/signal/${p.id}/dismiss`, { talked: true }); dismissed[p.id] = true; flash(pt('p_talked_ok')); }
    catch (e) { flash(e instanceof ApiError && e.status === 403 ? pt('p_forbidden') : pt('q_err')); }
  }
  async function dismiss(p: Item) {
    try { await api.post(`/api/panel/signal/${p.id}/dismiss`, { days: 14 }); dismissed[p.id] = true; }
    catch (e) { flash(e instanceof ApiError && e.status === 403 ? pt('p_forbidden') : pt('q_err')); }
  }

  const trendL = (a: number, b: number) => (b < 3 && a < 3 ? '' : a >= b * 1.3 + 1 ? 'up' : a <= b * 0.7 - 1 ? 'down' : 'flat');
  const pctCls = (n: number | null) => (n == null ? '' : n >= 80 ? 'pill-ok' : n >= 60 ? '' : 'pill-warn');

  /* ----- задача ----- */
  let tk: Item | null = $state(null), tf = $state({ title: '', note: '', due: '' }), tErr = $state(''), tBusy = $state(false);
  function openTask(p: Item) { tk = p; tf = { title: '', note: '', due: '' }; tErr = ''; tBusy = false; }
  async function sendTask() {
    if (!tk || !tf.title.trim()) { tErr = pt('p_task_name'); return; }
    tBusy = true; tErr = '';
    try {
      await api.post('/api/tasks', { user_ids: [tk.id], title: tf.title.trim(), note: tf.note.trim(), due: tf.due || null });
      const id = tk.id; tk = null; flash(pt('p_task_ok'));
      const r = items.find((i) => i.id === id); if (r) r.stats.tasks.open++;
    } catch (e) { tErr = e instanceof ApiError && e.status === 403 ? pt('p_forbidden') : pt('p_task_err'); } finally { tBusy = false; }
  }

  /* ----- подробности ----- */
  let det: { p: Item; d: any | null; err: string } | null = $state(null);
  async function openDetails(p: Item) {
    det = { p, d: null, err: '' };
    try { const d = await api.get(`/api/panel/person/${p.id}`); if (det && det.p.id === p.id) det.d = d; }
    catch (e) { if (det) det.err = e instanceof ApiError && (e.status === 403 || e.status === 404) ? pt('p_forbidden') : pt('p_load_err'); }
  }
  const lvCls = (l: string | null, inv = false) => (l == null ? '' : (inv ? { low: 'bad', mid: 'mid', high: 'ok' } : { low: 'ok', mid: 'mid', high: 'bad' })[l as 'low']);
  const FLAGS = ['inactive', 'overdue', 'test_waiting', 'late', 'quality_drop', 'activity_drop'];
</script>

<section class="panel">
  <header class="ph"><h2>{pt('p_title')}</h2><p class="muted small">{pt('p_sub')}</p></header>

  {#if loading}<p class="muted"><span class="spin"></span></p>
  {:else if failed}<p class="alert">{pt('p_load_err')}</p>
  {:else if data}
    <div class="sum">
      <div class="card tile"><b>{sum.people}</b><span>{pt('p_people')}</span></div>
      <div class="card tile" class:warn={sum.inactive > 0}><b>{sum.inactive}</b><span>{pt('p_inactive')}</span></div>
      <div class="card tile" class:warn={sum.overdue > 0}><b>{sum.overdue}</b><span>{pt('p_overdue')}</span></div>
      <div class="card tile"><b>{sum.on_leave}</b><span>{pt('p_leave')}</span></div>
      {#if sum.high_load > 0}<div class="card tile warn"><b>{sum.high_load}</b><span>{pt('p_high_load')}</span></div>{/if}
      {#if sum.open_questions != null}
        <a class="card tile link" href="#/queue"><b>{sum.open_questions}</b><span>{pt('p_questions')} →</span></a>
      {/if}
    </div>
    {#if isAdminNote}<p class="muted xs" style="margin:-6px 0 14px">{pt('p_ai_off')}: {data.ai.reason}</p>{/if}
    {#if aiErr && aiDetail}<p class="muted xs" style="margin:-6px 0 14px">{pt('p_ai_err')}. {pt('p_ai_detail')}: {aiDetail}</p>{/if}

    {#if units.length}
      <section class="card units">
        <h3 class="card-title">{pt('u_title')}</h3><p class="muted xs">{pt('u_sub')}</p>
        {#if sigs && (sigs.open || sigs.closed.talked.n || sigs.closed.gone.n || sigs.closed.dismissed.n)}<p class="xs muted">{pt('sg_line', { open: sigs.open, om: sigs.open_median_days ?? '—', tn: sigs.closed.talked.n, tm: sigs.closed.talked.median_days ?? '—', gn: sigs.closed.gone.n, gm: sigs.closed.gone.median_days ?? '—', dn: sigs.closed.dismissed.n, d: sigs.days })}</p>{/if}
        <table><thead><tr><th>{pt('u_unit')}</th><th>{pt('u_people')}</th><th>{pt('u_high')}</th><th>{pt('u_loweng')}</th></tr></thead>
          <tbody>{#each units as r}<tr><td>{r.unit}</td><td>{r.people}</td><td><b class={r.high_load_pct >= 25 ? 'pill-warn' : ''}>{r.high_load_pct}%</b> <span class="muted xs">({pt('u_prev')}: {r.prev_pct}%)</span></td><td>{r.low_engagement_pct}%</td></tr>{/each}</tbody></table>
      </section>
    {/if}
    {#if sum.people > PAGE || needle}<input type="search" class="psearch" placeholder={pt('p_search')} aria-label={pt('p_search')} bind:value={needle} oninput={onSearch} />{/if}
    {#if !items.length}<p class="muted">{needle ? pt('p_nomatch') : pt('p_empty')}</p>{/if}
    <div class="cards">
      {#each items as p (p.id)}
        {@const s = p.stats}
        {@const tr = trendL(s.activity.now14, s.activity.prev14)}
        {@const h = hints[p.id]}
        <article class="card pc">
          <div class="who">
            <Avatar u={{ id: p.id, name: p.name, avatar_v: p.avatar_v }} size={48} />
            <div class="nm">
              <b>{p.name}</b>
              <span class="muted xs">{p.position || ''}</span>
              {#if p.node_path}<span class="muted xs path">{p.node_path}</span>{/if}
            </div>
            <span class="chip st">{p.employment === 'intern' ? pt('p_intern') : pt('p_staff')}</span>
          </div>

          {#if s.leave.now}<p class="small pill-warn">🌴 {pt('p_on_leave')}</p>{/if}

          <dl class="kv">
            <div><dt>{pt('p_learning')}</dt><dd>{s.training.enrolled ? pt('p_lessons', { a: s.training.lessons_done, b: s.training.lessons_total }) : pt('p_no_course')}</dd></div>
            <div><dt>{pt('p_tests')}</dt><dd>{pt('p_tests_n', { n: s.tests.taken })}{#if s.tests.last?.pct != null} · <span class={pctCls(s.tests.last.pct)}>{pt('p_last', { n: Math.round(s.tests.last.pct) })}</span>{/if}</dd></div>
            <div><dt>{pt('p_trainer')}</dt><dd>{s.trainer.avg_now != null ? pt('p_avg', { n: s.trainer.avg_now }) : s.trainer.attempts ? pt('p_none') : pt('p_no_att')}</dd></div>
            <div><dt>{pt('p_activity')}</dt><dd>{s.activity.now14}
              {#if tr}<span class={tr === 'up' ? 'pill-ok' : tr === 'down' ? 'pill-warn' : 'muted'}> {tr === 'up' ? '↗' : tr === 'down' ? '↘' : '→'} {pt(`p_${tr}`)}</span>{/if}
              <span class="muted xs"> ({pt('p_prev', { n: s.activity.prev14 })})</span></dd></div>
            <div><dt>{pt('p_late')}</dt><dd class:pill-warn={s.late14 >= 3}>{s.late14}</dd></div>
            <div><dt>{pt('p_tasks')}</dt><dd>{pt('p_tasks_v', { a: s.tasks.open, b: s.tasks.overdue })}</dd></div>
          </dl>

          {#if p.flags.length}
            <div class="flags">{#each FLAGS.filter((f) => p.flags.includes(f)) as f}<span class="flag">{pt(`f_${f}`)}</span>{/each}</div>
          {/if}

          {#if p.indices && !p.indices.skipped}
            {@const ix = p.indices}
            <div class="idx">
              <div class="ix"><span class="xs muted">{pt('i_load')}</span><div class="bar"><i class={lvCls(ix.load.level)} style:width={`${ix.load.score}%`}></i></div><b class={lvCls(ix.load.level)}>{ix.load.score}</b></div>
              <div class="ix"><span class="xs muted">{pt('i_eng')}</span><div class="bar"><i class={lvCls(ix.engagement.level, true)} style:width={`${ix.engagement.score ?? 0}%`}></i></div><b class={lvCls(ix.engagement.level, true)}>{ix.engagement.score ?? '—'}</b></div>
              {#if ix.engagement.falling}<p class="xs pill-warn">↘ {pt('i_eng')}: {pt('i_falling')}</p>{/if}
              {#if ix.load.reasons.length}<ul class="xs muted rs">{#each ix.load.reasons as r}<li>{pt(`lr_${r.code}`, { n: r.n, m: r.extra ?? 0 })}</li>{/each}</ul>{/if}
            </div>
          {/if}

          {#if p.signal && !dismissed[p.id]}
            <div class="talk">
              <b>💬 {pt('p_talk')}</b>
              <p class="xs muted">{pt('p_talk_sub')}</p>
              <ul>{#each p.signal.reasons as r}<li>{pt(`r_${r}`)}</li>{/each}</ul>
              {#if h?.talk}<p class="small ai-t">{h.talk}</p>{/if}
              <div class="row wrap gap-2"><button class="btn sm grad" onclick={() => talked(p)}>{pt('p_talked')}</button><button class="btn sm" onclick={() => dismiss(p)}>{pt('p_dismiss')}</button></div>
            </div>
          {:else if dismissed[p.id]}<p class="xs muted">{pt('p_dismissed')}</p>{/if}

          {#if aiOn && h?.hint}
            <div class="hint"><span class="xs muted">{pt('p_hint')}</span><p class="small">{h.hint}</p>
              <AiFeedback role="analyst" refId={`panel:${p.id}:${today}`} /></div>
          {/if}

          <div class="acts">
            <button class="btn sm grad" onclick={() => openTask(p)}>{pt('p_assign')}</button>
            <button class="btn sm" onclick={() => openDetails(p)}>{pt('p_open')}</button>
            <a class="btn sm" href="#/growth/talk/{p.id}">{pt('p_one')}</a>
          </div>
        </article>
      {/each}
    </div>
    {#if items.length < total}<div class="row" style="justify-content:center;margin-top:18px;gap:12px"><button class="btn" disabled={more} onclick={loadMore}>{pt('p_more', { n: total - items.length })}</button><span class="muted xs">{pt('p_shown', { a: items.length, b: total })}</span></div>{/if}
  {/if}
  {#if toast}<div class="alert ok toast-p">{toast}</div>{/if}
</section>

{#if tk}
  <Modal onclose={() => (tk = null)}>
    <h2>{pt('p_task_title')}</h2>
    <p class="muted small" style="margin-bottom:12px">{pt('p_task_for')}: <b>{tk.name}</b></p>
    <label class="f">{pt('p_task_name')}<input type="text" maxlength="200" bind:value={tf.title} /></label>
    <label class="f">{pt('p_task_note')}<textarea maxlength="1000" bind:value={tf.note}></textarea></label>
    <label class="f">{pt('p_task_due')}<input type="date" min={today} bind:value={tf.due} /></label>
    {#if tErr}<p class="alert" style="margin-bottom:12px">{tErr}</p>{/if}
    <div class="row wrap"><button class="btn grad" disabled={tBusy} onclick={sendTask}>{pt('p_task_send')}</button><button class="btn" onclick={() => (tk = null)}>{pt('p_cancel')}</button></div>
  </Modal>
{/if}

{#if det}
  <Modal onclose={() => (det = null)}>
    <div class="who" style="margin-bottom:14px"><Avatar u={{ id: det.p.id, name: det.p.name, avatar_v: det.p.avatar_v }} size={44} /><div class="nm"><b>{det.p.name}</b><span class="muted xs">{det.p.position}</span></div></div>
    {#if det.err}<p class="alert">{det.err}</p>
    {:else if !det.d}<p class="muted"><span class="spin"></span></p>
    {:else}
      {#if det.d.indices?.weeks}
        <h3 class="card-title" style="margin-bottom:6px">{pt('i_trend')}</h3>
        <div class="trend" role="img" aria-label={pt('i_trend')}>
          {#each det.d.indices.weeks as w, i}
            <div class="wk"><div class="cols"><i class="cl {lvCls(w.load >= 50 ? 'high' : w.load >= 25 ? 'mid' : 'low')}" style:height={`${Math.max(4, w.load)}%`} title={`${pt('i_load')} ${w.load}`}></i><i class="ce {w.engagement == null ? 'na' : lvCls(w.engagement < 40 ? 'low' : w.engagement < 65 ? 'mid' : 'high', true)}" style:height={`${Math.max(4, w.engagement ?? 0)}%`} title={`${pt('i_eng')} ${w.engagement ?? '—'}`}></i></div><span class="xs muted">{i === det.d.indices.weeks.length - 1 ? pt('i_week_now') : `−${det.d.indices.weeks.length - 1 - i}`}</span></div>
          {/each}
        </div>
        <p class="xs muted"><span class="dot l"></span>{pt('i_load')} · <span class="dot e"></span>{pt('i_eng')}. {pt('i_note')}</p>
      {/if}
      <h3 class="card-title" style="margin:16px 0 6px">{pt('p_recent_tests')}</h3>
      <div class="list">
        {#each det.d.tests as t}<div><span>{t.title}<br /><span class="muted xs">{fmtDate(t.created_at)}</span></span><b>{t.pct != null ? Math.round(t.pct) + '%' : '—'}</b></div>
        {:else}<p class="muted small">{pt('p_no_tests')}</p>{/each}
      </div>
      <h3 class="card-title" style="margin:16px 0 6px">{pt('p_recent_tasks')}</h3>
      <div class="list">
        {#each det.d.tasks as t}
          <div><span>{t.title}{#if t.due}<br /><span class="muted xs">{t.due}</span>{/if}</span>
            <span class="small {t.done_at ? 'pill-ok' : t.due && t.due < today ? 'pill-bad' : 'muted'}">{t.done_at ? pt('p_done') : t.due && t.due < today ? pt('p_overdue_l') : pt('p_open_state')}</span></div>
        {:else}<p class="muted small">{pt('p_no_tasks')}</p>{/each}
      </div>
    {/if}
    <div class="row" style="margin-top:18px"><button class="btn" onclick={() => (det = null)}>{pt('p_close')}</button></div>
  </Modal>
{/if}

<style>
  .panel { margin-bottom: 36px; }
  .psearch { max-width: 360px; margin-bottom: 14px; }
  .units { padding: 18px 20px; margin-bottom: 18px; overflow-x: auto; } .units table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; } .units th { text-align: left; font-weight: 600; color: var(--muted); font-size: 12px; padding: 4px 10px 6px 0; } .units td { padding: 7px 10px 7px 0; border-top: 1px solid var(--border); }
  .idx { display: flex; flex-direction: column; gap: 6px; }
  .ix { display: grid; grid-template-columns: 96px 1fr 28px; gap: 8px; align-items: center; } .ix b { text-align: right; font-size: 13px; }
  .bar { height: 6px; border-radius: 99px; background: var(--track); overflow: hidden; } .bar i { display: block; height: 100%; border-radius: 99px; background: var(--muted); }
  .bar i.ok, .cl.ok, .ce.ok { background: var(--good); } .bar i.mid, .cl.mid, .ce.mid { background: var(--warn); } .bar i.bad, .cl.bad, .ce.bad { background: var(--bad); }
  b.ok { color: var(--good); } b.mid { color: var(--warn); } b.bad { color: var(--bad); }
  .rs { margin: 0; padding-left: 16px; display: flex; flex-direction: column; gap: 2px; }
  .trend { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; align-items: end; margin: 6px 0; } .wk { display: flex; flex-direction: column; align-items: center; gap: 4px; } .cols { height: 80px; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px; }
  .cols i { width: 38%; border-radius: 3px 3px 0 0; background: var(--muted); } .cols i.na { opacity: .25; } .cl { background: var(--warn); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; } .dot.l { background: var(--warn); } .dot.e { background: var(--accent); }
  .ph { margin-bottom: 16px; } .ph h2 { font-size: 24px; letter-spacing: -.01em; }
  .sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 18px; }
  .tile { padding: 16px 18px; border-radius: 22px; display: flex; flex-direction: column; gap: 2px; }
  .tile b { font-size: 30px; font-weight: 600; letter-spacing: -.02em; line-height: 1.1; }
  .tile span { color: var(--muted); font-size: 13px; }
  .tile.warn b { color: var(--warn); }
  .tile.link { color: inherit; text-decoration: none; }
  .tile.link:hover { border-color: var(--accent); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 18px; }
  .pc { padding: 20px; border-radius: 24px; display: flex; flex-direction: column; gap: 12px; }
  .who { display: flex; gap: 12px; align-items: center; }
  .nm { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .nm b { overflow-wrap: anywhere; }
  .path { overflow-wrap: anywhere; }
  .st { padding: 4px 10px; font-size: 12px; flex: none; align-self: flex-start; }
  .kv { margin: 0; display: grid; gap: 0; }
  .kv > div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-top: 1px solid var(--border); font-size: 13.5px; }
  .kv > div:first-child { border-top: 0; }
  dt { color: var(--muted); } dd { margin: 0; text-align: right; font-weight: 600; }
  .flags { display: flex; flex-wrap: wrap; gap: 6px; }
  .flag { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: color-mix(in srgb, var(--warn) 14%, transparent); color: var(--warn); }
  .talk { border-radius: 16px; padding: 12px 14px; background: color-mix(in srgb, var(--accent) 10%, transparent); display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .talk ul { margin: 0; padding-left: 18px; font-size: 13.5px; }
  .ai-t { font-style: italic; }
  .hint { border-radius: 14px; padding: 10px 12px; background: var(--card-2); display: flex; flex-direction: column; gap: 6px; }
  .acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: auto; padding-top: 4px; }
  .toast-p { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); z-index: 60; }
  @media (max-width: 880px) { .tile.link { grid-column: 1 / -1; } .cards { grid-template-columns: 1fr; } .sum { grid-template-columns: repeat(2, 1fr); } .pc { padding: 16px; } }
</style>
