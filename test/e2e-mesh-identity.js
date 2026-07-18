// e2e-mesh-identity.js — END-TO-END proof of S4 per-participant identity
// (healing-laws.md S4/S5, site/js/mesh-identity.js) over the PRODUCTION stack:
// mesh.js + mesh-wire.js + mesh-identity.js, with REAL WebCrypto Ed25519 and
// the REAL relay (test/relay-local.js) over REAL WebSockets. What the browser
// adds on top is only WebRTC (here: an in-process "DC bus" standing in for
// DataChannels — reliable, ordered, black-holes to dead peers).
//
// The three properties S4 must deliver:
//   1. peer-id === H(pubkey), and a legit healer's SIGNED fill is accepted —
//      proven end-to-end: a room of identity-minting nodes converges over the
//      wire (convergence REQUIRES signed fills to verify), and every node's
//      peer id is the hash of its public key.
//   2. An IMPOSTOR that claims a coord/id but cannot sign as the pinned healer
//      is REJECTED — the turnover-capture / climb attack fails. Shown against a
//      LIVE node's real TOFU pin store, built over the real transport, in every
//      forgery shape (wrong signer, forged id, key-swap, unsigned, tampered).
//   3. A participant that MOVES keeps its identity — a neighbour that pinned its
//      key still recognises it, signed at a NEW coord.
const { spawn } = require('child_process');
const path = require('path');
require('../site/js/gifos-net.js');
require('../site/js/mesh.js');
require('../site/js/mesh-identity.js');
require('../site/js/mesh-wire.js');
const net = globalThis.GifOS.net, wire = globalThis.GifOS.meshWire, ident = globalThis.GifOS.meshIdentity;

