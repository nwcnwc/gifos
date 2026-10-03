// relay-worker-contract.js — the production Worker's own door contract, run in
// Node against relay/src/relay.js through test/lib/relay-worker.js (the four
// platform objects stubbed; the Session class is the real one).
//
// Every other relay suite drives test/servers/relay-local.js, the protocol
// twin, so a defect in the Worker's own lines was invisible to the gate. What
// this pins, each in the Worker itself:
//   1. an upgrade without ?dev= closes 4012 (the documented code) and is not a
//      wedge strike — two such upgrades must never restart the room object;
//   2. a socket the object itself closes (replaced, banned, voted-off) is
//      cleaned up at once: peer-leave reaches the greeters and the door index
//      drops it without waiting for a platform close callback;
//   3. door metering follows the CLAIM: a founder that never registers is
//      frame-metered again once its mint grace lapses, a live greeter is not;
//   4. {t:'who'} is rate-limited per socket and a crowd of pulls inside one
//      second reads the attachments once, not once per pull;
//   5. a knock frame's gk is cut to the URL path's 128 chars before hashing.
import { makeRoom, fakeClock } from '../lib/relay-worker.js';

let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined && !cond ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const q = (peer, more) => Object.assign({ role: 'mesh', token: 'T', peer, dev: peer + 'd' }, more || {});
// webSocketMessage starts a knock without awaiting it (the knock hashes its
// gk first), so a frame's knock is done only when its {t:'greeters'} reply is
// out. Wait for that reply: the next upgrade must see the registration.
const knockFrame = async (room, ws, obj) => {
  const n = ws.of('greeters').length;
  await room.msg(ws, obj);
  for (let i = 0; i < 500 && ws.of('greeters').length === n; i++) await new Promise((r) => setImmediate(r));
};

