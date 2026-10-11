// Тема до первой отрисовки, чтобы страница не мигала. Вынесено из index.html, чтобы CSP не пускал встроенные скрипты.
try {
  var t = localStorage.getItem('theme') || 'system';
  var d = t === 'dark' || (t === 'system' && !matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = d ? 'dark' : 'light';
} catch (e) {}
