<script lang="ts">
  // Справочники и обучение: CRM, поля, причины закрытия, модель, гарантия, СЦ, магазины, фразы, обучение
  import { A, brandOf, copy } from './store.svelte';
  import { at } from './i18n';
  import { CHECKLIST, CRM_RULES, RED_FLAGS, fieldsTable, refusals } from './content';
  import { PHRASES } from './search';
  import { catInfo, fmtD, fmtTel, isoDay, parseDate, planDate, today, warrantyByDate } from './logic';
  import Code from './Code.svelte';
  import Say from './Say.svelte';
  import ModelRes from './ModelRes.svelte';
  import ScCard from './ScCard.svelte';
  import ScPick from './ScPick.svelte';
  import ShopsTable from './ShopsTable.svelte';
  import { uz as toUz } from './store.svelte';

  let { id }: { id: string } = $props();
  const D = $derived(A.data!);
  const page = $derived(D.PAGES?.[id]);
  const brand = $derived(brandOf());
  const w7 = $derived(D.W7);

  // посчитать гарантию по дате
  const pdate = $derived(parseDate(A.extras.pdate));
  const wres = $derived(pdate ? warrantyByDate(D, brand, pdate, '') : null);

  // первый день: отметки хранятся в этом браузере
  const DKEY = 'assist:day1';
  let done: number[] = $state((() => { try { return JSON.parse(localStorage.getItem(DKEY) || '[]'); } catch { return []; } })());
  function toggleDay(i: number) {
    done = done.includes(i) ? done.filter((x) => x !== i) : [...done, i];
    try { localStorage.setItem(DKEY, JSON.stringify(done)); } catch { /* */ }
  }

  // тренажёр
  let answers: Record<number, number> = $state({});
  const right = $derived(Object.entries(answers).filter(([i, j]) => D.QUIZ[+i].a === j).length);

  const sorted = $derived([...(D.MODELS as any[])].sort((a, b) => a[0].localeCompare(b[0])));
  const cats = $derived(Object.keys(brand.cats || {}));
  const d7 = $derived(planDate(D));
</script>

