<script lang="ts">
  import { api, ApiError } from '../lib/api';

  // «Использование разделов»: кто из каждого подразделения открывал раздел за 30 дней. Правила подсказывают, что скрыть и что вынести в меню.
  const SEC: Record<string, string> = { home: 'Сводка', news: 'Новости', path: 'Мой путь', tasks: 'Задачи', growth: 'Развитие', plan: 'План обучения', trainer: 'Тренажёр', ready: 'Готовность к линии', tests: 'Тесты', library: 'Библиотека', kb: 'ЧАВО', assist: 'Помощник оператора', help: 'Помощь', chat: 'Чат', team: 'Команда', structure: 'Структура', schedule: 'График', pay: 'ЗП и KPI' };
  const PROF: Record<string, string> = { call: 'Колл-центр', service: 'Сервис-центр', warehouse: 'Склад', hr: 'HR', recruiter: 'Рекрутёр', accounting: 'Бухгалтерия' };
  let d: any = $state(null), err = $state(''), busy = $state(''), msg = $state(''), aiBusy = $state(false);

  async function load() { try { d = await api.get('/api/admin/usage'); } catch { err = 'Не удалось загрузить статистику'; } }
  load();
  const cell = (p: string, s: string) => d.rows.find((r: any) => r.profile === p && r.section === s);
  async function apply(r: any) {
    const action = r.status === 'hide' ? 'hide' : 'show';
    busy = `${r.profile}:${r.section}`; msg = '';
    try {
      await api.post('/api/admin/usage/apply', { profile: r.profile, section: r.section, action });
      msg = action === 'hide' ? `«${SEC[r.section]}» скрыт у подразделения «${PROF[r.profile]}»` : `«${SEC[r.section]}» вынесен в меню подразделения «${PROF[r.profile]}»`;
      await load();
    } catch (e) { msg = e instanceof ApiError ? 'Не удалось изменить набор разделов' : 'Ошибка'; } finally { busy = ''; }
  }
  async function refreshAi() {
    aiBusy = true;
    try { d.ai = await api.post('/api/admin/usage/ai'); } catch { msg = 'ИИ сейчас недоступен'; } finally { aiBusy = false; }
  }
  const arrow = (t: string | null) => (t === 'up' ? '↗' : t === 'down' ? '↘' : t === 'flat' ? '→' : '');
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '');
</script>

<section class="stack">
  <div>
    <h2 class="u-1169661">Использование разделов</h2>
    <p class="muted small u-63e775f">Доля сотрудников подразделения, открывших раздел за {d?.days ?? 30} дней. Раздел, который открыли меньше {d?.hide_below ?? 10}%, отмечается «кандидат на скрытие». Раздел, который ищут через поиск и помощь, а в меню его нет, — «вынести в меню».</p>
  </div>
  {#if err}<p class="alert">{err}</p>
  {:else if !d}<span class="spin"></span>
  {:else}
    {#if msg}<p class="alert ok">{msg}</p>{/if}

    <section class="card stack">
      <div class="row wrap u-aab16c0"><h3 class="card-title u-1169661">Вывод недели</h3>
        <button class="btn sm" disabled={aiBusy} onclick={refreshAi}>{aiBusy ? 'Думаю…' : 'Обновить вывод'}</button>
        {#if d.ai?.at}<span class="muted xs">{fmt(d.ai.at)}{d.ai.stale ? ' · давнее' : ''}</span>{/if}</div>
      {#if d.ai?.text}<p>{d.ai.text}</p>{:else}<p class="muted small">ИИ не подключён или ещё не писал вывод. Ниже — выводы по правилам.</p>{/if}
      {#if d.rules.length}<ul class="rules">{#each d.rules as r}<li>{r}</li>{/each}</ul>{:else}<p class="muted small">Правила не нашли ни лишних, ни недостающих разделов.</p>{/if}
    </section>

    <div class="u-0ddf068">
      <table class="table usage">
        <thead><tr><th>Раздел</th>{#each d.profiles as p}<th>{PROF[p]}<br /><span class="muted xs">{d.members[p] ?? 0} чел.</span></th>{/each}</tr></thead>
        <tbody>
          {#each d.sections as s}
            <tr><td>{SEC[s]}</td>
              {#each d.profiles as p}
                {@const r = cell(p, s)}
                <td class="c {r.status}" class:off={!r.shown}>
                  {#if !r.shown}<span class="muted xs">не в меню</span>{#if r.status === 'show'} <b class="xs">ищут: {r.misses}</b>{/if}
                  {:else if r.share == null}<span class="muted">—</span>
                  {:else}<b>{r.share}%</b> <span class="muted xs">{r.active}/{r.members}{#if r.avg_visits != null} · {r.avg_visits} виз.{/if}</span> <span class="tr">{arrow(r.trend)}</span>{/if}
                  {#if r.status === 'nodata'}<div class="muted xs">мало данных</div>{/if}
                  {#if r.status === 'hide'}<div><span class="xs flag">кандидат на скрытие</span> <button class="btn sm" disabled={busy === `${p}:${s}`} onclick={() => apply(r)}>Скрыть</button></div>{/if}
                  {#if r.status === 'show'}<div><span class="xs flag">вынести в меню</span> <button class="btn sm grad" disabled={busy === `${p}:${s}`} onclick={() => apply(r)}>Показать</button></div>{/if}
                  {#if r.status === 'locked'}<div class="muted xs">открыт всем, скрыть нельзя</div>{/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="muted xs">Визиты — по одному за открытие портала, считаются за всё время у тех, кто заходил за {d.days} дней. {#if d.trend_since}Стрелка — изменение доли с {fmt(d.trend_since)}.{:else}Стрелки тренда появятся через месяц: раз в неделю портал запоминает доли.{/if} Изменение здесь меняет «Доступ к разделам» и действует при следующем открытии портала.</p>
  {/if}
</section>

<style>
  .rules { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
  .usage th { text-align: center; vertical-align: bottom; } .usage th:first-child { text-align: left; }
  .usage td.c { text-align: center; vertical-align: top; min-width: 120px; }
  .usage td.off { background: color-mix(in srgb, var(--muted) 8%, transparent); }
  .usage td.hide { background: color-mix(in srgb, var(--warn) 14%, transparent); }
  .usage td.show { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .flag { color: var(--warn); font-weight: 600; } .tr { font-weight: 700; }
  p { margin: 0; }
</style>
