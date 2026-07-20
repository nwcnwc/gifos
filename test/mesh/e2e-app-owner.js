/*
 * e2e-app-owner.js — protocol-level test for owner-authority app-state on the
 * mesh (site/js/app-owner.js). No browser, no relay: exercises the pure
 * sign/verify + op-proposal + snapshot convergence that runtime.js's
 * attachStageBus / bootClientBus adapters are built on.
 *
 *   node test/mesh/e2e-app-owner.js
 *
 * Asserts:
 *   1. owner-signed snap → client verifies + converges
 *   2. client `act` proposal → owner validates/applies → owner-signed delta →
 *      client converges (owner-ordered, host-authoritative)
 *   3. IMPOSTOR op is rejected: a frame signed by a NON-owner key never becomes
 *      canonical (the core security guarantee)
 *   4. TAMPERED owner frame (valid pk, altered body) is rejected (bad sig)
 *   5. late joiner gets the retained snap and converges without replay
 */
const AO = require('../../site/js/app-owner.js');

let failed = 0;
function ok(cond, msg) { if (cond) { console.log('  ok  - ' + msg); } else { failed++; console.log('  FAIL- ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + (JSON.stringify(a) === JSON.stringify(b) ? '' : '  (' + JSON.stringify(a) + ' != ' + JSON.stringify(b) + ')')); }

// A minimal in-memory OWNER: authoritative state + a signer + a lane broadcast.
// Mirrors the responsibilities of runtime.js becomeHost/attachStageBus without
// the store or the iframe.
async function makeOwner(sid, opts) {
  opts = opts || {};
  const signer = await AO.createSigner();
  let state = AO.emptyState();
  const vis = opts.vis || {}; // collection -> 'read-write' | 'read-only' | 'private'
  const lead = { on: !!opts.lead, keys: new Set(opts.leadKeys || []) };
  const out = [];              // frames broadcast on the lane
  let retainedSnap = null;     // the sga lane retains the latest snap for late joiners

  async function broadcastSnap() {
    const frame = await signer.sign(sid, 'snap', JSON.parse(JSON.stringify(state)));
    retainedSnap = frame; out.push({ kind: 'snap', frame });
  }
  async function broadcastDelta(body) {
    const frame = await signer.sign(sid, 'delta', body);
    out.push({ kind: 'delta', frame });
  }
  // Validate + apply a client op-proposal exactly like the host would.
  async function onAct(op) {
    const v = vis[op.collection] || 'private';
    const targetId = op.op === 'put' ? (op.value && op.value.id) : op.key;
    if (lead.on && targetId != null && lead.keys.has(op.collection + '::' + targetId)) return { rejected: 'led' };
    if (v !== 'read-write') return { rejected: 'read-only' };
    const r = AO.applyOp(state, op);
    if (r.delta) await broadcastDelta(r.delta);
    return { applied: !!r.delta };
  }
  async function localPut(collection, value) {
    const r = AO.applyOp(state, { op: 'put', collection, value });
    if (r.delta) await broadcastDelta(r.delta);
    return r.delta && Object.keys(r.delta.items)[0];
  }
  return { signer, sid, get state() { return state; }, out, get retainedSnap() { return retainedSnap; },
    broadcastSnap, onAct, localPut, pkHex: signer.pkHex };
}

// A CLIENT: verifier + local mirror, applying only owner-verified frames.
function makeClient(sid) {
  const ver = AO.makeVerifier(sid);
  let mirror = AO.emptyState();
  const rejects = [];
  async function onFrame(frame) {
    const r = await ver.verify(frame);
    if (!r.ok) { rejects.push(r.reason); return false; }
    if (r.kind === 'snap') mirror = AO.applySnap(r.body);
    else if (r.kind === 'delta') mirror = AO.applyDelta(mirror, r.body);
    return true;
  }
  return { onFrame, get mirror() { return mirror; }, rejects, get pinnedPk() { return ver.pinnedPk; } };
}

(async function run() {
  console.log('e2e-app-owner: owner-authority app-state on the mesh');

  const sid = 'demo.app'; // healing-style sid (opaque tail) → TOFU pin
  const owner = await makeOwner(sid, { vis: { notes: 'read-write', banner: 'read-only' } });
  const client = makeClient(sid);

  // 1. owner-signed snap → client converges
  await owner.localPut('notes', { id: 'n1', text: 'hello' });
  await owner.broadcastSnap();
  for (const f of owner.out) await client.onFrame(f.frame);
  eq(client.mirror.collections.notes.items.n1, { id: 'n1', text: 'hello' }, 'client converges to owner snap');
  ok(client.pinnedPk === owner.pkHex, 'client pinned the owner public key');
  owner.out.length = 0;

  // 2. client act proposal → owner applies → owner-signed delta → client converges
  const res = await owner.onAct({ op: 'put', collection: 'notes', value: { id: 'n2', text: 'from client' } });
  ok(res.applied, 'owner applied a valid client act');
  for (const f of owner.out) await client.onFrame(f.frame);
  eq(client.mirror.collections.notes.items.n2, { id: 'n2', text: 'from client' }, 'client converges after its own act is owner-signed back');
  owner.out.length = 0;

  // 2b. act on a read-only collection is refused by the owner (host-authoritative)
  const ro = await owner.onAct({ op: 'put', collection: 'banner', value: { id: 'b1', text: 'spoof' } });
  ok(ro.rejected === 'read-only', 'owner refuses a client write to a read-only collection');
  ok(owner.state.collections.banner === undefined || !owner.state.collections.banner.items.b1, 'refused write never hit authoritative state');

  // 3. IMPOSTOR: a different key signs a frame on the same sid → client rejects
  const impostor = await AO.createSigner();
  const evil = await impostor.sign(sid, 'delta', { collection: 'notes', items: { n1: { id: 'n1', text: 'POISONED' } } });
  const accepted = await client.onFrame(evil);
  ok(!accepted, 'client rejects a frame signed by a non-owner key');
  eq(client.mirror.collections.notes.items.n1, { id: 'n1', text: 'hello' }, 'impostor could NOT corrupt state');
  ok(client.rejects.includes('not-owner'), 'rejection reason is not-owner');

  // 4. TAMPERED owner frame: take a real owner frame and mutate the body
  await owner.localPut('notes', { id: 'n3', text: 'real' });
  const good = owner.out[owner.out.length - 1].frame;
  const tampered = JSON.parse(JSON.stringify(good));
  tampered.p.body.items.n3.text = 'tampered';
  const acc2 = await client.onFrame(tampered);
  ok(!acc2, 'client rejects a tampered owner frame (bad signature)');
  ok(client.rejects.includes('bad-sig'), 'rejection reason is bad-sig');
  // and the untampered original still applies
  await client.onFrame(good);
  eq(client.mirror.collections.notes.items.n3, { id: 'n3', text: 'real' }, 'untampered owner frame applies');
  owner.out.length = 0;

  // 5. LATE JOINER gets the retained snap and converges with no replay
  await owner.broadcastSnap();
  const late = makeClient(sid);
  await late.onFrame(owner.retainedSnap); // the sga lane replays the retained snap on subscribe
  eq(late.mirror.collections.notes.items.n2, { id: 'n2', text: 'from client' }, 'late joiner converges from the retained snapshot');
  ok(late.mirror.collections.notes.items.n3.text === 'real', 'late joiner has the full state');

  // 6. sid-BOUND owner link: the first frame must match the pubkey the sid commits to
  const boundSigner = await AO.createSigner();
  const tail = (await AO.sha256hex(Buffer.from(boundSigner.pkHex.match(/../g).map((h) => parseInt(h, 16))))).slice(0, 24);
  const boundSid = 'game.' + tail;
  const boundClient = makeClient(boundSid);
  const wrongFirst = await impostor.sign(boundSid, 'snap', AO.emptyState());
  ok(!(await boundClient.onFrame(wrongFirst)), 'sid-bound link rejects an impostor even on the FIRST frame');
  ok(boundClient.rejects.includes('pk-not-bound'), 'first-frame rejection reason is pk-not-bound');
  // (a genuine frame from the committed key would pass — construct it with the real signer)
  // Rebuild a signer whose pk hashes to the tail: we already have boundSigner; sign with it.
  const realFirst = await boundSigner.sign(boundSid, 'snap', AO.emptyState());
  ok(await boundClient.onFrame(realFirst), 'sid-bound link accepts the committed owner key on the first frame');

  console.log(failed ? ('\nFAILED: ' + failed + ' assertion(s)') : '\nALL PASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
