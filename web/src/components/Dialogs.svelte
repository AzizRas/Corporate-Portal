<script lang="ts">
  import { dlg, closeDialog, dlgText, undoBar, undoText, deletedText } from '../lib/dialog.svelte';
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

<div class="undo-bar" aria-live="polite">
  {#each undoBar.items as u (u.id)}
    <div class="undo-item" role="status"><span>{deletedText()}: {u.text}</span><button type="button" class="btn sm" onclick={u.undo}>{undoText()}</button></div>
  {/each}
</div>

{#if dlg.cur}
  {#key dlg.cur}
    <Modal onclose={cancel}>
      <form class="stack dlg" onsubmit={submit}>
        {#if dlg.cur.title}<h2>{dlg.cur.title}</h2>{/if}
        <p class="dlg-text">{dlg.cur.text}</p>
        {#if dlg.cur.kind === 'prompt'}<!-- svelte-ignore a11y_autofocus --><input bind:value placeholder={dlg.cur.placeholder ?? ''} aria-label={dlg.cur.text} autofocus />{/if}
        <div class="row u-76b9986">
          {#if dlg.cur.kind !== 'alert'}<button type="button" class="btn" onclick={cancel}>{dlgText('cancel')}</button>{/if}
          <!-- svelte-ignore a11y_autofocus -->
          <button class="btn {dlg.cur.danger ? 'danger' : 'grad'}" autofocus={dlg.cur.kind !== 'prompt'}>{okText}</button>
        </div>
      </form>
    </Modal>
  {/key}
{/if}

<style>
  .undo-bar { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(24px + env(safe-area-inset-bottom)); z-index: 60; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
  .undo-item { pointer-events: auto; display: flex; align-items: center; gap: 14px; background: #1d1d1f; color: #f4f4f5; border: 1px solid #34343a; border-radius: 14px; padding: 10px 14px; box-shadow: 0 12px 40px rgba(0,0,0,.35); max-width: calc(100vw - 32px); }
  .undo-item .btn { background: #2a2a2f; border-color: #3a3a41; color: #f4f4f5; }
  @media (max-width: 880px) { .undo-bar { bottom: calc(96px + env(safe-area-inset-bottom)); } }
  .dlg { min-width: min(420px, 80vw); }
  .dlg-text { margin: 0; white-space: pre-line; line-height: 1.5; }
</style>
