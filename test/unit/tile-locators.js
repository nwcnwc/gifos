// tile-locators.js — a meeting tile may NEVER be identified by its whole text.
//
// WHY, and it cost a gate FLAKY on 2026-08-11. `e2e-video` did this:
//
//   aPage.locator('.tile:not(.me)', { hasText: 'Bob' })
//        .locator('.chips span', { hasText: 'camera off' })
//
// and it blew up with `strict mode violation … resolved to 2 elements`. There
// was no duplicate tile and no duplicate chip (run.html builds a tile's chips
// as ONE innerHTML, so a tile cannot carry two). What happened is that a tile's
// chips QUOTE OTHER PARTICIPANTS BY NAME:
//
//   📡 via Bob                        (this feed is relayed through Bob)
//   🔇 muted for everyone by Bob      (moderation, attributed)
//   🌫 blurred for everyone by Bob
//   📷 video off for everyone by Bob
//
// So when Cai's video happened to arrive relayed via Bob, Cai's tile contained
// the text "Bob" and matched too. Whether it does is a property of the MESH
// TOPOLOGY that run, which is why it read as a flake: same code, same box,
// different route. A `textContent.includes(name)` search is worse than the
// strict-mode throw — it silently returns the FIRST match and asserts against
// the wrong person's tile.
//
// The tile carries `<span class="name">` holding exactly the participant's
// name. That is the identity hook; whole-tile text is not.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DIRS = ['test/browser', 'test/drills', 'test/behavior/scenarios', 'test/swarm', 'test/tools'];

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};

// `.tile…` selector with a hasText option — matches the element's whole text.
const LOCATOR = /\.locator\(\s*'\.tile[^']*'\s*,\s*\{\s*hasText/g;
// a .tile element tested with textContent.includes(…) — the silent variant
const PAGESIDE = /querySelectorAll\('\.tile[^']*'\)[\s\S]{0,120}?textContent\.includes\(/g;

const offenders = [];
let scanned = 0;
for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const rel = path.join(d, f);
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    scanned++;
    for (const [label, re] of [['hasText on a .tile selector', LOCATOR], ['textContent.includes on a .tile', PAGESIDE]]) {
      re.lastIndex = 0;
      const hits = src.match(re);
      if (hits) offenders.push({ file: rel, how: label, count: hits.length });
    }
  }
}

// NOT VACUOUS: if the scan finds no suites at all, something moved and this
// guard is guarding nothing — which is the exact rot it exists to prevent.
check('the scan actually read the meeting suites', scanned >= 20, { scanned });
check('no suite identifies a meeting tile by its WHOLE text (use the .name span)',
  offenders.length === 0,
  offenders.length ? { offenders, fix: "match the tile's <span class=\"name\">: page-side, (x.querySelector('.name')||{}).textContent === NAME; with a locator, .filter({ has: page.locator('.name', { hasText: /^NAME$/ }) })" } : undefined);

console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
