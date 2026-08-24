// ONE RUNTIME steps 2+4 (docs/one-runtime.md): the app room.
//
// The lifecycle under test: an app runs SOLO on a desktop → Invite mints a
// media-less mesh room in place (no navigation, no reload) → a friend opens
// the room link and the app converges to them over the room's owner-signed
// lane → the call layer stays dark until someone opts in, then the other side
// sees a banner (never silent tiles).
//
// Contracts guarded:
//   - Invite transitions the SAME page: solo → app-room, app pinned (no
//     stop/hide affordance), share link minted stable per file;
//   - the client boots the app from the lane with NO relay app-session
//     (role=host never exists) and NO camera/mic ask on either side;
//   - app state converges host→client over the mesh;
//   - call layer: host taps mic → client's banner appears; client joins →
//     grid reveals; nobody's camera turns itself on.
//
// Needs RELAY + BASE.
const { chromium, CHROME } = require('../lib/pw');
const { systemAppIds } = require('../lib/apps');

// A SYSTEM launcher navigates instead of mounting — never pick one here.
const SYS = systemAppIds();

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const mkCtx = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
    await ctx.addInitScript(() => {
      window.__gumCount = 0;
      const md = navigator.mediaDevices;
      if (md && md.getUserMedia) { const real = md.getUserMedia.bind(md); md.getUserMedia = (c) => { window.__gumCount++; return real(c); }; }
    });
    return ctx;
  };

  // ---- host: seed a desktop, open an app solo, Invite ----------------------
  const hCtx = await mkCtx('Hana');
  const d = await hCtx.newPage();
  await d.goto(BASE + '/index.html');
  await d.waitForSelector('.icon', { timeout: 30000 });
  const appId = await d.evaluate(async (SYS) => {
    const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
    return f ? f.id : null;
  }, SYS);
  // Seed a record into the app's state BEFORE it boots: the steal choices are
  // only distinguishable if the room actually HAS data — a sample app that
  // never writes leaves both copies identically empty and the check proves
  // nothing. Written through the same per-record path the app's db uses.
  // _vis: an undeclared collection defaults to PRIVATE and is filtered from
  // everything guests see — per-record visibility is how a bare test record
  // rides the guest lane like a real app's shared data would.
  await d.evaluate((fid) => GifOS.store.appAdd(fid, 'e2e', { id: 'marker', v: 'room data', _vis: 'read-only' }), appId);
  await d.close();
  const h = await hCtx.newPage();
  h.on('pageerror', (e) => console.log('  [host] ' + e.message));
  await h.goto(BASE + '/run.html#id=' + appId);
  await h.waitForSelector('#appmount iframe', { timeout: 30000 });
  check('solo app boots', true);

  // drive the invite modal programmatically — a default app's own perm-modal
  // can overlay the page and intercept pointer events (not what's under test)
  await h.evaluate(() => document.getElementById('appinvite').click());
  await h.waitForSelector('input[name="rmcls"]', { timeout: 10000 });
  await h.evaluate(() => {
    document.querySelector('input[name="rmcls"][value="heal"]').checked = true; // resilient — the succession class
    document.getElementById('inv-go').click();
  });
  await h.waitForFunction(() => document.body.classList.contains('app-room') && window.__gifosVideo.room(), null, { timeout: 20000 });
  check('Invite flips the SAME page into an app room (no navigation)', true);
  check('Help speaks APP ROOM, not the meeting explainer (per-product help)',
    (await h.evaluate(() => document.querySelector('#help-modal h3').textContent)) === 'How this app room works');
  await h.waitForFunction(() => window.__gifosVideo.appIsHost && window.__gifosVideo.appIsHost(), null, { timeout: 20000 });
  check('the inviter hosts the app on the room lane', true);
  const link = await h.evaluate(() => document.getElementById('share-url').value);
  check('a /join-shaped room link is minted', /#j=|\/join\//.test(link), link);
  check('app room stays camera-quiet: zero getUserMedia on the host', (await h.evaluate(() => window.__gumCount)) === 0);
  check('the app is PINNED — no stop/hide affordance', await h.evaluate(() => {
    const s = document.getElementById('appstop'), hd = document.getElementById('apphide');
    return s.style.display === 'none' && hd.style.display === 'none';
  }));
  check('grid is dark (no call layer yet)', await h.evaluate(() => !document.body.classList.contains('call-on')));
  // THE DOOR. The meeting bar (mic/cam) is hidden in a dark app room, so a
  // person needs a visible way in: the A/V button on the app bar. Every click
  // below is a REAL Playwright click — it refuses a hidden element — because
  // this suite once drove #cam with a programmatic click, which a hidden
  // button answers, and shipped an app room nobody could start a call from.
  const vis = (pg, id) => pg.evaluate((i) => { const e = document.getElementById(i); return !!(e && e.offsetParent && getComputedStyle(e).display !== 'none'); }, id);
  await h.click('#inv-done'); // close the invite sheet the way a person does — it sits over the app bar
  await h.waitForFunction(() => { const m = document.getElementById('inv-modal'); return !m || getComputedStyle(m).display === 'none'; }, null, { timeout: 10000 });
  check('the host sees an A/V button on the app bar once the room exists', await vis(h, 'appav'));
  check('…and the mic/cam controls are NOT shown before it is tapped (the room starts dark)', !(await vis(h, 'cam')) && !(await vis(h, 'mic')));
  await h.click('#appav');
  check('tapping A/V reveals the real mic and camera controls', (await vis(h, 'cam')) && (await vis(h, 'mic')));
  check('A/V itself asks for nothing — still zero getUserMedia', (await h.evaluate(() => window.__gumCount)) === 0);
  check('…and the room is still dark until a control is tapped', await h.evaluate(() => !document.body.classList.contains('call-on')));

  // ---- client: open the room link ------------------------------------------
  const cCtx = await mkCtx('Cleo');
  const c = await cCtx.newPage();
  c.on('pageerror', (e) => console.log('  [client] ' + e.message));
  await c.goto(link);
  await c.waitForSelector('#appmount iframe', { timeout: 40000 });
  check('the client auto-mounts the app from the room lane', true);
  check('client is not the host', await c.evaluate(() => !window.__gifosVideo.appIsHost()));
  check('client never asked for camera/mic either', (await c.evaluate(() => window.__gumCount)) === 0);
  check('NO relay app-session anywhere (role=host socket never existed)',
    (await h.evaluate(() => (window.__gifosConns || []).every((s) => { try { const w = s._raw && s._raw(); return !(w && /[?&]role=host\b/.test(w.url || '')); } catch (e) { return true; } })))
    && (await c.evaluate(() => (window.__gifosConns || []).every((s) => { try { const w = s._raw && s._raw(); return !(w && /[?&]role=host\b/.test(w.url || '')); } catch (e) { return true; } }))));

  // ---- call layer: host opts in, client sees the banner --------------------
  await h.click('#cam'); // a REAL click on the visible control — the host joins the call (lateMedia asks now)
  await h.waitForFunction(() => document.body.classList.contains('call-on'), null, { timeout: 15000 });
  check('host tapping camera opts THEM into the call layer', true);
  check('…and only now does the host ask for media', (await h.evaluate(() => window.__gumCount)) > 0);
  check('camera and mic are INDEPENDENT: camera on, mic still muted', await h.evaluate(() => {
    const v = window.__gifosVideo; const st = v.myStatus ? v.myStatus() : null;
    return st ? (!st.camOff && st.muted) : document.getElementById('mic').classList.contains('off');
  }));
  await h.click('#mic');
  await h.waitForFunction(() => !document.getElementById('mic').classList.contains('off'), null, { timeout: 15000 });
  check('…mic turns on by itself', true);
  await h.click('#cam');
  await h.waitForFunction(() => document.getElementById('cam').classList.contains('off'), null, { timeout: 15000 });
  check('…and camera turns off by itself, mic stays on', !(await h.evaluate(() => document.getElementById('mic').classList.contains('off'))));
  await h.click('#cam'); // back on for the rest of the scenario
  await h.waitForFunction(() => !document.getElementById('cam').classList.contains('off'), null, { timeout: 15000 });
  check('the guest sees the same A/V door on their app bar', await vis(c, 'appav'));
  await c.waitForFunction(() => document.getElementById('callbanner').style.display !== 'none', null, { timeout: 20000 });
  check('the client sees the call banner (never silent tiles)', true);
  check('the client still has not asked for media', (await c.evaluate(() => window.__gumCount)) === 0);
  await c.evaluate(() => document.getElementById('callbanner-join').click());
  await c.waitForFunction(() => document.body.classList.contains('call-on'), null, { timeout: 15000 });
  check('joining reveals the grid for the client', true);

  // ---- steal: a guest takes a copy — three ways -----------------------------
  // The engine has always had three modes and the modal that offered them was
  // lost somewhere along the way. First press splits the button into the
  // choices; each choice is proven by what lands: '+ data' carries everything
  // including a record written AFTER this guest joined, 'as I joined' carries
  // only what the room held at join, 'app only' carries nothing.
  check('the Steal chrome shows for the guest', await c.evaluate(() => document.getElementById('appsteal').style.display !== 'none'));
  // A record written after the guest joined, pushed through the host app's own
  // change channel so the room actually syncs it.
  await h.evaluate(async (fid) => {
    await GifOS.store.appAdd(fid, 'e2e', { id: 'late', v: 'after join', _vis: 'read-only' });
    new BroadcastChannel(GifOS.store.appChannel(fid)).postMessage({ collection: 'e2e' });
  }, appId);
  await c.waitForFunction(() => {
    const ctl = window.__appClientCtl;
    if (!ctl || !ctl.mirrorState) return false;
    const col = ctl.mirrorState().collections.e2e;
    return !!(col && col.items && col.items.late);
  }, null, { timeout: 20000 });
  check('the late record converged to the guest before the steals', true);

  // WAIT FOR *THIS* STEAL, NOT FOR ANY STEAL. All three confirmations open
  // "🥷 Yours now — ", so a bare /Yours now/ matches the PREVIOUS steal's
  // message, which is still on screen (setStatus holds it 4s). Measured: the
  // 'as I joined' steal "completed" 11ms after its click, on the '+ data'
  // message, while its own steal was still in flight (armed=1, chooser still
  // open). The next steal then raced the real completion, and when it lost, its
  // b.click() landed during the 4s '🥷 Stolen ✓' lockout — a click on a
  // DISABLED button is a silent no-op, so the chooser never opened and the
  // option "was not found". That is the whole flake; the product was fine.
  //
  // So: each mode waits for its OWN wording, and then for the button to come
  // all the way back to rest before the next one starts. Both are STRICTER
  // than what was here — the resting-state wait newly pins that the button
  // restores its label and re-enables itself after every steal.
  const REST = "b.textContent === 'Steal' && !b.disabled && !b.dataset.armed";
  const atRest = () => c.waitForFunction(
    '(() => { const b = document.getElementById("appsteal"); return ' + REST + '; })()',
    null, { timeout: 15000 });
  const stealOne = async (optText, mine) => {
    await atRest();
    // Open the chooser and pick the option in ONE evaluate: the top bar can
    // re-render between round trips (room events land continuously) and take
    // the freshly inserted choice buttons with it.
    const picked = await c.evaluate((t) => {
      const b = document.getElementById('appsteal');
      if (b.disabled) return { ok: false, seen: [], why: 'the Steal button was disabled — click() would be a silent no-op' };
      delete b.dataset.armed;
      b.click();
      let n = b.nextSibling; const seen = [];
      while (n) {
        if (n.textContent === t) { n.click(); return { ok: true }; }
        seen.push(n.textContent || n.nodeName); n = n.nextSibling;
      }
      return { ok: false, seen, why: 'the chooser did not open' };
    }, optText);
    if (!picked.ok) throw new Error('steal option "' + optText + '" not picked (' + picked.why + '); siblings: ' + JSON.stringify(picked.seen));
    await c.waitForFunction((frag) => document.getElementById('status').textContent.includes(frag),
      mine, { timeout: 15000 });
    // THE CONFIRMATION IS ON THE BUTTON (the 2026-08-08 report: the copy saved
    // and the point of click said nothing). Read it HERE, in the same beat the
    // status lands — run.html sets the label, disables, and calls setStatus in
    // one synchronous block, so this cannot race. It used to be checked once
    // after all three steals, which only ever passed by outrunning the 4s
    // restore timer.
    return c.evaluate(() => /Stolen/.test(document.getElementById('appsteal').textContent));
  };
  await c.evaluate(() => document.getElementById('appsteal').click());
  const choices = await c.evaluate(() => {
    const b = document.getElementById('appsteal');
    let n = b.nextSibling, texts = [];
    while (n && n.tagName === 'BUTTON') { texts.push(n.textContent); n = n.nextSibling; }
    n = b.nextSibling; // fold it back for the real steals below
    const kids = texts.length; for (let i = 0; i < kids; i++) { const x = b.nextSibling; x.remove(); }
    delete b.dataset.armed; b.style.display = '';
    return texts;
  });
  check('the first press asks WHICH copy — the three choices, restored',
    choices.length === 3 && choices.join('|') === '+ data|as I joined|app only', JSON.stringify(choices));

  // THE WHOLE POINT OF THE RITUAL: every byte a steal needs — the app, the
  // live mirror, the join-time snapshot — already arrived when you joined.
  // So steal with the network UNPLUGGED: if any of the three modes secretly
  // re-fetched anything, it would fail right here.
  await cCtx.setOffline(true);
  const confirmed = [];
  confirmed.push(await stealOne('+ data', 'data and all'));
  confirmed.push(await stealOne('as I joined', 'as it stood when you joined'));
  confirmed.push(await stealOne('app only', 'a clean copy'));
  await atRest(); // the third steal must restore the button too
  await cCtx.setOffline(false);
  check('all three steals completed with the network UNPLUGGED — no re-fetch, ever', true);
  check('and the Steal button came back to rest after every one', true);
  const kinds = await c.evaluate(async () => {
    const fs = (await GifOS.store.allFiles()).filter((f) => f.isApp && !f.isDefault);
    const out = { copies: fs.length, current: 0, connect: 0, clean: 0 };
    for (const f of fs) {
      const marker = await GifOS.store.appGet(f.id, 'e2e', 'marker').catch(() => null);
      const late = await GifOS.store.appGet(f.id, 'e2e', 'late').catch(() => null);
      if (marker && late) out.current++;
      else if (marker && !late) out.connect++;
      else if (!marker && !late) out.clean++;
    }
    return out;
  });
  check('the three copies are the three different things they claim to be',
    kinds.copies === 3 && kinds.current === 1 && kinds.connect === 1 && kinds.clean === 1,
    JSON.stringify(kinds));
  check('the Steal button itself confirms EVERY steal, at the point of click',
    confirmed.length === 3 && confirmed.every(Boolean), JSON.stringify(confirmed));

  // ---- succession (resilient room): the owner vanishes -----------------------
  // The sole remaining member is the deterministic successor: the app never
  // unmounts, freezes briefly, then the client adopts its mirror and re-hosts.
  await h.close();
  // owner-away respects the G1 away-holdover (a pocketed phone must not
  // freeze its app) — budget the full holdover + confirm window
  await c.waitForFunction(() => /paused — the host is away/.test(document.getElementById('appwho').textContent), null, { timeout: 100000 });
  check('owner-away freezes the app IN PLACE (never unmounted)', await c.evaluate(() => !!document.querySelector('#appmount iframe')));
  await c.waitForFunction(() => window.__gifosVideo.appIsHost(), null, { timeout: 30000 });
  check('the deterministic successor adopts the app and re-hosts (resilient room)', true);
  check('the room thawed — no longer paused', await c.evaluate(() => !/paused/.test(document.getElementById('appwho').textContent)));

  // ---- owned room: freeze is the whole story (no succession) ---------------
  const oCtx = await mkCtx('Owna');
  const od = await oCtx.newPage();
  await od.goto(BASE + '/index.html');
  await od.waitForSelector('.icon', { timeout: 30000 });
  const appId2 = await od.evaluate(async (SYS) => {
    const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
    return f ? f.id : null;
  }, SYS);
  await od.close();
  const o = await oCtx.newPage();
  await o.goto(BASE + '/run.html#id=' + appId2);
  await o.waitForSelector('#appmount iframe', { timeout: 30000 });
  await o.evaluate(() => document.getElementById('appinvite').click());
  await o.waitForSelector('#inv-go', { timeout: 10000 });
  await o.evaluate(() => document.getElementById('inv-go').click()); // default = owned ("Only I can host it")
  await o.waitForFunction(() => window.__gifosVideo.appIsHost && window.__gifosVideo.appIsHost(), null, { timeout: 30000 });
  const link2 = await o.evaluate(() => document.getElementById('share-url').value);
  check('an OWNED room link carries the shortname + verifier', /#s=.+\.[a-f0-9]{16,}&k=|\/join\/[a-z0-9-]+\/[a-f0-9]{16,}\//.test(link2), link2);
  const g2Ctx = await mkCtx('Gus');
  const g2 = await g2Ctx.newPage();
  await g2.goto(link2);
  await g2.waitForSelector('#appmount iframe', { timeout: 40000 });
  await o.close();
  await g2.waitForFunction(() => /paused — the host is away/.test(document.getElementById('appwho').textContent), null, { timeout: 100000 });
  check('owned room: owner-away freezes', true);
  await g2.waitForTimeout(12000);
  check('owned room: NO succession — the verifier never silently transfers',
    await g2.evaluate(() => !window.__gifosVideo.appIsHost() && /paused/.test(document.getElementById('appwho').textContent)));
  check('…and the frozen app is still mounted (reads keep working)', await g2.evaluate(() => !!document.querySelector('#appmount iframe')));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILED') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
