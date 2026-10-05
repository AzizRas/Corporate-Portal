<script lang="ts">
  import { A, searchIndex } from './store.svelte';
  import { api } from '../lib/api';
  import { at } from './i18n';
  import { fmtTel } from './logic';
  import ModelRes from './ModelRes.svelte';
  import ScCard from './ScCard.svelte';
  import type { Hit } from './search';

  let { q }: { q: string } = $props();
  const res = $derived(searchIndex()!.search(q, { brandId: A.brandId }));

  const GROUPS: { id: string; kinds: Hit['kind'][] }[] = [
    { id: 'g_codes', kinds: ['code', 'zset'] },
    { id: 'g_faults', kinds: ['safe', 'sym', 'app'] },
    { id: 'g_flows', kinds: ['flow', 'close', 'phrase'] },
    { id: 'g_ref', kinds: ['sc', 'shop', 'brand', 'page'] },
  ];
  const grouped = $derived(GROUPS.map((g) => ({ ...g, hits: res.hits.filter((h) => g.kinds.includes(h.kind)) })).filter((g) => g.hits.length));

  // «лучший» результат — для Enter в строке поиска
  export function first(): string | null { return res.hits[0] ? `#/assist/${res.hits[0].to}` : null; }

  // журнал запросов: что искали и сколько нашли (помогает пополнять справочник)
  let timer: any, logged = '';
  $effect(() => {
    const key = q.trim();
    clearTimeout(timer);
    if (key.length < 2 || key === logged) return;
    timer = setTimeout(() => { logged = key; api.post('/api/assist/search-log', { query: key, hits: res.total + (res.model ? 1 : 0) + (res.phone ? 1 : 0) }).catch(() => {}); }, 1400);
    return () => clearTimeout(timer);
  });
  const picked = (h: Hit) => { api.post('/api/assist/search-log', { query: q.trim(), hits: res.total, picked: h.id }).catch(() => {}); A.q = ''; };

  // подсветка слов запроса в заголовке
  const terms = $derived(q.toLowerCase().split(/[\s,;]+/).filter((w) => w.length >= 2));
  function parts(text: string): { t: string; m: boolean }[] {
    if (!terms.length) return [{ t: text, m: false }];
    const re = new RegExp(`(${terms.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
    return text.split(re).map((t, i) => ({ t, m: i % 2 === 1 })).filter((p) => p.t);
  }
  const ico = (h: Hit) => ({ code: '#', zset: 'Z', sym: '⚠', app: '▣', flow: '☎', safe: '!', sc: '⌂', page: '≡', phrase: '❝', close: '✓', shop: '⌘', brand: '◎' } as Record<string, string>)[h.kind];
</script>

<div class="as-crumbs">{at('search')}</div>
<h1 class="as-h1">{res.total || res.model || res.phone ? at('found', { n: res.total }) : at('nothing')}</h1>
<p class="as-sub">{res.total || res.model || res.phone ? at('found_t') : at('nothing_t')}</p>

{#if res.model}<ModelRes raw={q} />{/if}
{#if res.phone}
  <div class="box ok"><b>{at('phone_sc')}:</b> {res.phone.p.n}{res.phone.s ? ` — ${res.phone.s.reg}` : ` — ${res.phone.p.note}`}. {at('phone_sc_t')}</div>
  {#if res.phone.s}<ScCard s={res.phone.s} />{/if}
{/if}
{#if res.codeAsked}
  <div class="box gap"><b>{at('z_absent', { c: res.codeAsked })}</b> {at('z_absent_t')} <a class="cp" href="#/assist/codes/-/{encodeURIComponent(res.codeAsked)}" onclick={() => (A.q = '')}>{at('nav_codes')}</a></div>
{/if}
{#if res.suggest}
  <div class="box">{at('did_you_mean')}: <button class="cp" onclick={() => (A.q = res.suggest!)}>{res.suggest}</button></div>
{/if}

{#each grouped as g}
  <div class="as-lbl5">{at(g.id)}</div>
  <div class="as-res">
    {#each g.hits as h (h.id)}
      <a class="as-r" class:red={h.red} href="#/assist/{h.to}" onclick={() => picked(h)}>
        <span class="ico">{ico(h)}</span>
        <span style="min-width:0">
          <b>{#each parts(h.kind === 'zset' && h.title === 'zcodes' ? at('nav_codes') : h.title) as p}{#if p.m}<mark>{p.t}</mark>{:else}{p.t}{/if}{/each}</b>
          <small>{h.sub ?? ''}{h.kind === 'zset' && h.tag ? ` · ${h.tag}` : ''}</small>
        </span>
        <span class="kind pill {h.tone ?? ''}">{at('k_' + h.kind)}</span>
      </a>
    {/each}
  </div>
{/each}

{#if !res.total && !res.model && !res.phone}
  <div class="box gap">{at('nothing_help')}</div>
  <div class="as-quick">
    <a href="#/assist/safety" onclick={() => (A.q = '')}>{at('rt_start')}</a>
    <a href="#/assist/codes" onclick={() => (A.q = '')}>{at('nav_codes')}</a>
    <a href="#/assist/p/sc" onclick={() => (A.q = '')}>{at('nav_sc')}</a>
  </div>
{/if}
