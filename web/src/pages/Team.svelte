<script lang="ts">
  import { api } from '../lib/api';
  import { has } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { fmtTime, fmtDate } from '../lib/format';
  import Ring from '../components/Ring.svelte';

  let path: any[] = $state([]), marks: any[] = $state([]);
  const load = () => api.get('/api/attendance/team').then((r) => (marks = r.items));
  api.get('/api/path/team').then((r) => (path = r.items));
  load();
  async function decide(id: number, approve: boolean) { await api.post(`/api/attendance/${id}/decide`, { approve }); await load(); }
</script>

<header class="page-head"><div><h1>{t('nav_team')}</h1></div></header>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(360px,1fr))">
  <section class="card">
    <div class="card-head"><h3>{t('path_ready')}</h3></div>
    <div class="list">
      {#each path as p}<div><span style="font-weight:600">{p.name}<span class="muted xs"> → {p.target}</span></span>
        <span><b>{p.readiness}%</b>{#if p.delta != null} <span class="small {p.delta >= 0 ? 'pill-ok' : 'pill-bad'}">{p.delta >= 0 ? '+' : ''}{p.delta}</span>{/if}</span></div>{/each}
    </div>
  </section>
  <section class="card">
    <div class="card-head"><h3>{t('att_team')}</h3><span class="aside">{t('att_today')}</span></div>
    <div class="list">
      {#each marks.slice(0, 40) as m}
        <div style="align-items:flex-start"><span><b>{m.name}</b> · {m.kind === 'in' ? t('att_in') : t('att_out')} {fmtTime(m.at)}
          {#if m.late_min}<span class="pill-warn small"> · {t('att_late')} {m.late_min}</span>{/if}
          {#if m.reason}<br /><span class="muted xs">«{m.reason}»</span>{/if}
          {#if m.has_photo}<br /><img src="/api/attendance/{m.id}/photo" alt="" style="height:64px;border-radius:10px;margin-top:6px" />{/if}</span>
          {#if m.status === 'pending'}<span class="row"><button class="btn sm grad" onclick={() => decide(m.id, true)}>{t('att_approve')}</button><button class="btn sm" onclick={() => decide(m.id, false)}>{t('att_reject')}</button></span>
          {:else if m.status !== 'ok'}<span class="chip">{m.status}</span>{/if}</div>
      {:else}<p class="muted">{t('att_no_marks')}</p>{/each}
    </div>
  </section>
</div>
