<script lang="ts">
  import { confirmBox } from '../lib/dialog.svelte';
  import { api } from '../lib/api';

  // Какие разделы видит каждое подразделение. Помощник оператора, тренажёр и готовность к линии закрываются и на сервере; остальные скрываются в меню.
  const SEC: Record<string, string> = { home: 'Сводка', news: 'Новости', path: 'Мой путь', tasks: 'Задачи', growth: 'Развитие', plan: 'План обучения (адаптация)', trainer: 'Тренажёр', ready: 'Готовность к линии', tests: 'Тесты', library: 'Библиотека', kb: 'ЧАВО', assist: 'Помощник оператора', help: 'Как пользоваться', chat: 'Чат', team: 'Команда', structure: 'Структура', schedule: 'График', pay: 'ЗП и KPI' };
  const PROF: Record<string, string> = { call: 'Колл-центр', service: 'Сервис-центр', warehouse: 'Склад', hr: 'HR', recruiter: 'Рекрутер', accounting: 'Бухгалтерия' };
  const LOCKED = ['library', 'tests'];
  let d: any = $state(null), matrix: Record<string, string[]> = $state({}), msg = $state(''), bad = $state(false), busy = $state(false);

  async function load() { d = await api.get('/api/admin/access'); matrix = JSON.parse(JSON.stringify(d.matrix)); }
  load();
  const on = (p: string, s: string) => matrix[p]?.includes(s);
  const toggle = (p: string, s: string) => { matrix[p] = on(p, s) ? matrix[p].filter((x) => x !== s) : [...matrix[p], s]; };
  async function save() {
    busy = true; msg = '';
    try { await api.put('/api/admin/access', { matrix }); msg = 'Сохранено. Меню обновится при следующем открытии портала.'; bad = false; await load(); } catch { msg = 'Не удалось сохранить'; bad = true; } finally { busy = false; }
  }
  async function reset() { if (!await confirmBox('Вернуть набор разделов по умолчанию для всех подразделений?')) return; await api.del('/api/admin/access'); msg = 'Возвращено по умолчанию'; bad = false; await load(); }
</script>

{#if !d}<p class="muted"><span class="spin"></span></p>
{:else}
  <section class="card stack">
    <div>
      <h3 class="card-title">Доступ к разделам по подразделениям</h3>
      <p class="muted small">Профиль определяется ролью (бухгалтерия, HR, рекрутер), иначе подразделением сотрудника. Админ видит всё. Найм открыт ролям HR, рекрутер, супервайзер и руководитель отдела независимо от этой таблицы.</p>
    </div>
    <div class="u-0ddf068">
      <table class="table">
        <thead><tr><th>Раздел</th>{#each d.profiles as p}<th class="u-91a8701">{PROF[p]}</th>{/each}</tr></thead>
        <tbody>
          {#each d.sections as s}
            <tr><td>{SEC[s]}{#if d.server_closed?.includes(s)} <span class="muted xs">· закрыт и на сервере</span>{/if}{#if LOCKED.includes(s)} <span class="muted xs">· открыт всем, обучение и обязательные тесты</span>{/if}</td>
              {#each d.profiles as p}<td class="u-91a8701"><input type="checkbox" aria-label={`${SEC[s]}: ${PROF[p]}`} checked={on(p, s) || LOCKED.includes(s)} disabled={LOCKED.includes(s)} onchange={() => toggle(p, s)} /></td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="row wrap u-f3d7ce7"><button class="btn grad" disabled={busy} onclick={save}>Сохранить</button><button class="btn" onclick={reset}>По умолчанию</button>{#if msg}<span class="small" class:pill-ok={!bad} class:pill-bad={bad}>{msg}</span>{/if}</div>
  </section>
{/if}
