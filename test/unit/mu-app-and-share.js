// mu-app-and-share.js — guards for the app-and-share findings that were
// still in site/run.html. Each rule is the function the page runs, lifted
// and called here. No browser.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
function sliceFn(name) {
  const key = 'function ' + name;
  const i = html.indexOf(key);
  if (i < 0) return '';
  const brace = html.indexOf('{', i);
  let d = 0;
  for (let j = brace; j < html.length; j++) {
    if (html[j] === '{') d++;
    else if (html[j] === '}') { d--; if (d === 0) return html.slice(i, j + 1); }
  }
  return '';
}
function sliceFrom(start, endMark) {
  const a = html.indexOf(start);
  const b = a < 0 ? -1 : html.indexOf(endMark, a + start.length);
  return a > 0 && b > a ? html.slice(a, b) : '';
}

// ---- structural claim grace (finding 154) ----
{
  const src = sliceFn('structuralClaimGrace');
  check('structuralClaimGrace is where the lift expects it', !!src);
  const structuralClaimGrace = new Function(src + '\nreturn structuralClaimGrace;')();
  const cur = { deadAt: 5 };
  check('a live announced claim clears deadAt and stays', structuralClaimGrace(cur, true, 100, 5000) === false && cur.deadAt === 0);
  const dead = {};
  check('the first dead sweep only stamps', structuralClaimGrace(dead, false, 1000, 5000) === false && dead.deadAt === 1000);
  check('inside the grace it stays', structuralClaimGrace(dead, false, 1000 + 5000, 5000) === false);
  check('past the grace it drops', structuralClaimGrace(dead, false, 1000 + 5001, 5000) === true);
  const mos = html.slice(html.indexOf('function claimMos'), html.indexOf('function trackAspect'));
  check('claimMos runs that grace on non-redundant slots only',
    /if \(isRedun\(rk\) \|\| !cur\) continue;/.test(mos) && /structuralClaimGrace\(cur, keep, nowA, MOS_GRACE\)/.test(mos));
}

// ---- widen an empty structural ask (finding 78) ----
{
  const src = sliceFn('sgaAskTargets');
  check('sgaAskTargets is where the lift expects it', !!src);
  const sgaAskTargets = new Function('peers', 'myId', 'sgaTargets', 'SGA_WIDEN_AFTER', src + '\nreturn sgaAskTargets;')(
    null, 'me', null, 3);
  function run(structural, open, tries) {
    const peers = new Map();
    for (const [pid, isOpen] of open) peers.set(pid, { dc: { readyState: isOpen ? 'open' : 'connecting' } });
    return new Function('peers', 'myId', 'sgaTargets', 'SGA_WIDEN_AFTER', src + '\nreturn sgaAskTargets;')(
      peers, 'me', () => structural, 3)('sid', tries).slice().sort();
  }
  check('an open structural channel keeps the first tries narrow',
    JSON.stringify(run(['a'], [['a', true], ['b', true]], 0)) === JSON.stringify(['a']));
  check('a closed structural set widens on the first try',
    JSON.stringify(run(['a'], [['a', false], ['b', true]], 0)) === JSON.stringify(['a', 'b']));
  check('an empty structural set widens on the first try',
    JSON.stringify(run([], [['b', true]], 0)) === JSON.stringify(['b']));
  check('after the widen threshold every open channel is asked',
    JSON.stringify(run(['a'], [['a', true], ['b', true]], 3)) === JSON.stringify(['a', 'b']));
}

// ---- seen-set sweep is not per frame (finding 79) ----
{
  const src = sliceFrom('    let sgaSeenSweepAt = 0, sgaSeenSweeps = 0;', '    const sgaSnap = new Map();');
  check('sgaNoteSeen is where the lift expects it', /function sgaNoteSeen/.test(src));
  const api = new Function('const sgaSeen = new Map();\n' + src + '\nreturn { note: sgaNoteSeen, sweeps: () => sgaSeenSweeps, size: () => sgaSeen.size };')();
  for (let i = 0; i < 10000; i++) api.note('k' + i, i * 6);
  check('10,000 notes inside a minute sweep a handful of times, not once a frame',
    api.sweeps() >= 1 && api.sweeps() <= 10, api.sweeps());
  check('the fresh keys are still in the map', api.size() === 10000, api.size());
}

