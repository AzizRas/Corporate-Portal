<script lang="ts">
  // Глобальные напоминания «отдохни, разомнись». Без разметки в потоке страницы: показывает карточку поверх.
  // Таймер — на клиенте: период app.user.wellness_min (по умолчанию 60), только в рабочие часы смены по Ташкенту.
  // Состояние в localStorage ('wellness:v1': next — когда показать, recent — последние советы).
  // Отладка: localStorage['wellness:debug'] = '8' → период 8 секунд и без проверки рабочих часов.
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { wt } from './w18n';

  const LS = 'wellness:v1';
  const SNOOZE_MS = 10 * 60_000;
  type Tip = { id: number; kind: string; emoji: string; text_ru: string; text_uz: string; exercise_sec: number | null };

  const read = (): { next?: number; recent?: number[] } => { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } };
  const write = (patch: Record<string, unknown>) => { try { localStorage.setItem(LS, JSON.stringify({ ...read(), ...patch })); } catch { /* приватный режим */ } };
  const debugSec = () => { try { const n = Number(localStorage.getItem('wellness:debug')); return n > 0 ? n : 0; } catch { return 0; } };
  const periodMs = () => (debugSec() ? debugSec() * 1000 : (app.user?.wellness_min || 60) * 60_000);

  const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  /** Сейчас рабочее время смены по Ташкенту (и не выходной). */
  function inWork(): boolean {
    const u = app.user!;
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    if ((u.days_off ?? []).includes(DOW[p.weekday])) return false;
    const now = (Number(p.hour) % 24) * 60 + Number(p.minute);
    const m = (s: string) => { const [h, mi] = (s || '').split(':').map(Number); return h * 60 + (mi || 0); };
    const a = m(u.shift_start || '09:00'), b = m(u.shift_end || '18:00');
    return a <= b ? now >= a && now < b : now >= a || now < b;
  }

  let tips: Tip[] = [];
  let card: Tip | null = $state(null);
  let phase: 'ask' | 'run' | 'fin' = $state('ask');
  let left = $state(0), total = $state(0);
  let ex: ReturnType<typeof setInterval> | undefined;

  async function loadTips() {
    if (tips.length) return true;
    try { tips = (await api.get('/api/wellness/tips')).tips; } catch { /* повторим на следующем тике */ }
    return tips.length > 0;
  }
  /** Случайный совет, не повторяя последние (ротация). */
  function pickTip(): Tip {
    const recent = read().recent ?? [];
    const keep = Math.min(5, Math.max(0, tips.length - 1));
    const pool = tips.filter((x) => !recent.slice(-keep).includes(x.id));
    const t = (pool.length ? pool : tips)[Math.floor(Math.random() * (pool.length || tips.length))];
    write({ recent: [...recent, t.id].slice(-10) });
    return t;
  }
  const text = (t: Tip) => (app.lang === 'uz' && t.text_uz) || t.text_ru;

  async function show(force = false) {
    if (card || !(await loadTips())) return;
    const t = pickTip();
    card = t; phase = 'ask'; left = total = t.exercise_sec ?? 0;
    if (!force) write({ next: Date.now() + periodMs() });   // другие вкладки не покажут второй раз
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try { const n = new Notification(wt('notif_title'), { body: `${t.emoji} ${text(t)}`, tag: 'wellness' }); n.onclick = () => { window.focus(); n.close(); }; } catch { /* ignore */ }
    }
  }

  function tick() {
    const u = app.user;
    if (!u || !u.wellness || u.must_change_password || card) return;
    const now = Date.now(), st = read();
    if (!debugSec() && !inWork()) return;
    if (st.next == null || now - st.next > periodMs()) { write({ next: now + periodMs() }); return; }   // давно не заходили: отсчёт заново
    if (now >= st.next) void show();
  }

  function finish(action: 'done' | 'skip' | 'snooze') {
    const t = card;
    clearInterval(ex); card = null;
    write({ next: Date.now() + (action === 'snooze' ? SNOOZE_MS : periodMs()) });
    if (t) api.post('/api/wellness/done', { tip_id: t.id, action }).then(() => window.dispatchEvent(new Event('wellness-logged'))).catch(() => {});
  }
  function startEx() {
    phase = 'run'; left = total;
    clearInterval(ex);
    ex = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(ex); phase = 'fin'; try { navigator.vibrate?.(200); } catch { /* ignore */ } }
    }, 1000);
  }

  onMount(() => {
    // новая загрузка страницы: давно просроченный таймер сбрасываем, чтобы карточка не выскакивала сразу при входе
    const st = read();
    if (st.next == null || st.next < Date.now() - periodMs()) write({ next: Date.now() + periodMs() });
    const iv = setInterval(tick, debugSec() ? 1000 : 15_000);
    const preview = () => void show(true);
    window.addEventListener('wellness-preview', preview);
    return () => { clearInterval(iv); clearInterval(ex); window.removeEventListener('wellness-preview', preview); };
  });
