<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { t, type Key } from '../lib/i18n';
  import { pick, monthLong, nowMonth } from '../lib/format';
  import Ring from '../components/Ring.svelte';
  import Modal from '../components/Modal.svelte';

  let d: any = $state(null);
  let survey = $state(false), levels: Record<string, number> = $state({}), saving = $state(false);

  const load = () => api.get('/api/path/me').then((r) => (d = r));
  load();

  const name = (o: any, k = 'name') => pick(o, k);
  const pos = (o: any) => (app.lang === 'uz' ? o.uz : o.ru);
  const posShort = (o: any) => (app.lang === 'uz' ? o.short_uz : o.short_ru);
  const lvlKeys: Key[] = ['lvl1', 'lvl2', 'lvl3', 'lvl4'];

  function openSurvey() {
    levels = Object.fromEntries(d.competencies.map((c: any) => [c.id, Math.max(1, Math.round(c.cur) || 2)]));
    survey = true;
  }
  async function submitSurvey() {
    saving = true;
    try { await api.post('/api/path/rate', { ratings: levels }); survey = false; await load(); } finally { saving = false; }
  }
  async function vote(id: number) { await api.post(`/api/path/traits/${id}/vote`); await load(); }
  const pct4 = (v: number) => `${Math.min(v / 4, 1) * 100}%`;
</script>

{#if !d}
  <span class="spin"></span>
{:else}
  <header class="page-head">
    <div>
      <h1>{t('path_title')} <span class="grad-text">{app.lang === 'uz' ? d.target.dat_uz : d.target.dat_ru}</span></h1>
      <p class="sub">{app.user?.position ? '' : ''}{pick({ name_ru: 'Колл-центр', name_uz: 'Call-markaz' }, 'name')} · {t('path_sub')}</p>
    </div>
    <div class="head-actions">
      <span class="chip">{monthLong(nowMonth())}</span>
      <button class="btn primary" onclick={openSurvey}>{t('take_survey')}</button>
    </div>
  </header>

  <div class="path-grid">
    <section class="card hl a-ready ready">
      <div class="card-head" style="width:100%"><h3>{t('path_ready')}</h3>
        {#if d.delta_month != null}<span class="pill-ok small" style="font-weight:600">{d.delta_month >= 0 ? '+' : ''}{d.delta_month}% {t('path_month')}</span>{/if}
      </div>
      <Ring pct={d.readiness} label={`${t('path_threshold')} ${d.threshold}%`} />
      <div class="chips">
        {#each d.ladder as p}
          <span class="chip" class:on={p.code === d.current.code} class:grad={p.code === d.target.code}>{posShort(p)}</span>
        {/each}
      </div>
      <div class="stats3">
        <div><b>{d.eta_months == null ? '—' : d.eta_months === 0 ? '✓' : `≈${d.eta_months} ${t('month_unit')}`}</b><span>{t('path_eta')}</span></div>
        <div><b>{d.comps_at_level[0]} / {d.comps_at_level[1]}</b><span>{t('path_comps_level')}</span></div>
        <div><b>{t('soft')} {d.weights.soft} · {t('hard')} {d.weights.hard}</b><span>{t('path_weights')}</span></div>
      </div>
    </section>

    <section class="card a-comps">
      <div class="card-head"><h3>{t('path_comps')}</h3><span class="aside">{t('path_levels')}</span></div>
      {#each d.competencies as c}
        <div class="comp">
          <div class="top"><span style="font-weight:700">{name(c)}</span><span>{Math.round(c.cur)} / {c.req}</span></div>
          <div class="bar"><i style="width:{pct4(c.cur)}"></i><b style="left:{pct4(c.req)}"></b></div>
        </div>
      {/each}
      <div class="legend"><i></i>{t('path_req_legend')}</div>
      {#if d.goal}
        <div class="goal">
          <div class="row"><span class="muted small">{t('path_goal')} · SMART</span><span class="sp"></span><span class="muted small">{d.goal.progress}%</span></div>
          <div class="t">{d.goal.title}</div>
          <div class="bar good"><i style="width:{d.goal.progress}%"></i></div>
        </div>
      {/if}
    </section>

    <section class="card a-mentor" style="background:linear-gradient(160deg, color-mix(in srgb, var(--accent) 16%, var(--card)), var(--card) 60%)">
      <span class="tag">{t('path_mentor')}</span>
      <p class="mentor-text">{d.rec ? d.rec.text : t('no_rec')}</p>
      {#if d.rec?.ai}<a href="#/path" style="font-weight:700;font-size:14px">{t('path_draft_ai')}</a>{/if}
    </section>

    <section class="card a-strengths">
      <div class="card-head"><h3>{t('path_strengths')}</h3><span class="aside">{t('public')}</span></div>
      <div class="list">
        {#each d.strengths as s}
          <div><span style="font-weight:600">{s.text}</span>
            <button class="heart" style="background:none;border:0;cursor:pointer;opacity:{s.voted ? 1 : .75}" onclick={() => vote(s.id)}>♥ {s.votes}</button></div>
        {/each}
      </div>
    </section>

    <section class="card a-growth">
      <div class="card-head"><h3>{t('path_growth')}</h3><span class="aside">{t('only_you')}</span></div>
      <div class="list">
        {#each d.growth as g}
          <div><span style="font-weight:600">{g.text}</span><span class="amber">{g.votes} {t('confirmed')}</span></div>
        {/each}
      </div>
    </section>

    <section class="card a-badges">
      <div class="row wrap" style="gap:28px;align-items:flex-start">
        <div><h3 class="card-title">{t('badges')}</h3><div class="big-num" style="margin-top:16px">{d.badges.filter((b: any) => b.have).length}/{d.badges.length}</div></div>
        <div class="badges">
          {#each d.badges.slice(0, 6) as b}
            <div class="badge" class:off={!b.have}><div class="ic">{b.icon}</div>{name(b)}</div>
          {/each}
        </div>
      </div>
    </section>

    <section class="card a-soon">
      <div class="card-head"><h3>{t('soon')}</h3></div>
      <div class="list">
        {#each d.events as e}
          <div><span style="font-weight:600">{pick(e, 'title')}</span><span class="small" style="color:var(--accent-ink);font-weight:600">{e.at_text}</span></div>
        {/each}
      </div>
    </section>
  </div>

  {#if survey}
    <Modal onclose={() => (survey = false)}>
      <h2>{t('survey_title')}</h2>
      <p class="muted small" style="margin-bottom:16px">{t('survey_hint')}</p>
      {#each d.competencies as c}
        <label class="f">{name(c)} — <b style="color:var(--text)">{levels[c.id]}</b> · {t(lvlKeys[levels[c.id] - 1])}
          <input type="range" min="1" max="4" step="1" bind:value={levels[c.id]} style="padding:0;accent-color:var(--accent)" /></label>
      {/each}
      <div class="row" style="justify-content:flex-end;margin-top:8px">
        <button class="btn" onclick={() => (survey = false)}>{t('cancel')}</button>
        <button class="btn grad" onclick={submitSurvey} disabled={saving}>{t('send')}</button>
      </div>
    </Modal>
  {/if}
{/if}
