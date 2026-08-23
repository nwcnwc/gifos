/*
 * FPS Simple — the whole port, from the real GIF.
 *
 * Two halves, and they need two different amounts of hardware, so they ask for
 * it separately.
 *
 *   SOLO      one box, and one box is enough. The built GIF installs, boots
 *             inside the sandbox, and LOCKS THE POINTER — the end-to-end proof
 *             of capabilities.pointer, through a real manifest in a real app
 *             rather than the synthetic one in e2e-pointer-lock.js. Plus: it
 *             reaches the network zero times, which is the claim the manifest
 *             makes by declaring no hosts. Every one of those is a question
 *             about STATE. A slow box gives the same answer as a fast one.
 *
 *   DEATHMATCH  NEEDS A MACHINE PER PLAYER, and refuses to run without one.
 *             Two peers in one room over the relay: they must see each other in
 *             the roster, SPAWN A BODY for each other (remote.js — a body is
 *             what makes another player shootable), and a hit claimed by one
 *             must land on the other, take its health down, KILL it, and be
 *             scored to the right player. Upstream Claude of Duty has no
 *             networking of any kind, so all of that is code written for this
 *             app with nothing else watching it.
 *
 * WHY THE DEATHMATCH HALF DECLARES NEEDS-FLEET. This app IS its animation loop:
 * presence is published from the engine's own update, a remote body is driven
 * from the wire per rendered frame, and a death is a state machine that has to
 * tick. Two Chromiums building a 3D world through a software rasteriser on one
 * kernel render at around a frame a second, and every timing this file depends
 * on becomes a timing about that box. The one-box version of this suite had
 * already grown the tell: it pinned GIFOS_FPS_QUALITY='low' so the world would
 * finish building, gave itself a SEVEN MINUTE boot deadline, and brought each
 * tab to the front before every single assertion because the backgrounded one
 * stopped talking. Those are not test settings, they are apologies for the
 * machine — exactly the shape test/lib/fleet.js was written to stop us from
 * shipping as a verdict. On real boxes none of them are needed and none of them
 * are here.
 *
 * WHY A HIT IS CLAIMED DIRECTLY. The suite calls Net.claimHit() rather than
 * aiming and firing. Aiming a bullet at a moving body is a test of the
 * ballistics — which is upstream's, exercised by its own selftests, and not what
 * can regress here. What can regress is the wire: that a claim rides out on the
 * shooter's row, is deduped, is addressed to the right life, is paid by the
 * target, and that the KILL it causes is credited to the player who fired it.
 * So that is what is asserted. (Whether a human can lead a shot at 6 Hz is a
 * question for a human; it is in apps/fps-simple/README.md under its limits.)
 *
 * Needs: the stack on the orchestrator, reachable by the fleet's browsers —
 * a static server on 8099 bound to 0.0.0.0 and test/servers/relay-local.js.
 */
const { chromium, CHROME } = require('../lib/pw');
const needFleet = require('../lib/fleet');
const { openFleet, closeFleet } = require('../lib/fleet-browsers');
const { appGif } = require('../lib/apps');
const need = require('../lib/need');
const { readFileSync } = require('fs');

// The deathmatch browsers are on OTHER MACHINES, so the stack address cannot be
// loopback: they dial the orchestrator at the base/relay in the hosts file.
const FLEETCFG = needFleet.load() || {};
const BASE = process.env.BASE || FLEETCFG.base || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || FLEETCFG.relay || 'ws://127.0.0.1:8790';
const GIF_B64 = readFileSync(appGif('fps-simple')).toString('base64');

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// QUALITY IS ASKED FOR DIFFERENTLY BY THE TWO HALVES, and that difference is
// the whole point of splitting them.
//
// SOLO runs wherever the battery runs — the gate box, four cores and no GPU —
// and pins 'low', because it is asking whether the app BOOTS and locks the
// pointer and those answers do not depend on how pretty the street is. It is
// the same code path; 'medium' on a software rasteriser spends minutes building
// scenery nothing then looks at.
//
// DEATHMATCH pins 'low' as well, and it is worth being exact about why that is
// not a cop-out. The fleet is asked for ISOLATION — a CPU per player, so that
// "did the presence arrive" is not really "was the kernel scheduling two 3D
// browsers". It is not asked for FIDELITY: nothing in this half looks at the
// street, and a peer may be a Raspberry Pi rendering through swiftshader, which
// at 'medium' never finishes building a world at all. What the frame rate
// actually is on real hardware is a different question with a different tool,
// and answering it by making this suite slow enough to time out answers neither.
// Override to measure something else.
const setup = (name, quality) => "try{localStorage.setItem('gifos_relay','" + RELAY + "');" +
  "localStorage.setItem('gifos_name','" + name + "')}catch(e){};" +
  ((process.env.GIFOS_FPS_QUALITY || quality)
    ? "window.GIFOS_FPS_QUALITY='" + (process.env.GIFOS_FPS_QUALITY || quality) + "';" : '');

// SOFTWARE RASTERISER, AND WHEN NOT TO USE ONE. `--use-angle=swiftshader`
// does not "get ignored by a box with a GPU" (the note that used to sit here):
// it FORCES software, GPU or no GPU. On a box that has one that is not a
// harmless default, it is a different machine under test — measured on a real
// GPU laptop rendering this game in software: the host's main thread blocked in
// ~14.6 s bursts, and because broadcastStatus() runs on the main thread (the
// heartbeat's Worker clock only FIRES it), the room's pulse went out at that
// cadence against a 15 s freshness horizon. Its guest then froze with "the host
// is away" — a verdict about the rasteriser, not about the app.
// FPS_GL=hw asks for the real GPU, which is what a player has.
// FPS_GL=hw ASKED FOR THE GPU AND DID NOT GET ONE, for as long as it has
// existed. `--ignore-gpu-blocklist --enable-gpu-rasterization` only lifts
// Chrome's own refusals; neither of them selects a backend, so a headless
// Chrome with no display fell all the way back to software anyway. Measured on
// the fleet's ONE real-GPU box (2026-08-17), the renderer string was byte
// identical with the flag and without it:
//
//   ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader)
//
// That is not a detail. This suite's HOST presses Play before the guest
// arrives, and on software the stretch from Play to a running engine is
// MINUTES of blocked main thread (e2e-fps-touch measures 249-297s per leg) —
// with broadcastStatus() on that thread. So the "hardware" host went silent for
// minutes on every run, and the phone was blamed for a room that had no host
// beating in it.
//
// Asking for VULKAN is what actually selects an NVIDIA/Tegra GPU in *headless*
// Chrome, and it degrades safely to Vulkan's own SwiftShader on a box with
// none. It is NOT safe as a fleet-wide default: ANGLE Vulkan on a GLES GPU
// (Broadcom V3D, …) reports SwiftShader even in a headed Wayland session,
// while the same Chromium headed with no backend forced reports the real
// adapter (measured: ANGLE OpenGL ES 3.1 on that GPU; in-game evaluate RTT
// 7 ms, ~40 fps). Forcing Vulkan and then calling the board unable to draw
// was a harness bug, not a finding about the silicon.
//
//   gpu: true  → headless Vulkan (the hosts-file mark for a box whose GPU
//                answers that path)
//   otherwise  → no backend forced; fleet-browsers attaches headed if the
//                seat has a display
// USB phones stay first-class drawers via FPS_BOB_CDP (a real Mali GPU is
// stronger than any headless software rasteriser) — they are not a fallback
// after writing a board off. FPS_GL=hw forces Vulkan on everyone; =sw forces
// software. Solo on the orchestrator stays software (that box often has no GPU).
const THROTTLE = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
];
const SW_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const VULKAN_GL = ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-gpu'];
const GLES_GL = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-gpu'];
const SOLO_ARGS = [...(process.env.FPS_GL === 'hw' ? VULKAN_GL : SW_GL), ...THROTTLE];
function fleetArgs(h) {
  if (process.env.FPS_GL === 'sw') return [...SW_GL, ...THROTTLE];
  if (process.env.FPS_GL === 'hw' || (h && h.gpu)) return [...VULKAN_GL, ...THROTTLE];
  return [...GLES_GL, ...THROTTLE];
}

async function install(page) {
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 30000 });
  await page.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'FPS Simple.gif', bytes, kind: 'gif', isApp: true, appId: 'fps-simple', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'FPS Simple.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, GIF_B64);
}

// Close the Abilities sheet if one is up. Clicked in the PAGE rather than
// through Playwright's actionability gate: that gate wants the element stable
// across two animation frames, and there is a WebGL scene in the frame next
// door, so a short timeout on it fails while the sheet sits there perfectly
// clickable. Two runs died on exactly that.
async function dismissSheet(runPage) {
  return runPage.evaluate(() => {
    const box = document.querySelector('.perm-modal');
    if (!box) return false;
    const b = box.querySelector('.done') || box.querySelector('#perm-plain');
    if (b) { b.click(); return true; }
    return false;
  }).catch(() => false);
}

// Close the share card if one is up. It appears the moment a room is minted and
// sits over the app; it is dismissed on every pass rather than once, because the
// app remounts underneath it and the card outlives the mount it was opened from.
async function dismissInvite(runPage) {
  return runPage.evaluate(() => {
    const d = document.getElementById('inv-done');
    if (d) { d.click(); return true; }
    const m = document.getElementById('inv-modal');
    if (m && getComputedStyle(m).display !== 'none') { m.style.display = 'none'; return true; }
    return false;
  }).catch(() => false);
}

