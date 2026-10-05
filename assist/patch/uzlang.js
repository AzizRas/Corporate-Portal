/* Переключатель языка клиента RU / UZ и письменность узбекского (кириллица / латиница).
   Подключается к Darian·Assist скриптом import-assist.mjs; данные остаются латиницей, перевод — на показе. */
(function () {
  var FIX = (typeof __ASSIST !== 'undefined' && __ASSIST.UZ_FIX) || {};
  var store = { get: function (k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var lang = store.get('assistLang', 'ru');          // ru | uz — на каком языке говорим с клиентом
  var script = store.get('assistScript', 'cyr');     // cyr | lat — как показывать узбекский
  var orig = new WeakMap();                          // исходный (латинский) текст узлов
  var busy = false, timer = 0;

  function conv(text) { return UZCYR.uzToCyr(text, FIX); }

  function textNodes(root) {
    var out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    for (var n = w.nextNode(); n; n = w.nextNode()) {
      var p = n.parentNode;
      if (!p || (p.closest && p.closest('.who, .cp, code, input, textarea, select, script, style'))) continue;
      out.push(n);
    }
    return out;
  }

  // «UZ: слова клиента» в подсказках поиска: переводим только часть после метки
  function applyNode(n, toCyr) {
    var o = orig.has(n) ? orig.get(n) : n.nodeValue;
    var inUz = n.parentNode && n.parentNode.closest && n.parentNode.closest('.uz');
    var next = o;
    if (toCyr) {
      if (inUz) { var pm = /^(\s*UZ: )/.exec(o); next = pm ? pm[1] + conv(o.slice(pm[1].length)) : conv(o); }
      else { var m = /UZ: /.exec(o); if (m) next = o.slice(0, m.index + 4) + conv(o.slice(m.index + 4)); }
    }
    if (next !== o) { if (!orig.has(n)) orig.set(n, o); if (n.nodeValue !== next) n.nodeValue = next; }
    else if (orig.has(n)) { if (n.nodeValue !== o) n.nodeValue = o; }
  }

  function markPairs(root) {
    root.querySelectorAll('.say.uz').forEach(function (u) {
      var prev = u.previousElementSibling;
      if (prev && prev.classList.contains('say') && !prev.classList.contains('uz')) prev.classList.add('has-uz');
    });
  }

  function process(root) {
    busy = true;
    try {
      markPairs(root);
      var cand = (root.matches && root.matches('.uz')) ? [root] : [];
      root.querySelectorAll('.uz').forEach(function (e) { cand.push(e); });
      cand.forEach(function (e) { textNodes(e).forEach(function (n) { applyNode(n, script === 'cyr'); }); });
      // подсказки «UZ: …» вне .uz
      textNodes(root).forEach(function (n) { if (/UZ: /.test(orig.has(n) ? orig.get(n) : n.nodeValue)) applyNode(n, script === 'cyr'); });
    } finally { busy = false; }
  }
  function processAll() {
    process(document.body);
    busy = true;
    document.querySelectorAll('th.uzh').forEach(function (th) { th.textContent = script === 'cyr' ? 'Ўзбекча (кирилл)' : 'O‘zbekcha (lotin)'; });
    busy = false;
  }
  // кнопка «копировать» внутри узбекского текста копирует то, что видит оператор (кириллицу)
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-copy]');
    if (c && c.closest('.uz')) {
      if (!c.dataset.orig) c.dataset.orig = c.dataset.copy;
      c.dataset.copy = script === 'cyr' ? conv(c.dataset.orig) : c.dataset.orig;
    }
  }, true);

  /* ---- интерфейс в шапке ---- */
  var bar = document.querySelector('.hbar'), nc = document.getElementById('newcall');
  var box = document.createElement('div');
  box.className = 'langbox';
  box.innerHTML = '<div class="langsw" role="group" aria-label="Язык разговора с клиентом"><button type="button" data-l="ru">RU</button><button type="button" data-l="uz">UZ</button></div>' +
    '<button type="button" class="scriptsw" id="scriptsw" title="Узбекский: кириллица / латиница"></button>';
  if (bar && nc) bar.insertBefore(box, nc);
  function sync() {
    document.body.dataset.lang = lang;
    box.querySelectorAll('[data-l]').forEach(function (b) { b.classList.toggle('on', b.dataset.l === lang); b.setAttribute('aria-pressed', b.dataset.l === lang); });
    var sb = document.getElementById('scriptsw'); sb.textContent = script === 'cyr' ? 'Кир' : 'Lat';
    sb.style.display = lang === 'uz' || true ? '' : 'none';
  }
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-l]');
    if (b) { lang = b.dataset.l; store.set('assistLang', lang); sync(); return; }
    if (e.target.id === 'scriptsw') { script = script === 'cyr' ? 'lat' : 'cyr'; store.set('assistScript', script); sync(); processAll(); }
  });
  sync();

  var mo = new MutationObserver(function () { if (busy) return; clearTimeout(timer); timer = setTimeout(processAll, 0); });
  mo.observe(document.body, { childList: true, subtree: true });
  processAll();
})();
