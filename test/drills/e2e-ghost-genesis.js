// e2e-ghost-genesis.js — A GENESIS NOBODY HOLDS MUST NOT BRICK THE ROOM.
//
// THE FIELD BUG (prod room "test", 2026-07-29). A phone reloaded into a LIVE
// meeting and came up ALONE: live relay socket, EMPTY greeter list, "Just you —
// send the invite", for ~15 minutes, while two other clients sat in the SAME
// relay session. Its greeterTrace read:
//
//   {"tick":91,"state":3,"post":3,"listLen":0,"open":0,"founded":false,
//    "action":"hold-mint-gap","sealed":[]}
//
// listLen 0 with sealed [] means the RELAY returned nothing — not a wrong-key
// decrypt failure. founded:false means the relay DID hold a genesis. So the
// door was in a state that should not exist: the room is founded, live members
// are knocking, and the greeter pool is empty.
//
// THE MECHANISM — a GHOST GENESIS. The relay mints the room instance on the
// first knock to meet an empty registry (healing-laws R3), and the CONNECT
// knock is fired by the relay for every socket that attaches, carrying
// `seat.genKey || myKey` — the client's THROWAWAY key while it is still
// joining. A client at mesh state 1 or 2 (it has picked a gateway and is
// waiting for HOME / has asked for a seat) whose socket reconnects into a
// momentarily-empty registry is therefore handed founded:true — but
// mesh.js:1361 gates the mint on state===0, so it takes no seat and registers
// no blob. mesh-wire logs it as 'empty-founded-noop' and drops it.
//
// The room's genesis is now H(a throwaway key nobody will ever present):
//
//   * every later knock, by a returning MEMBER holding the real genesis or by
//     a brand-new joiner, fails the key match: admitted=false;
//   * knock() stores a greeter blob only `if (admitted && gblob)`, so every
//     Section-1 seat's E3 re-registration is SILENTLY DROPPED — and the client
//     is never told, because nothing reads `admitted`;
//   * the surviving blobs expire one TTL later and the pool is empty forever;
//   * `founded` is false for everyone (the relay does hold a genesis), so
//     nobody can R3/R6 take over.
//
// It is ABSORBING: the ghost socket refreshes its own gseen on every knock
// (`if (a.gkh) a.gseen = Date.now()`), so the claim never lapses, and the only
// escape is for that one socket to leave — the "reload again and it works".
//
// THE RULE THIS DRILL GUARDS: a genesis claim that never becomes a real
// greeter must LAPSE. A founder gets MINT_GRACE_MS to convert its mint into a
// registered blob; a socket that has never registered one cannot hold the room
// founded past that grace, no matter how often it knocks. The room reopens and
// the next knocker — a member with the real key, or a fresh joiner — founds it
// for real.
//
// Protocol-level on purpose: the registry is relay state, the failure is a
// relay state machine, and speaking the knock protocol directly makes the
// absorbing state reproducible in seconds and exactly, with no browser timing
// in the loop. Spawns its OWN relay, so it is safe from a worktree.
const { spawn } = require('child_process');
const path = require('path');

const RELAY_PORT = parseInt(process.env.GHOST_RELAY_PORT || '8836', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
// The relay's grace must be short enough to assert in a drill. relay-local
// reads RELAY_MINT_GRACE_MS; production uses the 30s default.
const GRACE_MS = 3000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) failures++;
};