(async () => {
  // ---- 1. no device tag: 4012, never a strike -------------------------------
  {
    const clock = fakeClock();
    const room = makeRoom();
    clock.tick(120000); // an object older than the 60 s wedge age gate
    const a = await room.connect('r1', { role: 'mesh', token: 'T', peer: 'nodev' });
    check('an upgrade without ?dev= does not throw', !a.err, a.err && a.err.message);
    check('...it closes the socket 4012', a.server && a.server.closed && a.server.closed.code === 4012, a.server && a.server.closed);
    check('...and is not a wedge strike', room.session.wedgeStrikes.length === 0, room.session.wedgeStrikes.length);
    const b = await room.connect('r1', { role: 'mesh', token: 'T', peer: 'nodev2' });
    check('a second dev-less upgrade does not abort the room object', !room.state.aborted && !b.err, { aborted: room.state.aborted, err: b.err && b.err.message });
    const ok = await room.connect('r1', q('fine'));
    check('a proper upgrade is still accepted afterwards', ok.server && ok.server.of('joined').length === 1, ok.server && ok.server.sent);
    clock.restore();
  }

  // ---- 2. server-side closes clean up without a platform callback -----------
  {
    const room = makeRoom();
    const g = await room.connect('r2', q('G', { gk: 'KEY' }));
    await knockFrame(room, g.server, { t: 'knock', gk: 'KEY', gblob: 'SEALED(g)' });
    const a1 = await room.connect('r2', q('A1', { dev: 'devA', rs: 'rsA' }));
    const a2 = await room.connect('r2', q('A2', { dev: 'devA', rs: 'rsA' })); // a second tab of the same device
    check('the older same-device socket is closed 4000', a1.server.closed && a1.server.closed.code === 4000, a1.server.closed);
    check('the greeter hears peer-leave for it without any platform close callback', g.server.of('peer-leave').some((m) => m.peer === 'A1'), g.server.of('peer-leave'));
    check('...and the join of its replacement', g.server.of('peer-join').some((m) => m.peer === 'A2'));
    check('the evicted socket left the device index', room.session.ix().dev.get('devA') && room.session.ix().dev.get('devA').size === 1 && !room.session.ix().dev.get('devA').has(a1.server));
    check('the evicted socket has no meter', !room.session.meters.has(a1.server));
    // A reload (same peer id) announces no departure: the id is still here.
    const a3 = await room.connect('r2', q('A2', { dev: 'devA', rs: 'rsA' }));
    check('a reload replaces its socket', a2.server.closed && a2.server.closed.code === 4000 && a3.server.of('joined').length === 1);
    check('...without a peer-leave for an id that is still present', g.server.of('peer-leave').filter((m) => m.peer === 'A2').length === 0, g.server.of('peer-leave'));
    // A vote-off (plain room): the voted device is cut and the greeters hear it.
    const v1 = await room.connect('r2', q('V1'));
    const v2 = await room.connect('r2', q('V2'));
    const t = await room.connect('r2', q('T')); // five devices in the room: three votes are a majority
    await room.msg(v1.server, { t: 'votekick', devs: ['Td'] });
    await room.msg(v2.server, { t: 'votekick', devs: ['Td'] });
    await room.msg(g.server, { t: 'votekick', devs: ['Td'] });
    check('a majority vote cuts the target 4007', t.server.closed && t.server.closed.code === 4007, t.server.closed);
    check('the greeter hears the voted-off socket leave at once', g.server.of('peer-leave').some((m) => m.peer === 'T'));
    check('the cut socket is out of the device index', !room.session.ix().dev.has('Td'));
    // The platform callback arriving later is a no-op (no second peer-leave).
    room.clientClose(t.server, 4007, 'voted-off');
    check('a late platform close for a cleaned socket announces nothing twice', g.server.of('peer-leave').filter((m) => m.peer === 'T').length === 1, g.server.of('peer-leave'));
  }

  // ---- 3. door metering follows the claim ------------------------------------
  {
    const clock = fakeClock();
    const room = makeRoom();
    const f = await room.connect('r3', q('F', { gk: 'KEY' })); // founds, never registers
    check('the founder is told founded:true', f.server.of('greeters')[0] && f.server.of('greeters')[0].founded === true);
    const burst = async (ws) => { for (let i = 0; i < 700; i++) await room.msg(ws, { t: 'peer', to: 'nobody', msg: { i } }); };
    await burst(f.server);
    check('inside the mint grace a founder is a door: no frame-rate warning', f.server.of('error').length === 0, f.server.of('error'));
    clock.tick(61000); // past MINT_GRACE_MS: the claim lapsed, the door right with it
    await burst(f.server);
    check('past the mint grace an unconverted founder is frame-metered again (warned)', f.server.of('error').length >= 1, f.server.of('error').length);
    const g = await room.connect('r3', q('G', { gk: 'KEY' })); // the room reopened: G founds and registers
    await knockFrame(room, g.server, { t: 'knock', gk: 'KEY', gblob: 'SEALED(g)' });
    await burst(g.server);
    check('a live registered greeter stays a door: no warning for a burst', g.server.of('error').length === 0, g.server.of('error'));
    clock.restore();
  }

  // ---- 4. who: per socket, and one attachment walk per second ---------------
  {
    const clock = fakeClock();
    const room = makeRoom();
    const socks = [];
    for (let i = 0; i < 40; i++) socks.push((await room.connect('r4', q('P' + i), '198.51.100.' + (i + 1))).server);
    const before = room.attReads();
    for (const ws of socks) await room.msg(ws, { t: 'who' });
    const reads = room.attReads() - before;
    check('40 pulls inside one second: every socket gets the full list', socks.every((ws) => ws.of('roster').some((r) => r.scope === 'full' && r.peers.length === 40)));
    check('...and the object walked the attachments about once, not 40 times', reads < 40 * 40, reads);
    const n0 = socks[0].of('roster').length;
    await room.msg(socks[0], { t: 'who' });
    check('a second pull from the same socket inside 5 s is ignored', socks[0].of('roster').length === n0);
    clock.tick(5100);
    await room.msg(socks[0], { t: 'who' });
    check('...and answered after 5 s', socks[0].of('roster').length === n0 + 1);
    clock.restore();
  }

  // ---- 5. a knock frame's gk is cut to 128 chars like the URL's -------------
  {
    const room = makeRoom();
    const long = 'k'.repeat(200);
    const a = await room.connect('r5', q('A'));
    await knockFrame(room, a.server, { t: 'knock', gk: long, gblob: 'SEALED(a)' });
    const b = await room.connect('r5', q('B', { gk: long.slice(0, 128) }));
    const gb = b.server.of('greeters')[0];
    check('a 200-char gk and its 128-char prefix name the same genesis', gb && gb.admitted === true && gb.founded === false, gb);
  }

  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
