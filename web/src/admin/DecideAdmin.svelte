<script lang="ts">
  import { api } from '../lib/api';
  import { fmtDate } from '../lib/format';

  // Слой решений (ТЗ №3, G): Jev (TypeSafe AI) — быстрые выборы/да-нет/оценки; без ключа функции работают по прежним правилам
  const FN: [string, string][] = [
    ['intent', 'Намерение вопроса ассистенту (вместо регулярных выражений)'],
    ['route', 'Раздел и срочность вопроса в очереди'],
    ['rerank', 'Переранжирование поиска по базе знаний'],
    ['ground', 'Проверка, что ответ базы знаний подтверждается статьями'],
    ['screen', 'Первичная оценка резюме по вакансии (подсказка рекрутеру)'],
    ['moderate', 'Предупреждение о грубости и персональных данных в общих чатах'],
    ['llm_fallback', 'Если Jev недоступен — спрашивать обычную модель ИИ (дороже и медленнее)'],
  ];
  let d: any = $state(null), saved = $state(false);
  const load = async () => (d = await api.get('/api/admin/decide'));
  load();
  async function save() { d.cfg = (await api.put('/api/admin/decide', d.cfg)).cfg; saved = true; setTimeout(() => (saved = false), 2000); }
</script>

{#if d}
  <section class="card stack">
    <h3 class="card-title">Подключение</h3>
    <p>{d.jev ? `Jev подключён (модель ${d.model})` : 'Jev не подключён: задайте переменную TYPESAFE_API_KEY (и при необходимости TYPESAFE_MODEL, TYPESAFE_API_URL).'}</p>
    <p class="muted small">Перед отправкой из текста убираются телефоны, e-mail и длинные номера. Решения — подсказки: окончательное решение остаётся за человеком.</p>
  </section>
  <section class="card stack">
    <h3 class="card-title">Где использовать</h3>
    {#each FN as [k, l]}<label class="chk"><input type="checkbox" bind:checked={d.cfg[k]} /> {l}</label>{/each}
    <label class="f">Минимальная уверенность для принятия решения<input type="number" min="0.3" max="0.95" step="0.05" bind:value={d.cfg.min_conf} /></label>
    <div class="row"><button class="btn grad" onclick={save}>Сохранить</button>{#if saved}<span class="muted small">Сохранено</span>{/if}</div>
  </section>
  <section class="card scroll-x">
    <h3 class="card-title">За 7 дней</h3>
    <table class="table"><thead><tr><th>Функция</th><th>Провайдер</th><th>Решений</th><th>Сбоев</th><th>Уверенность</th><th>мс</th></tr></thead>
      <tbody>{#each d.stats as s}<tr><td>{s.fn}</td><td>{s.provider}</td><td>{s.n}</td><td>{s.failed}</td><td>{s.conf ?? '—'}</td><td>{s.ms ?? '—'}</td></tr>{:else}<tr><td colspan="6" class="muted">Решений ещё не было</td></tr>{/each}</tbody></table>
    <h3 class="card-title">Последние</h3>
    {#each d.recent as r}<div class="small"><span class="muted xs">{fmtDate(r.at)}</span> {r.fn} · {r.provider} · {r.ok ? JSON.stringify(r.answer).slice(0, 160) : `ошибка: ${r.error}`}</div>{/each}
  </section>
{:else}<span class="spin"></span>{/if}
