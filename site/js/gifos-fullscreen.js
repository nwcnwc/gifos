/*
 * gifos-fullscreen.js — the fullscreen toggle, one implementation for every bar.
 *
 * Two surfaces want the same button: the Home Screen menubar (index.html /
 * boot.html, which fullscreens the whole document) and the app bar in run.html
 * (which fullscreens the app pane, so an app fills the screen while the
 * meeting's feed and the browser's chrome step out of the way). They are the
 * same control, so they are the same code and the same glyph — a second copy
 * would drift on exactly the details below.
 *
 * THE BUTTON HIDES WHEN THE BROWSER HAS NO FULLSCREEN. Feature detection, never
 * a version number (site/browser-support.json is the only place version cutoffs
 * live). iPhone Safari is the case that matters: it exposes no element
 * fullscreen at all, only video's own webkitEnterFullscreen, so a button there
 * would be a control that silently does nothing. Absent beats broken.
 *
 * THE STATE IS THE DOCUMENT'S, NEVER OURS. The user leaves fullscreen with Esc,
 * with the browser's own affordance, or by another element taking it — none of
 * which pass through our click handler. So the glyph is painted from
 * document.fullscreenElement on every fullscreenchange, and the button holds no
 * boolean of its own to fall out of sync.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  const doc = root.document;

  // The two halves of the glyph: corner brackets opening OUT (enter) and IN
  // (leave). Same 16-box, same stroke, so the button never jumps on toggle.
  const OUT = 'M6 2H2v4M10 2h4v4M14 10v4h-4M6 14H2v-4';
  const IN  = 'M2 6h4V2M14 6h-4V2M14 10h-4v4M2 10h4v4';
  function glyph(on) {
    return '<svg class="fs-glyph" viewBox="0 0 16 16" width="14" height="14" fill="none" '
      + 'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" '
      + 'aria-hidden="true" focusable="false"><path d="' + (on ? IN : OUT) + '"/></svg>';
  }

  function el(x) { return typeof x === 'function' ? x() : x; }

  // Prefixed spellings are Safari's (webkit) — the only ones still in the wild
  // that matter. Everything else has been unprefixed for years.
  function supported() {
    if (!doc || !doc.documentElement) return false;
    const d = doc.documentElement;
    return !!((doc.fullscreenEnabled && d.requestFullscreen)
      || (doc.webkitFullscreenEnabled && d.webkitRequestFullscreen));
  }
  function active() { return doc.fullscreenElement || doc.webkitFullscreenElement || null; }
  function enter(target) {
    const t = el(target) || doc.documentElement;
    try {
      const p = t.requestFullscreen ? t.requestFullscreen()
        : t.webkitRequestFullscreen ? t.webkitRequestFullscreen() : null;
      return Promise.resolve(p).catch(() => {});
    } catch (e) { return Promise.resolve(); }
  }
  function exit() {
    try {
      const p = doc.exitFullscreen ? doc.exitFullscreen()
        : doc.webkitExitFullscreen ? doc.webkitExitFullscreen() : null;
      return Promise.resolve(p).catch(() => {});
    } catch (e) { return Promise.resolve(); }
  }
  // Toggling from ANOTHER element (run.html's video fsview owns the screen, say)
  // means switching, not leaving: exit first, then take it.
  function toggle(target) {
    const t = el(target) || doc.documentElement;
    const cur = active();
    if (!cur) return enter(t);
    if (cur === t) return exit();
    return exit().then(() => enter(t));
  }

  // Wire a button that already exists in the bar's markup (a bar's contents are
  // its page's, not ours). Returns a repaint function; callers rarely need it.
  function attach(btn, target, opts) {
    if (!btn) return function () {};
    const o = opts || {};
    const inLabel = o.enterLabel || 'Full screen';
    const outLabel = o.exitLabel || 'Leave full screen';
    // Markup ships the button HIDDEN and this reveals it: a page whose module
    // failed to load then shows no empty, dead button — same posture as a
    // browser with no fullscreen at all.
    if (!supported()) { btn.style.display = 'none'; btn.dataset.fsUnsupported = '1'; return function () {}; }
    btn.style.display = '';
    function paint() {
      const on = active() === (el(target) || doc.documentElement);
      btn.innerHTML = glyph(on);
      btn.title = on ? outLabel : inLabel;
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('on', on);
    }
    btn.addEventListener('click', (e) => { e.preventDefault(); toggle(target); });
    doc.addEventListener('fullscreenchange', paint);
    doc.addEventListener('webkitfullscreenchange', paint);
    paint();
    return paint;
  }

  GifOS.fullscreen = { supported, active, enter, exit, toggle, attach, glyph };
})(typeof window !== 'undefined' ? window : globalThis);
