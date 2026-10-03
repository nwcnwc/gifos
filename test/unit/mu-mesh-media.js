// mu-mesh-media.js — guards for the packer row step, a late audio track,
// and stop() releasing sources. Node only: a fake canvas, no browser.
require('../../site/js/gifos-net.js');
require('../../site/js/mesh-media.js');
const M = globalThis.GifOS.meshMedia;
let fails = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) fails++; };

const timers = new Map();
let timerSeq = 0;
global.setInterval = (fn) => { const id = ++timerSeq; timers.set(id, fn); return id; };
global.clearInterval = (id) => { timers.delete(id); };
function fireAll() { for (const fn of [...timers.values()]) fn(); }

const ctx = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '',
  fillRect() {}, beginPath() {}, arc() {}, fill() {}, strokeRect() {}, fillText() {},
  measureText() { return { width: 0 }; },
  drawImage() { draws++; },
};
let draws = 0;
function makeCanvas() {
  return {
    width: 0, height: 0,
    getContext() { return ctx; },
    captureStream() { return { getVideoTracks() { return [{ stop() {} }]; } }; },
  };
}
global.document = { createElement() { return makeCanvas(); } };
function MediaStream(tracks) { this.tracks = tracks || []; }
MediaStream.prototype.getAudioTracks = function () { return (this.tracks || []).filter((t) => t.kind === 'audio'); };
MediaStream.prototype.getVideoTracks = function () { return (this.tracks || []).filter((t) => t.kind === 'video'); };
global.MediaStream = MediaStream;

function fakeAc() {
  return {
    createMediaStreamDestination() { return { stream: { getAudioTracks() { return [{ kind: 'audio', id: 'mix' }]; } } }; },
    createMediaStreamSource() { sources++; return { connect() {}, disconnect() {} }; },
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; },
  };
}
let sources = 0;
function stream(id, tracks) {
  const ls = [];
  return {
    id,
    _tracks: tracks.slice(),
    getAudioTracks() { return this._tracks.filter((t) => t.kind === 'audio'); },
    getVideoTracks() { return this._tracks.filter((t) => t.kind === 'video'); },
    addTrack(t) { this._tracks.push(t); for (const fn of ls.slice()) fn({ track: t }); },
    addEventListener(type, fn) { if (type === 'addtrack') ls.push(fn); },
    removeEventListener(type, fn) { const i = ls.indexOf(fn); if (i >= 0) ls.splice(i, 1); },
  };
}

// ---- cropView: a paused or ended bundle is not blitted --------------------
{
  draws = 0;
  const v = { paused: true, ended: false, videoWidth: 200, videoHeight: 100 };
  const view = M.cropView(v, { y: 0, h: 0.5 }, 8);
  fireAll();
  check('cropView does not blit a paused bundle', draws === 0, draws);
  v.paused = false;
  fireAll();
  check('cropView blits again once the bundle plays', draws === 1, draws);
  view.stop();
  draws = 0;
  const ended = { paused: false, ended: true, videoWidth: 200, videoHeight: 100 };
  const view2 = M.cropView(ended, { y: 0, h: 1 }, 8);
  fireAll();
  check('cropView does not blit an ended bundle', draws === 0, draws);
  view2.stop();
  timers.clear();
}

// ---- stop() drops sources --------------------------------------------------
{
  const pk = M.createPacker({ shape: 'grid', cell: 40, maxW: 400 });
  pk.setTile('a', 0, { videoWidth: 8, videoHeight: 8 }, null, { n: 2, cols: 1 });
  pk.setTile('b', 1, { videoWidth: 8, videoHeight: 8 }, null, { n: 3, cols: 1 });
  check('packer holds its tiles before stop', pk.ids().length === 2 && pk.count() === 5, { ids: pk.ids(), n: pk.count() });
  pk.stop();
  check('packer stop clears ids and count', pk.ids().length === 0 && pk.count() === 0, { ids: pk.ids(), n: pk.count() });

  const comp = M.createComposite({ kind: 'band', C: 3 });
  comp.setCell(1, { videoWidth: 8, videoHeight: 8 }, null);
  check('composite holds the cell before stop', !!(comp.cells[1] && comp.cells[1].el));
  comp.stop();
  check('composite stop nulls every cell', comp.cells.every((c) => c === null), comp.cells);
}

