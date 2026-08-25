// glTF Viewer has to refuse remote skies, refuse compressed files, inline
// sibling buffers, and keep the last model on this device. A vm can play that
// loop without WebGL. Phone pinch and Back are one-liners, scanned in source.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'gltf-viewer');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function loadViewer() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Map,
    Uint8Array, ArrayBuffer, DataView, atob, btoa,
    setTimeout: (fn) => { fn(); return 0; },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'viewer.js'), 'utf8'), sandbox, { filename: 'viewer.js' });
  return sandbox;
}

const S = loadViewer();
const V = S.GltfViewer;
check('viewer.js attaches GltfViewer', !!(V && V.isGlb && V.inlineGltf && V.refuseCompressed && V.glbJson));

const glbMagic = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0, 0, 0, 2]).buffer;
check('isGlb: glTF magic', V.isGlb(glbMagic));
check('isGlb: rejects junk', !V.isGlb(new Uint8Array([0, 1, 2, 3]).buffer));

{
  const json = V.inlineGltf(
    '{"asset":{"version":"2.0"},"buffers":[{"uri":"a.bin","byteLength":3}]}',
    new Map([['a.bin', new Uint8Array([1, 2, 3]).buffer]])
  );
  check('inlineGltf: sibling .bin becomes a data: URI', json.buffers[0].uri.indexOf('data:') === 0);
}

function throws(fn, re) {
  try { fn(); return false; } catch (e) { return re.test(String(e && e.message)); }
}

check('Draco is refused by name',
  throws(() => V.inlineGltf('{"extensionsUsed":["KHR_draco_mesh_compression"]}', new Map()), /Draco/));
check('Meshopt is refused by name',
  throws(() => V.inlineGltf('{"extensionsUsed":["EXT_meshopt_compression"]}', new Map()), /Meshopt/));
check('KTX2 / basisu is refused by name',
  throws(() => V.inlineGltf('{"extensionsRequired":["KHR_texture_basisu"]}', new Map()), /KTX2/));
check('a missing sidecar names the file',
  throws(() => V.inlineGltf('{"buffers":[{"uri":"mesh.bin","byteLength":4}]}', new Map()), /mesh\.bin/));

function makeGlb(obj) {
  const body = Buffer.from(JSON.stringify(obj));
  const pad = (4 - (body.length % 4)) % 4;
  const jsonLen = body.length + pad;
  const total = 12 + 8 + jsonLen;
  const buf = Buffer.alloc(total);
  buf.write('glTF', 0);
  buf.writeUInt32LE(2, 4);
  buf.writeUInt32LE(total, 8);
  buf.writeUInt32LE(jsonLen, 12);
  buf.writeUInt32LE(0x4E4F534A, 16);
  body.copy(buf, 20);
  for (let i = 0; i < pad; i++) buf[20 + body.length + i] = 0x20;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

{
  const plain = makeGlb({ asset: { version: '2.0' } });
  check('glbJson reads the JSON chunk of a GLB', V.glbJson(plain) && V.glbJson(plain).asset.version === '2.0');
  const draco = makeGlb({ asset: { version: '2.0' }, extensionsUsed: ['KHR_draco_mesh_compression'] });
  check('a Draco GLB is refused before parse',
    throws(() => V.refuseCompressed(V.glbJson(draco)), /Draco/));
}

const src = {
  app: fs.readFileSync(path.join(APP, 'app.js'), 'utf8'),
  html: fs.readFileSync(path.join(APP, 'index.html'), 'utf8'),
  css: fs.readFileSync(path.join(APP, 'style.css'), 'utf8'),
  viewer: fs.readFileSync(path.join(APP, 'viewer.js'), 'utf8'),
  listing: JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8')),
  help: fs.readFileSync(path.join(APP, 'help.md'), 'utf8'),
  manifest: JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8')),
};

check('last model is saved privately as id last', src.app.includes("db('save')") && src.app.includes("id: 'last'"));
check('models over 8 MB are not stuffed into the file', /8 \* 1024 \* 1024/.test(src.app) || /MAX_BYTES/.test(src.app));
check('onBack closes Inspect', src.app.includes('onBack') && src.app.includes('inspect'));
check('canvas pinch: touch-action none', src.css.includes('touch-action: none'));
check('phone inspect is a sheet, not a permanent 38% panel', src.css.includes('body.inspect aside') && src.css.includes('translateY'));
check('Open stays available after a model loads (hud + file-input)', src.html.includes('id="hud"') && src.html.includes('id="file-input"'));
check('hidden wins over display:flex (empty state cannot cover the model)',
  src.css.includes('[hidden]') && src.css.includes('body.loaded .placeholder'));
check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(src.html));
check('no ktx2 in the picker (this copy does not unpack it)', !src.html.includes('.ktx2'));
check('no fetch / XHR / WebSocket in app or viewer',
  !['fetch(', 'XMLHttpRequest', 'WebSocket', 'unpkg'].some((b) => src.app.includes(b) || src.viewer.includes(b)));
check('no network capability', !src.manifest.capabilities.network);
check('no wasm capability (loaders never fetch decoders)', !src.manifest.capabilities.wasm);
check('save collection is private', src.manifest.data.save.visibility === 'private');
check('help.md explains orbit / pinch / inspect',
  /pinch/i.test(src.help) && /Inspect/i.test(src.help) && src.help.trim().length > 400);
check('listing says the last model is saved and never shared', /last model is saved/i.test(src.listing.description) && /model is not sent/i.test(src.listing.description));
check('listing does not say Drop', !/\bDrop\b/.test(src.listing.tagline + src.listing.description));
check('listing names the unofficial port', /unofficial port/i.test(src.listing.description));
check('author is Don McCurdy, porter is GifOS',
  src.listing.author.name === 'Don McCurdy' && src.listing.porter.name === 'GifOS');

console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
process.exit(failures ? 1 : 0);