// Settle the Abilities sheet (the app declares `pointer`, so it always appears
// on a first run) and wait for the world to finish building.
async function ready(runPage, label, budgetMs, replacing) {
  runPage.on('pageerror', (e) => console.log('  [' + label + ' app err] ' + e.message.slice(0, 200)));
  // Look for the frame that IS our app, rather than for an <iframe> element or
  // "the frame that is not the page". Inviting reboots the app through the app
  // mesh, and during that remount there are moments with an iframe element in
  // the DOM whose document has not committed yet — a frame list that is empty,
  // then briefly holds a frame that is not ours. Both were flaky to look at.
  // The gate is unmistakable and only our app has one.
  //
  // The sheet is clicked on every pass, not once up front: a capability
  // acknowledgement can arrive after the remount as easily as before it.
  //
  // The fleet half allows two minutes: a real machine building a world at the
  // quality it actually chose, and if it cannot manage that, that is a finding
  // rather than something to wait out. The solo half, pinned to 'low' on a
  // software rasteriser, is given the room it genuinely needs.
  const deadline = Date.now() + (budgetMs || 120000);
  let frame = null;
  while (Date.now() < deadline) {
    for (const f of runPage.frames()) {
      if (f === runPage.mainFrame()) continue;
      // THE MOUNT WE ARE REPLACING IS STILL THERE, AND STILL LOOKS RIGHT.
      // Inviting remounts the app, but the old frame does not vanish the
      // instant the click lands — and because Alice now invites BEFORE playing,
      // that old frame still has a gate with an enabled Play button on it. So
      // the first thing this loop found was the frame about to be thrown away,
      // and the click on it died with "Frame was detached" a moment later. Skip
      // it by identity; the runtime builds a genuinely new iframe.
      if (replacing && f === replacing) continue;
      const isOurs = await f.evaluate(() => !!document.getElementById('gate-go')).catch(() => false);
      if (isOurs) { frame = f; break; }
    }
    if (frame) break;
    await dismissSheet(runPage);
    await dismissInvite(runPage);
    await sleep(1000);
  }
  if (!frame) {
    // Say what was actually there. A bare timeout here sent two runs chasing
    // the wrong thing.
    const seen = await runPage.evaluate(() => ({
      iframes: document.querySelectorAll('iframe').length,
      mount: (document.getElementById('appmount') || {}).innerHTML ? 'has content' : 'empty',
      sheet: !!document.querySelector('.perm-modal'),
      text: document.body.innerText.slice(0, 160).replace(/\s+/g, ' '),
    })).catch((e) => ({ err: String(e).slice(0, 120) }));
    throw new Error(label + ': the app never mounted a frame with a gate in it — ' + JSON.stringify(seen));
  }
  await frame.waitForFunction(
    () => { const b = document.getElementById('gate-go'); return b && !b.disabled; },
    null, { timeout: Math.max(5000, deadline - Date.now()) }
  );
  // AND IT MUST STILL BE THERE A MOMENT LATER. boot's promise chain runs on
  // after the button lights, and anything that throws in it lands in the
  // chain's .catch — which calls fatal(), which REMOVES the button. That has
  // shipped twice (a `var` declared in one .then callback and read from the
  // next, both times), and both times every check here passed, because they
  // asked whether Play appeared and never whether it stayed. The world builds,
  // the bar fills, and then the game quietly deletes its own door.
  await sleep(2500);
  const after = await frame.evaluate(() => ({
    button: !!document.getElementById('gate-go'),
    note: (document.getElementById('gate-note') || {}).textContent || '',
  })).catch(() => ({ button: false, note: '(frame gone)' }));
  if (!after.button) {
    throw new Error(label + ': Play appeared and then VANISHED — boot threw after'
      + ' enabling it, so fatal() removed it. Gate says: "' + after.note.slice(0, 160) + '"');
  }
  return frame;
}

// Clear whatever GifOS has put over the app, then press Play.
//
// Two things can be in the way after inviting, because inviting REMOUNTS the
// app: the copy-link modal, and the Abilities sheet — a remount is a fresh
// mount, and it asks again. A host closes both before playing, and Play must be
// a REAL click, because pointer lock will not be granted without a gesture.
async function play(runPage, frame) {
  for (let i = 0; i < 20; i++) {
    await runPage.evaluate(() => { const m = document.getElementById('inv-modal'); if (m) m.style.display = 'none'; });
    await dismissSheet(runPage);
    const clear = await runPage.evaluate(() => {
      const p = document.querySelector('.perm-modal'), m = document.getElementById('inv-modal');
      return !p && (!m || getComputedStyle(m).display === 'none');
    });
    if (clear) break;
    await sleep(500);
  }
  // A detached frame here means the mount was replaced under us after ready()
  // picked it. Say so plainly rather than failing as a click problem.
  try {
    await frame.click('#gate-go', { timeout: 60000 });
  } catch (e) {
    if (/detach/i.test(String(e && e.message))) {
      throw new Error('the app was remounted between finding its gate and pressing Play'
        + ' — ready() returned a frame that was on its way out');
    }
    // ANDROID OVER CDP: Playwright's synthesized MOUSE click can hang inside
    // "performing click action" against a phone's Chrome (measured on the
    // FPS_BOB_CDP leg: button resolved, visible, enabled, stable — then a
    // 60 s wall at the dispatch itself). Everything this suite asserts after
    // Play is STATE, not gesture-gated chrome, so the app's own button.click()
    // is a faithful press — the same fallback framelog's autostart uses.
    if (e && e.name === 'TimeoutError') {
      await frame.evaluate(() => { const b = document.getElementById('gate-go'); if (b && !b.disabled) b.click(); }).catch(() => {});
    } else {
      throw e;
    }
  }
  await sleep(1500);
}

// WAITFORFUNCTION DOES NOT WORK IN THE APP FRAME ONCE THE GAME IS RUNNING, so
// everything after Play polls with evaluate() from out here instead. A harness
// fact, written down because it cost a cycle: the moment engine.start() takes
// over requestAnimationFrame, frame.waitForFunction() times out no matter what
// it is asked — a predicate of `() => true` on 200 ms timer polling times out
// too — while frame.evaluate() of the SAME expression answers correctly at the
// same instant. Playwright's injected poller cannot run in there; the frame is
// healthy. e2e-fps-touch.js was silently dead this way: nine assertions became
// one bare TimeoutError that read as a broken app.
const POLL = 250;
async function waitFor(frame, fn, ms, arg) {
  const deadline = Date.now() + ms;
  for (;;) {
    if (await frame.evaluate(fn, arg).catch(() => false)) return true;
    if (Date.now() >= deadline) return false;
    await sleep(POLL);
  }
}

// A BOX CAN BE ISOLATED AND STILL NOT BE A MACHINE THIS GAME RUNS ON, and that
// gap cost a whole night. fleet.js verifies that a host is reachable, idle and
// has a browser. It cannot verify that the box can RENDER THIS GAME. An empty
// canvas that answers in 6 ms is not that measurement — the 18 s stall was
// the game on a software rasteriser, which we had forced by asking ANGLE
// Vulkan on a GLES GPU. Measure in-game evaluate RTT, try the next host on
// a null, and do not skip a board because it lacks `gpu: true`.
async function mustBeAbleToAnswer(frame, who, host) {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    const ok = await frame.evaluate(() => 1).then(() => true, () => false);
    samples.push(ok ? Date.now() - t : 999999);
  }
  samples.sort((a, b) => a - b);
  const median = samples[1];
  console.log('  ' + who + '@' + host + ' app-frame RTT ' + median + ' ms (median of 3)');
  if (median <= 2000) return median;
  console.log('  ' + who + "'s box (" + host + ') cannot answer while the game is running — not a product red; the next capable host is tried.');
  return null;
}

