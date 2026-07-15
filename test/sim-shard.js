/*
 * sim-shard.js — a worker owning a LOCALITY shard for the parallel simulator.
 * Seats are grouped by their SECTION (top-level subtree), so a seat's dense
 * chatter — phone-home, row sync, in-section heal — stays IN this thread (a
 * free shared-memory push), and only the rarer cross-section messages get
 * copied across threads. A seat that moves to another section MIGRATES: its
 * whole state (toState) is shipped to that section's worker.
 */
'use strict';
const { parentPort, workerData } = require('worker_threads');
const core = require('./mesh-core.js');
const key = core.key;
const W = workerData.W, ME = workerData.me;
const sectionShard = (path) => (path === '' ? 0 : (path.charCodeAt(0) - 47)) % W;

const seats = new Map();
const lastCode = new Map();
const touchedSet = new Set();

parentPort.on('message', (m) => {
  if (m.t === 'tick') {
    core.setTick(m.T);
    const touched = touchedSet;
    if (m.admit) for (const st of m.admit) { const s = core.fromState(st); seats.set(s.id, s); touched.add(s.id); }
    if (m.spawn) for (const [id, evil] of m.spawn) { const s = core.makeSeat(id, evil); seats.set(id, s); s.join(); touched.add(id); }
    if (m.kill) for (const id of m.kill) { const s = seats.get(id); if (s) { s.leave(); seats.delete(id); touched.add(id); } }
    if (m.inbox) for (const e of m.inbox) { const s = seats.get(e.to); if (s) { s.recv(e.msg); touched.add(e.to); } }
    if (m.active) for (const id of m.active) { const s = seats.get(id); if (s) { s.tick(); touched.add(id); } }
    const d = core.drain();
    const migrate = [];
    const changes = [];
    for (const id of touched) {
      const s = seats.get(id);
      if (!s) { if (lastCode.has(id)) { changes.push([id, 0]); lastCode.delete(id); } continue; }
      if (s.coord && sectionShard(s.coord.path) !== ME) { migrate.push({ id, tgt: sectionShard(s.coord.path), state: s.toState() }); seats.delete(id); if (lastCode.has(id)) { changes.push([id, 0]); lastCode.delete(id); } continue; }
      const code = (s.state === 'seated' ? 2 : 0) | (s.coord && s.coord.path === '' ? 1 : 0);
      if (lastCode.get(id) !== code) { lastCode.set(id, code); changes.push([id, code]); }
    }
    touched.clear();
    parentPort.postMessage({ t: 'done', T: m.T, msg: d.msg, fab: d.fab, wake: d.wake, migrate, status: changes, moves: core.moves(), evictions: core.evictions() });
  } else if (m.t === 'setHealing') {
    core.setHealing(m.h);
  }
});
parentPort.postMessage({ t: 'ready', me: ME });
