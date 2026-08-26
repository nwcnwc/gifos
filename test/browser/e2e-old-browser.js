// TOO OLD TO MEET, AND TOLD SO — the guard for the browser-preflight screen.
//
// The bug this guards: a browser that cannot hold a meeting used to find out
// the slow way. It booted, knocked at a door it had no hands for, never
// seated, and after four seconds got the joining veil — "Reaching the
// meeting…" — with a spinner that turned until the tab was closed. That is
// the worst answer a product can give, because it is a lie of omission:
// nothing was ever going to reach anything. Nobody's mother reads a stuck
// spinner as "update Safari".
//
// The contract asserted, one missing API at a time (addInitScript deletes it
// before a single line of page script runs — the exact shape of an old
// engine):
//   (1) the explanation appears, fast, and NAMES the missing piece so a
//       support conversation has something to work with,
//   (2) the JOINING VEIL NEVER SHOWS. This is the load-bearing half. The veil
//       arms 4s after an unseated boot, so a page that merely painted the
//       explanation and then went on knocking underneath would still end up
//       spinning. The gate must stop the boot, not decorate it — so we wait
//       past the veil's own arming window and assert #joinveil is absent.
//   (3) the COPY names the browser the person is actually holding (UA is read
//       for the words only — never for the verdict).
//   (4) THE NON-REGRESSION HALF: a browser missing only getUserMedia is NOT
//       too old. View-only join is a first-class state (see e2e-knock-first),
//       so a camera-less browser must sail through the preflight and SEAT.
//   (5) the public support matrix (/browser-support.html, rendered from
//       site/browser-support.json) quotes the SAME numbers the too-old screen
//       does. A published matrix that disagrees with the product is worse than
//       no matrix — it teaches people the wrong thing with authority.
//
// Ed25519 DELIBERATELY HAS NO WALL CASE ANYMORE. It used to set the whole
// version table (Safari 17 / Chrome 137 / Firefox 129); since the fallback
// signer landed (gifos-ed.js + the pinned vendor), a browser whose importKey
// rejects Ed25519 — exactly what Chrome 136 / Firefox 128 / Safari 16 do —
// must JOIN, signing through the JS engine. That inversion is contract (8),
// and the two-engine room is e2e-ed-fallback.js's whole job.
//
//   (6) THE SOLO DOCTRINE: a solo app (#id=<fileId>) is one tab and no
//       network, so it must RUN on a browser that could never meet — the wall
//       never paints at load (measured failing on a real Safari 16, family
//       demo 2026-08-05: a working app hidden behind "too old for meetings").
//       The verdict is recorded and paints at the solo entry's ONE network
//       act — the Share-live button — dismissible, over the still-working
//       app. Negative-controlled: a healthy browser's Share-live goes
//       straight to the share dialog, no wall.
//   (7) the wall carries ONE plain-language WHY line picked for the telling
//       gap (requirements[*].plain in browser-support.json, generated into
//       the preflight): WebCrypto → scrambling happens on-device; WebRTC →
//       direct browser-to-browser; WebSocket → the doorway introduction.
//       Truth-controlled: an ancient gap (TextEncoder) gets NO line at all.
//   (8) THE INVERSION: the Safari-16 shape (importKey rejecting Ed25519,
//       everything else present) passes the preflight and SEATS — the exact
//       browser the old wall turned away is now a participant.
//
// Needs: python3 -m http.server 8099 -d site ; node test/servers/relay-local.js
const { chromium, CHROME } = require('../lib/pw');
const { systemAppIds } = require('../lib/apps');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The veil arms at 4s of unseated boot; wait comfortably past it before
// declaring it absent, or this suite passes for the wrong reason.
const VEIL_ARM_MS = 4000, VEIL_WAIT_MS = 9000;

