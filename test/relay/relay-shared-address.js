// relay-shared-address.js — MANY PEOPLE BEHIND ONE ADDRESS ALL GET IN.
//
// An office, a campus or a carrier NAT puts hundreds of people behind one
// public address. The relay used to cap each address: 8 sockets per room,
// 120 joins a minute per room, and 300 upgrades a minute at the edge. Those
// caps could not stop an attacker, who simply uses more addresses, and they
// locked out a whole organisation that shares one. The owner removed them
// (3 Oct 2026). What bounds cost now is per CONNECTION: the byte meter, the
// frame meter, and the {t:'who'} pull interval.
//
// What this pins, each in the production Worker (relay/src/relay.js, through
// test/lib/relay-worker.js) AND in its twin test/servers/relay-local.js under
// RELAY_PROD=1 (production guards on):
//   1. 50 sockets from one address join one room, and all 50 stay open;
//   2. a burst of 1000 joins from one address into one room is not refused;
//   3. the Worker's edge entry passes 1000 upgrades from one address (no 429);
//   4. the per-connection guards are still there: a tiny-frame flood is
//      warned and then cut 1013.
//
// Run: node test/relay/relay-shared-address.js
import { makeRoom, fakeClock } from '../lib/relay-worker.js';
import relay from '../../relay/src/relay.js';
import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined && !cond ? '  ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const q = (peer, more) => Object.assign({ role: 'mesh', token: 'T', peer, dev: peer + 'd' }, more || {});
const IP = '198.51.100.77';

