<script lang="ts">
  // Админка ИИ (только admin): настройки, использование, журнал вызовов, негативные оценки.
  import { api } from '../lib/api';
  import { fmtDateTime } from '../lib/format';
  import { at } from './a18n';

  const ROLES = ['mentor', 'analyst', 'editor', 'supervisor', 'trainer', 'search', 'recruiter'];
  type Tab = 'settings' | 'usage' | 'log' | 'bad';
  let tab: Tab = $state('settings');
  let cfg: any = $state(null), loadErr = $state(false), saving = $state(false), msg = $state(''), msgBad = $state(false);
  let daily = $state(''), budget = $state(''), roles: Record<string, boolean> = $state({}), style = $state(''), pin = $state('0'), pout = $state('0');
  let usage: any = $state(null), log: any[] | null = $state(null), bad: any[] | null = $state(null);

  const money = (n: number) => (n < 1 ? n.toFixed(4) : n.toFixed(2));

  async function loadCfg() {
    try {
      cfg = await api.get('/api/admin/ai/config');
      const c = cfg.config;
      budget = c.budget_month === null || c.budget_month === undefined ? '' : String(c.budget_month);
      daily = c.user_daily == null ? '' : String(c.user_daily);
      roles = Object.fromEntries(ROLES.map((r) => [r, c.roles?.[r] !== false]));
      style = c.style ?? ''; pin = String(c.prices?.in ?? 0); pout = String(c.prices?.out ?? 0);
    } catch { loadErr = true; }
  }
  loadCfg();

  async function save(e: Event) {
    e.preventDefault();
    saving = true; msg = '';
    try {
      const r = await api.put('/api/admin/ai/config', { budget_month: budget.trim() === '' ? null : Number(budget.replace(',', '.')), user_daily: daily.trim() === '' ? null : Number(daily), roles, style, prices: { in: Number(pin.replace(',', '.')), out: Number(pout.replace(',', '.')) } });
      msg = at('ai_saved'); msgBad = false;
      if (cfg) cfg.config = r.config;
      api.get('/api/admin/ai/config').then((c) => (cfg = c)).catch(() => {});
    } catch { msg = at('ai_err'); msgBad = true; } finally { saving = false; }
  }

  $effect(() => {
    if (tab === 'usage') api.get('/api/admin/ai/usage').then((r) => (usage = r)).catch(() => (usage = { by_role: [], by_day: [], errors: [], feedback: [], spent: 0, budget: null, reason: null }));
    else if (tab === 'log') api.get('/api/admin/ai/log?limit=100').then((r) => (log = r.items)).catch(() => (log = []));
    else if (tab === 'bad') api.get('/api/admin/ai/feedback').then((r) => (bad = r.items)).catch(() => (bad = []));
  });

  const roleName = (r: string) => (ROLES.includes(r) ? at('ai_role_' + r) : r);
  const spent = $derived(Number(cfg?.spent ?? 0));
  const limit = $derived(budget.trim() === '' || !Number.isFinite(Number(budget.replace(',', '.'))) ? null : Number(budget.replace(',', '.')));
  const pct = $derived(limit ? Math.min(100, (spent / limit) * 100) : 0);
  const days = $derived((usage?.by_day ?? []) as { day: string; calls: number; cost: number }[]);
  const maxDay = $derived(Math.max(0.0001, ...days.map((d) => d.cost)));
  const maxCalls = $derived(Math.max(1, ...days.map((d) => d.calls)));
</script>

