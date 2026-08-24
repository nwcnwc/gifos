// Tanks has to actually drive, shoot, and apply a hit ONCE.
//
// sim.js is the shipped physics (no DOM). net.js is the shipped room. The
// 12s re-apply bug stays pinned here as well as in store-games.js — this
// file may grow; that one must not be edited. Phone sticks and "no Invite
// button" are one-liners a vm cannot click, so those are source-scanned.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = (f) => path.join(ROOT, 'apps', 'tanks', f);
const read = (f) => fs.readFileSync(APP(f), 'utf8');

let failures = 0;
const MAIN = [];
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

function load(files, globals) {
  const sandbox = Object.assign({
    console, Math, Object, Array, JSON, Date, String, Number, Boolean, Promise,
    setTimeout, clearTimeout,
  }, globals || {});
  sandbox.globalThis = sandbox;
  if (!('window' in sandbox)) sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: path.basename(f) });
  return sandbox;
}

const html = read('index.html');
const css = read('style.css');
const app = read('app.js');
const netSrc = read('net.js');
const simSrc = read('sim.js');
const listing = JSON.parse(read('listing.json'));
const help = read('help.md');

check('index.html loads sim.js then net.js then app.js',
  html.indexOf('src="sim.js"') >= 0 && html.indexOf('src="sim.js"') < html.indexOf('src="net.js"') &&
  html.indexOf('src="net.js"') < html.indexOf('src="app.js"'));
check('MOVE and AIM sticks plus FIRE are in the markup',
  /id="movePad"/.test(html) && /id="aimPad"/.test(html) && /id="fireBtn"/.test(html));
check('sticks bind pointer events (not touch-only)',
  /pointerdown/.test(app) && /setPointerCapture/.test(app) && /bindStick/.test(app));
