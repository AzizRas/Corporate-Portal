<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { gt } from '../growth/g18n';

  let s: any = $state(null), msg = $state(''), err = $state(''), saving = $state(false);
  let nid = $state(''), nname = $state(''), ngrp = $state('soft');
  const load = async () => (s = await api.get('/api/growth/settings'));
  load();

  const active = $derived(s ? s.competencies.filter((c: any) => c.active) : []);
  async function save() {
    saving = true; err = '';
    try {
      await api.put('/api/growth/settings', {
        soft_weight: s.soft_weight, threshold: s.threshold, style: s.style,
        competencies: s.competencies.map((c: any) => ({ id: c.id, active: c.active, round: c.round, grp: c.grp, name_ru: c.name_ru, name_uz: c.name_uz, question_ru: c.question_ru, question_uz: c.question_uz })),
        matrix: s.matrix,
      });
      msg = gt('a_saved'); setTimeout(() => (msg = ''), 2500); await load();
    } catch (e) { err = e instanceof ApiError && e.code === 'invalid_id' ? 'Код: латиница, 2–20 знаков' : 'Ошибка сохранения'; }
    finally { saving = false; }
  }
  function addComp() {
    if (!/^[a-z][a-z0-9_]{1,19}$/.test(nid) || s.competencies.some((c: any) => c.id === nid)) { err = 'Код: латиница, 2–20 знаков, уникальный'; return; }
    s.competencies.push({ id: nid, grp: ngrp, name_ru: nname || nid, name_uz: nname || nid, active: false, round: null, question_ru: '', question_uz: '' });
    nid = nname = ''; err = '';
  }
</script>

{#if !s}<span class="spin"></span>{:else}
  <div class="stack" style="gap:20px">
    <section class="card stack">
      <div class="card-head"><h3>{gt('a_weights')}</h3></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
        <label class="f" style="margin:0">{gt('a_soft')} · {gt('a_hard')} {100 - s.soft_weight}<input type="number" min="0" max="100" bind:value={s.soft_weight} /></label>
        <label class="f" style="margin:0">{gt('a_threshold')}<input type="number" min="50" max="100" bind:value={s.threshold} /></label>
      </div>
      <label class="f" style="margin:0">{gt('a_style')}<textarea placeholder={gt('a_style_ph')} maxlength="4000" bind:value={s.style}></textarea></label>
      {#if !s.ai}<div class="alert info">{gt('ai_off_msg')}</div>{/if}
    </section>

    <section class="card">
      <div class="card-head"><h3>{gt('a_comps')}</h3></div>
      <p class="muted small" style="margin-bottom:12px">{gt('a_comps_hint')}</p>
      <div class="g-mx"><table style="width:100%">
        <thead><tr><th>{gt('a_active')}</th><th>{gt('a_name_ru')}</th><th>{gt('a_name_uz')}</th><th>{gt('a_group')}</th><th>{gt('a_round')}</th><th>{gt('a_question')}</th></tr></thead>
        <tbody>
          {#each s.competencies as c (c.id)}
            <tr style="opacity:{c.active ? 1 : .6}">
              <td><input type="checkbox" bind:checked={c.active} style="width:18px;height:18px;accent-color:var(--accent)" /></td>
              <td><input bind:value={c.name_ru} style="min-width:170px" /></td><td><input bind:value={c.name_uz} style="min-width:150px" /></td>
              <td><select bind:value={c.grp}><option value="soft">{gt('a_soft_g')}</option><option value="hard">{gt('a_hard_g')}</option></select></td>
              <td><select value={c.round ?? 0} onchange={(e) => (c.round = Number(e.currentTarget.value) || null)}><option value={0}>{gt('a_full')}</option><option value={1}>1</option><option value={2}>2</option></select></td>
              <td><input bind:value={c.question_ru} style="min-width:260px" /></td>
            </tr>
          {/each}
        </tbody>
      </table></div>
      <div class="row wrap" style="margin-top:14px"><b class="small">{gt('a_new')}:</b>
        <input placeholder={gt('a_new_id')} bind:value={nid} style="width:160px" /><input placeholder={gt('a_name_ru')} bind:value={nname} style="width:220px" />
        <select bind:value={ngrp} class="g-sel"><option value="soft">{gt('a_soft_g')}</option><option value="hard">{gt('a_hard_g')}</option></select>
        <button class="btn sm" onclick={addComp}>{gt('add')}</button></div>
    </section>

    <section class="card">
      <div class="card-head"><h3>{gt('a_matrix')}</h3></div>
      <p class="muted small" style="margin-bottom:12px">{gt('a_matrix_hint')}</p>
      <div class="g-mx"><table>
        <thead><tr><th></th>{#each active as c}<th title={c.name_ru}>{c.name_ru.length > 14 ? `${c.name_ru.slice(0, 13)}…` : c.name_ru}</th>{/each}</tr></thead>
        <tbody>
          {#each s.positions as p}
            <tr><td><b>{p.ru}</b></td>
              {#each active as c}<td><input type="number" min="0" max="4" value={s.matrix[p.code]?.[c.id] ?? 0}
                onchange={(e) => { (s.matrix[p.code] ??= {})[c.id] = Number(e.currentTarget.value); }} /></td>{/each}</tr>
          {/each}
        </tbody>
      </table></div>
    </section>

    <div class="row">{#if err}<span class="pill-bad small">{err}</span>{/if}{#if msg}<span class="pill-ok small">{msg}</span>{/if}<span class="sp"></span>
      <button class="btn grad" onclick={save} disabled={saving}>{gt('save')}</button></div>
  </div>
{/if}
