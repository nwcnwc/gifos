// THE HOUSE HAS TO BE ENTERABLE, AND THE FILE HAS TO BE THE SAVE.
//
// The wrap around arturkot/the-house-game is DOM/jQuery/SoundManager — it
// will not boot in a vm without a browser. What we CAN pin here, without
// guessing, is the port's own contract: pictures remap onto packed bytes,
// a save round-trip restores room + inventory onto the SAME arrays the
// room generator hides items with, phone taps are wired, Flash is not,
// and the first room still has a note you can pick up.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'the-house');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function read(rel) {
  return fs.readFileSync(path.join(APP, rel), 'utf8');
}

function loadPort() {
  const sandbox = {
    console,
    HOUSE_TEST: true,
    HOUSE_IMAGES: {
      'images/room_note.png': 'data:image/png;base64,NOTE',
      'images/intro_logo.png': 'data:image/png;base64,LOGO',
    },
    HOUSE_SOUNDS: {
      'sound/room.mp3': 'data:audio/mpeg;base64,ROOM',
      'sound/door.ogg': 'data:audio/ogg;base64,DOOR',
    },
    HOUSE_ROOMS: {
      'room.html': '<div id="room"><div id="note" data-info="paper"></div></div>',
      'intro.html': '<div id="intro"><p id="enter">Enter</p></div>',
    },
    Object, Array, JSON, String, Number, Boolean, Date, Math,
    parseInt, parseFloat, isNaN,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    styleSheets: [],
    addEventListener: function () {},
    documentElement: {},
  };
  vm.createContext(sandbox);
  vm.runInContext(read('app.js'), sandbox, { filename: 'app.js' });
  return sandbox;
}

const sandbox = loadPort();
const HP = sandbox.HousePort;
check('app.js loads in a vm and exposes HousePort', !!(HP && HP.remapSrc && HP.fillArray && HP.snapshotStore && HP.restoreStore));

// ---- packed pictures and sounds, including SM2's pathname concat ------------
{
  check('images/room_note.png remaps onto a data URI',
    HP.remapSrc('images/room_note.png') === 'data:image/png;base64,NOTE');
  check('relative ../images still remaps',
    HP.remapSrc('../images/intro_logo.png') === 'data:image/png;base64,LOGO');
  check('sound/room.mp3 remaps',
    HP.remapSrc('sound/room.mp3') === 'data:audio/mpeg;base64,ROOM');
  check('SM2 srcdocsound/door.ogg (pathname + sound/) remaps',
    HP.remapSrc('srcdocsound/door.ogg') === 'data:audio/ogg;base64,DOOR');
  check('a data URI is left alone',
    HP.remapSrc('data:image/png;base64,NOTE') === 'data:image/png;base64,NOTE');
  const html = HP.remapHtml('<img src="images/room_note.png">');
  check('remapHtml rewrites img src', html.indexOf('data:image/png;base64,NOTE') !== -1);
  const css = HP.remapCssUrls('background:url(../images/intro_logo.png)');
  check('remapCssUrls rewrites url()', css.indexOf('data:image/png;base64,LOGO') !== -1);
  check('room.html is a known room', HP.roomKey('room.html') === 'room.html');
  check('room.html?cachebust is the same room', HP.roomKey('room.html?123') === 'room.html');
}

// ---- save: the file is the save, and collected stays the room's array -------
{
  const mem = {
    v: 9,
    collected: ['note'],
    used: ['key'],
    played: ['scene_intro'],
    is_in: 'room',
    fish: ['window'],
    temp_path: [],
    note_room: 'room',
    note_info: 'Some kind of illustration. Interesting... Might be useful.',
  };
  const store = Object.assign({}, mem);
  store.collected = mem.collected.slice();
  store.used = mem.used.slice();
  store.played = mem.played.slice();
  store.fish = mem.fish.slice();
  const jst = {
    _s: {},
    get: function (k, d) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : d; },
    set: function (k, v) { this._s[k] = v; return v; },
    index: function () { return Object.keys(this._s); },
  };
  HP.restoreStore(jst, store);
  check('restore writes is_in', jst.get('is_in') === 'room');
  check('restore writes collected', (jst.get('collected') || []).indexOf('note') !== -1);
  check('restore writes the note\'s room', jst.get('note_room') === 'room');

  const snap = HP.snapshotStore(jst);
  check('snapshot round-trips is_in + collected',
    snap.is_in === 'room' && (snap.collected || []).indexOf('note') !== -1);

  // The original room generator hides items via room.settings.collected_items,
  // which is a REFERENCE to the global collected array from data.js. A
  // reassignment (`collected = jStorage.get(...)`) leaves the room looking
  // at the empty array from first boot — the note is still on the desk, the
  // tray already has it. fillArray must mutate in place.
  const collected = [];
  const used = [];
  const bound = collected;
  HP.fillArray(collected, jst.get('collected', []));
  HP.fillArray(used, jst.get('used', []));
  check('fillArray keeps the same array the room is bound to', collected === bound);
  check('…and that array now holds the note', collected.indexOf('note') !== -1, collected);
  check('…and used still holds the key', used.indexOf('key') !== -1, used);

  // Picking the note up (what items.take does to jStorage) then snapshotting
  // is the save the next boot must restore.
  const afterTake = HP.snapshotStore(jst);
  afterTake.collected = collected.slice();
  const jst2 = {
    _s: {},
    get: function (k, d) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : d; },
    set: function (k, v) { this._s[k] = v; return v; },
    index: function () { return Object.keys(this._s); },
  };
  HP.restoreStore(jst2, afterTake);
  const again = [];
  HP.fillArray(again, jst2.get('collected', []));
  check('a second boot still has the note in inventory', again.indexOf('note') !== -1);
  check('…and is still in the room', jst2.get('is_in') === 'room');
}

