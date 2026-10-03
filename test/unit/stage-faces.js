// stage-faces.js — ONE SHARED SCREEN BESIDE OTHER FACES, at every seat.
//
// c5b509a3 shows one shared screen raw on the Stage and puts the other
// stagers' faces on it as small overlays (paintStageFaces). An overlay needs
// that stager's own video. Section 1 seats hold every stage feed, but below
// Section 1 f8e8f9c2's stgDownShip ships a co-presenter's feed AUDIO-ONLY, so
// a deep seat that held the sharer's screen painted the screen and none of
// the co-presenters. And past one section a status reaches only its own
// section, so sharingScreen() knew a sharer only inside the sharer's section:
// Section 1 square-cropped a deeper sharer's screen into the strip, and deep
// relays outside that section shipped the sharer audio-only too.
//
// The fix (run.html STAGE-FACES, mesh-media cellCrop): a deep seat cuts each
// co-presenter's face out of the strip it already receives (zero extra
// bandwidth), and shows the strip itself when it cannot place a face. This
// file lifts the page's own functions and runs them. No browser.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'site', 'run.html'), 'utf8');
require(path.join(ROOT, 'site', 'js', 'gifos-net.js'));
require(path.join(ROOT, 'site', 'js', 'mesh-media.js'));
const MM = globalThis.GifOS.meshMedia;

let fails = 0, passes = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (c) passes++; else fails++; };
function between(a, b) { const i = html.indexOf(a); if (i < 0) return ''; const j = html.indexOf(b, i + a.length); return j < 0 ? '' : html.slice(i, j); }
function sliceFn(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const b = html.indexOf('{', i); let d = 0;
  for (let j = b; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}') { d--; if (!d) return html.slice(i, j + 1); } }
  return '';
}

class FakeStream {
  constructor(tracks) { this.t = tracks || []; this.id = 'ms' + (FakeStream.n = (FakeStream.n || 0) + 1); }
  getVideoTracks() { return this.t.filter((x) => x.kind === 'video'); }
  getAudioTracks() { return this.t.filter((x) => x.kind === 'audio'); }
}
const trk = (kind, id) => ({ kind, id, readyState: 'live' });

// ---- 1. cellCrop: the receiver's half of faceSrcRect ------------------------
{
  check('MM.cellCrop exists', typeof MM.cellCrop === 'function');
  if (typeof MM.cellCrop === 'function') {
    const c = MM.cellCrop(2, 3, 3, 1440, 480, 96);
    check('bar of 3 at 480: cell 2 fills a 96 px box', !!c && c.w === 288 && c.h === 96 && c.x === -192 && c.y === 0, c);
    const g = MM.cellCrop(3, 4, 2, 960, 960, 96);
    check('2x2 grid: cell 3 is bottom-right', !!g && g.w === 192 && g.h === 192 && g.x === -96 && g.y === -96, g);
    const half = MM.cellCrop(1, 3, 3, 720, 240, 96);
    check('an encoder-halved frame crops the same cell', !!half && half.w === 288 && half.x === -96, half);
    check('j past n is refused', MM.cellCrop(3, 3, 3, 1440, 480, 96) === null);
    check('a stale cols is refused (cells not square)', MM.cellCrop(1, 3, 2, 1440, 480, 96) === null);
    check('a frame from before a join is refused (2-wide frame, 3 announced)', MM.cellCrop(1, 3, 3, 960, 480, 96) === null);
    check('no decoded frame is refused', MM.cellCrop(0, 2, 2, 0, 0, 96) === null);
    check('a non-integer index is refused', MM.cellCrop(0.5, 2, 2, 960, 480, 96) === null);
  }
}

