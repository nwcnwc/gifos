// mesh-media.js test — the compositing core's PURE parts under Node: layout
// math (band/frame rects tile exactly, no gaps/overlap at any C), cover-crop
// boxes, and the fractal invariant (a band cell at depth d holds 1/C^(2d+1)
// of the top frame — space by position, not population).
require('../site/js/gifos-net.js');
require('../site/js/mesh-media.js');
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
// faceSrcRect: face j of a packed block is addressable by sub-rect (row-major).
const fr = M.faceSrcRect(7, 12, 4, 400, 300); // 4×3 block @400×300 → cell 100×100; face 7 = row1,col3
check('faceSrcRect addresses face 7 of a 4-wide block at (300,100)',
  Math.abs(fr.sx - 300) < 0.01 && Math.abs(fr.sy - 100) < 0.01 && Math.abs(fr.sw - 100) < 0.01 && Math.abs(fr.sh - 100) < 0.01, fr);
// Node-degrade: constructs without DOM, refuses to start.
const pk = M.createPacker({ shape: 'grid' });
check('packer degrades cleanly without DOM', pk.canvas === null && pk.start() === pk && pk.stream === null);
pk.setTile('a', 0, null, null, null); pk.delTile('a');

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);

// ---- per-link bundle (approach A: one stream per link) ----------------------
const bd = M.createBundle({ w: 400 });
check('bundle degrades cleanly without DOM', bd.canvas === null && bd.start() === bd && bd.stream === null);
bd.setPart('sd', 0, null, null, null); bd.delTile && bd.delTile('sd');
check('bundle manifest empty when no parts', bd.manifest().length === 0);
