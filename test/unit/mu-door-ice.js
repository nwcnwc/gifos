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

// ---- 1. filmstrip: hide the grid paint, never detach its streams ----
// Other code reads the #grid videos while the filmstrip is open: busVolume
// mirrors el.srcObject into the audio companion, the row head's packer
// draws from p.video, selfStageStream reads meTile.video.srcObject, and the
// recorder reads them too. Nulling them silences row-mates and darkens a
// head's whole section, so the saving is visibility only.
{
  check('full screen hides the grid videos', html.includes('body.fsopen #grid video { visibility: hidden; }'));
  check('openFsView marks the body and closeFsView clears it',
    /function openFsView[\s\S]*body\.classList\.add\('fsopen'\)/.test(html)
    && /function closeFsView[\s\S]*body\.classList\.remove\('fsopen'\)/.test(html));
  check('no grid park/unpark for the filmstrip (no fsParkGrid, fsUnparkGrid, fsParked, fsHeld)',
    !/\bfs(ParkGrid|UnparkGrid|Parked|Held)\b/.test(html));
  const block = between("    const fsview = document.createElement('div'); fsview.id = 'fsview';", '    // ---- tiles ----');
  check('the filmstrip block is liftable', block.includes('function fsRefresh') && block.includes('function closeFsView'));
  check('the filmstrip block never walks the grid videos',
    !/grid\.querySelectorAll/.test(block), (block.match(/.*grid\.querySelectorAll.*/) || [''])[0]);
  const nulled = (block.match(/(\w+)\.srcObject\s*=\s*null/g) || []).map((m) => m.split('.')[0]);
  check('the filmstrip only nulls its own sinks (fsmain, thumbs)',
    nulled.every((n) => n === 'fsmain' || n === 'tv'), JSON.stringify(nulled));
  const refresh = between('    function fsRefresh() {', '    function fsBlurClass');
  check('fsRefresh snapshots the live stream and skips the big feed as a thumb',
    refresh.includes('s.stream = s.v ? s.v.srcObject : null')
    && refresh.includes("src.filter((s) => !main || s.key !== main.key)")
    && refresh.includes('for (const s of thumbs)')
    && refresh.includes('tv.srcObject = s.stream'));
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
  // fwdDedup records through fwdSeenNote (the bounded sweep), defined just above it.
  const fwd = between('    function fwdSeenNote(map, id, now) {', '    function fwdNextCoord');
  check('fwdDedup is liftable', fwd.startsWith('    function fwdSeenNote') && fwd.indexOf('    function fwdDedup(id) {') > 0);
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
  const oldSent = [];
  // 'p' advertised ib:1 in its offer/answer; 'old' is an older build that did not.
  const peers = new Map([['p', { iceBatchOk: true }], ['old', {}]]);
  const api = new Function('sendSig', 'peers', src + '\nreturn { noteIce, parkPreIce, drainPreIce, iceCandsOf, preIce, PRE_ICE_PEERS: typeof PRE_ICE_PEERS === "undefined" ? undefined : PRE_ICE_PEERS };')(
    (pid, msg) => { (pid === 'old' ? oldSent : sent).push(JSON.parse(JSON.stringify(msg))); }, peers);
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
    // Mixed-version room: an older build reads only msg.candidate.
    api.noteIce('old', host);
    api.noteIce('old', sr1);
    api.noteIce('old', sr2);
    api.noteIce('old', null);
    await delay(120);
    check('a peer without ib gets one candidate frame per candidate and no end frame',
      oldSent.length === 3 && oldSent.every((m) => m.kind === 'ice' && m.candidate && typeof m.candidate.candidate === 'string' && !m.candidates && !m.end),
      JSON.stringify(oldSent));
    check('the offer and both answers advertise ib:1',
      (html.match(/kind: 'offer', sdp: p\.pc\.localDescription, ib: 1,/g) || []).length === 1
      && (html.match(/kind: 'answer', sdp: p\.pc\.localDescription, ib: 1,/g) || []).length === 2);
    const offerH = between("      if (msg.kind === 'offer') {", "        const accept = () =>");
    const ansH = between("} else if (msg.kind === 'answer') {", "} else if (msg.kind === 'ice') {");
    check('an offer and an answer record the sender\'s ib',
      offerH.includes('p.iceBatchOk = msg.ib === 1') && ansH.includes('p.iceBatchOk = msg.ib === 1'));
    const npc = between('    function newPcFor(p) {', '    const GLARE_YIELD_MS');
    check('newPcFor forgets the ICE batch for the pair', /iceBatch\.delete\(p\.id\)/.test(npc));
    api.preIce.clear();
    for (let i = 0; i < 200; i++) api.parkPreIce('x' + i, [{ candidate: 'c' }]);
    check('preIce never holds more than its cap of senders', api.preIce.size <= api.PRE_ICE_PEERS && api.PRE_ICE_PEERS === 64, api.preIce.size);
    check('preIce drops the oldest sender first', !api.preIce.has('x0') && api.preIce.has('x199'));
    api.preIce.get('x199').at = Date.now() - 20000;
    api.parkPreIce('fresh', [{ candidate: 'c' }]);
    check('adding to preIce sweeps buckets older than 15s', !api.preIce.has('x199') && api.preIce.has('fresh'));
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
