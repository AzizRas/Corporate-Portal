<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app, go } from '../lib/state.svelte';
  import { navGroups, hubLabel } from '../lib/nav';
  import { hubOfItem } from '../lib/nav-core';
  import { st } from '../lib/s18n';
  import { wt } from '../lib/w18n';
  import { portal } from '../lib/portal';
  import Icon from './Icon.svelte';
  import { HELP } from '../lib/help-content';
  import { pointAt } from '../lib/tour.svelte';
  import Avatar from './Avatar.svelte';
  import AiFeedback from './AiFeedback.svelte';

  let open = $state(false), q = $state(''), sel = $state(0), res: any = $state(null), busy = $state(false);
  let asking = $state(false), helpHit: any = $state(null), ans: any = $state(null), input: HTMLInputElement | undefined = $state();
  let seq = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const lang = $derived(app.lang);
  const tr = (r: any, k: string) => (lang === 'uz' && r[`${k}_uz`]) || r[`${k}_ru`];

  function show() { open = true; q = ''; res = null; ans = null; sel = 0; setTimeout(() => input?.focus(), 30); }
  function hide() { open = false; clearTimeout(timer); }

  // поиск с задержкой; устаревшие ответы отбрасываем
  $effect(() => {
    const text = q.trim();
    ans = null; helpHit = null; sel = 0; clearTimeout(timer);
    if (text.length < 2) { res = null; busy = false; return; }
    busy = true;
    const my = ++seq;
    timer = setTimeout(async () => {
      try { const r = await api.get('/api/search?q=' + encodeURIComponent(text)); if (my === seq) res = r; } catch { if (my === seq) res = null; }
      // вопрос вида «как …?» — сначала показываем инструкцию из справки с подсветкой нужной кнопки
      if (my === seq && /^(как|где|что делать|куда|qanday|qayerda|nima qilish|qayerga)(?=\s|$)/i.test(text)) {
        try { const h = await api.post('/api/help/ask', { query: text }); if (my === seq) helpHit = h.topic ? { help: h } : null; } catch { /* без подсказки */ }
      }
      if (my === seq) busy = false;
    }, 220);
  });

  type Row = { key: string; group: string; label: string; sub?: string; href?: string; person?: any };
  const rows = $derived.by<Row[]>(() => {
    const text = q.trim().toLowerCase();
    if (text.length < 2) return [];
    const out: Row[] = [];
    for (const g of navGroups(0)) for (const i of g.items) if (i.label.toLowerCase().includes(text)) out.push({ key: `s${i.id}`, group: wt('sr_sections'), label: i.label, sub: hubLabel(hubOfItem(i.id) ?? g.id), href: i.href });
    if (res) {
      for (const a of res.kb) out.push({ key: `k${a.id}`, group: wt('sr_kb'), label: tr(a, 'title'), sub: (lang === 'uz' && a.snippet_uz ? a.snippet_uz : a.snippet_ru)?.slice(0, 90), href: `/kb/${a.id}` });
      for (const x of res.tests) out.push({ key: `t${x.slug}`, group: wt('sr_tests'), label: tr(x, 'title'), href: `/tests/${x.slug}` });
      for (const b of res.library) out.push({ key: `l${b.id}`, group: wt('sr_library'), label: b.title, sub: b.author, href: '/library' });
      for (const c of res.candidates ?? []) out.push({ key: `a${c.id}`, group: wt('sr_cands'), label: `${c.last_name ?? ''} ${c.first_name}`.trim(), sub: c.position, href: `/hire/a/${c.id}` });
      for (const p of res.people) out.push({ key: `p${p.id}`, group: wt('sr_people'), label: p.name, sub: p.position, person: p });
      for (const c of res.chats.channels) out.push({ key: `c${c.id}`, group: wt('sr_chats'), label: tr(c, 'name'), href: `/chat/${encodeURIComponent(c.id)}` });
      for (const m of res.chats.messages) out.push({ key: `m${m.id}`, group: wt('sr_chats'), label: m.snippet, sub: `${m.author} · ${wt('sr_msg_in')} ${m.channel === 'general' ? st('c_channels') : m.channel.replace('dept:', '')}`, href: `/chat/${encodeURIComponent(m.channel)}` });
    }
    return out;
  });
  let personOpen: any = $state(null);

  function pick(r: Row) {
    if (r.person) { personOpen = personOpen?.id === r.person.id ? null : r.person; return; }
    if (r.href) { hide(); go(r.href); }
  }
  function showHelp(t: any) {
    const targets = t.target ? [t.target, 'tab-' + t.target.replace(/^nav-/, ''), 'tab-more'] : [];
    hide(); go(t.route);
    setTimeout(() => pointAt(targets, t.title[app.lang], (HELP[t.id]?.[app.lang] ?? HELP[t.id]?.ru ?? [])[0] ?? '', t.group), 450);
  }
  async function ask() {
    const text = q.trim();
    if (text.length < 3 || asking) return;
    asking = true; ans = null;
    try {
      // сначала «как это сделать в портале»: подсказка со шагами и подсветкой кнопки; если такой темы нет — ответ по базе знаний
      const h = await api.post('/api/help/ask', { query: text });
      if (h.topic) { ans = { help: h }; return; }
      ans = await api.post('/api/search/ask', { query: text });
    }
    catch (e) { ans = { found: false, error: e instanceof ApiError ? e.code : 'error' }; }
    finally { asking = false; }
  }
  function key(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open ? hide() : show(); return; }
    if (!open) return;
    if (e.key === 'Escape') hide();
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, rows.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[sel]) pick(rows[sel]); else if (!busy) ask(); }
  }
  const qhash = (s: string) => { try { return btoa(unescape(encodeURIComponent(s.trim().toLowerCase()))).replace(/[^A-Za-z0-9]/g, '').slice(0, 24); } catch { return 'q'; } };
  const empty = $derived(q.trim().length >= 2 && !busy && res && rows.length === 0);
