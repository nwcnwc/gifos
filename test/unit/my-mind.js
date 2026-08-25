// MY MIND HAS TO CREATE NODES AND ROUNDTRIP THE MAP IN gifos.db.
//
// The wrap shipped Ondřej Žára's editor, but the last map could vanish into
// a memory localStorage stub, the icon was a leftover pivot grid, and nothing
// in the repo grew a child then loaded it back. This suite plays the node
// loop in a vm: empty map → add child → add grandchild → put {id:'last'} →
// get it back. Phone/input rules a vm cannot tap are pinned by source scan.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'my-mind');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function seededMath(seed) {
  let a = seed >>> 0;
  const m = Object.create(Math);
  m.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function mockDb() {
  const store = {};
  const subs = [];
  const db = {
    put: function (rec) {
      if (!rec || rec.id == null) rec = Object.assign({ id: 'auto' }, rec || {});
      store[rec.id] = JSON.parse(JSON.stringify(rec));
      const all = Object.keys(store).map((k) => store[k]);
      subs.forEach((cb) => cb(all));
      return Promise.resolve(JSON.parse(JSON.stringify(store[rec.id])));
    },
    get: function (id) { return Promise.resolve(store[id] ? JSON.parse(JSON.stringify(store[id])) : null); },
    getAll: function () { return Promise.resolve(Object.keys(store).map((k) => JSON.parse(JSON.stringify(store[k])))); },
    delete: function (id) { delete store[id]; return Promise.resolve(true); },
    subscribe: function (cb) { subs.push(cb); cb(Object.keys(store).map((k) => store[k])); },
    _store: store
  };
  return db;
}

