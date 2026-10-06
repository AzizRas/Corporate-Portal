<script lang="ts">
  import { api } from '../lib/api';
  import { pt } from './p18n';
  import Modal from '../components/Modal.svelte';

  let open = $state(false), kind = $state<'question' | 'suggestion'>('question'), body = $state(''), anon = $state(false);
  let busy = $state(false), err = $state(''), ok = $state(false);
  function show() { open = true; body = ''; anon = false; kind = 'question'; err = ''; ok = false; busy = false; }
  async function send() {
    if (body.trim().length < 3) { err = pt('a_short'); return; }
    busy = true; err = '';
    try { await api.post('/api/questions', { body: body.trim(), anonymous: anon, kind }); ok = true; }
    catch { err = pt('a_err'); } finally { busy = false; }
  }
</script>

<button class="btn" onclick={show}>💬 {pt('a_btn')}</button>

{#if open}
  <Modal onclose={() => (open = false)}>
    <h2>{pt('a_title')}</h2>
    {#if ok}
      <p class="alert ok" style="margin-bottom:14px">{pt('a_ok')}</p>
      <button class="btn" onclick={() => (open = false)}>{pt('p_close')}</button>
    {:else}
      <div class="tabs" style="margin-bottom:14px" role="tablist" aria-label={pt('a_kind')}>
        <button type="button" class:on={kind === 'question'} onclick={() => (kind = 'question')}>{pt('a_q')}</button>
        <button type="button" class:on={kind === 'suggestion'} onclick={() => (kind = 'suggestion')}>{pt('a_s')}</button>
      </div>
      <label class="f">{pt('a_text')}<textarea maxlength="2000" placeholder={pt('a_ph')} bind:value={body}></textarea></label>
      <label class="chk" style="margin-bottom:4px"><input type="checkbox" bind:checked={anon} /> {pt('a_anon')}</label>
      <p class="muted xs" style="margin:0 0 14px 28px">{pt('a_anon_hint')}</p>
      {#if err}<p class="alert" style="margin-bottom:12px">{err}</p>{/if}
      <div class="row wrap"><button class="btn grad" disabled={busy} onclick={send}>{pt('a_send')}</button><button class="btn" onclick={() => (open = false)}>{pt('p_cancel')}</button></div>
    {/if}
  </Modal>
{/if}
