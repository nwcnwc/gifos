// End-to-end: capabilities.pool — the DECLARED download-pooling mode.
//
// The claim under test is a number, not a feeling: when two people in one
// meeting run an app that pools a host, that host is asked ONCE for a URL they
// both need, not twice. So this suite counts requests at a real HTTP server
// and asserts the count, exactly the way e2e-app-store counts network
// requests rather than reading the source — a cache, a preload, or a second
// code path would sail past a source scan.
//
// Four things are guarded here, and each one is a way the mode could rot:
//   1. THE RULES.   poolHosts() refuses a host that is not also in `network`,
//                   and refuses a host that belongs to a configured keyed API.
//                   Those responses were bought with someone's key.
//   2. THE SAVING.  Two peers, one URL, one upstream request.
//   3. THE OPT-IN.  The same app WITHOUT `pool` costs two requests. Pooling is
//                   a mode an app declares, never something the runtime does
//                   to an app's traffic behind its back.
//   4. THE SHEET.   The consent popup names the pooled hosts, because "your
//                   downloads are shared with the room" is not a detail.
//
// Needs: static server on 8099 and the local relay on 8790. Spawns its own
// counting upstream on 8794 (clear of fake-ai 8791 / keyapi 8792 / proxy 8793).
const { chromium, CHROME } = require('../lib/pw');
const http = require('http');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const UP_PORT = Number(process.env.POOL_PORT || 8794);
// A manifest names HOSTS, never host:port — the same vocabulary `network`
// uses, matched against u.hostname in the bridge.
const UP = '127.0.0.1';
const UP_ORIGIN = 'http://' + UP + ':' + UP_PORT;

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The upstream. Counts hits per path and answers slowly enough that a second
// peer's request genuinely overlaps the first — an instant answer would let
// the race resolve by luck rather than by the claim election.
const hits = new Map();
function startUpstream() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const path = req.url.split('?')[0];
      hits.set(req.url, (hits.get(req.url) || 0) + 1);
      // no-store, so a count of 1 means the POOL saved the request and not the
      // browser's own HTTP cache — which keys on URL and would otherwise make
      // this suite pass for a reason that has nothing to do with the room.
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' };
      setTimeout(() => { res.writeHead(200, cors); res.end('BODY' + path); }, 350);
    });
    srv.listen(UP_PORT, () => resolve(srv));
  });
}
const hitsFor = (u) => { let n = 0; for (const [k, v] of hits) if (k.indexOf(u) === 0) n += v; return n; };

// The app under test: one function, called from the suite, that fetches a URL
// through the bridge and reports what came back. Deliberately dumb — the
// interesting machinery is all in the runtime, and an app that did its own
// caching would hide the thing being measured.
const appHtml = '<!doctype html><meta charset="utf-8"><div id="out">idle</div><script>' +
  'window.__got = {};' +
  'window.go = function (u) { return gifos.fetch(u).then(function (r) { return r.text(); })' +
  '  .then(function (t) { window.__got[u] = t; return t; })' +
  '  .catch(function (e) { window.__got[u] = "ERR:" + e.message; return "ERR:" + e.message; }); };' +
  '</scr' + 'ipt>';

function manifestFor(opts) {
  const caps = { db: true, multiplayer: true, network: opts.network };
  if (opts.pool) caps.pool = opts.pool;
  if (opts.api) caps.api = opts.api;
  return JSON.stringify({ gifos: '1.0', appId: opts.appId, name: opts.name, entry: 'index.html', capabilities: caps });
}

// Seed a GIF app onto a desktop page's store and hand back its fileId.
async function seedApp(page, opts) {
  return page.evaluate(async (a) => {
    const bytes = await GifOS.gif.encode({ 'manifest.json': a.manifest, 'index.html': a.html });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: a.name + '.gif', bytes, kind: 'gif', isApp: true, appId: a.appId, mime: 'image/gif' });
    return fid;
  }, opts);
}