// ---- snap from the advertised host replaces a slower clock (finding 87) ----
{
  const src = sliceFrom('    const sgaSnapChal = new Map();', '    function sgaDeliver(m');
  check('sgaSnapWins is where the lift expects it', /function sgaSnapWins/.test(src));
  function make(env) {
    return new Function('appStops', 'statusOf', 'myStatus', 'myId', 'meshGone', 'stHold', 'digLists', 'sgaSnap', 'sgaWant', 'peers', 'dcSend', 'sgaSubs',
      src + '\nreturn { sgaSnapWins, sgaConsiderSnap, sgaPromoteSnaps, chal: () => sgaSnapChal };')(
      env.appStops, env.statusOf, env.myStatus, env.myId, env.meshGone, env.stHold, env.digLists, env.sgaSnap, env.sgaWant, env.peers, env.dcSend, env.sgaSubs);
  }
  const env = {
    appStops: new Map(), statusOf: new Map(), myStatus: { app: { s: 'sid', ts: 1 } }, myId: 'old',
    meshGone: new Map(), stHold: () => true, digLists: () => null, sgaSnap: new Map(), sgaWant: new Map(),
    peers: new Map(), dcSend: () => {}, sgaSubs: new Map(),
  };
  const api = make(env);
  const oldSnap = { sid: 'sid', seq: 'old:3', at: 5000, kind: 'snap' };
  const neu = { sid: 'sid', seq: 'new:1', at: 1000, kind: 'snap' };
  env.sgaSnap.set('sid', oldSnap);
  check('the same author keeps the later clock', api.sgaSnapWins(oldSnap, { sid: 'sid', seq: 'old:4', at: 6000 }) === true);
  check('the same author rejects an older clock', api.sgaSnapWins(oldSnap, { sid: 'sid', seq: 'old:2', at: 1000 }) === false);
  check('a different author does not beat the advertised host on the clock', api.sgaSnapWins(oldSnap, neu) === false);
  check('that snap is held until the ad names its author', api.sgaConsiderSnap(neu) === false && api.chal().get('sid') && api.chal().get('sid').seq === 'new:1');
  env.statusOf.set('new', { app: { s: 'sid', ts: 9 } });
  const got = [];
  env.sgaSubs.set('sid', new Set([(m) => got.push(m.seq)]));
  api.sgaPromoteSnaps();
  check('once that author is the host, the slower clock replaces the old snap',
    env.sgaSnap.get('sid') && env.sgaSnap.get('sid').seq === 'new:1' && got[0] === 'new:1',
    env.sgaSnap.get('sid'));
}

// ---- one host walk per snap frame ----
{
  const src = sliceFrom('    const sgaSnapChal = new Map();', '    function sgaDeliver(m');
  let walks = 0;
  const env = {
    appStops: new Map(), statusOf: new Map(), myStatus: { app: { s: 'sid', ts: 1 } }, myId: 'old',
    meshGone: new Map(), stHold: () => true, digLists: () => { walks++; return null; }, sgaSnap: new Map(), sgaWant: new Map(),
    peers: new Map(), dcSend: () => {}, sgaSubs: new Map(),
  };
  const api = new Function('appStops', 'statusOf', 'myStatus', 'myId', 'meshGone', 'stHold', 'digLists', 'sgaSnap', 'sgaWant', 'peers', 'dcSend', 'sgaSubs',
    src + '\nreturn { sgaConsiderSnap };')(
    env.appStops, env.statusOf, env.myStatus, env.myId, env.meshGone, env.stHold, env.digLists, env.sgaSnap, env.sgaWant, env.peers, env.dcSend, env.sgaSubs);
  env.sgaSnap.set('sid', { sid: 'sid', seq: 'old:3', at: 5000, kind: 'snap' });
  walks = 0;
  api.sgaConsiderSnap({ sid: 'sid', seq: 'new:1', at: 1000, kind: 'snap' });
  check('a challenger snap walks the host list once', walks === 1, walks);
  env.statusOf.set('new', { app: { s: 'sid', ts: 9 } });
  walks = 0;
  const won = api.sgaConsiderSnap({ sid: 'sid', seq: 'new:2', at: 1000, kind: 'snap' });
  check('a snap from the new host wins with one host walk', won === true && walks === 1, walks);
  check('sgaRecvSnap hands its host lookup to sgaConsiderSnap', /if \(cur && !sgaSnapWins\(cur, m, hostOf\)\) \{ sgaConsiderSnap\(m, hostOf\); return; \}/.test(html) && /sgaDeliver\(m, hostOf\)/.test(html));
}

