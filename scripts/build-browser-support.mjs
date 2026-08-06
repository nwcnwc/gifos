#!/usr/bin/env node
/*
 * build-browser-support.mjs — carry site/browser-support.json into the ONE
 * place that cannot fetch it: the ES5 preflight inlined at the top of
 * site/run.html.
 *
 * WHY GENERATE INSTEAD OF FETCH. The obvious alternative — paint a generic
 * verdict instantly and enrich it with real version numbers once a
 * fetch('/browser-support.json') lands a beat later — cannot work HERE, and
 * not for a style reason:
 *
 *   1. The preflight's whole job is to run on a browser too old to run GifOS.
 *      It is ES5 on purpose. `fetch` is ES2015-era and Promise may itself be
 *      one of the MISSING capabilities the screen exists to report; a message
 *      that needs Promise to explain that you have no Promise is a joke.
 *   2. It must work before anything else, from cache, offline, and from a
 *      frozen /versions/<x.y.z>/ snapshot where the JSON's path may not even
 *      resolve the same way.
 *   3. Copy that arrives late REWRITES ITSELF UNDER THE READER. "Your browser
 *      is too old" becoming "Your Safari 14 is too old" a second later reads
 *      as a page that is not sure. The one screen whose entire purpose is to
 *      be believed should not flicker.
 *
 * So this follows the repo's existing GENERATED-BUT-COMMITTED doctrine — the
 * same one scripts/build-app-catalog.mjs uses for site/apps/ — because Pages
 * serves static files and there is no build step on deploy. The JSON stays the
 * single source of truth; this script stamps it into run.html between markers;
 * `--check` fails if the committed page has drifted from the JSON, and
 * test/unit/browser-support.js runs that check in the gate. Nothing is
 * hand-maintained twice.
 *
 * The generated block is COPY ONLY — browser names and minimum versions for
 * the sentence the visitor reads. The preflight's verdict is feature detection
 * and stays feature detection; a wrong number here makes a message slightly
 * off, and can never wrongly admit or wrongly turn away a browser.
 *
 * Run: node scripts/build-browser-support.mjs [--check]
 *   --check  verify the committed run.html matches the JSON; write nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'site', 'browser-support.json');
const PAGE = path.join(ROOT, 'site', 'run.html');
const CHECK = process.argv.includes('--check');

const BEGIN = '/* ==== BEGIN GENERATED from site/browser-support.json — scripts/build-browser-support.mjs ==== */';
const END = '/* ==== END GENERATED ==== */';

let errors = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); errors++; };

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// ---- validate the source before trusting it ---------------------------------
// A support matrix that lies is worse than none, and the failure mode is silent
// (a slightly wrong number in a sentence nobody re-reads). So the shape is
// checked here, once, where it is cheap.
const FEATURES = Object.keys(data.features || {});
const STATES = ['supported', 'unsupported', 'unknown'];
if (!FEATURES.length) fail('no features defined');
for (const [id, f] of Object.entries(data.features || {})) {
  for (const r of f.requires || []) {
    if (!data.requirements[r]) fail('feature ' + id + ' requires unknown requirement id "' + r + '"');
  }
  if (f.gatedBy && !data.requirements[f.gatedBy]) fail('feature ' + id + ' is gatedBy unknown requirement "' + f.gatedBy + '"');
}
for (const b of data.browsers || []) {
  for (const feat of FEATURES) {
    const s = (b.support || {})[feat];
    if (!s) { fail(b.id + ' has no entry for feature "' + feat + '"'); continue; }
    if (!STATES.includes(s.state)) fail(b.id + '.' + feat + ': state "' + s.state + '" is not one of ' + STATES.join('/'));
    // "supported" is a PROMISE that a number is attached; "unknown" is a
    // promise that one is NOT — an unknown carrying a version is somebody
    // having guessed, which is the exact thing this file exists to avoid.
    if (s.state === 'supported' && !s.min) fail(b.id + '.' + feat + ': state supported with no `min` version');
    if (s.state !== 'supported' && s.min) fail(b.id + '.' + feat + ': state ' + s.state + ' must not carry a `min`');
    if (s.why && !data.requirements[s.why]) fail(b.id + '.' + feat + ': why="' + s.why + '" is not a requirement id');
    if (s.confidence && !data.confidence[s.confidence]) fail(b.id + '.' + feat + ': confidence "' + s.confidence + '" is not declared');
  }
}
const byId = Object.fromEntries((data.browsers || []).map((b) => [b.id, b]));
for (const id of data.copy.genericOrder) {
  if (!byId[id]) fail('copy.genericOrder names unknown browser "' + id + '"');
  else if (byId[id].support[data.copy.genericFeature].state !== 'supported') fail('copy.genericOrder names "' + id + '", which is not `supported` for ' + data.copy.genericFeature + ' — the generic sentence would quote a number we do not have');
}

