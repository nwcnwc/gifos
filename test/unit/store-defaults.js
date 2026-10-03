// store-defaults.js — the DEFAULT STORE APPS pattern (gifos-install.js):
// first-party listings every computer carries, installed from the store
// lazily after the Home Screen paints, instead of built from source like the
// sample apps. Guards, with no browser:
//   1. every default names a listing that is in the catalog, signed, with a
//      cover and a GIF inside site/ (the publish boundary);
//   2. a default that goes in the Providers folder is a network-less provider
//      that provides the role it is assigned to;
//   3. both pages that install load the shared installer, and the Home Screen
//      seeds AFTER render, never in front of it, through saveItem;
//   4. the meeting's own seed and the Home Screen's share one stamp per slug,
//      so a computer never downloads a default twice.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(ROOT, 'site');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); } }

// Load the module the way a page does: a window with a GifOS namespace.
const win = { GifOS: {}, fetch: () => Promise.reject(new Error('no network in a unit test')), crypto: {} };
vm.runInNewContext(fs.readFileSync(path.join(SITE, 'js', 'gifos-install.js'), 'utf8'), { window: win, globalThis: win });
const inst = win.GifOS.install;
check('gifos-install.js attaches GifOS.install with defaults, stampKey, listing and fetchApp', !!inst && Array.isArray(inst.defaults) && typeof inst.stampKey === 'function' && typeof inst.listing === 'function' && typeof inst.fetchApp === 'function');
check('there is at least one default store app, and it is the Whisper captions provider', inst.defaults.some((d) => d.slug === 'offline-stt-whisper' && d.folder === 'sys_providers' && d.role === 'stt'));

for (const d of inst.defaults) {
  const appJson = path.join(SITE, 'apps', d.slug, 'app.json');
  check(d.slug + ': listed in the catalog', fs.existsSync(appJson));
  if (!fs.existsSync(appJson)) continue;
  const app = JSON.parse(fs.readFileSync(appJson, 'utf8'));
  check(d.slug + ': the catalog record pins sha256, bytes and a gifos.app signature', /^[0-9a-f]{64}$/.test(app.sha256 || '') && app.bytes > 0 && app.signature && app.signature.id === 'gifos.app', JSON.stringify(app.signature));
  check(d.slug + ': the GIF lives inside site/ (the publish boundary) at the catalog path', typeof app.gif === 'string' && fs.existsSync(path.join(SITE, app.gif.replace(/^\//, ''))), app.gif);
  check(d.slug + ': the cover exists', fs.existsSync(path.join(SITE, 'apps', d.slug, 'cover.jpg')));
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps', d.slug, 'manifest.json'), 'utf8'));
  if (d.folder === 'sys_providers') {
    const roles = (m.provides && m.provides.ai) || [];
    const caps = m.capabilities || {};
    check(d.slug + ': a Providers-folder default provides its role and is network-less', roles.indexOf(d.role) >= 0 && !caps.network && !caps.api, JSON.stringify({ roles, caps }));
  }
  check(d.slug + ': the stamp key is namespaced per slug', inst.stampKey(d.slug) === 'gifos_store_default_' + d.slug);
}

const index = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
const run = fs.readFileSync(path.join(SITE, 'run.html'), 'utf8');
const desktop = fs.readFileSync(path.join(SITE, 'js', 'desktop.js'), 'utf8');
const runtime = fs.readFileSync(path.join(SITE, 'js', 'runtime.js'), 'utf8');
check('the Home Screen loads the shared installer', /<script src="js\/gifos-install\.js"><\/script>/.test(index));
check('the meeting page loads it too, ahead of the runtime', run.indexOf('<script src="js/gifos-install.js">') > 0 && run.indexOf('<script src="js/gifos-install.js">') < run.indexOf('<script src="js/runtime.js">'));
check('the runtime\'s one-tap install goes through GifOS.install (one verified path)', /GifOS\.install\.listing\(slug\)/.test(runtime) && /GifOS\.install\.fetchApp\(app, note, \{ provider: true \}\)/.test(runtime));
const bootLine = (desktop.match(/load\(\)\.then\(seedIfEmpty\)[^\n]*/) || [''])[0];
check('the Home Screen seeds default store apps AFTER render in the boot chain', bootLine.indexOf('.then(render)') > 0 && bootLine.indexOf('scheduleStoreDefaults') > bootLine.indexOf('.then(render)'), bootLine.slice(0, 160));
check('…and does not hold the chain: the seed is armed, not awaited (the run/place hand-offs and the orphan sweep go on at once)', /\.then\(\(\) => \{ scheduleStoreDefaults\(\); \}\)\.then\(noteRetiredBuild\)/.test(bootLine), bootLine.slice(0, 200));
check('…lazily: a delay, then an idle callback', /setTimeout\(idle, 6000\)/.test(desktop) && /requestIdleCallback\(go/.test(desktop));
check('…placed by saveItem into the default\'s folder, never a raw item write', /await saveItem\(\{ id: store\.uid\('item'\), kind: 'file', fileId, name, parent: d\.folder \|\| null, iconSize: 64 \}, \{ into: d\.folder \|\| null \}\)/.test(desktop) && (desktop.match(/store\.putItem\(/g) || []).length === 2);
check('…assigning the role only where nothing is assigned yet', /if \(!cfg\[d\.role\] \|\| \(!cfg\[d\.role\]\.app && !cfg\[d\.role\]\.url\)\)/.test(desktop));
check('…stamping done / tried so a deletion is respected and a failure retries after a day', /localStorage\.setItem\(key, 'done'\)/.test(desktop) && /'tried:' \+ Date\.now\(\)/.test(desktop) && /86400000/.test(desktop));
check('the meeting\'s own seed writes the same stamp the Home Screen reads', /WHISPER_SEED_KEY = 'gifos_store_default_' \+ 'offline-stt-whisper'/.test(run));

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
