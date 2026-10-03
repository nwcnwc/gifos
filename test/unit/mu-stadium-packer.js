// mu-stadium-packer.js — a seat's paint cost and canvas area must not grow
// with the room. Two failures this guards (3 Oct 2026 audit):
//   * createPacker blitted EVERY FACE of every received block on every paint,
//     so a Section-1 head drew about N drawImage calls per frame.
//   * cellSize('stad') had a 6 px floor, so past about 28k faces the stadium
//     canvas grew with N instead of holding the fixed footprint.
// The law: per-face blits only while the packer holds <= STAD_CAP faces; past
// that a received block keeps its own geometry and is ONE drawImage. The
// canvas never exceeds the shape's footprint. Node only: fake canvases count
// drawImage per packer. The tree below is built bottom-up like run.html:
// row heads pack C live faces plus C child blocks ('grid', the prodPack);
// a Section-1 head's stadium ('stad', the sdPack) packs C-1 other rows plus
// its C child blocks.
require('../../site/js/gifos-net.js');
require('../../site/js/mesh-media.js');
const M = globalThis.GifOS.meshMedia;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

global.setInterval = () => 0;
global.clearInterval = () => {};
let now = 1e6;
Object.defineProperty(performance, 'now', { configurable: true, writable: true, value: () => (now += 1000) });
function makeCanvas() {
  const cv = { width: 0, height: 0, draws: 0 };
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '',
    fillRect() {}, beginPath() {}, arc() {}, fill() {}, strokeRect() {}, fillText() {},
    measureText() { return { width: 0 }; },
    drawImage() { cv.draws++; },
  };
  cv.getContext = () => ctx;
  cv.captureStream = () => ({ getVideoTracks() { return [{ stop() {} }]; } });
  return cv;
}
global.document = { createElement() { return makeCanvas(); } };
global.MediaStream = function (t) { this.t = t; };

const C = 5, CELL = 110, MAXW = 640, CAP = 100;
const FOOT = { stad: (C * CELL) * (20 * CELL), grid: MAXW * MAXW }; // 550x2200 and 640x640
const cam = () => ({ videoWidth: 640, videoHeight: 480 });

// paint once; return what the next level up needs, and record the cost
const seen = [];
function paintOnce(pk, shape) {
  pk.canvas.draws = 0;
  pk.start();
  const s = pk.stats();
  seen.push({ shape, faces: s.faces, draws: pk.canvas.draws, area: pk.canvas.width * pk.canvas.height, w: pk.canvas.width, h: pk.canvas.height, cell: s.cell });
  return { el: pk.canvas, n: pk.count(), cols: pk.cols() };
}
// A row head's product for a subtree of n faces: C live faces + C child blocks.
function product(n) {
  const pk = M.createPacker({ shape: 'grid' });
  const live = Math.min(C, n);
  for (let j = 0; j < live; j++) pk.setTile('r' + j, 'a' + j, cam(), null, { n: 1, cols: 1 });
  let rest = n - live;
  for (let j = 0; j < C && rest > 0; j++) {
    const k = Math.ceil(rest / (C - j));
    const b = product(k); rest -= k;
    pk.setTile('s' + j, 'b' + j, b.el, null, { n: b.n, cols: b.cols });
  }
  return paintOnce(pk, 'grid');
}
// A Section-1 head's stadium: the other C-1 rows' products + its own C child blocks.
function stadium(N) {
  const sd = M.createPacker({ shape: 'stad' });
  let rest = N;
  const parts = 2 * C - 1;
  for (let p = 0; p < parts && rest > 0; p++) {
    const k = Math.ceil(rest / (parts - p));
    const b = product(k); rest -= k;
    if (p < C - 1) sd.setTile('q' + p, 1 + p, b.el, null, { n: b.n, cols: b.cols });
    else sd.setTile('s' + (p - C + 1), 20 + p, b.el, null, { n: b.n, cols: b.cols });
  }
  const top = paintOnce(sd, 'stad');
  return { top: seen[seen.length - 1], n: top.n };
}

for (const N of [25, 625, 15625, 100000]) {
  seen.length = 0;
  const { top } = stadium(N);
  const maxDraws = Math.max(...seen.map((s) => s.draws));
  const worst = seen.find((s) => s.draws === maxDraws);
  check(`N=${N}: the stadium holds every face`, top.faces === N, top.faces);
  check(`N=${N}: no packer draws more than ${CAP} images per paint`, maxDraws <= CAP, { maxDraws, faces: worst.faces, shape: worst.shape });
  // Blocks of more than CAP faces can never be split: one image each.
  if (N / (2 * C - 1) > CAP) check(`N=${N}: the stadium draws one image per block (<= 2C)`, top.draws <= 2 * C, top.draws);
  const over = seen.filter((s) => s.area > FOOT[s.shape]);
  check(`N=${N}: no canvas exceeds its shape's footprint`, over.length === 0, over[0] || { packers: seen.length });
  const fill = (top.faces * top.cell * top.cell) / Math.max(1, top.area);
  // Faces are equal squares of top.cell px. Holes between blocks may cost some
  // area, but most of the footprint must still be faces.
  check(`N=${N}: faces cover most of the stadium canvas`, fill >= 0.5 && fill <= 1.0001, { fill: Math.round(fill * 100) / 100, cell: top.cell, w: top.w, h: top.h });
}

// The pure law agrees: the stad square shrinks without a floor, so the
// packed grid never outgrows the footprint whatever T is.
for (const T of [1e3, 1e4, 1e5, 1e6]) {
  const g = M.stadiumGrid(T), cell = M.cellSize('stad', CELL, MAXW, g.cols);
  check(`cellSize stad T=${T}: grid width stays inside the footprint`, cell * g.cols <= C * CELL, { cell, cols: g.cols });
}

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