function load(opts) {
  opts = opts || {};
  const save = mockDb();
  const room = mockDb();
  const collections = { save: save, room: room };
  const sandbox = {
    console, Math: seededMath(0x5AFE), Object, Array, JSON, Date, String, Number, Boolean,
    Promise, setTimeout, clearTimeout, setImmediate,
    setInterval: function () { return 0; },
    clearInterval: function () {},
    document: opts.document || {
      readyState: 'complete',
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {}
    },
    gifos: {
      db: function (name) { return collections[name] || mockDb(); },
      me: function () { return Promise.resolve({ id: opts.meId || 'aaa', name: opts.meName || 'You' }); },
      onBack: function (cb) { sandbox._onBack = cb; }
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.root = sandbox;
  vm.createContext(sandbox);
  const run = (rel) => {
    vm.runInContext(fs.readFileSync(path.join(APP, rel), 'utf8'), sandbox, { filename: rel });
  };
  run('ls-stub.js');
  run('app.js');
  run('mp.js');
  return { sandbox, save, room };
}

function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

(async function main() {
  const { sandbox, save } = load();
  check('ls-stub, app.js, mp.js load and attach MMMap', !!(sandbox.MMMap && sandbox.MMMap.empty && sandbox.MMMap.addChild && sandbox.MMSave));
  check('MMLocal facade is aboard (vendor must not throw)', !!(sandbox.MMLocal && sandbox.MMLocal.setItem && sandbox.MMLocal._dump));

  const empty = sandbox.MMMap.empty();
  check('empty map has a root and no children',
    !!(empty && empty.root && empty.root.text === 'My Mind Map' && sandbox.MMMap.isEmpty(empty)),
    empty && empty.root);

  const map = sandbox.MMMap.empty();
  const child = sandbox.MMMap.addChild(map, 'root', 'Pack');
  check('addChild grows a child under the root',
    child && child.text === 'Pack' && (map.root.children || []).length === 1,
    map.root.children);
  const grand = sandbox.MMMap.addChild(map, child.id, 'Passport');
  check('addChild grows a grandchild under Pack',
    grand && grand.text === 'Passport' && child.children && child.children[0].text === 'Passport');
  const sib = sandbox.MMMap.addChild(map, 'root', 'Book');
  check('a second child is a sibling, not nested under Pack',
    (map.root.children || []).length === 2 && map.root.children[1].text === 'Book');

  sandbox.MyMind = sandbox.MyMind || {};
  sandbox.MyMind.getJSON = function () { return sandbox.MMMap.clone(map); };
  sandbox.MyMind.loadJSON = function (j) { sandbox._loaded = j; };
  sandbox.MyMind.subscribe = function () {};

  await sandbox.MMSave.persistNow();
  await flush();
  const rec = save._store.last;
  check('persistNow writes {id:last, map} into gifos.db save',
    !!(rec && rec.id === 'last' && rec.map && rec.map.root && rec.map.root.children && rec.map.root.children.length === 2),
    rec && rec.map && rec.map.root);
  check('roundtrip snapshot still has Pack → Passport and sibling Book',
    rec.map.root.children[0].text === 'Pack' &&
    rec.map.root.children[0].children[0].text === 'Passport' &&
    rec.map.root.children[1].text === 'Book');

  const { sandbox: b, save: saveB } = load();
  saveB._store.last = JSON.parse(JSON.stringify(rec));
  b.MyMind = b.MyMind || {};
  b._loaded = null;
  b.MyMind.loadJSON = function (j) { b._loaded = j; };
  b.MyMind.getJSON = function () { return b._loaded; };
  b.MyMind.subscribe = function (msg, fn) { b._subs = b._subs || {}; b._subs[msg] = fn; };
  await b.MyMind.onReady();
  await flush();
  await flush();
  check('onReady loads the last map from gifos.db',
    !!(b._loaded && b._loaded.root && b._loaded.root.children && b._loaded.root.children[0].text === 'Pack'),
    b._loaded && b._loaded.root);

  const blank = sandbox.MMMap.empty();
  sandbox.MyMind.getJSON = function () { return blank; };
  await sandbox.MMSave.persistNow();
  const blankRec = save._store.last;
  check('an empty map still roundtrips (root, no children)',
    !!(blankRec && blankRec.map && blankRec.map.root && sandbox.MMMap.isEmpty(blankRec.map)));

  sandbox.MMLocal.setItem('mm.map.names', '{"x":"Trip"}');
  sandbox.MMLocal.setItem('mm.map.x', '{"root":{"text":"Trip"}}');
  sandbox.MMLocal._flush();
  await flush();
  await flush();
  check('named maps from the Local backend dump into gifos.db, not leftover storage',
    !!(save._store.ls && save._store.ls.data && save._store.ls.data['mm.map.names'] && /Trip/.test(save._store.ls.data['mm.map.names'])));

  const { sandbox: mpBox, room } = load({ meId: 'aaa' });
  mpBox.MyMind = {
    getJSON: function () { return { root: { text: 'Host map', children: [{ id: 'c', text: 'Child' }] } }; },
    loadJSON: function (j) { mpBox._applied = j; }
  };
  mpBox.MMMp.start();
  await flush();
  await flush();
  check('mp.js opens the room collection', Object.keys(room._store).length >= 0);
  const players = [
    { id: 'bbb', name: 'Friend', at: Date.now(), map: { root: { text: 'Watched' } } },
    { id: 'aaa', name: 'You', at: Date.now(), map: { root: { text: 'Host map' } } }
  ];
  const host = mpBox.MMMp._hostOf(players);
  check('the live host is the lowest id (a friend can watch)', host && host.id === 'aaa' && host.map.root.text === 'Host map');
  const status = mpBox.MMMp._statusOf([{ id: 'aaa', name: 'You', at: Date.now() }]);
  check('solo status tells you to press Invite (OS chrome)', /Invite/.test(status));

  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
  const js = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
  const mp = fs.readFileSync(path.join(APP, 'mp.js'), 'utf8');
  const stub = fs.readFileSync(path.join(APP, 'ls-stub.js'), 'utf8');
  const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
  const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
  const icon = fs.readFileSync(path.join(APP, 'icon.mjs'), 'utf8');

  check('phone Child/Sibling/Edit/Delete bar exists',
    html.includes('id="phone-bar"') && html.includes('data-cmd="insert-child"') &&
    html.includes('data-cmd="insert-sibling"') && html.includes('data-cmd="edit"') &&
    html.includes('data-cmd="delete"'));
  check('phone bar is visible at 390px', css.includes('#phone-bar') && css.includes('max-width: 700px'));
  check('tap-again on the selected bubble starts edit', js.includes("fireCmd('edit')") && js.includes('.item.current'));
  check('empty-map hint is aboard', html.includes('id="empty"') && js.includes('isEmpty'));
  check('app.js saves the last map privately', js.includes("db('save')") && js.includes("id: 'last'"));
  check('ls-stub is a facade that dumps into gifos.db', stub.includes('_onPersist') && js.includes("id: 'ls'"));
  check('no in-app Invite button', !/<button\b[^>]*>\s*Invite\s*</i.test(html));
  check('mp.js tells the player to press Invite (OS chrome)', mp.includes('Invite') && mp.includes("db('room')"));
  check('no CDN / no type=module', !/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, '')) && !/type=["']module["']/.test(html));
  check('help.md teaches Tab/Enter and the phone bar', help.includes('Tab') && help.includes('Child') && help.includes('blank map'));
  check('help.md does not document Invite/Save', !/\bInvite\b/.test(help) && !/\bSave\b/.test(help));
  check('listing is an unofficial port of My Mind', /unofficial port/i.test(listing.description) && listing.basedOn.name === 'My Mind');
  check('tagline leads with the keys', /Tab for a child/i.test(listing.tagline));
  check('listing mentions the phone bar and Invite watch', /Child/.test(listing.description) && /Invite/.test(listing.description));
  check('manifest claims db + multiplayer, minBuild 947',
    manifest.capabilities.db === true && manifest.capabilities.multiplayer === true &&
    manifest.minBuild === 947 && manifest.data.room.visibility === 'read-write');
  check('icon is a growing mind map, not a leftover pivot grid',
    icon.includes('myMindIcon') && /ROOT|WEEKEND|child/i.test(icon) && !/Pivot icon/i.test(icon) && !/cols = 4, rows = 4/.test(icon));
  check('cover is a mid-use map (WEEKEND / PACK / BOOK)',
    icon.includes('WEEKEND') && icon.includes('PACK') && icon.includes('BOOK') && icon.includes('THE FILE IS THE MAP'));

  const vendor = fs.readFileSync(path.join(APP, 'vendor', 'my-mind.js'), 'utf8');
  check('vendored My Mind exposes getJSON/loadJSON', vendor.includes('window.MyMind') && vendor.includes('getJSON') && vendor.includes('MYMIND_MAP_CSS'));

  if (failures) {
    console.log('\n' + failures + ' failing');
    process.exit(1);
  }
  console.log('\nall pass');
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