check('no in-app Invite button (OS chrome owns Invite)',
  !/<button\b[^>]*>\s*Invite\s*</i.test(html) && !/id=["'][^"']*invite/i.test(html));
check('HUD still tells the player Invite is the room', /Invite in the bar/.test(html) || /Invite in the bar/.test(app));
check('hit-claim forgets only when the shooter drops the ring (no 12s clock)',
  /Forget a claim only when the SHOOTER/.test(netSrc) &&
  !/12\s*\*\s*1000/.test(netSrc) &&
  /appliedClaims\[key\]/.test(netSrc));
check('seenShots prune agrees with the live ring',
  /for \(key in seenShots\)/.test(netSrc) && /delete seenShots/.test(netSrc));
check('sim refuses overlapping tanks', /overlapTank/.test(simSrc) && /tryMove/.test(simSrc));
check('listing leads with no game server / one link',
  /invite link is the room/i.test(listing.description) && /socket\.io/i.test(listing.description));
check('help.md names dual sticks, shield, career',
  /MOVE/.test(help) && /AIM/.test(help) && /shield/.test(help) && /Career/.test(help));
check('icon.mjs does not stamp TANKS letters on the GIF frames',
  !/drawText\(put, \d+, \d+, 'TANKS'/.test(read('icon.mjs')));

const simBox = load([APP('sim.js')]);
const Sim = simBox.TanksSim;
check('sim.js loads TanksSim', !!(Sim && Sim.create && Sim.step && Sim.hitWall));

if (Sim) {
  const STEP = 0.016;
  function drive(g, frames, input) {
    for (let i = 0; i < frames; i++) {
      Sim.step(g, STEP, Object.assign({ now: g.now + STEP * 1000 }, input));
    }
  }

  {
    const g = Sim.create({ seed: 1 });
    g.me.shieldUntil = 0;
    const x0 = g.me.x, y0 = g.me.y;
    drive(g, 60, { keys: { ArrowRight: true } });
    check('holding right MOVES the tank', g.me.x > x0 + 20, { from: x0, to: g.me.x });
    const x1 = g.me.x;
    drive(g, 60, { keys: { ArrowDown: true } });
    check('holding down MOVES the tank', g.me.y > y0 + 10, { from: y0, to: g.me.y, x: g.me.x });
    check('a turn changes heading', g.me.rot !== 0, g.me.rot);
    void x1;
  }

  {
    const g = Sim.create({ seed: 2 });
    g.me.shieldUntil = 0;
    g.me.x = 154; g.me.y = 240; g.me.rot = 0;
    drive(g, 80, { keys: { ArrowRight: true } });
    check('a wall STOPS the tank (does not pass x=180)', g.me.x + Sim.TR <= 180 + 1, { x: g.me.x, tr: Sim.TR });
  }

  {
    const g = Sim.create({ seed: 3 });
    g.me.shieldUntil = 0;
    g.drones.forEach((d) => { d.cd = 99; });
    const drone = g.drones[0];
    drone.x = 260; drone.y = 80; drone.rot = 0; drone.lives = 1; drone.alive = true;
    g.me.x = 80; g.me.y = 80; g.me.tur = 0; g.me.rot = 0;
    const b = Sim.fire(g.me, 0, false);
    check('fire() returns a shell in front of the barrel', !!(b && b.x > g.me.x), b && { x: b.x, y: b.y });
    g.bullets.push(b);
    const k0 = g.me.k;
    drive(g, 80, { keys: {} });
    check('a shell that hits a drone kills it and scores', drone.alive === false && g.me.k === k0 + 1,
      { alive: drone.alive, k: g.me.k, bullets: g.bullets.length });
  }

  {
    const g = Sim.create({ seed: 4 });
    g.me.shieldUntil = 0;
    g.drones.forEach((d) => { d.cd = 99; d.x = 700; d.y = 40; });
    g.me.x = 80; g.me.y = 80; g.me.tur = 0;
    const n0 = g.bullets.length;
    drive(g, 3, { keys: { Space: true }, pointer: { x: 400, y: 80, down: false } });
    check('holding Space fires a shell', g.bullets.length > n0, g.bullets.length);
  }

  {
    const g = Sim.create({ seed: 5 });
    g.me.shieldUntil = 0;
    const d = g.drones[0];
    d.x = 90; d.y = 80; d.cd = 99;
    g.me.x = 60; g.me.y = 80; g.me.rot = 0;
    const x0 = g.me.x;
    drive(g, 40, { keys: { ArrowRight: true } });
    check('you cannot drive through another tank', g.me.x < d.x - 8, { me: g.me.x, drone: d.x, from: x0 });
  }

  {
    const g = Sim.create({ seed: 6 });
    check('a fresh tank is shielded', Sim.shielded(g.me, g.now));
    const lives0 = g.me.lives;
    Sim.hurt(g, g.me, 1);
    check('shield swallows a spawn hit', g.me.lives === lives0 && g.me.alive, { lives: g.me.lives });
    g.me.shieldUntil = 0;
    Sim.hurt(g, g.me, 1);
    check('after the shield, a hit costs a heart', g.me.lives === lives0 - 1, { lives: g.me.lives });
  }

  {
    const g = Sim.create({ seed: 7 });
    g.me.shieldUntil = 0;
    g.me.x = 60; g.me.y = 60;
    check('hitWall reports the arena edge', Sim.hitWall(-1, 60, Sim.TR) && Sim.hitWall(60, -1, Sim.TR));
    check('open yard is not a wall', !Sim.hitWall(100, 100, Sim.TR));
  }
}

{
  let fakeTime = 100000;
  let subCb = null;
  const fakeApi = {
    db: () => ({
      subscribe: (cb) => { subCb = cb; },
      put: () => Promise.resolve(),
    }),
    me: () => Promise.resolve({ id: 'me1', name: 'Alice' }),
  };
  const sandbox = load([APP('net.js')], {
    Date: { now: () => fakeTime },
    setTimeout: (fn) => { fn(); return 0; },
    gifos: fakeApi,
  });
  const Net = sandbox.TanksNet;
  check('net.js loads', !!(Net && Net.init && Net.onHit));
  if (Net) {
    const hits = [];
    let alive = true, lives = 3;
    Net.onHit((d, id) => {
      hits.push(fakeTime);
      if (!alive) return;
      lives -= d;
      Net.tookHit(d, id, 'Bob');
      if (lives <= 0) alive = false;
    });
    const row = (t) => ({
      id: 'S', name: 'Bob', x: 300, y: 300, rot: 0, tur: 0,
      alive: true, lives: 3, k: 0, d: 0, sp: 0, t,
      hits: [{ n: 1, to: 'me1', d: 1, sp: 0 }], shots: [], lastKilledBy: null,
    });
    MAIN.push(async () => {
      await Net.init();
      check('hit-claim harness init settled', !!subCb);
      Net.tick(100, 100, 0, 0);
      const T0 = fakeTime;
      while (fakeTime < T0 + 40000) {
        fakeTime += 125;
        subCb([row(fakeTime)]);
        Net.tick(100, 100, 0, 0);
        if (!alive && fakeTime - hits[hits.length - 1] > 2200) {
          alive = true; lives = 3; Net.respawn(60, 60);
        }
      }
      check('ONE claimed hit applies exactly once across 40s of republished rows',
        hits.length === 1, { applications: hits.length });
      subCb([Object.assign(row(fakeTime), { hits: [] })]);
      fakeTime += 125;
      subCb([Object.assign(row(fakeTime), { hits: [{ n: 2, to: 'me1', d: 1, sp: 0 }] })]);
      check('a genuinely new claim from the same shooter still applies',
        hits.length === 2, { applications: hits.length });
    });
  }
}

(async () => {
  for (const fn of MAIN) await fn();
  if (failures) {
    console.log('\n' + failures + ' failure(s)');
    process.exit(1);
  }
  console.log('\nAll PASS — tanks core loop holds.');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
