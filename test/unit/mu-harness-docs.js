// mu-harness-docs.js — guards for the local relay stand-in and the docs
// that describe it. relay-local.js is what the release relay tier drives.
// A cap, a leak, or a banner that disagrees with relay/src/relay.js ships
// green. The Worker itself is executed by test/relay/relay-worker-contract.js,
// which this file only checks is still on that tier.
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

const local = fs.readFileSync(path.join(ROOT, 'test/servers/relay-local.js'), 'utf8');
const worker = fs.readFileSync(path.join(ROOT, 'relay/src/relay.js'), 'utf8');
const bugs = fs.readFileSync(path.join(ROOT, 'docs/BUGS.md'), 'utf8');
const readme = fs.readFileSync(path.join(ROOT, 'relay/README.md'), 'utf8');
const release = fs.readFileSync(path.join(ROOT, 'test/batteries/release.sh'), 'utf8');
const contract = fs.readFileSync(path.join(ROOT, 'test/relay/relay-worker-contract.js'), 'utf8');
const harness = fs.readFileSync(path.join(ROOT, 'test/lib/relay-worker.js'), 'utf8');

function num(src, name) {
  const m = src.match(new RegExp('\\b' + name + ' = (\\d+)'));
  return m ? m[1] : '';
}
function floors(src) {
  const out = [];
  const re = /\[a-f0-9\]\{(\d+),(\d+)\}/g;
  let m;
  while ((m = re.exec(src))) out.push(m[1] + ',' + m[2]);
  return out;
}
function devSlice(src) {
  const m = src.match(/const cleanDevList = \(list\) => \(Array\.isArray\(list\) \? list : \[\]\)\.slice\(0, (\d+)\)/);
  return m ? m[1] : '';
}

for (const name of ['GBLOB_CAP', 'BAN_CAP', 'WHO_MIN_MS', 'FRAME_BURST', 'FRAMES_PER_SEC', 'FRAME_STRIKES']) {
  check(name + ' matches relay/src/relay.js', num(local, name) !== '' && num(local, name) === num(worker, name),
    { local: num(local, name), worker: num(worker, name) });
}
check('cleanDevList slice matches relay/src/relay.js', devSlice(local) === '24' && devSlice(local) === devSlice(worker),
  { local: devSlice(local), worker: devSlice(worker) });
const allFloors = floors(readme).concat(floors(local), floors(worker));
check('verifier floors in README, relay-local, and the Worker are 24,64',
  floors(readme).length >= 1 && floors(local).length >= 1 && floors(worker).length >= 1
  && allFloors.every((x) => x === '24,64'), allFloors);
check('relay-local does not describe a 16-char verifier floor', !/16[–-]64/.test(local));

