// mu-relay-scale.js — relay scale bugs that stayed after the door contract.
//
// The production Session, in Node, through test/lib/relay-worker.js.
// There is no per-address cap (test/relay/relay-shared-address.js). What this pins:
//   1. a knock whose attachment will not fit is not admitted and not indexed;
//   2. frame strikes reset once the frame bucket refills, and three bursts
//      without that refill still close 1013;
//   3. a door roster built after GREETER_TTL does not name the lapsed blob,
//      and the claim grace still holds the room;
//   4. many sockets from one address all join, and a join does not walk
//      every socket (the old per-address recount did, at the cap);
//   5. a lapsed greeter's close still re-sends the door list (its blob, not
//      its live TTL, is what put it on the non-greeters' lists);
//   6. test/servers/relay-local.js applies the same rules: a lapsed blob is
//      off the door roster, its close re-sends the door list, strikes reset
//      on a full frame bucket, and an overflow reply carries no `admitted`.
import { makeRoom, fakeClock } from '../lib/relay-worker.js';
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    // The client's R3a arm counts admitted:false as a genesis-key mismatch and
    // requeues after three; an honest greeter with a full attachment must not
    // be read as sealed out, so the overflow reply gives no verdict.
    check('overflow answers with no admitted verdict', bad && !('admitted' in bad) && bad.founded === false && bad.error === 'registration too large', bad);
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

      // ---- 5. the lapsed greeter closes: N's door list still names it -------
      const before = n.server.of('roster').filter((m) => m.scope === 'door').length;
      room.clientClose(g.server);
      const doors = n.server.of('roster').filter((m) => m.scope === 'door');
      check('a lapsed greeter closing re-sends the door list', doors.length === before + 1 && doors.at(-1).peers.indexOf('G') < 0, doors.map((m) => m.peers));
    } finally { clock.restore(); }
  }

  // ---- 4. one address, many sockets, no scan per join ----------------------
  {
    const clock = fakeClock();
    try {
      const ip = '203.0.113.50';
      const room = makeRoom();
      const up = [];
      for (let i = 0; i < 9; i++) up.push(await room.connect('cap', q('P' + i), ip));
      check('nine sockets from one address join', up.every((c) => c.server && c.server.of('joined').length === 1 && !c.server.closed));
      let scans = 0;
      const orig = room.state.getWebSockets.bind(room.state);
      room.state.getWebSockets = () => { scans++; return orig(); };
      let joined = 0;
      for (let i = 0; i < 50; i++) {
        const c = await room.connect('cap', q('X' + i), ip);
        if (c.server && c.server.of('joined').length === 1 && !c.server.closed) joined++;
      }
      check('fifty more from the same address join', joined === 50, joined);
      check('those joins do not walk every socket', scans === 0, scans);
    } finally { clock.restore(); }
  }

  // ---- 6. relay-local.js mirrors the Worker -------------------------------
  {
    const src = fs.readFileSync(path.join(ROOT, 'test/servers/relay-local.js'), 'utf8');
    check('relay-local resets strikes when the frame bucket is full', /if \(meter\.frames >= FRAME_BURST\) meter\.strikes = 0;/.test(src));
    const over = (src.match(/if \(!attFits\(attOf\(c\), 'knock'\)\)[\s\S]*?\n {4}\}/) || [''])[0];
    const reply = (over.match(/c\.send\([^\n]*\);/) || [''])[0];
    check('relay-local answers an overflow with an error and no admitted', /error: 'registration too large'/.test(reply) && !/admitted/.test(reply) && /return;/.test(over), over);

    const port = await new Promise((res) => { const sv = net.createServer(); sv.listen(0, '127.0.0.1', () => { const p = sv.address().port; sv.close(() => res(p)); }); });
    const env = Object.assign({}, process.env, { RELAY_PORT: String(port), RELAY_HOST: '127.0.0.1',
      RELAY_GREETER_TTL_MS: '600', RELAY_CLAIM_GRACE_MS: '60000', RELAY_MINT_GRACE_MS: '60000' });
    delete env.RELAY_DEBUG;
    const relay = spawn(process.execPath, [path.join(ROOT, 'test/servers/relay-local.js')], { env, stdio: ['ignore', 'ignore', 'ignore'] });
    const open = (peer) => {
      const ws = new WebSocket('ws://127.0.0.1:' + port + '/s/lapse?role=mesh&token=T&peer=' + peer + '&dev=' + peer + 'd&gk=KEY');
      ws.msgs = [];
      ws.addEventListener('message', (e) => { try { ws.msgs.push(JSON.parse(e.data)); } catch (_) {} });
      ws.ready = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', rej); });
      ws.doors = () => ws.msgs.filter((m) => m.t === 'roster' && m.scope === 'door');
      return ws;
    };
    try {
      let g = null;
      for (let i = 0; i < 40 && !g; i++) { await sleep(50); const w = open('G'); try { await w.ready; g = w; } catch (_) {} }
      check('relay-local listens', !!g);
      if (g) {
        g.send(JSON.stringify({ t: 'knock', gk: 'KEY', gblob: 'SEALED(g)' })); await sleep(150);
        const n = open('N'); await n.ready; await sleep(150);
        check('relay-local: a live greeter is on the door roster', n.doors().length && n.doors().at(-1).peers.indexOf('G') >= 0, n.doors());
        await sleep(700);
        const n2 = open('N2'); await n2.ready; await sleep(150);
        check('relay-local: after the TTL the door roster omits the lapsed greeter', n2.doors().length && n2.doors().at(-1).peers.indexOf('G') < 0, n2.doors());
        const before = n.doors().length;
        g.close(); await sleep(250);
        check('relay-local: a lapsed greeter closing re-sends the door list', n.doors().length === before + 1 && n.doors().at(-1).peers.indexOf('G') < 0, n.doors());
        n.close(); n2.close();
      }
    } finally { relay.kill('SIGKILL'); }
  }

  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
