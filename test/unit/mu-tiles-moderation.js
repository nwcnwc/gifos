// mu-tiles-moderation.js — guards for the tiles-moderation findings that
// still lived in site/run.html. Pure node. No browser, no fleet.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');
let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};
function extractFn(text, name) {
  const key = 'function ' + name + '(';
  const i = text.indexOf(key);
  if (i < 0) return null;
  const brace = text.indexOf('{', i);
  let depth = 0;
  for (let j = brace; j < text.length; j++) {
    const c = text[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(i, j + 1);
    }
  }
  return null;
}
function runFn(name, prelude, call) {
  const body = extractFn(src, name);
  check(name + ' is in run.html', !!body);
  if (!body) return null;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext('var OUT = {};\n' + prelude + '\n' + body + '\n' + call, ctx);
  return ctx.OUT;
}

// ---- admin presence hold (finding 1) ----------------------------------------
{
  const ctx = runFn('admSeenLive', `
    var statusOf = new Map();
    var peers = new Map();
    var HOLDOVER_MS = 60000;
  `, `
    OUT.r1 = admSeenLive('a', 1000, 21000);
    statusOf.set('a', { away: true });
    OUT.r2 = admSeenLive('a', 1000, 46000);
    statusOf.set('a', { away: false });
    peers.set('a', { connected: true });
    OUT.r3 = admSeenLive('a', 1000, 46000);
    peers.set('a', { connected: false });
    OUT.r4 = admSeenLive('a', 1000, 46000);
    statusOf.set('a', { away: true });
    OUT.r5 = admSeenLive('a', 1000, 70000);
  `);
  if (ctx) {
    check('a sighting under 30 s counts, with no away bit and no link', ctx.r1 === true);
    check('a 45 s sighting counts while the admin said away', ctx.r2 === true);
    check('a 45 s sighting counts while the admin link is up', ctx.r3 === true);
    check('a 45 s sighting does not count when the admin is here and disconnected', ctx.r4 === false);
    check('a sighting past HOLDOVER_MS does not count, even if away', ctx.r5 === false);
  }
  const watch = extractFn(src, 'adminWatch');
  check('adminWatch exists', !!watch);
  if (watch) {
    const hold = watch.indexOf('stHold(');
    const arm = watch.indexOf('startAdminCountdown');
    check('adminWatch does not arm the grace while an admin seat is still held', hold > 0 && arm > hold);
  }
}

// ---- lost fold hold (finding 16) --------------------------------------------
{
  const ctx = runFn('roomConsentFromFold', `
    var SCALE = { C: 5 };
    var FOLD_HOLD_MS = 120 * 500;
  `, `
    var past = 1000000;
    OUT.big = roomConsentFromFold({ n: 100, refuse: 0, part: false }, past, past);
    OUT.soon = roomConsentFromFold(null, past, past + 1000);
    OUT.horizon = roomConsentFromFold(null, past, past + FOLD_HOLD_MS);
    OUT.startup = roomConsentFromFold(null, 0, past);
    OUT.smallFold = roomConsentFromFold({ n: 8, refuse: 9, part: true }, past, past + 1000);
    OUT.hold = FOLD_HOLD_MS;
  `);
  if (ctx) {
    check('a live fold bigger than one section follows refuse and part, not a five-minute clock', ctx.big === true);
    check('a lost fold stays blurred inside the fold horizon', ctx.soon === false);
    check('the hold is the fold horizon (120 ticks x 500 ms), not 300000', ctx.hold === 60000 && ctx.horizon === true);
    check('a room that was never past one section is not held', ctx.startup === true);
    check('a live fold at section size is the whole rule, even with refuse bits', ctx.smallFold === true);
  }
  check('roomConsentOk no longer hard-codes a 300000 ms hold', !/roomPastAt < 300000/.test(src));
}

