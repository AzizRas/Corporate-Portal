<script lang="ts">
  import { A, copy } from './store.svelte';
  import { at } from './i18n';
  import { ZKIND, lc1 } from './codes';
  import { closeBy, fmtD, pad2 } from './logic';
  import Code from './Code.svelte';
  import Say from './Say.svelte';

  let { t, e, compact = false, onpick }: { t: any; e: any; compact?: boolean; onpick?: () => void } = $props();
  const D = $derived(A.data!);
  const tip = $derived(D.ZTIPS[e.t]);
  const kind = $derived(ZKIND[tip.k] ?? { cls: 'mid' });
  const code = $derived(e.show || e.c);

  const ru = (n: number) => { const a = n % 10, b = n % 100; return a >= 2 && a <= 4 && !(b >= 12 && b <= 14) ? 'раза' : 'раз'; };
  const mig = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? 'мигание' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'мигания' : 'миганий'; };
  const blink = $derived.by(() => {
    if (!e.b) return '';
    if (e.b.includes('|')) { const [n, tm] = e.b.split('|'); return at('bl_work', { n, r: ru(+n), tm }); }
    const ns = e.b.split(/,\s*/);
    return at('bl_board', { ns: ns.join(` ${at('or')} `), m: mig(+ns[ns.length - 1]) });
  });
  const who = $derived(() => { const m = A.z.m.trim(); return m && !/^\s*7/.test(m) ? m.toUpperCase() : t.short; });

  const easy = $derived(tip.k === 'info' || tip.k === 'wait');
  const short = $derived(`Ziffler ${who()}, код ${code} — ${lc1(e.n)}`);
  const okC = $derived(closeBy(D, easy ? 'consult' : 'solved'));
  const br = $derived(closeBy(D, 'brand'));
  const outs = $derived.by(() => {
    const ok = { title: easy ? at('zo_easy') : at('zo_helped'), c: okC, txt: String(okC.txt).replace('…', short) };
    const ms = { title: at('zo_master'), c: br, txt: String(br.txt).replace('…', 'Ziffler') };
    return tip.k === 'master' || tip.k === 'urgent' ? [ms, ok] : [ok, ms];
  });
  function note() {
    const now = new Date(), m = A.z.m.trim();
    return [`[Darian·Assist] ${fmtD(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
      `Бренд: Ziffler${m && !/^\s*7/.test(m) ? `. Модель: ${m.toUpperCase()}` : ''}. Таблица кодов: ${t.title}`,
      `Код ошибки: ${code}${blink ? ` (${blink})` : ''}`,
      `Значение по таблице производителя: ${e.n}`,
      `Совет клиенту: ${tip.ru}`,
      `Дальше: ${tip.next}`].join('\n');
  }
</script>

{#if compact}
  <button class="zrow" onclick={onpick}>
    <span class="zcode">{code}</span>
    <span class="zrn">{e.n}<small>{t.short}{blink ? ` · ${blink}` : ''}</small></span>
    <span class="pill {kind.cls}">{at('zk_' + tip.k)}</span>
  </button>
{:else}
  <article class="zcard z-{tip.k}">
    <div class="zh"><span class="zbig">{code}</span>{#if blink}<span class="zbl">{blink}</span>{/if}<span class="pill {kind.cls}">{at('zk_' + tip.k)}</span></div>
    <p class="zsrc">{t.title}{t.years ? ` · ${t.years}` : ''}</p>
    <p class="zn">{e.n}</p>
    {#if e.h}<div class="box gap">{e.h}</div>{/if}
    {#if e.note}<div class="box gap">{e.note}</div>{/if}
    {#if tip.safe}
      <div class="box {tip.k === 'urgent' ? 'warn' : 'gap'}"><b>{tip.k === 'urgent' ? at('safety_first') : at('safety')}.</b>
        {tip.safe === 'water' ? at('z_water') : at('z_smoke')} — <a class="cp" href="#/assist/safe/{tip.safe}">{D.SAFE[tip.safe].title}</a></div>
    {/if}
    <Say label={at('say_client')} ru={tip.ru} uzText={tip.uz} />
    <div class="box ok"><b>{at('next')}.</b> {tip.next}</div>
    <div class="as-lbl5">{at('z_close')}</div>
    <div class="zouts">
      {#each outs as o}
        <div class="zout"><b>{o.title}</b>
          <div class="fl">
            <div class="fn">Тип обращения</div><div class="fv"><Code v={o.c.obr} /></div>
            <div class="fn">Причина (список при закрытии)</div><div class="fv"><Code v={o.c.lr} /></div>
            <div class="fn">Поле «причина отказа»<span class="req">*</span></div><div class="fv"><Code v={o.txt} /></div>
          </div></div>
      {/each}
    </div>
    <div class="acts"><button class="btn primary" onclick={() => copy(note(), at('note_copied'))}>{at('note_copy')}</button></div>
    <details class="wcard"><summary>{at('z_master_text')}</summary><div class="zm" lang={t.lang}>{e.m}</div><p class="as-hint">{at('source')}: {t.src}.</p></details>
  </article>
{/if}
