/*
 * GifOS: KEEP IN-PAGE LINKS IN THIS PAGE.
 *
 * A GifOS app is a `srcdoc` iframe, and before build 1495 a srcdoc document
 * INHERITED ITS BASE URL FROM THE OS PAGE. A bare `#` anchor is a RELATIVE
 * navigation, so it resolved against run.html and a single click walked this
 * frame clean out of the app and onto the OS — the meeting lobby on edge, the
 * Home Screen on an archived release. Build 1495 pins <base href="about:srcdoc">
 * and closes it at the platform; this keeps the app right on every older build
 * it still claims to run on (manifest.minBuild).
 *
 * CAPTURE phase, preventDefault ONLY, propagation untouched: the app's own
 * handlers still run, and still run AFTER the fragment is set — which matters,
 * because some of them read location.hash to decide what was clicked. All this
 * removes is the browser's default navigation.
 */
(function () {
  if (!document.addEventListener) return;
  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href^="#"]') : null;
    if (!a) return;
    e.preventDefault();                       // the navigation, and nothing else
    var id = (a.getAttribute('href') || '').slice(1);
    if (!id) return;                          // href="#" is a button in disguise
    var el = null;
    try {
      el = document.getElementById(id) ||
           document.querySelector('[name="' + id.replace(/["\\]/g, '\\$&') + '"]');
    } catch (err) { /* not a usable selector — scrolling is best-effort */ }
    if (el && el.scrollIntoView) el.scrollIntoView();
    // Set it BEFORE the app's own handler runs: this is the fragment the app
    // reads back (bip39 picks its wordlist language out of location.hash).
    try { location.hash = id; } catch (err) {}
  }, true);
})();
