// Vote-off-the-island — the RELAY side of the open-room civility model
// (docs/meeting.md "The door", docs/threat-model.md Boundary E). Pins:
//   * a live MAJORITY of the room's devices (min 2) boots the target (4007)
//     and announces it as a ban "by the room (vote)";
//   * ONE vote alone never kicks (no single-grudge gatekeeping);
//   * STANDING votes gate the door — the booted device is refused on re-knock
//     while the voters remain, and re-admitted once votes are withdrawn;
//   * ADMIN rooms never vote-kick — the relay ignores votekick when the sid
//     carries a verifier (exclusion there is the admin's signed ban).
// Runs against relay-local.js, which mirrors the Worker (relay/src/relay.js).
const { spawn } = require('child_process');
const path = require('path');
const PORT = 8894;
let fail = 0; const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A mesh occupant: connects, records every frame + close, exposes send().
function occupant(sid, peer, dev) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/s/' + sid + '?role=mesh&peer=' + peer + '&token=t' + (dev ? '&dev=' + dev : ''));
  const o = { ws, frames: [], closed: null, joined: false, err: null };
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      o.frames.push(m);
      if (m.t === 'joined') o.joined = true;
      if (m.t === 'error') o.err = m.error;
    } catch (_) {}
  };
  ws.onclose = (e) => { o.closed = { code: e.code, reason: e.reason }; };
  ws.onerror = () => {};
  o.send = (obj) => { try { ws.send(JSON.stringify(obj)); } catch (e) {} };
  o.close = () => { try { ws.close(); } catch (e) {} };
  return o;
}
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 3000)) { if (fn()) return true; await sleep(50); } return fn(); };

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], { env: { ...process.env, RELAY_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(400);
  try {
    // ---- plain room: majority boots, one vote doesn't --------------------------
    const room = 'voteroom-' + Math.random().toString(36).slice(2, 8);
    const A = occupant(room, 'pA', 'devA');
    const B = occupant(room, 'pB', 'devB');
    const C = occupant(room, 'pC', 'devC');
    await until(() => A.joined && B.joined && C.joined);
    check('three devices join the plain room', A.joined && B.joined && C.joined);

    // ONE vote: tally broadcasts, nobody is booted (need = max(2, majority))
    A.send({ t: 'votekick', devs: ['devC'] });
    await until(() => A.frames.some((f) => f.t === 'votes' && f.tally && f.tally.devC === 1));
    const v1 = A.frames.filter((f) => f.t === 'votes').pop();
    check('a single vote is tallied (1 against devC) and broadcast', !!v1 && v1.tally.devC === 1 && v1.need >= 2);
    await sleep(300);
    check('ONE vote alone never kicks', !C.closed);

    // MAJORITY (2 of 3 devices): devC is booted with 4007 + a vote-ban notice
    B.send({ t: 'votekick', devs: ['devC'] });
    await until(() => !!C.closed, 4000);
    check('a majority (2/3) boots the target (close 4007 voted-off)', !!C.closed && C.closed.code === 4007);
    check('the boot is announced as a ban by "the room (vote)"',
      A.frames.some((f) => f.t === 'ban' && f.dev === 'devC' && f.by === 'the room (vote)'));

    // ---- standing votes gate the door -----------------------------------------
    const C2 = occupant(room, 'pC2', 'devC');
    await until(() => C2.err !== null || C2.joined, 3000);
    check('the voted-off device is REFUSED at the door while votes stand',
      /voted-off/.test(C2.err || '') && !C2.joined);
    await until(() => !!C2.closed, 2000);

    // withdrawal: A empties their vote list — the standing majority is gone
    A.send({ t: 'votekick', devs: [] });
    await sleep(400);
    const C3 = occupant(room, 'pC3', 'devC');
    await until(() => C3.joined || C3.err !== null, 3000);
    check('after a voter withdraws, the device is admitted again', C3.joined && !C3.err);

    A.close(); B.close(); C3.close();

    // ---- self-votes don't count ------------------------------------------------
    const r2 = 'voteself-' + Math.random().toString(36).slice(2, 8);
    const D = occupant(r2, 'pD', 'devD');
    const E = occupant(r2, 'pE', 'devE');
    await until(() => D.joined && E.joined);
    D.send({ t: 'votekick', devs: ['devD', 'devE'] }); // includes a self-vote
    await sleep(400);
    check('a self-vote is discarded (devD not in the tally)',
      !D.frames.some((f) => f.t === 'votes' && f.tally && f.tally.devD));
    check('two occupants: one vote is below the min-2 threshold — no boot', !E.closed);
    D.close(); E.close();

    // ---- admin rooms never vote-kick ------------------------------------------
    const admSid = 'vadm-' + Math.random().toString(36).slice(2, 8) + '.' + 'ab'.repeat(12); // any 24-hex verifier
    const F = occupant(admSid, 'pF', 'devF');
    const G = occupant(admSid, 'pG', 'devG');
    const H = occupant(admSid, 'pH', 'devH');
    await until(() => F.joined && G.joined && H.joined);
    F.send({ t: 'votekick', devs: ['devH'] });
    G.send({ t: 'votekick', devs: ['devH'] });
    await sleep(600);
    check('an ADMIN room ignores votekick (no boot even with a majority)', !H.closed);
    check('an ADMIN room broadcasts no vote tally', !F.frames.some((f) => f.t === 'votes'));
    F.close(); G.close(); H.close();
  } finally { relay.kill(); }
  console.log(fail ? ('\n' + fail + ' failed') : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
})();