// ---- 2. the face set, with the page's own functions -------------------------
const facesSrc = between('    // STAGE-FACES\n', '    // END-STAGE-FACES');
check('run.html has the STAGE-FACES block', !!facesSrc);
const downSrc = sliceFn('stgDownShip');
check('stgDownShip is where the lift expects it', !!downSrc);
function world(opts) {
  const ctx = {
    MM, MediaStream: FakeStream, myId: opts.myId || 'deep1',
    meTile: { video: { srcObject: opts.mine || null } },
    mosIn: opts.mosIn || new Map(),
    forcedCamOff: (id) => !!(opts.off && opts.off.includes(id)),
    modBlurOn: (id) => !!(opts.blurred && opts.blurred.includes(id)),
    blurLevelFor: (id) => (opts.blurred && opts.blurred.includes(id) ? 2 : 1),
    OUT: null,
  };
  vm.createContext(ctx);
  vm.runInContext(facesSrc + '\n' + downSrc + '\nOUT = { stageFaceSet, stageStripOrder, stageRawFace, stageFaceBlur, stgDownShip, STAGE_FACE_PX };', ctx);
  return ctx.OUT;
}
if (facesSrc && downSrc) {
  const A = 'ada', B = 'ben', C3 = 'cy';
  const fullA = new FakeStream([trk('video', 'scrA'), trk('audio', 'micA')]);
  const fullB = new FakeStream([trk('video', 'camB'), trk('audio', 'micB')]);
  const W0 = world({});
  // What a deep seat holds, from the down hop's own rule: the sharer whole,
  // the co-presenter's voice only.
  const heldA = W0.stgDownShip('stg:' + A, fullA, true, null);
  const heldB = W0.stgDownShip('stg:' + B, fullB, false, null);
  check('below Section 1 the sharer arrives with video', heldA.getVideoTracks().length === 1);
  check('…and a co-presenter arrives audio-only (the reason a face needs another source)', heldB.getVideoTracks().length === 0 && heldB.getAudioTracks().length === 1);
  const stripTrack = trk('video', 'strip');
  const strip = (meta, vw, vh, tracks) => ({ meta, stream: new FakeStream(tracks || [stripTrack]), el: { videoWidth: vw, videoHeight: vh } });
  const deepIn = () => new Map([['stg:' + A, { stream: heldA, meta: { h: 2 } }], ['stg:' + B, { stream: heldB, meta: { h: 2, ao: 1 } }]]);

  // THE BUG, AND ITS FIX: a deep seat shows Ada's screen with Ben's face on it.
  const W = world({ mosIn: deepIn() });
  const f1 = W.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2, ids: [A, B] }, 960, 480));
  check('a deep seat puts every co-presenter on the shared screen', Array.isArray(f1) && f1.length === 1 && f1[0].id === B, f1 && f1.map((f) => f.id));
  check('…cut out of the strip it already receives (cell 1 of 2, the strip track)', !!(f1 && f1[0] && f1[0].crop && f1[0].vt === stripTrack && f1[0].crop.x === -96 && f1[0].crop.w === 192 && f1[0].crop.h === 96), f1 && f1[0] && f1[0].crop);
  const fLegacy = W.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2 }, 960, 480));
  check('an older relay that drops the order: the stage order stands in when the counts agree', Array.isArray(fLegacy) && fLegacy.length === 1 && fLegacy[0].crop && fLegacy[0].crop.x === -96);
  const fOrder = W.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2, ids: [B, A] }, 960, 480));
  check('the packed order decides the cell, not this seat\'s stage order', !!(fOrder && fOrder[0] && fOrder[0].crop && fOrder[0].crop.x === 0), fOrder && fOrder[0] && fOrder[0].crop);

  // Geometry unknown: the strip, never a screen with people missing.
  check('no strip meta → show the strip', W.stageFaceSet(A, [A, B], strip(null, 960, 480)) === null);
  check('counts disagree and no order → show the strip', W.stageFaceSet(A, [A, B], strip({ n: 1, cols: 1 }, 480, 480)) === null);
  check('an order whose length is not n → show the strip', W.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2, ids: [A] }, 960, 480)) === null);
  check('a frame that disagrees with the meta → show the strip', W.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2, ids: [A, B] }, 1440, 480)) === null);
  check('no decoded strip frame yet → show the strip', W.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2, ids: [A, B] }, 0, 0)) === null);
  check('a strip with no live video track → show the strip', W.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2, ids: [A, B] }, 960, 480, [])) === null);
  const W3 = world({ mosIn: new Map([['stg:' + A, { stream: heldA }], ['stg:' + B, { stream: heldB, meta: { ao: 1 } }], ['stg:' + C3, { stream: new FakeStream([trk('audio', 'micC')]), meta: { ao: 1 } }]]) });
  const fMissing = W3.stageFaceSet(A, [A, B, C3], strip({ n: 2, cols: 2, ids: [A, B] }, 960, 480));
  check('the compositing seat packed no cell for someone: its strip lacks them too, the screen stays', Array.isArray(fMissing) && fMissing.length === 1 && fMissing[0].id === B, fMissing && fMissing.map((f) => f.id));

  // A seat that holds a co-presenter's real video uses it.
  const Wr = world({ mosIn: new Map([['stg:' + A, { stream: heldA }], ['stg:' + B, { stream: fullB, meta: { h: 1 } }]]) });
  const fRaw = Wr.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2, ids: [A, B] }, 960, 480));
  check('a relay holding the face itself shows it raw', !!(fRaw && fRaw[0] && fRaw[0].crop === null && fRaw[0].vt === fullB.getVideoTracks()[0]));
  const Wao = world({ mosIn: new Map([['stg:' + B, { stream: fullB, meta: { ao: 1 } }]]) });
  check('a copy announced audio-only is never a face source', Wao.stageRawFace(B) === null);
  const Wme = world({ myId: B, mine: new FakeStream([trk('video', 'myBroadcast')]) });
  check('my own face is my broadcast track', !!Wme.stageRawFace(B) && Wme.stageRawFace(B).id === 'myBroadcast');

  // Section 1 keeps the screen: its own strip has nobody it cannot show.
  const S1 = world({ myId: 's1', mosIn: new Map([['stg:' + A, { stream: fullA }], ['stg:' + B, { stream: fullB }]]) });
  const fS1 = S1.stageFaceSet(A, [A, B], null);
  check('Section 1 shows the raw face', !!(fS1 && fS1.length === 1 && fS1[0].crop === null));
  const S1gap = world({ myId: 's1', mosIn: new Map([['stg:' + A, { stream: fullA }]]) });
  const fGap = S1gap.stageFaceSet(A, [A, B], null);
  check('Section 1 without a feed yet keeps the screen (never null there)', Array.isArray(fGap) && fGap.length === 0);

  // Moderation reaches the face boxes.
  const Woff = world({ mosIn: deepIn(), off: [B] });
  const fOff = Woff.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2, ids: [A, B] }, 960, 480));
  check('an admin\'s video-off hides the face at a deep seat', Array.isArray(fOff) && fOff.length === 0);
  const S1off = world({ myId: 's1', mosIn: new Map([['stg:' + B, { stream: fullB }]]), off: [B] });
  check('…and at Section 1, where the raw face is held', (S1off.stageFaceSet(A, [A, B], null) || [1]).length === 0);
  const Wbl = world({ mosIn: deepIn(), blurred: [B] });
  const fBl = Wbl.stageFaceSet(A, [A, B], strip({ n: 2, cols: 2, ids: [A, B] }, 960, 480));
  check('a moderator\'s blur blurs the face box', !!(fBl && fBl[0] && fBl[0].bl === 2), fBl && fBl[0] && fBl[0].bl);
  const Wnb = world({ mosIn: deepIn() });
  check('no block, no receiver blur on the box (the sender bakes its own, as in the strip)', Wnb.stageFaceBlur(B) === 0);
  const Wself = world({ myId: B, blurred: [B] });
  check('my own face is never blurred twice', Wself.stageFaceBlur(B) === 0);
}

