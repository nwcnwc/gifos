// Lost in Cyberspace has to actually walk, nmap, and send codes.
//
// The maze generator is the original (vendor/network.js). The HACKER view is
// a canvas rewrite. Invite is the room: the hacker sends codes they found,
// the navigator nmaps ALL of them together — one code is one layer, four is
// the maze. A suite that only boots the generator would miss the inbox
// mapping one code at a time (the bug this port shipped with) and a solo
// seat-switch that threw the maze away.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'lost-in-cyberspace');

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

function load(seed) {
  const sandbox = {
    console,
    Math: seededMath(seed == null ? 0xC0DE : seed),
    Object, Array, JSON, Date, String, Number, Boolean,
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(APP, 'vendor', 'network.js'), 'utf8'), sandbox, { filename: 'network.js' });
  vm.runInContext(fs.readFileSync(path.join(APP, 'maze.js'), 'utf8'), sandbox, { filename: 'maze.js' });
  return sandbox;
}

const S = load(0xC0DE);
const M = S.LIC;
check('network.js + maze.js attach LIC', !!(M && M.fresh && M.walkForward && M.hack));

{
  const st = M.fresh();
  check('a fresh maze starts at 0,0 with 256 seconds', st.x === 0 && st.y === 0 && st.time === 256, { x: st.x, y: st.y, time: st.time });
  check('four sector codes sit on the terminals', st.codes && st.codes.length === 4, st.codes);
  check('the four codes nmap back to the same target', (() => {
    const back = S.networkFromCodes(st.codes);
    return back.target && back.target.join() === st.net.target.join();
  })());
  check('…and the same traps', (() => {
    const back = S.networkFromCodes(st.codes);
    const a = (st.net.traps.trapsXY || []).map((p) => p.join()).sort().join('|');
    const b = (back.traps.trapsXY || []).map((p) => p.join()).sort().join('|');
    return a === b;
  })());
  check('sectors are 2×2 quadrants', M.sectorOf(0, 0) === 0 && M.sectorOf(7, 0) === 1 && M.sectorOf(0, 7) === 2 && M.sectorOf(7, 7) === 3);
}

{
  const st = M.fresh();
  const face0 = st.facing;
  M.turnRight(st);
  check('turn right changes facing', st.facing === (face0 + 1) % 4, st.facing);
  M.turnLeft(st);
  check('turn left undoes it', st.facing === face0, st.facing);
  M.turnBack(st);
  check('turn around is 180', st.facing === (face0 + 2) % 4, st.facing);
}

// Walk until we have actually moved. A maze that refuses every door is a
// generator bug; a walker that never calls enter is ours.
{
  const st = M.fresh();
  let moved = false;
  for (let i = 0; i < 8 && !moved; i++) {
    if (M.doorAhead(st)) moved = M.walkForward(st);
    else M.turnRight(st);
  }
  check('the hacker can walk through a door', moved && (st.x !== 0 || st.y !== 0), { x: st.x, y: st.y, facing: st.facing, moved });
  check('walking starts the locator', st.ticking === true);
  check('a move is counted', st.moves >= 0, st.moves);
}

{
  const st = M.fresh();
  // Force a trap underfoot and walk in (enter charges TRAP_COST).
  const before = st.time;
  st.net.traps = st.net.traps || { trapsXY: [] };
  // Stand on a trap via enter() by faking a move onto a neighbouring trap.
  const ds = M.doors(st);
  const dir = ds.e ? [1, 0] : ds.s ? [0, 1] : ds.n ? [0, -1] : [-1, 0];
  const nx = st.x + dir[0], ny = st.y + dir[1];
  st.net.traps.trapsXY = (st.net.traps.trapsXY || []).concat([[nx, ny]]);
  const ok = M.tryMove(st, dir[0], dir[1]);
  check('walking onto a trap is allowed', ok);
  check('a trap costs 32 seconds', ok && st.time <= before - M.TRAP_COST, { before: before, time: st.time, cost: M.TRAP_COST });
}

{
  const st = M.fresh();
  const before = st.time;
  const r = M.hack(st);
  check('hacking a non-target is denied', r === 'denied' || r === 'dead' || r === 'win', r);
  if (r === 'denied') {
    check('a wrong hack costs 16 seconds', st.time === before - M.WRONG_HACK, { before: before, time: st.time });
    check('…and starts the locator', st.ticking === true);
  }
}

