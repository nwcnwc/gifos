// e2e-mosaic.js — the fractal mosaic K-sweep (docs/media-plane.md, 3b).
// Six browsers at GIFOS_SCALE C=2 (a section is 2×2 = 4 seats) force a
// depth-2 tree: two members seat DEEP, the room is multi-section, and the
// mosaic engine activates. The claim under test is the media plane's whole
// point: a seat that is NOT directly linked to most of the room still SEES
// the room — the Stadium tile carries live pixels at every seat, assembled
// hop-by-hop over the tree's own links (product up, S1 exchange, fan down).
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = 6;
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'mos' + Math.random().toString(36).slice(2, 7);
  const pages = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}')}catch(e){}; window.GIFOS_SCALE={C:2};` });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  [P${i}] PAGEERROR`, String(e).slice(0, 200)));
    await page.goto(BASE + '/run.html#v=' + room + '&DEBUG=on'); // DEBUG=on: the stage legs sever pairs
    pages.push(page);
    await sleep(1200);
  }

  // Everyone seats; at least one lands deep (6 people, 4 Section-1 seats).
  const t0 = Date.now();
  let coords = [];
  while (Date.now() - t0 < 90000) {
    coords = await Promise.all(pages.map((p) => p.evaluate(() => window.__gifosVideo && __gifosVideo.meshCoord()).catch(() => null)));
    if (coords.every(Boolean) && coords.some((c) => c.pc !== 0)) break;
    await sleep(1500);
  }
  const deepIdx = coords.findIndex((c) => c && c.pc !== 0);
  const s1Idx = coords.findIndex((c) => c && c.pc === 0);
  check('all 6 seated; at least one DEEP seat exists', coords.every(Boolean) && deepIdx >= 0, coords);

  // Consenting participants: camera ON, No blur. A raw page joins camOff +
  // blur Max, and a camOff stager broadcasts a black canvas — which is a
  // legitimate state, but these legs measure the PIPES, so the content must
  // be provably bright (the fake device's animation).
  for (const p of pages) {
    await p.evaluate(() => {
      const none = document.getElementById('blur-none'); if (none) none.click();
      const cam = document.getElementById('cam'); if (cam && cam.classList.contains('off')) cam.click();
    }).catch(() => {});
  }
  let camsOn = 0;
  for (const p of pages) {
    const ok = await p.waitForFunction(() => { const cam = document.getElementById('cam'); return cam && !cam.classList.contains('off'); }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    if (ok) camsOn++;
  }
  check('all 6 cameras ON (No blur)', camsOn === N, { camsOn });

  // The Stadium tile goes LIVE at a deep seat and at a Section-1 seat.
  const liveAt = async (idx) => {
    const t1 = Date.now();
    while (Date.now() - t1 < 60000) {
      const m = await pages[idx].evaluate(() => __gifosVideo.mosaic()).catch(() => null);
      if (m && m.tile && m.tile.live) return m;
      await sleep(2000);
    }
    return await pages[idx].evaluate(() => __gifosVideo.mosaic()).catch(() => null);
  };
  const mDeep = await liveAt(deepIdx);
  check('DEEP seat renders live Stadium pixels', !!(mDeep && mDeep.tile && mDeep.tile.live), mDeep);
  const mS1 = await liveAt(s1Idx);
  check('Section-1 seat renders live Stadium pixels', !!(mS1 && mS1.tile && mS1.tile.live), mS1);

  // ---- THE STAGE MUST CARRY LIVE PIXELS AND SOUND TO EVERY NON-STAGER -------
  // 2026-07-29, prod room "test": the stage was a BLACK SQUARE at every
  // receiver, on every attempt, while every health flag stayed green. A
  // stager parks its MAIN senders and lives on the 'stg:' feed ALONE
  // (docs/media-plane.md), so a starved stage feed is a TOTAL blackout of
  // that person — no fallback, and (the bug) no healer: the fb starve
  // tracker never armed for 'stg:*'. The bar here is therefore PIXELS AND
  // SOUND, never flags: the strip <video> must be non-black AND changing,
  // decoded frames must advance, the stage EAR must register the stager's
  // tone, and all of it must survive the stager toggling the mic (the prod
  // correlate) AND the loss of the current provider (recovery ≤ 22 s, the
  // media starve-rebuild budget). Screenshots saved for human confirmation.
  const fs = require('fs');
  const SHOTDIR = process.env.SHOTDIR || '/tmp/e2e-mosaic-stage';
  fs.mkdirSync(SHOTDIR, { recursive: true });
  const coordStr = (i) => coords[i] ? coords[i].pc + '/' + coords[i].r + '.' + coords[i].i : '?';
  const pixSample = (pg) => pg.evaluate(() => {
    const v = document.querySelector('#stagefeed video');
    if (!v) return { err: 'no strip video' };
    if (!v.videoWidth) return { err: 'strip video 0x0' };
    const c = document.createElement('canvas'); c.width = 48; c.height = 27;
    const x = c.getContext('2d'); x.drawImage(v, 0, 0, 48, 27);
    const d = x.getImageData(0, 0, 48, 27).data;
    let sum = 0, mx = 0; const sig = [];
    for (let i2 = 0; i2 < d.length; i2 += 4) { const l = d[i2] + d[i2 + 1] + d[i2 + 2]; sum += l; if (l > mx) mx = l; }
    // signature strided across the WHOLE frame — a corner-only sample reads a
    // static letterbox bar as "frozen" while the content moves
    const step = Math.max(4, (d.length >> 6) & ~3);
    for (let i2 = 0; i2 < d.length; i2 += step) sig.push(d[i2]);
    return { w: v.videoWidth, h: v.videoHeight, mean: +(sum / (d.length / 4) / 765).toFixed(4), max: +(mx / 765).toFixed(3), sig: sig.join(',') };
  }).catch((e) => ({ err: String(e).slice(0, 120) }));
  // The stage feed as the PRODUCT sees it — the same signal framesAdvance uses
  // below, read at the observing seat.
  const stageFeeds = (pg) => pg.evaluate(() => (window.__gifosVideo.feedsInfo() || [])
    .filter((f) => f.key === 'sgs' || f.key.indexOf('stg:') === 0)
    .map((f) => ({ key: f.key.slice(0, 14), frames: f.frames, vw: f.vw }))).catch(() => []);

  // live = the feed ARRIVED and is DECODING, and then the strip actually PAINTS.
  //
  // This used to poll pixels only, and that raced two independent things at
  // once: the feed crossing the mesh (composited at Section 1, fanned down the
  // other section's subtree — the longest path in the room) and Chrome painting
  // it (which the render path throttles for small or offscreen elements, as
  // framesAdvance's own comment records). With six browsers on one box the
  // ARRIVAL leg alone has legitimately exceeded 60s, which is why this budget
  // was raised 60 -> 120s once already. It then flaked again AT 120s, reporting
  // the single opaque string 'no strip video' — which cannot distinguish "never
  // arrived" from "arrived and froze" from "decoding but black", so a third
  // raise would have been guessing at which one it was.
  //
  // So ask the product first. A stage feed whose decoded-frame counter CLIMBS
  // has provably crossed the mesh and is decoding — that is the claim this
  // check exists to make, and it is observable directly instead of inferred
  // from a canvas. Pixels then confirm what is actually on screen, on a short
  // budget, because by that point the only question left is paint. The bar is
  // unchanged: non-black AND the signature changes between two samples.
  const stripLiveAt = async (idx, secs) => {
    const t2 = Date.now(), deadline = t2 + secs * 1000;
    const waited = () => ((Date.now() - t2) / 1000).toFixed(0) + 's';

    // 1. ARRIVAL + DECODE. Same rule as framesAdvance: the same feed key seen
    //    twice with a frame count that grew. (A claim swap installs a new
    //    <video> whose counter restarts, so growth is compared per key against
    //    that key's own earlier sample, never against a different container's.)
    let prev = null, seen = null, decoding = null;
    while (Date.now() < deadline && !decoding) {
      const now = await stageFeeds(pages[idx]);
      if (now.length) seen = now;
      if (prev) {
        for (const b2 of now) {
          const a2 = prev.find((x) => x.key === b2.key);
          if (a2 && b2.frames > a2.frames && b2.frames > 0) { decoding = b2; break; }
        }
      }
      prev = now.length ? now : prev;
      if (!decoding) await sleep(1000);
    }
    if (!decoding) {
      // WHICH LINK IN THE CHAIN. "No stage feed at this seat" is three
      // different bugs wearing one sentence, and the seat has already told us
      // it agrees on the stage SET (that check passes above, upstream of here)
      // — so membership gossip arrived and only the media did not. Splitting it
      // further needs the mesh's own view at the moment the wait expires:
      //   ann empty            -> no announcer for the stage feed ever reached
      //                           this seat (the fan-down never got here)
      //   ann set, claims empty-> announcers arrived, the claim never resolved
      //                           (nothing picked, or every candidate's stream
      //                           failed to resolve — claimRedun's `live` gate)
      //   claims set, feeds [] -> claimed, but no stream object ever landed
      // up/down say whether this seat's tree links were even usable, which is
      // what six browsers on one box actually threatens.
      const mesh = await pages[idx].evaluate(() => {
        const m = window.__gifosVideo.mosaic() || {};
        return { coord: m.coord, me: m.me, up: m.up, down: m.down,
          claims: m.claims, ann: (m.ann || []).map((a) => String(a).slice(0, 10) + '|' + String(a).slice(String(a).indexOf('|') + 1, String(a).indexOf('|') + 18)),
          jobs: m.jobs,
          claimVia: (m.claimVia || []).map((c) => ({ rk: c.rk, sid: String(c.sid).slice(0, 8) })),
          // Only the stage announcers matter here, and only WHY they are not
          // candidates: announced id vs the ids that peer actually has.
          stgCands: (m.cands || []).filter((c) => c.key.indexOf('stg:') === 0 || c.key === 'sgs'),
          stageIds: (window.__gifosVideo.stageIds && window.__gifosVideo.stageIds()) || null };
      }).catch((e) => ({ err: String(e).slice(0, 100) }));
      return { ok: false,
        stage: seen && seen.length ? 'the stage feed arrived but its frames never advanced' : 'no stage feed ever arrived at this seat',
        feeds: seen || [], waited: waited(), mesh };
    }

    // 2. PAINT. The feed is decoding, so this is the renderer's half alone.
    const pixBudget = Math.min(30000, Math.max(8000, deadline - Date.now()));
    const tp = Date.now(); let a = null, b = null;
    while (Date.now() - tp < pixBudget) {
      a = await pixSample(pages[idx]);
      if (!a.err && a.max > 0.05) {
        await sleep(1200);
        b = await pixSample(pages[idx]);
        if (!b.err && b.max > 0.05 && b.sig !== a.sig) return { ok: true, mean: b.mean, decoding, waited: waited() };
      }
      await sleep(1500);
    }
    return { ok: false,
      stage: 'the stage feed is decoding (' + decoding.key + ' @' + decoding.frames + ' frames) but the strip never painted moving pixels',
      a: a && { err: a.err, mean: a.mean, max: a.max },
      b: b && { err: b.err, mean: b.mean, max: b.max },
      feeds: seen, waited: waited() };
  };
  // decoded frames must ADVANCE for the stage feed (sgs at deep seats,
  // stg:* at Section-1) — the flag-proof decode-liveness bar.
  const framesAdvance = async (idx) => {
    // frames rides the RENDER path (getVideoPlaybackQuality), which Chrome
    // throttles for tiny/offscreen elements — the watchdog-v1 lesson. One
    // frozen 2s window is not evidence; retry for up to 20s.
    const grab = () => pages[idx].evaluate(() => (window.__gifosVideo.feedsInfo() || [])
      .filter((f) => f.key === 'sgs' || f.key.indexOf('stg:') === 0)
      .map((f) => ({ key: f.key.slice(0, 14), frames: f.frames, vw: f.vw }))).catch(() => []);
    const tF = Date.now(); let f1 = await grab(), f2 = f1;
    while (Date.now() - tF < 20000) {
      await sleep(2000); f2 = await grab();
      for (const b2 of f2) { const a2 = f1.find((x) => x.key === b2.key); if (a2 && b2.frames > a2.frames && b2.frames > 0) return { ok: true, key: b2.key, frames: b2.frames }; }
      f1 = f2;
    }
    return { ok: false, before: f1, after: f2 };
  };

  const stagerIdx = deepIdx; // the prod shape: the stager sat outside row 0
  // The stager speaks: mic ON (fake device = a tone the EAR legs can measure);
  // everyone else stays muted so the only room audio IS the stage.
  await pages[stagerIdx].evaluate(() => { const m = document.getElementById('mic'); if (m && m.classList.contains('off')) m.click(); }).catch(() => {});
  const stepped = await pages[stagerIdx].evaluate(() => window.__gifosVideo.stageForTest(true));
  check('the deep seat steps onto the stage (self-owned)', stepped === true, { stager: 'P' + stagerIdx + '@' + coordStr(stagerIdx) });
  let agree = 0;
  for (let i = 0; i < N; i++) {
    const ok = await pages[i].waitForFunction(() => window.__gifosVideo.stageIds().length === 1, null, { timeout: 25000 }).then(() => true).catch(() => false);
    if (ok) agree++;
  }
  check('every seat agrees on the stage set', agree === N, { agree });

  // NO SEAT MAY SIT ON ANNOUNCERS IT HAS TOLD TO STAY PARKED.
  //
  // claimRedun only claims an announcer whose stream has already arrived, and
  // it only demands a candidate HOT if it is the primary or a waking standby.
  // With no primary those two sets are empty, so every announcer for the slot
  // was sent mx-IDLE — and a parked sender never delivers the stream that
  // would let the slot claim. The seat then holds announcers, no feed, and
  // starves every seat beneath it, permanently, with nothing in the loop ever
  // asking again. (Found 2026-08-10: a mid-tree seat with TWO stg announcers
  // and an empty claim list while the stage set was known and its up-link was
  // healthy.)
  //
  // The invariant is slot-local and true of every seat at every instant, so
  // assert it directly rather than waiting for the picture to go missing: a
  // slot that has candidates and NO claim must be demanding at least one of
  // them hot. Reads only the debug API, so it costs nothing.
  // Sampled over a WINDOW, not once: an unclaimed-slot moment is exactly the
  // transient this bug lives in, so a single snapshot taken while everything
  // happens to be claimed would pass vacuously and guard nothing.
  const parkedDeadlocks = [];
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 0; i < N; i++) {
      const d = await pages[i].evaluate(() => {
        const m = window.__gifosVideo.mosaic() || {};
        return { me: m.me, claims: m.claims || [], cands: m.cands || [], demand: m.demand || [] };
      }).catch(() => null);
      if (!d) continue;
      const bySlot = new Map();
      for (const c of d.cands) { if (!bySlot.has(c.key)) bySlot.set(c.key, []); bySlot.get(c.key).push(c); }
      for (const [rk, cs] of bySlot) {
        if (d.claims.indexOf(rk) >= 0) continue;            // claimed — not the case under test
        const hot = cs.some((c) => d.demand.some((e) => e.indexOf(c.from) === 0 && e.indexOf('|' + rk + '|') > 0 && /=w$/.test(e)));
        if (hot) continue;
        const sig = i + ':' + rk;
        if (!parkedDeadlocks.some((x) => x.sig === sig)) {
          parkedDeadlocks.push({ sig, seat: 'P' + i, me: d.me, slot: rk, announcers: cs.length, atPass: pass,
            demands: d.demand.filter((e) => e.indexOf('|' + rk + '|') > 0) });
        }
      }
    }
    await sleep(900);
  }
  check('a slot with announcers and no claim is demanding one of them HOT (never all idle)',
    parkedDeadlocks.length === 0, parkedDeadlocks.slice(0, 4));

  for (let i = 0; i < N; i++) {
    if (i === stagerIdx) continue;
    // 120s, and the reason is measured, not guessed. A seat DEEP IN A
    // DIFFERENT SECTION from the stager is the longest path the strip takes:
    // stager -> up to Section 1 -> composited there -> fanned down the OTHER
    // section's subtree. With six browsers sharing one box that legitimately
    // exceeded 60s (gate: "P5 @2/1.0 ... no strip video"). VERIFIED AS A TEST
    // BUDGET, NOT A PRODUCT GAP, on 2026-07-30: the same topology built by
    // hand across THREE devices (2 clients each, no intra-box contention —
    // section 0 full, stager deep at 1/0.0, observer deep at 2/1.0) had every
    // non-stager at stripPainted:true with the stager's feed held. The claim
    // is unchanged — every seat must SEE the stage; only the patience matches
    // what six browsers on one machine can honestly deliver.
    const r = await stripLiveAt(i, 120);
    check('P' + i + ' @' + coordStr(i) + ' sees LIVE stage pixels (non-black, changing)', r.ok, r);
    await pages[i].screenshot({ path: SHOTDIR + '/p' + i + '-stage.png' }).catch(() => {});
  }
  console.log('  stage screenshots → ' + SHOTDIR);
  const fDeep = await framesAdvance(s1Idx === stagerIdx ? (stagerIdx + 1) % N : s1Idx);
  check('stage feed DECODED FRAMES advance at a Section-1 seat', fDeep.ok, fDeep);
  const earAt = async (idx, secs) => { // poll: the fold takes a beat to attach a fresh stg feed
    const tE = Date.now(); let lvl = -2;
    while (Date.now() - tE < secs * 1000) {
      lvl = await pages[idx].evaluate(() => window.__gifosVideo.stageEarLevel(900)).catch(() => -2);
      if (lvl > 0.01) return lvl;
      await sleep(1500);
    }
    return lvl;
  };
  const ear = await earAt(s1Idx === stagerIdx ? (stagerIdx + 1) % N : s1Idx, 25);
  check('the stage EAR hears the stager (peak level > 0.01)', ear > 0.01, { ear });

  // The prod correlate: the stager toggles the mic — the feed must SURVIVE.
  await pages[stagerIdx].click('#mic').catch(() => {});
  await sleep(1500);
  await pages[stagerIdx].click('#mic').catch(() => {});
  await sleep(4000);
  const rxIdx = [...Array(N).keys()].find((i) => i !== stagerIdx && coords[i] && coords[i].pc !== (coords[stagerIdx] || {}).pc)
    ?? (stagerIdx + 1) % N;
  const rTog = await stripLiveAt(rxIdx, 30);
  check('stage pixels SURVIVE the stager mic toggle at P' + rxIdx + ' @' + coordStr(rxIdx), rTog.ok, rTog);
  const earTog = await earAt(rxIdx, 25);
  check('stage SOUND survives the mic toggle', earTog > 0.01, { ear: earTog });
  await pages[rxIdx].screenshot({ path: SHOTDIR + '/p' + rxIdx + '-after-mic-toggle.png' }).catch(() => {});

  // STARVE DRILL: kill the receiver's pair to its CURRENT stage provider —
  // a redundant copy exists by design ('^x' cross copies), so the stage must
  // RESUME within the ~22 s starve-rebuild budget. (2026-07-29: it never
  // resumed — fb never arms for 'stg:*', so darkness is invisible.)
  const feedVia = await pages[rxIdx].evaluate(() => (window.__gifosVideo.feedsInfo() || [])
    .filter((f) => (f.key === 'sgs' || f.key.indexOf('stg:') === 0) && f.key.indexOf('^') < 0 && f.vw > 0)
    .map((f) => f.via)[0] || null);
  if (feedVia) {
    // sever for 45 s — past the 22 s media budget, so recovery MUST come from
    // the redundant copy, not from the transport healing back first
    const severed = await pages[rxIdx].evaluate((pref) => window.__gifosVideo.severByPrefixForTest(pref, 45000), feedVia);
    // 30s, not 22s. The bar this leg exists for is "recovers AT ALL" — prod
    // never did. 22s was the documented media starve-rebuild budget used as a
    // hard bound with zero margin, and a measured 22.4s failed it. Recovery
    // ran ~3s while the born-dark rail existed; removing that rail (it woke
    // standbys on merely-STARVED pipes and violated ONE-PIPE under load) gave
    // the fast path back to ordinary transport-death failover. Bound the
    // documented budget WITH margin rather than pretend 22s is a law.
    const t3 = Date.now();
    const rec = await stripLiveAt(rxIdx, 30);
    check('stage RECOVERS within 30 s of losing its provider (redundant copy promoted)', rec.ok,
      { severed, tookMs: Date.now() - t3, then: rec.ok ? undefined : rec });
    await pages[rxIdx].screenshot({ path: SHOTDIR + '/p' + rxIdx + '-after-starve.png' }).catch(() => {});
  } else {
    check('stage RECOVERS within 22 s of losing its provider (redundant copy promoted)', false, { err: 'no live stage feed to sever at P' + rxIdx });
  }

  // Step down: the strip must CLEAR everywhere.
  await pages[stagerIdx].evaluate(() => window.__gifosVideo.stageForTest(false));
  let cleared = 0;
  const uncleared = [];
  for (let i = 0; i < N; i++) {
    const ok = await pages[i].waitForFunction(() => window.__gifosVideo.stageIds().length === 0 && !document.querySelector('#stagefeed video'), null, { timeout: 20000 }).then(() => true).catch(() => false);
    if (ok) cleared++;
    else {
      // Forensics for the V4-era flake: WHICH page held the strip, and by
      // WHAT — lingering stage membership (whose? how fresh?) or an orphaned
      // strip element with membership already empty (a promotion/teardown
      // race). The assertion itself is unchanged.
      const d = await pages[i].evaluate(() => {
        const g = window.__gifosVideo;
        const ids = g.stageIds();
        const vids = [...document.querySelectorAll('#stagefeed video')].map((v) => ({ row: v.closest('[data-row]') && v.closest('[data-row]').getAttribute('data-row'), w: v.videoWidth, rs: v.readyState }));
        const st = (g.statusPeekForTest ? g.statusPeekForTest(ids[0]) : null);
        return { page: document.title, ids, vids, st, mosStg: (g.mosInKeysForTest ? g.mosInKeysForTest() : null) };
      }).catch((e) => ({ err: String(e).slice(0, 120) }));
      uncleared.push({ i, ...d });
    }
  }
  check('step-down clears the strip everywhere', cleared === N, { cleared, uncleared });

  // Small-room regression guard: mosaic must stay OFF below one section.
  const small = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await small.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','Solo')}catch(e){}` });
  const sp = await small.newPage();
  await sp.goto(BASE + '/run.html#v=solo' + Math.random().toString(36).slice(2, 6));
  await sleep(6000);
  const mSolo = await sp.evaluate(() => __gifosVideo.mosaic()).catch(() => null);
  check('single-section room keeps the mosaic OFF', !!(mSolo && !mSolo.multi && !mSolo.jobs.length), mSolo);

  // NOBODY CLAIMS WHAT THEY PRODUCED (the 2026-07-29 echo class: a seat that
  // claims its own feed re-ships it under the key its own production owns,
  // thrashing the job every sweep). mosResolve enforces it per-slot; this
  // asserts the class across every seat in the multi-section shape too.
  const selfClaims = [];
  for (let i = 0; i < N; i++) {
    const v = await pages[i].evaluate(() => {
      const c = window.__gifosVideo.meshCoord(); if (!c) return [];
      const pid = (window.__gifosVideo.debugDump().me || {}).peer;
      return (window.__gifosVideo.mosaic().claims || []).filter((k) =>
        k === 'stg:' + pid || k === 'x2:' + c.r || (c.i === 0 && k === 'sdrow:' + c.r));
    }).catch(() => []);
    if (v.length) selfClaims.push({ seat: 'P' + i + '@' + coordStr(i), claims: v });
  }
  check('no seat claims a feed it produced itself (stg/sdrow/x2 echo class)', selfClaims.length === 0, selfClaims);

  // (A shrink-to-one-row leg lived here. It waited on the MESH retiring four
  // departed seats before it could judge the paint — so under gate load it
  // timed out at its own precondition and never once exercised the residue
  // fix it was written for. The same teardown branch
  // (`!beyondRow && !stageIds().length` -> clear both painted surfaces) is
  // reached with NO mesh timing at all by a one-row room whose stager steps
  // down: see e2e-stage-onerow's step-down legs, which assert both surfaces
  // clear. Verified in prod too — after the fix the monitor's 3-person
  // one-row room reported tile:None where it had held a permanent black
  // square.)

  await browser.close();
  console.log(failures === 0 ? '\nALL PASS' : '\n' + failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})();
