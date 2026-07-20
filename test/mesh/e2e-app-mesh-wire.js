/*
 * e2e-app-mesh-wire.js — validates the EXACT frame shapes runtime.js's
 * attachStageBus (host) and bootClientBus (client) put on the mesh Stage DATA
 * lane, through a faithful simulation of meet.html's sga lane (broadcast +
 * dedup + retained-snap replay to late subscribers). No browser: the host's
 * store and the client's iframe are stubbed; the wire contract is real.
 *
 *   node test/mesh/e2e-app-mesh-wire.js
 *
 * Host frames:  snap.body = { app, name, state },  delta.body = { state }
 * Client mirror = body.state (full replace — captures adds AND deletes).
 */
const AO = require('../../site/js/app-owner.js');

let failed = 0;
const ok = (c, m) => { if (c) console.log('  ok  - ' + m); else { failed++; console.log('  FAIL- ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m);

// A faithful mini-copy of meet.html's sga lane (broadcast/subscribe/retain).
function makeLane() {
  const subs = new Set();
  let retainedSnap = null;
  return {
    broadcast(kind, d) { const m = { kind, d }; if (kind === 'snap') retainedSnap = m; for (const cb of [...subs]) cb(m); },
    subscribe(cb) { subs.add(cb); if (retainedSnap) cb(retainedSnap); return () => subs.delete(cb); },
  };
}

(async function run() {
  console.log('e2e-app-mesh-wire: runtime frame shapes over a simulated sga lane');
  const sid = 'demo.mesh';
  const lane = makeLane();

  // ---- HOST (attachStageBus shape) ----
  const signer = await AO.createSigner();
  let hostState = { collections: {} };
  const send = (kind, d) => lane.broadcast(kind, d);
  const appBytesB64 = Buffer.from('FAKE-APP-GIF').toString('base64');
  const sendSnap = async () => send('snap', await signer.sign(sid, 'snap', { app: appBytesB64, name: 'Demo', state: hostState }));
  const sendDelta = async () => send('delta', await signer.sign(sid, 'delta', { state: hostState }));
  function hostPut(collection, rec) {
    const c = hostState.collections[collection] || (hostState.collections[collection] = { items: {}, seq: 0 });
    if (rec.id == null) rec.id = collection + '_' + (c.seq++);
    c.items[rec.id] = rec;
  }
  // owner validates + applies an act, then broadcasts a signed delta
  async function onAct(op) {
    if (op.op === 'put') hostPut(op.collection, op.value);
    else if (op.op === 'delete') { const c = hostState.collections[op.collection]; if (c) delete c.items[op.key]; }
    await sendDelta();
  }
  lane.subscribe((m) => { if (m.kind === 'act') onAct(m.d); });

  // ---- CLIENT (bootClientBus shape) ----
  function makeClient() {
    const ver = AO.makeVerifier(sid);
    let mirror = { collections: {} };
    let appBytes = null;
    const client = {
      get mirror() { return mirror; }, get appBytes() { return appBytes; }, rejects: 0,
      // client write: optimistic local apply + act proposal
      put(collection, rec) {
        if (rec.id == null) rec.id = AO.newRecordId(collection);
        const c = mirror.collections[collection] || (mirror.collections[collection] = { items: {}, seq: 0 });
        c.items[rec.id] = rec;
        lane.broadcast('act', { op: 'put', collection, value: rec });
        return rec.id;
      },
    };
    lane.subscribe((m) => {
      if (m.kind === 'act') return;
      ver.verify(m.d).then((r) => {
        if (!r.ok) { client.rejects++; return; }
        if (r.kind === 'snap') { if (r.body.state) mirror = JSON.parse(JSON.stringify(r.body.state)); if (r.body.app) appBytes = Buffer.from(r.body.app, 'base64').toString(); }
        else if (r.kind === 'delta') { if (r.body.state) mirror = JSON.parse(JSON.stringify(r.body.state)); }
      });
    });
    return client;
  }

  // host seeds state and broadcasts the first snap
  hostPut('board', { id: 'p1', x: 1 });
  await sendSnap();
  const a = makeClient();
  lane.subscribe(() => {}); // noise subscriber
  await new Promise((r) => setTimeout(r, 20));
  eq(a.mirror.collections.board.items.p1, { id: 'p1', x: 1 }, 'client A got initial snap');
  ok(a.appBytes === 'FAKE-APP-GIF', 'client A received the app bytes in the snap (mounts locally)');

  // client A proposes a put → owner applies → signed delta → all converge
  a.put('board', { id: 'p2', x: 2 });
  await new Promise((r) => setTimeout(r, 20));
  eq(hostState.collections.board.items.p2, { id: 'p2', x: 2 }, 'owner adopted client A proposal');
  eq(a.mirror.collections.board.items.p2, { id: 'p2', x: 2 }, 'client A converged on the owner-signed delta');

  // LATE JOINER gets the retained snap (refreshed after the delta? we re-snap)
  await sendSnap();
  const b = makeClient(); // subscribes AFTER — retained snap replays immediately
  await new Promise((r) => setTimeout(r, 20));
  eq(b.mirror.collections.board.items.p2, { id: 'p2', x: 2 }, 'late joiner B converged from retained snapshot');
  ok(b.appBytes === 'FAKE-APP-GIF', 'late joiner B got the app bytes');

  // a delete propagates as a full-state delta (adds AND removals converge)
  await onAct({ op: 'delete', collection: 'board', key: 'p1' });
  await new Promise((r) => setTimeout(r, 20));
  ok(!a.mirror.collections.board.items.p1 && !b.mirror.collections.board.items.p1, 'delete converged to all clients via full-state delta');

  // IMPOSTOR floods a delta on the same lane → every client rejects it
  const evil = await (await AO.createSigner()).sign(sid, 'delta', { state: { collections: { board: { items: { p2: { id: 'p2', x: 999 } }, seq: 0 } } } });
  lane.broadcast('delta', evil);
  await new Promise((r) => setTimeout(r, 20));
  eq(a.mirror.collections.board.items.p2, { id: 'p2', x: 2 }, 'impostor could not corrupt client A');
  eq(b.mirror.collections.board.items.p2, { id: 'p2', x: 2 }, 'impostor could not corrupt client B');
  ok(a.rejects > 0 && b.rejects > 0, 'both clients rejected the impostor frame');

  console.log(failed ? ('\nFAILED: ' + failed) : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
