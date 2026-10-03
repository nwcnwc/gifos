// meet-heartbeat.js — what a seat does with a heartbeat it has ALREADY seen,
// lifted straight out of site/run.html and run in Node.
//
// The heartbeat is the one message every seat handles 25 times every 4 s for
// the life of the meeting, so anything it re-does per copy is the per-seat
// cost of the room. Three laws:
//
//   1. ONE PULSE, ONE RE-DERIVATION. A section mate's beat reaches me twice
//      over the same link (the pair's DataChannel copy and the section-gossip
//      copy). takeStatus answers null for the second copy of a pulse it holds
//      and the status handler re-derives nothing on it.
//   2. ONE VERIFY PER SIGNED TABLE. The admin's signed mod table rides every
//      carrier's beat unchanged; takeMod verifies a given signature once and
//      re-credits only the signer's presence after that.
//   3. THE TABLE HOLDS THE ROOM, NOT ITS HISTORY. A confirmed departure
//      (confirmGone) deletes the target's orders; mergeMod refuses to dig a
//      buried target back up from a carrier's older copy. The room-wide '*'
//      orders are never a target.
//
// Born 2026-10-03 from the status-plane review: the table had no delete site
// at all, so a moderated room's heartbeat grew with every person ever
// moderated, and each copy cost an Ed25519 verify plus an O(M) merge.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---- 1. takeStatus: the same pulse twice ----
{
  const start = html.indexOf('    function takeStatus(from, st) {');
  const end = html.indexOf('    // One global, ordered hand-raise queue');
  check('takeStatus is where the lift expects it', start > 0 && end > start);
  const statusOf = new Map();
  // takeStatus bounds the password epoch with pwEpInt + PW_EP_MAX (defined
  // later in run.html, see test/unit/meet-pw-epoch.js); lift the rule with it.
  const ruleStart = html.indexOf('    function pwEpInt(');
  const ruleEnd = ruleStart > 0 ? html.indexOf('\n', html.indexOf('const PW_EP_MAX', ruleStart)) : -1;
  check('the epoch rule (pwEpInt + PW_EP_MAX) is where the lift expects it', ruleStart > 0 && ruleEnd > ruleStart);
  const rule = ruleStart > 0 && ruleEnd > ruleStart ? html.slice(ruleStart, ruleEnd) + '\n' : '';
  const takeStatus = new Function('meshGone', 'TOMB_GRACE', 'statusOf', 'gossipAgeMs', 'pwEpoch', 'storePwEpoch',
    rule + html.slice(start, end) + '\n return takeStatus;')(new Map(), 1500, statusOf, 0, 0, () => {});
  const at = Date.now();
  const pulse = () => ({ muted: true, camOff: false, blur: 1, hand: null, at });
  check('the first copy of a pulse is taken', takeStatus('p1', pulse()) === true && statusOf.size === 1);
  const second = takeStatus('p1', pulse());
  check('the second copy of the SAME pulse answers null (held, nothing new)', second === null, 'got ' + JSON.stringify(second));
  check('…and the held entry is the first copy', statusOf.get('p1') && statusOf.get('p1').blur === 1 && typeof statusOf.get('p1').rx === 'number');
  check('a different status with the same stamp is still taken', takeStatus('p1', { muted: false, camOff: false, blur: 0, at }) === true && statusOf.get('p1').muted === false);
  check('an older pulse still loses', takeStatus('p1', { muted: true, camOff: true, blur: 2, at: at - 5 }) === false);
  const rxBefore = statusOf.get('p1').rx;
  const later = Date.now() + 50;
  const dupRx = new Function('meshGone', 'TOMB_GRACE', 'statusOf', 'gossipAgeMs', 'pwEpoch', 'storePwEpoch', 'Date',
    rule + html.slice(start, end) + '\n return takeStatus;')(new Map(), 1500, statusOf, 0, 0, () => {}, { now: () => later });
  check('a duplicate heard later keeps the LATER receipt stamp (proof of life moves forward)', dupRx('p1', { muted: false, camOff: false, blur: 0, at }) === null && statusOf.get('p1').rx === later && later > rxBefore);
  check('the held status carries no extra enumerable field (JSON shape unchanged)', Object.keys(statusOf.get('p1')).sort().join(',') === 'at,blur,camOff,muted,rx', Object.keys(statusOf.get('p1')).join(','));
}
// …and the handler re-derives nothing on a duplicate
{
  const h = html.slice(html.indexOf("} else if (msg.kind === 'status') {"), html.indexOf("} else if (msg.kind === 'mod') {"));
  check('the status handler keeps takeStatus\'s answer', /const took = takeStatus\(from, msg\.s \|\| \{\}\);/.test(h));
  // The handler asks for ONE coalesced room pass (scheduleRoomReact — tiles,
  // outbound, share height, shared app) only when the pulse was new; the pass
  // itself re-derives the three things the old inline cascade did.
  check('…and schedules the coalesced room pass only when the pulse was new to me (one call site, nothing re-derived inline)',
    /if \(took !== null\) scheduleRoomReact\(\);/.test(h) && (h.match(/scheduleRoomReact\(\)/g) || []).length === 1
    && !/reactRoomState\(\)|paintShare\(\)|reconcileApp\(\)/.test(h));
  const ps = html.indexOf('    function roomReactPass() {'), pe = html.indexOf('\n    }\n', ps);
  const pass = ps > 0 && pe > ps ? html.slice(ps, pe) : '';
  check('…and the pass re-derives tiles, share height and the shared app', pass.indexOf('reactRoomState();') > 0 && pass.indexOf('paintShare();') > 0 && pass.indexOf('reconcileApp();') > 0);
}

