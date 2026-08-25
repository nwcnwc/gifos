// no-topology.js — THIS REPO IS PUBLIC. IT MUST NOT NAME THE MACHINES.
//
// WHY, and it had already happened. On 2026-08-12 a sweep found 96 references
// to the fleet's real hostnames across 24 tracked files — including
// `site/browser-support.json`, which the SITE SERVES, and its three frozen
// release snapshots, so the names were live on gifos.app; two real phone
// serial numbers in a runbook; and the whole fleet listed by name in CLAUDE.md
// itself. A force-push scrub in July had cleaned the tree once and the names
// simply grew back, because nothing was watching. Documentation of a rule is
// not enforcement of a rule.
//
// THE TRICK THIS FILE TURNS. A guard that hunts for hostnames would have to
// CONTAIN the hostnames, which is the leak it exists to prevent. So it never
// learns them: it reads them from the LOCAL, never-committed hosts file that
// legitimately knows the topology (`~/.gifos-behavior-hosts.json`, the same one
// the behaviour battery and fleet.js use) and greps the tree for what it finds
// there. The repo stays ignorant; the box that runs the gate does the checking.
//
// Anything genuinely shared belongs here as a ROLE: <behavior-box>, <gate-host>,
// <orchestrator>, <gpu-box>, <llm-box>, <monitor-pi>, <resident-model>, or the
// <orchestrator-tailnet-addr> form fleet.js prints. Core counts, architectures,
// chromium revisions and every measurement are hardware facts, not identities —
// they stay.
//
// AND THEY GREW BACK AGAIN. On 2026-08-25 this guard was RED with eight fresh
// references in six files: a gauntlet doc listing three boxes by name, the same
// hostname in a runtime.js comment AND in the frozen 0.9.13 snapshot beside it
// (so it was live on gifos.app for a second time), three browser suites citing
// "red on <box>" from the 0.9.13 gate, and test/README.md. Every one of them is
// the same honest impulse — say WHICH machine measured it — and every one is a
// role in disguise: "the fastest box in the fleet" is <gpu-box>, and the number
// is the point, not the nameplate. The guard did its job; what failed was that
// a red sat unattributed. Scrubbed in the same commit that read this line.
//
// On a box with no hosts file the name check cannot run; the SHAPE checks below
// still do, and the skip is announced rather than silently passing.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const HOSTS = process.env.GIFOS_FLEET || process.env.BEHAVIOR_HOSTS
  || path.join(os.homedir(), '.gifos-behavior-hosts.json');

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

// Files allowed to contain a match, each for a NAMED reason. Keep this list
// tiny and argued — an exemption is a hole.
const EXEMPT = [
  // A children's spelling dictionary: 30k English words, some of which are
  // also, coincidentally, somebody's hostname. It is word data, not topology.
  'apps/sound-it-out/dictionary-data.js',
  // This file. It describes the rule and shows the placeholder vocabulary.
  'test/unit/no-topology.js',
];

function tracked() {
  return execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { maxBuffer: 1 << 28 })
    .toString().split('\0').filter(Boolean)
    .filter((f) => !EXEMPT.includes(f));
}

// WHAT IS SCANNED, and the cap is announced rather than assumed.
//
// `git grep -I` was the obvious tool and it is the wrong one here: it must READ
// a file to discover the file is binary, and this tree carries 600 MB of tracked
// bytes — 482 MB of it in 351 vendored bundles, wasm runtimes and packed app
// GIFs (one is 28 MB). Measured on the orchestrator, one case-insensitive pass
// over that took about three minutes at 194% CPU, which is not a citizen of a
// 300-second unit tier.
//
// So the scan reads the tracked files ITSELF and skips two classes: known binary
// extensions, and any single file over 256 KB. A quarter-megabyte in one file is
// a minified bundle or a base64 data blob, not prose that names somebody's box —
// and the count of what was skipped is PRINTED, because a silent cap reads as
// "everything was checked".
const MAX_BYTES = 262144;
const BINARY = /\.(gif|png|jpe?g|ico|woff2?|ttf|otf|eot|wasm|mp3|wav|ogg|mp4|webm|pdf|zip|gz|tgz|onnx|gguf|bin|so|a|o)$/i;
let skippedBig = 0, skippedBinary = 0, scannedBytes = 0;

function scannable() {
  const out = [];
  for (const f of tracked()) {
    if (BINARY.test(f)) { skippedBinary++; continue; }
    let n = 0;
    try { n = fs.statSync(path.join(ROOT, f)).size; } catch (e) { continue; }
    if (n > MAX_BYTES) { skippedBig++; continue; }
    out.push(f);
    scannedBytes += n;
  }
  return out;
}
const FILES = scannable();

