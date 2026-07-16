// relay-knock.js — standalone test for the GREETER REGISTRY (healing-laws
// R2/R3/R6) in the relay. Spawns its own relay-local on a private port and
// drives it over raw WebSocket (Node 22 global WebSocket). Verifies:
//   • the first knocker to meet an EMPTY registry FOUNDS the instance (R3);
//   • every later knocker gets the sealed list but does NOT found;
//   • a MATCHING-key re-knock registers a sealed greeter address (E3);
//   • a NON-matching key is a newcomer — gets the list, never registered;
//   • the list reflects the LIVE greeter pool;
//   • the genesis identity persists as long as any admitted seat is connected.
// The relay is zero-knowledge: it stores only H(genesis key) + opaque sealed
// blobs, gates genesis, and never holds the meeting-URL key.
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8796;
const RELAY = 'ws://127.0.0.1:' + PORT;
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
  const relay = spawn('node', [path.join(__dirname, 'relay-local.js')], { env: { ...process.env, RELAY_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  await sleep(600);

  const sid = 'knock-' + Math.random().toString(36).slice(2, 8);
  const KEYA = 'genesis-key-A', KEYB = 'newcomer-throwaway-B';

  const A = open(sid, 'A', KEYA); await A.ready; await sleep(120);
  check('first knocker (empty registry) FOUNDS', A.last() && A.last().founded === true && A.last().admitted === true, A.last());
  check('founding list is empty', A.last() && A.last().list.length === 0);

  const B = open(sid, 'B', KEYB); await B.ready; await sleep(120);
  check('non-matching key does NOT found', B.last() && B.last().founded === false && B.last().admitted === false, B.last());

  A.knock(KEYA, 'SEALED(addrA)'); await sleep(120);
  check('matching-key re-knock stays admitted', A.last() && A.last().admitted === true);

  const C = open(sid, 'C', KEYA); await C.ready; await sleep(120);
  check('matching learned key is admitted (not founding)', C.last() && C.last().admitted === true && C.last().founded === false, C.last());
  check('newcomer sees the registered greeter', C.last() && C.last().list.includes('SEALED(addrA)'), C.last());
  C.knock(KEYA, 'SEALED(addrC)'); await sleep(120);

  B.knock(KEYB, 'SEALED(forgedB)'); await sleep(120);
  check('wrong-key re-knock: not admitted', B.last() && B.last().admitted === false, B.last());
  check('wrong-key blob is NOT registered; live pool visible',
    B.last() && B.last().list.includes('SEALED(addrA)') && B.last().list.includes('SEALED(addrC)') && !B.last().list.includes('SEALED(forgedB)'), B.last());

  A.close(); await sleep(200);
  const D = open(sid, 'D', 'unrelated-key'); await D.ready; await sleep(120);
  check('genesis persists after founder leaves (no re-found)', D.last() && D.last().founded === false, D.last());
  check('surviving greeter still served', D.last() && D.last().list.includes('SEALED(addrC)'), D.last());

  [B, C, D].forEach((w) => { try { w.close(); } catch (_) {} });
  await sleep(100);
  relay.kill();
  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})();
