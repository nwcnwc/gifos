/* Theme: David Welk — a deep-space showcase computer (davidwelk.gifos.app).
   Near-black cosmos chrome with star-blue / nebula-crimson accents. The Home
   Screen floats over a live WebGL wallpaper (wallpaper.js): a moving solar
   system — a turbulent sun with six planets orbiting it in real time on a
   tilted ecliptic, faint orbit rings, an asteroid belt, and a starfield.
   Chrome lands here (pre-paint, no flash); the theme cascade loads
   wallpaper.js behind the icons on the desktop only, so there's nothing to
   inject here. */
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
