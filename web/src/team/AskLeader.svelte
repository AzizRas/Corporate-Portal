<script lang="ts">
  import Icon from '../components/Icon.svelte';
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

<button class="btn" onclick={show}><Icon inline name="chat" /> {pt('a_btn')}</button>

{#if open}
  <Modal onclose={() => (open = false)}>
    <h2>{pt('a_title')}</h2>
    {#if ok}
      <p class="alert ok u-2b583d7">{pt('a_ok')}</p>
      <button class="btn" onclick={() => (open = false)}>{pt('p_close')}</button>
    {:else}
      <div class="tabs u-2b583d7" role="tablist" aria-label={pt('a_kind')}>
        <button type="button" class:on={kind === 'question'} onclick={() => (kind = 'question')}>{pt('a_q')}</button>
        <button type="button" class:on={kind === 'suggestion'} onclick={() => (kind = 'suggestion')}>{pt('a_s')}</button>
      </div>
      <label class="f">{pt('a_text')}<textarea maxlength="2000" placeholder={pt('a_ph')} bind:value={body}></textarea></label>
      <label class="chk u-c81ce4b"><input type="checkbox" bind:checked={anon} /> {pt('a_anon')}</label>
      <p class="muted xs u-ae5dd46">{pt('a_anon_hint')}</p>
      {#if err}<p class="alert u-da12f28">{err}</p>{/if}
      <div class="row wrap"><button class="btn grad" disabled={busy} onclick={send}>{pt('a_send')}</button><button class="btn" onclick={() => (open = false)}>{pt('p_cancel')}</button></div>
    {/if}
  </Modal>
{/if}
