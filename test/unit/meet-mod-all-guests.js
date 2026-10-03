// meet-mod-all-guests.js — "Blur guests" and "Video off" reach EVERY guest,
// lifted out of site/run.html and run in Node.
//
// The admin's two room-wide hammers used to write one mod-table entry per
// peer the admin was DIRECTLY linked to (guestPeers() = peers.keys()). In a
// room bigger than the admin's own links most guests were never blurred or
// turned off, though the button said "every guest", and the table (which
// rides every heartbeat) grew by one entry per guest. Found 2026-10-03.
//
// The law pinned here:
//   1. ONE ORDER: each button writes ONE entry, modTable['*'].blur / .cam,
//      through setMod (the same signed path as a per-tile order) — no loop.
//   2. EVERY NON-ADMIN: modOf honours it for every non-admin, linked or not,
//      and for anyone who arrives while it stands; never for an admin.
//   3. LATER WINS: a per-tile order after it overrides it for that one guest;
//      turning it off clears it everywhere, per-tile orders before it too.
//   4. ADMIN ROOMS ONLY: an open room's table is unsigned; a '*' there is ignored.
//   5. EVERY SINK reads modOf (tiles, filmstrip, PiP, iOS full screen,
//      recording), so the one order reaches all of them.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'run.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (detail !== undefined ? ' — ' + JSON.stringify(detail) : '')); }
}
const slice = (a, b) => { const i = html.indexOf(a); const j = i < 0 ? -1 : html.indexOf(b, i); return (i < 0 || j < 0) ? '' : html.slice(i, j); };