/* ======================================================================= */
/* SOLO — one box                                                          */
/* ======================================================================= */
async function solo() {
  console.log('=== SOLO  (one box is enough: every assertion is about state)');
  const browser = await chromium.launch({ executablePath: CHROME, args: SOLO_ARGS });
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript({ content: setup('Alice', 'low') });

    // Every request this context makes, so "it never touches the network" is
    // COUNTED rather than taken on the manifest's word. Observed passively
    // rather than through route(): interception changes how the app mounts, and
    // a guard must not alter what it watches.
    const external = [];
    ctx.on('request', (req) => {
      const u = req.url();
      if (!u.startsWith(BASE) && !/^(data|blob|about|ws):/.test(u)) external.push(u);
    });

    const desk = await ctx.newPage();
    desk.on('pageerror', (e) => console.log('  [Alice err] ' + e.message.slice(0, 200)));
    await install(desk);
    const [run] = await Promise.all([
      ctx.waitForEvent('page'),
      desk.locator('.icon', { hasText: 'FPS Simple.gif' }).dblclick(),
    ]);
    const frame = await ready(run, 'Alice', 420000);
    check('the built GIF installs and boots inside the sandbox', true);
    check('solo: the room is empty, so it is the garrison you are playing',
      /solo against the garrison/i.test(await frame.evaluate(() => document.getElementById('gate-room').textContent)));

    await play(run, frame);
    check('capabilities.pointer, end to end: the app locks the pointer',
      await frame.evaluate(() => !!document.pointerLockElement));
    check('the engine is running (the player has a pose to publish)',
      await frame.evaluate(() => !!(window.__FPS_POSE__ && window.__FPS_POSE__())));

    // Tab is OURS. Upstream binds it to swapWeapon alongside Digit1/Digit2, and
    // the gate card tells the player to hold it for scores — so before this was
    // fixed, checking the scoreboard swapped your rifle for your sidearm and
    // letting go swapped it back. The scoreboard is the multiplayer surface,
    // but the collision is in the engine's binding table and is asserted here,
    // in the half that always runs.
    const tab = await frame.evaluate(() => {
      const F = window.__FPS__, input = F.engine.input;
      input._pendingDown.add('Tab');            // the same channel a real key uses
      const before = F.ctx.peek('weapon');
      const swapBefore = input.actionPressed('swapWeapon') || input.action('swapWeapon');
      input.down.add('Tab');
      const swapHeld = input.action('swapWeapon');
      input.down.delete('Tab'); input._pendingDown.delete('Tab');
      input.down.add('Digit2');
      const digitStillSwaps = input.action('swapWeapon');
      input.down.delete('Digit2');
      return { swapBefore: !!swapBefore, swapHeld: !!swapHeld, digitStillSwaps: !!digitStillSwaps, had: !!before };
    });
    check('holding Tab for the scoreboard does NOT swap the weapon', !tab.swapHeld,
      'held Tab -> swapWeapon=' + tab.swapHeld);
    check('...and 1/2 still swap it, which is what the gate card says', tab.digitStillSwaps);

    // A PRESET IS A CHOICE; A CEILING IS PHYSICS. The pin decides which preset
    // is used and must keep deciding it — the suites depend on 'low' to avoid
    // spending minutes on scenery they never look at. But the probe now runs
    // ALWAYS, and its ceilings clamp over whatever preset was chosen, because
    // gating them behind "did the player choose" is what let a machine with no
    // graphics chip render at full resolution: any quality being set skipped
    // the probe and every limit that came with it.
    const pinned = await frame.evaluate(() => {
      const c = window.__FPS__.ctx.config, a = window.__FPS_AUTO__;
      return { quality: c.quality, probed: !!a,
               scale: c.q.renderScale, ceiling: a ? a.renderScale : null };
    });
    check('a pinned quality still decides the preset', pinned.quality === 'low', JSON.stringify(pinned));
    check('...and the device ceilings are applied anyway, never skipped',
      pinned.probed && pinned.ceiling != null && pinned.scale <= pinned.ceiling + 0.001,
      JSON.stringify(pinned));

    // The stray-key help is DISABLED while the gate is up (the gate card
    // itself lists the keys — boot.js returns early on `gate.parentNode`),
    // and the gate lifts only after three fast DRAWN frames, which on a box
    // still compiling shaders is seconds after Play. This suite never waited
    // for that: on the slow gate box the polling cadence hid it, and on a
    // fast headed GPU box the next check ran with the gate still up and
    // reported the flash "broken". Measured both ways on the same machine —
    // FAIL without the wait, PASS with it, same build.
    await waitFor(frame, () => !document.getElementById('gate'), 60000);

    // A STRAY KEY ASKS WHAT THE KEYS ARE, and the answer must know which keys
    // are real. The bound set is probed from the engine's own table at boot
    // rather than copied into the app, so this checks the probe actually found
    // it: if it silently returned nothing, every key would look stray and the
    // help would flash on W.
    const keys = await frame.evaluate(() => {
      const b = window.__FPS_BOUND__ || {};
      const fire = (code) => {
        document.getElementById('keyhelp') && document.getElementById('keyhelp').classList.remove('on');
        dispatchEvent(new KeyboardEvent('keydown', { code: code, bubbles: true }));
        const el = document.getElementById('keyhelp');
        return !!(el && el.classList.contains('on'));
      };
      return {
        movement: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft'].filter((c) => b[c]).length,
        ours: !!b.Tab && !!b.Escape,
        strayFlashes: fire('KeyM'),
        boundStaysQuiet: !fire('KeyW'),
      };
    });
    check('the engine\'s own key bindings were found, not guessed at',
      keys.movement === 6 && keys.ours, JSON.stringify(keys));
    check('a stray key flashes the controls, a real one does not',
      keys.strayFlashes && keys.boundStaysQuiet, JSON.stringify(keys));

    // THE AUDIO WATCHDOG IS WIRED, END TO END. The sound bug this guards was
    // heard on a microphone: once the game's AudioContext render clock slips
    // below real time, the speakers go silent — not quiet, SILENT, with the
    // graph's own analyser still reading signal — and the context never
    // recovers unaided. The cure is the audioHeal watchdog (vendor.mjs): it
    // measures the render clock against the wall clock from update() and
    // kicks a wedged context (suspend/resume, then a full rebuild). This
    // cannot re-measure the wedge here (it needs real speakers and an ear);
    // what it CAN guard is the wiring: the preset carries the knob, and the
    // engine carries the watchdog — either half silently vanishing (a pin
    // move dropping the patch, a preset edit losing the knob) brings the
    // whole symptom back.
    const heal = await frame.evaluate(() => ({
      knob: window.__FPS__.ctx.config.q.audioHeal === true,
      tick: !!(window.__AUDIO__ && typeof window.__AUDIO__._healTick === 'function'),
      kick: !!(window.__AUDIO__ && typeof window.__AUDIO__._heal === 'function'),
    }));
    check('the audio watchdog is wired: preset knob + engine tick + engine kick',
      heal.knob && heal.tick && heal.kick, JSON.stringify(heal));

    /* ---- the HUD systems nothing was feeding ---------------------------- */
    // Three engine features are drawn every frame and were given no data at
    // all until 2026-08-17: enemy blips, the incoming-grenade warning, and the
    // match bar. The blip collector is the subtle one — the UI asks the AI
    // system for getHudActors() and RETURNS SILENTLY if it is absent, so the
    // minimap drew the street and nothing else for every build ever shipped.
    // A player found it by playing. These assert the wiring is present and the
    // reveal rule is right, in both directions.
    const hud = await frame.evaluate(() => ({
      hook: !!(window.__FPS__ && window.__FPS__.ctx.peek('ai') && window.__FPS__.ctx.peek('ai').getHudActors),
      test: !!window.__FPS_HUD__,
      agents: (window.__FPS__.ctx.peek('ai').agents || []).length,
    }));
    check('the engine\'s blip collector has its data source — ai.getHudActors()',
      hud.hook, JSON.stringify(hud));
    // THE RULE: firing gives you away, standing still does not.
    //
    // THIS USED TO ASSERT THE EASY HALF AND MISS THE FEATURE ENTIRELY. It
    // called __FPS_HUD__.revealAt(agent.position.x, agent.position.z) — handing
    // the app a soldier's own coordinates and checking it found that soldier.
    // That exercises a nearest-agent search and nothing else: it never touched
    // the source the feed actually reads, so the feed was free to read a source
    // that could not produce a single blip in a real game, stay green here, and
    // ship. It did exactly that, for the whole of 0.9.9's development, and it
    // took a player saying "I have never seen a dot on the minimap for any
    // reason" to find it.
    //
    // So drive the state the ENGINE sets on a soldier that is shooting, and ask
    // the engine's own extension point what it would draw. Nothing synthetic is
    // pushed anywhere: burstLeft is the field a live agent carries mid-burst
    // (measured on a running game), which is precisely what the feed reads.
    const reveal = await (async () => {
      const armed = await frame.evaluate(() => {
        const ai = window.__FPS__.ctx.peek('ai');
        const live = (ai.agents || []).filter((a) => a && a.alive !== false);
        if (live.length < 2) return null;          // need a control group
        live.forEach((a) => { a.burstLeft = 0; a.wantFire = false; });
        live[0].burstLeft = 3;                     // one soldier, mid-burst
        return { total: live.length };
      });
      if (!armed) return null;
      // The feed runs once per engine frame, so poll for it rather than
      // assuming a frame has gone by — on a software rasteriser it has not.
      await waitFor(frame, () => ((window.__FPS__.ctx.peek('ai').getHudActors() || []).length >= 1), 30000);
      return frame.evaluate(() => {
        const ai = window.__FPS__.ctx.peek('ai');
        const live = (ai.agents || []).filter((a) => a && a.alive !== false);
        const shown = ai.getHudActors() || [];
        return { total: live.length, shown: shown.length,
                 firingIsShown: shown.indexOf(live[0]) >= 0 };
      });
    })();
    check('a soldier who FIRES shows up on the minimap',
      !!reveal && reveal.firingIsShown === true, JSON.stringify(reveal));
    check('…and the soldiers merely standing there do NOT (that would be a wallhack)',
      !!reveal && reveal.shown === 1 && reveal.total > 1, JSON.stringify(reveal));
    const fed = await frame.evaluate(() => {
      const ui = window.__FPS__.ctx.peek('ui');
      return { grenade: typeof ui.spawnGrenade === 'function', match: typeof ui.setMatch === 'function',
               markers: !!ui.markers };
    });
    check('the incoming-grenade warning and the match bar are reachable to feed',
      fed.grenade && fed.match && fed.markers, JSON.stringify(fed));

    check('it reached the network ZERO times — the manifest declares no hosts',
      external.length === 0, external.slice(0, 3).join(' '));
  } finally {
    await browser.close();
  }
}