// ---- 3. sharingScreen knows a sharer in another section ---------------------
{
  const src = between('    const sharingScreen = (pid) => {', '\n    };');
  check('sharingScreen is where the lift expects it', !!src);
  if (src) {
    const make = (statusOf, fresh, dig) => new Function('myId', 'myStatus', 'statusOf', 'freshSt', 'digStageEntry',
      src + '\n    };\nreturn sharingScreen;')('me', { scr: 0 }, statusOf, (id) => fresh.includes(id), (id) => dig[id] || null);
    const ss = make(new Map([['near', { scr: 1 }], ['quiet', { scr: 0 }]]), ['near', 'quiet'], { far: { id: 'far', f: 2 }, quiet: { id: 'quiet', f: 2 }, sing: { id: 'sing', f: 1 } });
    check('a sharer in my section, by status', ss('near') === true);
    check('a sharer in another section, by the fold (f & 2)', ss('far') === true);
    check('a fresh section status saying "not sharing" beats a stale fold', ss('quiet') === false);
    check('a fold flag that is not the share bit is not a share', ss('sing') === false);
    check('nobody known is not a sharer', ss('nobody') === false);
    if (downSrc) {
      const W = world({});
      const full = new FakeStream([trk('video', 'scr'), trk('audio', 'mic')]);
      const shipped = W.stgDownShip('stg:far', full, ss('far'), null);
      check('so a deep relay outside the sharer\'s section ships the screen down whole', shipped === full);
    }
  }
}

