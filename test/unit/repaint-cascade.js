// repaint-cascade.js — GOSSIP REPAINTS ARE COALESCED, AND A PASS IS CHEAP.
//
// Every status frame a seat hears (one per section-mate per heartbeat, twice
// when the mate is also a DataChannel pair, plus every offer/answer) used to
// run reactRoomState() on the spot: every tile repainted, every tile asking
// stageIds() and allConsent() for itself (a roster walk each), layout() once
// PER TILE, the chips' innerHTML rewritten whether or not it changed, and
// adapt() reading every sender's parameters — for state that changes on a
// handful of frames. In a full section that is ~C² passes per beat on a phone.
//
// The rule now (site/run.html, scheduleRoomReact):
//   * gossip intake schedules ONE pass per REACT_COALESCE_MS window and the
//     window is well inside a heartbeat; user actions still react on the spot
//   * inside a pass stageIds()/allConsent() are derived once (passMemo)
//   * refreshAllTiles lays the grid out ONCE after the tiles, not per tile
//   * a tile's chips are written only when their HTML changed — the
//     keyboard-focusable .stopshare chip keeps focus across repaints
//   * the blur chip in an admin room names what clears it: the host
// Leg 1 runs the real scheduler (extracted from run.html) under fake timers;
// legs 2-6 pin the call sites, because a future "just call it here" at an
// intake site is exactly how the cascade comes back.
// Browser-side: e2e-status-plane.js (quiet-room counters), e2e-screen-share.js
// (focus held), e2e-meet-mod.js (host chip text).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const fn = (name) => { const m = src.match(new RegExp('\\n    function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n')); return m ? m[0] : null; };
const decl = (re) => { const m = src.match(re); return m ? m[0] : null; };

// ---- 1. the scheduler: 25 frames in one window → ONE pass -------------------
const schedSrc = fn('scheduleRoomReact'), passSrc = fn('roomReactPass');
const msDecl = decl(/const REACT_COALESCE_MS = \d+;/), pendDecl = decl(/let reactPending = false;/);
check('run.html defines scheduleRoomReact, roomReactPass, REACT_COALESCE_MS and reactPending', !!(schedSrc && passSrc && msDecl && pendDecl));
if (schedSrc && passSrc && msDecl && pendDecl) {
  const timers = [];
  const ctx = {
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    reactStats: { passes: 0, scheduled: 0 },
    passes: 0,
  };
  ctx.reactRoomState = function () { ctx.passes++; ctx.reactPending = false; }; // the real one clears the queue too
  vm.createContext(ctx);
  // var, not const/let: a vm script's lexical declarations are invisible to the
  // context object, and the test must read the window and clear the flag.
  vm.runInContext(msDecl.replace('const ', 'var ') + '\n' + pendDecl.replace('let ', 'var ') + '\n' + schedSrc + '\n' + passSrc, ctx);
  const ms = ctx.REACT_COALESCE_MS;
  check('the coalescing window is bounded well inside a 4 s heartbeat (' + ms + ' ms)', ms >= 50 && ms <= 1000, { ms });
  for (let i = 0; i < 25; i++) vm.runInContext('scheduleRoomReact()', ctx);
  check('25 status frames in one window arm ONE timer and run NO pass yet', timers.length === 1 && ctx.passes === 0, { timers: timers.length, passes: ctx.passes });
  check('…armed for the window, not sooner', timers[0] && timers[0].ms === ms);
  timers[0].f();
  check('the window fires ONE pass for all 25', ctx.passes === 1 && ctx.reactPending === false);
  vm.runInContext('scheduleRoomReact()', ctx);
  check('the next frame after a pass arms a fresh window (a steady beat is one pass per window)', timers.length === 2 && ctx.passes === 1);
  // A user action reacts on the spot and answers the queued pass: the pending
  // timer then does nothing, so a click never costs a second full repaint.
  ctx.reactRoomState();
  timers[1].f();
  check('a synchronous reactRoomState() answers the queued pass; the stale timer is a no-op', ctx.passes === 2);
}

// ---- 2. the intake sites schedule; they do not react on the spot ------------
const statusSite = (src.match(/\} else if \(msg\.kind === 'status'\) \{[\s\S]*?\} else if \(msg\.kind === 'mod'\) \{/) || [''])[0];
check('the status intake site exists', statusSite.length > 0);
check('the status intake calls scheduleRoomReact(), not reactRoomState()/paintShare()/reconcileApp() per frame',
  /scheduleRoomReact\(\)/.test(statusSite) && !/\breactRoomState\(\)/.test(statusSite) && !/\bpaintShare\(\)/.test(statusSite) && !/\breconcileApp\(\)/.test(statusSite));
const learnSt = (src.match(/if \(msg\.st\) \{ takeStatus\(from, msg\.st\);[^\n]*/) || [''])[0];
check('learn() (every offer/answer) schedules, never reacts on the spot', /scheduleRoomReact\(\)/.test(learnSt) && !/\breactRoomState\(\)/.test(learnSt), learnSt.slice(0, 100));
check('the coalesced pass still carries the share height and the shared app (paintShare, reconcileApp)', /paintShare\(\)/.test(passSrc || '') && /reconcileApp\(\)/.test(passSrc || ''));

// ---- 3. one derivation per pass ---------------------------------------------
check('stageIds() is memoised across a pass (passMemo)', /const stageIds = \(\) => memoPass\('stg', stageIdsNow\);/.test(src));
check('allConsent() is memoised across a pass (passMemo)', /function allConsent\(\) \{ return memoPass\('cons', allConsentNow\); \}/.test(src));
const rat = fn('refreshAllTiles') || '';
check('refreshAllTiles opens the memo and closes it in a finally', /passMemo = \{\};/.test(rat) && /finally \{ passMemo = null; \}/.test(rat));

// ---- 4. one layout per pass, not per tile ------------------------------------
check('refreshAllTiles paints every tile in-pass and lays out ONCE', (rat.match(/updateTile\([^)]*, true\)/g) || []).length === 2 && (rat.match(/\blayout\(\)/g) || []).length === 1, rat.slice(0, 200));
const ut = fn('updateTile') || '';
check('updateTile lays out after itself only when called alone', /if \(!inPass\) layout\(\);/.test(ut));

// ---- 5. chips are written only on change --------------------------------------
check('chips.innerHTML has exactly one writer, guarded by a diff', (src.match(/chips\.innerHTML = /g) || []).length === 1 && /if \(t\.chipsHtml !== chipHtml\) \{ t\.chipsHtml = chipHtml; t\.chips\.innerHTML = chipHtml;/.test(ut));

// ---- 6. the blur chip names what clears the tile -----------------------------
check('an admin room\'s consenting-but-blurred chip waits for the HOST, a plain room\'s for everyone',
  /hasAdminRoom\(\) \? 'blurred until the host is here' : 'blurred until everyone is ready \(camera on, No blur\)'/.test(ut));

console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
process.exit(failures ? 1 : 0);
