import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

// После выкладки у открытой вкладки файлы раздела могут быть уже заменены новыми: загрузка раздела падает.
// Один раз перезагружаем страницу, чтобы подтянулась новая сборка (не чаще раза в 30 секунд, чтобы не зациклиться, если сервер недоступен).
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('chunk-reload') ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('chunk-reload', String(Date.now()));
  } catch { /* приватный режим: перезагрузим один раз */ }
  location.reload();
});

mount(App, { target: document.getElementById('app')! });
