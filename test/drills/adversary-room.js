// adversary-room.js — CAN ONE BAD PARTICIPANT POISON A ROOM?
//
// The invariant under test, and it is a security property, not a nicety:
//
//   A participant that misbehaves — deliberately or because its device simply
//   cannot cope — must never prevent OTHER people from joining the meeting or
//   from continuing it.
//
// This is not hypothetical. A weak box in our own fleet (penguin) seats fine
// and then fails to complete its DataChannels once it runs out of headroom.
// That is an "unintentional adversary", and it is indistinguishable from a
// hostile one to everybody else in the room: from the outside both look like a
// seat that answers admission and then never wires up. If such a seat can wedge
// admission for everyone behind it, then any user on a phone with a bad network
// can take down a meeting by accident — and anyone malicious can do it on
// purpose, for free, with an unmodified client.
//
// The risk is concrete and structural. H7 gives every cell ONE designated
// admitter, so a newcomer's FIND is routed to a specific seat. If that seat is
// an adversary, admission for that cell runs through a participant that will
// not cooperate. The room must route around it.
//
// PROFILES (each an ordinary client, no patched build — that is the point; a
// real attacker does not need our source):
//   dark    __gifosBlockIce=['*'] — seats, then can never complete ANY P2P
//           connection. The penguin case, and the firewalled-user case.
//   mute    seats and then stops sending status entirely (frozen tab / asleep)
//   churn   joins and reloads repeatedly, thrashing occupancy
//
// Self-contained: spawns its OWN relay and static server for THIS checkout's
// site/, so it is safe from a worktree and never touches production.
const { spawn } = require('child_process');
const path = require('path');
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const CHROME = process.env.MEET_CHROME
  || (require('fs').existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome'
      : '/home/nathan/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
const RELAY_PORT = parseInt(process.env.ADV_RELAY_PORT || '8821', 10);
const SITE_PORT = parseInt(process.env.ADV_SITE_PORT || '8823', 10);
const RELAY = 'ws://127.0.0.1:' + RELAY_PORT;
const BASE = 'http://127.0.0.1:' + SITE_PORT;
const SEAT_MS = 45000;    // a healthy joiner must seat within this, adversaries present
const LINK_MS = 30000;    // ...and wire to its healthy neighbours within this

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : ''));
  if (!c) failures++;
};

