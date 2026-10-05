<script lang="ts">
  import { api } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { lt, ln } from './l18n';
  import { parseEmbed } from './embed';
  import LibPlayer from './LibPlayer.svelte';

  let { item = null, categories, comps, onclose, onsaved }: { item?: any; categories: string[]; comps: any[]; onclose: () => void; onsaved: () => void } = $props();
  // svelte-ignore state_referenced_locally
  const init = item ?? {};
  let f = $state({ kind: init.kind ?? 'book', title: init.title ?? '', author: init.author ?? '', url: init.url ?? '', descr: init.descr ?? '', category: init.category ?? '', comp: init.comp ?? '', tags: init.tags ?? '', level: init.level ?? '', active: init.active ?? true });
  let busy = $state(false), err = $state('');
  const pv = $derived(parseEmbed(f.url));
  const urlBad = $derived(!!f.url.trim() && pv.type === 'none');

  async function save(ev: Event) {
    ev.preventDefault();
    if (!f.title.trim() || urlBad) { err = lt('f_err'); return; }
    busy = true; err = '';
    try {
      const body = { ...f, comp: f.comp || null };
      if (item) await api.put(`/api/library/${item.id}`, body); else await api.post('/api/library', body);
      onsaved();
    } catch { err = lt('f_err'); busy = false; }
  }
</script>

<Modal {onclose} wide>
  <form onsubmit={save}>
    <h2>{item ? lt('f_edit') : lt('f_new')}</h2>
    <div class="l-form2">
      <label class="f">{lt('f_kind')}<select bind:value={f.kind}>{#each ['book', 'video', 'article', 'course', 'link'] as k}<option value={k}>{lt('k_' + k)}</option>{/each}</select></label>
      <label class="f">{lt('f_level')}<select bind:value={f.level}><option value="">{lt('f_level_none')}</option>{#each ['basic', 'mid', 'adv'] as l}<option value={l}>{lt('l_' + l)}</option>{/each}</select></label>
    </div>
    <label class="f">{lt('f_title')}<input type="text" bind:value={f.title} maxlength="200" required /></label>
    <label class="f">{lt('f_author')}<input type="text" bind:value={f.author} maxlength="200" /></label>
    <label class="f">{lt('f_url')}<input type="text" inputmode="url" bind:value={f.url} maxlength="500" placeholder="https://" /></label>
    <div class="l-pv" class:bad={urlBad}>
      <b>{lt('f_preview')}:</b>
      {#if urlBad}{lt('f_prev_bad')}
      {:else if pv.type === 'iframe'}{lt('f_prev_video')}
      {:else if pv.type === 'video'}{lt('f_prev_mp4')}
      {:else if pv.type === 'link'}{lt('f_prev_link')}: <b>{pv.host}</b>
      {:else}{lt('f_prev_none')}{/if}
      {#if pv.type === 'iframe' || pv.type === 'video'}<div style="margin-top:10px"><LibPlayer e={pv} small title={f.title} /></div>{/if}
    </div>
    <label class="f">{lt('f_descr')}<textarea bind:value={f.descr} maxlength="1000" rows="3"></textarea></label>
    <div class="l-form2">
      <label class="f">{lt('f_cat')}<input type="text" bind:value={f.category} maxlength="60" list="lib-cats" /></label>
      <label class="f">{lt('f_comp')}<select bind:value={f.comp}><option value="">{lt('f_comp_none')}</option>{#each comps as c}<option value={c.id}>{ln(c.name)}</option>{/each}</select></label>
    </div>
    <datalist id="lib-cats">{#each categories as c}<option value={c}></option>{/each}</datalist>
    <label class="f">{lt('f_tags')}<input type="text" bind:value={f.tags} maxlength="200" /></label>
    {#if item}<label class="chk" style="margin-bottom:14px"><input type="checkbox" bind:checked={f.active} /><span>{lt('f_active')}</span></label>{/if}
    {#if err}<div class="alert" style="margin-bottom:12px">{err}</div>{/if}
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" onclick={onclose}>{lt('f_cancel')}</button><button class="btn grad" disabled={busy}>{lt('f_save')}</button></div>
  </form>
</Modal>
