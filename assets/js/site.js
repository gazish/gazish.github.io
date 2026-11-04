/* Theme toggle. The initial theme is set by a tiny inline script in <head>
   so the page never flashes the wrong colours. */
(function () {
  var root = document.documentElement;
  var btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function current() {
    var t = root.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return media && media.matches ? 'dark' : 'light';
  }
  function sync() {
    btn.setAttribute('aria-pressed', current() === 'dark' ? 'true' : 'false');
  }
  btn.addEventListener('click', function () {
    var next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked */ }
    sync();
    document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
  });
  if (media && media.addEventListener) {
    media.addEventListener('change', function () {
      sync();
      document.dispatchEvent(new CustomEvent('themechange', { detail: current() }));
    });
  }
  sync();
})();