(async () => {
  // ---- Worker 1. fifty sockets from one address, one room ------------------
  {
    const room = makeRoom();
    await room.connect('office', q('G', { gk: 'KEY' }), IP);
    const socks = [];
    for (let i = 0; i < 50; i++) socks.push(await room.connect('office', q('P' + i), IP));
    const joined = socks.filter((c) => c.server && c.server.of('joined').length === 1 && !c.server.closed).length;
    const refused = socks.filter((c) => c.server && c.server.closed).map((c) => c.server.closed);
    check('Worker: 50 sockets from one address all join one room', joined === 50, { joined, refused: refused.slice(0, 3) });
  }

  // ---- Worker 2. a 1000-join burst from one address -------------------------
  {
    const clock = fakeClock(); // the whole burst lands inside one minute
    try {
      const room = makeRoom();
      await room.connect('burst', q('G', { gk: 'KEY' }), IP);
      let joined = 0; const refused = [];
      for (let i = 0; i < 1000; i++) {
        const c = await room.connect('burst', q('B' + i), IP);
        if (c.server && c.server.of('joined').length === 1 && !c.server.closed) joined++;
        else refused.push(c.err ? String(c.err.message) : c.server && c.server.closed);
        // Half of them leave again at once: a burst of flapping phones.
        if (i % 2 && c.server && !c.server.closed) room.clientClose(c.server);
        clock.tick(10);
      }
      check('Worker: a 1000-join burst from one address is not refused', joined === 1000, { joined, refused: refused.slice(0, 3) });
    } finally { clock.restore(); }
  }

  // ---- Worker 3. the edge entry passes 1000 upgrades from one address -------
  {
    const env = { SESSION: { idFromName() { return 'id'; }, get() { return { fetch() { return new Response('ok', { status: 200 }); } }; } } };
    const codes = {};
    for (let i = 0; i < 1000; i++) {
      const res = await relay.fetch({ url: 'https://relay.test/s/edge-room', headers: new Map([['CF-Connecting-IP', IP]]) }, env);
      codes[res.status] = (codes[res.status] || 0) + 1;
    }
    check('Worker edge: 1000 upgrades from one address all reach the room (no 429)', codes[200] === 1000, codes);
  }

  // ---- Worker 4. the per-connection frame guard still cuts a flood ---------
  {
    const clock = fakeClock();
    try {
      const room = makeRoom();
      await room.connect('flood', q('G', { gk: 'KEY' }), IP);
      const f = await room.connect('flood', q('F'), IP);
      // Three 650-frame bursts, one second apart: the frame bucket never
      // refills, so the third overrun cuts the socket (FRAME_STRIKES).
      for (let n = 0; n < 3 && !f.server.closed; n++) {
        for (let i = 0; i < 650 && !f.server.closed; i++) await room.msg(f.server, { t: 'tick', n: i });
        clock.tick(1000);
        if (!f.server.closed) await room.msg(f.server, { t: 'tick', n: -1 });
      }
      check('Worker: a tiny-frame flood is still warned and cut 1013', f.server.of('error').length >= 1 && f.server.closed && f.server.closed.code === 1013, f.server.closed);
    } finally { clock.restore(); }
  }

  // ---- relay-local.js under RELAY_PROD=1 mirrors the Worker -----------------
  {
    const port = await new Promise((res) => { const sv = net.createServer(); sv.listen(0, '127.0.0.1', () => { const p = sv.address().port; sv.close(() => res(p)); }); });
    const env = Object.assign({}, process.env, { RELAY_PORT: String(port), RELAY_HOST: '127.0.0.1', RELAY_PROD: '1' });
    delete env.RELAY_DEBUG; delete env.TRUSTED_IPS;
    const child = spawn(process.execPath, [path.join(ROOT, 'test/servers/relay-local.js')], { env, stdio: ['ignore', 'ignore', 'inherit'] });
    const open = (sid, peer) => {
      const ws = new WebSocket('ws://127.0.0.1:' + port + '/s/' + sid + '?role=mesh&token=T&peer=' + peer + '&dev=' + peer + 'd&gk=KEY');
      ws.msgs = []; ws.closedCode = null;
      ws.addEventListener('message', (e) => { try { ws.msgs.push(JSON.parse(e.data)); } catch (_) {} });
      ws.addEventListener('close', (e) => { ws.closedCode = e.code; });
      ws.ready = new Promise((res, rej) => { ws.addEventListener('open', () => res()); ws.addEventListener('error', rej); });
      ws.joined = () => ws.msgs.some((m) => m.t === 'joined');
      ws.refused = () => ws.msgs.some((m) => m.t === 'error');
      return ws;
    };
    const settle = async (ws) => { for (let i = 0; i < 100 && !ws.joined() && !ws.refused() && ws.closedCode === null; i++) await sleep(10); };
    try {
      let up = false;
      for (let i = 0; i < 40 && !up; i++) { await sleep(50); const w = open('probe', 'probe' + i); try { await w.ready; up = true; w.close(); } catch (_) {} }
      check('relay-local (RELAY_PROD=1) listens', up);
      if (up) {
        const fifty = [];
        for (let i = 0; i < 50; i++) { const w = open('office', 'P' + i); fifty.push(w); }
        await Promise.all(fifty.map((w) => w.ready.catch(() => {})));
        await Promise.all(fifty.map(settle));
        await sleep(200);
        const ok = fifty.filter((w) => w.joined() && !w.refused() && w.closedCode === null).length;
        const errs = fifty.flatMap((w) => w.msgs.filter((m) => m.t === 'error').map((m) => m.error));
        check('relay-local: 50 sockets from one address all join one room', ok === 50, { ok, errs: errs.slice(0, 3) });
        fifty.forEach((w) => w.close());

        let joined = 0; const errs2 = [];
        for (let b = 0; b < 1000; b += 50) {
          const batch = [];
          for (let i = b; i < b + 50; i++) batch.push(open('burst', 'B' + i));
          await Promise.all(batch.map((w) => w.ready.catch(() => {})));
          await Promise.all(batch.map(settle));
          for (const w of batch) {
            if (w.joined() && !w.refused()) joined++; else errs2.push(w.msgs.filter((m) => m.t === 'error').map((m) => m.error)[0] || w.closedCode);
            w.close();
          }
        }
        check('relay-local: a 1000-join burst from one address is not refused', joined === 1000, { joined, errs: errs2.slice(0, 3) });
      }
    } finally { child.kill('SIGKILL'); }
  }

  console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
