<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { monthLong } from '../lib/format';
  import { gt } from './g18n';
  import Modal from '../components/Modal.svelte';

  let data: any = $state(null), open: any = $state(null), answers: Record<string, number> = $state({}), err = $state(''), saving = $state(false);
  const load = async () => (data = await api.get('/api/growth/survey'));
  load();

  const nm = (c: any) => (app.lang === 'uz' ? c.name_uz || c.name_ru : c.name_ru);
  const qs = (c: any) => (app.lang === 'uz' ? c.question_uz || c.question_ru : c.question_ru);
  const comp = (id: string) => data.competencies.find((c: any) => c.id === id);
  const lv = ['lvl1', 'lvl2', 'lvl3', 'lvl4'] as const;

  const rounds = $derived(data ? [...new Set<number>(data.tasks.map((x: any) => x.round))].sort() : []);
  const total = $derived(data ? data.tasks.length : 0);
  const done = $derived(data ? data.tasks.filter((x: any) => x.done).length : 0);
  const kindOf = (r: number) => data.tasks.find((x: any) => x.round === r)?.kind;

  function start(task: any) { open = task; answers = {}; err = ''; }
  async function send() {
    saving = true; err = '';
    try { await api.post('/api/growth/survey', { round: open.round, target_id: open.target.id, answers }); open = null; await load(); }
    catch (e) { err = e instanceof ApiError && e.code === 'already' ? gt('sv_already') : gt('sv_err'); }
    finally { saving = false; }
  }
  const ready = $derived(open ? open.comps.every((c: string) => answers[c] >= 1) : false);
</script>

{#if !data}<span class="spin"></span>{:else}
  <div class="card hl" style="margin-bottom:20px">
    <div class="card-head"><h3>{gt('sv_title')} · {monthLong(data.period)}</h3><span class="aside">{done} / {total}</span></div>
    <div class="g-prog"><i style="width:{total ? (done / total) * 100 : 0}%"></i></div>
    <p class="muted small" style="margin-top:12px">{gt('sv_hint')}</p>
  </div>

  <div class="g-grid">
    {#each rounds as r}
      <section class="card">
        <div class="card-head"><h3>{kindOf(r) === 'full' ? gt('sv_full') : `${gt('sv_short')} ${r}`}</h3>
          <span class="aside">{data.tasks.filter((x: any) => x.round === r && x.done).length} / {data.tasks.filter((x: any) => x.round === r).length}</span></div>
        <p class="muted xs" style="margin-bottom:6px">{data.tasks.find((x: any) => x.round === r).comps.map((c: string) => nm(comp(c))).join(' · ')}</p>
        <div>
          {#each data.tasks.filter((x: any) => x.round === r) as task}
            <div class="g-task">
              <div class="who">{task.type === 'self' ? gt('sv_self') : task.target.name}<small>{gt('sv_t_' + task.type)}{task.target.position ? ` · ${task.target.position}` : ''}</small></div>
              {#if task.done}<span class="pill-ok small">✓ {gt('sv_done')}</span>
              {:else}<button class="btn sm grad" onclick={() => start(task)}>{gt('sv_go')}</button>{/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

{#if open}
  <Modal onclose={() => (open = null)}>
    <h2>{open.type === 'self' ? gt('sv_self_h') : `${open.target.name}`}</h2>
    <p class="muted small" style="margin-bottom:12px">{gt('sv_t_' + open.type)}{open.type !== 'self' ? ` · ${gt('sv_anon')}` : ''}</p>
    {#each open.comps as cid}
      {@const c = comp(cid)}
      <div class="g-q">{nm(c)}<small>{qs(c)}</small></div>
      <div class="g-lv">
        {#each [1, 2, 3, 4] as n}<button class:on={answers[cid] === n} onclick={() => (answers[cid] = n)}><b>{n}</b>{t(lv[n - 1])}</button>{/each}
      </div>
    {/each}
    {#if err}<div class="alert" style="margin-bottom:10px">{err}</div>{/if}
    <div class="row" style="justify-content:flex-end">
      <button class="btn" onclick={() => (open = null)}>{t('cancel')}</button>
      <button class="btn grad" disabled={!ready || saving} onclick={send}>{t('send')}</button>
    </div>
  </Modal>
{/if}
