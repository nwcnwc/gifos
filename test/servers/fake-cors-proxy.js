// A Node stand-in for cors-proxy.gifos.app, for e2e. Mirrors the real Worker's
// shape (src/cors-proxy.js): answers OPTIONS with CORS, gates on Origin, reads
// x-gifos-target, forwards there, and re-serves the response with CORS headers.
// The host allow-list is relaxed to loopback so the test's fake key API counts.
const http = require('http');

const PORT = process.env.FAKE_PROXY_PORT ? +process.env.FAKE_PROXY_PORT : 8793;

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
    'Vary': 'Origin',
  };
}
function originAllowed(origin) {
  if (!origin) return false;
  try { const h = new URL(origin).hostname; return h === 'gifos.app' || h.endsWith('.gifos.app') || h === 'localhost' || h === '127.0.0.1'; }
  catch (e) { return false; }
}

const server = http.createServer((req, res) => {
  const origin = req.headers['origin'] || '';
  if (req.method === 'OPTIONS') { res.writeHead(204, cors(origin)); return res.end(); }
  const send = (code, obj) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, cors(origin))); res.end(JSON.stringify(obj)); };
  if (!originAllowed(origin)) return send(403, { error: 'origin not allowed' });
  const target = req.headers['x-gifos-target'] || '';
  let u;
  try { u = new URL(target); } catch (e) { return send(400, { error: 'bad x-gifos-target' }); }
  // (real proxy checks an https allow-list; loopback http is fine for the test)
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const headers = Object.assign({}, req.headers);
    delete headers['x-gifos-target']; delete headers['host']; delete headers['origin']; delete headers['referer']; delete headers['content-length'];
    const opts = { method: req.method, headers };
    const preq = http.request(u.toString(), opts, (pres) => {
      const out = [];
      pres.on('data', (c) => out.push(c));
      pres.on('end', () => {
        const b = Buffer.concat(out);
        res.writeHead(pres.statusCode, Object.assign({ 'Content-Type': pres.headers['content-type'] || 'application/json' }, cors(origin)));
        res.end(b);
      });
    });
    preq.on('error', (e) => send(502, { error: 'upstream failed: ' + e.message }));
    if (req.method !== 'GET' && req.method !== 'HEAD' && body.length) preq.write(body);
    preq.end();
  });
});

server.listen(PORT, () => console.log('fake CORS proxy on http://127.0.0.1:' + PORT));