// ---- room digest is copied once per turn (finding 39) -----------------------
{
  const nowFn = extractFn(src, 'roomDigNow');
  const digFn = extractFn(src, 'roomDig');
  check('roomDig and roomDigNow exist', !!(nowFn && digFn));
  if (nowFn && digFn) {
    const ctx = {
      calls: 0,
      queueMicrotask: (f) => { ctx.pending = f; },
    };
    vm.createContext(ctx);
    vm.runInContext(`
      var OUT = {};
      var passMemo = null;
      var roomDigBox = null;
      var meshNode = { roomDigest: function () { calls++; return { age: 1, n: 4, stage: [{ id: 'p' }], hands: [], apps: [], votes: [] }; } };
      function digestMode() { return true; }
    ` + nowFn + '\n' + digFn + `
      OUT.a = roomDig();
      OUT.b = roomDig();
      OUT.calls1 = calls;
      pending();
      OUT.c = roomDig();
      OUT.calls2 = calls;
    `, ctx);
    const o = ctx.OUT;
    check('two roomDig calls in one turn copy the fold once', o.calls1 === 1 && o.a === o.b);
    check('the next turn copies again', o.calls2 === 2 && o.c !== o.a);
  }
}

// ---- filmstrip speaker hold (finding 7) -------------------------------------
{
  const pick = extractFn(src, 'fsPickAuto');
  check('fsPickAuto exists', !!pick);
  if (pick) {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(`
      var OUT = {};
      var fsAutoPid = 'b';
      var speakingOf = new Map([['a', true], ['b', true]]);
    ` + pick + `
      var srcList = [{ key: 'peer:a' }, { key: 'peer:b' }];
      OUT.held = fsPickAuto(srcList).key;
      speakingOf.set('b', false);
      OUT.next = fsPickAuto(srcList).key;
      speakingOf.set('a', false);
      OUT.quiet = fsPickAuto(srcList).key;
    `, ctx);
    check('two talkers do not snap the big view back to map order', ctx.OUT.held === 'peer:b');
    check('when the holder stops, the other talker takes the view', ctx.OUT.next === 'peer:a');
    check('when nobody is talking the last holder stays', ctx.OUT.quiet === 'peer:a');
  }
  const refresh = extractFn(src, 'fsRefresh');
  check('fsRefresh exists', !!refresh);
  if (refresh) {
    check('fsRefresh does not wipe the strip (thumbs keep their nodes)', !/fsstrip\.textContent\s*=/.test(refresh));
    check('fsRefresh reuses a thumb by its key', /have\.get\(s\.key\)/.test(refresh));
    check('fsRefresh still paints the blur class on a new thumb and on a reused thumb', (refresh.match(/fsBlurClass\(tv, s\.bl\)/g) || []).length >= 2);
  }
  const pass = extractFn(src, 'roomReactPass') || '';
  check('the room pass refreshes an open filmstrip', /fsRefreshIfOpen\(\)/.test(pass));
  const drop = extractFn(src, 'dropPeer') || '';
  check('dropPeer refreshes an open filmstrip', /fsRefreshIfOpen\(\)/.test(drop));
  const trackAt = src.indexOf('pc.ontrack = (ev) => {');
  const track = trackAt < 0 ? '' : src.slice(trackAt, src.indexOf('pc.onicecandidate', trackAt));
  check('ontrack refreshes an open filmstrip', /fsRefreshIfOpen\(\)/.test(track));
  check('the 2 s filmstrip tick remains the fallback', /setInterval\(fsRefresh, 2000\)/.test(src));
}

// ---- blur pipe identity (finding 15) ----------------------------------------
{
  const tuneCtx = runFn('blurPipeTune', '', `
    OUT.max = blurPipeTune(2);
    OUT.min = blurPipeTune(1);
  `);
  if (tuneCtx) {
    check('Max blur tunes to 26 px and a 320 px long side', tuneCtx.max.px === 26 && tuneCtx.max.capW === 320 && tuneCtx.max.level === 2);
    check('Min blur tunes to 11 px and a 480 px long side', tuneCtx.min.px === 11 && tuneCtx.min.capW === 480);
  }
  const reuseCtx = runFn('blurPipeCanReuse', '', `
    var live = { readyState: 'live' };
    OUT.yes = blurPipeCanReuse({ camId: 'c', track: live }, 'c');
    OUT.levelIgnored = blurPipeCanReuse({ camId: 'c', track: live, level: 1 }, 'c');
    OUT.cam = blurPipeCanReuse({ camId: 'c', track: live }, 'other');
    OUT.ended = blurPipeCanReuse({ camId: 'c', track: { readyState: 'ended' } }, 'c');
    OUT.none = blurPipeCanReuse(null, 'c');
  `);
  if (reuseCtx) {
    check('the same live camera reuses the pipe at any level', reuseCtx.yes === true && reuseCtx.levelIgnored === true);
    check('a different camera does not reuse the pipe', reuseCtx.cam === false);
    check('an ended track does not reuse the pipe', reuseCtx.ended === false && reuseCtx.none === false);
  }
  const pipe = extractFn(src, 'startBlurPipe') || '';
  const reuseAt = pipe.indexOf('blurPipeCanReuse(');
  const stopAt = pipe.indexOf('stopBlurPipe()');
  check('startBlurPipe decides reuse before it stops the old pipe', reuseAt > 0 && stopAt > reuseAt);
  check('the paint reads the pipe\'s own level, radius, and cap', /pipe\.px/.test(pipe) && /pipe\.capW/.test(pipe) && /pipe\.level/.test(pipe));
}

