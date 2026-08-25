// AIM AND SHOOT HAS TO MOVE, FIRE, AND BREED.
//
// The port shipped a black figure on a dark page — you could not see yourself —
// and a phone pad whose FIRE sat at the top of the screen. This suite PLAYS
// the loop in a vm: hold up, the player leaves spawn; hold fire, a bullet
// exists; wipe the wave, the generation goes up. Layout and save are
// one-liners, so a source scan, not a browser.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'aim-and-shoot');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function seededMath(seed) {
  let a = seed >>> 0;
  const m = Object.create(Math);
  for (const k of Object.getOwnPropertyNames(Math)) {
    try { m[k] = Math[k]; } catch (e) {}
  }
  m.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return m;
}

function fakeCtx() {
  return {
    fillRect() {}, clearRect() {}, strokeRect() {},
    beginPath() {}, arc() {}, fill() {}, stroke() {}, save() {}, restore() {},
    translate() {}, rotate() {}, drawImage() {}, fillText() {},
    font: '', textAlign: 'center', fillStyle: '', strokeStyle: '',
    shadowColor: '', shadowBlur: 0, textBaseline: 'alphabetic',
  };
}

function fakeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    style: {},
    children: [],
    width: 128,
    height: 128,
    id: '',
    className: '',
    hidden: false,
    innerHTML: '',
    textContent: '',
    paused: true,
    src: '',
    currentTime: 0,
    dataset: {},
    parentNode: null,
    getContext: () => fakeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1366, height: 768, right: 1366, bottom: 768 }),
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) { el.children.push(c); if (c) c.parentNode = el; return c; },
    remove() { el.parentNode = null; },
    querySelector() { return el.children[0] || fakeEl('div'); },
    play() { el.paused = false; return Promise.resolve(); },
  };
  return el;
}

function load() {
  let now = 10_000;
  let raf = null;
  const body = fakeEl('body');
  const byId = {
    hi: fakeEl('div'),
    roster: fakeEl('div'),
    status: fakeEl('div'),
    pad: fakeEl('div'),
    'p-move': fakeEl('div'),
    'p-look': fakeEl('div'),
    'p-fire': fakeEl('button'),
  };
  byId['p-move'].appendChild(Object.assign(fakeEl('div'), { className: 'p-knob' }));
  const doc = {
    body,
    hidden: false,
    createElement(tag) {
      const el = fakeEl(tag);
      if (tag === 'canvas') { el.width = 1366; el.height = 768; }
      return el;
    },
    querySelector(sel) {
      if (sel === '#game') return body.children.find((c) => c.id === 'game') || null;
      return null;
    },
    getElementById(id) { return byId[id] || null; },
    addEventListener() {},
  };
  function FakeImage() {
    this.width = 1366;
    this.height = 768;
    this.complete = false;
    this._src = '';
    this._onload = null;
  }
  Object.defineProperty(FakeImage.prototype, 'src', {
    set(v) { this._src = v; this._maybe(); },
    get() { return this._src; },
  });
  Object.defineProperty(FakeImage.prototype, 'onload', {
    set(fn) { this._onload = fn; this._maybe(); },
    get() { return this._onload; },
  });
  FakeImage.prototype._maybe = function () {
    if (this._src && this._onload && !this.complete) {
      this.complete = true;
      this._onload();
    }
  };

  const sandbox = {
    console,
    Math: seededMath(0xA1A1),
    Object, Array, JSON, String, Number, Boolean, Promise, Error, TypeError,
    Date: { now: () => now, parse: Date.parse, UTC: Date.UTC },
    parseInt, parseFloat, isNaN, Infinity, NaN, undefined,
    requestAnimationFrame: (fn) => { raf = fn; return 1; },
    cancelAnimationFrame: () => { raf = null; },
    document: doc,
    Image: FakeImage,
    Audio: function () { return fakeEl('audio'); },
    navigator: { maxTouchPoints: 0 },
    matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }),
    addEventListener() {},
    setTimeout: (fn) => { fn(); return 0; },
    gifos: undefined,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const files = [
    'vendor/assets.js',
    'vendor/Player.js',
    'vendor/Bullet.js',
    'vendor/Matrix.js',
    'vendor/Dejavu.js',
    'vendor/Genetics.js',
    'vendor/GuiControls.js',
    'vendor/main.js',
    'boot.js',
  ].map((f) => fs.readFileSync(path.join(APP, f), 'utf8'));
  vm.runInContext(files.join('\n;\n'), sandbox, { filename: 'aim-and-shoot.js' });
  return {
    sandbox,
    tick(ms) {
      now += ms == null ? 16 : ms;
      if (raf) {
        const fn = raf;
        raf = null;
        fn();
      }
    },
    now: () => now,
  };
}

