/*
 * e2e-backdooms-mp.js — FOUR FRIENDS IN ONE SET OF HALLS.
 *
 * One person opens Backdooms from a desktop icon and presses Invite. Three
 * others open the link. The claim being judged is the one the store listing
 * makes in plain English:
 *
 *   "Send the invite and whoever opens the link wakes in the same maze, from
 *    the same seed, and shows up down the corridor as a pale figure. You can
 *    watch them walk. You can shoot them. There is no game server and no
 *    lobby — the room is the link."
 *
 * Every clause of that is an assertion below, plus the two things that make it
 * a GifOS app rather than a web game: nobody's camera is opened, and the
 * traffic it costs to keep four people in one maze is bounded.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS NEEDS FOUR REAL MACHINES, and it is not a preference.
 *
 * 1. THE APP IS ITS ANIMATION LOOP. Position rows are written from inside
 *    requestAnimationFrame. Chromium throttles a backgrounded tab's rAF to
 *    roughly one frame a second, so on one box only the tab in front publishes
 *    and the other three stand still in everyone else's halls. e2e-anyroad-mp
 *    measured exactly that failure — every player seeing exactly one of the
 *    other two — and it is the harness starving the app, not a product bug.
 *
 * 2. THE COST BEING MEASURED IS THE OWNER'S. docs/app-services.md §4: a guest
 *    write is a PROPOSAL that floods to the owner, which validates it against
 *    the manifest's visibility rules, Ed25519-signs the WHOLE collection and
 *    floods the result; every client then re-reads all N rows, because
 *    runtime.js's `subscribe` does a full getAll on every db-change. That
 *    signing is on the owner's main thread. Four Chromiums sharing one kernel
 *    make the owner's flood latency indistinguishable from its own frame
 *    budget, so a number measured there is a number about that box.
 *
 * 3. FOUR IS THE POINT, not three. The cost is superlinear in N — that same
 *    document names Anyroad's players collection at 5N writes/sec as what puts
 *    "a ceiling of a few dozen players" on the mesh. Three players is a shape
 *    where a regression can hide; the fourth is where it starts to show.
 *
 * There is deliberately NO one-box door. A wiring run that cannot answer the
 * question is not a cheaper version of this test, it is a different test that
 * looks like this one — and 26a's history in the behaviour battery is what
 * happens when that door exists: it got forced on, hung on a field, and scored
 * as a product red while skipping the measurement entirely.
 *
 * Exit 3 (NEEDS-FLEET) without four machines. Not green, not a product red,
 * and it blocks a cut, because a guard nobody ran is a guard nobody has.
 * ---------------------------------------------------------------------------
 *
 * Needs: the stack served on the ORCHESTRATOR's network address (site :8099 +
 * relay :8790 on 0.0.0.0), reachable by four boxes from the hosts file.
 *
 *   node test/browser/e2e-backdooms-mp.js
 *   RECORD=1 …   record each player's screen to test/out/backdooms-mp/
 */
const needFleet = require('../lib/fleet');
const { openFleet, closeFleet } = require('../lib/fleet-browsers');
const { appGif } = require('../lib/apps');
const need = require('../lib/need');   // a missing fixture must never look like a product bug
const { readFileSync, mkdirSync } = require('fs');
const path = require('path');

const FLEETCFG = needFleet.load() || {};
const BASE = process.env.BASE || FLEETCFG.base || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || FLEETCFG.relay || 'ws://127.0.0.1:8790';
const RECORD = process.env.RECORD === '1';
const OUT = path.resolve(__dirname, '../out/backdooms-mp');
const NAMES = ['Ada', 'Ben', 'Cyd', 'Dev'];

let failures = 0, passes = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== undefined ? '  (' + detail + ')' : ''));
  if (cond) passes++; else failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The app runs in its own frame inside run.html. Locators reach into it, but