// ---- late audio track ------------------------------------------------------
{
  sources = 0;
  const ac = fakeAc();
  const fold = M.createAudioFold(ac);
  const s = stream('s1', [{ kind: 'video', id: 'v' }]);
  fold.add('k', s, 1);
  check('fold has no key while the stream is video-only', fold.keys().length === 0 && fold.has('k') === false);
  s.addTrack({ kind: 'video', id: 'v2' });
  check('a late video track does not open the fold', fold.has('k') === false && sources === 0, sources);
  s.addTrack({ kind: 'audio', id: 'a' });
  check('addtrack folds the key with no second add', fold.has('k') === true && fold.keys().indexOf('k') >= 0 && sources === 1, { keys: fold.keys(), sources });

  const s2 = stream('s2', [{ kind: 'video', id: 'v' }]);
  fold.add('late', s2, 1);
  s2._tracks.push({ kind: 'audio', id: 'a2' }); // no addtrack event
  check('the key is still absent before the retry', fold.has('late') === false);
  fold.add('late', s2, 1);
  check('a second add with the same stream folds the late track', fold.has('late') === true && sources === 2, sources);
  fold.add('late', s2, 1);
  check('a further add does not open a second source', sources === 2, sources);

  const s3 = stream('s3', [{ kind: 'video', id: 'v' }]);
  fold.add('gone', s3, 1);
  fold.remove('gone');
  s3.addTrack({ kind: 'audio', id: 'a3' });
  check('remove drops the addtrack wait', fold.has('gone') === false && sources === 2, sources);

  sources = 0;
  const pk = M.createPacker({ shape: 'bar', cell: 40, maxW: 400, ac });
  const st = stream('tile', [{ kind: 'video', id: 'v' }]);
  const el = { videoWidth: 16, videoHeight: 16 };
  pk.setTile('a', 0, el, st, { n: 1, cols: 1 });
  check('setTile with no audio track does not open a source', sources === 0, sources);
  st._tracks.push({ kind: 'audio', id: 'a' });
  pk.setTile('a', 0, el, st, { n: 1, cols: 1 });
  check('setTile again with the same stream id folds the late track', sources === 1, sources);
  pk.setTile('a', 0, el, st, { n: 1, cols: 1 });
  check('a third setTile does not fold twice', sources === 1, sources);
  pk.delTile('a');
  st.addTrack({ kind: 'audio', id: 'later' });
  check('delTile drops the wait so a later track does not fold', sources === 1, sources);

  const comp = M.createComposite({ kind: 'band', C: 2, ac });
  const sc = stream('cell', [{ kind: 'video', id: 'v' }]);
  comp.setCell(0, el, sc);
  const before = sources;
  sc._tracks.push({ kind: 'audio', id: 'a' });
  comp.setCell(0, el, sc);
  check('setCell retries the fold on the same stream id', sources === before + 1, { before, sources });
  comp.stop();
  pk.stop();
}

