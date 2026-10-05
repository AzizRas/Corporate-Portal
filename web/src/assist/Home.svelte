<script lang="ts">
  import { A } from './store.svelte';
  import { at } from './i18n';
  import { fmtD, today, ROUTER } from './logic';
  import { PHRASES } from './search';
  import Say from './Say.svelte';
  const D = $derived(A.data!);
  const crm: Record<string, string> = {
    start: 'Диагностика → Требуется сервис', status: 'Консультация · статус заявки', repeat: 'Жалоба · эскалация', buy: 'Информация о покупке / магазине',
    phone: 'Тип устройство · Телефон', parts: 'Запрос по запчастям', brand: 'Другое · другой бренд', sc: 'Консультация · информация о СЦ',
    return: 'Жалоба · эскалация', wrong: 'ошиблись номером',
  };
</script>

<div class="as-crumbs">{at('new_call')} · {fmtD(today())}</div>
<h1 class="as-h1">{at('home_h')}</h1>
<p class="as-sub">{at('home_sub')}</p>
<Say label={at('greeting')} ru={PHRASES[0].ru} uzText={D.UZ.open} />
<div class="as-router">
  {#each ROUTER as r}
    <a class="as-rbtn" class:main={'main' in r && r.main} href="#/assist/{r.go}">
      <b>{at('rt_' + r.id)}</b><span>{at('rth_' + r.id)}</span><i>{crm[r.id]}</i>
    </a>
  {/each}
</div>
<div class="as-quick">
  <a href="#/assist/flow/missed">↻ {at('nav_missed')}</a>
  <a href="#/assist/flow/hc">★ Happy Call</a>
  <a href="#/assist/p/model">{at('q_model')}</a>
  <a href="#/assist/p/close">{at('nav_close')}</a>
  <a href="#/assist/codes">{at('nav_codes')}</a>
  <a href="#/assist/p/day1">{at('q_day1')}</a>
</div>
<p class="as-hint">{at('home_foot', { phone: D.CRM.hotline, hours: D.CRM.hours })}</p>
