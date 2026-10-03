// mu-stage-media.js — stage and mosaic media guards lifted out of site/run.html.
//
// The sweep, the ship, and the keyframe walk are one page script. These checks
// run the pure decisions in Node and pin the wiring those decisions plug into.
// A browser suite is a different question. This file does not start one.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
function lift(startMark, endMark) {
  const a = html.indexOf(startMark);
  const b = a < 0 ? -1 : html.indexOf(endMark, a + startMark.length);
  check('lift ' + startMark.trim().slice(0, 42), a > 0 && b > a);
  return a > 0 && b > a ? html.slice(a, b) : 'function missing(){ throw new Error("lift"); }\n';
}
function between(startMark, endMark) {
  const a = html.indexOf(startMark);
  const b = a < 0 ? -1 : html.indexOf(endMark, a + startMark.length);
  return a > 0 && b > a ? html.slice(a, b) : '';
}

// ---- blur: a throw is not a painted frame ---------------------------------
{
  const src = lift('    function noteBlurFrame(pipe, drew) {', '    // END-STAGE-BLUR-FRAME');
  const noteBlurFrame = new Function(src + '\nreturn noteBlurFrame;')();
  check('a missing pipe reports nothing', noteBlurFrame(null, true) === null);
  const pipe = {};
  check('a drawn frame counts after the draw', noteBlurFrame(pipe, true) === null && pipe.painted === 1 && pipe.failed === 0);
  check('one failed draw does not regrab', noteBlurFrame(pipe, false) === null && pipe.failed === 1 && pipe.painted === 1);
  check('two failed draws still wait', noteBlurFrame(pipe, false) === null && pipe.failed === 2);
  check('the third failed draw names the regrab', noteBlurFrame(pipe, false) === 'blurpipe:draw-failed' && pipe.failed === 3);
  check('a later draw clears the failure run', noteBlurFrame(pipe, true) === null && pipe.painted === 2 && pipe.failed === 0);
}

// ---- pipe deny backs off and lapses ---------------------------------------
{
  const src = lift('    function pipeDenyWait(hits) {', '    // END-STAGE-PIPE-DENY');
  let now = 1000;
  const Date = { now: () => now };
  const pipeDeny = new Set();
  const pipeDenyUntil = new Map();
  const pipeDenyN = new Map();
  const api = new Function('pipeDeny', 'pipeDenyUntil', 'pipeDenyN', 'Date', src + '\nreturn { pipeDenyWait, pipeDenyStamp, pipeDenyCurrent };')(pipeDeny, pipeDenyUntil, pipeDenyN, Date);
  check('first deny waits 60s', api.pipeDenyWait(1) === 60000);
  check('second deny doubles', api.pipeDenyWait(2) === 120000);
  check('the wait caps at 10 min', api.pipeDenyWait(20) === 600000);
  check('a zero hit still waits 60s', api.pipeDenyWait(0) === 60000);
  pipeDeny.add('j1');
  api.pipeDenyStamp('j1');
  check('a fresh deny is still current', api.pipeDenyCurrent('j1') === true && pipeDeny.has('j1'));
  now = 1000 + 60000;
  check('the deny lapses on the clock', api.pipeDenyCurrent('j1') === false && !pipeDeny.has('j1') && !pipeDenyUntil.has('j1'));
  check('a job that was never denied is not denied', api.pipeDenyCurrent('other') === false);
}

// ---- keyframe target is the asker's sender --------------------------------
{
  const src = lift('    function kfTargets(entries, key, fromPid) {', '    // END-STAGE-KF-TARGETS');
  const kfTargets = new Function(src + '\nreturn kfTargets;')();
  const entries = [
    { jk: 'stg:a>p1', key: 'stg:a', piped: false },
    { jk: 'stg:a>p2', key: 'stg:a', piped: false },
    { jk: 'stg:a>p3', key: 'stg:a', piped: true },
    { jk: 'stg:b>p1', key: 'stg:b', piped: false },
  ];
  check('the asker job is the only jiggle when it exists', JSON.stringify(kfTargets(entries, 'stg:a', 'p2')) === JSON.stringify(['stg:a>p2']));
  check('with no asker job, every non-piped sender of that key is a target', JSON.stringify(kfTargets(entries, 'stg:a', 'nope')) === JSON.stringify(['stg:a>p1', 'stg:a>p2']));
  check('a piped job is not a producer jiggle', JSON.stringify(kfTargets(entries, 'stg:a', null)).indexOf('p3') < 0);
  check('another key stays out', JSON.stringify(kfTargets(entries, 'stg:b', null)) === JSON.stringify(['stg:b>p1']));
}