// Each case: how to cripple the browser, the words we expect in the screen's
// machine-readable gap list, and the plain-language WHY line contract (7):
// `why` is a regex the line must match, `whyNot` a regex it must NOT (the
// truth control), and `why: null` asserts NO line paints at all.
const CASES = [
  {
    id: 'RTCPeerConnection',
    gap: 'WebRTC (RTCPeerConnection)',
    why: /browser-to-browser|straight between/i, whyNot: /signed|scrambl/i,
    init: () => { try { delete window.RTCPeerConnection; } catch (e) {} try { window.RTCPeerConnection = undefined; } catch (e) {} },
  },
  {
    id: 'createDataChannel',
    gap: 'createDataChannel',
    // same WebRTC family, same line — the direct-connection sentence holds
    why: /browser-to-browser|straight between/i, whyNot: /signed/i,
    init: () => { try { delete window.RTCPeerConnection.prototype.createDataChannel; } catch (e) {} },
  },
  {
    id: 'WebSocket',
    gap: 'WebSocket',
    why: /doorway/i, whyNot: /signed|scrambl/i,
    init: () => { try { delete window.WebSocket; } catch (e) {} try { window.WebSocket = undefined; } catch (e) {} },
  },
  {
    id: 'crypto.subtle',
    gap: 'WebCrypto (crypto.subtle)',
    // The truth control: the SIGNED line claims "this browser can scramble a
    // call just fine" — with crypto.subtle itself missing that would be a
    // lie, so this browser must get the SCRAMBLING line instead.
    why: /scrambl/i, whyNot: /signed|pretending/i,
    init: () => { try { Object.defineProperty(window.crypto, 'subtle', { get: function () { return undefined; }, configurable: true }); } catch (e) {} },
  },
  {
    id: 'crypto.subtle.deriveBits',
    gap: 'WebCrypto deriveBits',
    why: /scrambl/i, whyNot: /signed|pretending/i,
    init: () => { try { Object.defineProperty(window.crypto.subtle, 'deriveBits', { value: undefined, configurable: true }); } catch (e) {} },
  },
  {
    id: 'TextEncoder',
    gap: 'TextEncoder/TextDecoder',
    // Ancient gap: NO why line — "too old, update it" is the whole truth.
    why: null,
    init: () => { try { delete window.TextEncoder; } catch (e) {} try { window.TextEncoder = undefined; } catch (e) {} },
  },
];

// The Safari-16 shape: everything works EXCEPT Ed25519 — importKey rejects
// that one algorithm, exactly as Chrome 136 / Firefox 128 / Safari 16 do.
// No longer a wall case (see the header): used by (8) to prove the seat, and
// by (6) to prove solo + Share-live sail through on that browser.
const SAFARI16 = () => {
  const real = window.crypto.subtle.importKey.bind(window.crypto.subtle);
  Object.defineProperty(window.crypto.subtle, 'importKey', {
    configurable: true,
    value: function (fmt, key, alg, ext, uses) {
      const n = (alg && alg.name) || alg;
      if (String(n) === 'Ed25519') return Promise.reject(new Error('Unrecognized name.'));
      return real(fmt, key, alg, ext, uses);
    },
  });
};

const LAUNCH = { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] };