const SID = 'ghost' + Math.random().toString(36).slice(2, 10);
function open(name, gk) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(RELAY + '/s/' + SID + '?role=mesh&token=&peer=' + name + '&gk=' + encodeURIComponent(gk));
    const c = { ws, name, gk, replies: [] };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } if (m.t === 'greeters') c.replies.push(m); };
    ws.onopen = () => setTimeout(() => res(c), 250);
    ws.onerror = () => rej(new Error('ws error: ' + name));
  });
}
const knock = async (c, gk, gblob) => { c.ws.send(JSON.stringify({ t: 'knock', gk: gk === undefined ? c.gk : gk, gblob })); await sleep(220); return last(c); };
const last = (c) => c.replies[c.replies.length - 1] || {};

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), RELAY_MINT_GRACE_MS: String(GRACE_MS) },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  const socks = [];
  const cleanup = () => { for (const c of socks) { try { c.ws.close(); } catch (e) {} } try { relay.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(800);

  const mk = async (n, gk) => { const c = await open(n, gk); socks.push(c); return c; };

  // ---- 1. the healthy room still works, unchanged ------------------------
  const A = await mk('A', 'KA');
  check('first knocker founds the empty room (R3)', last(A).founded === true && last(A).admitted === true);
  await knock(A, 'KA', 'BLOB_A');                       // A takes 0/0.0 and registers (E3)
  const B = await mk('B', 'KB');
  check('a joiner is handed the founder\'s sealed blob', last(B).list.length === 1);
  check('a joiner presenting a throwaway key is not admitted', last(B).admitted === false);
  await knock(B, 'KA', 'BLOB_B');                       // B learned the genesis from HOME
  check('a joiner that learned the genesis joins the pool', last(B).admitted === true);
  check('the founder now sees the second greeter', (await knock(A, 'KA', 'BLOB_A')).list.length === 1);

  // A registered greeter must keep the room founded across its OWN blob
  // expiry — that is the E3 re-knock window, and breaking it would re-open the
  // 2026-07-26 room tear. Its gseen is proof of life.
  check('a REGISTERED greeter still holds the genesis on a blobless knock',
    (await knock(A, 'KA')).founded === false);

  // ---- 2. the ghost: a mint that never becomes a greeter ------------------
  for (const c of socks) c.ws.close(); socks.length = 0;
  await sleep(400);                                      // room empties, registry reopens

  // G is the reloading phone: its socket attaches while it is at mesh state
  // 1/2, so the relay's connect knock carries its THROWAWAY key and no blob.
  // It is handed the room and (state !== 0) never takes the seat.
  const G = await mk('G', 'KGHOST');
  check('the blobless connect knock is still granted the mint', last(G).founded === true);

  // Before the grace lapses the claim stands — a founder legitimately needs a
  // moment to seat itself and register.
  const M = await mk('M', 'KA');                         // a member returning with the REAL genesis
  check('inside the grace the ghost still holds the room', last(M).founded === false && last(M).admitted === false);

  // ---- 3. …and it LAPSES, so the room is never bricked --------------------
  // The ghost keeps knocking throughout — that is the absorbing half of the
  // field bug: `if (a.gkh) a.gseen = Date.now()` meant every knock renewed the
  // claim forever. Proof of life must no longer be proof of GREETING.
  const deadline = Date.now() + GRACE_MS + 800;
  let reoffered = false;
  while (Date.now() < deadline) { if ((await knock(G, 'KGHOST')).founded) reoffered = true; }

  // THE ESCAPE FOR THE GHOST ITSELF. In the field this socket WAS the isolated
  // phone: admitted=true (it holds the genesis), list=0 (its own blob is
  // excluded and it has none), founded=false — so mesh-wire's only branch is
  // hold-mint-gap and it sits alone. Once the claim lapses its very next knock
  // re-mints, founded=true comes back, and the client mints 0/0.0 for real
  // (mesh.js:1361) and registers. That signal is the whole self-heal.
  check('the ghost is RE-OFFERED the mint it never used', reoffered === true);

  // THE ESCAPE FOR EVERYONE ELSE. A real client re-knocks at E3 cadence (100-
  // 200s), not in a tight loop, so the ordinary case is a claim that has
  // lapsed while the ghost socket is still CONNECTED and recently seen. That
  // is the case the old rule got wrong: gseen was refreshed by the loop above,
  // and a fresh gseen alone held the room founded for a full 250s TTL.
  await sleep(GRACE_MS + 600);
  const m2 = await knock(M, 'KA', 'BLOB_M');             // the member re-registers (E3)
  check('a never-registered mint LAPSES — a member founds the room for real', m2.founded === true);
  check('and its greeter blob is accepted', m2.admitted === true);

  const N = await mk('N', 'KN');                         // a brand-new joiner
  check('a newcomer is handed a live greeter, not an empty door', last(N).list.length === 1);
  check('the newcomer is NOT told to found a second room', last(N).founded === false);

  // A registered greeter is not a ghost: its claim must NOT lapse while it
  // holds the room, or newcomers would found second rooms on top of it.
  await sleep(GRACE_MS + 600);
  const n2 = await knock(N, 'KN');
  check('a REGISTERED greeter keeps the room past the mint grace', n2.founded === false);
  check('and the newcomer still sees it', n2.list.length === 1);

  cleanup();
  await sleep(150);
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
