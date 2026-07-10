/* Theme: David Welk — a deep-space showcase computer (davidwelk.gifos.app).
   Near-black cosmos chrome with star-blue / nebula-crimson accents. The Home
   Screen floats over a live WebGL wallpaper (space.js): a sunrise from low
   orbit — a night-side cloud deck below, a crimson nebula above, three more
   worlds in between, and a drifting camera. Chrome lands here (pre-paint,
   no flash); the wallpaper is layered in behind the icons. */
GifOS.setTheme({
  name: 'David Welk',
  pack: 'aurora',
  chrome: {
    bg: '#01030a',
    bgglow: '#0a1230',
    surface: '#0b1024',
    border: '#243060',
    text: '#eaf0ff',
    muted: '#8fa0d0',
    accent: '#5aa0ff',
    accent2: '#ff6b7d',
    glow: 'rgba(90,160,255,.40)',
    bar: 'rgba(5,9,24,.62)',
    label: '#eaf0ff',
    labelshadow: 'rgba(0,0,0,.9)',
    onaccent: '#04102a',
  },
});

// Layer the live cosmos wallpaper behind the desktop. Loaded as a sibling file
// in this theme folder (the cascade auto-loads only theme/icons/eggs, so we
// pull it in ourselves); space.js waits for <body> and self-guards duplicates.
(function () {
  if (!document || !document.head) return;
  var s = document.createElement('script');
  s.src = '/themes/davidwelk/space.js';
  s.async = true;
  document.head.appendChild(s);
})();
