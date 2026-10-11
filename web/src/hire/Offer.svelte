<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import Modal from '../components/Modal.svelte';
  import { toast, errText, ht, hg } from './store.svelte';

  let { pipelineId, name, onclose }: { pipelineId: number; name: string; onclose: () => void } = $props();
  let fields: any[] = $state([]), data: Record<string, any> = $state({}), status = $state('draft'), who: any = $state(null), err = $state('');
  $effect(() => { api.get(`/api/hire/pipeline/${pipelineId}/offer`).then((r) => { fields = r.fields; data = { ...r.offer.data }; status = r.offer.status; who = r.who; }).catch((e) => (err = errText(e))); });

  const label = (f: any) => (app.lang === 'uz' && f.label_uz) || f.label;
  // ссылка для кандидата: принять или отклонить без входа в портал (14 дней)
  let link = $state('');
  async function makeLink() {
    err = '';
    try { await api.put(`/api/hire/pipeline/${pipelineId}/offer`, { data, status: status === 'draft' ? 'sent' : status }); link = (await api.post(`/api/hire/pipeline/${pipelineId}/offer/link`)).url; try { await navigator.clipboard.writeText(link); } catch { /* буфер недоступен */ } }
    catch (x) { err = errText(x); }
  }
  async function save(e: Event) {
    e.preventDefault();
    try { await api.put(`/api/hire/pipeline/${pipelineId}/offer`, { data, status }); toast(ht('hSaved')); onclose(); } catch (x) { err = errText(x); }
  }
  // печать: отдельное окно с таблицей полей; PDF не создаётся
  function print() {
    const w = window.open('', '_blank'); if (!w) return;
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const rows = fields.map((f) => `<tr><td style="padding:6px 16px 6px 0;color:#555">${esc(label(f))}</td><td><b>${esc(data[f.key])}</b></td></tr>`).join('');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(ht('hOffer'))}</title><body style="font:16px system-ui,sans-serif;padding:40px"><h1>${esc(ht('hOffer'))}</h1><p>${esc(name)} · ${esc(who?.title)}</p><table>${rows}</table>`);
    w.document.close(); w.focus(); w.print();
  }
</script>

<Modal {onclose}>
  <form class="stack" onsubmit={save}>
    <h2>{ht('hOffer')}: {name}</h2>
    {#each fields as f (f.id)}
      <label class="f">{label(f)}{f.required ? ' *' : ''}
        {#if f.type === 'textarea'}<textarea bind:value={data[f.key]} maxlength="2000"></textarea>
        {:else}<input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} bind:value={data[f.key]} required={f.required} />{/if}</label>
    {/each}
    <label class="f">{ht('hStatus')}<select bind:value={status}>{#each ['draft', 'sent', 'accepted', 'declined'] as s}<option value={s}>{hg('hOfferStatus', s)}</option>{/each}</select></label>
    {#if link}<p class="alert ok">{app.lang === 'uz' ? 'Havola nusxalandi' : 'Ссылка скопирована'}: <b>{link}</b></p>{/if}
    {#if err}<p class="alert">{err}</p>{/if}
    <div class="row wrap u-455f8cc"><button type="button" class="btn" onclick={onclose}>{ht('hCancel')}</button><button type="button" class="btn" onclick={print}>{ht('hPrint')}</button><a class="btn" href="/api/hire/pipeline/{pipelineId}/offer.pdf" download>PDF</a><button type="button" class="btn" onclick={makeLink}>{app.lang === 'uz' ? 'Nomzodga havola' : 'Ссылка кандидату'}</button><button class="btn grad">{ht('hSave')}</button></div>
  </form>
</Modal>
