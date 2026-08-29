/*
 * `hidden` is a UA rule — `[hidden] { display: none }` — at the LOWEST possible
 * specificity, so any author rule that gives the same element a display wins,
 * and `el.hidden = true` silently does nothing. The element stays on screen and
 * the app looks like it ignored its own state.
 *
 * This is not hypothetical. It shipped in eight apps at once:
 *
 *   fluid     .nogl{display:flex} painted an opaque "no WebGL" panel over a
 *             running simulation on every device that HAS WebGL.
 *   hat-sh    .fields{display:grid} showed "Your private key" / "Their public
 *             key" next to the password fields for the password path.
 *   wifi-card label{display:block} showed EAP method and Identity on an
 *             ordinary WPA network.
 *   keeweb    #app{display:...} showed the vault pane behind the lock gate.
 *   squoosh   .work{display:...} showed the encoder pane with no image loaded.
 *   cron-speak, tuner, json-diff — the same shape.
 *
 * The remedy each app carries is one rule, `[hidden] { display: none !important }`,
 * which puts the semantic back before anything later in the file can take it
 * away. This test is the guard: any app whose markup hides an element with the
 * attribute AND whose stylesheet gives that element a display must carry it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const APPS = path.join(ROOT, 'apps');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

// Selectors that end in a tag, .class or #id and set a display other than none.
function displayTargets(css) {
  const out = new Set();
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const d = /(^|[;{\s])display\s*:\s*([a-z-]+)/i.exec(m[2]);
    if (!d || d[2].toLowerCase() === 'none') continue;
    for (const sel of m[1].split(',')) {
      const t = sel.trim();
      const cls = t.match(/\.([\w-]+)\s*$/); if (cls) out.add('.' + cls[1]);
      const id = t.match(/#([\w-]+)\s*$/); if (id) out.add('#' + id[1]);
      const tag = t.match(/^([a-z0-9]+)$/i); if (tag) out.add(tag[1].toLowerCase());
    }
  }
  return out;
}

// Elements carrying the hidden attribute, named the ways a selector can match.
function hiddenElements(html) {
  const out = [];
  for (const m of html.matchAll(/<([a-z0-9]+)\b([^>]*\shidden(?:\s|=|>|\/))([^>]*)>/gi)) {
    const idm = /\sid\s*=\s*["']([^"']+)/.exec(m[0]);
    const clm = /\sclass\s*=\s*["']([^"']+)/.exec(m[0]);
    const names = [m[1].toLowerCase()];
    if (idm) names.push('#' + idm[1]);
    if (clm) for (const c of clm[1].split(/\s+/)) if (c) names.push('.' + c);
    out.push({ tag: m[0].replace(/\s+/g, ' ').slice(0, 90), names });
  }
  return out;
}

const neutralised = (css) => /\[hidden\][^{]*\{[^}]*display\s*:\s*none/.test(css);
const readAll = (dir, ext) => fs.readdirSync(dir).filter((f) => f.endsWith(ext))
  .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

const apps = fs.readdirSync(APPS).filter((d) => fs.existsSync(path.join(APPS, d, 'listing.json')));
check('there are apps to scan', apps.length > 0, apps.length);

const broken = [];
let scanned = 0;
for (const slug of apps) {
  const dir = path.join(APPS, slug);
  const html = readAll(dir, '.html');
  if (!html) continue;
  const css = readAll(dir, '.css');
  scanned++;
  if (neutralised(css)) continue;
  const targets = displayTargets(css);
  for (const el of hiddenElements(html)) {
    const hit = el.names.filter((n) => targets.has(n));
    if (hit.length) broken.push(slug + ': ' + el.tag + ' — display set by ' + hit.join(', '));
  }
}

check('every app scanned had markup', scanned > 100, scanned);
check('no app hides an element the stylesheet gives a display', broken.length === 0, broken);

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nall ok');
