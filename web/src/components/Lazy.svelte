<script lang="ts">
  // Ленивая страница: код подгружается при первом показе, поэтому в стартовый пакет попадает только оболочка.
  // Остальные свойства передаются странице как есть (и обновляются, пока страница открыта).
  import { t } from '../lib/i18n';
  let { load, ...rest }: { load: () => Promise<{ default: any }>; [key: string]: any } = $props();
</script>

{#await load()}
  <span class="spin"></span>
{:then m}
  <m.default {...rest} />
{:catch}
  <div class="card"><p class="muted">{t('error')}</p></div>
{/await}
