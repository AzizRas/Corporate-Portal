<script lang="ts">
  // Исход дерева: талон решения + готовая карточка amoCRM, описание, примечание, гарантия
  import { A, brandOf, copy, uz as toUz } from './store.svelte';
  import { at } from './i18n';
  import Code from './Code.svelte';
  import Say from './Say.svelte';
  import ModelRes from './ModelRes.svelte';
  import ScPick from './ScPick.svelte';
  import ShopsTable from './ShopsTable.svelte';
  import Contact from './Contact.svelte';
  import { ASK, closeBy, crmFor, decodeModel, fmtD, genDesc, isService, isoDay, noteText, parseDate, planDate, reasonText, sayKey, today, warrantyByDate, catInfo, type Ctx } from './logic';

  let { o, kind, app, sym, path, node, symId, onRestart, onToApp }: {
    o: any; kind: 'dev' | 'flow' | 'safe'; app: any; sym: any; path: any[]; node: string; symId: string; onRestart: () => void; onToApp: () => void;
  } = $props();

  const D = $derived(A.data!);
  const brand = $derived(brandOf());
  const ctx = $derived<Ctx>({ kind, app, sym, path, brand, extras: A.extras });
  const spec = $derived(crmFor(D, o));
  const svc = $derived(isService(o));
  const sla = $derived(D.SLA[o.p] || null);
  const pc = $derived(o.k === 'safety' ? 'var(--bad)' : o.p === 'P1' ? 'var(--bad)' : o.p === 'P2' ? 'var(--warn)' : o.p === 'P3' ? 'var(--accent)' : o.p === 'P4' ? 'var(--muted)' : o.esc ? 'var(--warn)' : 'var(--accent)');
  const pdate = $derived(parseDate(A.extras.pdate));
  const w = $derived(pdate ? warrantyByDate(D, brand, pdate, app?.id || '') : null);
  const md = $derived(A.extras.model ? decodeModel(D, A.extras.model) : null);
  const cnt = $derived(o.contact || (o.k === 'parts' ? 'parts' : null));

  // описание для amoCRM собирается само, пока оператор не поправил его вручную
  let descDirty = $state(false), descVal = $state('');
  const descAuto = $derived(svc ? genDesc(D, ctx, o) : '');
  $effect(() => { if (!descDirty) descVal = descAuto; });
  let checks: boolean[] = $state(ASK.map(() => false));
  const reqDone = $derived(ASK.every((a, i) => !a.req || checks[i]));
  const devOk = $derived(!!(app ? app.crm || sym?.crm : true) && !!brand.crm);

  // узбекский текст «сказать клиенту»: готовая фраза из справочника или перевод исхода
  const sayUz = $derived(o.uz && D.UZ?.[o.uz] ? D.UZ[o.uz] : D.SAY_UZ?.[sayKey(kind, app?.id ?? null, symId, node)] || '');

  type Part = { t: 'code' | 'text' | 'pill' | 'small'; v: string; cls?: string };
  type Row = { n: string; req?: boolean; parts: Part[] };
  const code = (v: string): Part => ({ t: 'code', v });
  const small = (v: string): Part => ({ t: 'small', v });

  function devParts(): Part[] {
    const symCrm = kind === 'dev' ? sym?.crm : null;
    if (app && symCrm) return [code(symCrm), small(at('one_value'))];
    if (app && app.crm) return [code(app.crm), small(at('one_value')), ...(app.crmAlt ? [small(`${at('or')} «${app.crmAlt.v}» — ${app.crmAlt.when}`)] : [])];
    if (app) return [{ t: 'pill', v: at('no_in_crm'), cls: 'bad' }, small(at('dev_nocrm_t'))];
    if (md?.crm) return [code(md.crm), small(at('by_model', { p: md.prefix || '' }))];
    return [small(at('dev_by_client'))];
  }
  function brandParts(): Part[] {
    return brand.crm ? [code(brand.crm)] : [{ t: 'pill', v: at('brand_off', { n: brand.n }), cls: 'bad' }, small(at('brand_flow'))];
  }
  function warrantyParts(): Part[] {
    if (!w) return [small(at('warr_enter'))];
    if (w.crm) return [code(w.crm), ...(w.end ? [small(`${at('warr_end')}: ${w.end}`)] : [])];
    return [small(w.head)];
  }
  const rows = $derived.by<Row[]>(() => {
    const r: Row[] = [];
    if (spec.service) {
      r.push({ n: 'Тип обращения', parts: [code(spec.obr!)] });
      r.push({ n: 'Тип устройство', req: true, parts: devParts() });
      r.push({ n: 'Бренд', req: true, parts: brandParts() });
      r.push({ n: 'Канал обращения', parts: [code('Телефон'), small('«Телеграм бот» — если заявка из бота')] });
      r.push({ n: 'Источник', parts: [code('Звонок')] });
      r.push({ n: 'Статус гарантии', parts: warrantyParts() });
      r.push({ n: 'Дата регистрации', parts: [code(fmtD(today()))] });
      if (spec.urgent) r.push({ n: 'Тег', parts: [code('срочно')] });
      return r;
    }
    if (spec.obr && spec.obr !== '—') r.push({ n: 'Тип обращения', parts: [code(spec.obr)] });
    if (app?.crm) r.push({ n: 'Тип устройство', parts: [code((kind === 'dev' && sym?.crm) || app.crm), small(at('if_named'))] });
    if (spec.close) {
      const c = closeBy(D, spec.close);
      if (c) { r.push({ n: 'Причина (список при закрытии)', parts: [code(c.lr)] }); r.push({ n: 'Поле «причина отказа»', req: true, parts: [code(reasonText(D, brand, c, o))] }); }
    }
    if (spec.task) { r.push({ n: 'Задача', parts: [code(spec.task.type), small(spec.task.when)] }); r.push({ n: 'Текст задачи', parts: [code(spec.task.text)] }); }
    spec.fields?.forEach((f) => { const lit = !/[—–]|со слов|дословно|что /.test(f[1]); r.push({ n: f[0], parts: lit ? [code(f[1])] : [{ t: 'text', v: f[1] }] }); });
    if (spec.then) r.push({ n: at('after_call'), parts: [{ t: 'text', v: at('after_call_t', { t: o.title }) }] });
    if (spec.urgent) r.push({ n: 'Тег', parts: [code('срочно')] });
    return r;
  });

  const info = $derived(svc ? catInfo(D, brand, D.APPCAT[app?.id || ''] || '') : null);
  const d7 = $derived(planDate(D));
  const urgentUz = $derived(D.UZ.urgent);
  const regUz = $derived(String(D.UZ.reg).replace('___', d7));
