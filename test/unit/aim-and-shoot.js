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

function fakeApi(opts) {
  const cols = {};
  const subs = {};
  const rows = (c) => (cols[c] = cols[c] || {});
  const fire = (c) => (subs[c] || []).forEach((cb) => cb(Object.keys(rows(c)).map((k) => rows(c)[k])));
  return {
    api: {
      me: () => Promise.resolve({ id: opts.id, name: opts.name }),
      info: () => Promise.resolve({ owner: !!opts.owner }),
      db: (c) => ({
        put(rec) { rows(c)[rec.id] = rec; fire(c); return Promise.resolve(rec); },
        get(k) { return Promise.resolve(rows(c)[k] || null); },
        subscribe(cb) { (subs[c] = subs[c] || []).push(cb); cb(Object.keys(rows(c)).map((k) => rows(c)[k])); },
      }),
    },
    push(c, rec) { rows(c)[rec.id] = rec; fire(c); },
    last(c, id) { return rows(c)[id] || null; },
  };
}

const flush = () => new Promise((r) => setImmediate(r));

function load(room) {
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
    setImmediate,
    ResizeObserver: undefined,
    gifos: undefined,
  };
  const net = room ? fakeApi(room) : null;
  if (net) sandbox.gifos = net.api;
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
    'coop.js',
    'vendor/main.js',
    'boot.js',
  ].map((f) => fs.readFileSync(path.join(APP, f), 'utf8'));
  vm.runInContext(files.join('\n;\n'), sandbox, { filename: 'aim-and-shoot.js' });
  return {
    sandbox,
    net,
    eval(code) { return vm.runInContext(code, sandbox); },
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

// The ONLY size control the game has: bodies are 30 units of radius in pinned
// upstream code, so the short side of the screen decides how big a bot looks.
// 1366x768 letterboxed made one nine pixels wide; 620 put it at a tenth of the
// screen, which was a shade too big to read a crowd.
check('the arena takes the shape of its box, short side fixed',
  Math.min(AAS.w, AAS.h) === 700, { w: AAS.w, h: AAS.h });
check('a body is under a tenth of the short side',
  (AAS.player.size * 2) / 700 < 0.095, { diameter: AAS.player.size * 2 });

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

function finish() {
  if (failures) {
    console.log('\n' + failures + ' failing');
    process.exit(1);
  }
  console.log('\nall pass');
}

// ---- ONE ARENA ------------------------------------------------------------
// The room used to be a scoreboard: an invite gave your friend their own
// private wave and a number to compare. Now the app OWNER simulates and
// publishes `world`; a guest publishes input and draws what came back. These
// two vms are a host and a guest, wired through one fake collection.
(async () => {
  const H = load({ id: 'host-1', name: 'Nathan', owner: true });
  await flush();
  const HA = H.sandbox.AAS;
  HA.startPlay();
  H.tick(16);

  check('alone, the host is still just a game — no snapshot published',
    H.net.last('world', 'world') === null);

  H.net.push('players', {
    id: 'ada', name: 'Ada', t: 1,
    mv: { r: true }, mx: 0, my: 0, lx: 400, ly: 200, fire: false,
  });
  await flush();
  for (let i = 0; i < 40; i++) { HA.player.health = 99; H.tick(16); }

  const mate = HA.bodies().find((p) => p.netId === 'ada');
  check('a friend who joins gets a BODY in the host arena, not their own arena',
    !!mate && !mate.ai, mate && { ai: mate.ai });
  check('their stick drives that body', !!mate && mate.pos.x > 84, mate && mate.pos.x);

  const snap = H.net.last('world', 'world');
  check('the host publishes the whole arena', !!(snap && snap.ps && snap.ps.length > 2),
    snap && { ps: snap.ps && snap.ps.length, bs: snap.bs && snap.bs.length });
  check('the snapshot carries both humans and the wave',
    !!snap && snap.ps.filter((r) => !r.ai).length === 2 && snap.ps.some((r) => r.ai),
    snap && snap.ps.map((r) => r.k));
  check('the snapshot carries the arena shape and the generation',
    !!snap && snap.w === HA.w && snap.h === HA.h && snap.gen === HA.generation);

  // A teammate's bullet must not be the thing that kills you — but a bot has
  // to keep bleeding, or the fix would have disarmed the game. Fired straight
  // at each in turn, away from the noise of a live wave.
  {
    const shot = H.eval(`(function () {
      var mate = players.filter(function (p) { return p.netId === 'ada'; })[0];
      var bot = players.filter(function (p) { return p.ai && !p.isDead; })[0];
      var me = AAS.player;
      mate.health = 10; bot.health = 10;
      var at = function (t) {
        var a = Math.atan2(t.pos.y - me.pos.y, t.pos.x - me.pos.x);
        var b = new Bullet(me, me.pos.x, me.pos.y, 5, a, 1.2, 1, [t]);
        for (var i = 0; i < 400 && !b.isGone; i++) b.update();
        return b.isGone;
      };
      var m = at(mate), bt = at(bot);
      return { mate: mate.health, bot: bot.health, mateStopped: m, botStopped: bt };
    })()`);
    check('a teammate stops the bullet and takes NOTHING from it',
      shot.mate === 10 && shot.mateStopped === true, shot);
    check('a robot still bleeds from the same gun', shot.bot < 10 && shot.botStopped === true, shot);
  }

  // Death in a room is a trip to the floor, not the end of the run.
  {
    const gen0 = HA.generation;
    HA.player.health = 0;
    for (let i = 0; i < 4; i++) H.tick(16);
    check('a death in a room does not end the room', HA.isGameover === false, HA.isGameover);
    check('the wave is not reset while a teammate is standing', HA.generation === gen0,
      { was: gen0, now: HA.generation });
    let up = -1;
    for (let i = 0; i < 400 && up < 0; i++) { H.tick(16); if (!HA.player.isDead) up = i; }
    check('the downed player gets back up, on their own, in the same wave',
      up > 60 && up < 300 && HA.generation === gen0, { tick: up, gen: HA.generation });
  }

  // Everyone down at once IS the end of a run — but the room stays open.
  {
    H.eval("players.forEach(function (p) { if (!p.ai) { p.health = 0; } });");
    for (let i = 0; i < 6; i++) H.tick(16);
    check('a whole-team wipe resets the wave to generation 1', HA.generation === 1, HA.generation);
    check('and the room is still open, not a game-over screen', HA.isGameover === false);
    let both = -1;
    for (let i = 0; i < 400 && both < 0; i++) {
      H.tick(16);
      const up = HA.bodies().filter((p) => !p.ai && !p.isDead).length;
      if (up === 2) both = i;
    }
    check('everybody gets up together after a wipe', both > 60, { tick: both });
  }

  // ---- the guest -----------------------------------------------------------
  const G = load({ id: 'ada', name: 'Ada', owner: false });
  await flush();
  const GA = G.sandbox.AAS;
  GA.startPlay();
  const solo = { w: GA.w, h: GA.h };
  G.net.push('world', H.net.last('world', 'world'));
  await flush();
  GA.player.isMoving.right = true;
  GA.player.isShooting = true;
  for (let i = 0; i < 6; i++) G.tick(16);

  check('the guest adopts the HOST arena, not its own screen shape',
    GA.w === snap.w && GA.h === snap.h, { solo, now: { w: GA.w, h: GA.h } });
  check('the guest draws the host bodies', GA.bodies().length === snap.ps.length,
    { drawn: GA.bodies().length, sent: snap.ps.length });
  check('the guest simulates nothing of its own',
    GA.bodies().every((b) => !b.brain), GA.bodies().length);
  check('the guest publishes what its hands are doing', (() => {
    const row = G.net.last('players', 'ada');
    return !!row && row.mv && row.mv.r === true && row.fire === true;
  })(), G.net.last('players', 'ada'));
  check('the guest knows which body is its own',
    GA.bodies().some((b) => b.you === true), GA.bodies().map((b) => !!b.you));

  // ---- TWO PEOPLE, TWO GAMES ----------------------------------------------
  // The deadlock that made "more than one player" mean "more than one game":
  // a host published nothing until it had heard from a guest, and a guest
  // published nothing until it had seen a world row — with a four second
  // window from BOOT (not from the press of Start) as the only way out of the
  // circle. Read the title art for five seconds, which everybody does, and the
  // link had quietly handed you two private arenas, each convinced it was
  // alone. A guest now joins on the link, publishes from the first frame, and
  // never simulates no matter how long the silence lasts.
  const W = load({ id: 'bob', name: 'Bob', owner: false });
  await flush();
  const WA = W.sandbox.AAS;
  check('a guest joins on the link — there is no start screen to press',
    WA.isStarting === false, WA.isStarting);
  const frozen = WA.enemies.map((e) => e.pos.x + ',' + e.pos.y).join('|');
  const wgen = WA.generation;
  for (let i = 0; i < 80; i++) W.tick(200);          // sixteen seconds of silence
  check('a guest publishes input long before any snapshot arrives',
    !!W.net.last('players', 'bob'), W.net.last('players', 'bob'));
  check('a guest with nothing to draw NEVER breeds an arena of its own',
    WA.generation === wgen &&
    WA.enemies.map((e) => e.pos.x + ',' + e.pos.y).join('|') === frozen,
    { gen: WA.generation, was: wgen });
  check('and it says which silence this is, rather than showing a blank field',
    /Joining the arena/.test(W.sandbox.AASCoop.waitText() || ''),
    W.sandbox.AASCoop.waitText());

  // The other half: a host still on the title art, with somebody in the room,
  // says so — so the guest can name who it is waiting for, and the host can
  // see that anyone is waiting at all.
  const H2 = load({ id: 'host-2', name: 'Nathan', owner: true });
  await flush();
  const H2A = H2.sandbox.AAS;
  H2.net.push('players', { id: 'cid', name: 'Cid', t: 1, mv: {}, lx: 10, ly: 10 });
  await flush();
  const bea = H2.net.last('world', 'host');
  check('a host on the title art tells the room it is there',
    !!bea && bea.state === 'title' && bea.name === 'Nathan', bea);
  check('the host screen names who is waiting, and what to press',
    /Cid is waiting/.test(H2.sandbox.document.getElementById('status').textContent),
    H2.sandbox.document.getElementById('status').textContent);
  H2A.startPlay();
  for (let i = 0; i < 20; i++) { H2A.player.health = 99; H2.tick(200); }
  H2.net.push('players', { id: 'cid', name: 'Cid', t: 2, mv: {}, lx: 10, ly: 10 });
  await flush();
  check('and stops beaconing the moment it is playing — the snapshot says it all',
    H2.net.last('world', 'host').t === bea.t,
    { now: H2.net.last('world', 'host').t, was: bea.t });

  finish();
})().catch((err) => {
  /* A suite that dies mid-run is not a suite that passed: every check after
     the throw simply never printed. Say so, loudly, and exit red. */
  console.log('FAIL — the room suite threw before it finished  ' + ((err && err.stack) || err));
  process.exit(1);
});