const run = load();
const AAS = run.sandbox.AAS;
check('vendor scripts boot and attach AAS', !!(AAS && AAS.player && AAS.startPlay));
check('a game starts on the title', AAS.isStarting === true, AAS.isStarting);

AAS.startPlay();
check('startPlay leaves the title', AAS.isStarting === false, AAS.isStarting);
check('the player is in the middle of the arena',
  AAS.player && Math.abs(AAS.player.pos.x - AAS.w / 2) < 1 && Math.abs(AAS.player.pos.y - AAS.h / 2) < 1,
  AAS.player && AAS.player.pos);

{
  const p = AAS.player;
  const y0 = p.pos.y;
  p.isMoving.up = true;
  for (let i = 0; i < 45; i++) run.tick(16);
  check('holding up MOVES the player', p.pos.y < y0 - 8, { from: y0, to: p.pos.y });
  p.isMoving.up = false;
}

{
  const p = AAS.player;
  const x0 = p.pos.x;
  p.isMoving.right = true;
  for (let i = 0; i < 45; i++) run.tick(16);
  check('holding right MOVES the player', p.pos.x > x0 + 8, { from: x0, to: p.pos.x });
  p.isMoving.right = false;
}

{
  const p = AAS.player;
  p.lookAt(p.pos.x + 100, p.pos.y);
  p.isShooting = true;
  const n0 = (AAS.bullets || []).length;
  for (let i = 0; i < 20; i++) run.tick(16);
  check('holding fire puts a bullet in the air', (AAS.bullets || []).length > n0,
    { bullets: (AAS.bullets || []).length, from: n0 });
  p.isShooting = false;
}

// THE GUN RELOADS. Upstream refilled the magazine only on frames a player
// was NOT shooting, so anything holding the trigger — a bot whose net says
// fire, or a phone player whose FIRE button had no way to come back up —
// fired ~20 shots once and was dry for the rest of its life.
{
  const p = AAS.player;
  p.lookAt(p.pos.x + 100, p.pos.y);
  p.isShooting = true;
  for (let i = 0; i < 400; i++) { p.health = 99; run.tick(16); }
  const drained = p.shootsFired;
  for (let i = 0; i < 200; i++) { p.health = 99; run.tick(16); }
  check('the gun still fires after a long hold on the trigger',
    p.shootsFired > drained, { after400: drained, after600: p.shootsFired });
  check('a held trigger never pins the magazine at empty forever',
    p.coolDown > 0 || p.shootsFired > drained, { coolDown: p.coolDown });
  p.isShooting = false;
  p.health = 10;
}

// THE PAD CAN LET GO. applyPad only ever raised isShooting; one tap of FIRE
// left the trigger held down for the rest of the run.
{
  const p = AAS.player;
  p.isShooting = false;
  AAS.pad.fire = true;
  p.health = 99;
  run.tick(16);
  check('FIRE on the pad pulls the trigger', p.isShooting === true, p.isShooting);
  AAS.pad.fire = false;
  p.health = 99;
  run.tick(16);
  check('releasing FIRE lets the trigger go', p.isShooting === false, p.isShooting);
  p.health = 10;
}

check('the arena takes the shape of its box, short side fixed',
  Math.min(AAS.w, AAS.h) === 620, { w: AAS.w, h: AAS.h });

