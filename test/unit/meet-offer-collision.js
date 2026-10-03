// meet-offer-collision.js — A JOIN GLARE RESOLVES ON A FRESH PC, NEVER BY
// ROLLING AN OFFER BACK.
//
// Traced in e2e-video's three-phone mesh on 3 Oct 2026 (product trace lines,
// 15 joins on the gate host under load, 2 slow; 14 joins at the pre-merge base,
// 3 slow, 1 past the suite's 30 s budget): the newcomer (polite, lower id)
// dials its row-mate while the row-mate (impolite) dials it. The newcomer's
// own offer is still being applied (createOffer → setLocalDescription is
// async, and the pc reads 'stable' until it lands) when the far offer arrives,
// so onSignal saw no collision and accepted. setRemoteDescription then rolled
// the newcomer's just-applied offer back implicitly, and Chromium gathered no
// ICE candidate for the answer made after it: zero candidates left the
// newcomer, the pair sat sig=stable/ice=new, and only a 12-25 s healer (a
// starve rebuild or the initiator's ICE restart) connected it.
//
// The rule now: sendOffer marks its offer in flight (p.offering) and stays on
// the pc it started on; onSignal counts that window as a collision on a pair
// that never carried a byte; the polite side then answers on a FRESH pc
// instead of rolling back, and the impolite side's 4 s yield does the same.
// A pair that once carried data keeps the rollback path.
//
// neverCarried, armGlareYield, sendOffer and onSignal's offer branch are lifted
// verbatim out of site/run.html and run in Node against a fake
// RTCPeerConnection that models the operations chain and the measured rollback
// behaviour (an answer made after a rollback gathers no candidate).
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
const slice = (a, b) => { const i = html.indexOf(a), j = i < 0 ? -1 : html.indexOf(b, i + a.length); return i > 0 && j > i ? html.slice(i, j) : ''; };

const glareSrc = slice('    const GLARE_YIELD_MS = 4000;', '    function sendOffer(peerId, iceRestart) {');
const sendOfferSrc = slice('    function sendOffer(peerId, iceRestart) {', '    // ============================ STATUS GOSSIP');
const offerSrc = slice("      if (msg.kind === 'offer') {", "      } else if (msg.kind === 'answer') {");
check('armGlareYield, sendOffer and the offer branch are where the lift expects them', !!glareSrc && !!sendOfferSrc && !!offerSrc);
check('run.html defines neverCarried (no connect, no DataChannel or mesh receive)', /const neverCarried = \(p\) => !p\.connected && !p\.dcRxAt && !p\.meshRxAt;/.test(glareSrc));
check('sendOffer marks the offer in flight and stays on its own pc', /p\.offering = mark/.test(sendOfferSrc) && /if \(p\.pc !== pc\) return;/.test(sendOfferSrc));
check('the collision test counts an offer still minting on a never-carried pair',
  /signalingState === 'have-local-offer' \|\| \(p\.offering && neverCarried\(p\)\)/.test(offerSrc));

