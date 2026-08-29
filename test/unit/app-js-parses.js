/*
 * Every JavaScript file an app ships must PARSE.
 *
 * This is not a style check. A SyntaxError anywhere in a bundle means the
 * WHOLE bundle is dead — the engine never executes a line of it — so a single
 * mangled character can take an entire app off the air while the store still
 * lists it, the GIF still installs, and the first screen still paints from
 * the HTML.
 *
 * That is exactly what happened to duck-hunt. A vendor patch in vendor.mjs
 * matched the TAIL of a ternary:
 *
 *   document.fullscreenElement ? t.stage.hud.fullscreenLink = "unfullscreen (f)"
 *                              : t.stage.hud.fullscreenLink = "fullscreen (f)"
 *
 * replacing everything from the `?` branch onward and leaving
 * `document.fullscreenElement?t.stage.hud.fullscreenLink=""` — a conditional
 * with no `:` arm. 1.5 MB of pixi and game code stopped parsing,
 * window.DuckHuntStart was never defined, and Play did nothing from
 * 2026-08-24 until app-smoke.js noticed the app was a menu with no game
 * behind it. Nothing else in the gate had an opinion.
 *
 * ES modules are parsed under different rules and cannot be checked with
 * vm.Script; they are counted and skipped rather than passed silently, so a
 * regression that turns a classic file into an unparseable one still fails.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APPS = path.join(ROOT, 'apps');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// A module, not a classic script: vm.Script parses scripts only.
const isModule = (file, src) =>
  /-esm\.js$/.test(file) ||
  /\bimport\.meta\b/.test(src) ||
  /^\s*export\s+(default|const|let|var|function|class|\{|\*)/m.test(src) ||
  /^\s*import\s+(?:[\w${}\s,*]+\s+from\s+)?['"]/m.test(src);

const apps = fs.readdirSync(APPS).filter((d) => fs.existsSync(path.join(APPS, d, 'listing.json')));
check('there are apps to scan', apps.length > 0, apps.length);

const broken = [];
let scripts = 0, modules = 0;
for (const slug of apps) {
  for (const file of walk(path.join(APPS, slug), [])) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file);
    if (isModule(file, src)) { modules++; continue; }
    scripts++;
    try {
      new vm.Script(src, { filename: rel });
    } catch (e) {
      broken.push(rel + ' — ' + e.message);
    }
  }
}

check('the scan actually read the app trees', scripts > 500, { scripts: scripts, modules: modules });
check('every classic script an app ships parses', broken.length === 0, broken);

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nall ok');
