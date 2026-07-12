// ROWS K-sweep e2e (docs/rows.md). The doctrine under test: the same lines
// of code run at every size — shrinking GIFOS_SCALE constants makes ten
// browsers exercise the structure a million would. Assertions here are the
// scale-free invariants:
//   * every phone derives the IDENTICAL row map and deacon set (no gossip,
//     pure arithmetic over the shared roster),
//   * media links span exactly the row arithmetic (row mates + deacon mesh),
//   * gossip (chat) spans the whole DIRECTORY regardless of rows,
//   * killing a deacon re-elects deterministically and links re-form,
//   * K=∞ identity: at default constants a small room is ONE row and the
//     link set is everyone — today's mesh, byte for byte.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const mk = async (name, scale) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0');"
      + (scale ? 'window.GIFOS_SCALE=' + JSON.stringify(scale) + ';' : '') });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [' + name + ' PAGEERROR]', e.message));
    return p;
  };
  const rowsOf = (p) => p.evaluate(() => JSON.stringify(window.__gifosVideo.rows()));
  const agree = async (pages, fn) => {
    const vals = await Promise.all(pages.map(fn));
    return vals.every((v) => v === vals[0]);
  };

  // ================= C=2: four people, two populated rows =================
  const room = 'ksweep' + Math.floor(Math.random() * 1e9).toString(36);
  const names = ['Ada', 'Ben', 'Cyd', 'Dot'];
  const pages = [];
  // tiny fold budget: structure under test, not pixel throughput on a shared CI core
  for (const n of names) { const p = await mk(n, { C: 2, COMP_W: 160, COMP_H: 90, COMP_FPS: 4 }); await p.goto(BASE + '/meet.html#v=' + room); pages.push(p); }
  for (const p of pages) await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.participants() >= 4, null, { timeout: 30000 });
  await sleep(6000); // cap gossip + elections settle

  check('C=2: identical row maps on all four phones', await agree(pages, rowsOf));
  const rows = JSON.parse(await rowsOf(pages[0]));
  check('C=2: stage empty + two rows of two', rows.length === 3 && rows[0].length === 0 && rows[1].length === 2 && rows[2].length === 2);
  check('C=2: identical deacons everywhere', await agree(pages, (p) => p.evaluate(() => JSON.stringify(window.__gifosVideo.rowDeacons()))));
  const deaconFlags = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo.amDeacon())));
  check('C=2: exactly two deacons (one per populated row)', deaconFlags.filter(Boolean).length === 2);

  // Media links match the arithmetic: everyone links their row mate; deacons
  // additionally link the other deacon. Give ICE a moment — and outlast the
  // 15s unlink grace, so join-churn leftovers are gone before exact counts.
  await sleep(20000);
  const linkCounts = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo.liveLinks())));
  const expected = deaconFlags.map((d) => (d ? 2 : 1));
  check('C=2: live link counts match row arithmetic (mate, +deacon mesh for deacons) — got [' + linkCounts + '] want [' + expected + ']',
    JSON.stringify(linkCounts) === JSON.stringify(expected));

  // Composites (fold up, forward down): every phone sees the OTHER row as ONE
  // live folded tile — deacons via the mesh, members via their deacon's
  // forward. `live` means the announced streamId was claimed; videoWidth>0
  // means composite frames are actually decoding.
  let stadOk = true;
  for (const p of pages) {
    const got = await p.waitForFunction(() => {
      const v = window.__gifosVideo;
      const s = v.stadium();
      return v.stadiumShown() && s.length === 1 && s[0].live && v.stadiumVideoLive(s[0].row);
    }, null, { timeout: 25000 }).then(() => true).catch(() => false);
    if (!got) stadOk = false;
  }
  check('C=2: every phone shows ONE live stadium tile with frames flowing (the other row, folded)', stadOk);
  const manifestOk = await Promise.all(pages.map((p) => p.evaluate(() => {
    const v = window.__gifosVideo;
    const rows = v.rows(), mine = v.myRow();
    const other = rows.findIndex((r, ri) => ri > 0 && ri !== mine && r.length);
    const s = v.stadium()[0];
    return !!s && s.row === other
      && JSON.stringify(s.ids.slice().sort()) === JSON.stringify(rows[other].slice().sort());
  })));
  check('C=2: the stadium manifest attributes exactly the folded row\'s members', manifestOk.every(Boolean));
  const compFlags = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo.compActive())));
  check('C=2: compositors run exactly on the deacons — fold where you lead', JSON.stringify(compFlags) === JSON.stringify(deaconFlags));

  // The STAGE is just a row at the top: one step-up gossips one timestamp and
  // every phone derives the same row 0; the whole room links the staged
  // member; the folds exclude them; stepping down re-packs to today's shape.
  await pages[0].evaluate(() => window.__gifosVideo.setStageForTest(true));
  let stageOk = true;
  for (const p of pages) {
    const got = await p.waitForFunction(() => {
      const v = window.__gifosVideo;
      return v.stageIds().length === 1 && v.rows()[0].length === 1;
    }, null, { timeout: 25000 }).then(() => true).catch(() => false);
    if (!got) stageOk = false;
  }
  check('stage: one step-up puts the SAME person on row 0 of every phone',
    stageOk && await agree(pages, (p) => p.evaluate(() => JSON.stringify(window.__gifosVideo.stageIds()))));
  const stageLinked = await pages[0].waitForFunction(() => window.__gifosVideo.liveLinks() >= 3, null, { timeout: 25000 }).then(() => true).catch(() => false);
  check('stage: the whole room links the staged member (row 0 subscribed by all)', stageLinked);
  const stagedMarked = await pages[1].waitForFunction(() => !!document.querySelector('.tile.onstage'), null, { timeout: 15000 }).then(() => true).catch(() => false);
  check('stage: the staged tile floats first, marked, on other phones', stagedMarked);

  // Buses: in a single section the folded other-row is the MY SECTION bus, so
  // its fader — not the stadium one — silences it, and the stadium fader isn't
  // even shown (no cross-section content yet). Stage stays at full volume.
  // Receiver-side, one phone's own knob.
  const busReady = await pages[1].waitForFunction(() => window.__gifosVideo.stadium().length >= 1, null, { timeout: 25000 }).then(() => true).catch(() => false);
  const busOk = busReady && await pages[1].evaluate(() => {
    const v = window.__gifosVideo;
    v.setMix('section', 0);
    const secZero = v.stadium().every((s) => v.stadiumVolume(s.row) === 0);
    const stagedId = v.stageIds()[0];
    return secZero && v.tileVolume(stagedId) === 1;
  });
  check('buses: the My section fader zeroes exactly the section folds — the stage stays at full volume', busOk);
  const faderVis = await pages[1].evaluate(() => {
    const v = window.__gifosVideo;
    return { section: v.mixFaderShown('section'), stadium: v.mixFaderShown('stadium') };
  });
  check('buses: My section fader is shown (other rows present), The stadium fader is hidden (single section)',
    faderVis.section === true && faderVis.stadium === false);
  const noBands = await pages[1].evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
    return !vis('band-sec') && !vis('band-stad');
  });
  check('feed: a single-section room shows no zone bands — the whole mosaic is your section', noBands);
  await pages[1].evaluate(() => window.__gifosVideo.setMix('section', 1));

  await pages[0].evaluate(() => window.__gifosVideo.setStageForTest(false));
  let downOk = true;
  for (const p of pages) {
    const got = await p.waitForFunction(() => {
      const v = window.__gifosVideo;
      const rows = v.rows();
      return v.stageIds().length === 0 && rows.length === 3 && rows[0].length === 0 && rows[1].length === 2 && rows[2].length === 2;
    }, null, { timeout: 25000 }).then(() => true).catch(() => false);
    if (!got) downOk = false;
  }
  check('stage: stepping down re-packs every phone to the original two rows', downOk);

  // Gossip spans the DIRECTORY: chat from row 1 must reach row 2 even though
  // no media link crosses the row boundary.
  const senderIdx = 0;
  await pages[senderIdx].locator('#chatbtn').click();
  await pages[senderIdx].locator('#chat-in').fill('across the rows');
  await pages[senderIdx].locator('#chatform button[type=submit]').click();
  let crossOk = true;
  for (const p of pages) {
    const got = await p.waitForFunction(() => window.__gifosVideo.chatTexts().includes('across the rows'), null, { timeout: 15000 }).then(() => true).catch(() => false);
    if (!got) crossOk = false;
  }
  check('chat crosses row boundaries (directory gossip, not media links)', crossOk);

  // Deacon failover: close a deacon's page; the survivor of that row is
  // re-elected by everyone and the deacon mesh re-forms.
  const deadIdx = deaconFlags.indexOf(true);
  await pages[deadIdx].close();
  const alive = pages.filter((_, i) => i !== deadIdx);
  for (const p of alive) await p.waitForFunction(() => window.__gifosVideo.participants() <= 3, null, { timeout: 30000 });
  await sleep(8000);
  check('after a deacon dies: identical (smaller) row maps everywhere', await agree(alive, rowsOf));
  check('after a deacon dies: deacons re-agreed everywhere', await agree(alive, (p) => p.evaluate(() => JSON.stringify(window.__gifosVideo.rowDeacons()))));
  const aliveDeacons = await Promise.all(alive.map((p) => p.evaluate(() => window.__gifosVideo.amDeacon())));
  check('every populated row has a live deacon again', aliveDeacons.filter(Boolean).length === JSON.parse(await rowsOf(alive[0])).filter((r, i) => i > 0 && r.length).length);
  // …and the STADIUM re-folds: three survivors at C=2 still make two populated
  // rows, so a fresh fold must come back live on every remaining phone.
  let healOk = true;
  for (const p of alive) {
    const got = await p.waitForFunction(() => {
      const v = window.__gifosVideo;
      const s = v.stadium();
      return s.length === 1 && s[0].live;
    }, null, { timeout: 45000 }).then(() => true).catch(() => false);
    if (!got) healOk = false;
  }
  check('after a deacon dies: the stadium re-folds and comes back live everywhere', healOk);
  for (const p of alive) await p.close();

  // ================= K=∞ identity: default constants, 3 people ==============
  const room2 = 'ident' + Math.floor(Math.random() * 1e9).toString(36);
  const pages2 = [];
  for (const n of ['Eve', 'Fay', 'Gil']) { const p = await mk(n); await p.goto(BASE + '/meet.html#v=' + room2); pages2.push(p); }
  for (const p of pages2) await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.participants() >= 3, null, { timeout: 30000 });
  await sleep(8000);
  const links2 = await Promise.all(pages2.map((p) => p.evaluate(() => window.__gifosVideo.liveLinks())));
  check('K=∞ identity: one row, full mesh — every phone holds 2 live links (today\'s meeting)',
    JSON.stringify(links2) === JSON.stringify([2, 2, 2]));
  const rows2 = JSON.parse(await rowsOf(pages2[0]));
  check('K=∞ identity: single populated row, stage born empty', rows2.length === 2 && rows2[0].length === 0 && rows2[1].length === 3);
  const identComp = await Promise.all(pages2.map((p) => p.evaluate(() => {
    const v = window.__gifosVideo;
    return !v.compActive() && v.stadium().length === 0 && !v.stadiumShown() && v.compFwdJobs() === 0;
  })));
  check('K=∞ identity: no compositor, no stadium, no forwarding — a small room does NONE of this', identComp.every(Boolean));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
