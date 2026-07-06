// MCP server test: drive the Worker's fetch handler directly in Node (the
// codec + Request/Response/CompressionStream are all native here too).
// Verifies the JSON-RPC plumbing AND that pack_app emits a real GifOS GIF:
// decodable filesystem, correct manifest, custom animated icon frames.
const path = require('path');
const { pathToFileURL } = require('url');

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }

(async () => {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'mcp', 'src', 'mcp.mjs')).href);
  const handler = mod.default;
  const gif = globalThis.GifOS.gif; // attached by the codec the server imports

  let nextId = 1;
  const rpc = async (method, params) => {
    const res = await handler.fetch(new Request('https://mcp.gifos.app/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    }));
    return { status: res.status, body: await res.json() };
  };

  // ---- protocol plumbing ----
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  check('initialize returns serverInfo + tools capability',
    init.body.result && init.body.result.serverInfo.name === 'gifos' && !!init.body.result.capabilities.tools);
  const notif = await handler.fetch(new Request('https://mcp.gifos.app/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  }));
  check('notifications are acknowledged with 202', notif.status === 202);
  const list = await rpc('tools/list');
  const names = (list.body.result.tools || []).map((t) => t.name).sort();
  check('tools/list exposes the three tools', JSON.stringify(names) === JSON.stringify(['get_build_guide', 'pack_app', 'validate_app']));

  // ---- the guide ----
  const guide = await rpc('tools/call', { name: 'get_build_guide', arguments: {} });
  const guideText = guide.body.result.content[0].text;
  check('build guide teaches gifos.db + the icon format', /gifos\.db\(/.test(guideText) && /palette/.test(guideText) && /pack_app/.test(guideText));

  // ---- validation catches sandbox violations ----
  const bad = await rpc('tools/call', { name: 'validate_app', arguments: { html: '<html><script src="https://cdn.example.com/x.js"></script><script>localStorage.x=1</script></html>' } });
  const verdict = bad.body.result.content[0].text;
  check('validate_app flags CDN scripts and localStorage', /External resource/.test(verdict) && /localStorage/.test(verdict));
  const good = await rpc('tools/call', { name: 'validate_app', arguments: { html: "<html><script>const db=gifos.db('x');</script></html>" } });
  check('validate_app passes a clean app', /Looks good/.test(good.body.result.content[0].text));

  // ---- pack_app: a finished GIF with custom animated pixel-art icon ----
  const appHtml = "<!doctype html><meta charset='utf-8'><div id='n'>0</div><script>const db=gifos.db('taps');db.subscribe(i=>document.getElementById('n').textContent=i.length);document.body.onclick=()=>db.put({t:1});</script>";
  const packed = await rpc('tools/call', {
    name: 'pack_app',
    arguments: {
      name: 'Tap Counter', accent: '#5cc8ff', html: appHtml,
      extra_files: { 'README.txt': 'a tiny tap counter' },
      icon: {
        palette: { '.': 'transparent', 'a': '#5cc8ff', 'b': '#ffffff' },
        delay_cs: 10,
        frames: [
          ['........', '..aaaa..', '.abbbba.', '.abbbba.', '.abbbba.', '.abbbba.', '..aaaa..', '........'],
          ['........', '..aaaa..', '.aabbaa.', '.abbbba.', '.abbbba.', '.aabbaa.', '..aaaa..', '........'],
        ],
      },
    },
  });
  const content = packed.body.result.content;
  check('pack_app returns text + image + resource blocks',
    content.length === 3 && content[0].type === 'text' && content[1].type === 'image' && content[2].type === 'resource');
  check('the image block is a GIF preview', content[1].mimeType === 'image/gif' && content[1].data.length > 100);
  check('the resource is named like a file', /Tap Counter\.gif/.test(content[2].resource.name));

  const bytes = gif.b64decode(content[2].resource.blob);
  check('packed bytes are a real GIF89a', String.fromCharCode(bytes[0], bytes[1], bytes[2]) === 'GIF');
  const back = await gif.decode(bytes);
  check('the GIF carries the app filesystem', !!back && gif.bytesToText(back.files['index.html']) === appHtml);
  check('extra files ride along', gif.bytesToText(back.files['README.txt']) === 'a tiny tap counter');
  const manifest = gif.readManifest(back);
  check('manifest is complete (appId, name, capabilities)',
    manifest.appId === 'tap-counter' && manifest.name === 'Tap Counter' && manifest.capabilities.db === true);
  const hay = Buffer.from(bytes).toString('latin1');
  check('icon animates (NETSCAPE loop + 2 frames)', hay.indexOf('NETSCAPE2.0') >= 0 && bytes.filter((b) => b === 0x2c).length >= 2);
  check('icon is the 8x8 pixel art (logical screen size)', bytes[6] === 8 && bytes[8] === 8);

  // ---- the preferred move: hide the app inside the user's OWN gif, wholesale ----
  const wild = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 2, 0, 2, 0, 0, 0, 0, 0x3b]);
  const egg = await rpc('tools/call', {
    name: 'pack_app',
    arguments: { name: 'Secret Egg', html: appHtml, hide_in_gif_base64: gif.b64encode(wild) },
  });
  check('hide_in_gif_base64 reports the hidden-inside note', /hidden inside the supplied GIF/.test(egg.body.result.content[0].text));
  const eggBytes = gif.b64decode(egg.body.result.content[2].resource.blob);
  check('the wild gif\'s own bytes lead the file untouched', (() => {
    for (let i = 0; i < wild.length - 1; i++) if (eggBytes[i] !== wild[i]) return false;
    return true;
  })());
  const eggBack = await gif.decode(eggBytes);
  check('the hidden app decodes out of the wild gif', !!eggBack && gif.bytesToText(eggBack.files['index.html']) === appHtml);
  check('guide + tool prefer the user\'s own GIF, used wholesale', /hide_in_gif_base64/.test(guideText) && /USER'S OWN GIF ALWAYS COMES/.test(guideText) && /WHOLESALE/.test(guideText));
  check('guide forbids false sync/cloud claims', /NO cloud and NO automatic cross-device sync/.test(guideText) && /syncs across your\s+devices/.test(guideText));

  // ---- procedural fallback when no icon supplied ----
  const plain = await rpc('tools/call', { name: 'pack_app', arguments: { name: 'Plain', html: appHtml } });
  check('pack_app without icon still yields an animated GIF', /procedural animated icon/.test(plain.body.result.content[0].text));

  // ---- errors surface as tool errors, not protocol crashes ----
  const broken = await rpc('tools/call', { name: 'pack_app', arguments: { name: 'X', html: 'not html' } });
  check('bad input becomes a tool error (isError)', broken.body.result.isError === true);
  const unknown = await rpc('tools/call', { name: 'nope', arguments: {} });
  check('unknown tool is a tool error too', unknown.body.result.isError === true);

  // ---- GET is a human-readable pointer ----
  const getRes = await handler.fetch(new Request('https://mcp.gifos.app/', { method: 'GET' }));
  check('GET / explains how to connect', /mcp\.gifos\.app\/mcp/.test(await getRes.text()));

  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
