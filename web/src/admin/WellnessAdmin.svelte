<script lang="ts">
  // Админка напоминаний (hr, admin): советы с RU/UZ, типом и необязательным упражнением с таймером.
  import { api } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { wt } from '../wellness/w18n';

  type Tip = { id?: number; kind: string; emoji: string; text_ru: string; text_uz: string; exercise_sec: number | null; active: boolean };
  const KINDS = ['drink', 'move', 'eyes', 'stand', 'breathe', 'tea', 'rest'];
  let tips: Tip[] = $state([]), loading = $state(true), form: (Tip & { ex: boolean }) | null = $state(null), err = $state(''), busy = $state(false);

  const load = async () => { tips = (await api.get('/api/admin/wellness/tips')).tips; loading = false; };
  load();
  const active = $derived(tips.filter((t) => t.active).length);

  const blank = () => ({ kind: 'move', emoji: '🌿', text_ru: '', text_uz: '', exercise_sec: 30, ex: false, active: true });
  function edit(t?: Tip) { err = ''; form = t ? { ...t, ex: t.exercise_sec != null, exercise_sec: t.exercise_sec ?? 30 } : blank(); }
  async function save(e: Event) {
    e.preventDefault();
    if (!form) return;
    busy = true; err = '';
    try {
      const { ex, ...body } = form;
      await api.put('/api/admin/wellness/tips', { ...body, exercise_sec: ex ? Number(body.exercise_sec) : null });
      form = null; await load();
    } catch { err = wt('a_err'); } finally { busy = false; }
  }
  async function toggle(t: Tip) {
    const prev = t.active; t.active = !prev;
    try { await api.put('/api/admin/wellness/tips', t); } catch { t.active = prev; }
  }
  async function remove(t: Tip) {
    if (!confirm(wt('a_del_q'))) return;
    await api.del(`/api/admin/wellness/tips/${t.id}`).catch(() => {});
    await load();
  }
</script>

<div class="card">
  <div class="card-head"><h3>{wt('a_title')}</h3><span class="aside">{wt('a_total', { n: active, total: tips.length })}</span></div>
  <p class="muted small" style="margin-bottom:16px">{wt('a_sub')}</p>
  <button class="btn grad sm" onclick={() => edit()}>＋ {wt('a_add')}</button>

  {#if loading}<div style="margin-top:16px"><span class="spin"></span></div>
  {:else if !tips.length}<p class="muted" style="margin-top:16px">{wt('a_empty')}</p>
  {:else}
    <div class="wa-list">
      {#each tips as t (t.id)}
        <div class="wa-row" class:off={!t.active}>
          <span class="wa-em" aria-hidden="true">{t.emoji}</span>
          <div class="wa-tx">
            <div>{t.text_ru}</div>
            <div class="muted small">{t.text_uz}</div>
            <div class="wa-m"><span class="chip" style="padding:2px 10px;font-size:12px">{wt('k_' + t.kind)}</span>{#if t.exercise_sec}<span class="muted xs">⏱ {wt('a_timer', { n: t.exercise_sec })}</span>{/if}{#if !t.active}<span class="pill-warn xs">{wt('a_off')}</span>{/if}</div>
          </div>
          <div class="wa-act">
            <label class="chk" title={wt('a_active')}><input type="checkbox" checked={t.active} onchange={() => toggle(t)} /></label>
            <button class="btn sm" onclick={() => edit(t)}>✎</button>
            <button class="btn sm danger" onclick={() => remove(t)} aria-label={wt('a_del')}>✕</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if form}
  <Modal onclose={() => (form = null)}>
    <form onsubmit={save}>
      <h2>{wt('a_edit')}</h2>
      <div class="wa-two">
        <label class="f">{wt('a_kind')}<select bind:value={form.kind}>{#each KINDS as k}<option value={k}>{wt('k_' + k)}</option>{/each}</select></label>
        <label class="f">{wt('a_emoji')}<input type="text" bind:value={form.emoji} maxlength="8" /></label>
      </div>
      <label class="f">{wt('a_ru')}<textarea bind:value={form.text_ru} maxlength="300" rows="2" required></textarea></label>
      <label class="f">{wt('a_uz')}<textarea bind:value={form.text_uz} maxlength="300" rows="2" required></textarea></label>
      <label class="chk" style="margin-bottom:12px"><input type="checkbox" bind:checked={form.ex} /><span>{wt('a_ex')}</span></label>
      {#if form.ex}<label class="f">{wt('a_sec')}<input type="number" min="10" max="300" bind:value={form.exercise_sec} /></label>{/if}
      <label class="chk" style="margin-bottom:14px"><input type="checkbox" bind:checked={form.active} /><span>{wt('a_active')}</span></label>
      {#if err}<div class="alert" style="margin-bottom:12px">{err}</div>{/if}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" onclick={() => (form = null)}>{wt('a_cancel')}</button><button class="btn grad" disabled={busy}>{wt('a_save')}</button></div>
    </form>
  </Modal>
{/if}

<style>
  .wa-list { margin-top: 12px; }
  .wa-row { display: flex; gap: 14px; align-items: flex-start; padding: 14px 0; border-top: 1px solid var(--border); }
  .wa-row.off { opacity: .55; }
  .wa-em { font-size: 26px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 14px; background: var(--card-2); border: 1px solid var(--border); flex: none; }
  .wa-tx { flex: 1; min-width: 0; }
  .wa-m { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
  .wa-act { display: flex; gap: 8px; align-items: center; flex: none; }
  .wa-two { display: grid; grid-template-columns: 1fr 120px; gap: 0 12px; }
  @media (max-width: 560px) { .wa-row { flex-wrap: wrap; } .wa-act { width: 100%; justify-content: flex-end; } }
</style>
