// Yopass has to actually lock, open, and burn.
//
// Crypto is Web Crypto AES-GCM in crypto.js; room screens live in core.js.
// Both are classic IIFEs, so the suite loads the shipped source in a vm and
// PLAYS the loop: lock → unlock, wrong passphrase, empty secret, burn-after-
// read, expiry, guest waiting / already-burned. DOM-only rules (phone, copy,
// no in-app Invite) are source-scanned — a line that must stay is better
// guarded by a grep than by a browser suite that cannot launch.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'yopass');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load() {
  const sandbox = {
    console,
    crypto: webcrypto,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder, TextDecoder, Uint8Array, Promise, Date, String, Number, Boolean, Object, Array,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of ['crypto.js', 'core.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

function src(name) {
  return fs.readFileSync(path.join(APP, name), 'utf8');
}

const S = load();
const Crypto = S.YopassCrypto;
const Core = S.YopassCore;

check('crypto.js and core.js attach', !!(Crypto && Crypto.lock && Crypto.unlock && Core && Core.makeRow && Core.screen));

const MAIN = [];

MAIN.push(async () => {
  const rec = await Crypto.lock('hello-secret', 'correct horse');
  check('passphrase lock sets hasPass + salt, not a raw key',
    !!(rec && rec.hasPass && rec.ct && rec.iv && rec.salt && !rec.key));
  const plain = await Crypto.unlock(rec, 'correct horse');
  check('passphrase lock/open roundtrips', plain === 'hello-secret', plain);

  let wrongMsg = '';
  try {
    await Crypto.unlock(rec, 'wrong');
    wrongMsg = 'did-not-throw';
  } catch (e) {
    wrongMsg = String(e && e.message || e);
  }
  check('wrong passphrase is honest', /wrong passphrase/i.test(wrongMsg), wrongMsg);

  let needMsg = '';
  try {
    await Crypto.unlock(rec, '');
    needMsg = 'did-not-throw';
  } catch (e) {
    needMsg = String(e && e.message || e);
  }
  check('empty passphrase on a locked secret is honest', /needs a passphrase/i.test(needMsg), needMsg);
});

MAIN.push(async () => {
  const rec = await Crypto.lock('plain-token', '');
  check('no-pass lock carries a key and not hasPass', !!(rec && !rec.hasPass && rec.key && rec.ct && rec.iv));
  const plain = await Crypto.unlock(rec, null);
  check('no-pass lock/open roundtrips', plain === 'plain-token', plain);

  const flipped = rec.ct.slice(0, 4) === 'AAAA' ? 'BBBB' + rec.ct.slice(4) : 'AAAA' + rec.ct.slice(4);
  let tamperMsg = '';
  try {
    await Crypto.unlock(Object.assign({}, rec, { ct: flipped }), null);
    tamperMsg = 'did-not-throw';
  } catch (e) {
    tamperMsg = String(e && e.message || e);
  }
  check('tampered ciphertext is refused', /bytes were changed|could not open/i.test(tamperMsg), tamperMsg);
});

MAIN.push(async () => {
  const rec = await Crypto.lock('密码🔐\nline two', 'sëcret');
  const plain = await Crypto.unlock(rec, 'sëcret');
  check('unicode secret + passphrase roundtrips', plain === '密码🔐\nline two', plain);
});

MAIN.push(async () => {
  check('empty string is empty', Core.isEmpty('') === true);
  check('whitespace-only is empty', Core.isEmpty('  \n\t') === true);
  check('a real secret is not empty', Core.isEmpty('x') === false);
  check('null is empty', Core.isEmpty(null) === true);
});

MAIN.push(async () => {
  const out = await Crypto.lock('api-key-123', 'pw');
  const now = 1_000;
  const row = Core.makeRow(out, { burn: true, lifetime: '1h' }, { id: 'host' }, now);
  check('makeRow keeps ciphertext and burn', !!(row.ct && row.burn && row.hasPass && row.id === 'secret'));
  check('1h lifetime stamps expiresAt', row.expiresAt === now + Core.LIFE_MS['1h'], row.expiresAt);
  check('status locked while the timer runs', Core.status(row, now) === 'locked');
  check('status expired when the timer runs out', Core.status(row, now + Core.LIFE_MS['1h']) === 'expired');
  check('owner sees locked', Core.screen(row, { id: 'host' }, true, now) === 'locked');
  check('guest sees open', Core.screen(row, { id: 'guest' }, false, now) === 'open');
  check('guest with nothing sees waiting', Core.screen(null, { id: 'guest' }, false, now) === 'waiting');
  check('owner with nothing sees home', Core.screen(null, { id: 'host' }, true, now) === 'home');
  const gone = Core.burnRow({ id: 'guest' }, now + 5);
  check('burn row is burned', gone.burned === true && gone.id === 'secret');
  check('guest after burn sees gone', Core.screen(gone, { id: 'guest' }, false, now + 5) === 'gone');
  check('owner after burn sees gone (not the lock form)', Core.screen(gone, { id: 'host' }, true, now + 5) === 'gone');
  check('expired secret is gone for a guest', Core.screen(row, { id: 'guest' }, false, now + Core.LIFE_MS['1h']) === 'gone');
  const until = Core.makeRow(out, { burn: false, lifetime: '' }, { id: 'host' }, now);
  check('until-burned has no expiresAt', !until.expiresAt);
  check('until-burned stays locked', Core.status(until, now + Core.LIFE_MS['1w'] * 4) === 'locked');
});

MAIN.push(async () => {
  // Play the host→guest→burn loop the way the app does: lock, guest unlocks, burn.
  const out = await Crypto.lock('the-db-password', '');
  const host = { id: 'host' };
  const guest = { id: 'guest' };
  const row = Core.makeRow(out, { burn: true, lifetime: '1d' }, host, 50);
  check('guest arriving after lock is on the open screen', Core.screen(row, guest, false, 50) === 'open');
  const text = await Crypto.unlock(row, null);
  check('guest unlocks the secret', text === 'the-db-password');
  const after = Core.burnRow(guest, 51);
  check('after a burn-after-read open, the room is gone', Core.status(after, 51) === 'burned');
  check('a late guest sees already burned, not waiting', Core.screen(after, { id: 'late' }, false, 80) === 'gone');
  const copy = Core.goneCopy(after, 80);
  check('already-burned copy is honest', /burned/i.test(copy.title) && /will not open again/i.test(copy.lede), copy);
});

MAIN.push(async () => {
  const html = src('index.html');
  const css = src('style.css');
  const app = src('app.js');
  const listing = src('listing.json');
  const help = src('help.md');
  const manifest = JSON.parse(src('manifest.json'));

  check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html) && !/id=["'][^"']*invite/i.test(html));
  check('no in-app Share button', !/<button\b[^>]*>\s*Share\s*</i.test(html) && !/id=["'][^"']*share/i.test(html));
  check('Copy is a real control', /id="copyBtn"/.test(html) && /Copied on this device/.test(app));
  check('guest waiting screen exists', /id="waiting"/.test(html) && /Waiting/.test(html));
  check('already-burned screen exists', /id="gone"/.test(html) && /Already burned/.test(html));
  check('Back is registered', /gifos\.onBack/.test(app));
  check('phone tap targets: touch-action on buttons', /touch-action:\s*manipulation/.test(css));
  check('16px root font (no iOS zoom on focus)', /font:\s*16px/.test(css));
  check('clipboard write + fallback', /navigator\.clipboard/.test(app) && /execCommand/.test(app));
  check('no fetch / XHR / WebSocket in app code',
    !/fetch\(|XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(app + src('crypto.js') + src('core.js')));
  check('manifest has no network', !manifest.capabilities.network);
  check('room is read-write, save is private',
    manifest.data.room.visibility === 'read-write' && manifest.data.save.visibility === 'private');
  check('tagline says device to device', /device to device/i.test(JSON.parse(listing).tagline));
  check('listing does not mention gifos.db / WASM / sandbox',
    !/gifos\.db|WASM|sandbox|localStorage|WebRTC/.test(listing));
  check('help.md does not document Save/Steal', !/\bSave\b/.test(help) && !/\bSteal\b/.test(help));
  check('Open and burn warns the host', /Opening burns this secret/.test(app));
  check('burn-after-read does not yank the revealed screen', /revealing/.test(app) && /lastScreen === 'revealed'/.test(app));
  check('empty secret is refused in the UI', /Type a secret first/.test(app));
  check('guest cannot lock', /Only the person who opened the room can lock/.test(app));
  check('guest is gifos.info().owner === false',
    /gifos\.info/.test(app) && /inf\.owner !== false/.test(app));
});

MAIN.push(async () => {
  const ids = [
    'chip', 'chipText', 'home', 'locked', 'open', 'revealed', 'waiting', 'gone',
    'plain', 'plainCount', 'pass', 'passEye', 'life', 'burn', 'lockBtn', 'lockStatus',
    'lockedLede', 'lockedMeta', 'openMine', 'burnNow', 'newSecret',
    'openLede', 'openMeta', 'openPass', 'openPassRow', 'openPassEye', 'openBtn', 'openStatus',
    'revTitle', 'revText', 'revNote', 'copyBtn', 'hideBtn',
    'goneTitle', 'goneLede', 'goneLock'
  ];
  const els = {};
  function makeEl(id) {
    return {
      id, hidden: id !== 'home', className: '', textContent: '', value: '',
      checked: id === 'burn', disabled: false, type: id === 'pass' || id === 'openPass' ? 'password' : '',
      onclick: null, oninput: null, onkeydown: null, style: {},
      getAttribute() { return null; },
      setAttribute() {},
      querySelectorAll() { return []; }
    };
  }
  ids.forEach((id) => { els[id] = makeEl(id); });
  const label = { hidden: false };
  const sandbox = {
    console, crypto: webcrypto,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    TextEncoder, TextDecoder, Uint8Array, Promise, Date, String, Number, Boolean, Object, Array,
    setInterval() { return 0; }, clearInterval() {},
    document: {
      getElementById: (id) => els[id] || null,
      querySelector: (sel) => /openPass/.test(sel) ? label : els.life,
      createElement: () => ({ value: '', setAttribute() {}, style: {}, select() {} }),
      body: { appendChild() {}, removeChild() {} },
      execCommand() { return false; }
    },
    navigator: { clipboard: null }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const room = { rows: {}, subs: [] };
  sandbox.gifos = {
    db(name) {
      if (name !== 'room' && name !== 'save') return null;
      const bag = name === 'room' ? room : { rows: {}, subs: [] };
      return {
        put(r) { bag.rows[r.id] = r; return Promise.resolve(r); },
        get() { return Promise.resolve(null); },
        delete() { return Promise.resolve(true); },
        subscribe(cb) { bag.subs.push(cb); cb(Object.values(bag.rows)); }
      };
    },
    me() { return Promise.resolve({ id: 'guest', name: 'G' }); },
    info() { return Promise.resolve({ owner: false, appId: 'yopass' }); },
    onBack() {}
  };
  vm.createContext(sandbox);
  for (const f of ['crypto.js', 'core.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(APP, f), 'utf8'), sandbox, { filename: f });
  }
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  check('guest with an empty room sees waiting, not the lock form',
    els.waiting.hidden === false && els.home.hidden === true,
    { waiting: els.waiting.hidden, home: els.home.hidden, chip: els.chipText.textContent });
});

(async () => {
  for (const step of MAIN) await step();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