// ---- meter does not price stageIds up front (finding 18) -------------------
{
  const meterAt = src.indexOf('let meterHiddenTick = 0');
  const meter = meterAt < 0 ? '' : src.slice(meterAt, src.indexOf('}, 180);', meterAt));
  check('the meter tick no longer builds stageIds before the loop', !/const stgSet = \(\(\) =>/.test(meter));
  const hidden = meter.indexOf("style.display === 'none'");
  const stage = meter.indexOf('stageIds()');
  check('stageIds runs only once a hidden tile asks for it', hidden > 0 && stage > hidden);
}

// ---- status row and quiet writers (findings 24, 279) -----------------------
{
  const css = (src.match(/\.bar \.status \{[^}]+\}/) || [''])[0];
  check('the status line ellipsizes instead of wrapping onto a new row', /white-space:\s*nowrap/.test(css) && /text-overflow:\s*ellipsis/.test(css) && /min-height:\s*1\.3em/.test(css) && /min-width:\s*0/.test(css) && /overflow:\s*hidden/.test(css));
  const statusFn = extractFn(src, 'updateStatus') || '';
  check('updateStatus writes the status text only when it changed', /statusEl\.textContent !== statusText/.test(statusFn) && /statusEl\.title = statusText/.test(statusFn));
  const grid = extractFn(src, 'reconcileGrid') || '';
  check('reconcileGrid writes display only when it changed', /el\.style\.display !== disp/.test(grid));
}