// ---- build the ES5 block ----------------------------------------------------
// Keyed by `copyKey`, which is the key the preflight's ua() detector returns.
// A browser with no copyKey is documentation only (it appears on the human
// page and never in the inline table) — Chromium skins land there on purpose:
// their own user-agent names the Chrome build they are made of, and quoting
// THAT is honest where inventing an Opera number would not be.
const FEAT = data.copy.genericFeature;
const rows = (data.browsers || []).filter((b) => b.copyKey);
if (!rows.length) fail('no browser carries a copyKey — the inline table would be empty');
for (const b of rows) {
  if (b.support[FEAT].state !== 'supported') fail(b.id + ' has a copyKey but is not `supported` for ' + FEAT + ' — the preflight would promise a version that does not exist');
}

// The plain-language WHY lines (requirements[*].plain — see copy.plainDoctrine
// in the JSON): the one sentence the too-old wall shows under its verdict for
// the telling gap. They live in the JSON like every other word the screen
// speaks. Plain text only — the preflight injects them via innerHTML.
const WHY_IDS = ['webcrypto-ed25519', 'webcrypto-subtle', 'webrtc-peerconnection', 'websocket'];
for (const id of WHY_IDS) {
  const p = (data.requirements[id] || {}).plain;
  if (!p || typeof p !== 'string') fail('requirements.' + id + '.plain is missing — whyLine() in run.html would paint undefined');
  if (/[<>]/.test(p)) fail('requirements.' + id + '.plain must be plain text (no markup) — it is injected via innerHTML');
}
for (const [id, r] of Object.entries(data.requirements)) {
  if (r.plain && !WHY_IDS.includes(id)) fail('requirements.' + id + ' carries a `plain` line but whyLine() never shows it — either wire it into run.html or drop it (a line nobody sees is a second copy waiting to rot)');
}

const pad = Math.max(...rows.map((b) => b.copyKey.length));
const padL = Math.max(...rows.map((b) => JSON.stringify(b.label).length));
const generic = data.copy.genericOrder
  .map((id) => byId[id].label + ' ' + byId[id].support[FEAT].min)
  .reduce((acc, s, i, a) => acc + (i === 0 ? '' : i === a.length - 1 ? ' or ' : ', ') + s, '');

const lines = [];
lines.push(BEGIN);
lines.push('  /* Source of truth: site/browser-support.json (updated ' + data.updated + ').');
lines.push('     DO NOT EDIT BY HAND — edit the JSON and re-run the script; the release');
lines.push('     gate fails on drift (test/unit/browser-support.js).');
lines.push('     These numbers are set by ' + data.requirements[data.features[FEAT].gatedBy].label + ':');
for (const b of rows) {
  const s = b.support[FEAT];
  lines.push('       ' + (b.label + ' ').padEnd(padL + 2, ' ') + s.min + '   (' + s.since + ')');
}
lines.push('     COPY ONLY. The verdict below is feature detection and never this table. */');
lines.push('  var MIN = {');
rows.forEach((b, i) => {
  lines.push('    ' + (b.copyKey + ':').padEnd(pad + 2, ' ') + ' { label: ' + (JSON.stringify(b.label) + ',').padEnd(padL + 1, ' ') + ' min: ' + JSON.stringify(b.support[FEAT].min) + ' }' + (i === rows.length - 1 ? '' : ','));
});
lines.push('  };');
lines.push('  var GENERIC_MINS = ' + JSON.stringify(generic + ' — and up') + ';');
lines.push('  var WHY = {');
WHY_IDS.forEach((id, i) => {
  lines.push('    ' + JSON.stringify(id) + ': ' + JSON.stringify(data.requirements[id].plain) + (i === WHY_IDS.length - 1 ? '' : ','));
});
lines.push('  };');
lines.push('  ' + END);
const block = lines.join('\n');

// ---- stamp it into run.html -------------------------------------------------
const html = fs.readFileSync(PAGE, 'utf8');
const a = html.indexOf(BEGIN);
const b = html.indexOf(END);
if (a < 0 || b < 0 || b < a) {
  fail('site/run.html has no ' + (a < 0 ? 'BEGIN' : 'END') + ' marker — the preflight block cannot be located');
} else {
  const next = html.slice(0, a) + block + html.slice(b + END.length);
  if (next === html) {
    console.log((CHECK ? 'Checking' : 'Building') + ' browser-support copy table — site/run.html is current.');
  } else if (CHECK) {
    fail('site/run.html has DRIFTED from site/browser-support.json — run: node scripts/build-browser-support.mjs');
  } else {
    fs.writeFileSync(PAGE, next);
    console.log('Wrote the copy table into site/run.html (' + rows.length + ' named browser(s)).');
  }
}

if (errors) { console.error('\n' + errors + ' problem(s). Browser-support table NOT ' + (CHECK ? 'valid' : 'written cleanly') + '.'); process.exit(1); }
console.log('Browser support ' + (CHECK ? 'is current' : 'built') + ' — ' + (data.browsers || []).length + ' browser(s) × ' + FEATURES.length + ' feature(s).');