// the interesting questions here are about STATE, so talk to the frame itself.
//
// ASK THE ELEMENT, don't pattern-match the URL. The sandboxed app frame reports
// `about:blank` in this Chromium — a plumbing run against the real packed GIF
// showed the URL test matching nothing and a "first frame that is not main"
// fallback carrying the whole thing. That fallback is fine with one iframe and
// silently wrong the moment run.html has two.
async function appFrame(page) {
  const el = await page.$('#appmount iframe');
  if (el) {
    const f = await el.contentFrame();
    if (f) return f;
  }
  return page.frames().find((f) => f !== page.mainFrame()) || null;
}

async function inApp(p, fn, arg) {
  const f = await appFrame(p.page);
  if (!f) throw new Error(p.name + ': no app frame');
  return f.evaluate(fn, arg);
}

async function waitInApp(p, fn, ms, what) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await inApp(p, fn); } catch (e) { /* frame swapping */ }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(250);
  }
}

(async () => {
  // A DEAD RELAY LOOKS EXACTLY LIKE A BROKEN GAME HERE: the app room forms
  // locally, body gets `app-room`, and then everyone sits on "reconnecting to
  // the room…" until a locator gives up somewhere deep in the mount, with no
  // error anywhere. e2e-anyroad-mp's header records the hour that cost before
  // it grew this line. Check the stack WHERE THE BROWSERS ARE — the fleet's
  // base host, not loopback — or a healthy remote stack is refused as missing.
  await need({ 8099: 'a static server on 8099 (python3 -m http.server 8099 -d site --bind 0.0.0.0)',
               8790: 'relay-local (RELAY_HOST=0.0.0.0 RELAY_DEV=1 node test/servers/relay-local.js)' },
             new URL(BASE).hostname);
  const t0 = Date.now();
  const gifB64 = readFileSync(appGif('backdooms')).toString('base64');

  const fleet = await needFleet(4, {
    why: 'four friends in one maze: position rows are written from inside rAF, '
       + 'which Chromium throttles to ~1fps in a backgrounded tab (so on one box only '
       + 'the front tab publishes and the other three stand still), and the traffic '
       + 'assertion measures the OWNER signing and flooding the whole collection on its '
       + 'main thread — four Chromiums on one kernel cannot separate that from their own '
       + 'frame budget',
    roles: NAMES.map((n) => n.toLowerCase()),
  });

  const COMMON = [
    '--autoplay-policy=no-user-gesture-required',
    // WITHOUT THESE THERE IS NO MULTIPLAYER TO MEASURE — see the header.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];
  const boxes = await openFleet(fleet.hosts.slice(0, NAMES.length), { args: COMMON, origin: BASE });
  if (RECORD) mkdirSync(OUT, { recursive: true });

  const players = [];
  try {
    for (let i = 0; i < NAMES.length; i++) {
      const name = NAMES[i];
      const ctx = await boxes[i].browser.newContext(Object.assign(
        { viewport: { width: 900, height: 620 } },
        RECORD ? { recordVideo: { dir: path.join(OUT, name), size: { width: 900, height: 620 } } } : {},
      ));
      await ctx.addInitScript((v) => {
        try {
          localStorage.setItem('gifos_relay', v.relay);
          localStorage.setItem('gifos_name', v.name);
          localStorage.setItem('gifos_meet_bar', '0');
        } catch (e) {}
      }, { relay: RELAY, name });
      // An app room's whole claim is that it never touches your camera. Count
      // every attempt rather than eyeballing a dark grid.
      await ctx.addInitScript(() => {
        window.__gumCount = 0;
        const md = navigator.mediaDevices;
        if (md && md.getUserMedia) {
          const real = md.getUserMedia.bind(md);
          md.getUserMedia = (c) => { window.__gumCount++; return real(c); };
        }
      });
      players.push({ name, ctx, box: boxes[i].host.name || boxes[i].host.ssh || 'local' });
    }
    const [ada, ben, cyd, dev] = players;
    console.log('  FLEET placement: ' + players.map((p) => p.name + '@' + p.box).join('  '));

    // ---- Ada installs the real built GIF and opens it ---------------------
    const desk = await ada.ctx.newPage();
    await desk.goto(BASE + '/index.html');
    await desk.waitForSelector('.icon', { timeout: 90000 });
    const fid = await desk.evaluate(async (b64) => {
      const bin = atob(b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const id = GifOS.store.uid('file');
      await GifOS.store.putFile({ id, name: 'Backdooms.gif', bytes, kind: 'gif', isApp: true, appId: 'backdooms', mime: 'image/gif' });
      return id;
    }, gifB64);
    check('the built Backdooms GIF installs on the host desktop', !!fid);

    // ---- Invite turns the running app into a room, in place ---------------
    ada.page = await ada.ctx.newPage();
    ada.page.on('pageerror', (e) => console.log('  [Ada pageerror] ' + e.message));
    await ada.page.goto(BASE + '/run.html#id=' + fid);
    await ada.page.waitForSelector('#appmount iframe', { timeout: 90000 });
    // The app's own capability sheet (pointer lock + fullscreen) can overlay
    // the page and eat the click; it is not what is under test here.
    await ada.page.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 15000 }).catch(() => {});
    await ada.page.evaluate(() => document.getElementById('appinvite').click());
    await ada.page.waitForSelector('input[name="rmcls"]', { timeout: 20000 });
    await ada.page.evaluate(() => {
      const heal = document.querySelector('input[name="rmcls"][value="heal"]');
      if (heal) heal.checked = true;          // the halls outlive whoever opened them
      document.getElementById('inv-go').click();
    });
    await ada.page.waitForFunction(
      () => document.body.classList.contains('app-room') && window.__gifosVideo.room(),
      null, { timeout: 40000 });
    const link = await ada.page.evaluate(() => document.getElementById('share-url').value);
    check('Invite turned the running game into a room, on the same page', !!link, link);

    // ---- and the other three walk in through that one link ----------------
    for (const p of [ben, cyd, dev]) {
      p.page = await p.ctx.newPage();
      p.page.on('pageerror', (e) => console.log('  [' + p.name + ' pageerror] ' + e.message));
      await p.page.goto(link);
    }
    for (const p of players) {
      await p.page.waitForSelector('#appmount iframe', { timeout: 120000 }).catch(() => {});
      await p.page.evaluate(() => {
        const done = document.getElementById('inv-done');
        if (done) done.click();
        const m = document.getElementById('inv-modal');
        if (m) m.style.display = 'none';
      }).catch(() => {});
      await p.page.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 8000 }).catch(() => {});
    }
    const mounted = await Promise.all(players.map((p) =>
      p.page.evaluate(() => !!window.__gifosVideo && !!window.__gifosVideo.appActive()).catch(() => false)));
    check('all four mounted the same shared app from the mesh', mounted.every(Boolean), JSON.stringify(mounted));
    check('exactly one of them is the app host',
      (await Promise.all(players.map((p) => p.page.evaluate(() => window.__gifosVideo.appIsHost()).catch(() => false))))
        .filter(Boolean).length === 1);

    // A game does not need the expensive half of a meeting.
    const gum = await Promise.all(players.map((p) => p.page.evaluate(() => window.__gumCount).catch(() => -1)));
    check('nobody\'s camera or microphone was ever opened', gum.every((n) => n === 0), JSON.stringify(gum));

    for (const p of players) {
      const up = await waitInApp(p, () => !!(window.Backdooms && window.Backdooms.state), 60000);
      check('Backdooms booted inside ' + p.name + '\'s sandbox', !!up);
    }

    // ---- everyone presses Play --------------------------------------------
    for (const p of players) {
      await inApp(p, () => { document.getElementById('gate-go').click(); });
      await sleep(400);
    }
    await sleep(4000);   // let the roster settle through the owner

    // THE MAZE IS SHARED. This is the listing's first clause and the whole
    // reason the seed rides on the row: whoever got there first defines the
    // halls, and everyone who follows wakes in the same building.
    const seeds = await Promise.all(players.map((p) => inApp(p, () => window.Backdooms.state().seed)));
    const same = seeds.every((s) => Math.abs(s - seeds[0]) < 1e-9);
    check('all four wake in the SAME maze (one seed)', same, JSON.stringify(seeds));
    if (same) {
      // and it is the same building, not just the same number
      const walls = await Promise.all(players.map((p) => inApp(p, () => {
        let s = '';
        for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++) s += window.Backdooms.cell(i, j);
        return s;
      })));
      check('…and the halls generated from it are identical', walls.every((w) => w === walls[0]),
        walls.map((w) => w.slice(0, 12)).join(' | '));
    }

    // EVERYONE SEES EVERYONE. Not a triangle claim about the mesh's shape —
    // the app lane floods across structural links, so what matters is that all
    // three of the others end up drawn in each player's halls.
    const seen = [];
    for (const p of players) {
      const n = await waitInApp(p, () => {
        const pale = window.Backdooms.view().sprites.filter((s) => s.pale).length;
        return pale >= 3 ? pale : 0;
      }, 45000);
      seen.push(n || 0);
    }
    check('each of the four sees the other three walking the halls',
      seen.every((n) => n >= 3), JSON.stringify(seen));

    // THEY MOVE. A pale figure that never moves is a row that arrived once.
    await Promise.all(players.map((p) => inApp(p, () => { window.Backdooms.keys().w = 1; })));
    const before = await Promise.all(players.map((p) => inApp(p, () =>
      window.Backdooms.view().sprites.filter((s) => s.pale).map((s) => s.x + ',' + s.y).join(' '))));
    await sleep(5000);
    const after = await Promise.all(players.map((p) => inApp(p, () =>
      window.Backdooms.view().sprites.filter((s) => s.pale).map((s) => s.x + ',' + s.y).join(' '))));
    await Promise.all(players.map((p) => inApp(p, () => { window.Backdooms.keys().w = 0; })));
    check('you can watch them walk — every player\'s view of the others changed',
      before.every((b, i) => b && after[i] && b !== after[i]),
      before.map((b, i) => (b !== after[i] ? 'moved' : 'STILL')).join(' '));

    // ---- THE TRAFFIC IT COSTS ---------------------------------------------
    // What is counted is the DELIVERY side: every db-change makes runtime.js
    // re-read the whole collection and hand it to the app, which is the cost
    // that grows with N. Idle is the honest number to gate on, because it is
    // the one that used to be indistinguishable from playing: before the
    // publish-on-change fix this app wrote its row 11.8 times a second while
    // standing perfectly still, so four idle players cost the owner ~50
    // signed floods a second for nothing at all.
    for (const p of players) {
      await inApp(p, () => {
        window.__rosterHits = 0;
        const o = window.Backdooms.setRemotes;
        window.Backdooms.setRemotes = function () { window.__rosterHits++; return o.apply(this, arguments); };
      });
    }
    await sleep(6000);   // NOBODY MOVES
    const idle = await Promise.all(players.map((p) => inApp(p, () => window.__rosterHits)));
    const idlePerSec = idle.map((n) => +(n / 6).toFixed(1));
    console.log('  [traffic] roster deliveries/sec, four players IDLE: ' + JSON.stringify(idlePerSec));
    check('four idle players cost almost nothing (<8 roster deliveries/sec each)',
      idlePerSec.every((r) => r < 8), JSON.stringify(idlePerSec));

    for (const p of players) await inApp(p, () => { window.__rosterHits = 0; window.Backdooms.keys().w = 1; });
    await sleep(6000);   // EVERYBODY MOVES
    const busy = await Promise.all(players.map((p) => inApp(p, () => window.__rosterHits)));
    for (const p of players) await inApp(p, () => { window.Backdooms.keys().w = 0; });
    const busyPerSec = busy.map((n) => +(n / 6).toFixed(1));
    console.log('  [traffic] roster deliveries/sec, four players MOVING: ' + JSON.stringify(busyPerSec));
    check('and moving stays bounded (<60 roster deliveries/sec each)',
      busyPerSec.every((r) => r < 60), JSON.stringify(busyPerSec));
    check('idle is CHEAPER than moving — the app pays for motion, not for existing',
      idlePerSec.reduce((a, b) => a + b, 0) < busyPerSec.reduce((a, b) => a + b, 0),
      'idle ' + idlePerSec.join('/') + '  moving ' + busyPerSec.join('/'));

    // ---- YOU CAN SHOOT THEM, ACROSS FOUR MACHINES -------------------------
    // Ada turns to face whoever is nearest and fires. The damage has to land
    // on a different box, which is the only part of this that a one-box run
    // could ever have told us honestly — and only because it is a yes/no.
    const target = await inApp(ada, () => {
      const s = window.Backdooms.state(), v = window.Backdooms.view();
      let best = null, bd = 1e9;
      for (const sp of v.sprites) {
        if (!sp.pale) continue;
        const d = Math.hypot(sp.x - s.x, sp.y - s.y);
        if (d < bd) { bd = d; best = { x: sp.x, y: sp.y, d }; }
      }
      return best;
    });
    if (!target) {
      check('Ada can find somebody to shoot at', false, 'no pale figure in Ada\'s halls');
    } else {
      const hpBefore = {};
      for (const p of [ben, cyd, dev]) hpBefore[p.name] = await inApp(p, () => window.Backdooms.state().hp);
      // aim, then empty the clip in her direction
      for (let i = 0; i < 30; i++) {
        const done = await inApp(ada, (t) => {
          const B = window.Backdooms, s = B.state();
          let d = Math.atan2(t.y - s.y, t.x - s.x) - s.a;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          B.look(Math.max(-0.3, Math.min(0.3, d)) / 0.0026);
          if (Math.abs(d) < 0.10) { B.shoot(); return true; }
          return false;
        }, target);
        await sleep(done ? 250 : 60);
      }
      await sleep(2500);
      const hurt = [];
      for (const p of [ben, cyd, dev]) {
        const now = await inApp(p, () => window.Backdooms.state().hp);
        if (now < hpBefore[p.name]) hurt.push(p.name + ' ' + hpBefore[p.name] + '→' + now);
      }
      check('a shot fired on one machine takes health off another', hurt.length > 0,
        hurt.length ? hurt.join(', ') : 'nobody on the other three boxes lost health');
    }

    // ---- SOMEBODY LEAVES ---------------------------------------------------
    // There is no lobby and no disconnect message: leaving is going quiet, and
    // a row unheard from for 8s is dropped. Prove the halls empty out.
    await dev.page.close();
    const gone = [];
    for (const p of [ada, ben, cyd]) {
      const n = await waitInApp(p, () => {
        const pale = window.Backdooms.view().sprites.filter((s) => s.pale).length;
        return pale <= 2 ? 1 : 0;
      }, 30000);
      gone.push(!!n);
    }
    check('when one closes the tab, the others\' halls empty out on their own',
      gone.every(Boolean), JSON.stringify(gone));

  } finally {
    for (const p of players) { try { await p.ctx.close(); } catch (e) {} }
    await closeFleet(boxes).catch(() => {});
  }

  console.log('\n' + passes + ' passed, ' + failures + ' failed in '
    + Math.round((Date.now() - t0) / 1000) + 's');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.log('FAIL — the four-friend suite threw: ' + (e && e.message));
  process.exit(1);
});
