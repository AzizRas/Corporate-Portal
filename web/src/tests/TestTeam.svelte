<script lang="ts">
  import { api } from '../lib/api';
  import Avatar from '../components/Avatar.svelte';
  import Modal from '../components/Modal.svelte';
  import { tt, tl } from './t18n';
  import Radar from './Radar.svelte';

  let d: any = $state(null), err = $state(false);
  let open = $state(false), sel: Record<number, boolean> = $state({}), slug = $state(''), note = $state(''), msg = $state(''), sent = $state(false), busy = $state(false);
  const load = () => api.get('/api/tests/team').then((r) => { d = r; if (!slug) slug = r.tests[0]?.slug ?? ''; }).catch(() => (err = true));
  load();

  const chosen = $derived(Object.keys(sel).filter((k) => sel[Number(k)]).map(Number));
  const axisText = (ids: string[], kind: 'high' | 'low') => ids.map((a) => `${a}${tt(`tm_${a.toLowerCase()}_${kind}`) ? ` (${tt(`tm_${a.toLowerCase()}_${kind}`)})` : ''}`).join('; ');
  function openAssign() { sel = {}; note = ''; msg = ''; sent = false; open = true; }
  async function send() {
    if (!chosen.length) { msg = tt('tm_none'); return; }
    busy = true; msg = ''; sent = false;
    try {
      const r = await api.post('/api/tests/assign', { test: slug, user_ids: chosen, note });
      sent = true;
      msg = `${tt('tm_sent', { n: r.assigned })}${r.skipped ? ` · ${tt('tm_skipped', { n: r.skipped })}` : ''}`;
      await load();
      setTimeout(() => (open = false), 900);
    } catch { msg = tt('err'); } finally { busy = false; }
  }
</script>

{#if err}<div class="alert">{tt('err')}</div>
{:else if !d}<span class="spin"></span>
{:else}
  <div class="card hl" style="margin-bottom:20px">
    <div class="card-head"><h3>{tt('tm_paei')}</h3>{#if d.paei}<span class="aside">{tt('tm_paei_n', { n: d.paei.n, total: d.paei.total })}</span>{/if}</div>
    {#if d.paei}
      <div class="t-hero">
        <Radar axes={['P', 'A', 'E', 'I'].map((a) => ({ id: a, value: d.paei.avg[a] }))} label="PAEI" />
        <div class="grow stack">
          {#if d.paei.high.length || d.paei.low.length}
            <p style="font-size:17px;line-height:1.45">
              {tt('tm_you_have')}
              {#if d.paei.high.length}<b>{tt('tm_paei_many').toLowerCase()} {d.paei.high.join(', ')}</b>{/if}{#if d.paei.high.length && d.paei.low.length} {tt('tm_and')} {/if}{#if d.paei.low.length}<b>{tt('tm_paei_few').toLowerCase()} {d.paei.low.join(', ')}</b>{/if}.
            </p>
            {#if d.paei.high.length}<p class="muted small">↑ {axisText(d.paei.high, 'high')}</p>{/if}
            {#if d.paei.low.length}<p class="muted small">↓ {axisText(d.paei.low, 'low')}</p>{/if}
          {:else}<p>{tt('tm_paei_ok')}</p>{/if}
        </div>
      </div>
    {:else}<p class="muted">{tt('tm_paei_empty')}</p>{/if}
  </div>

  <div class="card">
    <div class="card-head"><h3>{tt('tm_title')}</h3><button class="btn sm grad" onclick={openAssign} disabled={!d.members.length}>{tt('tm_assign')}</button></div>
    <p class="muted small" style="margin-bottom:14px">{tt('tm_hint')}</p>
    {#if !d.members.length}<p class="muted">{tt('tm_empty')}</p>
    {:else}
      <div class="scroll-x">
        <table class="table t-team">
          <thead><tr><th>{tt('tm_member')}</th>{#each d.tests as t}<th>{tl(t.title)}</th>{/each}</tr></thead>
          <tbody>
            {#each d.members as m (m.id)}
              <tr>
                <td><div class="who"><Avatar u={m} size={34} /><div><b>{m.name}</b><small>{m.position}</small></div></div></td>
                {#each d.tests as t}
                  <td>
                    {#if m.results[t.slug]}<a class="t-cell {m.results[t.slug].tone}" href="#/tests/result/{m.results[t.slug].id}">{tl(m.results[t.slug].headline)}</a>
                    {:else}<span class="muted">—</span>{/if}
                    {#if m.pending.includes(t.slug)}<div class="t-pend">⏳ {tt('tm_pending')}</div>{/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  {#if open}
    <Modal onclose={() => (open = false)}>
      <h2>{tt('tm_assign')}</h2>
      <label class="f">{tt('tm_test')}<select bind:value={slug}>{#each d.tests as t}<option value={t.slug}>{tl(t.title)}</option>{/each}</select></label>
      <div class="row" style="justify-content:space-between"><span class="muted small">{tt('tm_to')}</span>
        <button class="btn sm" onclick={() => { const all = chosen.length < d.members.length; sel = Object.fromEntries(d.members.map((m: any) => [m.id, all])); }}>{tt('tm_all')}</button></div>
      <div class="t-chk">{#each d.members as m}<label><input type="checkbox" bind:checked={sel[m.id]} /><Avatar u={m} size={26} /><span>{m.name}</span></label>{/each}</div>
      <label class="f">{tt('tm_note')}<input type="text" bind:value={note} maxlength="300" /></label>
      {#if msg}<div class="alert" class:ok={sent} style="margin-bottom:12px">{msg}</div>{/if}
      <div class="row" style="justify-content:flex-end"><button class="btn" onclick={() => (open = false)}>{tt('cancel')}</button><button class="btn grad" disabled={busy} onclick={send}>{tt('tm_send')}</button></div>
    </Modal>
  {/if}
{/if}
