<script lang="ts">
  import { api } from '../lib/api';
  import { tt, lf, tkind, KIND_ICON, verdictLabel } from './tr18n';
  import { T, loadMe } from './store.svelte';

  const me = $derived(T.me);
  const en = $derived(me?.enrollment);
  const pr = $derived(me?.progress);
  let busy = $state(false);
  async function enroll() { busy = true; try { await api.post('/api/training/enroll'); await loadMe(true); } finally { busy = false; } }

  const stClass = (s: string | null) => (s === 'done' ? 'done' : s === 'failed' ? 'fail' : s === 'in_progress' ? 'prog' : 'new');
  const stText = (s: string | null) => tt(s === 'done' ? 'st_done' : s === 'failed' ? 'st_failed' : s === 'in_progress' ? 'st_progress' : 'st_new');
  const dayStat = (d: any) => ({ done: d.lessons.filter((l: any) => l.status === 'done').length, total: d.lessons.length });
</script>

{#if !me.enrolled}
  <div class="card hl tr-enroll">
    <h2>{tt('enroll_h')}</h2>
    <p class="muted">{tt('enroll_t')}</p>
    {#if me.default_course}<p><b>{lf(me.default_course, 'title')}</b></p>{/if}
    <button class="btn grad" disabled={busy || !me.default_course} onclick={enroll}>{tt('enroll_btn')}</button>
  </div>
{:else}
  <section class="card hl tr-hero">
    <div class="tr-hero-top">
      <div>
        <span class="tag">{lf(me.course, 'title')}</span>
        <div class="tr-pct"><span class="big-num">{pr.pct}%</span><span class="muted">{tt('day_of', { n: pr.day, m: pr.days_total })}</span></div>
        <p class="muted small">{tt('lessons_done', { n: pr.done, m: pr.total })}</p>
      </div>
      <div class="tr-chips">
        {#if en.cleared_at}<span class="chip tr-chip-ok">✓ {tt('cleared')}</span>
        {:else if en.recommended_at}<span class="chip tr-chip-warn">★ {tt('recommended')}</span>
        {:else}<span class="chip">{tt('waiting_clear')}</span>{/if}
        <span class="chip">{tt('mentor')}: {en.mentor ? en.mentor.name : tt('no_mentor')}</span>
        {#if me.ai}<span class="chip tr-chip-ai">✦ {tt('ai_on')}</span>{:else}<span class="chip" title={tt('ai_off_note')}>{tt('ai_off')}</span>{/if}
      </div>
    </div>
    <div class="tr-bar" role="progressbar" aria-valuenow={pr.pct} aria-valuemin="0" aria-valuemax="100"><i style:width={`${pr.pct}%`}></i></div>
    {#if en.cleared_at && en.cleared_by}<p class="muted small">{tt('cleared_by', { name: en.cleared_by })}</p>
    {:else if en.recommended_at && en.recommended_by}<p class="muted small">{tt('recommended_by', { name: en.recommended_by })}</p>{/if}
    {#if !me.ai}<p class="muted xs">{tt('ai_off')} · {tt('ai_off_note')}</p>{/if}
  </section>

  <div class="tr-two">
    <section class="card tr-next">
      <h3>{tt('next_step')}</h3>
      {#if me.next}
        <div class="tr-next-t"><span class="tr-ico">{KIND_ICON[me.next.kind]}</span>
          <div><b>{lf(me.next, 'title')}</b><div class="muted small">{tt('day', { n: me.next.day })} · {tkind(me.next.kind)}</div></div></div>
        <a class="btn grad" href="#/training/lesson/{me.next.id}">{pr.done ? tt('continue') : tt('start')} →</a>
      {:else}
        <p>{tt('all_done')}</p>
        <a class="btn grad" href="#/training/ready">{tt('go_ready')} →</a>
      {/if}
    </section>
    <section class="tr-tiles">
      <a class="card tr-tile" href="#/training/trainer">
        <h3>{tt('tile_trainer')}</h3>
        <p>{tt('tile_trainer_v', { n: me.trainer.tried, m: me.trainer.total, b: me.trainer.best })}</p>
      </a>
      <a class="card tr-tile" href="#/training/ready">
        <h3>{tt('tile_ready')}</h3>
        {#if me.readiness}
          <p><b class="tr-v-{me.readiness.verdict}">{verdictLabel(me.readiness.verdict)}</b> · {tt('tile_ready_v', { n: me.readiness.score })}</p>
        {:else}<p class="muted">{tt('tile_ready_none')}</p>{/if}
      </a>
    </section>
  </div>

  <div class="tr-days">
    {#each me.days as d}
      {@const s = dayStat(d)}
      <section class="card tr-day" class:cur={d.day === pr.day} class:full={s.done === s.total}>
        <header>
          <h3>{tt('day', { n: d.day })}</h3>
          <span class="muted small">{s.done}/{s.total}</span>
        </header>
        <div class="tr-bar sm"><i style:width={`${s.total ? (s.done / s.total) * 100 : 0}%`}></i></div>
        <ul>
          {#each d.lessons as l}
            <li>
              <a class="tr-les {stClass(l.status)}" href="#/training/lesson/{l.id}" title={stText(l.status)}>
                <span class="tr-st {stClass(l.status)}" aria-hidden="true">{l.status === 'done' ? '✓' : l.status === 'failed' ? '!' : l.status === 'in_progress' ? '•' : ''}</span>
                <span class="tr-les-t"><span>{lf(l, 'title')}</span><small class="muted">{KIND_ICON[l.kind]} {tkind(l.kind)}{#if l.status === 'done' && l.score != null} · {l.score}%{/if}{#if l.has_video} · ▶{/if}</small></span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}
