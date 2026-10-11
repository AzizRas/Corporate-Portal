<script lang="ts">
  import { deferDelete } from '../lib/dialog.svelte';
  import { api } from '../lib/api';
  import { app, has, lead } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { gt } from './g18n';
  import Ring from '../components/Ring.svelte';
  import Radar from '../components/Radar.svelte';
  import PersonalGoals from '../components/PersonalGoals.svelte';
  import Avatar from '../components/Avatar.svelte';
  import { st } from '../lib/s18n';

  let { id }: { id: number } = $props();
  let p: any = $state(null), c360: any = $state(null), traits: any = $state(null), recs: any = $state(null), badges: any = $state(null), err = $state('');
  let newRec = $state(''), recComp = $state(''), editing: number | null = $state(null), editText = $state(''), newTrait = $state(''), traitKind = $state('strength');
  let aiBusy = $state(false), aiMsg = $state('');

  async function load() {
    try {
      const path = id === app.user!.id ? await api.get('/api/path/me') : await api.get(`/api/path/user/${id}`);
      [c360, traits, recs, badges] = await Promise.all([api.get(`/api/growth/360/${id}`), api.get(`/api/growth/traits/${id}`), api.get(`/api/growth/recs/${id}`), api.get(`/api/growth/badges/${id}`)]);
      p = path; err = '';
    } catch { err = gt('p_forbidden'); }
  }
  $effect(() => { id; load(); });

  const nm = (o: any, k = 'name') => (app.lang === 'uz' ? o[`${k}_uz`] || o[`${k}_ru`] : o[`${k}_ru`]);
  const compOf = (cid: string) => c360?.competencies.find((c: any) => c.id === cid);
  const fx = (v: number | null) => (v == null ? '—' : v.toFixed(1));
  const posName = (o: any) => (app.lang === 'uz' ? o.uz : o.ru);

  async function addRec() { if (!newRec.trim()) return; await api.post(`/api/growth/recs/${id}`, { text: newRec, comp: recComp || undefined }); newRec = ''; recs = await api.get(`/api/growth/recs/${id}`); }
  async function saveRec(r: any) { await api.patch(`/api/growth/recs/item/${r.id}`, { text: editText }); editing = null; recs = await api.get(`/api/growth/recs/${id}`); }
  function delRec(r: any) { const prev = recs; deferDelete(gt('rec_short'), { hide: () => (recs = recs.filter((x: any) => x.id !== r.id)), restore: () => (recs = prev), commit: async () => { await api.del(`/api/growth/recs/item/${r.id}`); recs = await api.get(`/api/growth/recs/${id}`); } }); }
  async function addTrait() { if (!newTrait.trim()) return; await api.post(`/api/growth/traits/${id}`, { text: newTrait, kind: traitKind }); newTrait = ''; traits = await api.get(`/api/growth/traits/${id}`); }
  async function vote(tr: any) { await api.post(`/api/path/traits/${tr.id}/vote`); traits = await api.get(`/api/growth/traits/${id}`); }
  async function delTrait(tr: any) { await api.del(`/api/growth/traits/item/${tr.id}`); traits = await api.get(`/api/growth/traits/${id}`); }
  async function award(b: any) { await api.post(`/api/growth/badges/${id}`, { badge: b.id }); badges = await api.get(`/api/growth/badges/${id}`); }
  async function analyse() {
    aiBusy = true; aiMsg = '';
    try { const r = await api.post(`/api/growth/analysis/${id}`); aiMsg = gt('p_ai_added', { n: r.added }); recs = await api.get(`/api/growth/recs/${id}`); }
    catch (e: any) { aiMsg = e?.code === 'ai_off' ? gt('ai_off_msg') : gt('ai_error_msg'); }
    finally { aiBusy = false; }
  }
</script>