(async () => {
  const upstream = await startUpstream();
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript((v) => {
      try {
        localStorage.setItem('gifos_relay', v.relay);
        localStorage.setItem('gifos_name', v.name);
        localStorage.setItem('gifos_meet_bar', '0');
      } catch (e) {}
    }, { relay: RELAY, name: name });
    return ctx;
  };

  // ======================= 1. THE RULES ===================================
  // poolHosts() is where "pool ⊆ network, and never a keyed host" is enforced
  // rather than merely documented, so it is checked directly.
  const rCtx = await browser.newContext();
  await rCtx.addInitScript((origin) => {
    try { localStorage.setItem('gifos_api_config', JSON.stringify({ Bought: { url: origin, key: 'k' } })); } catch (e) {}
  }, UP_ORIGIN);
  // run.html is where the runtime lives (index.html is the desktop shell).
  const rPage = await rCtx.newPage();
  await rPage.goto(BASE + '/run.html');
  await rPage.waitForFunction(() => window.GifOS && window.GifOS.runtime, null, { timeout: 45000 });
  const rules = await rPage.evaluate((up) => {
    const H = window.GifOS.runtime.poolHosts;
    return {
      plain: H({ capabilities: { network: [up, 'b.example'], pool: [up] } }),
      notInNetwork: H({ capabilities: { network: ['b.example'], pool: [up] } }),
      keyed: H({ capabilities: { network: [up], pool: [up], api: ['Bought'] } }),
      keyedLooseCase: H({ capabilities: { network: [up], pool: [up], api: ['bought'] } }),
      partial: H({ capabilities: { network: [up], pool: [up, 'c.example'] } }),
      none: H({ capabilities: { network: [up] } }),
      star: H({ capabilities: { network: ['*'], pool: ['*'] } }),
      starReach: H({ capabilities: { network: ['*'], pool: [up] } }),
    };
  }, UP);
  check('a declared pool host that is also a network host is allowed', rules.plain.length === 1 && rules.plain[0] === UP, JSON.stringify(rules.plain));
  check('POOL ⊆ NETWORK — a pool host missing from network is dropped', rules.notInNetwork.length === 0, JSON.stringify(rules.notInNetwork));
  check('a host belonging to a configured KEYED api is refused outright', rules.keyed.length === 0, JSON.stringify(rules.keyed));
  check('…and refused however the api entry is capitalised', rules.keyedLooseCase.length === 0, JSON.stringify(rules.keyedLooseCase));
  check('an unreachable pool host is dropped without poisoning the rest', rules.partial.length === 1 && rules.partial[0] === UP, JSON.stringify(rules.partial));
  check('no capabilities.pool means no pooling at all', rules.none.length === 0, JSON.stringify(rules.none));
  check('"pool everything from anywhere" is not a declarable thing', rules.star.length === 0, JSON.stringify(rules.star));
  check('…and a go-anywhere app cannot use * to smuggle a named host in either',
    rules.starReach.length === 0, JSON.stringify(rules.starReach));
  await rCtx.close();

  // ======================= 2/3. THE SAVING, AND THE OPT-IN =================
  // Same app twice — one declaring `pool`, one not — through the same two-peer
  // meeting. The only difference between the runs is the manifest line.
  async function twoPeerRun(label, opts) {
    const aCtx = await newUser('Ada-' + label);
    const aDesk = await aCtx.newPage();
    aDesk.on('pageerror', (e) => console.log('  [a desk pageerror]', e.message));
    await aDesk.goto(BASE + '/index.html');
    await aDesk.waitForSelector('.icon', { timeout: 90000 });
    const fid = await seedApp(aDesk, { manifest: manifestFor(opts), html: appHtml, name: opts.name, appId: opts.appId });

    const aMeet = await aCtx.newPage();
    aMeet.on('pageerror', (e) => console.log('  [a meet pageerror]', e.message));
    await aMeet.goto(BASE + '/run.html');
    await aMeet.locator('#lob-open').click();
    await aMeet.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 45000 });
    const link = await aMeet.evaluate(() => document.getElementById('share-url').value);

    const bCtx = await newUser('Ben-' + label);
    const bMeet = await bCtx.newPage();
    bMeet.on('pageerror', (e) => console.log('  [b meet pageerror]', e.message));
    await bMeet.goto(link);
    await aMeet.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 45000 });
    await bMeet.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 45000 });

    await aMeet.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'Pool App'), fid);
    await aMeet.waitForSelector('#appmount iframe', { timeout: 40000 });
    await bMeet.waitForSelector('#appmount iframe', { timeout: 45000 });
    // The declared-network consent sheet stands between the app and the bridge
    // on BOTH peers; a click on one is not a click on the other. Read it before
    // dismissing it — this IS the sheet the user sees, not a synthetic render.
    await bMeet.waitForSelector('.perm-modal', { timeout: 20000 }).catch(() => {});
    const sheet = await bMeet.evaluate(() => {
      const el = document.querySelector('.perm-modal');
      return el ? el.textContent : '';
    });
    for (const p of [aMeet, bMeet]) await p.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 8000 }).catch(() => {});
    await sleep(600);
    return { aCtx, bCtx, aMeet, bMeet, sheet };
  }

  // Ask BOTH peers for the same URL in the same breath. This is the cold start
  // the whole design exists for: nobody holds it, so without the claim
  // election both would miss and both would fetch.
  async function bothFetch(run, url) {
    const a = run.aMeet.frameLocator('#appmount iframe').locator('body').evaluate((_, u) => window.go(u), url);
    const b = run.bMeet.frameLocator('#appmount iframe').locator('body').evaluate((_, u) => window.go(u), url);
    return Promise.all([a, b]);
  }

  const POOLED = UP_ORIGIN + '/tile?z=1';
  const pooled = await twoPeerRun('pooled', {
    appId: 'pooltest', name: 'PoolTest', network: [UP], pool: [UP],
  });
  const got = await bothFetch(pooled, POOLED);
  check('both peers got the body', got[0] === 'BODY/tile' && got[1] === 'BODY/tile', JSON.stringify(got));
  check('both peers got the IDENTICAL body (a pooled answer is not a re-fetch)', got[0] === got[1]);
  await sleep(500);
  const pooledHits = hitsFor('/tile?z=1');
  check('two peers, one URL → the upstream was asked ONCE', pooledHits === 1, 'hits=' + pooledHits);

  // A second ask is a straight local hit on both sides — no frame, no fetch.
  const again = await bothFetch(pooled, POOLED);
  await sleep(300);
  check('a repeat ask costs the upstream nothing', hitsFor('/tile?z=1') === 1 && again[0] === 'BODY/tile', 'hits=' + hitsFor('/tile?z=1'));

  // The stats are the algorithm's own account of itself: somebody fetched,
  // somebody was spared. If both numbers are zero the count above was luck.
  const stats = await Promise.all([pooled.aMeet, pooled.bMeet].map((p) => p.evaluate(() => window.GifOS.runtime.poolStats)));
  const fetched = stats[0].fetched + stats[1].fetched;
  const spared = stats[0].hits + stats[1].hits;
  // The two silent ways this degrades into "everybody fetches anyway", checked
  // first so a failure below reads as an algorithm bug and not as wiring.
  check('pool frames actually cross the mesh', stats.every((s) => s.rx > 0), JSON.stringify(stats.map((s) => s.rx)));
  console.log('  [claim lag] ' + JSON.stringify(stats.map((s) => s.lag)) + ' ms');
  check('the two peers claim under DIFFERENT ids (an election needs a loser)',
    !!stats[0].self && stats[0].self !== stats[1].self, JSON.stringify(stats.map((s) => s.self)));
  check('exactly one peer elected itself the fetcher', fetched === 1, JSON.stringify(stats));
  check('the other yielded and was served from the room, not from the site',
    spared >= 1 && stats.some((s) => s.yielded === 1), JSON.stringify(stats));

  // ======================= 4. THE SHEET ===================================
  // A capability the user is never told about is not consent. This is the real
  // sheet the guest saw, captured before it was dismissed.
  const sheet = pooled.sheet || '';
  check('the sheet says downloads are pooled with the room', /Pool downloads with the room/.test(sheet), sheet.slice(0, 140));
  check('the sheet NAMES the pooled host', sheet.indexOf(UP) >= 0);
  check('the sheet is honest that answers come from peers, not the site',
    /comes from them rather than from the site/.test(sheet));
  check('the sheet promises keyed accounts are never pooled', /keyed accounts are never pooled/i.test(sheet));

  await pooled.aCtx.close(); await pooled.bCtx.close();

  // ---- the opt-in: the SAME app without `pool` pays full price -------------
  const UNPOOLED = UP_ORIGIN + '/tile?z=2';
  const plain = await twoPeerRun('plain', {
    appId: 'plaintest', name: 'PlainTest', network: [UP],
  });
  const got2 = await bothFetch(plain, UNPOOLED);
  check('the unpooled app still works', got2[0] === 'BODY/tile' && got2[1] === 'BODY/tile', JSON.stringify(got2));
  await sleep(500);
  const plainHits = hitsFor('/tile?z=2');
  check('WITHOUT capabilities.pool the upstream is asked by BOTH peers', plainHits === 2, 'hits=' + plainHits);
  const plainStats = await Promise.all([plain.aMeet, plain.bMeet].map((p) => p.evaluate(() => window.GifOS.runtime.poolStats)));
  check('…and the pool machinery never engaged for it', plainStats.every((s) => s.served === 0), JSON.stringify(plainStats));
  check('the unpooled app is not offered the pooling capability at all',
    !/Pool downloads with the room/.test(plain.sheet || ''), (plain.sheet || '').slice(0, 140));
  await plain.aCtx.close(); await plain.bCtx.close();

  await browser.close();
  upstream.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