// ---- stad canvas row step --------------------------------------------------
{
  let now = 100000;
  const prevNow = performance.now.bind(performance);
  // performance.now is a prototype getter. A plain assignment does not replace it,
  // and a real clock under 1000/fps makes the governor drop every paint.
  Object.defineProperty(performance, 'now', { configurable: true, writable: true, value: () => now });
  const pk = M.createPacker({ shape: 'stad', cell: 110, fps: 8 });
  const el = { width: 0, height: 0 };
  function setN(n, face) { pk.setTile('b', 0, face || el, null, { n, cols: 5 }); }
  function pump() { now += 200; fireAll(); }

  const heights = [];
  const widths = [];
  for (const n of [24, 25, 26, 27, 26, 25]) {
    setN(n);
    if (!pk.stream) pk.start(); else pump();
    heights.push(pk.canvas.height);
    widths.push(pk.canvas.width);
  }
  check('stad height stays on one step across T=24..27 inside 5s',
    heights.every((h) => h === heights[0]) && heights[0] === 8 * 110, heights);
  check('stad width stays on 5 columns through that sequence',
    widths.every((w) => w === 5 * 110), widths);

  setN(16);
  pump();
  check('a smaller step does not shrink the canvas inside the hold', pk.canvas.height === 880, pk.canvas.height);
  now += 5000;
  fireAll();
  check('after 5s on the smaller step the canvas shrinks to that step', pk.canvas.height === 4 * 110, pk.canvas.height);

  setN(26);
  pump();
  check('a larger step grows the canvas on the next paint', pk.canvas.height === 8 * 110, pk.canvas.height);

  const vel = { videoWidth: 4, videoHeight: 4, currentTime: 1.5 };
  setN(24, vel);
  pump();
  check('a frozen currentTime at the same step does not resize', pk.canvas.height === 880, pk.canvas.height);
  setN(45, vel);
  pump();
  check('a frozen currentTime does not swallow a larger row step', pk.canvas.height === 12 * 110, pk.canvas.height);

  setN(16, vel);
  pump();
  const holdH = pk.canvas.height;
  now += 3000;
  fireAll();
  check('oscillating down stays on the held step before 5s', pk.canvas.height === 12 * 110 && holdH === 12 * 110, pk.canvas.height);
  setN(25, vel);
  pump();
  const tReset = now;
  now = tReset + 4800;
  fireAll();
  check('a changed smaller step restarts the hold', pk.canvas.height === 12 * 110, { h: pk.canvas.height, dt: now - tReset });
  now = tReset + 5000;
  fireAll();
  check('the stable smaller step applies at 5s, rounded up', pk.canvas.height === 8 * 110, pk.canvas.height);

  pk.delTile('b');
  now += 200;
  fireAll();
  check('an empty packer keeps its canvas during the empty linger', pk.canvas.height === 8 * 110, pk.canvas.height);
  now += 5000;
  fireAll();
  check('a long-empty packer collapses and forgets the held step', pk.canvas.width === 2 && pk.canvas.height === 2, { w: pk.canvas.width, h: pk.canvas.height });
  setN(16);
  pump();
  check('the next crowd sizes from its own step', pk.canvas.height === 4 * 110, pk.canvas.height);
  pk.stop();
  timers.clear();

  const g = M.createPacker({ shape: 'grid', cell: 100, maxW: 1000, fps: 8 });
  g.setTile('a', 0, el, null, { n: 1, cols: 1 });
  g.start();
  check('a 1-face grid is one cell tall', g.canvas.height === 100, g.canvas.height);
  g.setTile('a', 0, el, null, { n: 3, cols: 1 });
  pump();
  check('a grid packer follows its row count (the stad step is not global)', g.canvas.height === 200, g.canvas.height);
  g.stop();
  timers.clear();
  Object.defineProperty(performance, 'now', { configurable: true, writable: true, value: prevNow });
}

// A padded-tall block: 4 cols, 12 faces is 3 rows, but the frame is 4 rows tall.
const pad = M.faceSrcRect(7, 12, 4, 400, 400);
check('faceSrcRect ignores a dark tail below the square grid',
  Math.abs(pad.sx - 300) < 0.01 && Math.abs(pad.sy - 100) < 0.01
  && Math.abs(pad.sw - 100) < 0.01 && Math.abs(pad.sh - 100) < 0.01, pad);
const tight = M.faceSrcRect(7, 12, 4, 400, 300);
check('faceSrcRect on a tight grid is unchanged',
  Math.abs(tight.sx - 300) < 0.01 && Math.abs(tight.sy - 100) < 0.01
  && Math.abs(tight.sw - 100) < 0.01 && Math.abs(tight.sh - 100) < 0.01, tight);

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
