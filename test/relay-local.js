/*
 * relay-local.js — A dependency-free stand-in for the Cloudflare relay Worker,
 * used only for local end-to-end testing. It speaks the exact same message
 * protocol as relay/src/relay.js so the browser client/host code is unchanged.
 */
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.RELAY_PORT ? parseInt(process.env.RELAY_PORT, 10) : 8790;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ---- minimal RFC6455 connection ----
class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.onmessage = null;
    this.onclose = null;
    socket.on('data', (chunk) => { this.buf = Buffer.concat([this.buf, chunk]); this.drain(); });
    socket.on('close', () => this.onclose && this.onclose());
    socket.on('error', () => {});
  }
  drain() {
    while (this.buf.length >= 2) {
      const b1 = this.buf[1];
      const opcode = this.buf[0] & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      let mask = null;
      if (masked) { if (this.buf.length < off + 4) return; mask = this.buf.slice(off, off + 4); off += 4; }
      if (this.buf.length < off + len) return;
      let payload = this.buf.slice(off, off + len);
      if (masked) { const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3]; payload = out; }
      this.buf = this.buf.slice(off + len);
      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this.frame(0xA, payload); continue; } // ping -> pong
      if (opcode === 0x1 || opcode === 0x0) { if (this.onmessage) this.onmessage(payload.toString('utf8')); }
    }
  }
  frame(opcode, data) {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) header = Buffer.from([0x80 | opcode, len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
    try { this.socket.write(Buffer.concat([header, payload])); } catch (e) {}
  }
  send(text) { this.frame(0x1, text); }
  close() { try { this.frame(0x8, Buffer.alloc(0)); this.socket.end(); } catch (e) {} }
}

// ---- session hub (mirrors the Durable Object) ----
const sessions = new Map(); // id -> { host, token, clients:Map }
function getSession(id) { if (!sessions.has(id)) sessions.set(id, { host: null, token: null, clients: new Map() }); return sessions.get(id); }

const server = http.createServer((req, res) => { res.writeHead(200); res.end('gifos relay (local)'); });

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const conn = new Conn(socket);

  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean); // ['s', id]
  if (parts[0] !== 's' || !parts[1]) { conn.send(JSON.stringify({ t: 'error', error: 'bad path' })); conn.close(); return; }
  const sess = getSession(parts[1]);
  const role = url.searchParams.get('role') || 'client';
  const token = url.searchParams.get('token') || '';
  const peer = url.searchParams.get('peer') || 'c_' + crypto.randomBytes(4).toString('hex');

  if (role === 'host') {
    sess.host = conn; sess.token = token;
    conn.onmessage = (data) => {
      let m; try { m = JSON.parse(data); } catch (e) { return; }
      if (m.t === 'to') { const c = sess.clients.get(m.to); if (c) c.send(JSON.stringify(m.msg)); }
      else if (m.t === 'bcast') { for (const c of sess.clients.values()) c.send(JSON.stringify(m.msg)); }
    };
    conn.onclose = () => { if (sess.host === conn) { sess.host = null; for (const c of sess.clients.values()) c.send(JSON.stringify({ t: 'host-gone' })); } };
    conn.send(JSON.stringify({ t: 'host-ready' }));
    // Announce already-connected clients (lock/failover recovery), same as the Worker.
    for (const peer of sess.clients.keys()) conn.send(JSON.stringify({ t: 'peer-join', peer }));
  } else {
    if (!sess.host) { conn.send(JSON.stringify({ t: 'error', error: 'no host' })); conn.close(); return; }
    if (sess.token && token !== sess.token) { conn.send(JSON.stringify({ t: 'error', error: 'bad token' })); conn.close(); return; }
    sess.clients.set(peer, conn);
    conn.onmessage = (data) => { let m; try { m = JSON.parse(data); } catch (e) { return; } if (sess.host) sess.host.send(JSON.stringify({ t: 'from', from: peer, msg: m })); };
    conn.onclose = () => { sess.clients.delete(peer); if (sess.host) sess.host.send(JSON.stringify({ t: 'peer-leave', peer })); };
    conn.send(JSON.stringify({ t: 'joined', peer }));
    sess.host.send(JSON.stringify({ t: 'peer-join', peer }));
  }
});

server.listen(PORT, '127.0.0.1', () => console.log('gifos local relay on ws://127.0.0.1:' + PORT));