// ---- 1. one order, through setMod, no per-guest loop ----
for (const [btn, field] of [['blurAllBtn', 'blur'], ['camAllBtn', 'cam']]) {
  const click = slice('    ' + btn + '.onclick = () => {', '\n    };');
  check(btn + '.onclick is where the lift expects it', !!click);
  check(btn + ' writes ONE room-wide order: setMod(\'*\', \'' + field + '\', on)', click.includes("setMod('*', '" + field + "', on)"), click);
  check(btn + ' has no per-guest loop and no per-peer table write', !/\bfor\s*\(/.test(click) && !/modTable\[pid\]/.test(click) && !/peers\.keys\(\)/.test(click));
}
check('no guestPeers() (the direct-links-only list) is left in the page', !/guestPeers\(/.test(html));
const sm = slice('    function setMod(target, field, on) {', '\n    }\n');
check('setMod carries the order on the signed table by modFlood (the per-tile path)', /modFlood\(\)/.test(sm));

// ---- 2-4. modOf, run ----
const mo = slice('    function modOf(id) {', '\n    // A moderation CHANGE');
check('modOf is where the lift expects it', !!mo);
const env = { modTable: {}, myId: 'g1', amAdmin: false, admins: ['adm'], adminRoom: true };
const modOf = new Function('env', 'with (env) { const hasAdminRoom = () => env.adminRoom;\n' + mo + '\n return modOf; }')(env);
const forced = (id, f) => { const m = modOf(id)[f]; return !!(m && m.on); };
const order = (on, at) => ({ on, by: 'Admin', byId: 'adm', at });

// a room of 200 guests; the admin is linked to only a few of them — the table has no per-guest entries
const guests = Array.from({ length: 200 }, (_, i) => 'g' + i);
env.modTable['*'] = { blur: order(true, 100), cam: order(true, 100) };
check('ONE entry blurs every one of 200 guests (none linked, none listed)', guests.every((g) => forced(g, 'blur')), guests.filter((g) => !forced(g, 'blur')).length);
check('ONE entry turns every one of 200 guests\' video off', guests.every((g) => forced(g, 'cam')));
check('the table holds one entry, not one per guest', Object.keys(env.modTable).length === 1, Object.keys(env.modTable));
check('a guest who joins AFTER the order is covered too', forced('late-joiner', 'blur') && forced('late-joiner', 'cam'));
check('a guest\'s own page sees it on ITSELF (modOf(\'me\')), so its camera stops', forced('me', 'cam') && forced('me', 'blur'));
check('an admin\'s tile is never hit', !forced('adm', 'blur') && !forced('adm', 'cam'));
env.myId = 'adm'; env.amAdmin = true;
check('…and an admin\'s own page never hits itself', !forced('me', 'blur') && !forced('me', 'cam'));
env.myId = 'g1'; env.amAdmin = false;
check('mute and app are not room-wide hammers', !modOf('g5').mute && !modOf('g5').app);
check('the \'*\' pseudo-target itself is not a person', modOf('*').blur.on === true && modOf('*') === env.modTable['*']);

// later wins: a per-tile lift after the order frees that one guest
env.modTable.g7 = { blur: order(false, 150) };
check('a per-tile UNBLUR after the order frees that one guest', !forced('g7', 'blur'));
check('…and only that guest', forced('g8', 'blur') && forced('g7', 'cam'));
env.modTable.g9 = { blur: order(true, 50), cam: order(true, 50) }; // per-tile blocks from BEFORE the hammer
// turning it off clears it everywhere
env.modTable['*'] = { blur: order(false, 200), cam: order(false, 200) };
check('turning "Blur guests" off clears every guest', guests.every((g) => !forced(g, 'blur')) && !forced('late-joiner', 'blur'));
check('turning "Video off" off clears every guest', guests.every((g) => !forced(g, 'cam')));
check('…including per-tile blocks written before it', !forced('g9', 'blur') && !forced('g9', 'cam'));
env.modTable.g9.blur = order(true, 300);
check('a per-tile block AFTER the release still holds', forced('g9', 'blur'));
check('modOf never mutates the table it reads', env.modTable.g7.cam === undefined && env.modTable.g9.cam.at === 50);

// open rooms: unsigned table, '*' ignored
env.modTable = { '*': { blur: order(true, 400), cam: order(true, 400) } };
env.adminRoom = false;
check('in an OPEN room a \'*\' blur/cam is ignored (its table is unsigned)', !forced('g3', 'blur') && !forced('g3', 'cam') && !forced('me', 'cam'));
env.adminRoom = true;

// ---- the signed table carries '*'.blur/.cam to every receiver ----
const mm = slice('    function mergeMod(incoming) {', '    function setMod(target, field, on) {');
check('mergeMod is where the lift expects it', !!mm);
{
  const t = {}, gone = new Map(), noop = () => {};
  const mergeMod = new Function('modTable', 'meshGone', 'enforceForcedCam', 'refreshAllTiles', 'refreshOutbound', 'paintControls', 'reactHandCall', 'paintChatGate', 'paintStage', mm + '\n return mergeMod;')(t, gone, noop, noop, noop, noop, noop, noop, noop);
  mergeMod({ '*': { blur: order(true, 1), cam: order(true, 1) } });
  check('a receiver merges the room-wide blur and cam orders', t['*'] && t['*'].blur.on && t['*'].cam.on, t);
  mergeMod({ '*': { blur: order(false, 2), cam: order(false, 2) } });
  check('…and their release', t['*'].blur.on === false && t['*'].cam.on === false);
}
const tk = slice('    function takeMod(from, msg) {', '\n    }\n');
check('in an admin room only a VERIFIED admin table is merged (admVerify before mergeMod)', /admVerify\(msg\.modw, 'mod'\)[\s\S]*mergeMod\(o\.mod\)/.test(tk) && /if \(!msg\.modw\) return;/.test(tk));

// ---- 5. every sink reads the order through modOf ----
check('forcedCamOff and modBlurOn read modOf', /const forcedCamOff = \(id\) => \{ const m = modOf\(id\)\.cam;/.test(html) && /const modBlurOn = \(id\) => \{ const m = modOf\(id\)\.blur;/.test(html));
check('blurLevelFor reads modOf (tiles, filmstrip, iOS full screen)', /modOf\(id\)\.blur && modOf\(id\)\.blur\.on/.test(slice('    function blurLevelFor(id) {', '\n    }\n')));
check('updateTile reads modOf (grid tiles)', /const mod = modOf\(id\);/.test(slice('    function updateTile(id, inPass) {', 'const chips')));
check('the recording hides a guest under a video-off order, whatever the sender claims', /src\.camOff = seatDark\(st\) \|\| !!\(modOf\(pid\)\.cam && modOf\(pid\)\.cam\.on\);/.test(html));
check('the recording bakes in the receiver blur level', /src\.blur = blurLevelFor\(pid\);/.test(html));

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
