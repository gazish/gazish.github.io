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
    var dark = current() === 'dark';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
    // keep the browser bar colour in step with the chosen theme
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      m.setAttribute('content', dark ? '#131210' : '#f6f4ef');
      if (root.getAttribute('data-theme')) m.removeAttribute('media');
    });
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

/* CV links: until the PDF has been added to /cv/, hide the buttons that point to it,
   so visitors never land on a 404. Once the file exists they show up on their own. */
(function () {
  var links = document.querySelectorAll('a[href$="Gazi_Shafayet_Hossain_CV.pdf"]');
  if (!links.length || !window.fetch) return;
  function hide() {
    links.forEach(function (a) { var li = a.closest('li'); (li || a).hidden = true; });
  }
  var cached = null;
  try { cached = sessionStorage.getItem('cv-ok'); } catch (e) { /* storage blocked */ }
  if (cached === '0') { hide(); return; }
  if (cached === '1') return;
  fetch(links[0].getAttribute('href'), { method: 'HEAD' }).then(function (r) {
    try { sessionStorage.setItem('cv-ok', r.ok ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!r.ok) hide();
  }).catch(function () { /* offline: leave the links alone */ });
})();