// ---- the engine can walk the first room: a note exists, and taking it is wired
{
  const roomHtml = read('vendor/room.html');
  const gameJs = read('vendor/js/game.js');
  const itemsJs = read('vendor/js/items.js');
  check('first room markup has a #note hotspot', /id=["']note["']/.test(roomHtml));
  check('first room note carries data-info (the examine text)', /id=["']note["'][^>]*data-info=/.test(roomHtml));
  check('game.room walks to the desk and items.take("#note")',
    gameJs.indexOf("items.take('#note')") !== -1 || gameJs.indexOf('items.take("#note")') !== -1);
  check('items.take writes collected into jStorage',
    itemsJs.indexOf("$.jStorage.set('collected'") !== -1);
  check('items.take records the room the thing came from',
    itemsJs.indexOf('_room') !== -1);
  check('the corridor door is a hotspot too', /id=["']door_exit["']/.test(roomHtml));
}

// ---- source scan: phone taps, no Flash, the file is the save ---------------
{
  const app = read('app.js');
  const boot = read('boot.js');
  const patch = read('patch.js');
  const listing = JSON.parse(read('listing.json'));
  const help = read('help.md');
  const wrap = boot + patch + app;

  check('gifos.db("save") is the save', app.indexOf("db('save')") !== -1);
  check('a phone tap synthesizes click (touchend)', app.indexOf('touchend') !== -1);
  check('Back closes a close-up, not the house', app.indexOf('onBack') !== -1);
  // SM2 V2.97a.2011 cannot createSound without Flash (null._createSound,
  // measured in the sandbox) — patch.js replaces it with an HTML5 Audio shim.
  check('soundManager is the HTML5 Audio shim, not Flash-era SM2',
    boot.indexOf('SM2_DEFER') !== -1 && patch.indexOf('useHTML5Audio') !== -1 &&
    patch.indexOf('new Audio') !== -1 && patch.indexOf('onfinish') !== -1 &&
    patch.indexOf('stopAll') !== -1 && patch.indexOf('unmute') !== -1);
  check('onready is held until the save is in', patch.indexOf('__houseReleaseSM') !== -1);
  check('Flash is ignored', patch.indexOf('ignoreFlash') !== -1);
  check('the wrap does not point at a .swf', !/\.swf/i.test(wrap));
  check('resume skips the splash when is_in is set', app.indexOf('skipIntro') !== -1);
  check('room.settings.collected_items is rebound', app.indexOf('collected_items') !== -1);

  check('listing leads with why this copy (offline)', /^Works offline/i.test(listing.description));
  check('tagline says the file is the save', /file/i.test(listing.tagline) && /save/i.test(listing.tagline));
  check('listing claims a tap, and no Flash', /Tap/i.test(listing.description) && /Flash/i.test(listing.description));
  check('listing is an unofficial port of The House', listing.basedOn && listing.basedOn.name === 'The House' && listing.basedOn.blessed === false);
  check('author is Artur Kot, not GifOS', listing.author && listing.author.name === 'Artur Kot');
  check('help tells you the file is the save', /file you keep is the save/i.test(help));
  check('help mentions tap', /Tap/i.test(help));
  check('help does not name gifos.db', help.indexOf('gifos.db') === -1);

  const man = JSON.parse(read('manifest.json'));
  check('db only — no network, no fullscreen, no fake multiplayer',
    man.capabilities && man.capabilities.db === true && !man.capabilities.network && !man.capabilities.fullscreen && !man.capabilities.multiplayer);
  check('save collection is private', man.data && man.data.save && man.data.save.visibility === 'private');
  // minBuild 1206 = 0.9.6, the first runtime whose replyAsset serves packed
  // .assets/ files — on anything older the house would boot artless and mute.
  check('minBuild is 1206 (packed .assets/ serving)', man.minBuild === 1206);

  const html = read('index.html');
  check('first-run is a house assembling, not a black frame', html.indexOf('id="house-boot"') !== -1);
  check('the boot card is a gauge — bar and note, not a mood',
    html.indexOf('id="house-boot-bar"') !== -1 && html.indexOf('id="house-boot-note"') !== -1);
  // THE WEIGHT RULE (measured 2026-08-24): art/sound inlined as base64 script
  // chunks made the app document 24 MB, and the vendor CSS preloader's regex
  // over the data-URI-baked CSSOM backtracked catastrophically — the page
  // wedged for minutes with every timer dead. Art rides .assets/, the app
  // document stays light, and the preloader is replaced with a map walk.
  check('no inline picture/sound chunk scripts in index.html',
    !/src="images/.test(html) && !/src="sounds/.test(html));
  check('the asset index and fonts are deferred so the card can paint',
    /src="assets-index\.js" defer/.test(html) && /src="fonts\.js" defer/.test(html));
  const build = read('build.mjs');
  check('the packer sends art and sound as raw .assets/ files',
    build.indexOf(".assets/' + key") !== -1 && build.indexOf('assetIndex[key]') !== -1);
  check('the packer enforces the app-document weight ceiling',
    build.indexOf('app document too heavy') !== -1);
  const appSrc = read('app.js');
  check('the vendor CSS preloader is replaced, never allowed to scrape the CSSOM',
    appSrc.indexOf('$.preloadCssImages = function') !== -1 && appSrc.indexOf('patchPreloader') !== -1);
  check('blob sounds carry a type hint (SM2 sniffs extensions, blobs have none)',
    appSrc.indexOf('soundMime') !== -1);
  check('the boot gauge moves by bytes, not vibes',
    appSrc.indexOf('HOUSE_ASSET_INDEX') !== -1 && appSrc.indexOf('house-boot-bar') !== -1);
}

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nall PASS');
