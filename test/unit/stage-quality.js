// stage-quality.js — THE STAGE IS NOT A SECONDARY TILE.
//
// The Stage is the one feed the whole stadium is looking AT. Twice over, the
// constants that sized it were inherited from machinery built for the things
// nobody looks at, and both were invisible from the unit tier:
//
//   * THE STRIP took createPacker's DEFAULT cell (110px) and maxW (640) — the
//     "small secondary tiles, keep encode/ship cheap" numbers that are right for
//     the stadium's tapestry of onlookers. reconcileMosaic switches the strip on
//     the moment a room reaches beyond ONE ROW, so from the 6th person onward
//     the stage rendered as a 110px thumbnail, downscaled (inside a single
//     section!) from full-resolution feeds the seat was already holding.
//   * THE BUDGET was the flat 900k aux constant — the CARRIED-media number — so
//     a broadcaster who deliberately chose 1080p was squeezed to 900k on hop one
//     and re-squeezed on every hop below.
//
// The sizing law lives in paint(), which needs a canvas, so it was unreachable
// from Node until cellSize() was extracted. This suite pins BOTH halves: the
// pure law, and the fact that run.html actually hands the Stage its own numbers
// rather than silently inheriting the thumbnail defaults again.
require('../../site/js/gifos-net.js');
require('../../site/js/mesh-media.js');
const fs = require('fs');
const path = require('path');
const M = globalThis.GifOS.meshMedia;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

// ---- the sizing law (pure) --------------------------------------------------
const SECONDARY_CELL = 110, SECONDARY_MAXW = 640;

check('cellSize: the secondary-tile default is still the thumbnail it claims to be',
  M.cellSize('bar', SECONDARY_CELL, SECONDARY_MAXW, 1) === 110);

// The regression itself, stated as arithmetic: one stager on the default
// constants is a 110px square. That is the bug, and it must never read as OK.
check('cellSize: a lone stager on the DEFAULTS is a 110px thumbnail (the bug)',
  M.cellSize('bar', SECONDARY_CELL, SECONDARY_MAXW, 1) < 200);

// cellPref is a CEILING and maxW divides it across the row — a bar of G stagers
// never exceeds maxW total, and never exceeds cellPref per face.
for (const G of [1, 2, 3, 4, 5]) {
  const cell = M.cellSize('bar', 480, 1280, G);
  check(`cellSize bar G=${G}: per-face <= cellPref and the row fits maxW`,
    cell <= 480 && cell * G <= 1280 + G, { cell, total: cell * G });
}

// A stage cell must stay legible as the bar fills: even at C=5 abreast it is
// worth more than the secondary default was for ONE.
check('cellSize: a FULL bar of 5 stagers still beats the old single-stager cell',
  M.cellSize('bar', 480, 1280, 5) > SECONDARY_CELL, { cell: M.cellSize('bar', 480, 1280, 5) });

// The floor: a bar never collapses below the packer's 24px hard minimum.
check('cellSize: never below the 24px floor, however wide the bar',
  M.cellSize('bar', 480, 1280, 999) === 24);

// The stadium branch is untouched by this work — fixed footprint, densifying.
check('cellSize stad: <=STAD_COLS columns render at full cellPref',
  M.cellSize('stad', 110, 640, 5) === 110 && M.cellSize('stad', 110, 640, 1) === 110);
check('cellSize stad: a denser grid shrinks the square (footprint fixed)',
  M.cellSize('stad', 110, 640, 10) < 110);

// ---- setCell: the power tier must move a LIVE strip -------------------------
// The Stage strip outlives many battery events. Rebuilding the packer to change
// one number would mint a new stream id and re-ship to every receiver (and
// reset their decoders), so the cell has to be settable in place.
const pk = M.createPacker({ shape: 'bar', cell: 480, maxW: 1280 });
check('createPacker exposes setCell (a live strip tracks the power tier)',
  typeof pk.setCell === 'function');
check('setCell tolerates junk without throwing', (() => {
  try { pk.setCell(0); pk.setCell(-5); pk.setCell(NaN); pk.setCell(240); return true; }
  catch (e) { return false; }
})());

// ---- run.html actually hands the Stage its own numbers ----------------------
// A source scan, deliberately: the failure being guarded is textual — someone
// drops the `cell:`/`maxW:` argument and the strip silently inherits the
// thumbnail defaults again, with nothing at runtime to complain. Same idiom as
// e2e-icon-lock.js scanning site/*.html for the arrange bar.
const RUN = fs.readFileSync(path.join(__dirname, '../../site/run.html'), 'utf8');

const barCreate = RUN.match(/createPacker\(\{[^}]*shape:\s*'bar'[^}]*\}/);
check('run.html builds the Stage strip with a bar packer', !!barCreate);
check('the Stage strip passes its OWN cell + maxW (never the secondary default)',
  !!barCreate && /cell:/.test(barCreate[0]) && /maxW:/.test(barCreate[0]),
  barCreate ? barCreate[0].slice(0, 120) : null);

const cellConst = RUN.match(/const STAGE_CELL\s*=\s*(\d+)/);
const maxwConst = RUN.match(/const STAGE_MAXW\s*=\s*(\d+)/);
check('STAGE_CELL is defined and is stage-grade, not thumbnail-grade',
  !!cellConst && +cellConst[1] >= 240, cellConst ? +cellConst[1] : null);
check('STAGE_MAXW is defined and wider than the secondary cap',
  !!maxwConst && +maxwConst[1] > SECONDARY_MAXW, maxwConst ? +maxwConst[1] : null);

// The budget lane. Stage senders must NOT fall through to the flat aux constant.
check('stage senders have their own budget lane (stageSenders)',
  /const stageSenders = new Set\(\)/.test(RUN) && /stageSenders\.has\(sender\)/.test(RUN));
check('the lane is populated by job key in shipMos, and cleared in unshipMos',
  // moved into mosAttach/mosDetach (container-identity, 2026-08-08) — every
  // sender birth/death goes through them, so the lane can never miss one
  /if \(isStageJob\(job\.key\)\) stageSenders\.add\(sd\)/.test(RUN)
  && /stageSenders\.delete\(sd\)/.test(RUN));
check("isStageJob covers both the per-stager feeds and the composited strip",
  /isStageJob = \(k\) =>[^\n]*'sgs'[^\n]*'stg:'/.test(RUN));

// THE FORWARD MUST NOT BE BUDGETED FROM `q`. q is the seat's OWN camera rung; a
// forward budgeted from it lets one 144p phone mid-tree starve every seat below.
const wantLine = RUN.match(/const want = stageSenders\.has\(sender\)[\s\S]{0,240}?;\n/);
check('the stage budget is the room ceiling, not the local camera rung',
  !!wantLine && /stageBudget/.test(wantLine[0]) && !/stageSenders\.has\(sender\) \? [^:]*q\.kbps/.test(wantLine[0]),
  wantLine ? wantLine[0].replace(/\s+/g, ' ').slice(0, 140) : null);

// Room-type ceilings exist and are ordered: broadcast (viewers carry no camera)
// >= admin (<=C chosen stagers) >= open (anyone steps up, everyone has tiles).
const ceilFn = RUN.match(/function stageCeilingKbps\(\)\s*\{[\s\S]*?\n    \}/);
check('stageCeilingKbps exists', !!ceilFn);
if (ceilFn) {
  const nums = (ceilFn[0].match(/\b\d{3,4}\b/g) || []).map(Number);
  const bc = ceilFn[0].match(/BROADCAST\) return (\d+)/);
  const adm = ceilFn[0].match(/hasAdminRoom\(\)\) return (\d+)/);
  check('broadcast ceiling >= admin ceiling >= the open-room band',
    !!bc && !!adm && +bc[1] >= +adm[1] && +adm[1] >= Math.max(...nums.filter((n) => n !== +bc[1] && n !== +adm[1])),
    { broadcast: bc && +bc[1], admin: adm && +adm[1], open: nums });
  check('every ceiling clears the old flat 900k aux constant',
    nums.length > 0 && nums.every((n) => n >= 900), nums);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