<nav class="tabs" aria-label="ИИ">
  {#each ['settings', 'usage', 'log', 'bad'] as t}<button type="button" class:on={tab === t} onclick={() => (tab = t as Tab)}>{at('ai_tab_' + t)}</button>{/each}
</nav>

{#if tab === 'settings'}
  {#if loadErr}<div class="alert">{at('ai_load_err')}</div>
  {:else if !cfg}<span class="spin"></span>
  {:else}
    <form class="card ai-form" onsubmit={save}>
      <div class="alert u-905d8b3" class:info={cfg.enabled}>
        {cfg.enabled ? (cfg.provider === 'anthropic' ? at('ai_on_anthropic') : at('ai_on_openrouter')) : at('ai_no_key')}
      </div>

      <label class="f">{at('ai_budget')}<input class="u-df9bce5" type="text" inputmode="decimal" bind:value={budget} placeholder="—" /></label>
      <p class="muted xs u-7225e11">{at('ai_budget_hint')}</p>
      <label class="f">{at('ai_daily')}<input type="text" inputmode="numeric" bind:value={daily} placeholder="—" class="w-220" /></label>
      <p class="muted xs hint-tight">{at('ai_daily_hint')}</p>
      <div class="ai-meter">
        <div class="small">{limit ? at('ai_spent_of', { x: money(spent), y: money(limit) }) : at('ai_spent_nolimit', { x: money(spent) })}</div>
        {#if limit}<div class="bar u-8a77e5a" class:good={pct < 90} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin="0" aria-valuemax="100"><i style:width={`${pct}%`}></i></div>{/if}
      </div>

      <h3 class="ai-h">{at('ai_roles')}</h3>
      <p class="muted xs u-fdf33f2">{at('ai_roles_hint')}</p>
      <div class="ai-roles">
        {#each ROLES as r}
          <label class="chk ai-role"><input type="checkbox" bind:checked={roles[r]} /><span><b>{at('ai_role_' + r)}</b><span class="muted small">&nbsp;— {at('ai_role_' + r + '_d')}</span></span></label>
        {/each}
      </div>

      <h3 class="ai-h">{at('ai_prices')}</h3>
      <div class="ai-two">
        <label class="f">{at('ai_price_in')}<input type="text" inputmode="decimal" bind:value={pin} /></label>
        <label class="f">{at('ai_price_out')}<input type="text" inputmode="decimal" bind:value={pout} /></label>
      </div>
      <p class="muted xs u-7225e11">{at('ai_prices_hint')}</p>

      <h3 class="ai-h">{at('ai_style')}</h3>
      <textarea bind:value={style} maxlength="4000" rows="8" aria-label={at('ai_style')}></textarea>
      <div class="row wrap u-d51fcbe">
        <button type="button" class="btn sm" onclick={() => (style = cfg.default_style ?? '')}>{at('ai_style_default')}</button>
        <span class="muted xs">{at('ai_style_count', { n: style.length })}</span>
      </div>
      <p class="muted xs u-fe7b497">{at('ai_style_hint')}</p>

      <div class="row wrap u-a26bda7">
        <button class="btn grad" disabled={saving}>{at('ai_save')}</button>
        {#if msg}<span class="small" class:pill-bad={msgBad} class:pill-ok={!msgBad} role="status">{msg}</span>{/if}
      </div>
    </form>
  {/if}

{:else if tab === 'usage'}
  {#if !usage}<span class="spin"></span>
  {:else}
    <div class="card">
      <div class="card-head"><h3>{at('ai_u_total')}</h3><span class="aside">{at('ai_u_budget')}: {usage.budget ? '$' + money(usage.budget) : at('ai_u_nolimit')}</span></div>
      <div class="big-num u-7fa2d86">${money(Number(usage.spent ?? 0))}</div>
      {#if usage.reason === 'budget'}<div class="alert u-56f4356">{at('ai_u_reason_budget')}</div>{:else if usage.reason === 'no_key'}<div class="alert info u-56f4356">{at('ai_u_reason_no_key')}</div>{/if}
    </div>

    <div class="card ai-gap">
      <div class="card-head"><h3>{at('ai_u_by_role')}</h3></div>
      {#if !usage.by_role.length}<p class="muted">{at('ai_u_none')}</p>
      {:else}
        <div class="scroll-x"><table class="table">
          <thead><tr><th>{at('ai_u_role')}</th><th>{at('ai_u_calls')}</th><th>{at('ai_u_cached')}</th><th>{at('ai_u_errors')}</th><th>{at('ai_u_tokens')}</th><th>{at('ai_u_cost')}</th></tr></thead>
          <tbody>{#each usage.by_role as r}<tr><td>{roleName(r.role)}</td><td>{r.calls}</td><td>{r.cached}</td><td class:pill-bad={r.errors > 0}>{r.errors}</td><td>{r.tokens.toLocaleString('ru-RU')}</td><td>{money(r.cost)}</td></tr>{/each}</tbody>
        </table></div>
      {/if}
    </div>

    <div class="card ai-gap">
      <div class="card-head"><h3>{at('ai_u_by_day')}</h3></div>
      {#if !days.length}<p class="muted">{at('ai_u_day_none')}</p>
      {:else}
        <div class="ai-chart" role="img" aria-label={at('ai_u_by_day')}>
          {#each days as d}
            <div class="ai-col" title="{d.day}: ${money(d.cost)} · {at('ai_u_calls_n', { n: d.calls })}">
              <i style:height={`${Math.max(4, (d.cost > 0 ? d.cost / maxDay : d.calls / maxCalls * 0.15) * 100)}%`}></i>
            </div>
          {/each}
        </div>
        <div class="row u-a562f4f"><span class="muted xs">{days[0].day}</span><span class="muted xs">{days[days.length - 1].day}</span></div>
      {/if}
    </div>

    <div class="card ai-gap">
      <div class="card-head"><h3>{at('ai_u_err_title')}</h3></div>
      {#if !usage.errors.length}<p class="muted">{at('ai_u_err_none')}</p>
      {:else}
        <div class="scroll-x"><table class="table">
          <thead><tr><th>{at('ai_u_when')}</th><th>{at('ai_u_role')}</th><th>{at('ai_u_text')}</th></tr></thead>
          <tbody>{#each usage.errors as e}<tr><td class="nw">{fmtDateTime(e.at)}</td><td>{roleName(e.role)}</td><td class="ai-err">{e.error}</td></tr>{/each}</tbody>
        </table></div>
      {/if}
    </div>

    <div class="card ai-gap">
      <div class="card-head"><h3>{at('ai_u_fb')}</h3></div>
      {#if !usage.feedback.length}<p class="muted">{at('ai_u_fb_none')}</p>
      {:else}
        <div class="scroll-x"><table class="table">
          <thead><tr><th>{at('ai_u_role')}</th><th>👍 {at('ai_u_yes')}</th><th>👎 {at('ai_u_no')}</th></tr></thead>
          <tbody>{#each usage.feedback as f}<tr><td>{roleName(f.role)}</td><td>{f.yes}</td><td class:pill-bad={f.no > 0}>{f.no}</td></tr>{/each}</tbody>
        </table></div>
      {/if}
    </div>
  {/if}

{:else if tab === 'log'}
  <div class="card">
    {#if !log}<span class="spin"></span>
    {:else if !log.length}<p class="muted">{at('ai_l_none')}</p>
    {:else}
      <div class="scroll-x"><table class="table">
        <thead><tr><th>{at('ai_l_time')}</th><th>{at('ai_u_role')}</th><th>{at('ai_l_user')}</th><th>{at('ai_l_model')}</th><th>{at('ai_l_tokens')}</th><th>{at('ai_l_cost')}</th><th>{at('ai_l_cached')}</th><th>{at('ai_l_error')}</th></tr></thead>
        <tbody>{#each log as l (l.id)}
          <tr><td class="nw">{fmtDateTime(l.at)}</td><td>{roleName(l.role)}</td><td>{l.user_name ?? at('ai_l_system')}</td><td class="xs">{l.model}</td><td class="nw">{l.tokens_in} / {l.tokens_out}</td><td>{money(l.cost)}</td><td>{l.cached ? at('ai_l_yes') : ''}</td><td class="ai-err">{l.ok ? '' : l.error || '!'}</td></tr>
        {/each}</tbody>
      </table></div>
    {/if}
  </div>

{:else}
  <div class="card">
    <div class="card-head"><h3>{at('ai_tab_bad')}</h3></div>
    <p class="muted small u-da12f28">{at('ai_b_hint')}</p>
    {#if !bad}<span class="spin"></span>
    {:else if !bad.length}<p class="muted">{at('ai_b_none')}</p>
    {:else}
      <div class="ai-bad">
        {#each bad as b (b.id)}
          <div class="ai-bad-row">
            <div class="row wrap u-33fcd4c"><span class="chip u-145ea9c">{roleName(b.role)}</span><b class="small">{b.user_name}</b><span class="muted xs">{fmtDateTime(b.at)}</span></div>
            <div class="u-7487ceb">{#if b.comment}{b.comment}{:else}<span class="muted">{at('ai_b_nocomment')}</span>{/if}</div>
            <div class="muted xs u-aa03834">{b.ref}</div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .ai-form { max-width: 760px; }
  .ai-h { margin: 22px 0 8px; font-size: 16px; }
  .ai-meter { margin-bottom: 4px; }
  .ai-roles { display: grid; gap: 10px; }
  .ai-role { align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--card-2); }
  .ai-role input { margin-top: 2px; flex: none; }
  .ai-two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; max-width: 420px; }
  .ai-gap { margin-top: 16px; }
  .nw { white-space: nowrap; }
  .ai-err { min-width: 220px; max-width: 420px; overflow-wrap: anywhere; font-size: 13px; }
  .ai-chart { display: flex; align-items: flex-end; gap: 3px; height: 120px; padding-bottom: 4px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
  .ai-col { flex: 1; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
  .ai-col i { display: block; width: 100%; border-radius: 4px 4px 0 0; background: var(--grad-soft, var(--accent)); }
  .ai-bad { display: grid; gap: 10px; }
  .ai-bad-row { padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--card-2); }
  nav.tabs button { font-family: inherit; }
  @media (max-width: 560px) { .ai-two { grid-template-columns: 1fr; } }
</style>
