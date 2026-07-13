// The meeting roster is SEALED from the relay: only room members (who hold the
// meeting-URL key) learn who's present. This guards that property at the relay
// boundary directly — no browser needed. It starts the local relay (the faithful
// mirror of relay/src/relay.js), joins a mesh room over a raw WebSocket while
// DELIBERATELY sending a ?name= and a ?dev=, and asserts the relay:
//   - authors a roster of peer IDS only — no `names`, no `ips`;
//   - never echoes the name anywhere, even though a client sent one;
//   - hands each socket its OWN address privately via `whoami` (the one place an
//     IP crosses the relay — to its rightful owner — and it is never stored);
//   - still carries the (client-salted, opaque) device tag it needs for ban/vote
//     equality.
// Run: node test/relay-privacy.js   (exits non-zero on any failure)
process.env.RELAY_PORT = process.env.RELAY_PORT || '8796';
require('./relay-local.js'); // starts listening on RELAY_PORT

const RELAY = 'ws://127.0.0.1:' + process.env.RELAY_PORT;
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function join(sid, peer) {
  const url = RELAY + '/s/' + sid + '?role=mesh&token=t1&peer=' + peer
    + '&name=' + encodeURIComponent('Secret Name ' + peer) // a hostile/legacy client MAY send these;
    + '&dev=' + peer + 'devtag';                           // the relay must ignore the name regardless.
  const ws = new WebSocket(url);
  ws.rosters = []; ws.whoami = null;
  ws.addEventListener('message', (e) => {
    let m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.t === 'roster') ws.rosters.push(m);
    if (m.t === 'whoami') ws.whoami = m;
  });
  return ws;
}

(async () => {
  const sid = 'privacy-' + Math.floor(process.hrtime()[1]).toString(36);
  const a = join(sid, 'alice'); await new Promise((r) => a.addEventListener('open', r));
  const b = join(sid, 'bob');   await new Promise((r) => b.addEventListener('open', r));
  await sleep(300);

  const last = a.rosters[a.rosters.length - 1];
  const allFrames = JSON.stringify(a.rosters);
  check('roster lists both peer ids (routing needs these)', !!last && last.peers.includes('alice') && last.peers.includes('bob'), JSON.stringify(last));
  check('roster carries NO names field', !!last && last.names === undefined);
  check('no display-name string appears in ANY roster frame, despite ?name=', !/Secret Name/.test(allFrames));
  check('roster carries NO ips field', !!last && last.ips === undefined);
  check('roster still carries the opaque device tag (client-salted) for ban/vote', !!last && last.devs && last.devs.alice === 'alicedevtag');
  check('each socket privately learns its OWN address via whoami', !!(a.whoami && typeof a.whoami.ip === 'string'));

  try { a.close(); b.close(); } catch (e) {}
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
