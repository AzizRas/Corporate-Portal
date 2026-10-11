<script lang="ts">
  import { dlg, closeDialog, dlgText } from '../lib/dialog.svelte';
  import Modal from './Modal.svelte';

  let value = $state('');
  // при открытии окна ввода подставляем начальное значение
  $effect(() => { value = dlg.cur?.kind === 'prompt' ? (dlg.cur.value ?? '') : ''; });
  const cancel = () => closeDialog(dlg.cur?.kind === 'confirm' ? false : dlg.cur?.kind === 'prompt' ? null : undefined);
  const okText = $derived(dlg.cur?.ok ?? (dlg.cur?.danger ? dlgText('delete') : dlg.cur?.kind === 'alert' ? dlgText('ok') : dlgText('confirm')));
  function submit(e: Event) {
    e.preventDefault();
    if (!dlg.cur) return;
    closeDialog(dlg.cur.kind === 'confirm' ? true : dlg.cur.kind === 'prompt' ? (value.trim() ? value.trim() : null) : undefined);
  }
</script>

{#if dlg.cur}
  {#key dlg.cur}
    <Modal onclose={cancel}>
      <form class="stack dlg" onsubmit={submit}>
        {#if dlg.cur.title}<h2>{dlg.cur.title}</h2>{/if}
        <p class="dlg-text">{dlg.cur.text}</p>
        {#if dlg.cur.kind === 'prompt'}<!-- svelte-ignore a11y_autofocus --><input bind:value placeholder={dlg.cur.placeholder ?? ''} aria-label={dlg.cur.text} autofocus />{/if}
        <div class="row" style="justify-content:flex-end;gap:8px">
          {#if dlg.cur.kind !== 'alert'}<button type="button" class="btn" onclick={cancel}>{dlgText('cancel')}</button>{/if}
          <!-- svelte-ignore a11y_autofocus -->
          <button class="btn {dlg.cur.danger ? 'danger' : 'grad'}" autofocus={dlg.cur.kind !== 'prompt'}>{okText}</button>
        </div>
      </form>
    </Modal>
  {/key}
{/if}

<style>
  .dlg { min-width: min(420px, 80vw); }
  .dlg-text { margin: 0; white-space: pre-line; line-height: 1.5; }
</style>
