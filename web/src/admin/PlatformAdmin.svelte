<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { has } from '../lib/state.svelte';

  // Стикерпаки из Telegram и настройки безопасности (ТЗ №3, F и B9)
  let st: any = $state(null), sec: any = $state(null), link = $state(''), note = $state(''), msg = $state('');
  const load = async () => {
    st = await api.get('/api/admin/stickers');
    if (has('admin')) sec = await api.get('/api/admin/security').catch(() => null);
  };
  load();
  async function add(e: Event) {
    e.preventDefault(); msg = '';
    try { await api.post('/api/admin/stickers', { link, author_note: note }); link = note = ''; msg = 'Пак добавлен: стикеры загружаются в фоне, обновите страницу через минуту'; await load(); }
    catch (x) { msg = x instanceof ApiError ? ({ invalid: 'Нужна ссылка вида t.me/addstickers/имя', exists: 'Этот пак уже добавлен', too_many: 'Не больше 30 паков', not_configured: 'Не задан TELEGRAM_BOT_TOKEN' } as any)[x.code] ?? x.code : 'Ошибка'; }
  }
  async function toggle(p: any) { await api.patch(`/api/admin/stickers/${p.id}`, { active: !p.active }); await load(); }
  async function setTotp(v: boolean) { sec = { ...sec, ...(await api.put('/api/admin/security', { totp_enforce: v })) }; }
  const ST: Record<string, string> = { importing: 'загружается', ready: 'готов', failed: 'ошибка' };
</script>

{#if sec}
  <section class="card stack">
    <h3 class="card-title">Безопасность</h3>
    <label class="chk"><input type="checkbox" checked={sec.totp_enforce} onchange={(e) => setTotp(e.currentTarget.checked)} /> Обязательная двухфакторная защита для администратора и бухгалтерии</label>
    {#if sec.env}<p class="muted xs">Переменная TOTP_ENFORCE={sec.env} на сервере важнее этой настройки.</p>{/if}
    <p class="muted small">Пока второй фактор не настроен, такие сотрудники смогут только войти и настроить его в профиле. Изменяющих запросов — не больше {sec.rate_limit} в минуту на человека.</p>
  </section>
{/if}

{#if st}
  <section class="card stack">
    <h3 class="card-title">Стикерпаки из Telegram</h3>
    {#if !st.configured}<p class="alert">Чтобы добавлять паки, задайте на сервере TELEGRAM_BOT_TOKEN (бот создаётся в @BotFather).</p>{/if}
    <form class="row wrap" onsubmit={add}>
      <input bind:value={link} placeholder="https://t.me/addstickers/имя_пака" />
      <input bind:value={note} placeholder="Автор / источник (для указания авторства)" />
      <button class="btn grad" disabled={!link.trim()}>Добавить</button>
    </form>
    <p class="muted xs">Стикеры — произведения авторов. Добавляйте только паки, которые компания вправе использовать во внутреннем общении. Анимированные стикеры показываются статичной картинкой.</p>
    {#if msg}<div class="alert">{msg}</div>{/if}
    {#each st.packs as p}
      <div class="row wrap"><b>{p.title}</b><span class="muted xs">{p.tg_name} · {ST[p.status]} · {p.n} шт.{p.error ? ` · ${p.error}` : ''}</span><span class="sp"></span>
        <button class="btn sm" onclick={() => toggle(p)}>{p.active ? 'Скрыть' : 'Показать'}</button></div>
    {:else}<p class="muted small">Паков пока нет</p>{/each}
  </section>
{/if}
