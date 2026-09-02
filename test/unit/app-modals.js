/*
 * WINDOW MODALS IN AN APP FRAME.
 *
 * An app runs in a sandboxed iframe with no allow-modals, so Chrome IGNORES
 * window.alert / confirm / prompt: alert shows nothing, confirm returns FALSE
 * and prompt returns NULL, each without asking. Nothing throws and nothing is
 * logged where an author would see it, so an app that leans on them looks like
 * it simply does not work:
 *
 *   keeweb        an entry could not be deleted, a group could not be named,
 *                 a vault could not be replaced or imported — three of its
 *                 four write paths.
 *   bible         a reading plan could not be stopped.
 *   sound-it-out  eight messages, the app's only voice, all invisible.
 *   excalidraw    a board could not be deleted.
 *   fortune-sheet "New workbook" did nothing.
 *   restfox       Delete never deleted; import errors were invisible.
 *   my-mind, radius-raid, besogo, piskel, bip39, pong  — the same, in
 *                 vendored engines nobody is going to rewrite.
 *
 * Two of the three are now answered by the runtime shim in
 * site/js/runtime.js (clientShim): alert() paints an overlay in a closed
 * shadow root, and confirm() is a two-press question — first call shows it and
 * returns false, a second call with the same text after a FRESH user gesture
 * returns true. This test guards that shim, because an app calling alert() is
 * only safe while it exists.
 *
 * prompt() cannot be answered — there is no way to invent a string
 * synchronously — so it stays ignored, and app code must not call it.
 */
const fs = require('fs');
const path = require('path');
const acorn = (() => { try { return require('acorn'); } catch (e) { return null; } })();

const ROOT = path.join(__dirname, '..', '..');
const APPS = path.join(ROOT, 'apps');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

// ---- the shim is present and says what it must ----------------------------
const runtime = fs.readFileSync(path.join(ROOT, 'site', 'js', 'runtime.js'), 'utf8');
check('runtime replaces window.alert for apps', /window\.alert\s*=\s*function/.test(runtime));
check('runtime replaces window.confirm for apps', /window\.confirm\s*=\s*function/.test(runtime));
check('the confirm shim counts trusted gestures, so a loop cannot self-confirm',
  /isTrusted/.test(runtime) && /gestures/.test(runtime));
check('the overlay is isolated from app CSS (shadow root, not a bare div)',
  /attachShadow/.test(runtime));
check('runtime does NOT fake prompt(), which cannot be answered synchronously',
  !/window\.prompt\s*=\s*function/.test(runtime));

// ---- no app calls prompt() in its own code --------------------------------
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

if (!acorn) {
  // Parsing by regex is what made an earlier version of this scan miss three
  // apps: a regex literal containing a quote swallowed most of every file.
  // Say so rather than pass on a scan that did not happen.
  check('acorn is available to parse app code', false, 'npm install acorn');
} else {
  const NAMES = new Set(['prompt']);
  // Vendor prompt() calls that a person cannot reach, each checked rather than
  // assumed. Everything else — app code AND vendor — must not call prompt(),
  // because the sandbox answers it with null and the feature simply does not
  // happen. my-mind's "Set item value" and piskel's layer opacity were exactly
  // that, and both now ask through gifosAsk instead.
  const KNOWN_UNREACHABLE = new Set([
    // dat.gui builds its preset UI only under gui.remember(), which fluid
    // never calls, so the "Enter a new preset name" prompt is never created.
    'fluid/vendor/dat.gui.min.js',
    // emscripten's stdin shim. Reached only if the wasm module reads stdin;
    // espeak is handed its text and tesseract its image, so neither does.
    'offline-tts/vendor/espeak.js',
    'tesseract/vendor/tesseract-core-simd-lstm.js',
    // The same emscripten stdin shim ("Input: "). ffmpeg is handed its
    // arguments and every invocation in app.js passes -y, so it never asks
    // on stdin; sql.js is a library and sqlite never reads stdin; TIC-80's
    // console is drawn in its own canvas, and its other prompt is the
    // ASSERTIONS-build abort dialog, which treats a null answer as "ignore".
    'ffmpeg-studio/vendor/ffmpeg-core.js',
    'sql-playground/vendor/sql-wasm.js',
    'tic80/vendor/tic80.js',
    // A Worker script: it guards on globalThis.window?.prompt, and a Worker
    // has no window, so the branch is dead by construction.
    'cascade-studio/vendor/cascade-worker.js'
  ]);
  const offenders = [];
  let scanned = 0;
  for (const slug of fs.readdirSync(APPS)) {
    if (!fs.existsSync(path.join(APPS, slug, 'listing.json'))) continue;
    for (const file of walk(path.join(APPS, slug), [])) {
      const rel = path.relative(path.join(APPS, slug), file);
      if (KNOWN_UNREACHABLE.has(slug + '/' + rel.split(path.sep).join('/'))) continue;
      const src = fs.readFileSync(file, 'utf8');
      let ast;
      try { ast = acorn.parse(src, { ecmaVersion: 'latest' }); }
      catch (e) { try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }); } catch (e2) { continue; } }
      scanned++;
      const shadowed = new Set();
      const seen = [];
      (function visit(n) {
        if (!n || typeof n.type !== 'string') return;
        if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ClassDeclaration')
            && n.id && NAMES.has(n.id.name)) shadowed.add(n.id.name);
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && NAMES.has(n.id.name)) shadowed.add(n.id.name);
        if (n.type === 'CallExpression') {
          const c = n.callee;
          if (c.type === 'Identifier' && NAMES.has(c.name)) seen.push(c.name);
          if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier'
              && /^(window|self|globalThis|root)$/.test(c.object.name) && NAMES.has(c.property.name)) seen.push(c.property.name);
        }
        for (const k of Object.keys(n)) {
          const v = n[k];
          if (Array.isArray(v)) v.forEach(visit);
          else if (v && typeof v === 'object' && typeof v.type === 'string') visit(v);
        }
      })(ast);
      for (const name of seen) if (!shadowed.has(name)) offenders.push(slug + '/' + rel + ' — ' + name + '()');
    }
  }
  check('the scan read the app trees', scanned > 200, scanned);
  check('nothing reachable calls prompt(), which the sandbox answers with null', offenders.length === 0, offenders);
}

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nall ok');