// One combined regex decides whether a file is interesting at all; only an
// interesting file is re-tested per pattern, to say WHICH pattern and WHERE.
function scan(patterns) {
  const pats = [].concat(patterns);
  if (!pats.length) return [];
  const all = new RegExp(pats.join('|'), 'i');
  const hits = [];
  for (const f of FILES) {
    let s;
    try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
    if (!all.test(s)) continue;
    const line = s.split('\n').findIndex((l) => all.test(l)) + 1;
    hits.push(f + ':' + line);
  }
  return hits;
}

// ---- 1. the names, read from the file the repo is not allowed to know -------
let fleet = null;
try { fleet = JSON.parse(fs.readFileSync(HOSTS, 'utf8')); } catch (e) {}
if (!fleet) {
  console.log('SKIP-NOTE — no hosts file at ' + HOSTS + ', so the NAME check could not run here.');
  console.log('  The shape checks below still ran. Run this on the box that holds the hosts file');
  console.log('  (the orchestrator) for the full guard.');
} else {
  // MACHINE NAMES ONLY — `name` and `ssh`. The hosts file also carries home
  // directories, and an earlier cut harvested the username out of them: that
  // needed the username written INTO this file to be excluded again, which is
  // the leak this guard exists to prevent, and it is pointless anyway because
  // git authorship makes the author's name public by construction. So: the boxes
  // and the addresses, which are ours to keep private, and nothing else.
  const names = new Set();
  for (const h of (fleet.hosts || [])) {
    for (const k of ['name', 'ssh']) if (h && h[k]) names.add(String(h[k]));
  }
  // the hosts file's own words for "no ssh, run it here" — not machine names
  for (const generic of ['local', 'localhost']) names.delete(generic);
  const hostish = [...names].filter((n) => n.length >= 4);
  check('the hosts file named some machines to look for', hostish.length > 0, hostish.length + ' name(s)');
  const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // ONE pass for every name; only if something matched do we spend a pass per
  // name to say WHICH. The clean case is the fast case.
  const dirty = scan(hostish.map(esc));
  const offenders = {};
  if (dirty.length) {
    for (const n of hostish) {
      const hits = scan([esc(n)]);
      if (hits.length) offenders[n.slice(0, 2) + '…'] = hits;   // report WHERE, never WHAT
    }
  }
  check('no tracked file names a machine from the fleet (use a <role> placeholder)',
    dirty.length === 0, dirty.length ? offenders : undefined);
}

// ---- 2. the shapes, which need no hosts file -------------------------------
// A tailnet address, an adb device serial, a bot token. These are patterns, so
// they are safe to write down.
const SHAPES = [
  ['a tailnet address (100.64/10)', '(^|[^0-9.])100\\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\\.[0-9]{1,3}\\.[0-9]{1,3}([^0-9]|$)'],
  ['a tailscale magic-dns name', '[a-z0-9-]+\\.[a-z0-9-]+\\.ts\\.net'],
  ['a telegram bot token', '[0-9]{8,10}:[A-Za-z0-9_-]{30,}'],
  // A serial is matched WHERE IT IS USED, not by its shape: a bare
  // `[A-Z]{2}[0-9][0-9A-Z]{6,}` also describes half the identifiers in a
  // minified bundle, and it flagged 29 vendored libraries on its first run.
  // `adb -s <serial>` cannot be a false positive, and a placeholder
  // (`adb -s <phone-a-serial>`) does not match because `<` is not in the class.
  ['a device serial handed to adb', 'adb +(-[a-z] +)*-s +[A-Za-z0-9]{6,}'],
];
const shapeDirty = scan(SHAPES.map(([, re]) => re));
for (const [what, re] of SHAPES) {
  const hits = shapeDirty.length ? scan([re]) : [];
  check('no tracked file carries ' + what, hits.length === 0, hits.length ? hits : undefined);
}

// ---- 3. the rule is written down where the next agent will read it ---------
const claude = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
check('CLAUDE.md says machine names do not belong in this repo',
  /machine names.{0,80}do not belong in it|public and\s*machine names/is.test(claude));

// NOT VACUOUS: if the scan reads nothing, it proves nothing. And say out loud
// what it did NOT read, so nobody mistakes the cap for coverage.
check('the scan actually read the tree', FILES.length > 200 && scannedBytes > 1e6,
  { files: FILES.length, MB: +(scannedBytes / 1e6).toFixed(1),
    skippedOver256KB: skippedBig, skippedBinary: skippedBinary });

console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
