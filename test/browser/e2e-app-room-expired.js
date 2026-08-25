// The empty app room says WHY it is empty (#appwait).
//
// An app invite serves the app from WHOEVER IS IN THE ROOM holding it — there
// is no server copy. So a link opened after the friend closed the app (a
// day-old invite, the reported case) lands its guest in an empty room:
// seated, connected, and — before #appwait — staring at a BLANK page that
// explained nothing. This guards the explanation:
//   - a guest alone in a dead app room is TOLD the invite isn't live, why
//     (the app comes from the friend's device), and that the same link
//     revives when the friend reopens the app;
//   - if other people are waiting too, the story flips to the missing HOST —
//     the room isn't dead, its app holder is away;
//   - the panel never blocks the recovery: it yields to modals and the join
//     veil (z-order), and dissolves on mount (e2e-app-room's converging guest
//     never sees it — asserted there by the app actually appearing).
//
// Needs RELAY + BASE.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

// Poll until fn() is truthy or the clock runs out — returns the last value.
async function until(fn, ms) {
  const t0 = Date.now();
  let v = null;
  while (Date.now() - t0 < ms) {
    v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
  return v;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const mkCtx = async (name) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}");
    return ctx;
  };
  const code = 'exp' + Math.random().toString(36).slice(2, 10); // a room nobody ever founded

  // ---- one guest, dead room -------------------------------------------------
  const A = await (await mkCtx('Ada')).newPage();
  A.on('pageerror', (e) => console.log('  [A] ' + e.message));
  await A.goto(BASE + '/run.html#j=' + code);
  const read = (p) => p.evaluate(() => {
    const w = document.getElementById('appwait');
    if (!w) return null;
    return { t: (w.querySelector('#aw-t') || {}).textContent || '', p: (w.querySelector('#aw-p') || {}).textContent || '',
             spin: !!w.querySelector('.jv-spin'), home: !!w.querySelector('.aw-home') };
  });
  const looking = await until(async () => { const s = await read(A); return s && /Looking for the app/.test(s.t) ? s : null; }, 15000);
  check('a guest in an empty app room sees the wait panel, not a blank page', !!looking, looking && looking.t);
  check('…which spins while an arrival is still plausible', !!(looking && looking.spin));
  const dead = await until(async () => { const s = await read(A); return s && /isn’t live right now/.test(s.t) ? s : null; }, 25000);
  check('alone past the gossip horizon it says the INVITE isn\'t live', !!dead, dead && dead.t);
  check('…explains the app comes from the friend\'s device and revives when they SHARE again (opening alone joins no room)', !!(dead && /friend who shared it has the app open/.test(dead.p) && /open the app and share it again/.test(dead.p)), dead && dead.p.slice(0, 60));
  check('…drops the spinner (nothing is spinning) and offers GifOS itself', !!(dead && !dead.spin && dead.home));

  // ---- a second stranded guest flips the story to the missing host ----------
  const B = await (await mkCtx('Ben')).newPage();
  B.on('pageerror', (e) => console.log('  [B] ' + e.message));
  await B.goto(BASE + '/run.html#j=' + code);
  const hostGone = await until(async () => { const s = await read(A); return s && /host isn’t here/.test(s.t) ? s : null; }, 30000);
  check('a second waiting guest flips the story: the room is alive, its HOST is missing', !!hostGone, hostGone && hostGone.t);
  check('…counts the company and keeps the link\'s promise', !!(hostGone && /One other person is/.test(hostGone.p) && /this link stays good/.test(hostGone.p)), hostGone && hostGone.p.slice(0, 60));
  const bSide = await until(async () => { const s = await read(B); return s && /host isn’t here/.test(s.t) ? s : null; }, 30000);
  check('…and both stranded guests read the same story', !!bSide, bSide && bSide.t);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — suite crashed: ' + e.message); process.exit(1); });