check('msgRate records a peer only while RELAY_DEBUG is set',
  /if \(process\.env\.RELAY_DEBUG\) msgRate\.set\(peer/.test(local));
check('a close drops that peer from msgRate when RELAY_DEBUG is set',
  /if \(process\.env\.RELAY_DEBUG\) msgRate\.delete\(peer\)/.test(local));
check('the last socket in a room deletes the session',
  /if \(sess\.clients\.size === 0\) sessions\.delete\(parts\[1\]\)/.test(local));
check('a refusal also drops a session that never seated anyone',
  /if \(sess\.clients\.size === 0\) sessions\.delete\(parts\[1\]\)/.test(local.split('const rejectConn')[1] || ''));

check('the listen banner does not hard-code 30/session', !/30\/session/.test(local));
check('the session-full close code is installed only for a finite RELAY_MAX_SOCKETS',
  /if \(Number\.isFinite\(MAX_SOCKETS_PER_SESSION\)\) REJECT_CODES\['this session is full'\] = 1013;/.test(local));
check('RELAY_STATS is the only door to /_stats', /RELAY_STATS === '1'/.test(local) && /\/_stats/.test(local));

check('the Worker declares no per-session socket cap', /There is NO per-session socket cap/.test(worker));
check('BUGS.md does not claim a 30-socket session cap', !/30 sockets/.test(bugs));
check('BUGS.md states there is no per-session socket cap', /[Nn]o per-session socket cap/.test(bugs));
check('BUGS.md names the door-list resend', /door list/.test(bugs) && /roster\(\)/.test(bugs));

check('README points at ../deploy-all.sh from the relay directory',
  /\.\.\/deploy-all\.sh/.test(readme) && !/(?<!\.)\.\/deploy-all\.sh/.test(readme));
check('README lists relay-authored peer-join, votes, ban, unban, and greeters',
  /\{t:'peer-join'/.test(readme) && /\{t:'votes'/.test(readme) && /\{t:'ban'/.test(readme)
  && /\{t:'unban'/.test(readme) && /\{t:'greeters'/.test(readme));
check('README roster names a door scope and a full scope', /scope:'door'/.test(readme) && /'full'/.test(readme));

check('the release relay tier globs test/relay/*.js',
  /want relay && run_tier relay \d+ test\/relay\/\*\.js/.test(release));
check('relay-worker-contract.js is not excluded from that glob',
  !/relay-worker-contract/.test(release));
check('the contract suite builds a room from the Worker harness',
  /makeRoom/.test(contract) && /relay-worker\.js/.test(contract));
check('the harness constructs relay/src/relay.js Session',
  /import \{ Session \} from '\.\.\/\.\.\/relay\/src\/relay\.js'/.test(harness) && /new Session\(/.test(harness));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}
function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { b += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
  });
}
function spawnRelay(port, extra) {
  const env = Object.assign({}, process.env, { RELAY_PORT: String(port), RELAY_HOST: '127.0.0.1' }, extra || {});
  if (!extra || !extra.RELAY_DEBUG) delete env.RELAY_DEBUG;
  const child = spawn(process.execPath, [path.join(ROOT, 'test/servers/relay-local.js')], {
    env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const buf = { s: '' };
  const add = (d) => { buf.s += d.toString(); if (buf.s.length > 20000) buf.s = buf.s.slice(-10000); };
  child.stdout.on('data', add);
  child.stderr.on('data', add);
  return { child, buf };
}
function killAll(kids) {
  for (const c of kids) { try { c.kill('SIGKILL'); } catch (e) {} }
}
async function waitReady(port, spawned) {
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    if (spawned.child.exitCode !== null) throw new Error('relay exited ' + spawned.child.exitCode + ' ' + spawned.buf.s);
    try {
      const r = await get(port, '/');
      if (r.status === 200) return;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('relay did not listen ' + spawned.buf.s);
}
function connectMesh(port, room, peer) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const urlPath = '/s/' + room + '?role=mesh&token=T&peer=' + peer + '&dev=' + peer + 'd';
    const sock = net.connect(port, '127.0.0.1');
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('ws timeout ' + room)); }, 3000);
    let buf = Buffer.alloc(0);
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
    sock.on('data', function ondata(chunk) {
      buf = Buffer.concat([buf, chunk]);
      const h = buf.indexOf('\r\n\r\n');
      if (h < 0) return;
      const head = buf.slice(0, h).toString('utf8');
      sock.removeListener('data', ondata);
      clearTimeout(timer);
      if (!/^HTTP\/1\.1 101/.test(head)) { sock.destroy(); reject(new Error(head.split('\r\n')[0])); return; }
      resolve(sock);
    });
    sock.on('connect', () => {
      sock.write(
        'GET ' + urlPath + ' HTTP/1.1\r\n' +
        'Host: 127.0.0.1:' + port + '\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Key: ' + key + '\r\n' +
        'Sec-WebSocket-Version: 13\r\n\r\n'
      );
    });
  });
}
function sendText(sock, text) {
  const payload = Buffer.from(text);
  if (payload.length >= 126) throw new Error('frame too long');
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i & 3];
  sock.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]));
}
function closeSock(sock) {
  return new Promise((resolve) => {
    const mask = crypto.randomBytes(4);
    try { sock.write(Buffer.concat([Buffer.from([0x88, 0x80]), mask])); sock.end(); } catch (e) {}
    const done = () => resolve();
    sock.once('close', done);
    setTimeout(done, 400);
  });
}
async function stats(port) {
  const r = await get(port, '/_stats');
  try { return JSON.parse(r.body); } catch (e) { return { raw: r.body, status: r.status }; }
}
async function pollStats(port, pred) {
  let last = null;
  for (let i = 0; i < 50; i++) {
    last = await stats(port);
    if (pred(last)) return last;
    await new Promise((r) => setTimeout(r, 20));
  }
  return last;
}

