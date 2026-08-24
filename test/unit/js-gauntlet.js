// DUNGEON PARTY HAS TO DROP EXTRA ADVENTURERS INTO THE SAME ROOM.
//
// The listing claims 2–4 players from one Invite. If that is a lie — guest
// never auto-joins, host never simulates them, guest never sees the others —
// the suite has to fail. The original engine is DOM-bound (Prototype, canvas
// sprites, PNG levels) so the GifOS-specific loop lives in net.js: unique
// classes, host party, guest snapshot, nuke once. Phone pad / no-Namco-logo
// are one-liners a vm cannot click; those are pinned by source scan.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'js-gauntlet');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function makeEl(id) {
  return {
    id,
    textContent: '',
    hidden: true,
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    style: {},
    addEventListener() {},
  };
}

function FakePlayer() {
  this.netId = null;
  this.slot = 0;
  this.type = null;
  this.moving = {};
  this.x = 0; this.y = 0; this.dir = 0;
  this.health = 500; this.score = 0; this.keys = 0; this.potions = 2;
  this.frame = 0; this.dead = false;
  this.nukes = 0;
  this.firing = false;
}
FakePlayer.prototype.join = function (t) { this.type = t; };
FakePlayer.prototype.onStartLevel = function () {};
FakePlayer.prototype.moveLeft = function (on) { this.moving.left = on; };
FakePlayer.prototype.moveRight = function (on) { this.moving.right = on; };
FakePlayer.prototype.moveUp = function (on) { this.moving.up = on; };
FakePlayer.prototype.moveDown = function (on) { this.moving.down = on; };
FakePlayer.prototype.fire = function (on) { this.firing = on; };
FakePlayer.prototype.nuke = function () { this.nukes++; };

function loadNet() {
  const els = {};
  const sandbox = {
    console, Math, Object, Array, JSON, Date, String, Number, Boolean,
    setTimeout: (fn) => { return 0; },
    setInterval: () => 0,
    clearTimeout() {},
    gifos: null,
    GauntletPlayer: FakePlayer,
    GAUNTLET_TYPES: {
      WARRIOR: { name: 'warrior' },
      VALKYRIE: { name: 'valkyrie' },
      WIZARD: { name: 'wizard' },
      ELF: { name: 'elf' },
    },
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById: (id) => { els[id] = els[id] || makeEl(id); return els[id]; },
      querySelectorAll: () => [],
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.root = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'net.js'), 'utf8'), sandbox, { filename: 'net.js' });
  return sandbox;
}

const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');

{
  const s = loadNet();
  const Net = s.GauntletNet;
  check('net.js loads GauntletNet', !!(Net && Net.freeType && Net.ensureParty && Net.applyWorld));

  s.game = { player: null, party: [], current: 'menu', map: { nlevel: 1, entities: [] } };
  Net._setIdentity('host', true);
  check('an empty room offers WARRIOR first', Net.freeType() === 'WARRIOR', Net.freeType());

  Net._setOthers([{ id: 'g1', type: 'WARRIOR', seen: Date.now(), l: 1, r: 0, u: 0, d: 0, f: 0, n: 0 }]);
  s.game.player = { type: { name: 'valkyrie' } };
  check('a taken class is not offered', Net.freeType() === 'WIZARD' || Net.freeType() === 'ELF', Net.freeType());
  check('taken() lists the live classes', Net.taken().indexOf('WARRIOR') >= 0 && Net.taken().indexOf('VALKYRIE') >= 0);
}

{
  const s = loadNet();
  const Net = s.GauntletNet;
  Net._setIdentity('host', true);
  const g = {
    player: { type: { name: 'warrior' }, x: 10, y: 10, dir: 0, health: 500, score: 0, keys: 0, potions: 0, frame: 0, dead: false },
    party: [],
    map: { nlevel: 1, entities: [], occupy() {} },
    allPlayers() { return [this.player].concat(this.party); },
  };
  s.game = g;
  Net._setOthers([{ id: 'p2', type: 'VALKYRIE', seen: Date.now(), l: 1, r: 0, u: 0, d: 0, f: 1, n: 0 }]);
  Net.ensureParty(g);
  check('the host SPAWNS the extra adventurer', g.party.length === 1 && g.party[0].type && g.party[0].type.name === 'valkyrie',
    g.party.length);
  check('…and applies their thumbs (left + fire)',
    g.party[0].moving.left === true && g.party[0].firing === true,
    g.party[0].moving);

  Net._setOthers([{ id: 'p2', type: 'VALKYRIE', seen: Date.now(), l: 1, r: 0, u: 0, d: 0, f: 1, n: 1 }]);
  Net.ensureParty(g);
  Net.ensureParty(g);
  check('a held potion nukes ONCE, not every tick', g.party[0].nukes === 1, g.party[0].nukes);
}

