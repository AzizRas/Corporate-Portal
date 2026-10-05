<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { pick, monthLong, nowMonth } from '../lib/format';
  import Ring from '../components/Ring.svelte';
  import { gt } from '../growth/g18n';
  import '../growth/growth.css';

  let d: any = $state(null);
  let newStrength = $state(''), newGrowth = $state('');

  const load = () => api.get('/api/path/me').then((r) => (d = r));
  load();

  const name = (o: any, k = 'name') => pick(o, k);
  const pos = (o: any) => (app.lang === 'uz' ? o.uz : o.ru);
  const posShort = (o: any) => (app.lang === 'uz' ? o.short_uz : o.short_ru);

  async function changeTarget(e: Event) { await api.put('/api/growth/target', { position_code: (e.currentTarget as HTMLSelectElement).value }); await load(); }
  async function addTrait(kind: 'strength' | 'growth') {
    const text = (kind === 'strength' ? newStrength : newGrowth).trim();
    if (!text) return;
    await api.post(`/api/growth/traits/${app.user!.id}`, { kind, text });
    if (kind === 'strength') newStrength = ''; else newGrowth = '';
    await load();
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
      <select class="g-sel" value={d.target_code ?? d.target.code} onchange={changeTarget} aria-label={gt('p_target')}>
        {#each d.positions as p}<option value={p.code}>{gt('p_target')}: {app.lang === 'uz' ? p.uz : p.ru}</option>{/each}
      </select>
      <a class="btn primary" href="#/growth/survey">{t('take_survey')}</a>
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
      {#if d.rec?.ai}<span class="muted small">{t('path_draft_ai')}</span>{/if}
      <div class="row wrap" style="margin-top:14px"><a class="btn sm" href="#/growth/person/{app.user?.id}">{gt('p_360')}</a><a class="btn sm" href="#/growth/talk">{gt('tab_talk')}</a><a class="btn sm" href="#/growth/mentor">{gt('tab_mentor')}</a></div>
    </section>

    <section class="card a-strengths">
      <div class="card-head"><h3>{t('path_strengths')}</h3><span class="aside">{t('public')}</span></div>
      <div class="list">
        {#each d.strengths as s}
          <div><span style="font-weight:600">{s.text}</span>
            <button class="heart" style="background:none;border:0;cursor:pointer;opacity:{s.voted ? 1 : .75}" onclick={() => vote(s.id)}>♥ {s.votes}</button></div>
        {/each}
      </div>
      <form class="row" style="margin-top:14px" onsubmit={(e) => { e.preventDefault(); addTrait('strength'); }}>
        <input placeholder={gt('p_trait_ph')} maxlength="140" bind:value={newStrength} /><button class="btn sm grad" disabled={!newStrength.trim()}>{gt('add')}</button></form>
    </section>

    <section class="card a-growth">
      <div class="card-head"><h3>{t('path_growth')}</h3><span class="aside">{t('only_you')}</span></div>
      <div class="list">
        {#each d.growth as g}
          <div><span style="font-weight:600">{g.text}</span><span class="amber">{g.votes} {t('confirmed')}</span></div>
        {/each}
      </div>
      <form class="row" style="margin-top:14px" onsubmit={(e) => { e.preventDefault(); addTrait('growth'); }}>
        <input placeholder={gt('p_trait_ph')} maxlength="140" bind:value={newGrowth} /><button class="btn sm grad" disabled={!newGrowth.trim()}>{gt('add')}</button></form>
    </section>

    <section class="card a-badges">
      <div class="row wrap" style="gap:28px;align-items:flex-start">
        <div><h3 class="card-title">{t('badges')}</h3><div class="big-num" style="margin-top:16px">{d.badges.filter((b: any) => b.have).length}/{d.badges.length}</div></div>
        <div class="badges">
          {#each d.badges as b}
            <div class="badge" class:off={!b.have} title={pick(b, 'descr')}><div class="ic">{b.icon}</div>{name(b)}{#if !b.have && b.auto}<div class="g-badge-prog"><i style="width:{(b.cur / b.goal) * 100}%"></i></div>{/if}</div>
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

{/if}
