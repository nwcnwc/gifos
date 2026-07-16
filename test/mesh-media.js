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
const box2 = M.coverBox(720, 1280, { x: 0, y: 0, w: 200, h: 100 });
check('coverBox crops a tall source to a wide cut', Math.abs(box2.sw / box2.sh - 2) < 0.01, box2);

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

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
