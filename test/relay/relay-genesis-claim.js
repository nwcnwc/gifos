// relay-genesis-claim.js — A KNOCK IS PROOF OF LIFE, NEVER PROOF OF GREETING.
//
// Guards the STALE-REGISTRATION GENESIS (found 2026-08-06 by
// test/tools/door-registry-probe.js, 5/5 reproducible; fixed in
// relay/src/relay.js genesisHash() + its relay-local.js twin).
//
// THE BUG. genesisHash() used to hold a room for any socket matching
// `gblob && gseen + GREETER_TTL_MS > now` — "registered before, still
// knocking". Both halves are traps: `gblob` is NEVER cleared when the
// registration expires, so "has a blob" outlives "is a greeter" forever; and
// `gseen` is refreshed by EVERY knock including blobless ones — which is
// precisely a seat's state after requeue() (same socket, state 0, knocking
// every ~10s, registering nothing). The window meant to be "one TTL to
// re-register" therefore renewed itself on every heartbeat and never closed.
//
// Meanwhile greeterList() requires `gexp > now`, so that same socket
// contributed NO blob. The room was founded by a hash nobody would ever
// present, with an empty pool, and every newcomer got
// {founded:false, admitted:false, list:[]} — forever. That is the 2026-07-29
// field signature (hold-mint-gap, listLen 0, sealed []), and MINT_GRACE_MS does
// not cover it: that clause only bounds sockets which NEVER registered.
//
// THE FIX, and what this suite pins: the lapsed-greeter window is measured from
// the registration's EXPIRY, a fixed point a heartbeat cannot push forward —
// not from the last knock.
//
// The suite must prove BOTH directions, because a fix that simply deleted the
// clause would pass leg 2 and re-open the 2026-07-26 room tear:
//   1. E3's re-knock window SURVIVES — inside the grace, a lapsed greeter still
//      holds its room against a stranger.
//   2. The claim DIES — past the grace, blobless knocking does not keep it, the
//      room reopens, and a newcomer can found for real.
//   3. The absorbing state is GONE — the newcomer is not left founded:false
//      with an empty list, which was the actual user-visible symptom.
//
// Windows are collapsed via RELAY_GREETER_TTL_MS / RELAY_CLAIM_GRACE_MS —
// 250s + 60s per assertion is not a test.
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8797;
const RELAY = 'ws://127.0.0.1:' + PORT;
const TTL = 1200;      // greeter registration lifetime
const GRACE = 1200;    // how long a lapsed claim survives past EXPIRY
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(sid, peer, gk) {
  const url = RELAY + '/s/' + sid + '?role=mesh&token=T&peer=' + peer + (gk ? '&gk=' + gk : '');
  const ws = new WebSocket(url);
  ws.greets = [];
  ws.ready = new Promise((res) => ws.addEventListener('open', () => res()));
  ws.addEventListener('message', (e) => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (m.t === 'greeters') ws.greets.push(m); });
  ws.knock = (gk2, gblob) => ws.send(JSON.stringify({ t: 'knock', gk: gk2, gblob }));
  ws.last = () => ws.greets[ws.greets.length - 1];
  return ws;
}

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')],
    { env: { ...process.env, RELAY_PORT: String(PORT), RELAY_GREETER_TTL_MS: String(TTL), RELAY_CLAIM_GRACE_MS: String(GRACE) },
      stdio: ['ignore', 'pipe', 'pipe'] });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  await sleep(700);

  const KEYA = 'genesis-key-A', KEYX = 'stranger-key-X';

  // ---- 1. E3's re-knock window SURVIVES the fix ----------------------------
  // A registers, then lets its blob age out while still knocking. INSIDE the
  // grace the room is still A's — this is the clause whose removal re-opens the
  // 2026-07-26 room tear, so it has to be pinned, not assumed.
  {
    const sid = 'gc-hold-' + Math.random().toString(36).slice(2, 8);
    const A = open(sid, 'A', KEYA); await A.ready; await sleep(120);
    A.knock(KEYA, 'SEALED(addrA)'); await sleep(120);
    // NB assert on the CONNECT knock, not the last one: by the time A registers
    // its blob the room is already A's, so that reply is correctly
    // {founded:false, admitted:true}. Reading last() here was my own bug.
    check('A founds and registers a greeter', A.greets.some((g) => g.founded === true), A.greets);

    await sleep(TTL + 200);                       // the registration has now EXPIRED, well inside the grace
    A.knock(KEYA, undefined);                     // blobless heartbeat, exactly what requeue() sends
    await sleep(120);

    const X = open(sid, 'X', KEYX); await X.ready; await sleep(150);
    check('inside the grace, a lapsed greeter STILL holds its room against a stranger',
      X.last() && X.last().founded === false && X.last().admitted === false, X.last());
    A.close(); X.close(); await sleep(150);
  }

  // ---- 2. the claim DIES past the grace, however hard it knocks -------------
  // The bug in one line: blobless knocking used to renew the claim forever.
  {
    const sid = 'gc-lapse-' + Math.random().toString(36).slice(2, 8);
    const A = open(sid, 'A', KEYA); await A.ready; await sleep(120);
    A.knock(KEYA, 'SEALED(addrA)'); await sleep(120);
    // NB assert on the CONNECT knock, not the last one: by the time A registers
    // its blob the room is already A's, so that reply is correctly
    // {founded:false, admitted:true}. Reading last() here was my own bug.
    check('A founds and registers a greeter', A.greets.some((g) => g.founded === true), A.greets);

    // Knock blobless throughout — the pre-fix rule refreshed gseen every time
    // and the room stayed A's for as long as A kept breathing.
    const deadline = Date.now() + TTL + GRACE + 700;
    while (Date.now() < deadline) { A.knock(KEYA, undefined); await sleep(150); }

    const X = open(sid, 'X', KEYX); await X.ready; await sleep(200);
    check('past the grace, blobless knocking does NOT hold the room — a newcomer FOUNDS',
      X.last() && X.last().founded === true && X.last().admitted === true, X.last());
    // 3. and the absorbing state is gone: the newcomer is not stranded with
    //    founded:false and an empty pool, which is what users actually hit.
    check('the newcomer is never left founded:false with an EMPTY greeter pool (the 2026-07-29 signature)',
      X.last() && !(X.last().founded === false && X.last().list.length === 0), X.last());
    A.close(); X.close(); await sleep(150);
  }

  // ---- 4. a LIVE greeter is untouched --------------------------------------
  // The fix must not weaken a genuinely-registered greeter: it keeps its room
  // through the whole TTL without any knocking at all.
  {
    const sid = 'gc-live-' + Math.random().toString(36).slice(2, 8);
    const A = open(sid, 'A', KEYA); await A.ready; await sleep(120);
    A.knock(KEYA, 'SEALED(addrA)'); await sleep(120);
    await sleep(Math.floor(TTL / 2));             // still inside the registration
    const X = open(sid, 'X', KEYX); await X.ready; await sleep(150);
    check('a LIVE registered greeter holds its room, and its blob is served',
      X.last() && X.last().founded === false && X.last().list.includes('SEALED(addrA)'), X.last());
    A.close(); X.close(); await sleep(150);
  }

  relay.kill();
  console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
