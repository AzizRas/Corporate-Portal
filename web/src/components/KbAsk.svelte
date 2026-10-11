<script lang="ts">
  import { api } from '../lib/api';
  import { app, has } from '../lib/state.svelte';
  import { md } from '../lib/md';
  import Icon from './Icon.svelte';

  // «Спросить базу знаний»: ответ только по статьям, со ссылками на них (ТЗ №3, H)
  const uz = $derived(app.lang === 'uz');
  const L = $derived(uz
    ? { ph: 'Savol bering: masalan, «Tovar qaytarish qanday rasmiylashtiriladi?»', ask: 'So‘rash', src: 'Manbalar', ok: 'Foydali', bad: 'Bu emas', thanks: 'Rahmat!', sent: 'Savol ekspertga yuborildi', save: 'Maqola sifatida saqlash', saved: 'Muharrir uchun qoralama yaratildi', none: 'Aniq javob topilmadi', extract: 'Eng mos maqoladan parcha (AI ulanmagan)' }
    : { ph: 'Задайте вопрос: например, «Как оформить возврат товара?»', ask: 'Спросить', src: 'Источники', ok: 'Полезно', bad: 'Не то', thanks: 'Спасибо!', sent: 'Вопрос отправлен эксперту', save: 'Сохранить как статью', saved: 'Создан черновик для редактора', none: 'Точного ответа не нашлось', extract: 'Отрывок из самой подходящей статьи (ИИ не подключён)' });
  let question = $state(''), busy = $state(false), res: any = $state(null), fb = $state(''), err = $state(false);
  async function ask(e: Event) {
    e.preventDefault();
    if (question.trim().length < 3) return;
    busy = true; res = null; fb = ''; err = false;
    try { res = await api.post('/api/kb/ask', { question }); } catch { err = true; } finally { busy = false; }
  }
  async function feedback(v: 1 | -1) { await api.post(`/api/kb/answers/${res.id}/feedback`, { value: v }); fb = v === 1 ? L.thanks : L.sent; }
  async function save() { await api.post(`/api/kb/answers/${res.id}/save`); fb = L.saved; }
</script>

<section class="card stack kb-ask">
  <form class="row" onsubmit={ask}>
    <input class="kb-ask-in" bind:value={question} placeholder={L.ph} maxlength="500" />
    <button class="btn grad" disabled={busy || question.trim().length < 3}>{busy ? '…' : L.ask}</button>
  </form>
  {#if err}<div class="alert">—</div>{/if}
  {#if res}
    <div class="kb-ans" class:weak={!res.grounded}>
      {#if res.mode === 'extract'}<p class="muted xs">{L.extract}</p>{/if}
      <div class="md">{@html md(res.answer)}</div>
      {#if res.citations.length}
        <p class="small"><b>{L.src}:</b> {#each res.citations as c, i}{i ? ', ' : ''}<a href="#/kb/{c.article_id}">[{c.n}] {c.title}</a>{/each}</p>
      {/if}
      {#if fb}<p class="ok-ink small">{fb}</p>
      {:else}<div class="row wrap"><button class="btn sm" onclick={() => feedback(1)}><Icon inline name="thumb-up" /> {L.ok}</button><button class="btn sm" onclick={() => feedback(-1)}><Icon inline name="thumb-down" /> {L.bad}</button>
        {#if has('editor', 'hr') && res.grounded}<button class="btn sm" onclick={save}>{L.save}</button>{/if}</div>{/if}
    </div>
  {/if}
</section>

<style>
  .kb-ask-in { flex: 1; min-width: 0; }
  .kb-ans { border-left: 3px solid var(--accent); padding: 6px 12px; display: flex; flex-direction: column; gap: 8px; }
  .kb-ans.weak { border-left-color: #f59e0b; }
  .ok-ink { color: #16a34a; }
</style>
