<script lang="ts">
  import { toggleTheme, setLang, app } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
</script>
<div class="row" style="gap:8px">
  <button class="btn sm" onclick={() => setLang(app.lang === 'ru' ? 'uz' : 'ru')} aria-label="Language">{app.lang === 'ru' ? 'UZ' : 'RU'}</button>
  <button class="btn sm" onclick={toggleTheme} aria-label="Theme" style="padding:7px 10px">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d={document.documentElement.dataset.theme === 'dark' ? 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4' : 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'} /></svg>
  </button>
</div>
