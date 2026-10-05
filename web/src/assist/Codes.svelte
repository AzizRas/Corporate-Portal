<script lang="ts">
  import { A, searchIndex } from './store.svelte';
  import { at } from './i18n';
  import { zNorm } from './codes';
  import { ZTYPE } from './content';
  import Say from './Say.svelte';
  import CodeCard from './CodeCard.svelte';

  let { tid = '', code = '', model = '' }: { tid?: string; code?: string; model?: string } = $props();
  const D = $derived(A.data!);
  const eng = $derived(searchIndex()!.codes);

  // переход по ссылке (из поиска или карточки) задаёт таблицу, код и модель
  let last = '';
  $effect(() => {
    const k = `${tid}|${code}|${model}`;
    if (k === last) return;
    last = k;
    if (tid || code || model) { A.z.t = eng.byId(tid) ? tid : ''; A.z.c = code; if (model) A.z.m = model; }
  });

  const m = $derived(A.z.m.trim());
  const tids = $derived.by(() => {
    if (A.z.t) { const t = eng.byId(A.z.t); return t ? [t.id, ...(t.dual ? [t.dual] : [])] : []; }
    return m ? eng.detect(m) : [];
  });
  const c = $derived(A.z.c.trim());
  const found = $derived(c ? eng.find(tids, c) : { exact: [], near: [] });
  const foundAll = $derived(c && tids.length ? eng.find([], c) : { exact: [], near: [] });
  const sameTable = $derived(new Set(found.exact.map((x) => x.t.id)).size === 1);
  const plural = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'код' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'кода' : 'кодов'; };
  const pick = (t: any, e: any) => { A.z.t = t.id; A.z.c = e.c; window.scrollTo({ top: 0, behavior: 'smooth' }); };
</script>

<div class="as-crumbs"><a href="#/assist">{at('new_call')}</a> / {at('nav_codes')}</div>
<h1 class="as-h1">{at('nav_codes')}</h1>
<p class="as-sub">{at('codes_sub', { n: eng.count, m: D.ZTAB.length })}</p>
<Say label={at('ask_label')} ru={at('codes_ask')} uzText="Iltimos, ekranda qanday kod chiqyapti — harfma-harf ayting. Modelini yorliqdan o‘qib bering: konditsionerda ichki blokning yon tomonida, kir yuvish mashinasida orqa tomonida." />

<div class="as-fields" style="max-width:760px">
  <label class="f" style="margin:0">{at('z_model')}<input autocomplete="off" placeholder="BAC-M12AW · Monoca · T80-P12INW" value={A.z.m} oninput={(e) => { A.z.m = e.currentTarget.value; A.z.t = ''; }} /></label>
  <label class="f" style="margin:0">{at('z_code')}<input autocomplete="off" placeholder="E6 · P1 · d3 · CL" bind:value={A.z.c} /></label>
</div>

<div class="box" style="display:flex;flex-direction:column;gap:6px;empty-cells:hide" class:ok={false}>
  {#if A.z.t}
    <div><span class="pill good">{at('z_chosen')}</span> {eng.byId(A.z.t)?.title} <button class="cp" onclick={() => (A.z.t = '')}>{at('z_reset')}</button></div>
  {:else if m}
    {#if /^\s*7/.test(m)}<div><span class="pill bad">7TECH</span> {at('z_is7')}</div>
    {:else if tids.length}<div><span class="pill good">Ziffler</span> {tids.map((id) => eng.byId(id).title).join(' · ')}</div>
    {:else}<div><span class="pill mid">{at('z_notfound')}</span> {at('z_notfound_t')}</div>{/if}
  {:else}
    <div class="as-hint">{at('z_none')}</div>
  {/if}
  {#if tids.includes('wmT1A') && tids.includes('wmT')}<div class="box gap"><b>{at('z_t1_h')}</b> {at('z_t1_t')}</div>{/if}
</div>

<details class="wcard" open={!A.z.t && !m}>
  <summary><b>{at('z_series')}</b></summary>
  {#each ['ac', 'wm'] as g}
    <div class="as-lbl5" style="margin-top:12px">{ZTYPE[g]}</div>
    <div class="zchips" style="margin-top:6px">
      {#each D.ZTAB.filter((t: any) => t.type === g) as t}
        <button class="zchip" class:on={A.z.t === t.id} onclick={() => { A.z.t = A.z.t === t.id ? '' : t.id; }}>
          <b>{t.short}</b><small>{t.years ? `${t.years} · ` : ''}{t.codes.length} {plural(t.codes.length)}</small>
        </button>
      {/each}
    </div>
  {/each}
  <p class="as-hint" style="margin-top:12px">{at('z_nodisplay')}</p>
</details>

{#if !c}
  {#if tids.length}
    {#each tids as id}
      {@const t = eng.byId(id)}
      <h2 class="as-h2">{t.title}</h2>
      <p class="as-hint">{t.kind}.{t.models.length ? ` ${at('models')}: ${t.models.join(', ')}.` : ''} {at('source')}: {t.src}.</p>
      {#if t.foot}<div class="box gap">{t.foot}</div>{/if}
      <div class="zlist">{#each t.codes as e}<CodeCard {t} {e} compact onpick={() => pick(t, e)} />{/each}</div>
    {/each}
  {:else}<p class="as-hint">{at('z_enter')}</p>{/if}
{:else}
  {@const C = c.toUpperCase()}
  {#if found.exact.length}
    {#if !tids.length && found.exact.length > 1}
      <div class="box gap"><b>{at('z_multi', { c: C })}</b> {at('z_multi_t')}</div>
      <div class="zlist">{#each found.exact as x}<CodeCard t={x.t} e={x.e} compact onpick={() => pick(x.t, x.e)} />{/each}</div>
    {:else}
      {#if found.exact.length > 1 && sameTable}<div class="box gap"><b>{at('z_same', { c: C })}</b> {at('z_same_t')}</div>{/if}
      {#each found.exact as x}<CodeCard t={x.t} e={x.e} />{/each}
    {/if}
  {:else if tids.length}
    <div class="box gap"><b>{at('z_absent_series', { c: C })}</b> {at('z_absent_t')}</div>
    {#if foundAll.exact.length}
      <div class="as-lbl5">{at('z_other')}</div>
      <div class="zlist">{#each foundAll.exact as x}<CodeCard t={x.t} e={x.e} compact onpick={() => pick(x.t, x.e)} />{/each}</div>
    {/if}
  {:else}
    <div class="box gap"><b>{at('z_absent', { c: C })}</b> {at('z_absent_t')}</div>
  {/if}
  {#if found.near.length}
    <div class="as-lbl5">{at('z_near')}</div>
    <div class="zlist">{#each found.near as x}<CodeCard t={x.t} e={x.e} compact onpick={() => pick(x.t, x.e)} />{/each}</div>
  {/if}
{/if}