/* ======================================================================= */
/* DEATHMATCH — a machine per player                                       */
/* ======================================================================= */
async function deathmatch() {
  // WHAT THE PHONE LEG IS, AND WHAT IT IS NOT — written after a night of
  // treating it as the requirement when it is an extra.
  //
  // The DEFAULT is two fleet boxes, and that is what the gate needs. Measured
  // 2026-08-17 on two <behavior-box> fleet clients: 19/19 green with presence
  // crossing at t=0s, no churn, the guest answering in 142ms. (An earlier note
  // that one <behavior-box> was too slow to be a player — a 10,327ms probe —
  // was taken before GL=hw actually asked for a GPU and before this suite
  // waited for the host to be playing; it is not true of the suite as it stands.)
  //
  // The phone leg is OPT-IN and, as of that date, FLAKY — one full green run in
  // seven, and the same two-box run green back to back around it. What it costs
  // is not the phone's silicon: it boots to READY in 13-15s on a real Mali GPU
  // and answers in 51-80ms. It is the PATH. The phone reaches the stack through
  // adb reverse and its peer through household wifi, and the pair's ICE was
  // measured cycling connected/disconnected while the game ran, with app state
  // (which rides the DataChannel and nothing else) queued to its 32 cap on both
  // sides. Both peers seated, both rosters right, and nothing crossing.
  //
  // So: run it for what only it can prove — real touch hardware, a real phone
  // GPU, a real network path — and read a red on it as a question about the
  // path before it is read as one about the product. The two-box run is the
  // control that tells those apart, and it takes ten minutes.
  //
  // BOB CAN BE A REAL PHONE. With FPS_BOB_CDP set to a Chrome DevTools
  // endpoint (an adb-forwarded Android Chrome, tunnelled to wherever this
  // suite runs), Bob is that browser instead of a second fleet box — real
  // silicon rendering at real frame rates, which is a STRONGER second player
  // than any headless software rasteriser, plus real touch hardware. The
  // isolation requirement is still satisfied and still VERIFIED: the phone is
  // its own machine by construction, Alice still needs a verified fleet box,
  // and mustBeAbleToAnswer still measures the phone before any timing below
  // is believed. Unset, this function is exactly what it always was.
  //
  // The phone-side addresses default to loopback because that is the only
  // shape that works there: a USB phone cannot take Chrome flags, so an
  // insecure LAN origin would fail the mandatory Ed25519 join (secure-context
  // WebCrypto) — but `adb reverse` makes the suite's stack appear on the
  // phone's own localhost, which IS a secure context. The reverse also covers
  // phones that cannot route to the stack at all (measured: this one cannot).
  const BOB_CDP = process.env.FPS_BOB_CDP || '';
  const BOB_BASE = (process.env.FPS_BOB_BASE || 'http://127.0.0.1:8099').replace(/\/+$/, '');
  const BOB_RELAY = process.env.FPS_BOB_RELAY || 'ws://127.0.0.1:8790';

  // A dead relay looks EXACTLY like a broken app here: the room forms locally,
  // the invite link mints, and the guest then sits waiting on a room that will
  // never answer. Check the stack where the fleet's browsers reach it, not on
  // loopback, or a healthy remote stack is refused as missing.
  await need({ 8099: 'a static server on 8099 bound to 0.0.0.0 (python3 -m http.server 8099 -d site --bind 0.0.0.0)',
               8790: 'relay-local (node test/servers/relay-local.js)' },
    new URL(BASE).hostname);

  const fleet = await needFleet(BOB_CDP ? 1 : 2, {
    why: 'each player needs their own CPU — presence is published from the engine\'s own update, '
       + 'a remote body is driven per RENDERED FRAME, and two 3D browsers on one box render at ~1 fps, '
       + 'so every timing this half depends on becomes a timing about that box'
       + (BOB_CDP ? ' (Bob is the phone at FPS_BOB_CDP — his own machine by construction)' : ''),
    roles: BOB_CDP ? ['alice'] : ['alice', 'bob'],
  });
  const pool = fleet.hosts.slice();
  const pick = pool.splice(0, BOB_CDP ? 1 : 2);
  const boxes = await openFleet(pick, { args: fleetArgs, origin: BASE });
  let bobBrowser = null;   // the phone's CDP connection, when there is one

  // THE HARNESS HAS NO THUMB, AND A PLAYER DOES.
  //
  // run.html parks a phone after three minutes with no touch and no speech —
  // nobody is holding this one — and releases its wake lock. This suite starts
  // the game through the app's autostart pref and scripted clicks, none of
  // which is a touch, so on a run long enough to build a world the container
  // correctly concluded its owner had walked away. Measured here, twice,
  // immediately before the failure it caused:
  //   [Bob room] … dc=closed/disconnected stAge=179348 😴 Phone looks parked
  //
  // So say what is true: a person is playing. pokeForTest is the host page's
  // own "a touch or a word happened" hook. It is NOT standing in for the
  // product path — a real thumb reaches the container through the app frame's
  // `uiactive` ping, and that law has its own guard in e2e-app-touch-awake.js,
  // where it is asserted instead of assumed.
  const stayPresent = (pg) => pg.evaluate(() => {
    try { window.__gifosVideo.pokeForTest(); } catch (e) {}
  }).catch(() => {});

  try {
    console.log('=== DEATHMATCH  (Alice on ' + (boxes[0].host.name || boxes[0].host.ssh)
      + ', Bob on ' + (BOB_CDP ? 'the phone at FPS_BOB_CDP' : (boxes[1].host.name || boxes[1].host.ssh)) + ')');

    /* ---- Alice, on her own machine, mints the room ---- */
    const aCtx = await boxes[0].browser.newContext({ viewport: { width: 1100, height: 720 } });
    await aCtx.addInitScript({ content: setup('Alice', 'low') });
    const aDesk = await aCtx.newPage();
    aDesk.on('pageerror', (e) => console.log('  [Alice err] ' + e.message.slice(0, 200)));
    await install(aDesk);
    const [aRun0] = await Promise.all([
      aCtx.waitForEvent('page'),
      aDesk.locator('.icon', { hasText: 'FPS Simple.gif' }).dblclick(),
    ]);
    let aFrame = await ready(aRun0, 'Alice', 240000);

    // ALICE INVITES BEFORE SHE PLAYS, and that is the realistic order as well as
    // the fast one. Pressing Play first locks the pointer, and a suite can then
    // click Invite through the lock in a way a person never can: with the cursor
    // captured by the canvas there is nothing to click Invite WITH, so a real
    // player presses Esc — which releases the lock and opens the pause menu —
    // and only then reaches the app bar. Inviting through a live pointer lock
    // put the page in a state the remount did not survive: the app frame went
    // away and never came back, and the failure read as "the app never mounted",
    // which sent this straight at the app. It also saves a whole world build,
    // since inviting throws the first mount away regardless.
    await aRun0.evaluate(() => document.getElementById('appinvite').click());
    await aRun0.waitForSelector('input[name="rmcls"]', { timeout: 15000 });
    await aRun0.evaluate(() => {
      document.querySelector('input[name="rmcls"][value="heal"]').checked = true;
      document.getElementById('inv-go').click();
    });
    await waitFor(aRun0, () => !!(document.getElementById('share-url') || {}).value, 60000);
    const shareUrl = await aRun0.evaluate(() => (document.getElementById('share-url') || {}).value || '');
    check('inviting mints a room link', /#/.test(shareUrl), shareUrl.slice(0, 60));

    // ALICE DOES NOT GO TO THE LINK. She IS the link: an app room is hosted by
    // the browser that minted it, and the app's bytes are served to every guest
    // from there. Inviting REMOUNTS her app in place as the room's host — the
    // frame is back within a few seconds — so there is nothing to navigate to
    // and the share card just needs closing, which ready() now does on every
    // pass alongside the Abilities sheet.
    //
    // Navigating her there was tried twice and both ways lie. run.html#id=<file>
    // to run.html#j=<room> differs only in the FRAGMENT, so goto() is a
    // same-document navigation that reloads nothing; forcing it with reload()
    // is worse, because it tears down the host while she is it and she arrives
    // at a room with nobody left to serve the app.
    const aRun = aRun0;
    aFrame = await ready(aRun, 'Alice', 240000, aFrame);
    await play(aRun, aFrame);

    // ALICE MUST BE PLAYING BEFORE BOB IS SENT IN, and this is the single
    // biggest thing this suite was getting wrong.
    //
    // play() presses the button and returns 1.5s later. It does not wait for a
    // world. On a box without hardware GL the stretch between Play and a
    // running engine is MINUTES of blocked main thread — e2e-fps-touch measures
    // 249-297s per leg on the gate box — and broadcastStatus() runs on that
    // thread. So the guest was being sent into a room whose host had gone
    // silent, and every reading afterwards was about her loading screen.
    //
    // It is exactly what the telemetry kept saying, and it took far too long to
    // read: `dc=open/connected stAge=167151`. An OPEN channel, and Alice's own
    // status stamp 167 SECONDS old. The transport was never the problem, and
    // neither was the phone — which boots to READY in 13-15s and was sitting
    // there waiting for a host that was not beating. One run passed only
    // because she happened to finish first.
    //
    // So wait for her to be genuinely in the game: an engine counting frames,
    // AND a fresh beat, which is the thing the room actually needs. Generous,
    // because a software rasteriser earns every second of it; loud if she never
    // gets there, because a host that cannot reach her own world is a finding
    // and not something to quietly time out around.
    // NOT "and still beating", which was asked for here first and was a
    // question with no answer: a host ALONE in a room has nobody to gossip to,
    // so broadcastStatus is not called and her stamp does not advance. Measured
    // saying so — "engine running=true her last beat 608732ms ago" — while the
    // very next line, once the guest was in, read stAge=3234. Frames counting
    // is the precondition that was actually missing.
    {
      const dl = Date.now() + 600000;
      let running = false, waited = 0;
      const t0 = Date.now();
      while (Date.now() < dl) {
        running = await aFrame.evaluate(() =>
          !!(window.__FPS__ && window.__FPS__.engine && window.__FPS__.engine.time
             && window.__FPS__.engine.time.frame > 0)).catch(() => false);
        if (running) break;
        await sleep(3000);
      }
      waited = Math.round((Date.now() - t0) / 1000);
      check('Alice is actually IN the game before the guest is sent in',
        running, running ? 'her engine was counting frames after ' + waited + 's'
                         : 'her engine never started in 600s — the host cannot reach her own world');
    }

    /* ---- Bob, on a DIFFERENT machine, opens the link ---- */
    let bRun;
    if (BOB_CDP) {
      // Android Chrome over CDP, with its quirks measured rather than assumed:
      //   - newContext fails ("Failed to create browser context"), so Bob
      //     lives in the default context — newPage there works.
      //   - the relay and name are seeded by loading an inert same-origin
      //     document (version.json — cheap, no desktop boot) and writing
      //     localStorage.
      //     CONTEXT-level addInitScript is unavailable; PAGE-level is not, and
      //     it reaches child frames — which is how the app inside the sandbox
      //     is reachable at all (see the quality pin below).
      //   - Playwright clicks over CDP arrive trusted (measured:
      //     isTrusted=true), so Play starts the engine like a finger would.
      bobBrowser = await chromium.connectOverCDP(BOB_CDP, { timeout: 30000 });
      const bobCtx = bobBrowser.contexts()[0];
      if (!bobCtx) throw new Error('the phone exposed no default browser context over CDP');

      // THE PHONE IS PINNED TO 'low' TOO NOW, and the reason is measured, not
      // tidy. This used to say the pin was deliberately absent — "this Bob is
      // real silicon, the device probe choosing the real phone preset is part
      // of what the phone buys us" — and on a phone with room to spare that is
      // still the better test. This one has 3.86 GB and it does not.
      //
      // Three runs died the same way: the tab reached the room, began building
      // the street, and RELOADED. Chrome discards a tab under memory pressure
      // and Android's own killer was watching the same cliff — logcat, at the
      // moment of one reload: "lowmemorykiller: freeMemory 63560Kib". The room
      // then healed correctly every time (parts back to 2, channel back open),
      // which is the product behaving; the engine simply never got to start.
      //
      // Pinning is consistent with what this half is FOR, and the file already
      // says so about the fleet peers: the fleet is asked for ISOLATION, not
      // FIDELITY — nothing here looks at the street, it asks who is in the room
      // and whether a hit lands. And the preset is only a preset: the device
      // probe still runs and still clamps its own ceilings over the top
      // (boot.js, "A PRESET IS A PREFERENCE. WHAT THE DEVICE CAN DRAW IS NOT"),
      // so this asks the phone for less scenery, never for more than it can do.
      // What the phone still buys, and nothing else can: real silicon, real
      // touch hardware, a real network path, and its own machine by
      // construction. Set FPS_BOB_QUALITY= (empty) to let the probe choose,
      // on a phone with the memory for it.
      const BOB_QUALITY = process.env.FPS_BOB_QUALITY !== undefined ? process.env.FPS_BOB_QUALITY : 'low';
      const newPhonePage = async () => {
        const pg = await bobCtx.newPage();
        if (BOB_QUALITY) {
          // Page-level, so it lands on the app's sandboxed frame as well —
          // boot.js reads GIFOS_FPS_QUALITY off its OWN window, and that frame
          // is the only place setting it has any effect.
          await pg.addInitScript({ content: "window.GIFOS_FPS_QUALITY='" + BOB_QUALITY + "';" }).catch(() => {});
        }
        return pg;
      };
      bRun = await newPhonePage();

      // THE WARM BOOT IS OFF BY DEFAULT NOW, AND THE REASON IS IN THE APP'S
      // OWN SOURCE. It was added to prime the phone's texture and mesh caches
      // with a solo boot — "the same street, the same seed, the same caches" —
      // so the mount inside the room would not bake seventeen surfaces again.
      // It cannot do that for THIS Bob, and apps/fps-simple/texcache.js says so
      // in as many words:
      //
      //   "gifos.db, which for the app's OWNER — anyone opening it from their
      //    own desktop, i.e. every solo launch — is backed by real IndexedDB …
      //    A guest in someone else's room gets an in-memory store that dies
      //    with the tab, so a guest bakes as before."
      //
      // Bob is a guest. The primed cache lives in the OWNER's store and the
      // room mount is a different store that starts empty, so the second boot
      // bakes the whole street exactly as if the first had never happened —
      // while having cost a full world build, its peak memory, and its minutes
      // of blocked main thread on a device that discards tabs at that peak.
      // Whatever the browser's own shader cache still carries across is not
      // worth paying twice for it.
      //
      // FPS_BOB_PRIME=1 puts it back, for measuring that question on purpose.
      await bRun.bringToFront().catch(() => {});
      if (process.env.FPS_BOB_PRIME === '1') {
        await bRun.goto(BOB_BASE + '/index.html', { timeout: 60000 });
        await bRun.waitForSelector('.icon', { timeout: 60000 }).catch(() => {});
        const primed = await bRun.evaluate(async (base) => {
          const have = (await GifOS.store.allFiles()).find((x) => x.appId === 'fps-simple');
          if (have) return have.id;
          const r = await fetch(base + '/apps/fps-simple/fps-simple.gif');
          const bytes = new Uint8Array(await r.arrayBuffer());
          const fid = GifOS.store.uid('file');
          await GifOS.store.putFile({ id: fid, name: 'FPS Simple.gif', bytes, kind: 'gif', isApp: true, appId: 'fps-simple', mime: 'image/gif' });
          await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'FPS Simple.gif', parent: null, x: 200, y: 200, iconSize: 64 });
          return fid;
        }, BOB_BASE).catch(() => null);
        if (primed) {
          await bRun.goto(BOB_BASE + '/run.html#id=' + primed, { timeout: 60000 }).catch(() => {});
          await bRun.bringToFront().catch(() => {});
          const pdl = Date.now() + 300000;
          while (Date.now() < pdl) {
            const lit = await (async () => {
              for (const f of bRun.frames()) {
                if (f === bRun.mainFrame()) continue;
                if (await f.evaluate(() => { const b = document.getElementById('gate-go'); return !!(b && !b.disabled); }).catch(() => false)) return true;
              }
              return false;
            })();
            if (lit) break;
            await dismissSheet(bRun);
            await sleep(2000);
          }
          console.log('  [Bob] warm-boot primed (world built once, caches filled)');
          // SHED THE PRIMED PAGE BY CLOSING IT, NOT BY NAVIGATING IT.
          //
          // Navigating was tried and MEASURED FAILING (2026-08-17): about:blank
          // came back, and the very next goto — version.json, 400 bytes off
          // loopback — timed out at 60s on a phone that had answered the same
          // request in 313ms an hour earlier. A navigated page unloads INSIDE
          // its own renderer, and that renderer is still holding a built 3D
          // world, its worker and a few hundred MB on a 4 GB device; the unload
          // queues behind all of it. Closing the tab hands the teardown to the
          // BROWSER process instead, which does not have to wait for the game's
          // main thread, and hands the memory back with it.
          //
          // A fresh tab is also the honest shape for what the primer models: a
          // player who built this street once, closed the game, and comes back.
          await bRun.close().catch(() => {});
          await sleep(3000);            // let the device actually get the memory back
          bRun = await newPhonePage();
          await bRun.bringToFront().catch(() => {});
        }
      }
      await bRun.goto(BOB_BASE + '/version.json', { timeout: 60000, waitUntil: 'domcontentloaded' });
      await bRun.evaluate(([relay, name]) => {
        localStorage.setItem('gifos_relay', relay);
        localStorage.setItem('gifos_name', name);
      }, [BOB_RELAY, 'Bob']);
      // The share link Alice minted names the stack where SHE reaches it —
      // TWICE: the page origin, and the relay address riding IN the hash
      // (#j=<room>&relay=<encoded ws url>). The phone reaches that same stack
      // only through its own loopback (adb reverse), so both are rewritten
      // and the room fragment itself survives untouched. Measured before this
      // rewrite: Bob joined the room id but dialed Alice's relay address,
      // which the phone cannot route to, and sat at "nobody is answering the
      // door" until the suite gave up.
      const u = new URL(shareUrl);
      const hash = u.hash.replace(/([#&]relay=)[^&]*/, (m, key) => key + encodeURIComponent(BOB_RELAY));
      await bRun.goto(BOB_BASE + u.pathname + hash, { timeout: 90000, waitUntil: 'domcontentloaded' });
      // FOREGROUND, AND KEPT THERE. newPage over CDP opens a BACKGROUND tab on
      // Android, and a background tab is the whole failure in one line: rAF
      // throttled to 1 Hz (measured: the game ran at exactly 1 fps for 200 s),
      // presence starved, and Chrome eventually discards-and-reloads the tab —
      // which read as remounts, hung clicks, and a phone that "cannot answer".
      // bringToFront took the same running game from 1 fps to 11 fps on the
      // spot. Re-fronted in the wait loop too, because a reload re-backgrounds.
      await bRun.bringToFront().catch(() => {});
    } else {
      const bCtx = await boxes[1].browser.newContext({ viewport: { width: 1100, height: 720 } });
      await bCtx.addInitScript({ content: setup('Bob', 'low') });
      bRun = await bCtx.newPage();
      await bRun.goto(shareUrl);
    }
    bRun.on('pageerror', (e) => console.log('  [Bob app err] ' + e.message.slice(0, 200)));
    // THE PHONE'S BOOT TIMELINE, FROM THE APP ITSELF. boot.js stamps every
    // phase as `[fpsperf] <what> <ms>` on the console precisely because a phone
    // cannot be attached to a debugger while it does this — and the one thing
    // we could never see is WHERE its main thread goes for the minutes that the
    // room spends unreachable (measured: stAge=180996, three minutes with no
    // beat processed). Listening costs nothing and needs no product change.
    bRun.on('console', (m) => {
      const t = m.text();
      if (t.indexOf('[fpsperf]') === 0 || t.indexOf('[fps]') === 0) console.log('  [Bob ' + t.slice(0, 120) + ']');
    });
    let bFrame;
    if (BOB_CDP) {
      // THE PHONE PRESSES ITS OWN PLAY BUTTON. Playwright's CDP mouse click
      // against this phone hangs inside "performing click action" and the
      // interaction then RELOADS the tab (measured three runs in a row: a
      // main-frame NAV at the exact second of the click) — the same wall that
      // killed adb-injected taps in the earlier phone sessions. The harness's
      // sanctioned answer is the app's own AUTOSTART pref (framelog.js): the
      // app presses Play itself, from inside, stamped for THIS session. The
      // pref lives in the app's private store, so it is written through the
      // app's own shim once the first mount is up, and the page is then
      // reloaded so framelog reads it at boot. An autostarted click carries no
      // user activation — fullscreen and orientation are refused — which this
      // half never asserts; it asserts room STATE.
      const findAppFrame = async (budgetMs, why) => {
        // The NEWEST matching frame, never the first: during a remount the
        // page briefly holds the dying mount AND the live one, and both carry
        // a gate — a click sent into the zombie does nothing while the real
        // app sits at Play (measured: engine.time.frame pinned at 0 for
        // seven minutes of "clicking"). A frame already running the engine wins
        // outright.
        const dl = Date.now() + budgetMs;
        while (Date.now() < dl) {
          let best = null;
          for (const f of bRun.frames()) {
            if (f === bRun.mainFrame()) continue;
            const st = await f.evaluate(() => ({
              ours: !!(document.getElementById('gate-go') || window.__FPS__),
              run: !!(window.__FPS__ && window.__FPS__.engine && window.__FPS__.engine.time && window.__FPS__.engine.time.frame > 0),
            })).catch(() => null);
            if (st && st.run) return f;
            if (st && st.ours) best = f;   // keep the LAST match — the newest mount
          }
          if (best) return best;
          await dismissSheet(bRun);
          await dismissInvite(bRun);
          await sleep(1000);
        }
        throw new Error('Bob: no app frame ' + why);
      };
      // The whole press, from inside, with the frame RE-FOUND whenever the
      // handle detaches: an app-room guest's iframe is remounted around
      // serve/acknowledgement, which is the same reason ready() searches for
      // its frame on every pass instead of holding one. Measured: the tab
      // stayed alive with the app's workers running while a held handle read
      // "Frame was detached". (The pref-then-reload autostart variant was
      // tried and measured out: a joined room's private store does not
      // persist across a reload, so the pref written before it read null
      // after.) The click is re-issued while the engine has not started —
      // the app's `starting` guard makes repeats free.
      // ACK FIRST, AND EXPECT THE REMOUNT. Acknowledging the Abilities sheet
      // REMOUNTS the app (ready()'s own doctrine) — measured here: pressing
      // Play and acking afterwards tore down the RUNNING mount ~5 s into the
      // game. So the sheet is settled before any press, a press goes to EVERY
      // frame that shows an enabled Play (a zombie mount ignores it; the live
      // one starts — clicking only "the" frame put seven minutes of clicks
      // into a corpse), and the wait then scans for ANY frame with a counting
      // engine. The budget is generous on purpose: this phone's first Play
      // seizes the main thread for minutes of shader compilation (framelog
      // measured 101 s of it), during which every evaluate simply waits.
      const startDl = Date.now() + 600000;
      let started = false;
      // WHY BOB IS NOT STARTING, said while it is happening. The failure mode
      // here is not "the click missed": it is the ROOM going out from under
      // the guest mid-boot — the app freezes ("the host is away"), and a
      // frozen app never counts a frame no matter how often Play is pressed.
      // Room + transport state is therefore logged on every pass, because
      // afterwards the host's browser is closed and the evidence is gone.
      let lastRoom = '';
      const roomLine = async () => {
        const st = await bRun.evaluate(async () => {
          const V = window.__gifosVideo; if (!V) return 'no-hooks';
          const ids = (V.peerIds && V.peerIds()) || [];
          const ps = [];
          for (const id of ids) {
            const ice = V.icePairFor ? await V.icePairFor(id).catch(() => null) : null;
            const stp = V.statusPeekForTest ? V.statusPeekForTest(id) : null;
            ps.push(String(id).slice(0, 4) + ':dc=' + ((ice && ice.dc) || '?')
              + '/' + ((ice && ice.ice) || '?') + ' stAge=' + (stp ? stp.ageMs : '?'));
          }
          // SEATED, because sgaTargets() opens with `const c = meshCoord();
          // if (!c) return []` — a page with no seat in the mesh tree fans app
          // state to NOBODY, however healthy its room, roster and channel look.
          // That is the shape of a pend pinned at its 32 cap.
          const bp = V.beatPeekForTest ? V.beatPeekForTest() : null;
          return 'parts=' + (V.participants ? V.participants() : '?')
            + ' app=' + (V.appActive ? V.appActive() : '?')
            + ' host=' + (V.appIsHost ? V.appIsHost() : '?')
            + ' seated=' + (bp ? bp.seated : '?')
            + ' pend=' + (V.sgaPendingForTest ? V.sgaPendingForTest() : 'n/a')
            + ' [' + ps.join(' | ') + '] ' + ((document.getElementById('status') || {}).textContent || '').slice(0, 60);
        }).catch((e) => 'probe-err:' + String(e.message).slice(0, 40));
        if (st !== lastRoom) { console.log('      [Bob room] ' + st); lastRoom = st; }
      };
      // THE HARNESS HAS NO THUMB, AND A PLAYER DOES.
      //
      // run.html parks a phone after three minutes with no touch and no
      // speech — nobody is holding this one — and releases its wake lock. This
      // suite starts the game through the app's autostart pref and a scripted
      // click, neither of which is a touch, so on a run long enough to build a
      // world the container correctly concluded that its owner had walked away.
      // Measured here, twice, immediately before the failure it caused:
      //   [Bob room] … dc=closed/disconnected stAge=179348 😴 Phone looks parked
      //
      // So say what is true: a person is playing. pokeForTest is the host's own
      // "a touch or a word happened" hook, and using it keeps this suite about
      // the deathmatch instead of about the idle clock. It is NOT standing in
      // for the product path — a real thumb reaches the container through the
      // app frame's `uiactive` ping, and that law has its own guard in
      // e2e-app-touch-awake.js, where it is asserted rather than assumed.
      bFrame = await findAppFrame(240000, 'on the first mount (did Alice serve the app?)');
      // SAY WHAT THE PHONE ACTUALLY DECIDED TO BUILD. The quality pin travels
      // by page-level addInitScript and has to survive into a SANDBOXED frame
      // to mean anything; "I set an env var" is not evidence that it did. The
      // device line beside it is boot.js's own summary of the probe, so a run
      // that goes wrong afterwards says, in its log, which street it was
      // building — rather than leaving the next person to infer it from a
      // memory graph.
      console.log('  [Bob] ' + JSON.stringify(await bFrame.evaluate(() => ({
        pinned: window.GIFOS_FPS_QUALITY || null,
        note: ((document.getElementById('gate-note') || {}).textContent || '').slice(0, 90),
      })).catch((e) => ({ err: String(e.message).slice(0, 60) }))));
      while (Date.now() < startDl) {
        await bRun.bringToFront().catch(() => {});
        await stayPresent(bRun);
        await roomLine();
        if (await dismissSheet(bRun)) { await sleep(2000); continue; }
        for (const f of bRun.frames()) {
          if (f === bRun.mainFrame()) continue;
          await f.evaluate(() => { const g = document.getElementById('gate-go'); if (g && !g.disabled) g.click(); }).catch(() => {});
        }
        let running = null;
        for (const f of bRun.frames()) {
          if (f === bRun.mainFrame()) continue;
          const run = await f.evaluate(() =>
            !!(window.__FPS__ && window.__FPS__.engine && window.__FPS__.engine.time && window.__FPS__.engine.time.frame > 0)
          ).catch(() => false);
          if (run) { running = f; break; }
        }
        if (running) {
          // STARTED MEANS STILL STANDING. An acknowledgement's remount lands
          // SECONDS after the dismissal that caused it (measured: the engine
          // counted frames and the mount was then torn down before the
          // capability probe could run), so a mount only counts once it has
          // survived ten seconds of running. A casualty here just loops: the
          // successor mount gets found and pressed like any other.
          let stable = true;
          for (let k = 0; k < 5; k++) {
            await sleep(2000);
            if (running.isDetached()) { stable = false; break; }
          }
          if (stable) { bFrame = running; started = true; break; }
          continue;
        }
        await sleep(1500);
      }
      if (!started) {
        const seen = await bFrame.evaluate(() => ({
          fps: !!window.__FPS__,
          gate: !!document.getElementById('gate'),
          btn: (document.getElementById('gate-go') || {}).disabled,
          note: (document.getElementById('gate-note') || {}).textContent || '',
        })).catch((e) => ({ err: String(e.message).slice(0, 80) }));
        throw new Error('Bob: the phone never started the engine via autostart — ' + JSON.stringify(seen));
      }
    } else {
      bFrame = await ready(bRun, 'Bob', 240000);
      await play(bRun, bFrame);
    }

    // No bringToFront anywhere below. Each browser is alone on its box with
    // nothing to be backgrounded BY — that is what the fleet bought.
    //
    // BOTH CLOCKS START TOGETHER. Waiting on Alice and then on Bob spends
    // Alice's whole budget before Bob's begins, so the second peer is judged on
    // a stopwatch that has been running since before it was asked anything.
    // Measured: Alice reported false at 60 s and was demonstrably seeing Bob a
    // moment later — she goes on to spawn his body, shoot him and score the
    // kill. The first join into a freshly minted room over a real relay is the
    // slowest thing here, so it is given room and both are timed from the same
    // instant.
    // Before believing anything timed below, check the channel it is timed
    // through. See mustBeAbleToAnswer.
    // ALICE'S FRAME GOES STALE TOO, and only Bob's was ever re-found.
    //
    // findAppFrame exists because "an app-room guest's iframe is remounted
    // around serve/acknowledgement … a held handle reads 'Frame was detached'".
    // That is true of the HOST as well — serving the app to an arriving guest
    // remounts hers — and hers was captured once, before Play, and held for the
    // rest of the suite. A handle onto a replaced mount does not throw: it
    // answers, from a corpse, forever.
    //
    // Measured exactly that way (2026-08-17): `alice count=1 bodies=0` held for
    // 84 seconds while her OWN room line, on the same ticks, read parts=2 with
    // dc=open/connected. The transport was healthy, the roster was right, and
    // the app being asked was not the app that was running.
    //
    // So re-find hers the same way Bob's is found: the NEWEST frame with an
    // engine that is counting, falling back to what we already hold.
    const liveFrame = async (pg, prev) => {
      let best = prev;
      for (const f of pg.frames()) {
        if (f === pg.mainFrame()) continue;
        const st = await f.evaluate(() => ({
          ours: !!(window.__FPS__ || document.getElementById('gate-go')),
          run: !!(window.__FPS__ && window.__FPS__.engine && window.__FPS__.engine.time
                  && window.__FPS__.engine.time.frame > 0),
        })).catch(() => null);
        if (st && st.run) best = f;          // a counting engine wins outright
        else if (st && st.ours && best === prev) best = f;
      }
      return best || prev;
    };
    aFrame = await liveFrame(aRun, aFrame);
    let aMs = await mustBeAbleToAnswer(aFrame, 'Alice', boxes[0].host.name || boxes[0].host.ssh);
    let bMs = await mustBeAbleToAnswer(bFrame, 'Bob', BOB_CDP ? 'the phone at FPS_BOB_CDP' : (boxes[1].host.name || boxes[1].host.ssh));
    while ((aMs == null || bMs == null) && pool.length && !BOB_CDP) {
      const who = bMs == null ? 'Bob' : 'Alice';
      const next = pool.shift();
      console.log('  replacing ' + who + ' with ' + (next.name || next.ssh) + ' (' + pool.length + ' hosts left)');
      if (who === 'Bob') {
        try { await boxes[1].browser.close(); } catch (e) {}
        const extra = await openFleet([next], { args: fleetArgs, origin: BASE });
        boxes[1] = extra[0];
        const bCtx = await boxes[1].browser.newContext({ viewport: { width: 1100, height: 720 } });
        await bCtx.addInitScript({ content: setup('Bob', 'low') });
        bRun = await bCtx.newPage();
        bRun.on('pageerror', (e) => console.log('  [Bob app err] ' + e.message.slice(0, 200)));
        bRun.on('console', (m) => {
          const t = m.text();
          if (t.indexOf('[fpsperf]') === 0 || t.indexOf('[fps]') === 0) console.log('  [Bob ' + t.slice(0, 120) + ']');
        });
        await bRun.goto(shareUrl);
        bFrame = await ready(bRun, 'Bob', 240000);
        await play(bRun, bFrame);
        bMs = await mustBeAbleToAnswer(bFrame, 'Bob', boxes[1].host.name || boxes[1].host.ssh);
      } else {
        break;
      }
    }
    if (aMs == null || bMs == null) {
      console.log('NEEDS-FLEET — no pair of machines could answer while running this game.');
      console.log('0 PASSED, 0 FAILED — no verdict was reached, on purpose.');
      process.exit(3);
    }
    console.log('  both app frames answer in ' + aMs + ' / ' + bMs + ' ms — timings below mean something');

    // SAMPLED TOGETHER, AND PRINTED, because "alice=false" is not a finding.
    // Both peers are read on the same tick and every change is logged, so the
    // failure carries its own timeline: whether presence never crossed, crossed
    // slowly, or crossed and then FLAPPED — which is a live possibility here,
    // since a player unheard-from for STALE_MS (9 s) stops being drawn, and that
    // is a different bug from one that never arrives.
    let aSees = false, bSees = false, aFlap = false, bFlap = false;
    {
      const t0 = Date.now();
      let last = '';
      while (Date.now() - t0 < 180000) {
        // This window is exactly as long as the parked-phone timer, so the
        // player has to keep being present through it too — see stayPresent.
        if (BOB_CDP) await stayPresent(bRun);
        // …and a remount mid-window must not leave us reading a corpse for the
        // rest of it (see liveFrame above).
        aFrame = await liveFrame(aRun, aFrame);
        bFrame = await liveFrame(bRun, bFrame);
        const [a, b] = await Promise.all([aFrame, bFrame].map((f) => f.evaluate(() => ({
          c: window.Net ? window.Net.count() : -1,
          bod: window.Remote ? window.Remote.count() : -1,
        })).catch(() => ({ c: -1, bod: -1 }))));
        // THE TRANSPORT, NOT JUST THE SYMPTOM. App state moves only to peers
        // whose DataChannel is open (run.html sgaFan); everything else queues in
        // sgaPending and expires. So when a count stays at 1, the next question
        // is always "was there a channel to send it on?" — asked here rather
        // than reconstructed afterwards from a suite that only watched counts.
        const [ta, tb] = await Promise.all([aRun0, bRun].map((pg) => pg.evaluate(async () => {
          const V = window.__gifosVideo; if (!V) return 'no-hooks';
          const ids = (V.peerIds && V.peerIds()) || [];
          const out = [];
          for (const id of ids) {
            const ice = V.icePairFor ? await V.icePairFor(id).catch(() => null) : null;
            out.push(String(id).slice(0, 4) + ':dc=' + ((ice && ice.dc) || '?') + '/' + ((ice && ice.ice) || '?'));
          }
          const bp2 = V.beatPeekForTest ? V.beatPeekForTest() : null;
          return 'parts=' + (V.participants ? V.participants() : '?')
            + ' seated=' + (bp2 ? bp2.seated : '?')
            + ' pend=' + (V.sgaPendingForTest ? V.sgaPendingForTest() : 'n/a')
            + ' [' + out.join(' ') + ']';
        }).catch((e) => 'err:' + String(e.message).slice(0, 30))));
        const line = 'alice count=' + a.c + ' bodies=' + a.bod + '   bob count=' + b.c + ' bodies=' + b.bod
          + '\n           alice-net ' + ta + '\n           bob-net   ' + tb;
        if (line !== last) { console.log('    t=' + String(Math.round((Date.now() - t0) / 1000)).padStart(3) + 's  ' + line); last = line; }
        if (a.c >= 2) aSees = true; else if (aSees) aFlap = true;
        if (b.c >= 2) bSees = true; else if (bSees) bFlap = true;
        if (aSees && bSees) break;
        await sleep(3000);
      }
    }
    const roomState = async () => (await Promise.all([aFrame, bFrame].map((f) => f.evaluate(() => ({
      count: window.Net ? window.Net.count() : 'no Net',
      others: window.Net ? Object.keys(window.Net.others()) : [],
      me: window.Net && window.Net.me() ? window.Net.me().id : null,
    })).catch((e) => ({ err: String(e).slice(0, 60) }))))).map((r, i) => (i ? 'bob' : 'alice') + '=' + JSON.stringify(r)).join(' ');
    check('both peers see two players in the room', aSees && bSees,
      aSees && bSees ? 'alice=true bob=true' : await roomState());
    // A room that keeps forgetting people is not the same product as one that
    // is merely slow to introduce them, and the assertion above cannot tell
    // them apart on its own because it latches.
    check('...and neither peer then FORGETS the other', !aFlap && !bFlap,
      'alice dropped=' + aFlap + ' bob dropped=' + bFlap);

    // A BODY, not just a row: remote.js has to put something shootable in the
    // world, or the other player is a name on a scoreboard and nothing else.
    const [aBody, bBody] = await Promise.all([
      waitFor(aFrame, () => window.Remote && window.Remote.count() >= 1, 60000),
      waitFor(bFrame, () => window.Remote && window.Remote.count() >= 1, 60000),
    ]);
    check('each peer spawns a BODY for the other, in the world', aBody && bBody,
      'alice=' + aBody + ' bob=' + bBody);

    // THE SAME STREET. One shared seed, nothing sent — so if the world were
    // being built differently on two machines, two players would be taking
    // cover behind buildings the other cannot see.
    //
    // COMPARED ON THE BUILDINGS, and asserted to be non-empty first. The first
    // version of this read `spawnPoints[i].x`, and a spawn point is
    // `{position, yaw, tag}` — so every coordinate came out `NaN`, both sides
    // produced the identical string of NaNs, and it PASSED while comparing
    // nothing at all. Spawn points were the wrong thing to read anyway: they
    // are a fixed table run through the level transform, so they would match
    // even if the two clients had seeded different worlds. The buildings are
    // what the RNG actually places, which is what "same cover" means.
    const worldOf = (f) => f.evaluate(() => {
      const w = window.__FPS__.ctx.peek('world');
      const out = [];
      const walk = (v, d) => {
        if (out.length > 600 || d > 4) return;
        if (typeof v === 'number') { if (Number.isFinite(v)) out.push(Math.round(v * 100)); return; }
        if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) walk(v[i], d + 1); return; }
        if (v && typeof v === 'object') { const k = Object.keys(v).sort(); for (let i = 0; i < k.length; i++) walk(v[k[i]], d + 1); }
      };
      walk((w && w.buildings) || [], 0);
      return out.join(',');
    });
    const aWorld = await worldOf(aFrame), bWorld = await worldOf(bFrame);
    check('the street is real geometry to compare, not an empty read',
      aWorld.length > 50, aWorld.length + ' numbers');
    check('two different machines built the SAME street from the shared seed',
      !!aWorld && aWorld === bWorld, aWorld.slice(0, 60) + '…');

    /* ---- a hit crosses the wire and is paid ---- */
    const bobHealthBefore = await bFrame.evaluate(() => {
      const p = window.__FPS__ && window.__FPS__.player;
      return p && p.health ? p.health.value : null;
    });
    check('Bob has a readable health value to lose', typeof bobHealthBefore === 'number', String(bobHealthBefore));

    const claimed = await aFrame.evaluate(() => {
      const others = window.Net.others();
      const id = Object.keys(others)[0];
      if (!id) return null;
      window.Net.claimHit(id, 35, false, others[id].spawn);
      return id;
    });
    check('Alice can address a claim to Bob', !!claimed);

    const paid = await waitFor(bFrame, (before) => {
      const p = window.__FPS__ && window.__FPS__.player;
      return !!(p && p.health && p.health.value < before);
    }, 30000, bobHealthBefore);
    const bobHealthAfter = await bFrame.evaluate(() => {
      const p = window.__FPS__ && window.__FPS__.player;
      return p && p.health ? p.health.value : null;
    });
    check('the hit crosses the wire and the target pays for it',
      paid, bobHealthBefore + ' -> ' + bobHealthAfter);

    // Dedupe: a row is re-delivered on every unrelated change, so the SAME claim
    // must never be paid twice. Alice publishes repeatedly without claiming
    // again.
    //
    // Asserted on the CLAIM COUNTER, not on health: health regenerates, so a
    // duplicate hit is masked within a few seconds, and a health-based check
    // here would pass whether the dedupe worked or not. That is the shape of a
    // guard that guards nothing — this suite already shipped one by accident.
    const claimsBefore = await bFrame.evaluate(() => window.Net.appliedTotal());
    await aFrame.evaluate(() => { for (let i = 0; i < 6; i++) window.Net.publish(true); });
    await sleep(4000);
    const claimsAfter = await bFrame.evaluate(() => window.Net.appliedTotal());
    check('Bob accepted the claim exactly once', claimsBefore === 1, 'accepted ' + claimsBefore);
    check('six redeliveries of the same row land it no further times',
      claimsAfter === claimsBefore, claimsBefore + ' -> ' + claimsAfter);

    /* ---- YOU CAN ACTUALLY KILL SOMEONE ---- */
    // Everything above stops at a health bar going down. This is the thing the
    // game is for, and the whole chain is here: enough damage kills Bob, Bob
    // concedes the death on his OWN row (nobody writes to anybody else's), the
    // kill is credited BY ID to Alice — not by matching the killer's NAME, which
    // credited the wrong player in any room where two people had the same one,
    // and the default name for someone who never set one is "Player" — and Bob
    // comes back somewhere else with a new life that the old claims cannot
    // follow him into.
    const feetOf = (f) => f.evaluate(() => {
      const p = window.__FPS__.player;
      return p && p.feetPosition ? [p.feetPosition.x, p.feetPosition.z] : null;
    });
    const bobSpawnBefore = await feetOf(bFrame);

    await aFrame.evaluate(() => {
      const others = window.Net.others();
      const id = Object.keys(others)[0];
      // Enough to be fatal from full health regardless of what the 35 above
      // has already regenerated. One claim, one sequence number.
      window.Net.claimHit(id, 400, true, others[id].spawn);
    });

    const bobDied = await waitFor(bFrame, () => {
      const rows = window.Net.roster().filter((r) => r.me);
      return rows.length === 1 && rows[0].d >= 1;
    }, 30000);
    const bobDeaths = await bFrame.evaluate(() => (window.Net.roster().find((r) => r.me) || {}).d);
    check('enough damage KILLS the target', bobDied, 'bob deaths=' + bobDeaths);

    const aliceScored = await waitFor(aFrame, () => {
      const mine = window.Net.roster().find((r) => r.me);
      return !!mine && mine.k >= 1;
    }, 30000);
    const roster = await aFrame.evaluate(() => window.Net.roster().map((r) => r.name + ' k=' + r.k + ' d=' + r.d + (r.me ? ' (me)' : '')).join(' | '));
    check('the kill is scored to the player who fired it, on the scoreboard', aliceScored, roster);

    check('and it is scored to exactly ONE player',
      await aFrame.evaluate(() => window.Net.roster().reduce((n, r) => n + (r.k > 0 ? 1 : 0), 0)) === 1, roster);

    // ASKED OF THE APP, NOT INFERRED FROM A NUMBER. "Alive" is a thing this app
    // decides and publishes (doRespawn clears `dead` and pushes it); health is a
    // value that is restored around the same moment and regenerates besides, so
    // reading health raced the respawn and reported a corpse that had already
    // stood up somewhere else.
    const respawned = await waitFor(bFrame, () => {
      const mine = window.Net.roster().find((r) => r.me);
      return !!(mine && mine.alive);
    }, 60000);
    const respawnHp = await bFrame.evaluate(() => {
      const p = window.__FPS__ && window.__FPS__.player;
      return p && p.health ? p.health.value : null;
    }).catch(() => null);
    const bobSpawnAfter = await feetOf(bFrame);
    check('the target respawns, alive again', respawned, 'health ' + respawnHp);
    check('...somewhere else, not on the spot it died',
      !!bobSpawnBefore && !!bobSpawnAfter &&
      (Math.abs(bobSpawnBefore[0] - bobSpawnAfter[0]) + Math.abs(bobSpawnBefore[1] - bobSpawnAfter[1])) > 1,
      JSON.stringify(bobSpawnBefore) + ' -> ' + JSON.stringify(bobSpawnAfter));

    // A claim fired at the life Bob was wearing before he respawned must not
    // follow him into the new one — the spawn counter on the claim is what
    // stops it, and without it a burst fired as someone died would kill them
    // again the instant they came back.
    const afterRespawnHealth = await bFrame.evaluate(() => window.__FPS__.player.health.value);
    await aFrame.evaluate((stale) => {
      const others = window.Net.others();
      const id = Object.keys(others)[0];
      window.Net.claimHit(id, 400, false, stale);
    }, await aFrame.evaluate(() => { const o = window.Net.others(); const id = Object.keys(o)[0]; return o[id].spawn - 1; }));
    await sleep(4000);
    const stillAlive = await bFrame.evaluate(() => window.__FPS__.player.health.value);
    check('a claim against the PREVIOUS life does not follow the target into the new one',
      stillAlive > 0 && stillAlive >= afterRespawnHealth - 1,
      afterRespawnHealth + ' -> ' + stillAlive);

    /* ---- the garrison rule, in the join order that actually happens ---- */
    // Alone you fight AI soldiers; in a room they stand down, because they are
    // generated per client from a local RNG and stand in different places for
    // each player — one person shooting at something nobody else can see.
    //
    // ASSERTED ON THE HOST, WHICH IS THE HARD CASE AND THE COMMON ONE. Alice
    // above did exactly what a person does: played solo, then invited a friend.
    // She therefore booted ALONE and got a garrison, while Bob booted into a
    // room and got none. Deciding this once at boot is right for Bob and wrong
    // for Alice, and it is Alice who is doing the inviting — so the soldiers
    // have to leave when the room fills, not merely fail to arrive.
    const garrison = await Promise.all([aFrame, bFrame].map((f) => f.evaluate(() => ({
      soldiers: window.Remote.garrison(), bodies: window.Remote.count(),
    }))));
    check('in a room the garrison stands down — for the HOST too, who booted alone',
      garrison.every((g) => g.soldiers === 0),
      garrison.map((g, i) => (i ? 'bob' : 'alice') + ': ' + g.soldiers + ' soldiers, '
        + g.bodies + ' player bodies').join('  '));

    await aCtx.close();
    // The phone's Chrome is Nathan's, not ours: close the page and detach,
    // never the browser's own state.
    if (BOB_CDP) { await bRun.close().catch(() => {}); }
    else { await bRun.context().close(); }
  } finally {
    if (bobBrowser) await bobBrowser.close().catch(() => {});
    await closeFleet(boxes);
  }
}

