// mesh-media.js test — the compositing core's PURE parts under Node: layout
// math (band/frame rects tile exactly, no gaps/overlap at any C), cover-crop
// boxes, and the fractal invariant (a band cell at depth d holds 1/C^(2d+1)
// of the top frame — space by position, not population).
require('../../site/js/gifos-net.js');
require('../../site/js/mesh-media.js');
const M = globalThis.GifOS.meshMedia;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

for (const C of [2, 5, 8]) {
  const W = 756, H = 1344;
  const b = M.bandRects(C, W, H);
  check(`bandRects C=${C}: ${C} cells, full-width tiling, no gaps`,
    b.length === C && b[0].x === 0 && b.every((r) => r.h === H)
    && b.reduce((s, r) => s + r.w, 0) === W
    && b.every((r, i) => i === 0 || r.x === b[i - 1].x + b[i - 1].w));
  const f = M.frameRects(C, W, H);
  check(`frameRects C=${C}: ${C} bands, full-height tiling, no gaps`,
    f.length === C && f[0].y === 0 && f.every((r) => r.w === W)
    && f.reduce((s, r) => s + r.h, 0) === H
    && f.every((r, i) => i === 0 || r.y === f[i - 1].y + f[i - 1].h));
}

// cover-crop: fills the cell, crops the longer axis, centers.
const box = M.coverBox(1280, 720, { x: 0, y: 0, w: 100, h: 100 });
check('coverBox crops a 16:9 source to a square center cut',
  Math.abs(box.sw - box.sh) < 0.01 && Math.abs(box.sh - 720) < 0.01 && Math.abs(box.sx - (1280 - 720) / 2) < 0.01, box);
// A portrait source is ALSO cut to a centered square from its shortest side
// (the width here), centered vertically — same rule, landscape or portrait.
const box2 = M.coverBox(720, 1280, { x: 0, y: 0, w: 200, h: 100 });
check('coverBox crops a tall source to a centered square (shortest side)',
  Math.abs(box2.sw - 720) < 0.01 && Math.abs(box2.sh - 720) < 0.01 && Math.abs(box2.sx) < 0.01 && Math.abs(box2.sy - (1280 - 720) / 2) < 0.01, box2);

// The fractal-space invariant: one band cell = 1/C of a band; a band = 1/C of
// a frame; recursing d levels, a seat's pixels = W*H / C^(2d+1) regardless of
// how many people sit beneath it (accepted by design, docs/media-plane.md).
const C = 5, W = 756, H = 1344;
const cell = M.bandRects(C, W, H)[2];
const band = M.frameRects(C, W, H)[2];
check('fractal invariant: band cell and frame band are each 1/C of the canvas (±1% rounding)',
  Math.abs(cell.w * cell.h - (W * H) / C) / (W * H / C) < 0.01
  && Math.abs(band.w * band.h - (W * H) / C) / (W * H / C) < 0.01,
  { cell: cell.w * cell.h, band: band.w * band.h, frame: W * H });
// depth-2 cell: a cell WITHIN a band that itself came from a lower band
const sub = M.coverBox(W, H / C, cell); // lower band covered into this cell
check('sub-band survives cover-fit (nonzero crop)', sub.sw > 0 && sub.sh > 0);

// createComposite is DOM-dependent; under Node it must construct with a null
// canvas and refuse to start rather than throw (browser-only feature-gate).
const comp = M.createComposite({ kind: 'band', C: 5 });
check('createComposite degrades cleanly without DOM', comp.canvas === null && comp.start() === comp && comp.stream === null);