// ---- 2. takeMod: one verify per signed table ----
{
  const start = html.indexOf('    const modVer = new Map();');
  const end = html.indexOf('    // The RAW device id never leaves this browser');
  check('takeMod and its verify memo are where the lift expects them', start > 0 && end > start);
  let verifies = 0, merges = 0;
  const admSeen = new Map();
  const tableA = { g1: { mute: { on: true, by: 'A', byId: 'adm', at: 1 } } };
  let now = Date.now();
  const admVerify = async (w) => { verifies++; return { act: 'mod', by: 'adm', ts: JSON.parse(w.sp).ts, mod: w.mod }; };
  const takeMod = start > 0 ? new Function('hasAdminRoom', 'mergeMod', 'admVerify', 'admins', 'notTomb', 'admSeen', 'modWSeen', 'modWSeenTs', 'adminsNow', 'Date',
    html.slice(start, end) + '\n return takeMod;')(() => true, () => { merges++; }, admVerify, ['adm'], () => true, admSeen, null, 0, () => ['adm'], { now: () => now }) : null;
  (async () => {
    if (!takeMod) { part3(); return; }
    const w = { pub: 'P', sig: 'S1', sp: '{"act":"mod","ts":' + now + '}', mod: tableA };
    for (let i = 0; i < 5; i++) { admSeen.clear(); takeMod('carrier' + i, { kind: 'status', modw: w }); await tick(); check('beat ' + (i + 1) + ' credits the signer\'s presence', admSeen.has('adm')); }
    check('five beats carrying one signed table cost ONE verify', verifies === 1, verifies + ' verifies');
    check('…and ONE merge', merges === 1, merges + ' merges');
    const w2 = { pub: 'P', sig: 'S2', sp: '{"act":"mod","v":2,"ts":' + now + '}', mod: tableA };
    takeMod('carrier', { kind: 'status', modw: w2 }); await tick();
    check('a new signature is verified and merged again', verifies === 2 && merges === 2, verifies + '/' + merges);
    const forged = { pub: 'P', sig: 'S2', sp: '{"act":"mod","v":3,"ts":' + now + '}', mod: tableA };
    takeMod('carrier', { kind: 'status', modw: forged }); await tick();
    check('a memo hit needs the SAME statement under the same signature (a swapped payload is verified, not trusted)', verifies === 3, verifies + ' verifies');
    now += 400000; // six and a half minutes later the same proven statement is still carried by a sleepy phone
    admSeen.clear(); takeMod('carrier', { kind: 'status', modw: w2 }); await tick();
    check('a memo hit outside the 5-minute window credits no presence (and costs no verify)', !admSeen.has('adm') && verifies === 3, verifies + ' verifies');
    part3();
  })();
}

// ---- 3. the table holds the room, not its history ----
function part3() {
  const cg = html.slice(html.indexOf('    function confirmGone(pid, why) {'), html.indexOf('    // A tombstoned peer is EXCLUDED from the room view'));
  check('confirmGone deletes the departed target\'s orders', /delete modTable\[pid\]/.test(cg));
  const start = html.indexOf('    function mergeMod(incoming) {');
  const end = html.indexOf('    function setMod(target, field, on) {');
  check('mergeMod is where the lift expects it', start > 0 && end > start);
  const modTable = {}, meshGone = new Map();
  const noop = () => {};
  const mergeMod = new Function('modTable', 'meshGone', 'enforceForcedCam', 'refreshAllTiles', 'refreshOutbound', 'paintControls', 'reactHandCall', 'paintChatGate', 'paintStage',
    html.slice(start, end) + '\n return mergeMod;')(modTable, meshGone, noop, noop, noop, noop, noop, noop, noop);
  const order = (at) => ({ on: true, by: 'A', byId: 'adm', at });
  mergeMod({ live: { mute: order(1) }, gone: { blur: order(1) }, '*': { chat: order(1) } });
  check('live targets and the room-wide \'*\' merge', modTable.live && modTable.live.mute.on && modTable['*'] && modTable['*'].chat.on);
  delete modTable.gone;            // what confirmGone does
  meshGone.set('gone', Date.now()); // …and the tombstone it leaves
  mergeMod({ live: { mute: order(2) }, gone: { blur: order(2) }, '*': { chat: order(2) } });
  check('a carrier\'s copy does not dig a buried target back up', !modTable.gone, JSON.stringify(modTable.gone));
  check('…while the same copy still updates the living and the room', modTable.live.mute.at === 2 && modTable['*'].chat.at === 2);
  meshGone.delete('gone');
  mergeMod({ gone: { blur: order(3) } });
  check('once the tombstone lifts the target is an ordinary target again', modTable.gone && modTable.gone.blur.at === 3);

  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
