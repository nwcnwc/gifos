// mu-relay-scale.js — relay scale bugs that stayed after the door contract.
//
// The production Session, in Node, through test/lib/relay-worker.js.
// MAX_SOCKETS_PER_IP stays 8. What this pins:
//   1. a knock whose attachment will not fit is not admitted and not indexed;
//   2. frame strikes reset once the frame bucket refills, and three bursts
//      without that refill still close 1013;
//   3. a door roster built after GREETER_TTL does not name the lapsed blob,
//      and the claim grace still holds the room;
//   4. an address already at the socket cap is recounted once, not on every
//      retry, and a stale high count still loses to a real free slot.
import { makeRoom, fakeClock } from '../lib/relay-worker.js';

let fails = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined && !cond ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) fails++;
};
const q = (peer, more) => Object.assign({ role: 'mesh', token: 'T', peer, dev: peer + 'd' }, more || {});

(async () => {
  // ---- 1. an attachment that will not fit is not a door -------------------
  {
    const room = makeRoom();
    const f = await room.connect('fit', q('F', { gk: 'KEY' }));
    await room.session.knock(f.server, 'KEY', 'SEALED(f)');
    const ok = f.server.of('greeters').at(-1);
    check('a small registration is admitted', ok && ok.admitted === true && ok.founded === false && !ok.error, ok);

    const j = await room.connect('fit', q('J', { gk: 'KEY' }));
    const a = room.session.att(j.server);
    a.ban = Array.from({ length: 20 }, (_, i) => ({ d: String(i).padStart(16, '0') }));
    a.votes = Array.from({ length: 24 }, (_, i) => String(i).padStart(16, 'b'));
    const bare = JSON.stringify(a).length;
    check('the pre-blob attachment fits in 2 KB', bare <= 2048, bare);
    j.server.serializeAttachment(a);
    const preview = JSON.stringify(Object.assign({}, a, { gblob: 'B'.repeat(1024), gexp: 1 }));
    check('adding the blob crosses 2 KB', preview.length > 2048, preview.length);
    await room.session.knock(j.server, 'KEY', 'B'.repeat(1024));
    const bad = j.server.of('greeters').at(-1);
    check('overflow answers admitted:false', bad && bad.admitted === false && bad.founded === false && bad.error === 'registration too large', bad);
    check('the blob was not stored', !room.session.att(j.server).gblob);
    check('the socket is not a greeter', room.session.isGreeter(room.session.att(j.server)) === false);
    check('the socket stays open', !j.server.closed);
    const n = await room.connect('fit', q('N', { gk: 'KEY' }));
    const list = (n.server.of('greeters')[0] || {}).list || [];
    check('a newcomer is not handed the refused blob', list.indexOf('B'.repeat(1024)) < 0 && list.indexOf('SEALED(f)') >= 0, list);
  }

  // ---- 2. strikes reset when the frame bucket refills ----------------------
  {
    const clock = fakeClock();
    try {
      const burst = async (room, ws) => {
        // Stop once the socket is cut. cleanup() drops the meter, and further
        // frames would open a fresh one on an already-closed socket.
        for (let i = 0; i < 650 && !ws.closed; i++) await room.msg(ws, { t: 'tick', n: i });
      };
      const room = makeRoom();
      await room.connect('rate', q('F', { gk: 'KEY' }));
      const j = await room.connect('rate', q('J'));
      await burst(room, j.server);
      clock.tick(1000);
      await room.msg(j.server, { t: 'tick', n: -1 });
      await burst(room, j.server);
      clock.tick(1000);
      await room.msg(j.server, { t: 'tick', n: -1 });
      await burst(room, j.server);
      check('three bursts without a refill close 1013', j.server.closed && j.server.closed.code === 1013, j.server.closed);
      check('each burst warned once', j.server.of('error').length === 3, j.server.of('error').length);

      const room2 = makeRoom();
      await room2.connect('rate2', q('F', { gk: 'KEY' }));
      const k = await room2.connect('rate2', q('K'));
      for (let n = 0; n < 3; n++) {
        await burst(room2, k.server);
        clock.tick(201000);
        await room2.msg(k.server, { t: 'tick', n: -1 });
      }
      check('three bursts with a full refill between them do not close', !k.server.closed, k.server.closed);
      check('...and each one still warned', k.server.of('error').length === 3, k.server.of('error').length);
    } finally { clock.restore(); }
  }

  // ---- 3. a lapsed registration is not a door on the roster ----------------
  {
    const clock = fakeClock();
    try {
      const room = makeRoom();
      const g = await room.connect('door', q('G', { gk: 'KEY' }));
      await room.session.knock(g.server, 'KEY', 'SEALED(g)');
      const n = await room.connect('door', q('N', { gk: 'KEY' }));
      const live = n.server.of('roster').find((m) => m.scope === 'door');
      check('a live greeter is on the door roster', live && live.peers.indexOf('G') >= 0, live && live.peers);
      clock.tick(250001);
      const n2 = await room.connect('door', q('N2', { gk: 'KEY' }));
      const late = n2.server.of('roster').find((m) => m.scope === 'door');
      const gg = n2.server.of('greeters')[0];
      check('after the TTL the door roster omits the lapsed greeter', late && late.peers.indexOf('G') < 0, late && late.peers);
      check('the sealed list omits the lapsed blob', gg && gg.list.length === 0, gg && gg.list);
      check('the claim grace still holds the room', gg && gg.founded === false && gg.admitted === true, gg);
      check('the lapsed socket is still open', !g.server.closed);
    } finally { clock.restore(); }
  }

  // ---- 4. at-cap recount is not once per retry ------------------------------
  {
    const clock = fakeClock();
    try {
      const ip = '203.0.113.50';
      const room = makeRoom();
      const up = [];
      for (let i = 0; i < 8; i++) up.push(await room.connect('cap', q('P' + i), ip));
      check('eight sockets from one address join', up.every((c) => c.server && c.server.of('joined').length === 1 && !c.server.closed));
      const ninth = await room.connect('cap', q('P8'), ip);
      check('the ninth is refused 1013', ninth.server && ninth.server.closed && ninth.server.closed.code === 1013, ninth.server && ninth.server.closed);
      check('the refusal names the network cap', ninth.server.of('error').some((m) => m.error === 'too many connections from your network'));
      let scans = 0;
      const orig = room.state.getWebSockets.bind(room.state);
      room.state.getWebSockets = () => { scans++; return orig(); };
      let refused = 0;
      for (let i = 0; i < 50; i++) {
        const c = await room.connect('cap', q('X' + i), ip);
        if (c.server && c.server.closed && c.server.closed.code === 1013) refused++;
      }
      check('fifty further retries are refused', refused === 50, refused);
      check('those retries do not walk every socket', scans === 0, scans);

      const room2 = makeRoom();
      const held = [];
      for (let i = 0; i < 8; i++) held.push(await room2.connect('cap2', q('H' + i), ip));
      room2.clientClose(held[7].server);
      const iph = room2.session.att(held[0].server).iph;
      room2.session.ix().iph.set(iph, 8);
      const back = await room2.connect('cap2', q('BACK'), ip);
      check('a stale cap is recounted and the free slot is taken', back.server && back.server.of('joined').length === 1 && !back.server.closed, back.server && back.server.closed);
    } finally { clock.restore(); }
  }

  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
