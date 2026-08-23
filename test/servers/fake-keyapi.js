// A tiny Deepgram-shaped keyed endpoint for tests: enough to exercise the
// generic GifOS third-party-API broker (gifos.api) + the Settings "Test"
// button without a real provider. CORS-open (like a provider GifOS would be
// pointed at), and it 401s without a `Authorization: Token <key>` header so
// the credential-injection path is real. It NEVER echoes the key back — the
// whole point is the app can't see it; a 200 with words only happens when the
// runtime attached the key on the app's behalf.
//
// It also speaks Deepgram's WebSocket /v1/listen protocol (dependency-free
// RFC 6455, borrowed from relay-local.js): the runtime translates app-side
// REST /v1/listen calls to WS natively (runtime.js deepgramListenWS — key in
// the Sec-WebSocket-Protocol subprotocol ['token', <key>], audio as binary
// frames, {"type":"CloseStream"} to finish, Results + Metadata JSON frames
// back). The WS answer carries request_id 'ws-fake' so a suite can PROVE the
// WS path ran, not the REST route. Paths under /wsonly answer HTTP WITHOUT
// CORS headers (a browser fetch is blocked, as at the real api.deepgram.com)
// while the WS upgrade still works — exercising the Settings probe's
// "blocked directly → native WebSocket" ladder.
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.FAKE_KEYAPI_PORT ? +process.env.FAKE_KEYAPI_PORT : 8792;
const KEY = 'dg-secret-key';
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// The same canned transcript on both routes — a suite asserting words/fillers
// must not care which transport carried them.
const WORDS = [
  { word: 'um', start: 0.0, end: 0.2, confidence: 0.55, filler: true },
  { word: 'hello', start: 0.2, end: 0.5, confidence: 0.98 },
  { word: 'world', start: 0.5, end: 0.9, confidence: 0.97 },
];

function send(res, code, type, body, noCors) {
  const h = { 'Content-Type': type };
  if (!noCors) {
    h['Access-Control-Allow-Origin'] = '*';
    h['Access-Control-Allow-Headers'] = '*';
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  }
  res.writeHead(code, h);
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  // /wsonly/* mimics api.deepgram.com's REST: reachable, but NO CORS headers,
  // so a browser's direct fetch is blocked and only the WS door works.
  const noCors = url.indexOf('/wsonly') === 0;
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '', noCors);
  const auth = req.headers['authorization'] || '';
  // Bare GET at the root is the Settings "Test" probe — answer so a good key
  // reads as reachable and a bad/missing one reads as rejected.
  if (req.method === 'GET' && (url === '/' || url === '' || url === '/wsonly' || url === '/wsonly/')) {
    if (auth === 'Token ' + KEY) return send(res, 200, 'application/json', JSON.stringify({ ok: true }), noCors);
    return send(res, 401, 'application/json', JSON.stringify({ error: 'unauthorized' }), noCors);
  }
  if (auth !== 'Token ' + KEY) return send(res, 401, 'application/json', JSON.stringify({ error: 'unauthorized' }), noCors);
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    if (url.indexOf('/v1/listen') === 0) {
      // Deepgram-ish transcript with word confidence + a tagged filler.
      return send(res, 200, 'application/json', JSON.stringify({
        results: {
          channels: [{ alternatives: [{
            transcript: 'um hello world',
            words: WORDS,
          }] }],
        },
      }), noCors);
    }
    return send(res, 404, 'application/json', JSON.stringify({ error: 'unknown route' }), noCors);
  });
});

// ---- WebSocket /v1/listen (Deepgram streaming protocol, just enough) --------
function wsFrame(opcode, data) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

server.on('upgrade', (req, socket, head) => {
  const url = req.url.split('?')[0];
  const isListen = url === '/v1/listen' || url === '/wsonly/v1/listen';
  // The key rides the subprotocol list: 'token, <key>' — exactly how a browser
  // has to send it (custom headers are forbidden on a WS handshake).
  const proto = String(req.headers['sec-websocket-protocol'] || '').split(',').map((s) => s.trim());
  if (!isListen || proto[0] !== 'token' || proto[1] !== KEY) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + WS_GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\nSec-WebSocket-Protocol: token\r\n\r\n');

  let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  let audioBytes = 0;
  const reply = (o) => { try { socket.write(wsFrame(0x1, JSON.stringify(o))); } catch (e) {} };
  function drain() {
    while (buf.length >= 2) {
      const b0 = buf[0], b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      let mask = null;
      if (masked) { if (buf.length < off + 4) return; mask = buf.slice(off, off + 4); off += 4; }
      if (buf.length < off + len) return;
      let payload = buf.slice(off, off + len);
      if (masked) { const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3]; payload = out; }
      buf = buf.slice(off + len);
      if (opcode === 0x8) { try { socket.destroy(); } catch (e) {} return; }
      if (opcode === 0x9) { try { socket.write(wsFrame(0xA, payload)); } catch (e) {} continue; }
      if (opcode === 0x2) { audioBytes += payload.length; continue; }
      if (opcode === 0x1) {
        let m = null; try { m = JSON.parse(payload.toString('utf8')); } catch (e) {}
        if (m && m.type === 'CloseStream') {
          // One final Results + the closing Metadata, then a clean close —
          // the shape the runtime reassembles into a REST-looking response.
          reply({ type: 'Results', is_final: true, speech_final: true,
            channel: { alternatives: [{ transcript: 'um hello world', confidence: 0.83, words: WORDS }] } });
          reply({ type: 'Metadata', request_id: 'ws-fake', duration: 0.9, audio_bytes: audioBytes });
          try { socket.write(wsFrame(0x8, Buffer.from([0x03, 0xe8]))); } catch (e) {}
          setTimeout(() => { try { socket.destroy(); } catch (e) {} }, 200);
          return;
        }
      }
    }
  }
  socket.on('data', (d) => { buf = Buffer.concat([buf, d]); drain(); });
  socket.on('error', () => { try { socket.destroy(); } catch (e) {} });
  drain();
});

server.listen(PORT, () => console.log('fake keyed API on http://127.0.0.1:' + PORT + ' (REST + Deepgram-style WS /v1/listen)'));
