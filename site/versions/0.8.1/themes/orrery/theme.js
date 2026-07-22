/* Theme: Orrery — a clockwork-of-the-heavens showcase computer (orrery.gifos.app).
   Near-black space chrome with warm sun-amber accents and a cool planet-blue
   secondary. The Home Screen floats over a live WebGL wallpaper (wallpaper.js):
   a moving solar system — a turbulent sun with six planets orbiting it in real
   time on a tilted ecliptic, faint orbit rings, an asteroid belt, and a
   starfield. Chrome lands here (pre-paint, no flash); the theme cascade loads
   wallpaper.js behind the icons on the desktop only, so there's nothing to
   inject here. */
GifOS.setTheme({
  name: 'Orrery',
  pack: 'orrery',
  chrome: {
    bg: '#04030a',
    bgglow: '#241405',
    surface: '#140f1e',
    border: '#43371f',
    text: '#fbf2e4',
    muted: '#c0a888',
    accent: '#ffb24d',
    accent2: '#6aa8ff',
    glow: 'rgba(255,178,77,.40)',
    bar: 'rgba(10,7,20,.62)',
    label: '#fbf2e4',
    labelshadow: 'rgba(0,0,0,.9)',
    onaccent: '#2a1600',
  },
});
