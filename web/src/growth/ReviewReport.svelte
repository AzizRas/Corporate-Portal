<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { rt } from './r18n';

  let { cycle, target, onclose }: { cycle: number; target: number; onclose: () => void } = $props();
  let d: any = $state(null), err = $state(false);
  const uz = $derived(app.lang === 'uz');
  const load = () => api.get(`/api/reviews/cycles/${cycle}/report/${target}`).then((r) => (d = r)).catch(() => (err = true));
  $effect(() => { cycle; target; load(); });
  const pct = (v: number | null, max = 5) => (v == null ? 0 : Math.round((Number(v) / max) * 100));
  const fmt = (v: number | null) => (v == null ? '—' : Number(v).toFixed(1));
  async function ack() { await api.post(`/api/reviews/cycles/${cycle}/ack`); await load(); }
  const KIND = (k: string) => rt(k === 'comp' ? 'comment' : `ssc_${k}`);
</script>

<p><button class="btn sm" onclick={onclose}>← {rt('back')}</button></p>
{#if err}<div class="alert">{rt('err')}</div>
{:else if !d}<span class="spin"></span>
{:else}
  <section class="card stack">
    <h2>{d.cycle.name}</h2>
    <p class="muted small">{rt('report_hint')}</p>
    <div class="rv-legend"><span class="k self"></span>{rt('type_self')}<span class="k lead"></span>{rt('type_lead')}<span class="k peers"></span>{rt('type_peer')}<span class="k subs"></span>{rt('type_sub')}</div>
    {#each d.comps as c}
      <div class="rv-comp">
        <div class="row"><b>{uz ? c.name_uz || c.name_ru : c.name_ru}</b><span class="sp"></span><span class="muted small">{rt('level')}: <b>{c.level != null ? Number(c.level).toFixed(1) : '—'}</b> / 4</span></div>
        {#each [['self', c.self], ['lead', c.lead], ['peers', c.peers], ['subs', c.subs]] as [k, v]}
          {#if v != null}<div class="rv-bar"><span class="xs muted">{rt(`type_${k === 'peers' ? 'peer' : k === 'subs' ? 'sub' : k}`)}</span><i class={k} style:width={`${pct(v)}%`}></i><b class="xs">{fmt(v)}</b></div>{/if}
        {/each}
        {#if c.peers == null && c.n_peers > 0}<p class="muted xs">{rt('anon_hidden')}</p>{/if}
        {#if c.flag}<p class="small {c.flag === 'blind_spot' ? 'warn-ink' : 'ok-ink'}">{rt(c.flag)}</p>{/if}
      </div>
    {/each}
  </section>
  {#if d.comments.length}
    <section class="card stack">
      <h3 class="card-title">{rt('comments')}</h3>
      {#each d.comments as m}<div class="rv-quote"><span class="xs muted">{m.from === 'lead' ? rt('type_lead') : rt('others')} · {KIND(m.kind)}</span><p>{m.text}</p></div>{/each}
    </section>
  {/if}
  {#if d.own}
    <section class="card stack">
      {#if d.acked}<p class="ok-ink">✓ {rt('acked')}</p>{:else}<p class="small">{rt('ack_hint')}</p><button class="btn grad" onclick={ack}>{rt('ack')}</button>{/if}
      <a class="btn" href="#/growth/talk">{rt('to_talk')}</a>
    </section>
  {/if}
{/if}
