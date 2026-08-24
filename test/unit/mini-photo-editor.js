// MINI PHOTO EDITOR HAS TO CROP, ROTATE AND FILTER — NOT DRAW, NOT COMPRESS.
//
// The filter pipeline is pixel arithmetic (xdadda's MTX looks plus lights).
// Crop handles and rotate must preserve the box. Take-photo / drop / save
// are one-liners a vm cannot click, so they are source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'mini-photo-editor');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
    Uint8Array, Uint8ClampedArray,
    document: { createElement() { return { getContext() { return null; } }; } },
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.this = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'mini-photo.js'), 'utf8'), sandbox, { filename: 'mini-photo.js' });
  return sandbox;
}

const S = load();
const MP = S.MiniPhoto;
check('engine loads', !!(MP && MP.MTX && MP.applyPixels && MP.setFilter));
check('MTX looks aboard', !!(MP.MTX.polaroid && MP.MTX.kodak && MP.MTX.vintage && MP.MTX.browni && MP.MTX.grayscale));

const zeroAdj = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 0 };

function px(r, g, b) { return new Uint8Array([r, g, b, 255]); }

{
  const red = px(255, 0, 0);
  MP.applyPixels(red, 1, 1, zeroAdj, 'grayscale');
  check('grey of red is ~luma 54', Math.abs(red[0] - 54) <= 1 && Math.abs(red[0] - red[1]) <= 1 && Math.abs(red[1] - red[2]) <= 1, Array.from(red));
}

{
  const p = px(128, 128, 128);
  MP.applyPixels(p, 1, 1, { brightness: 0.5, contrast: 0, saturation: 0, warmth: 0, vignette: 0 }, 'none');
  check('brightness +0.5 lifts mid grey', p[0] > 160, Array.from(p));
}

{
  const p = px(200, 80, 80);
  MP.applyPixels(p, 1, 1, { brightness: 0, contrast: 0, saturation: 0, warmth: 1, vignette: 0 }, 'none');
  check('warmth pushes red up and blue down', p[0] > 200 && p[2] < 80, Array.from(p));
}

{
  const a = px(180, 90, 40);
  const b = px(180, 90, 40);
  MP.applyPixels(a, 1, 1, zeroAdj, 'none');
  MP.applyPixels(b, 1, 1, zeroAdj, 'vintage');
  check('vintage look actually changes the pixel', a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2], { a: Array.from(a), b: Array.from(b) });
}

{
  const kodak = px(100, 120, 140);
  const none = px(100, 120, 140);
  MP.applyPixels(none, 1, 1, zeroAdj, 'none');
  MP.applyPixels(kodak, 1, 1, zeroAdj, 'kodak');
  check('kodak look actually changes the pixel', none[0] !== kodak[0] || none[1] !== kodak[1] || none[2] !== kodak[2]);
}

{
  // 4x1: x=0 is farther from centre (2) than x=2, so vignette 1 darkens the edge more
  const data = new Uint8Array([
    200, 200, 200, 255,
    200, 200, 200, 255,
    200, 200, 200, 255,
    200, 200, 200, 255
  ]);
  MP.applyPixels(data, 4, 1, { brightness: 0, contrast: 0, saturation: 0, warmth: 0, vignette: 1 }, 'none');
  check('vignette darkens the edge more than the centre', data[0] < data[8], Array.from(data));
}

{
  MP.setFilter('vintage');
  check('setFilter vintage', MP.getFilter() === 'vintage');
  MP.setFilter('nope');
  check('unknown filter is ignored', MP.getFilter() === 'vintage');
  MP.setFilter('none');
}

{
  MP.setSource({ width: 100, height: 80 });
  check('source size', MP.sourceSize().w === 100 && MP.sourceSize().h === 80);
  check('rotated size starts as source', MP.rotatedSize().w === 100 && MP.rotatedSize().h === 80);
  MP.setCrop({ x: 10, y: 10, w: 50, h: 40 });
  let c = MP.getCrop();
  check('crop sticks', c.x === 10 && c.y === 10 && c.w === 50 && c.h === 40, c);
  MP.setCrop({ x: -20, y: 90, w: 400, h: 400 });
  c = MP.getCrop();
  check('crop clamps to the picture', c.x === 0 && c.y <= 79 && c.x + c.w <= 100 && c.y + c.h <= 80, c);
}

{
  MP.setSource({ width: 100, height: 80 });
  MP.setCrop({ x: 10, y: 10, w: 50, h: 40 });
  MP.rotate(1);
  const d = MP.rotatedSize();
  const c = MP.getCrop();
  check('90° CW swaps dims', d.w === 80 && d.h === 100, d);
  check('90° CW maps the crop', c.x === 30 && c.y === 10 && c.w === 40 && c.h === 50, c);
  MP.rotate(-1);
  const back = MP.getCrop();
  check('90° CCW restores crop', back.x === 10 && back.y === 10 && back.w === 50 && back.h === 40, back);
}