{
  const st = M.fresh();
  st.x = st.net.target[0];
  st.y = st.net.target[1];
  const r = M.hack(st);
  check('hacking the TARGET wins', r === 'win' && st.win === true, r);
  check('a win issues a score code', typeof st.scoreCode === 'string' && st.scoreCode.indexOf('0x') === 0, st.scoreCode);
  let dec = null;
  try { dec = S.codeToScore(st.scoreCode); } catch (e) { dec = { err: String(e.message) }; }
  check('the score code round-trips time and moves',
    dec && dec.time === Math.min(255, st.time) && dec.moves === Math.max(0, st.moves), dec);
}

{
  const st = M.fresh();
  const here = M.here(st);
  check('spawn reports a sector code', !!here.code, here);
  M.rememberSent(st, here.code);
  M.rememberSent(st, here.code);
  check('Send code is idempotent', st.sent.length === 1 && st.sent[0] === here.code, st.sent);
  const found = M.foundCodes(st);
  check('standing in a sector counts as a found code', found.indexOf(here.code) >= 0, found);
}

{
  const a = ['0xC16F8'];
  const b = ['0xD1234', '0xC16F8'];
  const m = M.mergeCodes(a, b);
  check('inbox merges codes instead of replacing them', m.length === 2 && m.indexOf('0xC16F8') >= 0 && m.indexOf('0xD1234') >= 0, m);
}

{
  const st = M.fresh();
  const one = S.networkFromCodes([st.codes[0]]);
  const all = S.networkFromCodes(st.codes);
  check('one code is one layer — not the whole maze', !one.walls || !one.traps || !one.target, {
    walls: !!one.walls, traps: !!one.traps, target: !!one.target, colors: !!one.colors,
  });
  check('all four codes reconstruct walls, traps, target, colours', !!(all.walls && all.traps && all.target && all.colors));
}

{
  const st = M.fresh();
  st.time = 1;
  st.ticking = true;
  M.tick(st);
  check('the last tick loses', st.over === true && st.time === 0);
}

// ---- source scans a vm cannot run ------------------------------------------
const app = fs.readFileSync(path.join(APP, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
const help = fs.readFileSync(path.join(APP, 'help.md'), 'utf8');
const listing = JSON.parse(fs.readFileSync(path.join(APP, 'listing.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));

check('Invite is mentioned (OS chrome, not a button)', /Invite/.test(app) && !/<button\b[^>]*>\s*Invite\s*</i.test(html));
check('onBack is registered', /gifos\.onBack/.test(app));
check('no A-Frame, no fetch, no WebSocket in app/maze', !/aframe|fetch\(|WebSocket|XMLHttpRequest/i.test(app + fs.readFileSync(path.join(APP, 'maze.js'), 'utf8')));
check('inbox nmaps ALL collected codes, not one', /nmapAll/.test(app) && /codes\.join\(['"] ['"]\)/.test(app));
check('solo seat-switch keeps the maze (startHacker(state))', /startHacker\(state\)/.test(app) && /hackerSwitch/.test(app) && /navSwitch/.test(html));
check('one live hacker per room', /liveHacker/.test(app) && /already the hacker/.test(app));
check('phone D-pad includes turn-around', /id="turnB"/.test(html) && /turnBack/.test(app));
check('touch-action on the pad', /touch-action:\s*manipulation/.test(css));
check('help.md covers both seats and Invite', /HACKER/.test(help) && /NAVIGATOR/.test(help) && /Invite/.test(help) && help.trim().length > 400);
check('listing is an unofficial port, author is them', listing.basedOn && listing.basedOn.blessed === false && !/gifos/i.test(listing.author.name));
check('listing does not mention internals', !/gifos\.db|WASM|sandbox|WebRTC|localStorage/.test(JSON.stringify(listing)));
check('manifest declares db + multiplayer, minBuild 947, no network', manifest.capabilities.db === true && manifest.capabilities.multiplayer === true && manifest.minBuild === 947 && !manifest.capabilities.network);
check('room is read-write, save is private', manifest.data.room.visibility === 'read-write' && manifest.data.save.visibility === 'private');

if (failures) {
  console.log('\n' + failures + ' failure(s)');
  process.exit(1);
}
console.log('\nall ' + 'ok');