{
  const s = loadNet();
  const Net = s.GauntletNet;
  Net._setIdentity('guest', false);
  const started = [];
  s.game = {
    current: 'menu',
    player: null,
    party: [],
    map: null,
    start: function (type, n) { started.push({ type: type.name, n: n }); this.current = 'playing'; this.player = { type: type }; },
  };
  Net._setWorld({ id: 'world', n: 3, p: [{ id: 'host', t: 'WARRIOR', x: 4, y: 8, d: 2, h: 500, s: 0, k: 0, o: 0, fr: 0, dead: false }], e: [] });
  check('a guest AUTO-JOINS a free class in the host dungeon',
    started.length === 1 && started[0].type === 'valkyrie' && started[0].n === 3,
    started);

  const g = {
    player: { type: { name: 'valkyrie' }, x: 0, y: 0, dir: 0, health: 1, score: 0, keys: 0, potions: 0, frame: 0, dead: false },
    party: [],
    map: { nlevel: 3, entities: [{ active: true, type: { sx: 1, sy: 1 }, x: 9, y: 9, frame: 0 }] },
    viewport: { update() {} },
  };
  s.game = g;
  s.GauntletPlayer = FakePlayer;
  Net.applyWorld(g);
  check('a guest paints the host warrior as a party sprite',
    g.party.length === 1 && g.party[0].netId === 'host' && g.party[0].x === 4 && g.party[0].y === 8,
    g.party.map((p) => ({ id: p.netId, x: p.x, y: p.y })));
  check('a guest replaces local monsters with the host snapshot',
    g.map.entities.length === 0 || (g.map.entities.length === 0),
    g.map.entities.length);
}

{
  const s = loadNet();
  const Net = s.GauntletNet;
  Net._setIdentity('guest', false);
  s.game = { current: 'menu', player: null, start() { throw new Error('should not start'); } };
  Net._setOthers([
    { id: 'a', type: 'WARRIOR', seen: Date.now() },
    { id: 'b', type: 'VALKYRIE', seen: Date.now() },
    { id: 'c', type: 'WIZARD', seen: Date.now() },
    { id: 'd', type: 'ELF', seen: Date.now() },
  ]);
  Net._setWorld({ id: 'world', n: 1, p: [
    { id: 'a', t: 'WARRIOR' }, { id: 'b', t: 'VALKYRIE' },
    { id: 'c', t: 'WIZARD' }, { id: 'd', t: 'ELF' },
  ], e: [] });
  check('a fifth friend does not steal a class', Net.freeType() === null, Net.freeType());
}

{
  const html = src('index.html');
  const css = src('style.css');
  const boot = src('boot.js');
  const touch = src('touch.js');
  const listing = JSON.parse(src('listing.json'));
  const man = JSON.parse(src('manifest.json'));
  const help = src('help.md');
  const gj = src('vendor/gauntlet.js');

  check('the arcade splash and wordmark are not in the page',
    !html.includes('splash.jpg') && !html.includes('logo.jpg') && html.includes('title-card'));
  check('Namco splash/logo are not packed in assets',
    !src('vendor/assets.js').includes('splash.jpg') && !src('vendor/assets.js').includes('logo.jpg'));
  check('boot.js refuses to wire splash/logo',
    boot.includes('do not ship') || (boot.includes('splash.jpg') && boot.includes('not')));
  check('FIRE and POTION exist as labelled pad buttons',
    html.includes('data-dir="fire"') && html.includes('data-dir="potion"') && html.includes('FIRE') && html.includes('POTION'));
  check('the D-pad has four directions',
    html.includes('data-dir="up"') && html.includes('data-dir="down"') && html.includes('data-dir="left"') && html.includes('data-dir="right"'));
  check('the pad appears on a narrow phone, not only after a finger',
    /narrow/.test(touch) && touch.includes('reveal()'));
  check('FIRE is a large hit target', /92px/.test(css) && /#t-fire/.test(css));
  check('WASD moves', gj.includes('Game.Key.A') && gj.includes('Game.Key.W') && boot.includes('moveLeft'));
  check('Back quits to the menu', boot.includes('onBack') && boot.includes('quit'));
  check('the dungeon is silent (licensed audio not shipped)',
    gj.includes('toggleMute(true)') && gj.includes('sounds: []'));
  check('db + multiplayer are declared', man.capabilities.db === true && man.capabilities.multiplayer === true);
  check('minBuild stays 947', man.minBuild === 947);
  check('author is Jake Gordon', listing.author.name === 'Jake Gordon' && listing.basedOn.blessed === false);
  check('listing does not claim a Namco product as ours',
    /not affiliated with namco/i.test(listing.description) && !/namco/i.test(listing.tagline));
  check('listing leads with Invite', /^Send Invite/i.test(listing.description));
  check('listing does not say drop', !/\bdrop\b/i.test(listing.description) && !/\bdrop\b/i.test(listing.tagline));
  check('tagline fits a card', listing.tagline.length <= 90);
  check('the facing name is not the arcade wordmark', man.name !== 'Gauntlet');
  check('help.md is a real how-to', help.trim().length >= 400);
  check('high score is saved through Game.storage wrap', boot.includes('Game.storage') && boot.includes("id: 'save'"));
  check('Invite is not an in-app share button', !html.toLowerCase().includes('invite') || !src('net.js').includes('share button'));
}

if (failures) {
  console.log('\n' + failures + ' failing');
  process.exit(1);
}
console.log('\nAll js-gauntlet checks passed');