// ---- one jiggle, restore to the stored base --------------------------------
{
  const src = lift('    function noteJiggleBase(sd, base) {', '    // STAGE-KF-TARGETS');
  const log = [];
  const kfEv = (key, act, x) => log.push(act);
  const jiggleState = new WeakMap();
  const api = new Function('kfEv', 'jiggleState', src + '\nreturn { noteJiggleBase, armJiggle };')(kfEv, jiggleState);
  const scales = [];
  const sd = {
    getParameters() { return { encodings: [{ scaleResolutionDownBy: scales.length ? scales[scales.length - 1] : 1 }] }; },
    setParameters(prm) { scales.push(prm.encodings[0].scaleResolutionDownBy); return Promise.resolve(); },
  };
  const queued = [];
  const orig = global.setTimeout;
  global.setTimeout = (fn) => { queued.push(fn); return 1; };
  const first = api.armJiggle(sd, 'stg:a', 'jiggle');
  const second = api.armJiggle(sd, 'stg:a', 'jiggle');
  check('the first jiggle starts', first === true);
  check('a second jiggle while busy is skipped', second === false && log.indexOf('jiggle-skip') >= 0);
  check('the encoder steps to 1.25 times its base', scales[0] === 1.25);
  Promise.resolve().then(() => {
    check('the restore is armed', queued.length === 1);
    queued.shift()();
    check('the restore uses the stored base, not the 1.25', scales[scales.length - 1] === 1);
    const st = jiggleState.get(sd);
    check('the sender is free after the restore', st && st.busy === false && st.base === 1);
    api.noteJiggleBase(sd, 2);
    log.length = 0;
    const third = api.armJiggle(sd, 'stg:a', 'pulse');
    check('a stored base of 2 jiggles to 2.5', third === true && scales[scales.length - 1] === 2.5);
    return Promise.resolve().then(() => {
      queued.shift()();
      check('the restore returns to 2', scales[scales.length - 1] === 2 && jiggleState.get(sd).base === 2);
      global.setTimeout = orig;
      // a sync throw must clear busy
      const bad = {
        getParameters() { return { encodings: [{ scaleResolutionDownBy: 1 }] }; },
        setParameters() { throw new Error('nope'); },
      };
      const threw = api.armJiggle(bad, 'stg:a', 'jiggle');
      const again = api.armJiggle(bad, 'stg:a', 'jiggle');
      check('a throwing setParameters does not stick the busy flag', threw === false && again === false && !(jiggleState.get(bad) && jiggleState.get(bad).busy));
      finishDarkAndRest();
    });
  }).catch((e) => {
    global.setTimeout = orig;
    check('jiggle sequence ran', false, String(e && e.stack || e));
    finishDarkAndRest();
  });
}