(async () => {
  let browser = await chromium.launch({ executablePath: CHROME, ...LAUNCH });
  // This suite opens ~10 contexts back to back and the browser process has been
  // seen to die partway through — a box symptom, not a product one, but it
  // reads as a red suite (measured once in 2026-08-05 bring-up). Re-launch on
  // a dropped connection so a dead Chromium never masquerades as a failed
  // assertion; the assertions themselves are untouched.
  const newContext = async (opts) => {
    if (!browser.isConnected()) { console.log('  [harness] browser died — relaunching'); browser = await chromium.launch({ executablePath: CHROME, ...LAUNCH }); }
    return browser.newContext(opts);
  };

  // ---- (1)-(2): one missing API at a time ----------------------------------
  for (const c of CASES) {
    const ctx = await newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Old')}catch(e){}");
    await ctx.addInitScript(c.init);
    const p = await ctx.newPage();
    p.on('pageerror', () => {}); // a crippled browser throws downstream; that is expected, not the contract
    const room = 'oldbrowser-' + Math.random().toString(36).slice(2, 8);
    await p.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');

    let seen = null;
    for (let t = 0; t < 20 && !seen; t++) {
      seen = await p.evaluate(() => {
        const el = document.getElementById('oldbrowser');
        if (!el) return null;
        const s = document.getElementById('oldbrowser-why');
        return { gaps: el.getAttribute('data-gaps') || '', head: (document.getElementById('oldbrowser-head') || {}).textContent || '', text: el.textContent || '', why: s ? s.textContent : null };
      }).catch(() => null);
      if (!seen) await sleep(250);
    }
    check('no ' + c.id + ' → the explanation appears', !!seen);
    check('…and it names the missing piece (' + c.gap + ')', !!seen && seen.gaps.indexOf(c.gap) !== -1, seen && seen.gaps);
    check('…and it says, in words, that meetings need a newer browser',
      !!seen && /too old|newer|Open this in your browser/i.test(seen.text));
    // (7) the plain-language WHY line: the right one, and only where TRUE.
    if (c.why === null) {
      check('…and no why line paints (ancient gap — "too old" is the whole truth)',
        !!seen && seen.why === null, seen && seen.why);
    } else if (c.why) {
      check('…and the why line fits the gap (' + c.why + ')',
        !!seen && !!seen.why && c.why.test(seen.why), seen && (seen.why || '').slice(0, 100));
      check('…and never claims what this browser cannot do (' + c.whyNot + ')',
        !!seen && !!seen.why && !c.whyNot.test(seen.why), seen && (seen.why || '').slice(0, 100));
    }

    // THE LOAD-BEARING ONE: nothing knocked, so nothing can spin.
    await sleep(VEIL_WAIT_MS); // > the veil's 4s arming window
    const veil = await p.evaluate(() => !!document.getElementById('joinveil')).catch(() => false);
    check('…and the joining veil NEVER shows (waited ' + (VEIL_WAIT_MS / 1000) + 's > its ' + (VEIL_ARM_MS / 1000) + 's arm)', !veil);

    await ctx.close();
  }

  // ---- (3): the copy names the browser the person is holding ---------------
  {
    const ctx = await newContext({
      permissions: ['camera', 'microphone'],
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(CASES[0].init); // WebRTC missing — a genuinely-walled gap (Ed25519 no longer walls)
    const p = await ctx.newPage();
    p.on('pageerror', () => {});
    await p.goto(BASE + '/run.html#v=uacopy-' + Math.random().toString(36).slice(2, 8));
    let txt = '';
    for (let t = 0; t < 20 && !txt; t++) {
      txt = await p.evaluate(() => { const el = document.getElementById('oldbrowser'); return el ? el.textContent : ''; }).catch(() => '');
      if (!txt) await sleep(250);
    }
    check('the copy names the browser in hand ("Safari 14")', /Safari 14/.test(txt), txt.slice(0, 160));
    check('…and the version it needs ("Safari 12.1" — the fallback-era floor)', /Safari 12\.1/.test(txt));
    await ctx.close();
  }

  // ---- (3b): an in-app webview gets the escape hatch, not "update me" ------
  {
    const ctx = await newContext({
      permissions: ['camera', 'microphone'],
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/300.0]',
    });
    await ctx.addInitScript(CASES[0].init);
    const p = await ctx.newPage();
    p.on('pageerror', () => {});
    await p.goto(BASE + '/run.html#v=uaapp-' + Math.random().toString(36).slice(2, 8));
    let txt = '';
    for (let t = 0; t < 20 && !txt; t++) {
      txt = await p.evaluate(() => { const el = document.getElementById('oldbrowser'); return el ? el.textContent : ''; }).catch(() => '');
      if (!txt) await sleep(250);
    }
    check('an in-app browser is told to open the link in Safari or Chrome', /Open in Safari|Open in Chrome/.test(txt), txt.slice(0, 160));
    await ctx.close();
  }

  // ---- (4) NON-REGRESSION: no camera API is NOT too old --------------------
  // View-only join is supported. A browser with getUserMedia missing entirely
  // must pass the preflight and take a seat, or this whole guard has cost more
  // than the bug it prevents.
  {
    const ctx = await newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','NoCam')}catch(e){}");
    await ctx.addInitScript(() => {
      try { delete navigator.mediaDevices.getUserMedia; } catch (e) {}
      try { Object.defineProperty(navigator, 'mediaDevices', { get: function () { return undefined; }, configurable: true }); } catch (e) {}
      try { delete HTMLCanvasElement.prototype.captureStream; } catch (e) {}
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [nocam] ' + e.message));
    const room = 'oldbrowser-nocam-' + Math.random().toString(36).slice(2, 8);
    await p.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');

    await sleep(1500);
    const blocked = await p.evaluate(() => !!document.getElementById('oldbrowser')).catch(() => false);
    check('a browser with NO camera API is not turned away (no preflight screen)', !blocked);

    let seated = null;
    for (let t = 0; t < 30 && !seated; t++) { await sleep(1000); seated = await p.evaluate(() => window.__gifosVideo && window.__gifosVideo.meshCoord()).catch(() => null); }
    check('…and it JOINS view-only — the knock never needed a camera', !!seated, { seated });
    await ctx.close();
  }

  // ---- (6) THE SOLO DOCTRINE: no meeting, no wall --------------------------
  // A real Safari 16 opening an app from its own Home Screen hit the too-old
  // screen (family demo, 2026-08-05) — over an app that runs perfectly without
  // a network. The contract: the wall NEVER paints for #id=<fileId>. On the
  // Safari-16 shape, Share live now sails through too (the fallback signer
  // handles the room mint) — the wall-at-the-act mechanics are proven on a
  // browser that GENUINELY cannot meet (no WebRTC) in (6c).
  {
    const SYS = systemAppIds();
    const ctx = await newContext({});
    // The Safari-16 shape for the WHOLE context — the desktop that seeds the
    // app is the same crippled browser, exactly as it was in the field.
    await ctx.addInitScript(SAFARI16);
    const d = await ctx.newPage();
    d.on('pageerror', (e) => console.log('  [solo-desk] ' + e.message));
    await d.goto(BASE + '/index.html');
    await d.waitForSelector('.icon', { timeout: 30000 }).catch(() => {});
    const appId = await d.evaluate(async (SYS) => {
      const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
      return f ? f.id : null;
    }, SYS).catch(() => null);
    check('an Ed25519-less browser still seeds a desktop and holds an app', !!appId);

    if (appId) {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.log('  [solo] ' + e.message));
      await p.goto(BASE + '/run.html#id=' + appId);
      const mounted = await p.waitForSelector('#appmount iframe', { timeout: 30000 }).then(() => true).catch(() => false);
      check('the solo app BOOTS on the Safari-16 shape', mounted);
      await sleep(2000);
      check('…and the too-old wall never paints at load', await p.evaluate(() => !document.getElementById('oldbrowser')));
      check('…and the tab keeps the APP title', !/Meetings need a newer browser/.test(await p.title()));

      // Share live on the Safari-16 shape: NO wall — the dialog opens. The
      // room this mints will be signed by the fallback engine.
      // (programmatic click — a default app's own perm-modal can overlay the
      // button, same dodge as e2e-app-room)
      await p.evaluate(() => document.getElementById('appinvite').click());
      let modal = false, walled = false;
      for (let t = 0; t < 20 && !modal && !walled; t++) {
        [modal, walled] = await p.evaluate(() => [
          // the DYNAMIC Share-live dialog only — the page ships static hidden
          // .name-modal divs (set-modal, pw-modal, …) that all carry ids.
          Array.prototype.some.call(document.querySelectorAll('.name-modal'), (m) => !m.id && /Share[\s\S]*live/.test(m.textContent)),
          !!document.getElementById('oldbrowser'),
        ]).catch(() => [false, false]);
        if (!modal && !walled) await sleep(250);
      }
      check('Share live on the Safari-16 shape opens the dialog — THE OLD WALL IS GONE', modal && !walled);
      await p.close();
    }
    await ctx.close();
  }

  // ---- (6c) the wall-at-the-act mechanics, on a browser that truly cannot --
  // meet: WebRTC deleted. Solo still boots and runs; Share live paints the
  // wall THERE, dismissible, with the WebRTC why-line; dismissing returns to
  // the working app with its title undefaced.
  {
    const SYS = systemAppIds();
    const ctx = await newContext({});
    await ctx.addInitScript(CASES[0].init); // no RTCPeerConnection at all
    const d = await ctx.newPage();
    d.on('pageerror', (e) => console.log('  [rtc-desk] ' + e.message));
    await d.goto(BASE + '/index.html');
    await d.waitForSelector('.icon', { timeout: 30000 }).catch(() => {});
    const appId = await d.evaluate(async (SYS) => {
      const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
      return f ? f.id : null;
    }, SYS).catch(() => null);
    check('a WebRTC-less browser still seeds a desktop and holds an app', !!appId);

    if (appId) {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.log('  [rtc-solo] ' + e.message));
      await p.goto(BASE + '/run.html#id=' + appId);
      const mounted = await p.waitForSelector('#appmount iframe', { timeout: 30000 }).then(() => true).catch(() => false);
      check('the solo app BOOTS on a browser that could never meet (no WebRTC)', mounted);
      await sleep(2000);
      check('…and the too-old wall never paints at load (the verdict is recorded, not shown)',
        await p.evaluate(() => !document.getElementById('oldbrowser')));

      await p.evaluate(() => document.getElementById('appinvite').click());
      let wall = null;
      for (let t = 0; t < 12 && !wall; t++) {
        wall = await p.evaluate(() => {
          const el = document.getElementById('oldbrowser');
          if (!el) return null;
          return {
            gaps: el.getAttribute('data-gaps') || '',
            why: (document.getElementById('oldbrowser-why') || {}).textContent || null,
            back: !!document.getElementById('oldbrowser-back'),
            modal: Array.prototype.some.call(document.querySelectorAll('.name-modal'), (m) => !m.id && /Share[\s\S]*live/.test(m.textContent)),
          };
        }).catch(() => null);
        if (!wall) await sleep(250);
      }
      check('Share live on THAT browser paints the wall AT THE ACT', !!wall);
      check('…naming WebRTC', !!wall && wall.gaps.indexOf('WebRTC') !== -1, wall && wall.gaps);
      check('…with the browser-to-browser why line', !!wall && !!wall.why && /browser-to-browser|straight between/i.test(wall.why));
      check('…with a way back to the app (dismiss button)', !!wall && wall.back);
      check('…and the share dialog itself never opened behind it', !!wall && !wall.modal);
      check('…and the tab title is STILL the app’s (a dismissible wall must not deface the page)',
        !/Meetings need a newer browser/.test(await p.title()));

      await p.click('#oldbrowser-back').catch(() => {});
      await sleep(300);
      check('dismissing it returns to the WORKING app (wall gone, app still mounted)',
        await p.evaluate(() => !document.getElementById('oldbrowser') && !!document.querySelector('#appmount iframe')));
      await p.close();
    }
    await ctx.close();
  }

  // ---- (6b) NEGATIVE CONTROL: a healthy browser's Share live is untouched --
  {
    const SYS = systemAppIds();
    const ctx = await newContext({});
    const d = await ctx.newPage();
    d.on('pageerror', (e) => console.log('  [ctl-desk] ' + e.message));
    await d.goto(BASE + '/index.html');
    await d.waitForSelector('.icon', { timeout: 30000 }).catch(() => {});
    const appId = await d.evaluate(async (SYS) => {
      const f = (await GifOS.store.allFiles()).find((x) => x.isApp && x.isDefault && x.appId && SYS.indexOf(x.appId) === -1);
      return f ? f.id : null;
    }, SYS).catch(() => null);

    if (appId) {
      const p = await ctx.newPage();
      p.on('pageerror', (e) => console.log('  [ctl] ' + e.message));
      await p.goto(BASE + '/run.html#id=' + appId);
      await p.waitForSelector('#appmount iframe', { timeout: 30000 }).catch(() => {});
      await p.evaluate(() => document.getElementById('appinvite').click());
      let modal = false;
      for (let t = 0; t < 20 && !modal; t++) {
        modal = await p.evaluate(() => Array.prototype.some.call(document.querySelectorAll('.name-modal'), (m) => !m.id && /Share[\s\S]*live/.test(m.textContent))).catch(() => false);
        if (!modal) await sleep(250);
      }
      check('NEGATIVE CONTROL: a healthy browser’s Share live opens the share dialog', modal);
      check('…and no wall', await p.evaluate(() => !document.getElementById('oldbrowser')));
      await p.close();
    } else {
      check('NEGATIVE CONTROL: a healthy browser seeds a desktop app', false);
    }
    await ctx.close();
  }

  // ---- (8) THE INVERSION: the Safari-16 shape SEATS ------------------------
  // The browser the old wall existed for — everything present except native
  // Ed25519 — must now pass the preflight and take a seat, signing through
  // the fallback engine. (The two-engine room, with cross-verified frames in
  // both directions, is e2e-ed-fallback.js.)
  {
    const ctx = await newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Old16')}catch(e){}");
    await ctx.addInitScript(SAFARI16);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [s16] ' + e.message));
    const room = 'oldbrowser-s16-' + Math.random().toString(36).slice(2, 8);
    await p.goto(BASE + '/run.html#v=' + room + '&DEBUG=on');

    await sleep(1500);
    check('the Safari-16 shape is NOT turned away (no preflight screen)', await p.evaluate(() => !document.getElementById('oldbrowser')));

    let seated = null;
    for (let t = 0; t < 30 && !seated; t++) { await sleep(1000); seated = await p.evaluate(() => window.__gifosVideo && window.__gifosVideo.meshCoord()).catch(() => null); }
    check('…and it SEATS, signing through the fallback engine', !!seated, { seated });
    check('…and the JS engine really carried it (vendored nacl was loaded)', await p.evaluate(() => !!(window.nacl && window.nacl.sign)));
    await ctx.close();
  }

  // ---- (5) THE MATRIX IS PUBLIC, AND IT AGREES WITH THE PREFLIGHT ----------
  // site/browser-support.json is the source of truth; run.html carries a
  // GENERATED copy of its numbers (the preflight is ES5 and cannot fetch), and
  // browser-support.html renders the same file for humans. test/unit
  // guards the drift statically. Here we assert the thing a reader actually
  // gets: the page loads the JSON and paints a row per browser with the SAME
  // numbers the too-old screen quotes — because a support matrix that
  // disagrees with the product is worse than no matrix.
  {
    const ctx = await newContext({});
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('  [matrix] ' + e.message));
    await p.goto(BASE + '/browser-support.html');
    await p.waitForFunction(() => document.querySelectorAll('#matrix [data-browser]').length > 0, null, { timeout: 15000 }).catch(() => {});
    const m = await p.evaluate(() => {
      const cards = {};
      for (const c of document.querySelectorAll('#matrix [data-browser]')) {
        const feats = {};
        for (const r of c.querySelectorAll('[data-feature]')) feats[r.getAttribute('data-feature')] = r.querySelector('.v').textContent.trim();
        cards[c.getAttribute('data-browser')] = feats;
      }
      return {
        cards,
        glance: (document.querySelector('#matrix .glance') || {}).textContent || '',
        reqs: document.getElementById('reqs').textContent,
        wide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    }).catch(() => null);
    const n = m ? Object.keys(m.cards).length : 0;
    check('the support matrix page renders a card per browser from the JSON', n >= 8, n);
    check('…each answering for meetings, broadcast AND the Home Screen',
      !!m && Object.values(m.cards).every((f) => f.meet && f.cast && f.desktop), m && m.cards.chrome);
    check('…and it quotes the SAME minimum the too-old screen quotes (Safari 12.1, the fallback-era floor)',
      !!m && m.cards.safari && m.cards.safari.meet === '12.1 and up', m && m.cards.safari);
    check('…and Chrome 71, the number the JS syntax floor sets now that Ed25519 has a fallback',
      !!m && m.cards.chrome && m.cards.chrome.meet === '71 and up', m && m.cards.chrome);
    check('…and an unmeasured browser says so rather than guessing',
      !!m && m.cards.samsung && Object.values(m.cards.samsung).every((v) => v === 'Not checked'), m && m.cards.samsung);
    check('…and a browser that can never work says THAT, not a version',
      !!m && m.cards.ie && m.cards.ie.meet === 'Not supported', m && m.cards.ie);
    check('the three numbers people came for are above the fold, in one sentence',
      !!m && /Safari 12\.1/.test(m.glance) && /Chrome 71/.test(m.glance) && /Firefox 65/.test(m.glance), m && m.glance.slice(0, 120));
    check('…and the page explains WHY the numbers are what they are (Ed25519)', !!m && /Ed25519/.test(m.reqs));
    check('…and says a camera is not needed to be in the room', !!m && /camera/i.test(m.reqs));
    check('the page never scrolls sideways (it is read on phones)', !!m && !m.wide);
    await ctx.close();
  }

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
