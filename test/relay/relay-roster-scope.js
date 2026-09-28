// relay-roster-scope.js — THE ROSTER IS SCOPED TO THE DOOR, AND THE DOOR HAS NO CAP.
//
// Guards the 2026-09-28 relay change (relay/src/relay.js roster() + its
// test/servers/relay-local.js twin). Before it, roster() sent EVERY socket's id
// to EVERY socket on every connect and close, and a 30-socket session cap
// (C²+C) hid the cost: 25 of the 30 slots are Section 1's permanent greeters, so
// a meeting that starts at 10:00 queued its whole audience behind five slots.
// Without the cap, a burst of N joiners cost ~N³/3 roster entries — 13 GB of
// buffered frames at N=700 in test/mesh/flood.js.
//
// What this pins:
//   1. no session cap — 60 sockets in one session, none refused;
//   2. a non-greeter gets a scope 'door' roster naming ONLY the greeters, and
//      then NOTHING while other sockets come and go (per-join cost O(greeters));
//   3. a greeter gets the full list and exact peer-join / peer-leave deltas;
//   4. a greeter closing re-sends the door list (the doors changed);
//   5. {t:'who'} pulls the full list, at most once per 5s per socket.
//
// Runs against a private relay-local by default, in BOTH modes (dev, and
// RELAY_PROD=1 with TRUSTED_IPS so the per-IP cap does not stand in for the
// session cap). RELAY_URL=ws://127.0.0.1:8794 runs it once against a relay
// already listening — e.g. the real Worker under test/servers/relay-dev.sh.
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8802;
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(base, sid, peer, gk) {
  const url = base + '/s/' + sid + '?role=mesh&token=T&peer=' + peer + '&dev=' + peer + 'd' + (gk ? '&gk=' + encodeURIComponent(gk) : '');
  const ws = new WebSocket(url);
  ws.peer = peer; ws.msgs = []; ws.bytes = 0; ws.closedCode = null; ws.errors = [];
  ws.ready = new Promise((res) => ws.addEventListener('open', () => res()));
  ws.addEventListener('message', (e) => {
    ws.bytes += String(e.data).length;
    let m; try { m = JSON.parse(e.data); } catch (_) { return; }
    ws.msgs.push(m);
    if (m.t === 'error') ws.errors.push(m.error);
  });
  ws.addEventListener('close', (e) => { ws.closedCode = e.code; });
  ws.knock = (k, gblob) => ws.send(JSON.stringify({ t: 'knock', gk: k, gblob }));
  ws.of = (t) => ws.msgs.filter((m) => m.t === t);
  ws.lastRoster = () => { const r = ws.of('roster'); return r[r.length - 1] || null; };
  ws.mark = () => { ws.markAt = ws.msgs.length; ws.markBytes = ws.bytes; };
  ws.since = (t) => ws.msgs.slice(ws.markAt || 0).filter((m) => !t || m.t === t);
  return ws;
}

