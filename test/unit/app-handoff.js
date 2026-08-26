// THE HANDOFF VOCABULARY LIVES IN THREE FILES, AND THEY MUST NOT DRIFT.
//
// docs/app-handoff.md. An app->app document has a KIND and a set of FIELDS,
// and both are the OS's to define — an app may not name its own, for the same
// reason a provider may not invent a capability type (docs/providers.md:
// "third-party text does not get to define what a checkbox means"). The user
// reads a sentence before agreeing, and the app does not get to write it.
//
// That decision costs three copies:
//
//   site/js/runtime.js      HANDOFF_KINDS   — what is ENFORCED and stored
//   site/js/gifos-perms.js  HANDOFF_LABELS  — what is SAID on the launch sheet
//   docs/app-handoff.md                     — what is DOCUMENTED
//
// A kind added to one and not the others is silent in the worst way: the
// runtime happily stores something the permission sheet never mentions. So
// this pins them together, and pins the apps that use them to the vocabulary.
//
// It also EXECUTES the one rule that everything else rests on. handoffShape()
// rebuilds the document from the OS's field list instead of copying the app's
// object, which is what makes the consent sheet honest by construction: the
// sheet shows what is stored because the sheet's list IS what is stored. A
// regression there would show seven tidy rows with an eighth key riding along
// underneath, invisible to exactly the person being asked.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const runtime = fs.readFileSync(path.join(ROOT, 'site', 'js', 'runtime.js'), 'utf8');
const perms = fs.readFileSync(path.join(ROOT, 'site', 'js', 'gifos-perms.js'), 'utf8');
const doc = fs.readFileSync(path.join(ROOT, 'docs', 'app-handoff.md'), 'utf8');

// Slice a top-level `<decl> NAME = {…};` out of a source file by matching
// braces. Cheaper and far more legible than loading the whole runtime, which
// wants a DOM.
function literal(src, name) {
  const at = src.indexOf(name + ' = {');
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  if (end < 0) return null;
  try { return new Function('return ' + src.slice(src.indexOf('{', at), end))(); }
  catch (e) { return null; }
}
function fnSource(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  return end < 0 ? null : src.slice(at, end);
}

const KINDS = literal(runtime, 'HANDOFF_KINDS');
const LABELS = literal(perms, 'HANDOFF_LABELS');
check('runtime.js defines HANDOFF_KINDS', !!KINDS);
check('gifos-perms.js defines HANDOFF_LABELS', !!LABELS);

if (KINDS && LABELS) {
  const rk = Object.keys(KINDS).sort(), pk = Object.keys(LABELS).sort();
  check('the runtime and the permission sheet know the SAME kinds', rk.join() === pk.join(), { runtime: rk, perms: pk });

  rk.forEach((k) => {
    const spec = KINDS[k];
    check(k + ': has a label, a "never" line and fields',
      !!(spec && spec.label && spec.never && Array.isArray(spec.fields) && spec.fields.length));
    // The doc's table is what a future author reads before adding a kind.
    check(k + ': is in the docs/app-handoff.md table', doc.includes('`' + k + '`'));
    (spec.fields || []).forEach((f) => {
      check(k + '.' + f[0] + ': the doc names this field', new RegExp('`' + k + '`[\\s\\S]{0,400}?\\b' + f[0] + '\\b').test(doc),
        'add it to the kinds table in docs/app-handoff.md');
      check(k + '.' + f[0] + ': has a human label and a known type',
        !!f[1] && ['money', 'age', 'text'].indexOf(f[2]) >= 0, f);
    });
    // Both directions are said out loud on the sheet, or a user cannot find
    // out from it which of their apps can see this.
    const L = LABELS[k];
    check(k + ': the sheet has wording for BOTH offering and taking', !!(L && L.offers && L.takes && L.desc));
  });
}

// ---- THE RULE THAT DOES THE WORK -------------------------------------------
const shapeSrc = fnSource(runtime, 'handoffShape');
check('runtime.js defines handoffShape', !!shapeSrc);
if (shapeSrc && KINDS) {
  const handoffShape = new Function(shapeSrc + '; return handoffShape;')();
  const spec = KINDS['finance.plan'];
  const out = handoffShape(spec, {
    currentAge: 45, netWorth: 412000, portfolio: 180000, asOf: '2026-08-25',
    // Everything below is what an app might try to smuggle past the sheet.
    accountNumber: '4111111111111111',
    institutions: ['Bank of America'],
    notes: 'anything at all',
  });
  const keys = Object.keys(out).sort();
  check('handoffShape keeps only the fields the OS named',
    keys.join() === ['asOf', 'currentAge', 'netWorth', 'portfolio'].join(), keys);
  check('…so an undeclared key cannot ride along under the consent sheet',
    !('accountNumber' in out) && !('institutions' in out) && !('notes' in out));
  check('money and age fields are coerced to numbers',
    handoffShape(spec, { netWorth: '412000' }).netWorth === 412000);
  check('a non-numeric money field is dropped, not stored as NaN',
    !('netWorth' in handoffShape(spec, { netWorth: 'lots' })));
  check('text fields are capped', handoffShape(spec, { asOf: 'x'.repeat(500) }).asOf.length === 120);
  check('a document with nothing recognisable comes back empty',
    Object.keys(handoffShape(spec, { nope: 1 })).length === 0);
}

