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

  // ui keys map to CSS variables (see desktop.css :root). Dark computers can
  // omit ui entirely and inherit the flagship chrome.
  const THEMES = {
    home: { name: 'Aurora', pack: 'aurora' },

    // 0 — developers, hackers, tinkerers. Phosphor CRT.
    0: { name: 'Terminal Zero', pack: 'terminal', ui: {
      bg: '#020703', bgglow: '#04180c', surface: '#04120a', border: '#0e3d22',
      text: '#a8ffc4', muted: '#4e8f68', accent: '#33ff77', accent2: '#1fd0a0', glow: 'rgba(51,255,119,.35)',
    } },

    // 1 — professionals & older users. Warm paper, ink, one red accent. Light.
    1: { name: 'Letterpress', pack: 'letterpress', ui: {
      bg: '#f4efe4', bgglow: '#fdfaf2', surface: '#fbf8f0', border: '#d8d0bd',
      text: '#2b2620', muted: '#8a8272', accent: '#b3402e', accent2: '#2e6cb3', glow: 'rgba(179,64,46,.16)',
      bar: 'rgba(251,248,240,.82)', label: '#2b2620', labelshadow: 'rgba(255,255,255,.85)',
    } },

    // 2 — young kids & families. The original hand-drawn kawaii stickers.
    2: { name: 'Sticker Meadow', pack: 'sticker', ui: {
      bg: '#dff0ff', bgglow: '#fff2fb', surface: '#ffffff', border: '#c9d8ec',
      text: '#2b2440', muted: '#7a86a3', accent: '#7b5cff', accent2: '#ff5caa', glow: 'rgba(123,92,255,.2)',
      bar: 'rgba(255,255,255,.8)', label: '#2b2440', labelshadow: 'rgba(255,255,255,.9)',
    } },

    // 3 — cute-culture crowd. Glossy pastel toys. Light.
    3: { name: 'Toybox', pack: 'toybox', ui: {
      bg: '#e8e4f2', bgglow: '#fbe8f4', surface: '#f6f4fb', border: '#d5cfe8',
      text: '#3a3352', muted: '#8f88a8', accent: '#ff7bb5', accent2: '#5cc8ff', glow: 'rgba(255,123,181,.25)',
      bar: 'rgba(246,244,251,.82)', label: '#3a3352', labelshadow: 'rgba(255,255,255,.85)',
    } },

    // 4 — sports fans. Floodlit turf, varsity gold.
    4: { name: 'Stadium', pack: 'stadium', ui: {
      bg: '#07120c', bgglow: '#0e2a18', surface: '#0d1f14', border: '#1e4028',
      text: '#e8f4e0', muted: '#7fa88a', accent: '#ffd23c', accent2: '#4dd66a', glow: 'rgba(255,210,60,.3)',
    } },

    // 5 — space & sci-fi nerds. 5-4-3-2-1… liftoff.
    5: { name: 'Countdown', pack: 'countdown', ui: {
      bg: '#030308', bgglow: '#131335', surface: '#0b0b1a', border: '#232345',
      text: '#e0e0f5', muted: '#8888b0', accent: '#b09aff', accent2: '#ff8a5c', glow: 'rgba(176,154,255,.35)',
    } },

    // 6 — artists & dreamers. Loose ink over wet watercolor. Light.
    6: { name: 'Watercolor', pack: 'watercolor', ui: {
      bg: '#f6f3ec', bgglow: '#fffdf6', surface: '#fcfaf4', border: '#ddd6c6',
      text: '#2b2733', muted: '#8a8478', accent: '#3d4e9e', accent2: '#e8833a', glow: 'rgba(61,78,158,.18)',
      bar: 'rgba(252,250,244,.82)', label: '#2b2733', labelshadow: 'rgba(255,255,255,.85)',
    } },

    // 7 — gamers & night owls. 7-7-7, neon glitch.
    7: { name: 'Lucky Sevens', pack: 'sevens', ui: {
      bg: '#060109', bgglow: '#1d0530', surface: '#120618', border: '#3d1050',
      text: '#f5e0ff', muted: '#a878c0', accent: '#ff2fd6', accent2: '#39e6ff', glow: 'rgba(255,47,214,.4)',
    } },

    // 8 — retro gamers. 8-bit, PICO-8 palette.
    8: { name: '8-Bit', pack: 'eightbit', ui: {
      bg: '#141428', bgglow: '#25254a', surface: '#1d1d38', border: '#34345c',
      text: '#e8e8ff', muted: '#8a8ab8', accent: '#ff004d', accent2: '#29adff', glow: 'rgba(255,0,77,.35)',
    } },

    // 9 — wellness, nature & artist types. Raked sand and ink wash. Light.
    9: { name: 'Zen Garden', pack: 'zen', ui: {
      bg: '#e9e4d8', bgglow: '#f7f3e9', surface: '#f4f0e6', border: '#d2cab6',
      text: '#3a352c', muted: '#8c8474', accent: '#4a7c59', accent2: '#c98d5a', glow: 'rgba(74,124,89,.2)',
      bar: 'rgba(244,240,230,.82)', label: '#3a352c', labelshadow: 'rgba(255,255,255,.85)',
    } },
  };

  const m = (((root.location && root.location.hostname) || '').match(/^(\d)\./) || []);
  // window.GIFOS_THEME (set before this script) forces a theme — a dev/test
  // hook only; real users get the hostname's identity so seeding stays honest.
  GifOS.theme = (root.GIFOS_THEME && THEMES[root.GIFOS_THEME])
    || (m[1] != null && THEMES[m[1]]) || THEMES.home;

  // Chrome overrides apply before first paint (this script loads in <head>
  // order, ahead of desktop.js). A user's own wallpaper choice still wins —
  // these are defaults, not locks.
  if (GifOS.theme.ui && root.document) {
    for (const k in GifOS.theme.ui) root.document.documentElement.style.setProperty('--' + k, GifOS.theme.ui[k]);
  }
})(typeof window !== 'undefined' ? window : globalThis);
