<script lang="ts">
  // Что значит модель с наклейки: тип техники и значение поля «Тип устройство» в amoCRM
  import { A, searchIndex } from './store.svelte';
  import { at } from './i18n';
  import { decodeModel } from './logic';
  let { raw, curApp = null }: { raw: string; curApp?: any } = $props();
  const D = $derived(A.data!);
  const md = $derived(raw.trim() ? decodeModel(D, raw) : null);
  const zt = $derived(raw.trim() && !md ? searchIndex()!.codes.detect(raw) : []);
  const app = $derived(md?.app ? (D.DATA as any[]).find((d) => d.id === md.app) : null);
  const wrong = $derived(!!(curApp && md?.app && curApp.id !== md.app));
</script>

{#if raw.trim()}
  <div class="box" style="display:flex;flex-direction:column;gap:6px">
    {#if !md}
      {#if zt.length}
        <div><span class="pill mid">Ziffler</span> {at('mr_ziffler', { t: searchIndex()!.codes.byId(zt[0]).title })}
          <a class="cp" href="#/assist/flow/brand">{at('rt_brand')}</a>
          <a class="cp" href="#/assist/codes/{zt.length === 1 ? zt[0] : ''}">{at('nav_codes')}</a></div>
      {:else}
        <div><span class="pill mid">{at('mr_model')}</span> {at('mr_not7')}</div>
      {/if}
    {:else if !md.prefix}
      <div><span class="pill mid">{md.model}</span> {at('mr_unknown')}</div>
    {:else}
      <div>
        <span class="pill {wrong ? 'bad' : 'good'}">{md.prefix}…</span>
        {#if md.crm}{at('mr_type')}: <code>{md.crm}</code>{:else}{md.note} — {at('mr_nocrm')}{/if}{#if md.crm && md.note} · {md.note}{/if}
        {#if wrong}<b style="color:var(--bad)">{at('mr_wrong', { n: curApp.name })}</b>{/if}
        {#if (!curApp || wrong) && app}<a class="cp" href="#/assist/app/{app.id}">{at('mr_open', { n: app.name })}</a>{/if}
      </div>
    {/if}
  </div>
{/if}
