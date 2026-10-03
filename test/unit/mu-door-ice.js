// mu-door-ice.js — guards for the door, ICE, filmstrip, vote-bar and
// heartbeat fixes in site/run.html. Each check lifts the real function
// (or the real source order) so a rewrite that drops the guard fails here.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + detail : '')); }
}
const between = (a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b, i + a.length);
  return i > 0 && j > i ? html.slice(i, j) : '';
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. filmstrip: park the grid, do not thumb the feed already shown big ----
{
  check('full screen hides the grid videos', html.includes('body.fsopen #grid video { visibility: hidden; }'));
  check('openFsView marks the body and closeFsView clears it and restores the grid',
    /function openFsView[\s\S]*body\.classList\.add\('fsopen'\)/.test(html)
    && /function closeFsView[\s\S]*body\.classList\.remove\('fsopen'\)[\s\S]*fsUnparkGrid\(/.test(html));
  const refresh = between('    function fsRefresh() {', '    function fsBlurClass');
  check('fsRefresh snapshots the stream, then parks, and skips the big feed as a thumb',
    refresh.indexOf('s.stream') < refresh.indexOf('fsParkGrid()')
    && refresh.includes("src.filter((s) => !main || s.key !== main.key)")
    && refresh.includes('for (const s of thumbs)')
    && refresh.includes('tv.srcObject = s.stream'));
  const src = between('    const fsParked = new Map();', '    function fsPickAuto');
  check('fsParkGrid is liftable', src.indexOf('function fsParkGrid') > 0 && src.indexOf('function fsUnparkGrid') > 0);
  const v = {
    srcObject: { id: 'feed' }, paused: false, played: false,
    pause() { this.paused = true; },
    play() { this.played = true; return { catch() {} }; },
  };
  const grid = { querySelectorAll() { return [v]; } };
  const api = new Function('grid', src + '\nreturn { fsParkGrid, fsUnparkGrid, fsParked, fsHeld };')(grid);
  api.fsParkGrid();
  check('parking detaches and pauses the grid video and remembers the stream',
    v.srcObject === null && v.paused === true && api.fsHeld(v) === true && api.fsParked.get(v).id === 'feed',
    JSON.stringify({ src: v.srcObject, paused: v.paused, held: api.fsHeld(v) }));
  api.fsParkGrid();
  check('a second park does not forget the stream', api.fsParked.get(v) && api.fsParked.get(v).id === 'feed');
  api.fsUnparkGrid();
  check('unpark restores the stream and plays', v.srcObject && v.srcObject.id === 'feed' && v.played === true && api.fsParked.size === 0);
}

// ---- 2. a stale away pulse does not shrink the vote bar ----
{
  const hold = between('    const stHold = (pid) => {', '    function mergeMod');
  const vote = between('    function stageVoteTallies() {', '    const devFor = (id) =>');
  check('stageVoteTallies and stHold are where the lift expects them', hold.includes('return !!st.away') && vote.includes('if (!stHold(pid)) continue'));
  check('the away branch is after the freshness test',
    vote.indexOf('if (!stHold(pid)) continue') < vote.indexOf('if (st.away)'));
  const devOf = { old: 'dOld', a: 'dA', b: 'dB', c: 'dC', d: 'dD' };
  const statusOf = new Map();
  const peers = new Map();
  const myStatus = { away: false, vup: [], vdn: [] };
  const api = new Function('roomPastSection', 'myStatus', 'myDevHash', 'devOf', 'statusOf', 'participantCount', 'peers', 'HOLDOVER_MS', 'stSeen', 'starveDebtSince',
    'let clock = 1000000000000;\n' +
    'const Date = { now: () => clock };\n' +
    'let stgTallyCache = { at: 0 };\n' +
    hold + '\n' + vote + '\n' +
    'return { stageVoteTallies, setClock: (t) => { clock = t; stgTallyCache.at = 0; } };')(
    () => false, myStatus, 'me', devOf, statusOf, () => 0, peers, 60000,
    (st) => (st ? (st.rx || st.at || 0) : 0), () => 0);
  const T0 = 1000000000000;
  statusOf.set('old', { away: true, rx: T0 - 300000, at: 1 });
  for (const id of ['a', 'b', 'c', 'd']) statusOf.set(id, { away: false, rx: T0, at: 1, vup: [], vdn: [] });
  const stale = api.stageVoteTallies();
  check('a 5 minute old away status stays in the bar (need 4, not 3)', stale.need === 4, 'need ' + stale.need);
  api.setClock(T0 + 5000);
  statusOf.set('old', { away: true, rx: T0 + 4000, at: 2 });
  const fresh = api.stageVoteTallies();
  check('a fresh away status still sits out (need 3)', fresh.need === 3, 'need ' + fresh.need);
}

// ---- 3. one sponsored copy, and a stale answer is not applied ----
{
  const fwd = between('    function fwdDedup(id) {', '    function fwdNextCoord');
  check('fwdDedup is liftable', fwd.startsWith('    function fwdDedup'));
  const fwdDedup = new Function('let fwdSeen = new Map();\n' + fwd + '\nreturn fwdDedup;')();
  check('the first envelope id is new and the second is a duplicate', fwdDedup('e1') === true && fwdDedup('e1') === false);
  check('an envelope with no id is not dropped (legacy single hop)', fwdDedup('') === true && fwdDedup(null) === true);
  const term = between("} else if (m.k === 'fsig') {", "} else if (m.k === 'ck') {");
  check('the terminal hop dedups before onSignal',
    term.indexOf('fwdDedup(m.id)') > 0 && term.indexOf('fwdDedup(m.id)') < term.indexOf('onSignal('));
  const ans = between("} else if (msg.kind === 'answer') {", "} else if (msg.kind === 'ice') {");
  check('an answer is applied only in have-local-offer',
    ans.includes("p.pc.signalingState !== 'have-local-offer'") && ans.includes('rxStats.answerStale'));
}

// ---- 4. ICE: first host now, the rest as one frame, early candidates wait ----
{
  const src = between('    const iceBatch = new Map();', '    function onSignal(from, msg, adm)');
  check('the ICE helpers are contiguous before onSignal', src.includes('function noteIce') && src.includes('function drainPreIce') && src.includes('function ckReply'));
  const sent = [];
  const api = new Function('sendSig', src + '\nreturn { noteIce, parkPreIce, drainPreIce, iceCandsOf, preIce };')(
    (pid, msg) => { sent.push(JSON.parse(JSON.stringify(msg))); });
  const host = { candidate: 'candidate:1 1 udp 2122252543 10.0.0.1 50000 typ host generation 0', sdpMid: '0', sdpMLineIndex: 0 };
  const sr1 = { candidate: 'candidate:2 1 udp 1686052607 1.2.3.4 50000 typ srflx', sdpMid: '0', sdpMLineIndex: 0 };
  const sr2 = { candidate: 'candidate:3 1 udp 1686052607 1.2.3.4 50001 typ srflx', sdpMid: '0', sdpMLineIndex: 0 };
  api.noteIce('p', host);
  check('the first host candidate is its own frame, immediately', sent.length === 1 && sent[0].kind === 'ice' && /typ host/.test(sent[0].candidate.candidate));
  api.noteIce('p', sr1);
  api.noteIce('p', sr2);
  check('relay candidates wait for the batch', sent.length === 1);
  const iceRest = (async () => {
    await delay(120);
    check('two relay candidates leave as one list', sent.length === 2 && Array.isArray(sent[1].candidates) && sent[1].candidates.length === 2, JSON.stringify(sent[1]));
    api.noteIce('p', null);
    await delay(120);
    check('end of candidates is its own mark', sent.length === 3 && sent[2].end === true && !sent[2].candidates);
    const many = [];
    for (let i = 0; i < 20; i++) many.push({ candidate: 'c' + i });
    api.parkPreIce('late', many);
    check('preIce keeps at most 16 candidates', api.preIce.get('late').list.length === 16);
    const peer = { pendingIce: [] };
    api.drainPreIce('late', peer);
    check('the offer drains those candidates and forgets the bucket', peer.pendingIce.length === 16 && !api.preIce.has('late'));
    api.parkPreIce('stale', [{ candidate: 'z' }]);
    api.preIce.get('stale').at = Date.now() - 20000;
    const peer2 = { pendingIce: [] };
    api.drainPreIce('stale', peer2);
    check('a preIce bucket older than 15s is dropped', peer2.pendingIce.length === 0 && !api.preIce.has('stale'));
    check('a single candidate and a list are both accepted',
      api.iceCandsOf({ candidate: host }).length === 1 && api.iceCandsOf({ candidates: [sr1, null, sr2] }).length === 2 && api.iceCandsOf({ end: true }).length === 0);
    const ice = between("} else if (msg.kind === 'ice') {", "} else if (msg.kind === 'status') {");
    check('a candidate with no peer record is parked, not dropped', ice.includes('parkPreIce(from, cands)'));
    check('the offer drains preIce after a rebuild', /newPcFor\(p\);\s*drainPreIce\(from, p\)/.test(html));
  })();
  global.__iceRest = iceRest;
}

// ---- 5. negotiation failures are counted; a failed glare yield dials ----
{
  const i = html.indexOf('    function noteNegFail(kind, from, e) {');
  const fnSrc = html.slice(i, html.indexOf('\n', html.indexOf('}', i)) + 1);
  const rxStats = { negFail: 0 };
  const logs = [];
  const noteNegFail = new Function('rxStats', 'clog', fnSrc + '\nreturn noteNegFail;')(rxStats, (s) => logs.push(s));
  noteNegFail('offer', 'peer1234', new Error('InvalidStateError'));
  check('noteNegFail counts and logs the kind', rxStats.negFail === 1 && logs[0].indexOf('neg-fail offer peer12') === 0, logs[0]);
  check('the offer, accept and answer chains report negFail',
    html.includes("noteNegFail('offer'") && html.includes("noteNegFail('accept'") && html.includes("noteNegFail('answer'"));
  const glare = between('          .catch((e) => {', '      }, GLARE_YIELD_MS);');
  check('a failed glare yield dials from this side, not only the higher id',
    glare.includes('sendOffer(from, false)') && !/if\s*\(\s*iInitiate/.test(glare));
  check('the yield hold stays 4000ms', /const GLARE_YIELD_MS = 4000;/.test(html));
}

// ---- 6. a rebuilt pc forgets the jitter verdict; the clock stamps inside txm ----
{
  const npc = between('    function newPcFor(p) {', '    const GLARE_YIELD_MS');
  check('newPcFor deletes the jitter memo for that peer', npc.includes('gridApplied.delete(p.id)'));
  const ck = between("} else if (m.k === 'ck') {", "} else if (m.k === 'ck2') {");
  check('ck2 is built inside the txm job', ck.indexOf('txm(') > 0 && ck.indexOf('txm(') < ck.indexOf('ckReply(t0)') && !ck.includes('dcSend(p'));
  const ckSrc = between('    function ckReply(t0)', '\n    function onSignal');
  const ckReply = new Function(ckSrc + '\nreturn ckReply;')();
  const msg = ckReply(10);
  check('ckReply carries t0 and a numeric t1', msg.k === 'ck2' && msg.t0 === 10 && typeof msg.t1 === 'number');
}

// ---- 7. sharing does not broadcast twice when setStage already did ----
{
  const start = between('    function startScreenShare() {', '    function stopScreenShare');
  const stop = between('    function stopScreenShare(why) {', '    if (shareBtn)');
  check('startScreenShare broadcasts only when setStage did not',
    (start.match(/broadcastStatus\(\)/g) || []).length === 1 && start.includes('if (!screenSteppedUp) broadcastStatus()'));
  check('stopScreenShare broadcasts only when it did not step down',
    (stop.match(/broadcastStatus\(\)/g) || []).length === 1 && stop.includes('if (!steppedDown) broadcastStatus()'));
  check('both still refresh tiles after refreshOutbound',
    start.indexOf('refreshOutbound()') < start.indexOf('refreshAllTiles()')
    && stop.indexOf('refreshOutbound()') < stop.indexOf('refreshAllTiles()'));
}

function finish() {
  console.log(pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
if (global.__iceRest) global.__iceRest.then(finish, (e) => { console.log('FAIL ice rest — ' + e.stack); process.exit(1); });
else finish();