<a href={(lead() || has('hr')) && id !== app.user!.id ? '#/growth/reserve' : '#/path'} class="small">← {t('back')}</a>
{#if err}<div class="card u-d6f2af6"><p>{err}</p></div>
{:else if !p || !c360}<div class="u-e60a353"><span class="spin"></span></div>
{:else}
  <header class="page-head u-d6f2af6">
    <div class="row u-f6ce4d1"><Avatar u={{ id: p.user.id, name: p.user.name, avatar_v: p.user.avatar_v }} size={64} /><div><h1 class="u-1d6d432">{p.user.name}</h1>
      <p class="sub">{posName(p.current)} → <span class="grad-text">{posName(p.target)}</span></p></div></div>
    <div class="head-actions">
      <a class="btn" href="#/growth/talk/{id}">{gt('tab_talk')}</a>
      {#if recs.can_edit}<button class="btn primary" onclick={analyse} disabled={aiBusy}>{aiBusy ? '…' : gt('p_ai')}</button>{/if}
    </div>
  </header>
  {#if aiMsg}<div class="alert info u-87c136d">{aiMsg}</div>{/if}

  <div class="g-grid">
    <section class="card hl ready u-85fe421">
      <div class="card-head u-0466783"><h3>{t('path_ready')}</h3>{#if p.delta_month != null}<span class="pill-ok small u-eed0f8f">{p.delta_month >= 0 ? '+' : ''}{p.delta_month}%</span>{/if}</div>
      <Ring pct={p.readiness} label={`${t('path_threshold')} ${p.threshold}%`} />
      <div class="stats3">
        <div><b>{p.eta_months == null ? '—' : p.eta_months === 0 ? '✓' : `≈${p.eta_months} ${t('month_unit')}`}</b><span>{t('path_eta')}</span></div>
        <div><b>{p.comps_at_level[0]} / {p.comps_at_level[1]}</b><span>{t('path_comps_level')}</span></div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>{gt('p_360')}</h3><span class="aside">{gt('p_raters', { n: c360.raters_this_month })}</span></div>
      <div class="g-cmp">
        <span class="h">{gt('p_comp')}</span><span class="h">{gt('p_self')}</span><span class="h">{gt('p_others')}</span><span class="h">{gt('p_need')}</span>
        {#each c360.comps as c}
          {@const comp = compOf(c.comp)}
          {@const req = p.competencies.find((x: any) => x.id === c.comp)?.req}
          <span class="u-eed0f8f">{nm(comp)}</span>
          <span class="num">{fx(c.self)}</span>
          <span class="num" title={c.n < 2 && c.others == null ? gt('p_hidden') : ''}>{c.others == null ? (c.n ? gt('p_hidden_short') : '—') : fx(c.others)}{#if c.manager != null}<span class="muted xs"> · {gt('p_mgr')} {fx(c.manager)}</span>{/if}</span>
          <span class="num" class:gap={req != null && (c.others ?? c.self ?? 0) < req}>{req ?? '—'}</span>
        {/each}
      </div>
      <p class="muted xs u-56f4356">{gt('p_anon')}</p>
    </section>

    <section class="card">
      <div class="card-head"><h3>{t('path_strengths')}</h3></div>
      <div class="list">
        {#each traits.strengths as s}<div><span class="u-eed0f8f">{s.text}</span><span class="row">
          <button class="heart btn-bare" style:opacity={s.voted ? 1 : .6} onclick={() => vote(s)}>♥ {s.votes}</button>
          {#if s.mine || recs.can_edit}<button class="g-act" aria-label={gt('delete')} onclick={() => delTrait(s)}>✕</button>{/if}</span></div>
        {:else}<p class="muted small">—</p>{/each}
      </div>
      {#if traits.growth_visible}
        <div class="card-head u-86de7ac"><h3>{st('gz_title')}</h3><span class="aside">{gt('p_growth_vis')}</span></div>
        <div class="list">
          {#each traits.growth as g}<div><span class="u-eed0f8f">{g.text}</span><span class="row">
            {#if g.votes != null}<button class="amber u-6ecdfc7" onclick={() => vote(g)}>{g.votes} {t('confirmed')}</button>
            {:else}<button class="g-act" onclick={() => vote(g)}>{g.voted ? '✓' : '+1'}</button>{/if}
            {#if g.mine || recs.can_edit}<button class="g-act" aria-label={gt('delete')} onclick={() => delTrait(g)}>✕</button>{/if}</span></div>
          {:else}<p class="muted small">—</p>{/each}
        </div>
      {:else}<p class="muted xs u-d6f2af6">{st('gz_hidden')}</p>{/if}
      <div class="row u-d6f2af6">
        <select class="g-sel" bind:value={traitKind}><option value="strength">{gt('p_strength')}</option><option value="growth">{gt('p_growth_zone')}</option></select>
        <input placeholder={gt('p_trait_ph')} maxlength="140" bind:value={newTrait} onkeydown={(e) => e.key === 'Enter' && addTrait()} />
        <button class="btn sm grad" onclick={addTrait} disabled={!newTrait.trim()}>{gt('add')}</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>{st('rd_title')}</h3></div>
      <Radar items={p.competencies} />
    </section>
    {#if id !== app.user!.id}<PersonalGoals userId={id} />{/if}

    <section class="card">
      <div class="card-head"><h3>{gt('p_recs')}</h3><span class="aside">{recs.can_edit ? gt('p_recs_mgr') : gt('p_recs_from')}</span></div>
      {#each recs.recs as r}
        <div class="u-9537e11">
          {#if editing === r.id}
            <textarea class="u-a6e1332" bind:value={editText} maxlength="800"></textarea>
            <div class="row u-8a77e5a"><button class="btn sm grad" onclick={() => saveRec(r)}>{gt('save')}</button><button class="btn sm" onclick={() => (editing = null)}>{t('cancel')}</button></div>
          {:else}
            <div>{r.text}</div>
            <div class="row u-fe7b497"><span class="muted xs">{r.author ?? ''}{r.comp && compOf(r.comp) ? ` · ${nm(compOf(r.comp))}` : ''}</span>
              {#if r.ai}<span class="tag u-c8eea84">{gt('ai_label')}</span>{/if}<span class="sp"></span>
              {#if recs.can_edit}<button class="g-act" onclick={() => { editing = r.id; editText = r.text; }}>{t('edit')}</button><button class="g-act" onclick={() => delRec(r)}>✕</button>{/if}</div>
          {/if}
        </div>
      {:else}<p class="muted">{t('no_rec')}</p>{/each}
      {#if recs.can_edit}
        <div class="stack u-f057b99">
          <textarea class="u-a6e1332" placeholder={gt('p_rec_ph')} maxlength="800" bind:value={newRec}></textarea>
          <div class="row"><select class="g-sel" bind:value={recComp}><option value="">{gt('p_rec_any')}</option>{#each c360.competencies as c}<option value={c.id}>{nm(c)}</option>{/each}</select>
            <button class="btn grad" onclick={addRec} disabled={!newRec.trim()}>{gt('add')}</button></div>
        </div>
      {/if}
    </section>

    <section class="card">
      <div class="card-head"><h3>{t('badges')}</h3><span class="aside">{badges.badges.filter((b: any) => b.have).length}/{badges.badges.length}</span></div>
      <div class="badges">
        {#each badges.badges as b}
          <div class="badge" class:off={!b.have} title={nm(b, 'descr')}>
            <div class="ic">{b.icon}</div>{nm(b)}
            {#if !b.have && b.auto}<div class="g-badge-prog"><i style:width={`${(b.cur / b.goal) * 100}%`}></i></div><div class="xs">{Math.round(b.cur)}/{b.goal}</div>{/if}
            {#if !b.have && !b.auto && badges.can_award}<button class="btn sm u-7ddb4fe" onclick={() => award(b)}>{gt('p_award')}</button>{/if}
          </div>
        {/each}
      </div>
    </section>
  </div>
{/if}