function finishDarkAndRest() {
  // ---- dark standby gives up ----------------------------------------------
  {
    const src = lift('    function standbyStaysHot(fb, now, wakeMax) {', '    // END-STAGE-DARK-HOLD');
    const standbyStaysHot = new Function(src + '\nreturn standbyStaysHot;')();
    const fb = { dark: true, wakeAt: 1000, d0: 5, stdFdec: 5, suspect: false };
    check('a live wake stays hot', standbyStaysHot(fb, 1000 + 1000, 15000) === true && fb.dark === true && fb.suspect === false);
    check('a stale wake with no flow becomes suspect', standbyStaysHot(fb, 1000 + 20000, 15000) === false && fb.dark === false && fb.suspect === true && fb.wakeAt === 0);
    check('suspect stays cold on the next read', standbyStaysHot(fb, 1000 + 20000, 15000) === false);
    const live = { dark: true, wakeAt: 0, d0: -1, stdFdec: 0, suspect: false };
    check('dark with no wake clock stays hot until a wake goes stale', standbyStaysHot(live, 5000, 15000) === true);
    const flowed = { dark: true, wakeAt: 1000, d0: 1, stdFdec: 4, suspect: false };
    check('a standby that decoded stays hot and does not go suspect', standbyStaysHot(flowed, 1000 + 20000, 15000) === true && flowed.suspect === false && flowed.dark === true);
  }

  // ---- which claims get a video element ------------------------------------
  {
    const src = lift('    function mosNeedsVideo(rk) {', '    // END-STAGE-MOS-EL');
    const mosNeedsVideo = new Function(src + '\nreturn mosNeedsVideo;')();
    for (const rk of ['subraw', 'x1', 'x2:3', 'sdxc:2', 'sdnmr:abc']) check('no video element for ' + rk, mosNeedsVideo(rk) === false);
    for (const rk of ['sdx', 'sdm', 'sdn', 'sgs', 'stg:abc', 'sdrow:1', 'x2']) check('video element for ' + rk, mosNeedsVideo(rk) === true);
  }

  // ---- announce cadence -----------------------------------------------------
  {
    const src = lift('    function mosMetaCopy(meta) {', '    // END-STAGE-ANN-DUE');
    const api = new Function(src + '\nreturn { mosMetaCopy, mosAnnDue };')();
    const meta = { h: 1, n: 2 };
    check('a new container id is due', api.mosAnnDue(meta, 'old', 0, meta, 'new', 1000) === true);
    check('a meta change is due', api.mosAnnDue(meta, 's', 0, { h: 2, n: 2 }, 's', 1000) === true);
    check('the same announce inside 5s is not due', api.mosAnnDue(meta, 's', 1000, meta, 's', 5999) === false);
    check('the same announce at 5s is due', api.mosAnnDue(meta, 's', 1000, meta, 's', 6000) === true);
    check('a missing previous id is due', api.mosAnnDue(null, null, 0, meta, 's', 1000) === true);
    const copy = api.mosMetaCopy(meta);
    meta.h = 9;
    check('the stored meta copy does not follow a later mutation', copy.h === 1);
  }

  // ---- down-leg audio -------------------------------------------------------
  {
    const src = lift('    function stgDownShip(key, stream, screenOn, memo) {', '    // END-STAGE-DOWN-SHIP');
    class MediaStream { constructor(tracks) { this.tracks = tracks || []; this.id = 'ms' + (MediaStream.n = (MediaStream.n || 0) + 1); } getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); } }
    const stgDownShip = new Function('MediaStream', src + '\nreturn stgDownShip;')(MediaStream);
    const memo = new Map();
    const full = new MediaStream([
      { kind: 'audio', id: 'a', readyState: 'live' },
      { kind: 'video', id: 'v', readyState: 'live' },
    ]);
    const screen = stgDownShip('stg:owner', full, true, memo);
    check('a screen share down-leg keeps the full stream', screen === full);
    const audio = stgDownShip('stg:owner', full, false, memo);
    check('a camera down-leg is audio only', audio && audio !== full && audio.getAudioTracks().length === 1 && audio.tracks.every((t) => t.kind === 'audio'));
    const again = stgDownShip('stg:owner', full, false, memo);
    check('the same audio tracks reuse one container', again === audio);
    full.tracks[0] = { kind: 'audio', id: 'a2', readyState: 'live' };
    const minted = stgDownShip('stg:owner', full, false, memo);
    check('a new audio track mints a new container', minted !== audio);
    const silent = new MediaStream([{ kind: 'video', id: 'v2', readyState: 'live' }]);
    check('a video-only down-leg ships nothing', stgDownShip('stg:owner', silent, false, memo) === null);
    const ended = new MediaStream([{ kind: 'audio', id: 'ae', readyState: 'ended' }]);
    check('an ended audio track ships nothing', stgDownShip('stg:owner', ended, false, memo) === null);
    check('a null stream ships nothing', stgDownShip('stg:owner', null, false, memo) === null);
  }

  // ---- follow-ups: memo lifetime, one hot read, audio-only copies stay down --
  {
    const src = lift('    function stgDownShip(key, stream, screenOn, memo) {', '    // END-STAGE-DOWN-SHIP');
    let stgDownMeta = null;
    try { stgDownMeta = new Function('MediaStream', src + '\nreturn typeof stgDownMeta === "function" ? stgDownMeta : null;')(function () {}); } catch (e) {}
    check('stgDownMeta sits in the down-ship block', typeof stgDownMeta === 'function');
    if (stgDownMeta) {
      const hm = { h: 2 }, full = { id: 'full' }, ao = { id: 'ao' };
      const tagged = stgDownMeta(hm, ao, full);
      check('an audio-only down copy is announced ao', tagged && tagged.ao === 1 && tagged.h === 2 && hm.ao === undefined);
      check('a full down copy (screen share) keeps the plain meta', stgDownMeta(hm, full, full) === hm);
    }
    const shipDn = html.match(/shipMos\((?:key|k), (?:dnP|mate), (?:dnSt|earSt), stgDownMeta\(/g) || [];
    check('the deep down-leg, the head row re-fan and the S1 down-leg tag their copies', shipDn.length === 3, shipDn.length);
    check('the mx receiver keeps the ao tag', /mosAnn\.set\(ak, \{[^\n]*ao: \(m\.ao === 1 \? 1 : undefined\)/.test(html));
    check('annMeta carries ao onto the claimed slot', /const annMeta = \(ann\) => \(\{[^\n]*ao: ann\.ao \}\)/.test(html));
    const rs = between('        const relayStg = (key, stream, via, h, ao) => {', '        if (iAmHead) for (const k of heldStg)');
    check('relayStg ships an ao copy neither up nor across', /if \(!ao && upTgt && !skip\(upTgt\)\)/.test(rs) && /if \(!ao && xUpPid && xUpPid !== upTgt && !skip\(xUpPid\)\)/.test(rs));
    check('relayStg is told when the held copy is ao', /relayStg\(k, f\.stream, f\.via, stgHop\(f\), !!\(f\.meta && f\.meta\.ao\)\)/.test(rs));
    check('stgAudioMemo is a WeakMap, never iterated or sized', /let stgAudioMemo = new WeakMap\(\);/.test(html) && !/stgAudioMemo\.(clear|size|keys|values|entries|forEach)\b/.test(html) && !/of stgAudioMemo\b/.test(html));
    const cr = between('    function claimRedun(rk, arr) {', '\n    function ');
    check('claimRedun reads standbyStaysHot once per pass', (cr.match(/standbyStaysHot\(/g) || []).length === 1, (cr.match(/standbyStaysHot\(/g) || []).length);
  }

  // ---- wiring pins ----------------------------------------------------------
  const ear = between('    function ensureStageEar() {', '    function syncStageEar');
  check('ensureStageEar resumes the context before it returns the existing ear', ear.indexOf('ensureAc()') >= 0 && ear.indexOf('ensureAc()') < ear.indexOf('if (stageEar) return'));
  const ac = between('    function ensureAc() {', '    document.addEventListener');
  check('ensureAc resumes suspended and interrupted', ac.indexOf("ac.state === 'suspended'") >= 0 && ac.indexOf("ac.state === 'interrupted'") >= 0 && ac.indexOf('onstatechange') >= 0);
  const roles = between('    function endRelayRolesFor(pid)', '    function ensureStageEar');
  check('a leaving requester drops its aux senders', /relayJobs\.delete\(key\)/.test(roles) && /for \(const sd of job\.senders \|\| \[\]\) auxSenders\.delete\(sd\)/.test(roles));
  check('a new mx reconciles and a repeat only claims', /const annNew = !prevAnn \|\| prevAnn\.streamId !== m\.streamId/.test(html) && /if \(annNew\) schedReconcile\(\); else schedClaim\(\)/.test(html));
  check('kfNeed keeps a one-argument signature and reads the asker', /function kfNeed\(key\)/.test(html) && /kfAsker = p\.id/.test(html) && /const fromPid = kfAsker/.test(html));
  check('a relay job stores upKey', /upKey: upKey \|\| null/.test(html) && /shipMos\('sub', headPid, subraw\.stream,[\s\S]{0,120}, 'subraw'\)/.test(html) && /shipMos\('x2', xPid,[\s\S]{0,160}, 'x1'\)/.test(html));
  check('sdn, sdrow, sdx^x and sdnm hops name their source slot', /blockMeta\(sdx\), 'sdx'\)/.test(html) && /blockMeta\(xf\)\), mk\)/.test(html) && /blockMeta\(xc\)\), mk\)/.test(html) && /blockMeta\(mf\)\), mk\)/.test(html));
  const repaint = between('    function repaintRedun(rk, stream) {', '    function schedReconcile()');
  check('an sgs failover schedules reconcile and does not paint the strip', /rk === 'sgs'/.test(repaint) && /schedReconcile\(\)/.test(repaint) && repaint.indexOf('paintStageStrip') < 0);
  check('a parked standby has no video element until wake', /el: null, meta: annMeta\(wantStd\.ann\)/.test(html) && /if \(std && !std\.el && std\.stream\) std\.el = mosVideo\(std\.stream\)/.test(html));
  check('relay-only claims ask mosNeedsVideo before creating an element', /el: mosNeedsVideo\(rk\) \? mosVideo\(st\) : null/.test(html));
  check('the screen pulse does not jiggle', /if \(sharingScreen\) \{ kfEv\(key2, 'pulse-skip', \{ why: 'screen' \}\); return; \}/.test(html));
  check('the jiggle scale is sr0 times 1.25', /scaleResolutionDownBy = sr0 \* 1\.25/.test(html));
  check('S1 rook flood still ships the full stream', /for \(const t of s1peers\) \{ if \(skip\(t\)\) continue; const jk = shipMos\(key, t, stream, hm, key\)/.test(html));
  check('the deep down-leg and the S1 down-leg call stgDownShip', (html.match(/stgDownShip\(key, stream, !!\(owner && sharingScreen\(owner\)\), stgAudioMemo\)/g) || []).length === 2);
  check('a deep head row re-fan calls stgDownShip', /stgDownShip\(k, f\.stream, sharingScreen\(owner\), stgAudioMemo\)/.test(html));
  check('an attach failure is logged and remembered per pc generation', /why: 'attach-failed'/.test(html) && /attachFailAt\.get\(to\) === attachGen/.test(html) && /job\.attachErr = \(e && e\.name\) \|\| 'error'/.test(html));
  check('stopMosaic clears deny expiry and attach failures', /pipeDeny\.clear\(\); pipeDenyUntil\.clear\(\); pipeDenyN\.clear\(\)/.test(html) && /attachFailAt\.clear\(\); stgAudioMemo = new WeakMap\(\);/.test(html));
  check('pipe failback still unships after the deny stamp', (html.match(/pipeDeny\.add\(jk\); unshipMos\(jk, true\)/g) || []).length >= 2);
  check('suspect is watchable, not urgent', /if \(\(fb\.dark \|\| fb\.wakeAt\) && !fb\.suspect\) \{ urgent = true; break; \}/.test(html) && /if \(fb\.suspect \|\| mosStandby\.get\(rk\)\) watchable = true/.test(html));
  const hot = between('const WAKE_MAX = MOS_GRACE * 3', 'function mosVideo');
  check('the hot set asks standbyStaysHot', /standbyStaysHot\(fb, now, WAKE_MAX\)/.test(html));

  console.log(fail ? '\n' + fail + ' FAILED' : '\nALL PASS');
  process.exit(fail ? 1 : 0);
}
