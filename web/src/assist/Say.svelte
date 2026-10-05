<script lang="ts">
  // Фраза клиенту: выбранный язык разговора — главный, второй показывается мелко. Копируется то, что видит оператор.
  import { A, uz as toUz, copy } from './store.svelte';
  import { at } from './i18n';
  let { label, ru = '', uzText = '' }: { label: string; ru?: string | null; uzText?: string | null } = $props();
  const uzShown = $derived(uzText ? toUz(uzText) : '');
  const uzMain = $derived(A.cl === 'uz');
  const mainIsUz = $derived(uzMain && !!uzShown);
</script>

{#if ru || uzShown}
  <div class="say" class:uz={mainIsUz}>
    <span class="who">{label}
      <span class="pill" class:mid={uzMain && !uzShown}>{mainIsUz ? 'UZ' : 'RU'}</span>
      {#if uzMain && !uzShown}<span class="nouz">{at('no_uz')}</span>{/if}
    </span>
    <div class="t">{mainIsUz ? uzShown : (ru || '')}{#if mainIsUz ? uzShown : ru}<button class="cp" onclick={() => copy(mainIsUz ? uzShown : ru!, at('copied'))}>{at('copy')}</button>{/if}</div>
    {#if mainIsUz && ru}<div class="t2"><b>RU:</b> {ru}</div>{/if}
    {#if !mainIsUz && uzShown}<div class="t2"><b>UZ:</b> {uzShown}<button class="cp" onclick={() => copy(uzShown, at('copied'))}>{at('copy')}</button></div>{/if}
  </div>
{/if}
