// A tiny Deepgram-shaped keyed endpoint for tests: enough to exercise the
// generic GifOS third-party-API broker (gifos.api) + the Settings "Test"
// button without a real provider. CORS-open (like a provider GifOS would be
// pointed at), and it 401s without a `Authorization: Token <key>` header so
// the credential-injection path is real. It NEVER echoes the key back — the
// whole point is the app can't see it; a 200 with words only happens when the
// runtime attached the key on the app's behalf.
const http = require('http');

const PORT = process.env.FAKE_KEYAPI_PORT ? +process.env.FAKE_KEYAPI_PORT : 8792;
const KEY = 'dg-secret-key';

function send(res, code, type, body) {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '');
  const url = req.url.split('?')[0];
  const auth = req.headers['authorization'] || '';
  // Bare GET at the root is the Settings "Test" probe — answer so a good key
  // reads as reachable and a bad/missing one reads as rejected.
  if (req.method === 'GET' && (url === '/' || url === '')) {
    if (auth === 'Token ' + KEY) return send(res, 200, 'application/json', JSON.stringify({ ok: true }));
    return send(res, 401, 'application/json', JSON.stringify({ error: 'unauthorized' }));
  }
  if (auth !== 'Token ' + KEY) return send(res, 401, 'application/json', JSON.stringify({ error: 'unauthorized' }));
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    if (url.indexOf('/v1/listen') === 0) {
      // Deepgram-ish transcript with word confidence + a tagged filler.
      return send(res, 200, 'application/json', JSON.stringify({
        results: {
          channels: [{ alternatives: [{
            transcript: 'um hello world',
            words: [
              { word: 'um', start: 0.0, end: 0.2, confidence: 0.55, filler: true },
              { word: 'hello', start: 0.2, end: 0.5, confidence: 0.98 },
              { word: 'world', start: 0.5, end: 0.9, confidence: 0.97 },
            ],
          }] }],
        },
      }));
    }
    return send(res, 404, 'application/json', JSON.stringify({ error: 'unknown route' }));
  });
});

server.listen(PORT, () => console.log('fake keyed API on http://127.0.0.1:' + PORT));