const PORT = 8796;
const RELAY = 'ws://127.0.0.1:' + PORT;
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function convergence(nodes) {
  const coords = new Map(); let seated = 0, dups = 0;
  for (const n of nodes) {
    const s = n.stats();
    if (s.state === 3 && s.coord) { seated++; const k = s.coord.pc + '_' + s.coord.r + '_' + s.coord.i; if (coords.has(k)) dups++; else coords.set(k, s.peer); }
  }
  return { seated, dups };
}
async function waitConverged(nodes, N, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const c = convergence(nodes);
    if (c.seated === N && c.dups === 0) return c;
    await sleep(300);
  }
  return convergence(nodes);
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  await sleep(700);

  const key = await net.deriveMeetKey('ident-room', '', '');
  const bus = new Map(); // peerId -> { node, dead }
  const sendDC = (to, m) => {
    const e = bus.get(to);
    if (e && !e.dead) { const c = JSON.parse(JSON.stringify(m)); setTimeout(() => { if (!e.dead) e.node.recvCtl(c); }, 4 + Math.random() * 12); }
    return true; // a channel "exists" either way — a crashed far end just never answers
  };

  // ---------- Property 1: mint identities, peer-id = H(pubkey), signed fills flow ----------
  const N = 6;
  const nodes = [];
  for (let i = 0; i < N; i++) {
    // NOTE: no `peer` passed ⇒ the wire MINTS a per-participant identity and
    // uses peer-id = H(pubkey). This is S4 ON.
    const node = wire.createMeshNode({ relayUrl: RELAY, sid: 'ident-sid', tok: 'T', key, tickMs: 25, sendDC });
    await node.whenReady;                 // identity minted, seat built, joining
    bus.set(node.peer, { node, dead: false });
    nodes.push(node);
    await sleep(40);
  }

  // peer-id === H(pubkey) for every node (real WebCrypto).
  let allBound = true;
  for (const n of nodes) {
    const expect = await ident.peerIdOf(n.identity.pubB64);
    if (n.peer !== expect || !/^k_[0-9a-f]{40}$/.test(n.peer)) allBound = false;
  }
  check('1: every node peer-id === H(pubkey) (k_<40 hex>)', allBound);

  const c = await waitConverged(nodes, N, 60000);
  check('1: ' + N + ' identity nodes converge over the wire — signed fills accepted', c.seated === N && c.dups === 0, c);

  // ---------- Property 2 + 3: against a LIVE node's real pin store ----------
  // Pick a witness node W that has been running the real transport, so its TOFU
  // pin store holds the REAL pinned keys of the participants it has heard from.
  const W = nodes[0];
  const pins = W.seat.pins;
  check('2/3: witness has TOFU-pinned neighbours over the real transport (>=1)', pins.size() >= 1, { pinned: pins.size() });

  // V = a real, pinned participant (a legitimate neighbour of W).
  let V = null;
  for (const n of nodes.slice(1)) { if (pins.get(n.identity.peerId)) { V = n; break; } }
  check('2/3: found a pinned legitimate participant V to target', !!V);

  if (V) {
    const Vid = V.identity;                         // V's real key material
    const coordX = net.topo.ckey({ pc: 0, r: 1, i: 1 });
    const coordY = net.topo.ckey({ pc: 0, r: 2, i: 3 }); // a DIFFERENT coord (a move)

    // --- LEGIT: V signs a CLAIM at coordX → ACCEPTED against W's pin ---
    const legit = { t: 'CLAIM', ck: coordX, id: Vid.peerId };
    legit.s4 = await ident.signFill(Vid, legit);
    const rLegit = await ident.verifyFill(pins, legit);
    check('1: legit healer V signed fill ACCEPTED (peer-id === H(pubkey))', rLegit.ok && rLegit.from === Vid.peerId);

    // --- IMPOSTOR A: attacker E signs as ITSELF but forges the occupant id=V ---
    const E = await ident.mint();                   // a brand-new attacker identity
    const impA = { t: 'CLAIM', ck: coordX, id: Vid.peerId }; // wants V's coord as V
    const spA = ident.statement(E.peerId, impA);
    impA.s4 = { sp: spA, sig: await net.edSign(E.priv, spA), pub: E.pubB64 };
    const rA = await ident.verifyFill(pins, impA);
    check('2: impostor (signs as E, claims occupant V) REJECTED — no turnover capture', !rA.ok);

    // --- IMPOSTOR B: attacker claims from=V but presents its OWN key ---
    const impB = { t: 'CLAIM', ck: coordX, id: Vid.peerId };
    const spB = ident.statement(Vid.peerId, impB);  // lies: from = V
    impB.s4 = { sp: spB, sig: await net.edSign(E.priv, spB), pub: E.pubB64 }; // but signs+pubs as E
    const rB = await ident.verifyFill(pins, impB);
    check('2: impostor (forged id=V, own key) REJECTED — H(pub) !== V', !rB.ok);

    // --- IMPOSTOR C: KEY-SWAP — reuse V's pinned id with V's real pub but E's sig ---
    const impC = { t: 'CLAIM', ck: coordX, id: Vid.peerId };
    const spC = ident.statement(Vid.peerId, impC);
    impC.s4 = { sp: spC, sig: await net.edSign(E.priv, spC), pub: Vid.pubB64 }; // right pub, wrong signer
    const rC = await ident.verifyFill(pins, impC);
    check('2: impostor (V pubkey, E signature) REJECTED — cannot forge V signature', !rC.ok);

    // --- UNSIGNED: a bare CLAIM with no signature is REJECTED when S4 is active ---
    const bare = { t: 'CLAIM', ck: coordX, id: Vid.peerId };
    const rBare = await ident.verifyFill(pins, bare);
    check('2: unsigned fill REJECTED when S4 active (client-set-id hole closed)', !rBare.ok);

    // --- TAMPER: V signs coordX, attacker rewrites the coord to coordY ---
    const tam = { t: 'CLAIM', ck: coordX, id: Vid.peerId };
    tam.s4 = await ident.signFill(Vid, tam); tam.ck = coordY; // move the fill after signing
    const rTam = await ident.verifyFill(pins, tam);
    check('2: tampered fill (coord rewritten post-signature) REJECTED', !rTam.ok);

    // --- PROPERTY 3: V MOVES — signs at a NEW coord, still recognised by W's pin ---
    const moved = { t: 'HELLO', ck: coordY, id: Vid.peerId };
    moved.s4 = await ident.signFill(Vid, moved);
    const rMoved = await ident.verifyFill(pins, moved);
    check('3: V recognised at a NEW coord after moving (identity portable, TOFU stable)', rMoved.ok && rMoved.from === Vid.peerId);

    // --- and an impostor at the moved-to coord still fails ---
    const movedImp = { t: 'HELLO', ck: coordY, id: Vid.peerId };
    const spMI = ident.statement(Vid.peerId, movedImp);
    movedImp.s4 = { sp: spMI, sig: await net.edSign(E.priv, spMI), pub: Vid.pubB64 };
    const rMI = await ident.verifyFill(pins, movedImp);
    check('3: impostor at V\'s new coord still REJECTED (identity, not location)', !rMI.ok);
  }

  for (const n of nodes) n.stop();
  relay.kill();
  await sleep(200);
  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})();
