<script lang="ts">
  import { api } from '../lib/api';
  import { fmtDate, fmtDateTime } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import Modal from '../components/Modal.svelte';
  import { tt, lf, tkind, verdictLabel } from './tr18n';

  let data: any = $state(null), err = $state(''), filter: 'all' | 'wait' | 'cleared' = $state('all');
  let det: any = $state(null), busy = $state(false);

  async function load() { try { data = await api.get('/api/training/team'); } catch { err = tt('error'); } }
  load();

  const rows = $derived((data?.rows ?? []).filter((r: any) => filter === 'all' || (filter === 'cleared' ? !!r.cleared : !r.cleared)));

  async function open(uid: number) {
    busy = true;
    try { det = await api.get(`/api/training/team/${uid}`); } catch { err = tt('error'); } finally { busy = false; }
  }
  async function act(kind: 'recommend' | 'clear' | 'revoke') {
    if (!det) return;
    const r = det.row;
    if (kind === 'clear') {
      const warn = r.last_ready?.verdict !== 'ready' ? `\n\n${tt('tm_confirm_warn')}` : '';
      if (!confirm(tt('tm_confirm_clear', { name: r.user.name }) + warn)) return;
    }
    if (kind === 'revoke' && !confirm(tt('tm_confirm_revoke', { name: r.user.name }))) return;
    busy = true;
    try { await api.post(`/api/training/team/${r.user.id}/${kind}`); await load(); det = await api.get(`/api/training/team/${r.user.id}`); }
    catch { err = tt('error'); } finally { busy = false; }
  }
  const days = $derived<number[]>(det ? ([...new Set<number>(det.lessons.map((l: any) => l.day as number))] as number[]).sort((a, b) => a - b) : []);
  const ratingIco = (r: string | null) => (r === 'best' ? '✓' : r === 'ok' ? '~' : r === 'bad' ? '!' : '—');
</script>