</script>

{#if card}
  <div class="wl" role="status" aria-live="polite">
    <div class="wl-head">
      <span class="wl-em" aria-hidden="true">{card.emoji}</span>
      <div><div class="wl-k">{wt('card_title')}</div><div class="wl-kind">{wt('k_' + card.kind)}</div></div>
    </div>
    <p class="wl-text">{text(card)}</p>
    {#if card.exercise_sec}
      {#if phase === 'run'}
        <div class="wl-run" aria-label={wt('running')}><div class="wl-bar"><i style="width:{total ? ((total - left) / total) * 100 : 0}%"></i></div><b>{left} {wt('sec')}</b></div>
      {:else if phase === 'fin'}<p class="wl-fin">✨ {wt('finished')}</p>{/if}
    {/if}
    <div class="wl-act">
      {#if card.exercise_sec && phase === 'ask'}<button class="wl-b grad" onclick={startEx}>▶ {wt('start')} · {card.exercise_sec} {wt('sec')}</button>{/if}
      <button class="wl-b" class:primary={!card.exercise_sec || phase === 'fin'} onclick={() => finish('done')}>{wt('done')}</button>
      <button class="wl-b" onclick={() => finish('snooze')}>{wt('snooze')}</button>
      <button class="wl-b link" onclick={() => finish('skip')}>{wt('skip')}</button>
    </div>
  </div>
{/if}

<style>
  .wl { position: fixed; right: 20px; bottom: 20px; width: min(370px, calc(100vw - 32px)); z-index: 40; padding: 18px 18px 16px; border-radius: 24px; background: var(--card); border: 1px solid var(--border);
    box-shadow: 0 18px 50px rgba(20, 10, 60, .28); animation: wl-in .35s cubic-bezier(.2, .9, .3, 1.2); }
  .wl::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: var(--card-hl); opacity: .6; pointer-events: none; }
  .wl > * { position: relative; }
  .wl-head { display: flex; align-items: center; gap: 12px; }
  .wl-em { font-size: 34px; line-height: 1; width: 52px; height: 52px; display: grid; place-items: center; border-radius: 16px; background: var(--card-2); border: 1px solid var(--border); flex: none; }
  .wl-k { font-weight: 800; font-size: 15px; }
  .wl-kind { color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .wl-text { margin: 12px 0 14px; font-size: 15.5px; line-height: 1.45; }
  .wl-run { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  .wl-run b { font-variant-numeric: tabular-nums; min-width: 54px; text-align: right; }
  .wl-bar { flex: 1; height: 10px; border-radius: 99px; background: var(--track); overflow: hidden; }
  .wl-bar i { display: block; height: 100%; background: var(--grad); border-radius: 99px; transition: width 1s linear; }
  .wl-fin { margin: 0 0 12px; color: var(--good); font-weight: 600; font-size: 14px; }
  .wl-act { display: flex; flex-wrap: wrap; gap: 8px; }
  .wl-b { border: 1px solid var(--border); background: var(--chip); color: var(--text); padding: 9px 14px; border-radius: 999px; font-weight: 700; font-size: 13px; cursor: pointer; }
  .wl-b:hover { filter: brightness(1.08); }
  .wl-b.primary { background: #e7e0ff; color: #2b1f5c; border-color: transparent; }
  :global(:root[data-theme='light']) .wl-b.primary { background: var(--grad); color: #fff; }
  .wl-b.grad { background: var(--grad); color: #fff; border-color: transparent; flex: 1 1 100%; padding: 11px 14px; }
  .wl-b.link { background: transparent; border-color: transparent; color: var(--muted); font-weight: 600; }
  @keyframes wl-in { from { transform: translateY(24px) scale(.96); opacity: 0; } to { transform: none; opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .wl { animation: none; } .wl-bar i { transition: none; } }
  /* телефон: над нижней панелью навигации, ниже модальных окон (z-index 50) */
  @media (max-width: 880px) { .wl { left: 16px; right: 16px; width: auto; bottom: calc(100px + env(safe-area-inset-bottom)); } }
</style>
