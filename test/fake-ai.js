// A tiny OpenAI-shaped endpoint for tests: enough to exercise the GifOS AI
// broker + the Settings "Test" button without a real provider. CORS-open (like
// a provider the user would point GifOS at), and it 401s without a Bearer key
// so the key path is real.
const http = require('http');

const PORT = process.env.FAKE_AI_PORT ? +process.env.FAKE_AI_PORT : 8791;

function send(res, code, type, body) {
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '');
  const auth = req.headers['authorization'] || '';
  if (!/^Bearer\s+\S/.test(auth)) return send(res, 401, 'application/json', JSON.stringify({ error: 'no key' }));
  const url = req.url.split('?')[0];
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    if (url.endsWith('/chat/completions')) {
      return send(res, 200, 'application/json', JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'pong' } }],
      }));
    }
    if (url.endsWith('/audio/speech')) {
      return send(res, 200, 'audio/mpeg', Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00])); // fake ID3 header
    }
    if (url.endsWith('/audio/transcriptions')) {
      return send(res, 200, 'application/json', JSON.stringify({ text: 'hello world' }));
    }
    if (url.endsWith('/images/generations')) {
      // 1x1 transparent PNG, base64
      return send(res, 200, 'application/json', JSON.stringify({
        data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==' }],
      }));
    }
    if (url.endsWith('/video/generations')) {
      return send(res, 200, 'application/json', JSON.stringify({ id: 'job_123', status: 'queued' }));
    }
    return send(res, 404, 'application/json', JSON.stringify({ error: 'unknown route' }));
  });
});

server.listen(PORT, () => console.log('fake AI on http://127.0.0.1:' + PORT));