// ---- a fake RTCPeerConnection: an operations chain, the signaling states,
// implicit and explicit rollback, and the measured gathering rule.
let pcSeq = 0;
function FakePC() {
  this.n = ++pcSeq; this.signalingState = 'stable'; this.remoteDescription = null; this.localDescription = null;
  this.rollbacks = 0; this.gatherBroken = false; this.emitted = 0; this.answerEmitted = 0; this.closed = false; this.answered = false;
  this.onicecandidate = null; this.ops = Promise.resolve();
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
FakePC.prototype._op = function (fn, ms) { const run = this.ops.then(() => tick(ms || 1)).then(fn); this.ops = run.catch(() => {}); return run; };
FakePC.prototype.createOffer = function () { return this._op(() => ({ type: 'offer', sdp: 'offer-' + this.n }), 1); };
FakePC.prototype.createAnswer = function () { return this._op(() => { if (this.signalingState !== 'have-remote-offer') throw new Error('createAnswer in ' + this.signalingState); return { type: 'answer', sdp: 'answer-' + this.n }; }, 1); };
FakePC.prototype._gather = function (forAnswer) { setTimeout(() => { if (this.closed || this.gatherBroken || !this.onicecandidate) return; this.emitted++; if (forAnswer) this.answerEmitted++; this.onicecandidate({ candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' } }); }, 2); };
FakePC.prototype.setLocalDescription = function (d) {
  return this._op(() => {
    if (this.closed) throw new Error('closed');
    if (d.type === 'rollback') { if (this.signalingState !== 'have-local-offer') throw new Error('rollback in ' + this.signalingState); this.signalingState = 'stable'; this.localDescription = null; this.rollbacks++; this.gatherBroken = true; return; }
    if (d.type === 'offer') { if (this.signalingState !== 'stable' && this.signalingState !== 'have-local-offer') throw new Error('SLD offer in ' + this.signalingState); this.signalingState = 'have-local-offer'; this.localDescription = d; this._gather(); return; }
    if (d.type === 'answer') { if (this.signalingState !== 'have-remote-offer') throw new Error('SLD answer in ' + this.signalingState); this.signalingState = 'stable'; this.localDescription = d; this.answered = true; this._gather(true); return; }
  }, 6); // applying a description takes a while: the pc reads its OLD state meanwhile
};
FakePC.prototype.setRemoteDescription = function (d) {
  return this._op(() => {
    if (this.closed) throw new Error('closed');
    if (d.type === 'offer') {
      // implicit rollback (Chromium): an offer landing on have-local-offer
      // rolls the local one back first, and the answer that follows gathers
      // nothing (measured: zero candidates from the answering side)
      if (this.signalingState === 'have-local-offer') { this.rollbacks++; this.gatherBroken = true; this.localDescription = null; }
      else if (this.signalingState !== 'stable') throw new Error('SRD offer in ' + this.signalingState);
      this.signalingState = 'have-remote-offer'; this.remoteDescription = d; return;
    }
    if (this.signalingState !== 'have-local-offer') throw new Error('SRD answer in ' + this.signalingState);
    this.signalingState = 'stable'; this.remoteDescription = d;
  }, 2);
};
FakePC.prototype.addIceCandidate = function () { return Promise.resolve(); };
FakePC.prototype.createDataChannel = function () { return { readyState: 'connecting', label: 'gifos' }; };
FakePC.prototype.getTransceivers = function () { return []; };
FakePC.prototype.close = function () { this.closed = true; this.signalingState = 'closed'; };

// One side of a pair, built from the lifted source. sendSig records what left.
function makeSide(myId) {
  const body = [
    'const sent = []; const failures = []; const peers = new Map();',
    'const rxStats = { offer: 0, answer: 0, ice: 0, offerRejected: 0, answerNoPeer: 0, negFail: 0, answerStale: 0 };',
    'const sponsorReplyTo = new Set(); const clog = null; let leaving = false;',
    'const linkTo = () => true, meshKnows = () => true, drainPreIce = () => {}, learn = () => {}, preferHwVideo = () => {};',
    "const myName = () => 'x', myIp = '', myStatus = {}, modTable = {}, gossipModW = () => 0, myConns = () => [], mySid = () => null;",
    'const noteNegFail = (kind, from, e) => { rxStats.negFail++; failures.push(kind + ":" + (e && e.message || e)); };',
    'const sendSig = (to, msg) => { sent.push({ to, kind: msg.kind, sdp: msg.sdp && msg.sdp.sdp }); };',
    'const wireDc = (p, dc) => { p.dc = dc; };',
    'function newPcFor(p) { try { p.pc && p.pc.close(); } catch (e) {} const pc = new FakePC(); pc.onicecandidate = (ev) => { if (ev.candidate) sendSig(p.id, { kind: "ice", candidate: ev.candidate }); };',
    '  p.glareTimer = null; p.glareOffer = null; p.pc = pc; p.connected = false; p.pendingIce = []; p.dc = null; p.offering = null; }',
    'function makePeer(id) { if (peers.has(id)) return peers.get(id); const p = { id, pendingIce: [], connected: false, bornAt: Date.now(), lastHeard: Date.now() }; peers.set(id, p); newPcFor(p); return p; }',
    glareSrc,
    sendOfferSrc,
    'function onOffer(from, msg, adm) {', offerSrc, '} }',
    'return { sent, failures, peers, makePeer, sendOffer, onOffer, newPcFor, rxStats };',
  ].join('\n');
  // myId is a lifted free variable; time is scaled for the 4 s glare yield.
  return new Function('FakePC', 'myId', 'setTimeout', body)(FakePC, myId, (fn, ms) => setTimeout(fn, ms >= 1000 ? ms / 100 : ms));
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms || 120));

(async () => {
  // 1. THE RACE: the polite newcomer's own offer is still being applied when
  //    the row-mate's offer lands.
  {
    const tia = makeSide('k_14d0'); // polite (lower id)
    const p = tia.makePeer('k_ff04');
    const first = p.pc;
    tia.sendOffer('k_ff04', false);          // the newcomer dials …
    await new Promise((r) => setTimeout(r, 3)); // … createOffer done, setLocalDescription in progress
    check('the offer in flight is marked while the pc still reads stable', !!p.offering && p.pc.signalingState === 'stable', { offering: !!p.offering, st: p.pc.signalingState });
    tia.onOffer('k_ff04', { kind: 'offer', sdp: { type: 'offer', sdp: 'far-offer' }, ib: 1 });
    await settle();
    const answers = tia.sent.filter((s) => s.kind === 'answer'), offers = tia.sent.filter((s) => s.kind === 'offer');
    check('the far offer is answered', answers.length === 1, tia.sent.map((s) => s.kind));
    check('…on a FRESH pc, never by rolling an offer back (implicit or explicit)', p.pc !== first && p.pc.rollbacks === 0 && first.closed, { fresh: p.pc !== first, rollbacks: p.pc.rollbacks, oldClosed: first.closed });
    check('…so the answer gathers and sends ICE candidates', p.pc.answerEmitted > 0 && tia.sent.some((s) => s.kind === 'ice'), { answerEmitted: p.pc.answerEmitted, kinds: tia.sent.map((s) => s.kind) });
    check('the newcomer\'s own offer, minted on the closed pc, is never sent', offers.length === 0, offers);
    check('no negotiation failure on the way', tia.failures.length === 0, tia.failures);
  }
  // 2. Polite with its offer already APPLIED: same fresh-pc answer.
  {
    const tia = makeSide('k_14d0');
    const p = tia.makePeer('k_ff04');
    tia.sendOffer('k_ff04', false);
    await settle(40);
    check('a sent offer leaves the pc in have-local-offer', p.pc.signalingState === 'have-local-offer' && tia.sent.some((s) => s.kind === 'offer'));
    const first = p.pc;
    tia.onOffer('k_ff04', { kind: 'offer', sdp: { type: 'offer', sdp: 'far-offer' }, ib: 1 });
    await settle();
    check('polite with an applied offer answers on a fresh pc too, and its answer gathers', p.pc !== first && p.pc.rollbacks === 0 && p.pc.answered && p.pc.answerEmitted > 0, { fresh: p.pc !== first, rollbacks: p.pc.rollbacks, answered: p.pc.answered, answerEmitted: p.pc.answerEmitted });
  }
  // 3. Impolite with its offer still minting: the far offer is set aside, not accepted.
  {
    const sam = makeSide('k_ff04'); // impolite (higher id)
    const p = sam.makePeer('k_14d0');
    const first = p.pc;
    sam.sendOffer('k_14d0', false);
    await new Promise((r) => setTimeout(r, 3));
    sam.onOffer('k_14d0', { kind: 'offer', sdp: { type: 'offer', sdp: 'far-offer' }, ib: 1 });
    await settle(30);
    check('impolite: a far offer during my minting is set aside (glare yield armed), my offer goes out', !!p.glareTimer && sam.sent.some((s) => s.kind === 'offer') && !sam.sent.some((s) => s.kind === 'answer') && p.pc === first && first.rollbacks === 0,
      { armed: !!p.glareTimer, kinds: sam.sent.map((s) => s.kind), rollbacks: first.rollbacks });
    // the polite side answers my offer → stable; the yield then stands down
    await p.pc.setRemoteDescription({ type: 'answer', sdp: 'their-answer' }).catch(() => {});
    await settle(120);
    check('…and once my offer is answered the yield stands down (no second answer)', !sam.sent.some((s) => s.kind === 'answer') && p.pc.signalingState === 'stable', sam.sent.map((s) => s.kind));
  }
  // 4. Impolite whose offer is never answered yields after GLARE_YIELD_MS — on a fresh pc.
  {
    const sam = makeSide('k_ff04');
    const p = sam.makePeer('k_14d0');
    sam.sendOffer('k_14d0', false);
    await settle(40);
    const first = p.pc;
    sam.onOffer('k_14d0', { kind: 'offer', sdp: { type: 'offer', sdp: 'far-offer' }, ib: 1 });
    await settle(140);
    check('the impolite yield on a never-carried pair answers on a fresh pc, without rollback', p.pc !== first && p.pc.rollbacks === 0 && sam.sent.some((s) => s.kind === 'answer') && p.pc.answerEmitted > 0,
      { fresh: p.pc !== first, rollbacks: p.pc.rollbacks, kinds: sam.sent.map((s) => s.kind), answerEmitted: p.pc.answerEmitted });
  }
  // 5. A pair that once carried data keeps the rollback path (unchanged).
  {
    const tia = makeSide('k_14d0');
    const p = tia.makePeer('k_ff04');
    p.dcRxAt = Date.now() - 60000; // this pair carried data before it went down
    tia.sendOffer('k_ff04', false);
    await settle(40);
    const first = p.pc;
    tia.onOffer('k_ff04', { kind: 'offer', sdp: { type: 'offer', sdp: 'far-offer' }, ib: 1 });
    await settle();
    check('a once-carried pair still rolls back on the same pc (behaviour outside the join race is unchanged)', p.pc === first && first.rollbacks === 1 && tia.sent.some((s) => s.kind === 'answer'), { same: p.pc === first, rollbacks: first.rollbacks });
  }
  // 6. No collision: an offer on an idle pc is accepted directly.
  {
    const tia = makeSide('k_14d0');
    const p = tia.makePeer('k_ff04');
    const first = p.pc;
    tia.onOffer('k_ff04', { kind: 'offer', sdp: { type: 'offer', sdp: 'far-offer' }, ib: 1 });
    await settle();
    check('without a collision the offer is answered on the same pc', p.pc === first && first.answered && first.rollbacks === 0);
  }
  // 7. A rebuild while minting drops the minted offer (it belongs to a closed pc).
  {
    const tia = makeSide('k_14d0');
    const p = tia.makePeer('k_ff04');
    tia.sendOffer('k_ff04', false);
    await new Promise((r) => setTimeout(r, 3));
    tia.newPcFor(p);
    check('a rebuild clears the in-flight mark', p.offering === null);
    await settle(40);
    check('the offer minted on the replaced pc is never sent', !tia.sent.some((s) => s.kind === 'offer'), tia.sent.map((s) => s.kind));
  }
  console.log('\nmeet-offer-collision: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
