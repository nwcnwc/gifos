/*
 * build-badge.js — say which build you are looking at, on every page.
 *
 * The version used to be legible only from the address bar (/versions/0.8.5/…),
 * which is exactly the wrong place for it: the URL is the thing people copy and
 * share, so it should stay the short pretty link, while "which build am I
 * running" belongs in the page. This puts it in the page.
 *
 * Reads the same two globals the Version panel does:
 *   GIFOS_VERSION — 'edge' on the site root, 'x.y.z' inside a /versions/ snapshot
 *   GIFOS_BUILD   — the monotonic edge build number this build was cut from
 *                   (0 in a local dev checkout; baked at deploy by pages.yml)
 *
 * Renders into #build-badge when the page provides one (so it sits inside a real
 * header), otherwise pins a small unobtrusive tag to the bottom-left. Never
 * interactive, never focusable, and it must never cover UI: pointer-events are
 * off so a click always lands on whatever is underneath.
 */
(function () {
  // Only index.html and boot.html declare GIFOS_VERSION; meet/run/sign/about
  // never have. Fall back to the DOCUMENT BASE, which archive-version.sh pins to
  // /versions/<x.y.z>/ in every archived page — so a snapshot names itself
  // correctly on all six pages instead of four of them claiming to be 'edge'.
  // The base is the honest source now that the address bar is the pretty link.
  function version() {
    if (window.GIFOS_VERSION) return window.GIFOS_VERSION;
    var src = '';
    try { src = document.baseURI || location.pathname; } catch (e) { src = location.pathname; }
    var m = /\/versions\/(\d+\.\d+\.\d+)\//.exec(src);
    return m ? m[1] : 'edge';
  }

  function label() {
    var root = window;
    var v = version();
    var b = Number(root.GIFOS_BUILD) || 0;
    // The root is the unreleased edge build — it has a build number, not a
    // version. A snapshot has a real version, and its build says which edge it
    // was cut from. Keep both spellings honest; never invent a "vedge".
    if (!v || v === 'edge') return b ? 'edge · build ' + b : 'edge';
    return b ? 'v' + v + ' · build ' + b : 'v' + v;
  }

  function paint() {
    var text = label();
    var host = document.getElementById('build-badge');
    if (host) { host.textContent = text; host.title = 'The GifOS build this page is running'; return; }
    if (document.getElementById('gifos-build-float')) return;
    var el = document.createElement('div');
    el.id = 'gifos-build-float';
    el.textContent = text;
    el.title = 'The GifOS build this page is running';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = [
      'position:fixed', 'left:.4rem', 'bottom:.3rem', 'z-index:2147483000',
      'font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:currentColor', 'opacity:.38', 'pointer-events:none',
      'user-select:none', 'white-space:nowrap',
    ].join(';');
    (document.body || document.documentElement).appendChild(el);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();
})();
