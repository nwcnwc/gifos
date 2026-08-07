/*
 * door-registry-probe.js — WHO HOLDS THE ROOM, AND WHY IS THE POOL EMPTY?
 *
 * The greeter registry (healing-laws R2/R3) is RELAY state, and a client is
 * told only `list`, `founded` and `admitted` — never WHO holds the genesis or
 * WHY it was refused. Every absorbing door state we have hit in the field
 * (the 2026-07-25 zombie socket, the 2026-07-29 ghost genesis, and the shapes
 * below) looked identical from the outside: a live room handing knockers an
 * empty list forever. This speaks the knock protocol directly — no browser, no
 * mesh — so a registry state machine can be reproduced in seconds, exactly.
 *
 * Two things it is built to demonstrate, both MEASURED here 2026-08-06:
 *
 * A. A READ-ONLY DOOR PROBE EXISTS. `{t:'knock', gk:''}` claims nothing
 *    (`a.gkh = gk ? H(gk) : null`, so founded=admitted=false and no gseen is
 *    stamped) and still returns the full live blob list. So the door can be
 *    censused from outside without minting a ghost — the observation the fork
 *    forensics wanted and nobody had.
 *
 * B. ONE SESSION CAN HOLD TWO GENESIS INSTANCES, AND A STALE CLAIM CAN HOLD
 *    THE ROOM FOREVER. `genesisHash()` grants the room to a socket that
 *    `a.gblob && (a.gseen||0) + GREETER_TTL_MS > now` — "registered before,
 *    still knocking". But `a.gblob` is NEVER CLEARED when it expires, and
 *    `a.gseen` is refreshed by EVERY knock, including blobless ones
 *    (`if (a.gkh) a.gseen = Date.now()`). So a socket that registered a
 *    greeter blob ONCE and then only ever knocks blobless — precisely what a
 *    seat does after `requeue()` (state 0 ⇒ mesh-wire's env.knock takes the
 *    KNOCK_FOR_THE_GREETER_LIST branch, ~every 10s, on the SAME socket) —
 *    holds the room's genesis indefinitely while greeting nobody. Every other
 *    knocker gets `founded:false, admitted:false, list:[]` forever: the exact
 *    greeterTrace line the 2026-07-29 field bug left behind
 *    (`hold-mint-gap`, listLen 0, sealed []), and the state in which two
 *    already-seated halves can never find each other again.
 *
 *    This is the ghost-genesis hole moved, not closed: MINT_GRACE_MS weakens
 *    a claim from a socket that NEVER registered (`!a.gblob`), and this case
 *    has a stale `gblob`, so the grace never applies. Proof of life is still
 *    being taken as proof of greeting — one branch further down.
 *
 * Not a gate: it is a forensics instrument, and leg B currently DEMONSTRATES a
 * live defect rather than asserting the absence of one. When the relay makes a
 * genesis claim require a LIVE registration (or an unconverted mint inside the
 * grace), leg B becomes a regression test and belongs in a battery.
 *
 *   node test/tools/door-registry-probe.js            # spawn a local relay
 *   node test/tools/door-registry-probe.js --relay ws://host:8790 --sid <sid>
 *                                                     # census a REAL door,
 *                                                     # read-only (leg A only)
 */
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i === -1 ? d : argv[i + 1]; };
const PORT = parseInt(arg('port', '8873'), 10);
const EXT_RELAY = arg('relay', '');
const EXT_SID = arg('sid', '');
const EXT_TOK = arg('tok', '');
const TTL = parseInt(arg('ttl', '2500'), 10);       // local relay only
const GRACE = parseInt(arg('grace', '1000'), 10);   // local relay only
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(base, sid, name, gk, tok) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(base + '/s/' + sid + '?role=mesh&token=' + encodeURIComponent(tok || '')
      + '&peer=' + encodeURIComponent(name) + '&gk=' + encodeURIComponent(gk));
    const c = { ws, name, gk, replies: [], roster: null };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.t === 'greeters') c.replies.push(m);
      if (m.t === 'roster') c.roster = m.peers;
      if (m.t === 'error') c.error = m.error;
    };
    ws.onopen = () => setTimeout(() => res(c), 250);
    ws.onerror = () => rej(new Error('cannot open a socket for ' + name));
  });
}
const last = (c) => c.replies[c.replies.length - 1] || {};
const knock = async (c, gk, gblob) => { c.ws.send(JSON.stringify({ t: 'knock', gk: gk === undefined ? c.gk : gk, gblob })); await sleep(200); return last(c); };
const fmt = (r) => 'founded=' + r.founded + ' admitted=' + r.admitted + ' list=' + JSON.stringify(r.list || []);

