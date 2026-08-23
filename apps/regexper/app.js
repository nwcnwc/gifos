// GifOS boot only: if the iframe has no hash yet, open on a small example so
// the first paint is a diagram, not a blank page. Upstream used the URL hash
// as the source of truth; we keep that. The vendor IIFE binds hashchange after
// a tick, so this has to run first.
//
// SET location.hash — never location.replace('#…'). A GifOS app is a `srcdoc`
// iframe, and a srcdoc document INHERITS ITS BASE URL FROM THE PARENT. So a
// RELATIVE navigation ('#x') resolves against the parent's URL — run.html —
// and navigates this frame clean out of the app and onto the OS, which,
// finding no #id= in the hash it just landed on, opens the MEETING LOBBY.
// That is what this line used to do on every single launch. Assigning
// location.hash is not a relative navigation: it edits the fragment of this
// document's own URL (about:srcdoc), which is what upstream meant. Guarded by
// test/browser/e2e-app-frame-escape.js.
(function () {
  var h = location.hash;
  if (h && h !== '#') return;
  location.hash = encodeURIComponent('^[a-z]+@[a-z]+\\.[a-z]+$');
})();