// ---- 4. the strip's cell order rides the announce ---------------------------
{
  const mx = sliceFn('mxIds');
  check('mxIds is where the lift expects it', !!mx);
  if (mx) {
    const mxIds = new Function('SCALE', mx + '\nreturn mxIds;')({ C: 5 });
    check('a list of peer ids passes', JSON.stringify(mxIds(['k_a', 'k_b'])) === '["k_a","k_b"]');
    check('more than C ids is dropped', mxIds(['a', 'b', 'c', 'd', 'e', 'f']) === undefined);
    check('a non-string id drops the list', mxIds(['a', 3]) === undefined);
    check('an oversized id drops the list', mxIds(['x'.repeat(65)]) === undefined);
    check('an empty list or a non-list is dropped', mxIds([]) === undefined && mxIds('a') === undefined);
  }
  check('the mx handler keeps the order (mxIds(m.ids))', /mosAnn\.set\(ak, \{[^\n]*ids: mxIds\(m\.ids\)/.test(html));
  check('annMeta carries the order onto the claim', /const annMeta = \(ann\) => \(\{[^\n]*ids: ann\.ids/.test(html));
  check('Section 1 ships the order it packed', /shipMos\('sgs', occPid\(T\.down\(c\)\), stripPack\.stream, \{ n: stripPack\.count\(\), cols: stripPack\.cols\(\), ids: stripIds \}\)/.test(html));
  const sgsShips = html.match(/shipMos\('sgs', [^\n]*/g) || [];
  check('every relay of the strip passes the order on (stripMeta, never bare blockMeta)',
    sgsShips.length >= 4 && sgsShips.every((l) => /ids: stripIds|stripMeta\(sgs\)/.test(l)), sgsShips.length);
}

// ---- 5. the wiring: the screen is shown only with its faces ------------------
{
  check('a deep seat paints the screen only when the face set is whole',
    /const deepFaces = scrSt \? stageFaceSet\(stageScreenSid\(\), stagers, sgs\) : null;/.test(html)
    && /paintStageStrip\(\(soloSelf && selfStageStream\(\)\) \|\| \(deepFaces \? scrSt : null\) \|\| sgs\.stream\);/.test(html)
    && /paintStageFaces\(deepFaces\);/.test(html));
  check('Section 1 builds its faces from what it holds (no strip to cut)',
    /const s1Faces = scrSt \? stageFaceSet\(stageScreenSid\(\), stagers, null\) : null;/.test(html)
    && /paintStageStrip\(selfSt \|\| \(s1Faces \? scrSt : null\) \|\| stripPack\.stream\);/.test(html));
  check('the old "screen whatever the faces" calls are gone',
    html.indexOf('paintStageFaces(selfSt ? null') < 0 && html.indexOf("paintStageFaces((soloSelf && selfStageStream()) ? null") < 0);
  const sd = between('      const stageDirect = () => {', '      // Grid tiles of stagers are hidden.');
  check('stageDirect refuses a sharer under an admin video-off', /if \(forcedCamOff\(sid\)\) return null;/.test(sd));
  const comp = between('        const stgKeep = new Set();', 'for (const id of stripPack.ids())');
  check('the strip compositor paints an admin video-off dark', /const dark = forcedCamOff\(sid\) \? 1 : 0;/.test(comp));
  check('…and bakes a moderator blur into a camera cell, never into a shared screen',
    /const blur = \(!dark && sid !== myId && modBlurOn\(sid\) && !sharingScreen\(sid\)\) \? Math\.max\(1, blurLevelFor\(sid\)\) : 0;/.test(comp)
    && /fit: fitFor\(sid\), dark, blur \}/.test(comp));
  check('the face boxes wear the receiver blur classes', /\.stagefacebox video\.blur1 \{ filter: blur\(11px\)/.test(html) && /\.stagefacebox video\.blur2 \{ filter: blur\(26px\)/.test(html));
  const pf = between('      const paintStageFaces = (faces) => {', '      // ---- GAPLESS PACKING');
  check('a face box applies its blur class', /face\.classList\.remove\('blur1', 'blur2'\);\s*if \(fc\.bl\) face\.classList\.add\('blur' \+ fc\.bl\);/.test(pf));
  check('every face <video> is still class stageface (PiP, filmstrip and the bus skip it)', /v\.className = 'stageface';/.test(pf));
}

// ---- 6. the packer: a dark cell draws no pixels, a blurred one draws small ---
{
  const timers = new Map(); let seq = 0;
  const oldSI = global.setInterval, oldCI = global.clearInterval, oldDoc = global.document, oldMS = global.MediaStream;
  global.setInterval = (fn) => { const id = ++seq; timers.set(id, fn); return id; };
  global.clearInterval = (id) => { timers.delete(id); };
  const draws = [], texts = [];
  const mkCtx = (tag) => ({
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: '', imageSmoothingEnabled: true,
    fillRect() {}, beginPath() {}, arc() {}, fill() {}, strokeRect() {}, fillText(t) { texts.push(t); },
    measureText() { return { width: 0 }; },
    drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) { draws.push({ tag, src: src && src.tag, dw, dh }); },
  });
  let nCanvas = 0;
  global.document = { createElement() { const tag = 'cv' + (nCanvas++); return { tag, width: 0, height: 0, getContext() { return mkCtx(tag); }, captureStream() { return { getVideoTracks() { return [{ stop() {} }]; } }; } }; } };
  global.MediaStream = FakeStream;
  try {
    const pk = MM.createPacker({ shape: 'bar', cell: 480, maxW: 2000, fps: 30 }).start();
    const camEl = { tag: 'cam', videoWidth: 640, videoHeight: 480, currentTime: 1 };
    const offEl = { tag: 'off', videoWidth: 640, videoHeight: 480, currentTime: 1 };
    const blurEl = { tag: 'blr', videoWidth: 640, videoHeight: 480, currentTime: 1 };
    pk.setTile('a', 0, camEl, new FakeStream([]), { n: 1, cols: 1, lbl: { name: 'Ada' } });
    pk.setTile('b', 1, offEl, new FakeStream([]), { n: 1, cols: 1, lbl: { name: 'Ben' }, dark: 1 });
    pk.setTile('c', 2, blurEl, new FakeStream([]), { n: 1, cols: 1, lbl: { name: 'Cy' }, blur: 2 });
    draws.length = 0; texts.length = 0;
    const realNow = Date.now; let t = 1e6; Date.now = () => (t += 1000);
    const perf = global.performance; global.performance = { now: () => (t += 1000) };
    for (const fn of [...timers.values()]) fn();
    Date.now = realNow; global.performance = perf;
    check('the packer drew the plain face at full cell size', draws.some((d) => d.src === 'cam' && d.dw === 480));
    check('a dark cell draws NO pixel of its source', !draws.some((d) => d.src === 'off'), draws.map((d) => d.src));
    check('…and still carries the name', texts.includes('Ben'), texts);
    check('a blurred cell is drawn into a tiny canvas first, never straight at cell size',
      draws.some((d) => d.src === 'blr' && d.dw <= 12) && !draws.some((d) => d.src === 'blr' && d.dw === 480), draws.filter((d) => d.src === 'blr'));
    check('…and the tiny canvas is stretched back over the cell', draws.some((d) => /^cv/.test(d.src || '') && d.dw === 480));
    check('the packer still counts three cells (the dark one keeps its place)', pk.count() === 3);
    pk.stop();
  } finally {
    global.setInterval = oldSI; global.clearInterval = oldCI; global.document = oldDoc; global.MediaStream = oldMS;
  }
}

console.log(fails ? '\n' + fails + ' FAILED (' + passes + ' passed)' : '\nALL PASS ' + passes);
process.exit(fails ? 1 : 0);