{#if !data}<div class="tr-center">{#if err}<p class="muted">{err}</p>{:else}<span class="spin"></span>{/if}</div>{:else}
  <section class="card hl">
    <h2>{tt('tm_title')}</h2>
    <p class="muted">{tt('tm_sub')}</p>
    <div class="tabs" style="margin:14px 0 0">
      <button class:on={filter === 'all'} onclick={() => (filter = 'all')}>{tt('tm_filter_all')} · {data.rows.length}</button>
      <button class:on={filter === 'wait'} onclick={() => (filter = 'wait')}>{tt('tm_filter_wait')} · {data.rows.filter((r: any) => !r.cleared).length}</button>
      <button class:on={filter === 'cleared'} onclick={() => (filter = 'cleared')}>{tt('tm_filter_cleared')} · {data.rows.filter((r: any) => r.cleared).length}</button>
    </div>
  </section>

  <div class="stack" style="margin-top:20px">
    {#each rows as r}
      <button class="card tr-trow" onclick={() => open(r.user.id)}>
        <Avatar u={r.user} size={44} />
        <div class="tr-tmain">
          <b>{r.user.name}</b>
          <div class="muted small">{r.user.position}{#if r.mentor} · {tt('tm_mentor')}: {r.mentor.name}{/if}</div>
        </div>
        <div class="tr-tprog">
          <div class="row" style="justify-content:space-between"><b>{r.pct}%</b><span class="muted xs">{tt('day_of', { n: r.day, m: 10 })}</span></div>
          <div class="tr-bar sm"><i style="width:{r.pct}%"></i></div>
          <div class="muted xs">{tt('lessons_done', { n: r.done, m: r.total })}</div>
        </div>
        <div class="tr-tmeta small">
          <div><span class="muted">{tt('tm_ready')}:</span> {#if r.last_ready}<b class="tr-v-{r.last_ready.verdict}">{r.last_ready.score}% · {verdictLabel(r.last_ready.verdict)}</b>{:else}<span class="muted">{tt('tm_no_ready')}</span>{/if}</div>
          <div><span class="muted">{tt('tm_trainer')}:</span> {r.trainer.best}/{r.trainer.tried}</div>
          <div class="muted xs">{tt('tm_last')}: {r.last_at ? fmtDate(r.last_at) : tt('tm_never')}</div>
        </div>
        <div class="tr-tstat">
          {#if r.cleared}<span class="chip tr-chip-ok">✓ {tt('cleared')}</span>
          {:else if r.recommended}<span class="chip tr-chip-warn">★ {tt('recommended')}</span>{/if}
        </div>
      </button>
    {:else}<div class="card"><p class="muted">{tt('tm_empty')}</p></div>{/each}
  </div>
{/if}

{#if det}
  <Modal wide onclose={() => (det = null)}>
    {@const r = det.row}
    <div class="tr-mhead">
      <Avatar u={r.user} size={52} />
      <div><h2 style="margin:0">{r.user.name}</h2><div class="muted small">{r.user.position} · {tt('tm_started')} {fmtDate(r.started_at)}</div>
        <div class="muted small">{tt('tm_mentor')}: {r.mentor ? r.mentor.name : tt('no_mentor')}</div></div>
    </div>
    <div class="row wrap" style="gap:8px;margin:10px 0">
      {#if r.cleared}<span class="chip tr-chip-ok">✓ {tt('cleared')} · {tt('tm_cleared_by', { name: r.cleared.by ?? '—' })}</span>{/if}
      {#if r.recommended}<span class="chip tr-chip-warn">★ {tt('tm_rec_by', { name: r.recommended.by ?? '—' })}</span>{/if}
    </div>
    <div class="row wrap" style="margin-bottom:6px">
      {#if data.can_recommend && !r.cleared}<button class="btn" disabled={busy} onclick={() => act('recommend')}>★ {tt('tm_recommend')}</button>{/if}
      {#if data.can_clear && !r.cleared}<button class="btn grad" disabled={busy} onclick={() => act('clear')}>✓ {tt('tm_clear')}</button>{/if}
      {#if data.can_clear && r.cleared}<button class="btn danger" disabled={busy} onclick={() => act('revoke')}>{tt('tm_revoke')}</button>{/if}
    </div>
    {#if !data.can_clear}<p class="muted xs">{tt('rd_wait_clear')}</p>{/if}

    <h3 style="margin-top:14px">{tt('tm_ready')}</h3>
    {#if det.sessions.length}
      <ul class="tr-hist">
        {#each det.sessions as s}
          <li><a class="tr-hrow" href="#/training/ready" onclick={() => (det = null)}>
            <span class="tr-hs {s.verdict}">{s.score}%</span>
            <span><b class="tr-v-{s.verdict}">{verdictLabel(s.verdict)}</b><small class="muted"> · {fmtDateTime(s.finished_at)}{#if s.ai} · ✦{/if}</small></span></a></li>
        {/each}
      </ul>
    {:else}<p class="muted small">{tt('tm_no_ready')}</p>{/if}

    <h3 style="margin-top:14px">{tt('tm_lessons')} · {r.done}/{r.total}</h3>
    <div class="tr-mdays">
      {#each days as d}
        <div class="tr-mday"><b class="small">{tt('day', { n: d })}</b>
          {#each det.lessons.filter((l: any) => l.day === d) as l}
            <div class="tr-mles small"><span class="tr-st {l.status === 'done' ? 'done' : l.status === 'failed' ? 'fail' : l.status === 'in_progress' ? 'prog' : 'new'}">{l.status === 'done' ? '✓' : l.status === 'failed' ? '!' : l.status === 'in_progress' ? '•' : ''}</span>
              <span>{lf(l, 'title')}<small class="muted"> · {tkind(l.kind)}{#if l.score != null} · {l.score}%{/if}</small></span></div>
          {/each}
        </div>
      {/each}
    </div>

    <h3 style="margin-top:14px">{tt('tm_scen')}</h3>
    <div class="tr-mscen small">
      {#each det.trainer as s}<span class="chip" title={tt('tm_attempts', { n: s.attempts })}>{ratingIco(s.last_rating)} {lf(s, 'title')}</span>{/each}
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" onclick={() => (det = null)}>{tt('close')}</button></div>
  </Modal>
{/if}
