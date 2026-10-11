<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { api } from '../lib/api';
  import { has } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { fmtTime, fmtDate } from '../lib/format';
  import Ring from '../components/Ring.svelte';
  import { gt } from '../growth/g18n';
  import { st } from '../lib/s18n';
  import { wt } from '../lib/w18n';
  import Panel from '../team/Panel.svelte';
  import Members from '../team/Members.svelte';
  import Member from '../team/Member.svelte';

  let { id = null }: { id?: number | null } = $props();
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let path: any[] = $state([]), marks: any[] = $state([]);
  let pathLoaded = $state(false), marksLoaded = $state(false), pathErr: unknown = $state(null), marksErr: unknown = $state(null);
  const load = () => { marksErr = null; return api.get('/api/attendance/team').then((r) => (marks = r.items)).catch((e) => (marksErr = e)).finally(() => (marksLoaded = true)); };
  const loadPath = () => { pathErr = null; return api.get('/api/path/team').then((r) => (path = r.items)).catch((e) => (pathErr = e)).finally(() => (pathLoaded = true)); };
  loadPath();
  load();
  async function decide(id: number, approve: boolean) { await api.post(`/api/attendance/${id}/decide`, { approve }); await load(); }
</script>

{#if id}<Member {id} />{:else}
<header class="page-head"><div><h1>{t('nav_team')}<PageHelp topic="panel_team" /></h1></div><div class="head-actions"><a class="btn" href="#/schedule/team">{st('n_schedule')}</a><a class="btn" href="#/leaves">{wt('i_leaves')}</a></div></header>
<Members />
<Panel />
<div class="grid u-e3865e7">
  <section class="card">
    <div class="card-head"><h3>{t('path_ready')}</h3><a class="small" href="#/growth/reserve">{gt('tab_reserve')} →</a></div>
    {#if pathErr}<ErrorState error={pathErr} retry={loadPath} />
    {:else if !pathLoaded}<Skeleton rows={4} />
    {:else if !path.length}<EmptyState title={wt('tm_path_empty')} hint={wt('tm_path_hint')} />
    {:else}<div class="list">
      {#each path as p}<div><a class="u-30279af" href="#/growth/person/{p.id}">{p.name}<span class="muted xs"> → {p.target}</span></a>
        <span><b>{p.readiness}%</b>{#if p.delta != null} <span class="small {p.delta >= 0 ? 'pill-ok' : 'pill-bad'}">{p.delta >= 0 ? '+' : ''}{p.delta}</span>{/if}</span></div>{/each}
    </div>{/if}
  </section>
  <section class="card">
    <div class="card-head"><h3>{t('att_team')}</h3><span class="aside">{t('att_today')}</span></div>
    {#if marksErr}<ErrorState error={marksErr} retry={load} />
    {:else if !marksLoaded}<Skeleton rows={4} />
    {:else if !marks.length}<EmptyState title={t('att_no_marks')} />
    {:else}<div class="list">
      {#each marks.slice(0, 40) as m}
        <div class="u-0486f78"><span><b>{m.name}</b> · {m.kind === 'in' ? t('att_in') : t('att_out')} {fmtTime(m.at)}
          {#if m.reason}<br /><span class="muted xs">«{m.reason}»</span>{/if}
          {#if m.has_photo}<br /><img class="u-f2904c2" src="/api/attendance/{m.id}/photo" alt="" />{/if}</span>
          {#if m.status === 'pending'}<span class="row"><button class="btn sm grad" onclick={() => decide(m.id, true)}>{t('att_approve')}</button><button class="btn sm" onclick={() => decide(m.id, false)}>{t('att_reject')}</button></span>
          {:else if m.status !== 'ok'}<span class="chip">{m.status}</span>{/if}</div>
      {/each}
    </div>{/if}
  </section>
</div>
{/if}