{#if !page}
  <div class="box gap">{at('not_found')} <a href="#/assist">{at('new_call')}</a></div>
{:else}
  <div class="as-crumbs"><a href="#/assist">{at('new_call')}</a> / {at('nav_ref')} / {page.n}</div>
  <h1 class="as-h1">{page.n}</h1>

  {#if id === 'crm'}
    <p class="as-sub">{at('crm_sub')}</p>
    <div class="stages">
      {#each D.CRM.stages as s, i}
        <span class="s" class:op={s.who === 'op'} class:end={s.n.startsWith('Закрыто')}>{s.n}</span>{#if i < D.CRM.stages.length - 1}<span class="a" aria-hidden="true">→</span>{/if}
      {/each}
    </div>
    <p class="as-hint"><span class="pill" style="background:color-mix(in srgb,var(--accent) 18%,transparent)">■</span> {at('crm_op')} · {at('crm_auto')}</p>
    <div class="tbl"><table>
      <thead><tr><th>{at('crm_stage')}</th><th>{at('crm_who')}</th><th>{at('crm_what')}</th></tr></thead>
      <tbody>{#each D.CRM.stages as s}<tr><td><b>{s.n}</b></td><td>{s.who === 'op' ? at('crm_op_s') : at('crm_auto_s')}</td><td>{s.d}</td></tr>{/each}</tbody>
    </table></div>
    <h2 class="as-h2">{at('crm_tasks')}</h2>
    <ul class="do"><li>{D.CRM.auto.missed}</li><li>{D.CRM.auto.follow} — {at('crm_follow_tr')}</li><li>{D.CRM.auto.hc}</li></ul>
    <h2 class="as-h2">{at('crm_rules')}</h2>
    <ol class="do nums">{#each CRM_RULES as r}<li>{r}</li>{/each}</ol>

  {:else if id === 'fields'}
    <p class="as-sub">{at('fields_sub')}</p>
    <div class="tbl"><table>
      <thead><tr><th>{at('f_field')}</th><th>{at('f_req')}</th><th>{at('f_how')}</th><th>{at('f_ex')}</th></tr></thead>
      <tbody>
        {#each fieldsTable() as r}
          <tr><td><b>{r[0]}</b></td><td>{#if r[1] === '—'}—{:else}<span class="tag">{r[1]}</span>{/if}</td><td>{r[2]}</td><td>{#if r[3] === '—'}—{:else}<code>{r[3]}</code>{/if}</td></tr>
        {/each}
      </tbody>
    </table></div>
    <h2 class="as-h2">{at('f_lists')}</h2>
    <div class="as-cols2">
      <div><div class="as-lbl5">Тип обращения</div><ul class="do">{#each D.CRM.obr as v}<li>{v}</li>{/each}</ul></div>
      <div><div class="as-lbl5">Тип устройство</div><ul class="do">{#each D.CRM.dev as v}<li>{v}</li>{/each}</ul></div>
    </div>

  {:else if id === 'close'}
    <p class="as-sub">{at('close_sub')}</p>
    <div class="tbl"><table>
      <thead><tr><th>{at('cl_when')}</th><th>{at('cl_reason')}</th><th>{at('cl_text')}</th><th>Тип обращения</th></tr></thead>
      <tbody>
        {#each D.CLOSE as c}
          <tr id={c.id}><td>{c.when}</td><td><Code v={c.lr} /></td><td><Code v={c.txt} /></td><td>{#if c.obr === '—'}—{:else}<span class="tag">{c.obr}</span>{/if}</td></tr>
        {/each}
      </tbody>
    </table></div>
    <div class="box warn"><b>{at('cl_dont')}</b> {at('cl_dont_t')}</div>
    <div class="box ok">{at('cl_success')}</div>

  {:else if id === 'model'}
    <p class="as-sub">{at('model_sub')}</p>
    <div style="max-width:520px" class="stack">
      <label class="f" style="margin:0">{at('model_lbl')}<input autocomplete="off" placeholder="7GH4G60EBES2" bind:value={A.extras.model} /></label>
      <ModelRes raw={A.extras.model} />
    </div>
    <div class="tbl"><table>
      <thead><tr><th>{at('m_start')}</th><th>{at('m_crm')}</th><th>{at('m_what')}</th></tr></thead>
      <tbody>
        {#each sorted as m}
          {@const app = (D.DATA as any[]).find((d) => d.id === m[2])}
          <tr><td><code>{m[0]}…</code></td><td>{#if m[1]}<span class="tag">{m[1]}</span>{:else}<span class="pill mid">{at('no_in_crm')}</span>{/if}</td><td>{app?.name ?? ''}{m[3] ? ` — ${m[3]}` : ''}</td></tr>
        {/each}
      </tbody>
    </table></div>

  {:else if id === 'warranty'}
    {#if brand.official}
      <p class="as-sub">{brand.note}</p>
      <div class="wcard">
        <div style="display:flex;gap:12px;align-items:baseline;flex-wrap:wrap"><b style="font-size:20px">7TECH</b><span class="tag">{at('w_term')}</span></div>
        <div class="say" style="margin:10px 0"><span class="who">{at('w_site')}</span><div class="t">«Гарантийный срок 1 год — мы берем на себя все расходы: работу и запчасти». «Бесплатное сервисное обслуживание 2 года — мы покрываем работу специалиста».</div></div>
        <ul class="do" style="margin:0">
          <li>{at('w_r1', { m: w7.full })}</li>
          <li>{at('w_r2', { a: w7.full, b: w7.labor, y: w7.yesMax > w7.full ? at('yes') : at('no') })}</li>
          <li>{at('w_r3', { m: w7.labor })}</li>
        </ul>
      </div>
      <h2 class="as-h2">{at('w_calc')}</h2>
      <div style="max-width:520px" class="stack">
        <label class="f" style="margin:0">{at('pdate_lbl')}<input type="date" max={isoDay(today())} bind:value={A.extras.pdate} /></label>
        {#if wres}
          <div class="box"><span class="pill {wres.cls}">{wres.head}</span> {wres.text}</div>
          {#if wres.say}<Say label={at('say_client')} ru={wres.say} uzText={wres.uz} />{/if}
        {/if}
      </div>
      <h2 class="as-h2">{at('not_covers')}</h2>
      <ul class="do">{#each D.EXC_7TECH as e}<li>{e}</li>{/each}</ul>
      <h2 class="as-h2">{at('w_docs')}</h2>
      <ul class="do">{#each D.DOCS as e}<li>{e}</li>{/each}</ul>
    {:else}
      <p class="as-sub">{brand.note || ''}</p>
      {#if !brand.crm}<div class="box warn"><b>{at('brand_off', { n: brand.n })}.</b> {at('w_other_line')}</div>{/if}
      <div class="wcard"><b>{at('w_base')}:</b> <span class="tag">{brand.base}</span></div>
      {#if brand.conflict}<div class="box warn"><b>{at('warr_conflict')}.</b><ul>{#each brand.conflict as c}<li>{c}</li>{/each}</ul>{at('warr_conflict_t')}</div>{/if}
      {#if cats.length}
        <div class="tbl"><table>
          <thead><tr><th>{at('w_cat')}</th><th>{at('w_period')}</th><th>{at('covers')}</th><th>{at('not_covers')}</th></tr></thead>
          <tbody>{#each cats as k}{@const c = brand.cats[k]}
            <tr><td><b>{D.CATNAMES[k]}</b></td><td><span class="tag">{c.t}</span></td><td>{(c.cov || []).join('; ') || 'Заводской брак'}</td><td>{(c.exc || []).join('; ') || '—'}</td></tr>
          {/each}</tbody>
        </table></div>
      {:else}<div class="box gap">{at('w_nocat')}</div>{/if}
      {#if brand.internal}<h2 class="as-h2">{at('w_internal')}</h2><ul class="do">{#each brand.internal as t}<li>{t}</li>{/each}</ul>{/if}
    {/if}
    <h2 class="as-h2">{at('w_all')}</h2>
    <p class="as-hint">{at('w_all_t')}</p>
    <div class="tbl"><table>
      <thead><tr><th>{at('w_brand')}</th><th>{at('w_line')}</th><th>{at('w_base')}</th><th>{at('w_special')}</th></tr></thead>
      <tbody>{#each D.BRANDS as b}
        <tr id={b.id}><td><b>{b.n}</b></td><td>{#if b.crm}<span class="pill good">{at('w_this_line')}</span>{:else}{at('w_other')}{/if}</td><td><span class="tag">{b.base}</span></td><td>{b.note || ''}</td></tr>
      {/each}</tbody>
    </table></div>

  {:else if id === 'exc'}
    <p class="as-sub">{at('exc_sub')}</p>
    <h2 class="as-h2">{at('exc_7')}</h2><ul class="do">{#each D.EXC_7TECH as e}<li>{e}</li>{/each}</ul>
    <h2 class="as-h2">{at('exc_all')}</h2><ul class="do">{#each D.UNIVERSAL_EXC as e}<li>{e}</li>{/each}</ul>
    <h2 class="as-h2">{at('exc_flags')}</h2><ul class="do">{#each RED_FLAGS as e}<li>{e}</li>{/each}</ul>

  {:else if id === 'check'}
    <p class="as-sub">{at('check_sub')}</p>
    <ol class="do nums">{#each CHECKLIST as c}<li>{c}</li>{/each}</ol>
    <h2 class="as-h2">{at('w_docs')}</h2>
    <ul class="do">{#each D.DOCS as e}<li>{e}</li>{/each}</ul>

  {:else if id === 'refusal'}
    <p class="as-sub">{at('ref_sub')}</p>
    {#each refusals() as r}<Say label={r[0]} ru={r[1]} uzText={r[2] ? D.UZ[r[2]] : ''} />{/each}
    <div class="box warn"><b>{at('ref_forbid')}</b> {at('ref_forbid_t')}</div>

  {:else if id === 'sc'}
    <p class="as-sub">{at('sc_sub')}</p>
    <ScPick />
    <h2 class="as-h2">{at('sc_all')}</h2>
    <div class="scgrid">{#each D.SC as s}<ScCard {s} />{/each}</div>
    <p class="as-hint">{at('sc_more')}: {#each D.SC_EXTRA as x, i}{i ? '; ' : ''}{x.n} — <b>{fmtTel(x.tel)}</b> ({x.note}){/each}.</p>
    <p class="as-hint">{at('sc_src')}</p>

  {:else if id === 'shops'}
    <p class="as-sub">{at('shops_sub')}</p>
    <ShopsTable />
    <h2 class="as-h2">{at('shops_service')}</h2>
    <div class="tbl"><table style="min-width:0"><tbody>
      <tr><td>{at('hotline')}</td><td><b>{D.CRM.hotline}</b><button class="cp" onclick={() => copy(D.CRM.hotline, at('copied'))}>{at('copy')}</button></td></tr>
      <tr><td>{at('hours')}</td><td>{D.CRM.hours}</td></tr>
      <tr><td>{at('s_addr')}</td><td>{D.SUPPORT.addr}</td></tr>
      <tr><td>{at('s_mail')}</td><td>{D.SUPPORT.mail}<button class="cp" onclick={() => copy(D.SUPPORT.mail, at('copied'))}>{at('copy')}</button></td></tr>
      <tr><td>{at('s_site')}</td><td>{D.SUPPORT.site}</td></tr>
    </tbody></table></div>

  {:else if id === 'scripts'}
    <p class="as-sub">{at('scripts_sub')}</p>
    <div class="tbl"><table>
      <thead><tr><th>{at('sc_moment')}</th><th>{at('lang_ru')}</th><th>{A.script === 'cyr' ? 'Ўзбекча (кирилл)' : 'O‘zbekcha (lotin)'}</th></tr></thead>
      <tbody>
        {#each PHRASES as p}
          {@const ru = p.ru.replace('{date}', d7)}
          {@const u = String(D.UZ[p.uz] || '').replace('___', p.id === 'reg' ? d7 : '___')}
          <tr id={p.id}><td><b>{at('ph_' + p.id)}</b></td><td>{ru}<button class="cp" onclick={() => copy(ru, at('copied'))}>{at('copy')}</button></td>
            <td>{toUz(u)}<button class="cp" onclick={() => copy(toUz(u), at('copied'))}>{at('copy')}</button></td></tr>
        {/each}
      </tbody>
    </table></div>

  {:else if id === 'day1'}
    <p class="as-sub">{at('day1_sub', { n: D.DAY1.length })}</p>
    <ul class="chk">
      {#each D.DAY1 as t, i}<li><label><input type="checkbox" checked={done.includes(i)} onchange={() => toggleDay(i)} /><span>{t}</span></label></li>{/each}
    </ul>
    <p class="as-h2">{done.length === D.DAY1.length ? at('day1_done') : at('day1_prog', { a: done.length, b: D.DAY1.length })}</p>
    <div class="box ok">{at('day1_rule')}</div>

  {:else if id === 'errors'}
    <p class="as-sub">{at('errors_sub')}</p>
    <div class="tbl"><table>
      <thead><tr><th>{at('er_err')}</th><th>{at('er_n')}</th><th>{at('er_ok')}</th></tr></thead>
      <tbody>{#each D.ERRORS as r}<tr><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>{/each}</tbody>
    </table></div>

  {:else if id === 'quiz'}
    <p class="as-sub">{at('quiz_sub', { n: D.QUIZ.length })}</p>
    <p class="as-h2">{at('quiz_score', { a: right, b: D.QUIZ.length })}</p>
    {#each D.QUIZ as x, i}
      <div class="qz">
        <div class="qn">{at('quiz_sit')} {i + 1}</div><div class="qt">{x.q}</div>
        <div class="qo">
          {#each x.o as o, j}
            <button class:right={answers[i] !== undefined && j === x.a} class:wrong={answers[i] === j && j !== x.a} disabled={answers[i] !== undefined} onclick={() => (answers[i] = j)}>{o}</button>
          {/each}
        </div>
        {#if answers[i] !== undefined}<div class="box" class:ok={answers[i] === x.a} class:warn={answers[i] !== x.a}><b>{answers[i] === x.a ? at('quiz_ok') : at('quiz_no')}</b> {x.e}</div>{/if}
      </div>
    {/each}
    <div><button class="btn" onclick={() => (answers = {})}>{at('quiz_again')}</button></div>
  {/if}
{/if}