async function main() {
  const kids = [];
  try {
    const port = await freePort();
    const spawned = spawnRelay(port, { RELAY_STATS: '1' });
    kids.push(spawned.child);
    await waitReady(port, spawned);
    const root = await get(port, '/');
    check('GET / stays the plain text banner', root.body.indexOf('gifos relay (local)') === 0, root.body.slice(0, 80));
    const a = await connectMesh(port, 'roomA', 'pa');
    const b = await connectMesh(port, 'roomA', 'pb');
    sendText(a, JSON.stringify({ t: 'who' }));
    sendText(b, JSON.stringify({ t: 'who' }));
    await new Promise((r) => setTimeout(r, 40));
    let st = await stats(port);
    check('one live room is one session with both sockets', st.sessions === 1 && st.clients === 2, st);
    check('msgRate stays empty when RELAY_DEBUG is unset', st.msgRate === 0, st);
    await closeSock(a);
    st = await pollStats(port, (s) => s.clients === 1);
    check('a room with one socket left is kept', st.sessions === 1 && st.clients === 1, st);
    await closeSock(b);
    st = await pollStats(port, (s) => s.sessions === 0 && s.clients === 0);
    check('the last close forgets the session', st.sessions === 0 && st.clients === 0 && st.msgRate === 0, st);
    for (let i = 0; i < 20; i++) {
      const s = await connectMesh(port, 'room' + i, 'p' + i);
      sendText(s, JSON.stringify({ t: 'who' }));
      await closeSock(s);
    }
    st = await pollStats(port, (s) => s.sessions === 0 && s.msgRate === 0);
    check('twenty opened and closed rooms leave no session and no msgRate entry',
      st.sessions === 0 && st.clients === 0 && st.msgRate === 0, st);
    spawned.child.kill('SIGKILL');

    const portD = await freePort();
    const debug = spawnRelay(portD, { RELAY_STATS: '1', RELAY_DEBUG: '1' });
    kids.push(debug.child);
    await waitReady(portD, debug);
    const d = await connectMesh(portD, 'roomD', 'pd');
    sendText(d, JSON.stringify({ t: 'who' }));
    st = await pollStats(portD, (s) => s.msgRate === 1);
    check('RELAY_DEBUG records the live peer', st.msgRate === 1 && st.sessions === 1, st);
    await closeSock(d);
    st = await pollStats(portD, (s) => s.msgRate === 0 && s.sessions === 0);
    check('close drops the msgRate entry and the empty session', st.msgRate === 0 && st.sessions === 0, st);
    debug.child.kill('SIGKILL');

    const portP = await freePort();
    const prod = spawnRelay(portP, { RELAY_PROD: '1' });
    kids.push(prod.child);
    await waitReady(portP, prod);
    await new Promise((r) => setTimeout(r, 50));
    check('default prod banner says session cap Infinity', prod.buf.s.indexOf('session cap Infinity') >= 0, prod.buf.s);
    check('default prod banner does not claim 30/session', prod.buf.s.indexOf('30/session') < 0, prod.buf.s);
    const off = await get(portP, '/_stats');
    check('/_stats is not a probe unless RELAY_STATS=1', off.body.indexOf('gifos relay (local)') === 0, off.body.slice(0, 80));
    prod.child.kill('SIGKILL');

    const portK = await freePort();
    const knob = spawnRelay(portK, { RELAY_PROD: '1', RELAY_MAX_SOCKETS: '12' });
    kids.push(knob.child);
    await waitReady(portK, knob);
    await new Promise((r) => setTimeout(r, 50));
    check('RELAY_MAX_SOCKETS=12 prints session cap 12', knob.buf.s.indexOf('session cap 12') >= 0, knob.buf.s);
    check('the knob banner still does not say 30/session', knob.buf.s.indexOf('30/session') < 0);
    knob.child.kill('SIGKILL');
  } finally {
    killAll(kids);
  }
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e); process.exit(2); });