</script>

<svelte:window onkeydown={key} />

<button class="srch-btn" aria-label={wt('sr_open')} title="{wt('sr_open')} (Ctrl+K)" onclick={show}><i><Icon name="search" /></i></button>

{#snippet helpCard(h: any)}
  {@const t = h.topic}
  {#if h.answer}<p class="small">{h.ai ? '✨ ' : ''}{h.answer}</p>{/if}
  <b>{t.title[app.lang]}</b>
  <ol style="margin:6px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:4px;font-size:14px">{#each (HELP[t.id]?.[app.lang] ?? HELP[t.id]?.ru ?? []) as step}<li>{step}</li>{/each}</ol>
  <div class="row wrap" style="gap:8px;margin-top:10px">
    <button class="btn grad sm" onclick={() => showHelp(t)}>{wt('hp_show')}</button>
    <a class="btn sm" href={'#' + t.route} onclick={hide}>{wt('hp_where')}</a>
  </div>
{/snippet}

{#if open}
  <div use:portal class="sr-layer">
    <div class="sr-back" role="presentation" onclick={hide}></div>
    <div class="sr-box card" role="dialog" aria-label={wt('sr_open')}>
      <div class="sr-in">
        <i><Icon name="search" /></i>
        <input bind:this={input} bind:value={q} placeholder={wt('sr_ph')} autocomplete="off" aria-label={wt('sr_open')} />
        {#if busy}<span class="spin"></span>{/if}
        <button class="sr-x" aria-label={st('c_cancel')} onclick={hide}><Icon name="close" /></button>
      </div>
      <div class="sr-list">
        {#if helpHit}<div class="sr-ans" style="margin-top:0">{@render helpCard(helpHit.help)}</div>{/if}
        {#each rows as r, i (r.key)}
          {#if i === 0 || rows[i - 1].group !== r.group}<div class="sr-group">{r.group}</div>{/if}
          <button class="sr-row" class:on={i === sel} onmouseenter={() => (sel = i)} onclick={() => pick(r)}>
            {#if r.person}<Avatar u={{ ...r.person, bday: false }} size={32} />{/if}
            <span style="min-width:0"><b class="clip1" style="max-width:100%">{r.label}</b>{#if r.sub}<span class="muted xs clip1" style="display:block;max-width:100%">{r.sub}</span>{/if}</span>
          </button>
          {#if r.person && personOpen?.id === r.person.id}
            <div class="sr-person"><b>{r.person.name}</b><div class="muted small">{r.person.position}</div>{#if r.person.status}<div class="small">«{r.person.status}»</div>{/if}</div>
          {/if}
        {/each}

        {#if empty}
          <div class="sr-empty">
            <p class="muted">{wt('sr_none')}</p>
            {#if !ans && !asking}<button class="btn sm grad" onclick={ask}>{wt('sr_ask')}</button><p class="muted xs">{wt('sr_ask_hint')}</p>{/if}
          </div>
        {/if}
        {#if asking}<div class="sr-empty"><span class="spin"></span> <span class="muted small">{wt('sr_asking')}</span></div>{/if}
        {#if ans}
          <div class="sr-ans">
            {#if ans.help}
              {@render helpCard(ans.help)}
            {:else if ans.found}
              <div class="muted xs">{wt('sr_answer')}</div>
              <p style="white-space:pre-line">{ans.answer}</p>
              <div class="muted xs" style="margin-top:6px">{wt('sr_sources')}</div>
              <div class="row wrap" style="gap:6px;margin-top:4px">{#each ans.sources as s}<a class="chip" href="#/kb/{s.id}" onclick={hide}>{s.title}</a>{/each}</div>
              <div style="margin-top:10px"><AiFeedback role="search" refId={'search:' + qhash(q)} /></div>
            {:else}
              <p class="small">{ans.queued ? (ans.dup ? wt('sr_queued_dup') : wt('sr_queued')) : wt('sr_none')}</p>
              {#if ans.ai === false && !ans.error}<p class="muted xs">{wt('sr_ai_off')}</p>{/if}
              {#if ans.error}<p class="xs" style="color:var(--bad,#ff6b8a)">{wt('sr_err')}: {ans.error}</p>{/if}
            {/if}
          </div>
        {/if}
      </div>
      <div class="sr-foot muted xs">{wt('sr_hint_keys')}</div>
    </div>
  </div>
{/if}

<style>
  .srch-btn { border: 1px solid var(--border); background: var(--card); width: 44px; height: 44px; border-radius: 50%; cursor: pointer; display: grid; place-items: center; color: var(--text); flex: none; }
  .srch-btn i { display: block; width: 22px; height: 22px; }
  .srch-btn :global(svg), .sr-in :global(svg), .sr-x :global(svg) { width: 22px; height: 22px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  :global(.sr-layer) { position: fixed; inset: 0; z-index: 2100; }
  :global(.sr-back) { position: absolute; inset: 0; background: rgba(0, 0, 0, .45); backdrop-filter: blur(3px); }
  :global(.sr-box) { position: absolute; top: 12vh; left: 50%; transform: translateX(-50%); width: min(640px, calc(100vw - 24px)); max-height: 76vh; display: flex; flex-direction: column; padding: 10px; box-shadow: 0 30px 80px rgba(0, 0, 0, .55); overflow: hidden; }
  :global(.sr-in) { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--border); flex: none; }
  :global(.sr-in i) { width: 22px; height: 22px; flex: none; color: var(--muted); }
  :global(.sr-in input) { flex: 1; min-width: 0; border: 0; background: none; box-shadow: none; padding: 8px 0; font-size: 17px; color: var(--text); outline: none; }
  :global(.sr-x) { border: 0; background: none; color: var(--muted); cursor: pointer; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; flex: none; }
  :global(.sr-x svg) { width: 18px; height: 18px; }
  :global(.sr-list) { overflow-y: auto; min-height: 0; padding: 6px 0; }
  :global(.sr-group) { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); padding: 10px 12px 4px; }
  :global(.sr-row) { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; background: none; color: inherit; text-align: left; padding: 9px 12px; border-radius: 12px; cursor: pointer; }
  :global(.sr-row.on) { background: var(--nav-on); }
  :global(.sr-person) { margin: 0 12px 6px 56px; padding: 10px 12px; border-radius: 12px; background: var(--card-2); }
  :global(.sr-empty) { padding: 18px 14px; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
  :global(.sr-ans) { margin: 8px 8px 4px; padding: 14px; border-radius: 14px; background: var(--card-2); }
  :global(.sr-foot) { flex: none; padding: 8px 12px 2px; border-top: 1px solid var(--border); }
  @media (max-width: 880px) { :global(.sr-box) { top: 8px; max-height: calc(100vh - 16px); } :global(.sr-foot) { display: none; } }
</style>
