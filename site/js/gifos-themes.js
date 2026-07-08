/*
 * gifos-themes.js — the theme cascade loader.
 *
 * A THEME is just a folder of files. The DEFAULT theme lives in /themes; each
 * numbered computer (0-9.gifos.app) may override it with a /themes/<digit>/
 * folder. Resolution is per-file: a subdomain uses /themes/<digit>/<file> when
 * that file exists, and falls back to /themes/<file> when it doesn't. So:
 *
 *   ADD OR RESKIN A THEME  =  drop a  themes/<digit>/  folder.
 *     themes/theme.js   themes/icons.js          ← the default look (Aurora)
 *     themes/7/theme.js themes/7/icons.js        ← override for 7.gifos.app
 *
 * A theme folder holds (all optional; omit one and the base file is used):
 *   theme.js  — calls GifOS.setTheme({ name, pack, chrome:{cssVar:value} })
 *   icons.js  — the icon-art pack (registers with GifOS.iconPacks)
 *   eggs.js   — bonus seed apps for THIS computer only: GifOS.addEggs([...])
 *
 * All themes seed the SAME default apps (from sample-apps.js), automatically
 * dressed in the theme — icons.js draws their animated icons in-style and the
 * chrome vars colour their HTML. eggs.js is the seam for extras that exist on
 * one digit only; the seeder files each into a named folder (Games, Tools, …).
 *
 * Loading is a parser-blocking base-then-override document.write, so chrome
 * lands BEFORE first paint (no flash) and a missing override file just 404s and
 * leaves the base in place. icons.js + eggs.js are only pulled on the pages that
 * render/seed icons (the desktop), never on the meeting/app pages where art is
 * baked into GIFs already.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  GifOS.theme = GifOS.theme || { name: 'Aurora', pack: 'aurora', ui: {} };

  // Each theme.js calls this. chrome REPLACES (not merges) the previous set, so
  // an override folder fully defines the look — any base var it omits reverts to
  // the desktop.css :root default rather than leaking through.
  GifOS.setTheme = function (cfg) {
    cfg = cfg || {};
    if (cfg.name) GifOS.theme.name = cfg.name;
    if (cfg.pack) GifOS.theme.pack = cfg.pack;
    if (cfg.eggs) GifOS.theme.eggs = cfg.eggs;
    if (cfg.chrome) {
      if (root.document) {
        const prev = GifOS.theme.ui || {};
        for (const old in prev) if (!(old in cfg.chrome)) root.document.documentElement.style.removeProperty('--' + old);
        for (const k in cfg.chrome) root.document.documentElement.style.setProperty('--' + k, cfg.chrome[k]);
      }
      GifOS.theme.ui = cfg.chrome;
    }
  };

  // eggs.js files call this to add bonus seed apps for their computer. It
  // ACCUMULATES (base eggs + the override's), so a subdomain's extras stack on
  // any shared ones. Each egg: { name, appId, accent:[r,g,b], html, folder }.
  GifOS.addEggs = function (list) {
    if (list && list.length) GifOS.theme.eggs = (GifOS.theme.eggs || []).concat(list);
  };

  // Which folder overrides the base? The hostname digit (0-9.gifos.app), or a
  // window.GIFOS_THEME dev/test override ('' or 'home' = the plain default).
  const digit = (((root.location && root.location.hostname) || '').match(/^(\d)\./) || [])[1];
  let override = (root.GIFOS_THEME != null) ? root.GIFOS_THEME : digit;
  if (override === 'home' || override === 'default') override = '';

  const dirs = ['themes'];
  if (override != null && override !== '' && /^[a-z0-9-]{1,32}$/i.test(String(override))) dirs.push('themes/' + override);

  // Only the desktop loads gifos-icons.js first (so GifOS.iconPacks exists);
  // the meeting/app pages skip the art packs entirely.
  const wantIcons = !!GifOS.iconPacks;
  const d = root.document;
  if (d) {
    for (let i = 0; i < dirs.length; i++) {
      d.write('<scr' + 'ipt src="/' + dirs[i] + '/theme.js"></scr' + 'ipt>');
      if (wantIcons) {
        d.write('<scr' + 'ipt src="/' + dirs[i] + '/icons.js"></scr' + 'ipt>');
        d.write('<scr' + 'ipt src="/' + dirs[i] + '/eggs.js"></scr' + 'ipt>');
      }
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