// ---- copy, labels, remembered blur (findings 33, 119, 271) -----------------
{
  check('Help no longer calls the default blur gentle', !/gently blurred/.test(src));
  check('Help and the lobby name Max blur', (src.match(/fully blurred \(Max\)/g) || []).length >= 2);
  check('the admin video hammer reads as an action', /Turn Video on/.test(src) && /Turn Video off/.test(src));
  check('the action label still contains the words the camera hammer test waits for', /Turn Video on/.test(extractFn(src, 'updateCamAllBtn') || ''));
  const store = runFn('storedBlurLevel', `
    var BLUR_KEY = 'gifos_blur';
    var store = {};
    var localStorage = {
      getItem: function (k) { return store[k] == null ? null : store[k]; },
      setItem: function (k, v) { store[k] = String(v); }
    };
  `, `
    OUT.def = storedBlurLevel();
    localStorage.setItem(BLUR_KEY, '1');
    OUT.min = storedBlurLevel();
    localStorage.setItem(BLUR_KEY, '0');
    OUT.none = storedBlurLevel();
    localStorage.setItem(BLUR_KEY, '9');
    OUT.bad = storedBlurLevel();
    localStorage.setItem(BLUR_KEY, 'true');
    OUT.legacy = storedBlurLevel();
  `);
  if (store) {
    check('a missing blur memory is Max (2)', store.def === 2);
    check('Min and No blur round-trip', store.min === 1 && store.none === 0);
    check('a bad stored value falls back to Max', store.bad === 2);
    check('a legacy true value is Max', store.legacy === 2);
  }
  const setBlur = extractFn(src, 'setPersonalBlur') || '';
  check('setPersonalBlur writes gifos_blur', /localStorage\.setItem\(BLUR_KEY/.test(setBlur));
}

// ---- parked phone vs a playing feed (finding 54; 267 is the same bug) ------
{
  const play = runFn('videoIsPlaying', '', `
    OUT.no = videoIsPlaying(null);
    OUT.paused = videoIsPlaying({ srcObject: {}, paused: true, readyState: 4, videoWidth: 100 });
    OUT.live = videoIsPlaying({ srcObject: {}, paused: false, readyState: 2, videoWidth: 100 });
    OUT.black = videoIsPlaying({ srcObject: {}, paused: false, readyState: 2, videoWidth: 0 });
  `);
  if (play) {
    check('a playing frame counts', play.live === true);
    check('a paused, empty, or zero-size video does not count', play.no === false && play.paused === false && play.black === false);
  }
  const watch = runFn('viewerWatching', `
    var document = { hidden: false };
    var stagefeedEl = { querySelectorAll: function () { return []; } };
    var stadiumEl = { querySelector: function () { return null; } };
    var peers = new Map();
    function videoIsPlaying(v) {
      return !!(v && v.srcObject && !v.paused && v.readyState >= 2 && (v.videoWidth || 0) > 0);
    }
  `, `
    OUT.quiet = viewerWatching();
    stagefeedEl = { querySelectorAll: function () { return [{ srcObject: {}, paused: false, readyState: 4, videoWidth: 320 }]; } };
    OUT.stage = viewerWatching();
    document.hidden = true;
    OUT.hidden = viewerWatching();
    document.hidden = false;
    stagefeedEl = { querySelectorAll: function () { return []; } };
    peers.set('p', { video: { srcObject: {}, paused: false, readyState: 4, videoWidth: 100, style: { display: '' } }, tile: { style: { display: '' }, classList: { contains: function () { return false; } } } });
    OUT.tile = viewerWatching();
    peers.set('p', { video: { srcObject: {}, paused: false, readyState: 4, videoWidth: 100, style: { display: '' } }, tile: { style: { display: '' }, classList: { contains: function (c) { return c === 'cam-off'; } } } });
    OUT.camoff = viewerWatching();
  `);
  if (watch) {
    check('nothing playing is not watching', watch.quiet === false);
    check('a playing stage counts, a hidden page does not', watch.stage === true && watch.hidden === false);
    check('a visible remote tile counts, a cam-off tile does not', watch.tile === true && watch.camoff === false);
  }
  check('the park check treats a watching page as present', /const idle = IS_MOBILE && !viewerWatching\(\) && Date\.now\(\) - lastActive > IDLE_MS;/.test(src));
}

// ---- tab return does not kick a live desktop video (finding 42) ------------
{
  const ctx = runFn('kickFrozenVideo', '', `
    var v = { srcObject: {} };
    OUT.desk = kickFrozenVideo(v, false, 0, 0);
    OUT.moved = kickFrozenVideo(v, true, 4, 9);
    OUT.stuck = kickFrozenVideo(v, true, 4, 4);
    OUT.empty = kickFrozenVideo({ srcObject: null }, true, 0, 0);
  `);
  if (ctx) {
    check('a desktop return does not reattach', ctx.desk === false);
    check('a mobile video whose frames advanced is left alone', ctx.moved === false);
    check('a mobile video whose frames stuck is kicked', ctx.stuck === true);
    check('a video with no stream is not kicked', ctx.empty === false);
  }
  check('the return path waits 500 ms and reads totalVideoFrames', /setTimeout\(\(\) => \{[\s\S]{0,400}totalVideoFrames/.test(src));
}

// ---- dialogs and pressed state (finding 26) --------------------------------
{
  check('armMeetDialogs exists', /function armMeetDialogs\(/.test(src));
  const arm = extractFn(src, 'armMeetDialogs') || '';
  check('name-modals become dialogs', /setAttribute\('role', 'dialog'\)/.test(arm) && /setAttribute\('aria-modal', 'true'\)/.test(arm));
  check('Escape closes the top open dialog', /e\.key !== 'Escape'/.test(arm) && /style\.display = 'none'/.test(arm));
  check('opening a dialog focuses a control and closing returns focus', /_opener/.test(arm) && /focusOf\(el\)/.test(arm));
  const paint = extractFn(src, 'paintControls') || '';
  check('mic, camera, and blur segments expose aria-pressed', (paint.match(/setAttribute\('aria-pressed'/g) || []).length >= 3);
}

console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
