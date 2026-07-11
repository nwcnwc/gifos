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
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
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
  for (const n of names) { const p = await mk(n, { C: 2 }); await p.goto(BASE + '/meet.html#v=' + room); pages.push(p); }
  for (const p of pages) await p.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.participants() >= 4, null, { timeout: 30000 });
  await sleep(6000); // cap gossip + elections settle

  check('C=2: identical row maps on all four phones', await agree(pages, rowsOf));
  const rows = JSON.parse(await rowsOf(pages[0]));
  check('C=2: stage empty + two rows of two', rows.length === 3 && rows[0].length === 0 && rows[1].length === 2 && rows[2].length === 2);
  check('C=2: identical deacons everywhere', await agree(pages, (p) => p.evaluate(() => JSON.stringify(window.__gifosVideo.rowDeacons()))));
  const deaconFlags = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo.amDeacon())));
  check('C=2: exactly two deacons (one per populated row)', deaconFlags.filter(Boolean).length === 2);

  // Media links match the arithmetic: everyone links their row mate; deacons
  // additionally link the other deacon. Give ICE a moment.
  await sleep(8000);
  const linkCounts = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo.liveLinks())));
  const expected = deaconFlags.map((d) => (d ? 2 : 1));
  check('C=2: live link counts match row arithmetic (mate, +deacon mesh for deacons) — got [' + linkCounts + '] want [' + expected + ']',
    JSON.stringify(linkCounts) === JSON.stringify(expected));

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

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
