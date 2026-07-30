/*
 * pause-forwarder.js — a TCP forwarder that can BLACK-HOLE traffic without
 * closing the connection.
 *
 * WHY THIS EXISTS. Killing a relay socket and silencing it are different
 * experiments, and every lever we had only did the first. A closed socket takes
 * its greeter attachment with it (relay.js greeterList — "a departed seat's
 * blob leaves with its socket"), so "make these clients unreachable" always
 * also meant "empty the greeter registry". That made one whole class of state
 * unreachable by tests: a client holding a NON-EMPTY greeter list it can never
 * reach — which is precisely mesh state 1 (gateway picked, HOME never arrives).
 *
 * Point some clients at this instead of the relay and SIGUSR1 it: their TCP
 * connections stay open, so the relay still counts them as live occupants and
 * their sealed addresses stay in the pool, but no byte crosses in either
 * direction. A joiner then parks at mesh state 1 indefinitely, cycling 1->0->1
 * off a pool of ghosts it cannot dial. SIGUSR2 resumes.
 *
 * That is how the ghost-genesis brick (healing-laws R3a,
 * test/drills/e2e-ghost-genesis.js) was first reproduced end to end with real
 * browsers: park the reloading client at state 1, then drop the forwarder and
 * bounce the relay so its socket reconnects into an empty registry. The relay's
 * connect knock carries its throwaway key, it is handed the mint it cannot use,
 * and the room is bricked for everyone.
 *
 *   FWD_PORT=8791 DST_PORT=8790 node test/servers/pause-forwarder.js
 *   pkill -USR1 -f pause-forwarder   # black-hole (sockets stay open)
 *   pkill -USR2 -f pause-forwarder   # resume
 *
 * Unpiping (rather than dropping bytes) leaves the data in the kernel buffers
 * and lets TCP backpressure do the work, so a resume replays what was queued —
 * a real network stall, not a lossy one.
 */
const net = require('net');

const FWD = parseInt(process.env.FWD_PORT || '8791', 10);
const DST = parseInt(process.env.DST_PORT || '8790', 10);
const DST_HOST = process.env.DST_HOST || '127.0.0.1';
const HOST = process.env.FWD_HOST || '0.0.0.0';

let paused = false;
const pairs = new Set();

process.on('SIGUSR1', () => {
  paused = true;
  for (const p of pairs) { p.c.unpipe(p.u); p.u.unpipe(p.c); }
  console.log('PAUSED — ' + pairs.size + ' connection(s) held open and silent');
});
process.on('SIGUSR2', () => {
  paused = false;
  for (const p of pairs) { p.c.pipe(p.u); p.u.pipe(p.c); }
  console.log('RESUMED — ' + pairs.size + ' connection(s)');
});

net.createServer((c) => {
  const u = net.connect(DST, DST_HOST);
  const p = { c, u };
  pairs.add(p);
  const kill = () => { pairs.delete(p); c.destroy(); u.destroy(); };
  c.on('error', kill); u.on('error', kill);
  c.on('close', kill); u.on('close', kill);
  if (!paused) { c.pipe(u); u.pipe(c); }
}).listen(FWD, HOST, () => {
  console.log('pause-forwarder ' + HOST + ':' + FWD + ' -> ' + DST_HOST + ':' + DST
    + (paused ? ' (PAUSED)' : '') + '  — SIGUSR1 pause, SIGUSR2 resume');
});