{
  const g0 = AAS.generation;
  (AAS.enemies || []).forEach((e) => { e.health = 0; e.isDead = true; });
  run.tick(16);
  check('clearing the wave raises the generation', AAS.generation === g0 + 1,
    { from: g0, to: AAS.generation });
  check('a new wave of robots is in the arena', (AAS.enemies || []).length >= 1,
    (AAS.enemies || []).length);
}

{
  AAS.player.health = 0;
  run.tick(16);
  check('empty health is game over', AAS.player.isDead === true && AAS.isGameover === true,
    { dead: AAS.player.isDead, over: AAS.isGameover });
}

const src = (f) => fs.readFileSync(path.join(APP, f), 'utf8');
const html = src('index.html');
const boot = src('boot.js');
const main = src('vendor/main.js');
const css = src('style.css');
const help = src('help.md');
const listing = JSON.parse(src('listing.json'));
const manifest = JSON.parse(src('manifest.json'));

check('the playfield is the original light lab, not a dark void',
  main.includes('#ececec') && css.includes('#ececec') && !/background:\s*#111/.test(css));
check('the canvas keeps its aspect on a phone (contain, not a squash)',
  /#game[\s\S]{0,180}object-fit:\s*contain/.test(css));
check('the walls are ON SCREEN — a hazard band framing the canvas',
  html.includes('id="arena"') && /#arena[\s\S]{0,320}repeating-linear-gradient/.test(css) &&
  /#arena[\s\S]{0,200}padding:/.test(css));
check('the controls sit off the field on a phone',
  /body\.touch\s+#arena[\s\S]{0,200}bottom:/.test(css));
check('the field is sized from its box, not nailed to 1366x768',
  main.includes('fitArena') && main.includes('clientWidth') && main.includes('ARENA_SHORT'));
check('the gun reloads under fire, from the shell (Player.js is pinned)',
  boot.includes('coolDown') && boot.includes('Player.prototype.update'));
check('FIRE captures its pointer so a sliding thumb cannot hold it down',
  /function fireOn[\s\S]{0,400}capture\(fire/.test(boot));
check('phone pad markup is in the page (FIRE under the thumb)',
  html.includes('id="p-move"') && html.includes('id="p-fire"') && html.includes('id="p-look"'));
check('FIRE is a real button', /<button[^>]*id="p-fire"/.test(html));
check('no in-app Invite button', !/id=["']invite/i.test(html));
check('best generation is saved in gifos.db', boot.includes("db('save')"));
check('Back backs out of a run, then lets the OS close',
  boot.includes('onBack') && boot.includes('goTitle') && boot.includes('return false'));
check('phone pad is at least 80px FIRE / 128px stick',
  /#p-fire[^}]*width:\s*80px/.test(css) && /#p-move[^>]*width:\s*128px/.test(css) ||
  /#p-move[\s\S]{0,200}width:\s*128px/.test(css));
check('applyPad writes analog into the player',
  boot.includes('applyPad') && main.includes('AAS.applyPad'));
check('help covers keyboard, phone, walls, save',
  /arrow keys/i.test(help) && /FIRE/.test(help) && /walls hurt/i.test(help) && /best generation/i.test(help));
check('listing leads with the file / plane / no account',
  /file is the save/i.test(listing.description) && /no account/i.test(listing.description));
check('listing does not mention internals',
  !/gifos\.db|WASM|sandbox|localStorage/.test(JSON.stringify(listing)));
check('author is Victor Ribeiro, porter is GifOS',
  listing.author.name === 'Victor Ribeiro' && listing.porter.name === 'GifOS' && listing.basedOn.blessed === false);
check('db + multiplayer, no network, minBuild 947',
  manifest.capabilities.db && manifest.capabilities.multiplayer &&
  !manifest.capabilities.network && manifest.minBuild === 947);
check('main.js still inlines artwork from AAS', main.includes('AAS.artwork') && main.includes('AASShowPad'));
check('GuiControls.js is still packed (upstream) but the shell pad is ours',
  html.includes('vendor/GuiControls.js') && boot.includes('p-fire'));

if (failures) {
  console.log('\n' + failures + ' failing');
  process.exit(1);
}
console.log('\nall pass');