{
  MP.setSource({ width: 100, height: 80 });
  MP.setCrop({ x: 10, y: 20, w: 30, h: 20 });
  MP.flip('h');
  const c = MP.getCrop();
  check('flip H mirrors crop.x', c.x === 100 - 10 - 30 && c.y === 20 && c.w === 30, c);
}

{
  MP.setSource({ width: 200, height: 100 });
  MP.cropToAspect(1);
  const c = MP.getCrop();
  check('1:1 aspect is a centred square', c.w === c.h && c.w === 100 && c.x === 50 && c.y === 0, c);
  MP.cropToAspect(0);
  const f = MP.getCrop();
  check('Free aspect is the whole picture', f.x === 0 && f.y === 0 && f.w === 200 && f.h === 100, f);
}

{
  MP.setSource({ width: 100, height: 80 });
  MP.setCrop({ x: 10, y: 10, w: 40, h: 40 });
  check('corner hit is nw', MP.hitHandle(10, 10) === 'nw');
  check('inside is move', MP.hitHandle(30, 30) === 'move');
  check('outside is null', MP.hitHandle(90, 70) === null);
  MP.resizeCrop('se', 60, 50, 0);
  const c = MP.getCrop();
  check('resize se grows the box', c.w === 50 && c.h === 40, c);
  MP.moveCrop(5, 0);
  const m = MP.getCrop();
  check('move shifts x', m.x === 15, m);
}

{
  MP.setSource({ width: 80, height: 60 });
  MP.setFilter('kodak');
  MP.adj.brightness = 0.2;
  MP.adj.vignette = 0.4;
  MP.setCrop({ x: 4, y: 4, w: 40, h: 30 });
  const st = MP.getState();
  MP.resetAdj();
  check('reset clears look', MP.getFilter() === 'none' && MP.adj.brightness === 0);
  MP.setState(st);
  check('state roundtrip restores filter', MP.getFilter() === 'kodak');
  check('state roundtrip restores adj', Math.abs(MP.adj.brightness - 0.2) < 1e-9 && Math.abs(MP.adj.vignette - 0.4) < 1e-9);
  const c = MP.getCrop();
  check('state roundtrip restores crop', c.x === 4 && c.w === 40, c);
}

{
  MP.setSource({ width: 40, height: 40 });
  check('full crop is full', MP.isFullCrop() === true);
  MP.setCrop({ x: 2, y: 2, w: 10, h: 10 });
  check('shrunk crop is not full', MP.isFullCrop() === false);
}

// ---- source scan ----------------------------------------------------------
{
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const mp = fs.readFileSync(path.join(APP, 'mp.js'), 'utf8');
  const listing = fs.readFileSync(path.join(APP, 'listing.json'), 'utf8');
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));

  check('Take photo button exists', /id="photoBtn"/.test(html));
  check('empty state exists', /id="empty"/.test(html));
  check('aspect chips exist', /id="aspects"/.test(html) && /1:1/.test(html));
  check('44px tap targets', /min-height:\s*44px/.test(css));
  check('safe-area insets', /safe-area-inset/.test(css));
  check('takePhoto is called', /takePhoto/.test(app));
  check('drop is wired', /addEventListener\(\s*['"]drop['"]/.test(app));
  check('picture is saved in pic collection', /db\('pic'\)/.test(app) && /id:\s*'pic'/.test(app));
  check('recipe is saved in save collection', /db\('save'\)/.test(app) && /id\s*=\s*'edit'/.test(app));
  check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
  check('tells you to press Invite', /Invite/.test(mp) && /Invite/.test(html));
  check('no Play together button', !/Play together/.test(html));
  check('no CDN / http in html', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  check('classic scripts', !/type=["']module["']/.test(html));
  check('camera capability', manifest.capabilities.camera === true);
  check('minBuild stays 947', manifest.minBuild === 947);
  check('pic is private', manifest.data.pic.visibility === 'private');
  check('room is read-only', manifest.data.room.visibility === 'read-only');
  check('listing does not mention internals', !/gifos\.db|WASM|sandbox|localStorage|WebGL/.test(listing));
  check('help covers take / crop / save', /Take photo/.test(help) && /corner/.test(help) && help.length > 400);
  check('onBack is wired', /onBack/.test(app));
  check('error path for a non-picture', /not a picture/.test(app));
}

if (failures) {
  console.log('\n' + failures + ' failed');
  process.exit(1);
}
console.log('\nAll PASS');