</script>

<div class="ticket" style:--pc={pc}>
  <div class="tkhead">
    <span class="badge-k">{at('bd_' + o.k)}</span>
    <h3>{o.title}</h3>
  </div>
  <div class="tkmeta">
    {#if sla}<div><div class="k">{at('priority')}</div><div class="v" style:color={pc}>{sla.n}</div></div>{/if}
    <div><div class="k">{at('stage')}</div><div class="v">{spec.stage}</div></div>
    {#if svc}<div><div class="k">{at('term_client')}</div><div class="v">{spec.urgent ? at('term_urgent') : at('term_plan', { d: d7 })}</div></div>
    {:else if spec.obr && spec.obr !== '—'}<div><div class="k">Тип обращения</div><div class="v">{spec.obr}</div></div>{/if}
  </div>

  <div class="tkbody">
    {#if o.warn}<div class="box warn"><b>{at('attention')}.</b> {o.warn}</div>{/if}
    {#if !brand.crm && kind !== 'flow'}
      <div class="box warn"><b>{at('brand_off', { n: brand.n })}.</b> {at('brand_off_t')} <a class="cp" href="#/assist/flow/brand">{at('rt_brand')}</a></div>
    {/if}

    <div class="as-h5">{at('what_do')}</div>
    <ol class="do nums">{#each o.do as d}<li>{d}</li>{/each}</ol>

    <Say label={at('say_client')} ru={o.say} uzText={sayUz} />
    {#if o.note}<div class="box gap">{o.note}</div>{/if}
    {#if o.show === 'shops'}<ShopsTable />{/if}
    {#if o.show === 'sc'}<ScPick />{/if}
    {#if cnt}<Contact k={cnt} />{/if}

    {#if svc}
      <div class="as-h5">{at('sticker_h')}</div>
      <div class="as-fields">
        <label class="f u-1169661">{at('model_lbl')}<input autocomplete="off" placeholder="7WM4S1070GCS1" bind:value={A.extras.model} /></label>
        <label class="f u-1169661">{at('pdate_lbl')}<input type="date" max={isoDay(today())} bind:value={A.extras.pdate} /></label>
        <label class="f u-1169661">{at('code_lbl')}<input autocomplete="off" placeholder="E21" bind:value={A.extras.code} /></label>
      </div>
      <ModelRes raw={A.extras.model} curApp={app} />
      {#if w}
        <div class="box"><span class="pill {w.cls}">{w.head}</span> {w.text}</div>
        {#if w.say}<Say label={at('say_warr')} ru={w.say} uzText={w.uz} />{/if}
      {/if}

      {#if spec.urgent}
        <Say label={at('confirm')} ru="Передаю заявку как срочную. Пока мастер не приедет, техникой не пользуйтесь." uzText={urgentUz} />
      {:else}
        <Say label={at('confirm')} ru={`Заявку оформил. Она уйдёт в сервисный центр вашего региона, мастер сам позвонит и согласует время. Плановый срок ремонта — до ${d7}.`} uzText={regUz} />
        <div class="box gap"><b>{at('dont_promise')}</b> {at('dont_promise_t', { n: D.PLAN_DAYS })}</div>
      {/if}
    {/if}

    <div class="crmbox">
      <div class="ch"><b>amoCRM</b><span>{at('stage')}: <code>{spec.stage}</code></span>{#if spec.urgent}<span class="pill bad">{at('tag_urgent')}</span>{/if}</div>
      <div class="cb">
        <div class="fl">
          {#each rows as r}
            <div class="fn">{r.n}{#if r.req}<span class="req" title={at('required')}>*</span>{/if}</div>
            <div class="fv">
              {#each r.parts as p}
                {#if p.t === 'code'}<Code v={p.v} />
                {:else if p.t === 'pill'}<span class="pill {p.cls}">{p.v}</span>
                {:else if p.t === 'small'}<small>{p.v}</small>
                {:else}<span>{p.v}</span>{/if}
              {/each}
            </div>
          {/each}
        </div>

        {#if svc}
          <div class="as-lbl5">{at('desc_h')} <span class="u-83ef854">*</span> — {at('desc_t')}</div>
          <textarea class="desc" rows="3" aria-label={at('desc_h')} bind:value={descVal} oninput={() => (descDirty = true)}></textarea>
          <div class="acts">
            <button class="cp u-1169661" onclick={() => copy(descVal, at('desc_copied'))}>{at('desc_copy')}</button>
            <button class="cp u-1169661" onclick={() => { descDirty = false; descVal = descAuto; }}>{at('desc_regen')}</button>
          </div>
          <div class="as-lbl5">{at('ask_h')}</div>
          <ul class="chk">
            {#each ASK as a, i}
              <li><label><input type="checkbox" bind:checked={checks[i]} /><span>{a.n}{#if a.req} <b class="u-83ef854">*</b>{/if}<span class="fmt">{a.f}</span></span></label></li>
            {/each}
          </ul>
          <div class="box" class:ok={reqDone && devOk} class:gap={!(reqDone && devOk)}>
            {#if reqDone && devOk}{at('gate_ok')}{:else}{at('gate_t')}{#if !devOk} {at('gate_dev')}{/if}{/if}
          </div>
        {/if}
        {#if spec.main}
          <div class="as-lbl5">{at('main_deal')}</div>
          <ul class="do">{#each spec.main as x}<li>{x}</li>{/each}</ul>
        {/if}
        {#if spec.urgent}<div class="box warn"><b>{at('urgent')}.</b> {D.ESC.urgent}.</div>{/if}
        {#if spec.esc}<div class="box warn"><b>{at('escalate')}.</b> {D.ESC.complaint}.</div>{/if}
      </div>
    </div>

    {#if svc && info}
      <details class="wcard">
        <summary><b>{at('warr_of', { n: brand.n })}</b> · {info.t}</summary>
        {#if !info.exact}<div class="box gap u-d2c171b">{at('warr_general')}</div>{/if}
        {#if brand.conflict}<div class="box warn u-d2c171b"><b>{at('warr_conflict')}.</b> {at('warr_conflict_t')}</div>{/if}
        <div class="wrow u-d2c171b">
          <div><span class="yes">{at('covers')}</span><ul>{#each info.cov as c}<li>{c}</li>{/each}</ul></div>
          <div><span class="no">{at('not_covers')}</span><ul>{#each info.exc.slice(0, 9) as c}<li>{c}</li>{/each}</ul></div>
        </div>
        <p class="as-hint u-d2c171b">{at('warr_nodecide')}</p>
      </details>
      <details class="wcard">
        <summary><b>{at('sc_addr_h')}</b> · {at('sc_addr_t')}</summary>
        <div class="u-d2c171b"><ScPick label={at('sc_region')} /></div>
      </details>
    {/if}

    <div class="acts">
      <button class="btn primary" onclick={() => copy(noteText(D, ctx, o), at('note_copied'))}>{at('note_copy')}</button>
      <button class="btn" onclick={onRestart}>{at('restart')}</button>
      {#if kind === 'dev'}<button class="btn" onclick={onToApp}>{at('to_symptoms')}</button>{/if}
      <a class="btn" href="#/assist">{at('new_call')}</a>
    </div>
  </div>
</div>