(async () => {
  const relay = spawn('node', [path.join(__dirname, '..', 'servers', 'relay-local.js')], {
    env: { ...process.env, RELAY_PORT: String(RELAY_PORT), RELAY_DEV: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  relay.stderr.on('data', (d) => process.stderr.write('[relay] ' + d));
  const site = spawn('python3', ['-m', 'http.server', String(SITE_PORT), '-d', path.join(__dirname, '..', '..', 'site')], { stdio: 'ignore' });
  const cleanup = () => { try { relay.kill(); } catch (e) {} try { site.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  await sleep(900);

  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--disable-gpu', '--mute-audio', '--disable-dev-shm-usage', '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const room = 'adv' + Math.random().toString(36).slice(2, 10);
  const url = BASE + '/meet.html#v=' + room + '&relay=' + encodeURIComponent(RELAY) + '&DEBUG=on';

  // profile: null = healthy; 'dark' = can never complete a P2P connection
  const users = [];
  const newUser = async (name, profile) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content:
      (profile === 'dark' ? "window.__gifosBlockIce=['*'];" : '')
      + "try{localStorage.setItem('gifos_relay','" + RELAY + "');"
      + "localStorage.setItem('gifos_name','" + name + "');"
      + "localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [' + name + '] pageerror: ' + e.message));
    await page.goto(url).catch(() => {});
    const u = { name, profile: profile || 'healthy', ctx, page };
    users.push(u);
    return u;
  };

  const dump = async (u) => u.page.evaluate(() => {
    const g = (f, d) => { try { return f(); } catch (e) { return d; } };
    const d = g(() => window.__gifosVideo.debugDump(), null);
    if (!d) return null;
    const conn = new Set();
    for (const r of (d.roster || [])) if (r.conn) conn.add(r.peer);
    const named = g(() => window.__gifosVideo.meshLinks().map((p) => String(p).slice(0, 12)), []);
    return { coord: d.me.coord, peer: String(d.me.peer).slice(0, 12),
             named, linked: named.filter((p) => conn.has(p)) };
  }).catch(() => null);

  const waitSeat = async (u, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const d = await dump(u); if (d && d.coord) return d; await sleep(1000); }
    return await dump(u);
  };
  // A healthy user only owes links to its HEALTHY named neighbours; a dark peer
  // is unreachable by construction and must not count against it.
  const waitLinks = async (u, darkIds, ms) => {
    const t0 = Date.now(); let last = null;
    while (Date.now() - t0 < ms) {
      const d = await dump(u); last = d;
      if (d && d.coord) {
        const want = d.named.filter((p) => !darkIds.has(p));
        if (want.length && want.every((p) => d.linked.includes(p))) return { ok: true, d, want };
        if (!want.length) return { ok: true, d, want };   // nothing healthy adjacent yet
      }
      await sleep(1500);
    }
    return { ok: false, d: last, want: last ? last.named.filter((p) => !darkIds.has(p)) : [] };
  };

  console.log('room: ' + url);

  // ── Phase 1: a healthy room forms ────────────────────────────────────────
  for (let i = 0; i < 4; i++) { await newUser('good' + i, null); await sleep(2500); }
  const early = [];
  for (const u of users) early.push(await waitSeat(u, SEAT_MS));
  check('4 healthy users seat', early.every((d) => d && d.coord), early.map((d) => (d && d.coord) || 'UNSEATED').join(' '));

  // ── Phase 2: the adversaries arrive and take seats ───────────────────────
  const dark = [];
  for (let i = 0; i < 3; i++) { dark.push(await newUser('DARK' + i, 'dark')); await sleep(2500); }
  const darkDumps = [];
  for (const u of dark) darkDumps.push(await waitSeat(u, SEAT_MS));
  const darkIds = new Set(darkDumps.filter(Boolean).map((d) => d.peer));
  check('the adversaries are actually IN the room (seated, holding coords)',
    darkDumps.filter((d) => d && d.coord).length >= 2,
    darkDumps.map((d) => (d && d.coord) || 'unseated').join(' '));
  check('the adversaries are genuinely dark (no completed links of their own)',
    darkDumps.filter(Boolean).every((d) => d.linked.length === 0),
    darkDumps.filter(Boolean).map((d) => d.coord + ':linked=' + d.linked.length).join(' '));

  // ── Phase 3: THE TEST. Healthy people arrive AFTER the adversaries ───────
  const late = [];
  for (let i = 0; i < 3; i++) { late.push(await newUser('late' + i, null)); await sleep(2500); }
  const lateSeat = [];
  for (const u of late) lateSeat.push(await waitSeat(u, SEAT_MS));
  check('HEALTHY joiners can still SEAT with adversaries in the room',
    lateSeat.every((d) => d && d.coord),
    lateSeat.map((d) => (d && d.coord) || 'UNSEATED').join(' '));

  for (let i = 0; i < late.length; i++) {
    const r = await waitLinks(late[i], darkIds, LINK_MS);
    check('late' + i + ' wired to every HEALTHY neighbour it names',
      r.ok, r.d ? (r.d.coord + ' want=[' + r.want.join(',') + '] linked=[' + r.d.linked.join(',') + ']') : 'no dump');
  }

  // ── Phase 4: the meeting CONTINUES for the people already in it ──────────
  const stillOk = [];
  for (const u of users.filter((x) => x.profile === 'healthy')) {
    const r = await waitLinks(u, darkIds, 8000);
    stillOk.push({ n: u.name, ok: r.ok, coord: r.d && r.d.coord });
  }
  check('every healthy participant still holds its healthy links (meeting continues)',
    stillOk.every((s) => s.ok && s.coord),
    stillOk.map((s) => s.n + (s.ok ? '' : ':BROKEN')).join(' '));

  // ── Phase 5: the room is still ADMITTING after all of that ───────────────
  const final = await newUser('final', null);
  const fd = await waitSeat(final, SEAT_MS);
  check('the room still admits a brand-new joiner at the end', !!(fd && fd.coord), (fd && fd.coord) || 'UNSEATED');

  // ── Phase 6: ONE room, not several ───────────────────────────────────────
  // Everything above can pass while the room has quietly SPLIT: each fragment
  // is internally consistent and happily wires itself up, so link-completeness
  // checks are blind to it. Two tells, both cheap. Distinct coords: N seated
  // participants must hold N different cells, and a repeat means two people
  // believe they own the same seat. And a shared view: every seat should see a
  // comparable population — a fragment sees only its own.
  const finalAll = [];
  for (const u of users) { const d = await dump(u); if (d && d.coord) finalAll.push({ n: u.name, c: d.coord, p: d.peer }); }
  const byCoord = new Map();
  for (const f of finalAll) byCoord.set(f.c, (byCoord.get(f.c) || []).concat(f.n));
  const clashes = [...byCoord.entries()].filter(([, who]) => who.length > 1);
  check('every seated participant holds a DISTINCT coord (no split-brain)',
    clashes.length === 0,
    clashes.length ? clashes.map(([c, who]) => c + '<-' + who.join('+')).join(' ')
                   : finalAll.length + ' seats, all distinct');
  const pops = [];
  for (const u of users) {
    const p = await u.page.evaluate(() => { try { return window.__gifosVideo.debugDump().participants; } catch (e) { return -1; } }).catch(() => -1);
    if (p > 0) pops.push(p);
  }
  const spread = pops.length ? Math.max(...pops) - Math.min(...pops) : 99;
  check('all participants see ONE room (population agrees within 2)', spread <= 2, 'counts=' + pops.join(','));

  console.log('\nadversaries: ' + [...darkIds].join(' ') + '  (profile: dark / cannot complete P2P)');
  await browser.close(); cleanup();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nALL PASS — a misbehaving participant cannot poison the room');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL ' + (e && e.stack || e)); process.exit(2); });