async function scenario(base, label) {
  console.log('\n═══ ' + label);
  const sid = 'scope-' + Math.random().toString(36).slice(2, 8);
  const KEY = 'genesis-key-scope', STRANGER = 'throwaway-joiner-key';

  // Two greeters: G1 founds, G2 joins with the learned key; both register blobs.
  const G1 = open(base, sid, 'G1', KEY); await G1.ready; await sleep(150);
  G1.knock(KEY, 'SEALED(g1)'); await sleep(150);
  const G2 = open(base, sid, 'G2', KEY); await G2.ready; await sleep(150);
  G2.knock(KEY, 'SEALED(g2)'); await sleep(250);
  check('a greeter gets the FULL list', G1.lastRoster() && G1.lastRoster().scope === 'full', G1.lastRoster() && G1.lastRoster().scope);

  // A joiner: the doors only.
  const J1 = open(base, sid, 'J1', STRANGER); await J1.ready; await sleep(250);
  const r1 = J1.lastRoster();
  check('a joiner gets a scope-door roster', r1 && r1.scope === 'door', r1);
  check('...naming exactly the greeters', r1 && r1.peers.slice().sort().join(',') === 'G1,G2', r1 && r1.peers);
  check('...with only the greeters\' device tags', r1 && r1.devs && Object.keys(r1.devs).sort().join(',') === 'G1,G2', r1 && r1.devs);

  // 58 more joiners (60 sockets in all): no cap, and J1 hears NOTHING about them.
  J1.mark(); G1.mark();
  const crowd = [];
  for (let i = 0; i < 57; i++) crowd.push(open(base, sid, 'J' + (i + 2), STRANGER));
  await Promise.all(crowd.map((w) => Promise.race([w.ready, sleep(5000)])));
  await sleep(800);
  const refused = crowd.filter((w) => w.closedCode != null || w.errors.length);
  check('no session cap: 60 sockets in one session, none refused', refused.length === 0,
    refused.slice(0, 3).map((w) => ({ peer: w.peer, code: w.closedCode, err: w.errors[0] })));
  check('a joiner receives NOTHING while 57 others connect', J1.since().length === 0, J1.since().map((m) => m.t));
  const joins = G1.since('peer-join').map((m) => m.peer);
  check('a greeter gets one peer-join per connect (57)', joins.length === 57 && new Set(joins).size === 57, joins.length);
  check('...carrying the device tag', G1.since('peer-join').every((m) => m.dev === m.peer + 'd'));
  check('a greeter gets no full-roster re-send per connect', G1.since('roster').length === 0, G1.since('roster').length);

  // 20 leave: greeters get exact deltas, joiners nothing.
  J1.mark(); G1.mark();
  for (const w of crowd.slice(0, 20)) w.close();
  await sleep(800);
  const leaves = G1.since('peer-leave').map((m) => m.peer);
  check('a greeter gets one peer-leave per close (20)', leaves.length === 20 && new Set(leaves).size === 20, leaves.length);
  check('a joiner receives NOTHING while 20 others leave', J1.since().length === 0, J1.since().map((m) => m.t));

  // A door closes: every door list changes.
  J1.mark(); G1.mark();
  G2.close(); await sleep(400);
  const r2 = J1.since('roster').pop();
  check('a greeter closing re-sends the door list', r2 && r2.scope === 'door' && r2.peers.join(',') === 'G1', r2);
  check('...and the remaining greeter hears the leave', G1.since('peer-leave').some((m) => m.peer === 'G2'));

  // The pull, rate-limited.
  J1.mark();
  J1.send(JSON.stringify({ t: 'who' })); await sleep(300);
  const full = J1.since('roster').pop();
  const expect = 1 + 1 + 37; // G1 + J1 + the crowd still connected
  check('{t:\'who\'} pulls the full list', full && full.scope === 'full' && full.peers.length === expect, full && { scope: full.scope, n: full.peers.length, expect });
  J1.mark();
  J1.send(JSON.stringify({ t: 'who' })); await sleep(300);
  check('a second pull inside 5s is ignored', J1.since('roster').length === 0, J1.since('roster').length);

  [G1, J1, ...crowd].forEach((w) => { try { w.close(); } catch (_) {} });
  await sleep(200);
}

(async () => {
  if (process.env.RELAY_URL) {
    await scenario(process.env.RELAY_URL.replace(/\/$/, ''), 'relay at ' + process.env.RELAY_URL);
  } else {
    for (const mode of [{ label: 'relay-local, dev mode', env: {} },
      { label: 'relay-local, RELAY_PROD=1 (production guards on; per-IP cap waived for loopback)', env: { RELAY_PROD: '1', TRUSTED_IPS: '127.0.0.1,::1,::ffff:127.0.0.1' } }]) {
      const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')],
        { env: { ...process.env, ...mode.env, RELAY_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'pipe'] });
      relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
      await sleep(700);
      try { await scenario('ws://127.0.0.1:' + PORT, mode.label); } finally { relay.kill(); await sleep(300); }
    }
  }
  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