// ---- the guards are still in the broker ------------------------------------
check('an offer is refused unless the manifest declared the kind',
  /handoffGuard\(manifest, 'offers', kind\)/.test(runtime));
check('a take is refused unless the manifest declared the kind',
  /handoffGuard\(manifest, 'takes', kind\)/.test(runtime));
check('handoffGuard refuses a kind GifOS does not know',
  /HANDOFF_KINDS\[kind\][\s\S]{0,120}HANDOFF_KIND_ERR/.test(runtime));
// A guest looking at a mirror of somebody else's app must not reach this
// computer's shelf in either direction.
check('offering is refused on a guest mount', /brokerHandoffOffer[\s\S]{0,900}db && db\.owner/.test(runtime));
check('taking resolves null on a guest mount', /brokerHandoffTake[\s\S]{0,600}db && db\.owner\)\) return Promise\.resolve\(null\)/.test(runtime));
// The sheet is raised BEFORE anything is written, every time, with no
// remembered consent — the numbers differ on every offer.
// Order inside the broker itself, rather than a distance in the file: the
// sheet must be awaited before anything reaches the shelf, and a refactor that
// moved the write earlier would otherwise pass a proximity regex.
{
  const offer = fnSource(runtime, 'brokerHandoffOffer') || '';
  const ask = offer.indexOf('askHandoff('), write = offer.indexOf('setState(HANDOFF_KEY');
  check('the offer sheet is raised before the shelf is written', ask >= 0 && write > ask, { ask, write });
  check('…and the shape is taken before the sheet, so the sheet shows what gets stored',
    offer.indexOf('handoffShape(') >= 0 && offer.indexOf('handoffShape(') < ask);
}
check('nothing remembers a previous yes', !/handoff[A-Za-z]*(Acked|Remember|Always)/i.test(runtime));
// The shelf is the OS's, never an app's storage.
check('the shelf lives in OS state, not in an app db', /HANDOFF_KEY = 'sys::handoff'/.test(runtime));

// ---- and the apps that use it ----------------------------------------------
const appsDir = path.join(ROOT, 'apps');
const declared = [];
fs.readdirSync(appsDir).forEach((slug) => {
  const mf = path.join(appsDir, slug, 'manifest.json');
  if (!fs.existsSync(mf)) return;
  let m = null;
  try { m = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch (e) { return; }
  if (!m.handoff) return;
  ['offers', 'takes'].forEach((dir) => {
    (m.handoff[dir] || []).forEach((k) => declared.push({ slug, dir, kind: k }));
  });
});
declared.forEach((d) => {
  check(d.slug + ' handoff.' + d.dir + ' "' + d.kind + '" is a kind GifOS knows',
    !!(KINDS && KINDS[d.kind]));
});
// The pair this shipped for. If either half stops declaring it, the feature is
// dead and nothing else would say so.
check('the Financial Tracker OFFERS finance.plan',
  declared.some((d) => d.slug === 'finance' && d.dir === 'offers' && d.kind === 'finance.plan'));
check('the Retirement Calculator TAKES finance.plan',
  declared.some((d) => d.slug === 'retirement' && d.dir === 'takes' && d.kind === 'finance.plan'));
// A kind nobody produces and a kind nobody consumes are both dead vocabulary.
if (KINDS) {
  Object.keys(KINDS).forEach((k) => {
    check('some app offers "' + k + '"', declared.some((d) => d.dir === 'offers' && d.kind === k));
    check('some app takes "' + k + '"', declared.some((d) => d.dir === 'takes' && d.kind === k));
  });
}

// The app-facing contract has to be written down where app authors read it.
const llms = fs.readFileSync(path.join(ROOT, 'site', 'llms.txt'), 'utf8');
check('site/llms.txt documents gifos.handoff', /gifos\.handoff/.test(llms) && /handoff\.offer/.test(llms));
check('…and says the OS drops fields it did not ask for',
  /rebuilds the document from|dropped rather than carried/i.test(llms));

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