// FPS_HALF — WHICH HALF, and the one reason it exists.
//
// Default is both, and the battery must keep running both: a half nobody runs
// is a guard nobody has. But the two halves want opposite things from the box
// they are STARTED on. Solo launches a browser locally, so it wants a machine
// that can run one. The deathmatch launches NO local browser at all — it drives
// Alice on a fleet box and Bob on a phone over CDP — and it wants a driver that
// is neither of the players, because a third browser on a player's box is the
// contention test/lib/fleet.js exists to abolish.
//
// Here that leaves exactly one shape. The orchestrator is the only machine that
// is not a player, and it is the one machine that must never run a browser
// (CLAUDE.md: it hard-hung once). Every other candidate is either a player or
// too slow to build a world at all. So the deathmatch is startable from the
// orchestrator only with the solo half not running — hence this switch, and
// hence its default is 'both'.
const HALF = (process.env.FPS_HALF || 'both').toLowerCase();
if (['both', 'solo', 'deathmatch'].indexOf(HALF) < 0) {
  console.log('FPS_HALF must be both | solo | deathmatch (got ' + JSON.stringify(HALF) + ')');
  process.exit(2);
}

(async () => {
  if (HALF !== 'deathmatch') await solo();
  // A PRODUCT FAILURE OUTRANKS "I NEED MACHINES". If the solo half is red the
  // app is broken here, on this box, and saying NEEDS-FLEET instead would hide
  // it behind a hardware request.
  if (failures) {
    console.log('\nFAILURES: ' + failures + '  (solo half — not running the deathmatch half on top of a broken boot)');
    process.exit(1);
  }
  if (HALF === 'solo') {
    console.log('\nSOLO HALF ONLY (FPS_HALF=solo) — the deathmatch did NOT run and this is not a full verdict.');
    console.log(failures ? '\nFAILURES: ' + failures : '\nall green (solo half)');
    process.exit(failures ? 1 : 0);
  }
  if (HALF === 'deathmatch') console.log('DEATHMATCH HALF ONLY (FPS_HALF=deathmatch) — the solo half did NOT run.');
  await deathmatch();
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
