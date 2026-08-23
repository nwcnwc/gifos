// GifOS boot only: if the iframe has no hash yet, open on a small example so
// the first paint is a diagram, not a blank page. Upstream used the URL hash
// as the source of truth; we keep that. The vendor IIFE binds hashchange after
// a tick, so this has to run first.
(function () {
  var h = location.hash;
  if (h && h !== '#') return;
  location.replace('#' + encodeURIComponent('^[a-z]+@[a-z]+\\.[a-z]+$'));
})();
