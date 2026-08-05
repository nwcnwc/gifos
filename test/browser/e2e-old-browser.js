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
// Ed25519 is the requirement that actually sets the version table — every
// participant mints an Ed25519 identity at join (mesh-wire.js, S4, no off
// switch), and it is the newest API in the required set by years. So it gets
// its own case, faked the only way it can be: importKey rejects for that one
// algorithm, exactly as Chrome 136 / Firefox 128 / Safari 16 do.
//
// Needs: python3 -m http.server 8099 -d site ; node test/servers/relay-local.js
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The veil arms at 4s of unseated boot; wait comfortably past it before
// declaring it absent, or this suite passes for the wrong reason.
const VEIL_ARM_MS = 4000, VEIL_WAIT_MS = 9000;

// Each case: how to cripple the browser, and the words we expect to see in the
// screen's machine-readable gap list.
const CASES = [
  {
    id: 'RTCPeerConnection',
    gap: 'WebRTC (RTCPeerConnection)',
    init: () => { try { delete window.RTCPeerConnection; } catch (e) {} try { window.RTCPeerConnection = undefined; } catch (e) {} },
  },
  {
    id: 'createDataChannel',
    gap: 'createDataChannel',
    init: () => { try { delete window.RTCPeerConnection.prototype.createDataChannel; } catch (e) {} },
  },
  {
    id: 'WebSocket',
    gap: 'WebSocket',
    init: () => { try { delete window.WebSocket; } catch (e) {} try { window.WebSocket = undefined; } catch (e) {} },
  },
  {
    id: 'crypto.subtle',
    gap: 'WebCrypto (crypto.subtle)',
    init: () => { try { Object.defineProperty(window.crypto, 'subtle', { get: function () { return undefined; }, configurable: true }); } catch (e) {} },
  },
  {
    id: 'crypto.subtle.deriveBits',
    gap: 'WebCrypto deriveBits',
    init: () => { try { Object.defineProperty(window.crypto.subtle, 'deriveBits', { value: undefined, configurable: true }); } catch (e) {} },
  },
  {
    id: 'TextEncoder',
    gap: 'TextEncoder/TextDecoder',
    init: () => { try { delete window.TextEncoder; } catch (e) {} try { window.TextEncoder = undefined; } catch (e) {} },
  },
  {
    id: 'WebCrypto Ed25519',
    gap: 'WebCrypto Ed25519',
    // The Safari-16 shape: everything else works, this one algorithm is not
    // known. Rejecting importKey is exactly what those engines do.
    init: () => {
      const real = window.crypto.subtle.importKey.bind(window.crypto.subtle);
      Object.defineProperty(window.crypto.subtle, 'importKey', {
        configurable: true,
        value: function (fmt, key, alg, ext, uses) {
          const n = (alg && alg.name) || alg;
          if (String(n) === 'Ed25519') return Promise.reject(new Error('Unrecognized name.'));
          return real(fmt, key, alg, ext, uses);
        },
      });
    },
  },
];

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
        return { gaps: el.getAttribute('data-gaps') || '', head: (document.getElementById('oldbrowser-head') || {}).textContent || '', text: el.textContent || '' };
      }).catch(() => null);
      if (!seen) await sleep(250);
    }
    check('no ' + c.id + ' → the explanation appears', !!seen);
    check('…and it names the missing piece (' + c.gap + ')', !!seen && seen.gaps.indexOf(c.gap) !== -1, seen && seen.gaps);
    check('…and it says, in words, that meetings need a newer browser',
      !!seen && /too old|newer|Open this in your browser/i.test(seen.text));

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
    await ctx.addInitScript(CASES[CASES.length - 1].init); // Ed25519 missing — the real Safari-14 gap
    const p = await ctx.newPage();
    p.on('pageerror', () => {});
    await p.goto(BASE + '/run.html#v=uacopy-' + Math.random().toString(36).slice(2, 8));
    let txt = '';
    for (let t = 0; t < 20 && !txt; t++) {
      txt = await p.evaluate(() => { const el = document.getElementById('oldbrowser'); return el ? el.textContent : ''; }).catch(() => '');
      if (!txt) await sleep(250);
    }
    check('the copy names the browser in hand ("Safari 14")', /Safari 14/.test(txt), txt.slice(0, 160));
    check('…and the version it needs ("Safari 17")', /Safari 17/.test(txt));
    await ctx.close();
  }

  // ---- (3b): an in-app webview gets the escape hatch, not "update me" ------
  {
    const ctx = await newContext({
      permissions: ['camera', 'microphone'],
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/300.0]',
    });
    await ctx.addInitScript(CASES[CASES.length - 1].init);
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
    check('…and it quotes the SAME minimum the too-old screen quotes (Safari 17)',
      !!m && m.cards.safari && m.cards.safari.meet === '17 and up', m && m.cards.safari);
    check('…and Chrome 137, the number Ed25519 actually sets',
      !!m && m.cards.chrome && m.cards.chrome.meet === '137 and up', m && m.cards.chrome);
    check('…and an unmeasured browser says so rather than guessing',
      !!m && m.cards.samsung && Object.values(m.cards.samsung).every((v) => v === 'Not checked'), m && m.cards.samsung);
    check('…and a browser that can never work says THAT, not a version',
      !!m && m.cards.ie && m.cards.ie.meet === 'Never', m && m.cards.ie);
    check('the three numbers people came for are above the fold, in one sentence',
      !!m && /Safari 17/.test(m.glance) && /Chrome 137/.test(m.glance) && /Firefox 129/.test(m.glance), m && m.glance.slice(0, 120));
    check('…and the page explains WHY the numbers are what they are (Ed25519)', !!m && /Ed25519/.test(m.reqs));
    check('…and says a camera is not needed to be in the room', !!m && /camera/i.test(m.reqs));
    check('the page never scrolls sideways (it is read on phones)', !!m && !m.wide);
    await ctx.close();
  }

  await browser.close();
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