// ---- song flag, mix, leader name (findings 81, 82, 91, 93) ----
{
  const src = sliceFrom('    let singWas = false, singPrevMix = null, singSteppedUp = false;', '    function reactSing() {');
  check('endSongOnStepDown is where the lift expects it', /function endSongOnStepDown/.test(src) && /function rememberMix/.test(src));
  const store = {};
  const myStatus = { sing: 40 };
  const mix = { stage: 1, row: 0.7, stadium: 0.3 };
  const api = new Function('myStatus', 'mix', 'MIX_KEY', 'localStorage', src + '\nreturn { endSongOnStepDown, rememberMix, setPrev: (v) => { singPrevMix = v; }, getPrev: () => singPrevMix, setStepped: (v) => { singSteppedUp = v; } };')(
    myStatus, mix, 'gifos_mix', { setItem: (k, v) => { store[k] = v; } });
  api.setStepped(true);
  check('stepping down clears the song flag', api.endSongOnStepDown() === true && myStatus.sing === 0);
  check('a second step-down is a no-op', api.endSongOnStepDown() === false);
  myStatus.sing = 0;
  api.setPrev({ stage: 0.4, row: 1, stadium: 0.8 });
  api.rememberMix('row');
  const saved = JSON.parse(store.gifos_mix);
  check('a fader moved during a song stores that bus on the user mix, not the preset',
    saved.row === 0.7 && saved.stage === 0.4 && saved.stadium === 0.8, saved);
  check('song end writes the restored mix', /singPrevMix = null; rememberMix\(null\)/.test(html));
  const nameSrc = sliceFrom('    const singLeaderName = () => {', '    // Apply the tiers:');
  check('singLeaderName is where the lift expects it', /rosterNames/.test(nameSrc) && /e\.nm/.test(nameSrc));
  function leader(env) {
    return new Function('stageIds', 'singOf', 'myId', 'myName', 'peers', 'rosterNames', 'digStageEntry',
      nameSrc + '\nreturn singLeaderName;')(env.stageIds, env.singOf, 'me', () => 'Me', env.peers, env.rosterNames, env.digStageEntry)();
  }
  check('a leader outside my peer list uses rosterNames',
    leader({ stageIds: () => ['far'], singOf: () => true, peers: new Map(), rosterNames: { far: 'Ada' }, digStageEntry: () => null }) === 'Ada');
  check('and the digest name when the roster has none',
    leader({ stageIds: () => ['far'], singOf: () => true, peers: new Map(), rosterNames: {}, digStageEntry: () => ({ nm: 'Grace' }) }) === 'Grace');
  check('a second leader is told who is leading', /roomSingOn\(\)\) \{ setStatus\(singLeaderName\(\)/.test(html));
  const timing = sliceFn('paintTiming');
  check('the Song pill is aria-disabled while someone else leads', /aria-disabled/.test(timing) && /is leading/.test(timing));
}

// ---- companion play leaves the blocked set; one status line (89, 95, 83) ----
{
  const rel = sliceFn('releaseAudio');
  check('releaseAudio is where the lift expects it', !!rel);
  const blockedAudio = new Set();
  const releaseAudio = new Function('blockedAudio', rel + '\nreturn releaseAudio;')(blockedAudio);
  const aud = { srcObject: { id: 's' }, pause() { this.paused = true; } };
  blockedAudio.add(aud);
  const el = { _aud: aud };
  releaseAudio(el);
  check('releaseAudio drops the companion stream and the blocked entry', el._aud === null && aud.srcObject === null && blockedAudio.size === 0);

  const bsrc = sliceFn('busVolume');
  check('busVolume is where the lift expects it', !!bsrc);
  const blocked = new Set();
  let plays = 0;
  class AudioEl {
    constructor() { this.volume = 1; this.muted = false; this.srcObject = null; }
    play() { plays++; return plays === 1 ? Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' })) : Promise.resolve(); }
  }
  const api = new Function('Audio', 'audioBlocked', bsrc + '\nlet cleared = []; function audioUnblocked(el) { cleared.push(el); }\nreturn { busVolume, cleared: () => cleared };')(
    AudioEl, (el) => blocked.add(el));
  const video = { srcObject: { id: 'a' }, muted: false };
  api.busVolume(video, 1);
  await0(async () => {
    await Promise.resolve();
    await Promise.resolve();
    check('a refused play records the companion', blocked.has(video._aud), blocked.size);
    video.srcObject = { id: 'b' };
    api.busVolume(video, 1);
    await Promise.resolve();
    await Promise.resolve();
    check('a later play that resolves leaves the blocked set', api.cleared().indexOf(video._aud) >= 0, api.cleared().length);
  });

}

function await0(fn) { global.__pending = (global.__pending || []).concat(fn()); }

// Re-do finding 95 with the lets included, not a patched body.
{
  const ab = sliceFrom('    let audioKickArmed = false, audioNoteQueued = false;', '    function kickPausedAudio()');
  const notes = [];
  const fn = new Function('blockedAudio', 'document', 'setStatus', 'setTimeout', 'queueMicrotask',
    ab + '\nreturn audioBlocked;')(
    new Set(),
    { addEventListener() {}, removeEventListener() {} },
    (s) => notes.push(s),
    () => 0,
    queueMicrotask);
  // audioRetry is inside the slice (it sits between the lets and audioBlocked).
  for (let i = 0; i < 6; i++) fn({ srcObject: { id: i } }, { name: 'NotAllowedError' });
  await0(async () => {
    await Promise.resolve();
    check('six refusals in one turn post one status line', notes.length === 1, notes);
    check('the line counts the voices', notes[0] && notes[0].indexOf('6 voices') >= 0, notes[0]);
  });
}

// ---- share sheet, copy, buses, screen (90, 118, 92, 84, 158) ----
{
  const focus = sliceFn('shareSheetFocusId');
  const shareSheetFocusId = new Function(focus + '\nreturn shareSheetFocusId;')();
  check('an allowed share focuses the go button', shareSheetFocusId(false) === 'share-go');
  check('a blocked share focuses cancel', shareSheetFocusId(true) === 'share-cancel');
  const wire = sliceFrom('    (function wireShareSheet() {', '    // ---- audio: three buses');
  check('the share sheet closes on Escape and on a backdrop click',
    /e\.key !== 'Escape'/.test(wire) && /e\.target === modal\) closeShareSheet/.test(wire) && /back\.focus/.test(html));
  const step = html.slice(html.indexOf('stageBtn.onclick'), html.indexOf('function startScreenShare'));
  check('stepping down while sharing stops the share before leaving the stage',
    step.indexOf("stopScreenShare('you stepped down')") >= 0 && step.indexOf("stopScreenShare('you stepped down')") < step.indexOf('setStage(false)'));
  const copyFn = sliceFn('armCopiedLabel');
  const armCopiedLabel = new Function(copyFn + '\nreturn armCopiedLabel;')();
  const btn = { textContent: 'Copy' };
  let delay = 0;
  armCopiedLabel(btn, (fn, ms) => { delay = ms; fn(); });
  check('the Copy label resets, and Copy does not call the OS share sheet',
    btn.textContent === 'Copy' && delay === 2000 && /id="inv-share"/.test(html));
  const handler = html.slice(html.indexOf("if (copyBtn) copyBtn.onclick"), html.indexOf("const done = document.getElementById('inv-done')"));
  check('the Copy handler does not call navigator.share', handler.indexOf('navigator.share') < 0, handler.slice(0, 180));
  check('Share is its own button', /shareInviteBtn\.onclick/.test(html) && /navigator\.share\(inviteSharePayload/.test(html));
  const buses = sliceFn('applyBuses');
  check('applyBuses restarts paused companions and writes the stadium fader only when it changes',
    /kickPausedAudio\(\)/.test(buses) && /dataset\.on !== stadMark/.test(buses));
  const grid = sliceFrom('      reactSing(); applyGrid();', '}, GRID.APPLY_EVERY);');
  check('the grid tick does not also run applyBuses', grid.indexOf('applyBuses()') < 0, grid.slice(0, 200));
  check('the separate 3s pause sweep is gone', html.indexOf('the pause sweep') < 0);
  check('one shared screen is chosen even beside other faces', /const stageScreenSid = \(\) =>/.test(html));
  check('stageDirect still refuses the self seat', /sid === myId \|\| !sharingScreen\(sid\)\) return null/.test(html));
  check('other faces are painted on the direct screen', /const paintStageFaces = \(screenSid\) =>/.test(html) && /className = 'stageface'/.test(html));
  const sidSrc = sliceFrom('      const stageScreenSid = () => {', '      const myScreenBeside');
  const stageScreenSid = new Function('stagers', 'sharingScreen', sidSrc + '\nreturn stageScreenSid;')(
    ['ada', 'ben'], (id) => id === 'ada');
  check('exactly one sharer is the screen to feature', stageScreenSid() === 'ada');
  const none = new Function('stagers', 'sharingScreen', sidSrc + '\nreturn stageScreenSid;')(
    ['ada', 'ben'], (id) => id === 'ada' || id === 'ben');
  check('two sharers stay on the strip', none() === null);
}

Promise.all(global.__pending || []).then(() => {
  console.log(fail ? ('\n' + fail + ' FAILED') : ('\nALL PASS ' + pass));
  process.exit(fail ? 1 : 0);
});
