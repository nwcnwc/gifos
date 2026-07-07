/*
 * gifos-themes.js — every numbered computer has a soul.
 *
 * 0–9.gifos.app are ten separate origins, so each digit is already its own
 * isolated GifOS computer (own IndexedDB, own first-boot seeding — see
 * mirror/). This file gives each one an identity: a THEME names the icon
 * pack its default apps are drawn with, optional chrome overrides (CSS
 * variables), and optional Easter-egg apps seeded only on that computer.
 *
 * The theme resolves ONCE from the hostname. Icon art is baked into the app
 * GIFs at seed time, so a computer keeps its look forever — and an app stolen
 * from 7.gifos.app carries its birthplace's art wherever it goes.
 *
 *   { name,        // shown to humans
 *     pack,        // icon pack (gifos-icons.js registry); missing → aurora
 *     ui,          // optional { cssVar: value } chrome overrides (no '--')
 *     eggs }       // optional extra seed apps: { name, appId, accent, html, folder }
 *
 * Planned lineup (segment → digit): 0 devs · 1 professionals · 2 kids
 * (Sticker Meadow) · 3 kawaii 3D · 4 sports · 5 space · 6 spooky · 7 neon ·
 * 8 pixel · 9 zen. Themes ship one at a time; an unshipped digit simply runs
 * the flagship Aurora look until its pack lands.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});

  const THEMES = {
    home: { name: 'Aurora', pack: 'aurora' },
    2: { name: 'Sticker Meadow', pack: 'sticker' },
  };

  const m = (((root.location && root.location.hostname) || '').match(/^(\d)\./) || []);
  GifOS.theme = (m[1] != null && THEMES[m[1]]) || THEMES.home;

  // Chrome overrides apply before first paint (this script loads in <head>
  // order, ahead of desktop.js). A user's own wallpaper choice still wins —
  // these are defaults, not locks.
  if (GifOS.theme.ui && root.document) {
    for (const k in GifOS.theme.ui) root.document.documentElement.style.setProperty('--' + k, GifOS.theme.ui[k]);
  }
})(typeof window !== 'undefined' ? window : globalThis);