// ---- read-only census of a REAL door ---------------------------------------
async function census(base, sid, tok) {
  console.log('door census: ' + base + '/s/' + sid);
  const OBS = await open(base, sid, 'doorprobe-' + Math.random().toString(36).slice(2, 8), '', tok);
  const r = await knock(OBS, '');
  console.log('  sockets on this session : ' + JSON.stringify(OBS.roster || []));
  console.log('  live greeter blobs      : ' + (r.list || []).length);
  (r.list || []).forEach((b, i) => console.log('    [' + i + '] ' + String(b).length + ' bytes  fp=' + fp(b)));
  console.log('  founded (a genesis is held): ' + r.founded === false);
  console.log('  raw: ' + fmt(r));
  console.log('\n  READ: sockets > blobs+1 with a seated room means greeters are not registering');
  console.log('        (a claim they do not hold), and blobs=0 with founded=false on a live');
  console.log('        room is the absorbing door — nobody can join and nobody can re-found.');
  try { OBS.ws.close(); } catch (e) {}
}
// mesh-wire.js blobFp, verbatim — so a fingerprint here matches the one a
// client's greeterTrace prints for its OWN registration ('register-blob:<fp>').
function fp(s) { let h = 5381; const str = String(s); for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + str.length; }

(async () => {
  if (EXT_RELAY) {
    if (!EXT_SID) { console.error('--relay needs --sid (derive it with GifOS.net.deriveMeet in a page, or read it off a client)'); process.exit(2); }
    await census(EXT_RELAY.replace(/\/+$/, ''), EXT_SID, EXT_TOK);
    process.exit(0);
  }

  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(PORT), RELAY_GREETER_TTL_MS: String(TTL), RELAY_MINT_GRACE_MS: String(GRACE) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const socks = [];
  process.on('exit', () => { for (const c of socks) { try { c.ws.close(); } catch (e) {} } try { relay.kill(); } catch (e) {} });
  await sleep(800);
  const BASE = 'ws://127.0.0.1:' + PORT;
  const SID = 'probe' + Math.random().toString(36).slice(2, 8);
  const mk = async (n, gk) => { const c = await open(BASE, SID, n, gk, ''); socks.push(c); return c; };

  console.log('=== A. gk="" is a READ-ONLY door probe: it must claim nothing ===');
  const OBS = await mk('OBS', '');
  console.log('  observer connect : ' + fmt(last(OBS)));
  const A = await mk('A', 'KA');
  console.log('  first real knock : ' + fmt(last(A)) + '   <- founded MUST still be true');
  await knock(A, 'KA', 'BLOB_A1');
  console.log('  observer probe   : ' + fmt(await knock(OBS, '')) + '   <- sees the pool without joining it');

  console.log('\n=== B1. one session, TWO genesis instances ===');
  console.log('  (A stays CONNECTED but silent for one TTL — E3\'s reopening clause)');
  await sleep(TTL + 400);
  const B = await mk('B', 'KB');
  console.log('  B connect        : ' + fmt(last(B)) + '   <- founded:true = a SECOND genesis on A\'s session');
  await knock(B, 'KB', 'BLOB_B1');
  console.log('  A re-registers   : ' + fmt(await knock(A, 'KA', 'BLOB_A2')) + '   <- A is sealed out of its own room');
  console.log('  door now holds   : ' + fmt(await knock(OBS, '')) + '   <- blobs from BOTH instances; the pool does not check genesis');

  console.log('\n=== B2. a socket that registered ONCE and now only knocks BLOBLESS ===');
  console.log('  (the state a seat is in after requeue(): state 0, same socket, ~10s knocks)');
  for (const c of [A, B]) { try { c.ws.close(); } catch (e) {} }
  await sleep(300);
  const X = await mk('X', 'KX');
  await knock(X, 'KX', 'BLOB_X');
  console.log('  X founds + registers, then requeues and goes blobless');
  await sleep(TTL + 400);                       // its blob expires; it keeps knocking
  const N = await mk('N', 'KN');                // a brand-new joiner, fresh key
  let stuck = 0;
  for (let r = 0; r < 5; r++) {
    await knock(X, 'KX');                       // the blobless join-loop knock
    const rn = await knock(N, 'KN');
    if (!rn.founded && !rn.admitted && !(rn.list || []).length) stuck++;
    console.log('    round ' + r + '  X{' + fmt(last(X)) + '}   newcomer{' + fmt(rn) + '}');
    await sleep(TTL / 3);
  }
  console.log('\n  VERDICT: the newcomer was handed an empty, unfoundable door ' + stuck + '/5 rounds.');
  console.log('  5/5 means the room is ABSORBING: X\'s expired blob still satisfies');
  console.log('  genesisHash()\'s "registered before, still knocking" branch, because');
  console.log('  a.gblob is never cleared and every knock refreshes a.gseen. Two halves');
  console.log('  already seated when this sets in can never find each other again.');
  console.log('  Fix direction (relay, needs a healing-laws read): a genesis claim must');
  console.log('  require a LIVE registration (gexp > now) or an unconverted mint inside');
  console.log('  MINT_GRACE_MS. A knock is proof of life, never proof of greeting.');

  await sleep(150);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
