// phone-meet-ctl.js — DRIVE AND READ a real phone sitting in a real meeting.
//
// Everything here goes through window.__gifosVideo, the meeting's own debug
// surface. See docs/phone-instrument-interface.md for the full contract and
// for the accessor traps that cost a session (debugDump() has NO camOff;
// meshSelfReport's fields are NOT on debugDump; a phone reports camOff=false
// only once a live track exists).
//
//   CDP_PORT=9222 node test/tools/phone-meet-ctl.js state   <room>
//   CDP_PORT=9222 node test/tools/phone-meet-ctl.js cam     <room> on|off
//   CDP_PORT=9222 node test/tools/phone-meet-ctl.js blur    <room> max|min|none
//   CDP_PORT=9222 node test/tools/phone-meet-ctl.js mic     <room> on|off
//
// EVERY MUTATION VERIFIES. A click that did not change the state is reported
// as {ok:false}, never assumed — the camera button silently bails to
// lateMedia() when there is no localStream (an ungranted permission prompt),
// which is exactly how "camera on" got believed while the camera was off.
let pw = null;
for (const m of ['/opt/node22/lib/node_modules/playwright', 'playwright', 'playwright-core']) {
  try { pw = require(m); if (pw) break; } catch (e) {}
}
if (!pw) { console.error('no playwright'); process.exit(1); }
const [cmd, room, arg] = process.argv.slice(2);
const PORT = process.env.CDP_PORT || 9222;
if (!cmd || !room) { console.error('usage: phone-meet-ctl.js state|cam|blur|mic <room> [arg]'); process.exit(2); }

// The one true state read. Only verified accessors — nothing invented.
const READ = () => {
  const V = window.__gifosVideo;
  const d = V.debugDump() || {};
  return {
    url: location.href.slice(0, 70),
    coord: V.meshCoord(),
    participants: V.participants(),
    inMeeting: d.inMeeting,
    camOff: V.camOff(),                 // MY camera (true = off)
    camTrackLive: V.camTrackLive(),     // a live track actually exists
    micMuted: V.micMuted(),
    blur: V.myBlur(),
    rung: V.powTier ? V.powTier() : null,
    quality: V.quality(),
    battTier: V.battTier(),
    visParkAsked: V.visParkAsked().map((x) => String(x).slice(0, 8)), // who I told to park
    visParked: V.visParked().map((x) => String(x).slice(0, 8)),       // who told ME to park
    mainSenders: V.mainSenders(),       // per peer: v/a live|parked, tile shown|hidden
    mosaicClaims: (() => { try { return (V.mosaic() || {}).claims || []; } catch (e) { return null; } })(),
    stadiumShown: (() => { try { return V.stadiumShown(); } catch (e) { return null; } })(),
  };
};

(async () => {
  const browser = await pw.chromium.connectOverCDP('http://127.0.0.1:' + PORT);
  let page = null;
  for (const c of browser.contexts()) for (const p of c.pages()) {
    const u = p.url();
    if (u.indexOf('v=' + room) >= 0 || u.indexOf('/meet/' + room) >= 0) page = p;
  }
  if (!page) { console.log(JSON.stringify({ err: 'no tab for room ' + room + ' on port ' + PORT })); process.exit(1); }
  // Android throttles background tabs hard enough that the app never boots.
  await page.bringToFront().catch(() => {});
  try {
    await page.waitForFunction(() => window.__gifosVideo && typeof window.__gifosVideo.camOff === 'function', { timeout: 45000 });
  } catch (e) { console.log(JSON.stringify({ err: 'app never booted (permission prompt? background tab?)' })); process.exit(1); }

  if (cmd === 'state') {
    console.log(JSON.stringify(await page.evaluate(READ), null, 1));
  } else if (cmd === 'cam') {
    const want = arg === 'on';
    const r = await page.evaluate(async (w) => {
      const V = window.__gifosVideo;
      if (V.camOff() === !w) return { already: true };
      document.getElementById('cam').click();
      return { clicked: true };
    }, want);
    await page.waitForTimeout(6000);
    const st = await page.evaluate(READ);
    // Verify against the TRACK, not just the flag: camOff can flip while the
    // track is still absent, and a phone with no track sends nothing.
    const ok = st.camOff === !want && (!want || st.camTrackLive);
    console.log(JSON.stringify({ ok, want: arg, action: r, camOff: st.camOff, camTrackLive: st.camTrackLive, state: st }, null, 1));
    if (!ok) process.exit(1);
  } else if (cmd === 'blur') {
    const lvl = arg === 'max' ? 2 : arg === 'min' ? 1 : 0;
    await page.evaluate((v) => window.__gifosVideo.setBlur(v), lvl);
    await page.waitForTimeout(3000);
    const st = await page.evaluate(READ);
    const ok = st.blur === lvl;
    console.log(JSON.stringify({ ok, want: lvl, got: st.blur, state: st }, null, 1));
    if (!ok) process.exit(1);
  } else if (cmd === 'mic') {
    const want = arg === 'on';
    await page.evaluate((w) => { if (window.__gifosVideo.micMuted() === w) document.getElementById('mic').click(); }, want);
    await page.waitForTimeout(3000);
    const st = await page.evaluate(READ);
    const ok = st.micMuted === !want;
    console.log(JSON.stringify({ ok, want: arg, micMuted: st.micMuted }, null, 1));
    if (!ok) process.exit(1);
  } else { console.error('unknown cmd ' + cmd); process.exit(2); }
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });
