// zombie-genesis.js — CAN A DEAD PHONE HOLD A ROOM SHUT FOREVER?
//
// The relay forgets a greeter's ADDRESS when its blob TTLs out, but it used to
// remember the GENESIS off any surviving socket attachment — even one whose
// owner is a frozen phone that will never speak again (the network often never
// reaps such sockets). That combination is a wedged room: greeter list EMPTY,
// yet founded=false, so every knocker holds on the mint gap (correctly — that
// hold is the anti-tear rule R3 needs) and NOBODY can enter the meeting until
// the zombie socket happens to die. Observed live 2026-07-25 in room "test":
// a sleeping phone held the door shut against every joiner, including the
// monitor.
//
// The law already decides this: E3 — "when all of them fall silent for one
// TTL, the list empties and the room reopens for a fresh genesis." The fix
// makes genesisHash honor the genesis only on sockets provably alive at the
// door: an unexpired greeter blob, or a knock within one TTL (gseen).
//
// Three claims, measured against the real local relay with a short TTL:
//   1. TEAR-SAFETY UNCHANGED: while the zombie is within its TTL, a
//      different-key knocker must NOT found (the mint-gap hold stands).
//   2. REOPEN: once the zombie has been silent past one TTL, the next knocker
//      FOUNDS a fresh genesis and the room is enterable again.
//   3. ADOPTION: after the reopen, the registry serves the NEW key — the old
//      zombie key no longer admits.
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8797;
const TTL_MS = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };

// A bare protocol client: connect (the URL carries gk — the relay knocks for
// us), collect greeters frames, optionally knock again later. No mesh node —
// the zombie must be able to stay perfectly silent while its socket lives.
function dial(peer, gk) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/s/zg-sid?role=mesh&token=T&peer=' + peer + '&gk=' + gk);
  const c = { ws, greeters: [], open: new Promise((r) => ws.addEventListener('open', r)) };
  ws.addEventListener('message', (ev) => {
    try { const m = JSON.parse(ev.data); if (m.t === 'greeters') c.greeters.push(m); } catch (e) {}
  });
  c.knock = (k) => ws.send(JSON.stringify({ t: 'knock', gk: k }));
  c.last = () => c.greeters[c.greeters.length - 1] || null;
  c.await = async (n) => { const t0 = Date.now(); while (c.greeters.length < n && Date.now() - t0 < 5000) await sleep(50); return c.last(); };
  return c;
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), RELAY_GREETER_TTL_MS: String(TTL_MS) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  process.on('exit', () => { try { relay.kill(); } catch (e) {} });
  await sleep(700);

  // ---- the zombie founds the room, then falls silent with its socket open ----
  const zombie = dial('k_zombie', 'KEY-ZOMBIE');
  const zg = await zombie.await(1);
  check('zombie founds the empty room at connect', !!(zg && zg.founded), zg);

  // ---- claim 1: within the TTL, a different key must NOT found -------------
  const early = dial('k_early', 'KEY-OTHER');
  const eg = await early.await(1);
  check('within TTL: different-key knocker does NOT found (mint-gap hold stands)',
    !!(eg && !eg.founded && !eg.admitted && (eg.list || []).length === 0), eg);

  // ---- the zombie says nothing for a full TTL + slack -----------------------
  await sleep(TTL_MS + 1500);

  // ---- claim 2: the room reopens for the next knocker -----------------------
  early.knock('KEY-OTHER');
  const rg = await early.await(2);
  check('past TTL of zombie silence: knocker FOUNDS — the room reopened (E3)',
    !!(rg && rg.founded), rg);

  // ---- claim 3: the registry now serves the NEW genesis ---------------------
  const late = dial('k_late', 'KEY-ZOMBIE'); // the zombie's old key
  const lg = await late.await(1);
  check('old zombie key no longer admits after the reopen', !!(lg && !lg.founded && !lg.admitted), lg);
  const late2 = dial('k_late2', 'KEY-OTHER');
  const l2 = await late2.await(1);
  check('the adopted key admits', !!(l2 && !l2.founded && l2.admitted), l2);

  for (const c of [zombie, early, late, late2]) { try { c.ws.close(); } catch (e) {} }
  relay.kill();
  console.log(failures ? 'FAILURES: ' + failures : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