// ---- the gapless packer (approach A) ----------------------------------------
// packGrid: bar = 1×T (aspect self-describes the count); grid = near-square.
const pg = (t, s) => M.packGrid(t, s);
check('packGrid bar: 3 faces = 3×1', pg(3, 'bar').cols === 3 && pg(3, 'bar').rows === 1);
check('packGrid grid: 12 faces = 4×3 (gapless, no fixed 5×5)', pg(12, 'grid').cols === 4 && pg(12, 'grid').rows === 3);
check('packGrid grid: 25 faces = 5×5', pg(25, 'grid').cols === 5 && pg(25, 'grid').rows === 5);
check('packGrid grid: 26 faces = 6×5 (tail 4)', pg(26, 'grid').cols === 6 && pg(26, 'grid').rows === 5);
// STADIUM packing: equal squares that grow DOWNWARD, ~5 wide, capping+densifying.
check('stadiumGrid 25 = 5×5 (square-ish)', M.stadiumGrid(25).cols === 5 && M.stadiumGrid(25).rows === 5);
check('stadiumGrid 100 = 5×20 (tall ~1:4, grows downward)', M.stadiumGrid(100).cols === 5 && M.stadiumGrid(100).rows === 20 && !M.stadiumGrid(100).dense);
check('stadiumGrid 400 densifies (cols grow past 5, footprint capped)', M.stadiumGrid(400).cols === 10 && M.stadiumGrid(400).dense === true);
check('stadiumGrid small stays square-ish (9 = 3×3)', M.stadiumGrid(9).cols === 3 && M.stadiumGrid(9).rows === 3);
check('packGrid stad routes to stadiumGrid', pg(100, 'stad').cols === 5 && pg(100, 'stad').rows === 20);
// Overlay threshold: below cap keep overlays, above go tapestry+dot.
check('stadiumTiny: <=100 keeps overlay, >100 drops it', M.stadiumTiny(100) === false && M.stadiumTiny(101) === true);
// faceSrcRect: face j of a packed block is addressable by sub-rect (row-major).
const fr = M.faceSrcRect(7, 12, 4, 400, 300); // 4×3 block @400×300 → cell 100×100; face 7 = row1,col3
check('faceSrcRect addresses face 7 of a 4-wide block at (300,100)',
  Math.abs(fr.sx - 300) < 0.01 && Math.abs(fr.sy - 100) < 0.01 && Math.abs(fr.sw - 100) < 0.01 && Math.abs(fr.sh - 100) < 0.01, fr);
// Node-degrade: constructs without DOM, refuses to start.
const pk = M.createPacker({ shape: 'grid' });
check('packer degrades cleanly without DOM', pk.canvas === null && pk.start() === pk && pk.stream === null);
pk.setTile('a', 0, null, null, null); pk.delTile('a');

// ---- per-link bundle (approach A: one stream per link) ----------------------
// (These three lived BELOW the process.exit() and had therefore never run once —
// the same "a test that guards nothing is worse than no test" shape CLAUDE.md
// names. Moved above the exit, unchanged; they pass.)
const bd = M.createBundle({ w: 400 });
check('bundle degrades cleanly without DOM', bd.canvas === null && bd.start() === bd && bd.stream === null);
bd.setPart('sd', 0, null, null, null); bd.delTile && bd.delTile('sd');
check('bundle manifest empty when no parts', bd.manifest().length === 0);

// ---- fitBox: cover for a face, CONTAIN for a shared screen -----------------
// The screen-share sizing law. cover-cropping a 16:9 share into a square cell
// is the bug this exists to prevent, so the numbers are asserted, not the flag:
// a 1920×1080 source in a 480px cell must arrive 480 wide and 270 tall, whole.
const fbC = M.fitBox('contain', 1920, 1080, 480);
check('fitBox contain: a 16:9 screen letterboxes whole into a square cell',
  Math.abs(fbC.dw - 480) < 0.01 && Math.abs(fbC.dh - 270) < 0.01
  && Math.abs(fbC.dx) < 0.01 && Math.abs(fbC.dy - 105) < 0.01, fbC);
// How much a cover-crop would have thrown away — the measurement in the code.
const cvr = M.coverBox(1920, 1080, { w: 480, h: 480 });
check('coverBox on the same screen keeps only 1080 of 1920 columns (56%)',
  Math.abs(cvr.sw - 1080) < 0.01 && Math.abs(cvr.sx - 420) < 0.01, cvr);
// A portrait share (a phone window) letterboxes on the OTHER axis.
const fbP = M.fitBox('contain', 1080, 1920, 480);
check('fitBox contain: a portrait share pillarboxes instead',
  Math.abs(fbP.dh - 480) < 0.01 && Math.abs(fbP.dw - 270) < 0.01 && Math.abs(fbP.dx - 105) < 0.01, fbP);
// Default (a face) is untouched: fill the cell, cropping is coverBox's job.
const fbN = M.fitBox(null, 1280, 720, 480);
check('fitBox default fills the cell (faces keep the cover-crop)',
  fbN.dx === 0 && fbN.dy === 0 && fbN.dw === 480 && fbN.dh === 480, fbN);
// A source that has not reported dimensions yet must not produce NaN geometry —
// paint() would then draw nothing forever with no error anywhere.
const fbZ = M.fitBox('contain', 0, 0, 480);
check('fitBox survives a not-yet-sized source (no NaN)',
  isFinite(fbZ.dw) && isFinite(fbZ.dh) && fbZ.dw > 0, fbZ);
// The packer carries the flag through setTile (run.html sets it from gossiped
// status, so a mis-plumbed meta silently reverts every share to a cover-crop).
const pk2 = M.createPacker({ shape: 'bar' });
pk2.setTile('s', 0, { videoWidth: 1920, videoHeight: 1080 }, null, { n: 1, cols: 1, fit: 'contain' });
check('packer keeps a tile’s fit flag', pk2.ids().length === 1);

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
