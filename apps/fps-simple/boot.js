/*
 * FPS Simple — boot, and the GifOS side of the game.
 *
 * This is our entry point. Upstream's src/main.js is NOT used: it has top-level
 * await (which cannot be built as a classic script, and GifOS strips
 * type="module" when it inlines a <script src> into the app frame) and it is
 * half capture-harness — ?capture, ?lockstep, window.__PUMP__ — none of which
 * means anything inside a GIF.
 *
 * Everything the app needs beyond "start the engine" lives here: the loading
 * gate, quality that suits the device, settings kept in gifos.db, and the
 * deathmatch rules layered on top of a game that had no idea other people
 * existed.
 */
(function (root) {
  'use strict';

  // One world, one seed. Upstream builds the entire market street procedurally
  // from the engine RNG, so every player who seeds it the same way stands in the
  // same street with the same buildings, props and cover — with nothing sent
  // over the wire to arrange it. That is the whole map-sharing problem, solved by
  // a constant. (Multiple maps = publish this in the room. One is enough today.)
  var WORLD_SEED = 0x0f9a51de;

  // Stamped onto a saved quality, so a choice made against another build of the
  // game is not mistaken for a judgement about this one.
  var APP_VERSION = '0.9.1';

  var RESPAWN_MS = 3200;

  // How long a bullet stays responsible for you. Death is reported by the
  // engine as one event with no cause, so the killer is whoever shot you most
  // recently — which without a window means the player who winged you at the
  // start of a life is credited when you walk off a roof three minutes later.
  var KILL_CREDIT_MS = 8000;

  var engine = null, ctx = null, player = null, ui = null, touch = null;
  var db = null, prefs = { quality: null, sensitivity: null, invertY: null, fov: null };
  var spawnSeq = 1, dead = false, respawnAt = 0;
  // Who last shot us, BY ID. Matching the killer back by name (which this did)
  // credits the wrong player whenever two people share one — and the default
  // name for someone who never set one is "Player", so an unnamed room credited
  // every kill to whichever unnamed player the roster happened to iterate first,
  // and credited nobody at all once the killer's row went stale.
  var killedBy = '', killedById = null, killedByHs = false, killedAt = 0;
  var deaths = 0;
  var garrisonRetired = false;
  // MODULE SCOPE, BOTH OF THEM, AND FOR THE SAME REASON TWICE OVER. boot's
  // promise chain is several separate callbacks: a `var` declared in one of
  // them is invisible in the next, and referencing it there throws a
  // ReferenceError that the chain's .catch turns into fatal() — which REMOVES
  // THE PLAY BUTTON. The world builds, the bar fills, and then the game deletes
  // its own door. That shipped twice (useCache, then auto) and neither was
  // caught by a test that only asked whether Play lit up, because it lit up and
  // then went away a moment later.
  // `auto` is the device's measured ceilings; `useCache` is read by
  // materialSystemFor(), which lives out here too.
  var auto = null;
  var useCache = true;
  // WHAT CAME BACK FROM THE CACHE, so the gate can say so. A reload used to
  // narrate "Building the street…" word for word identically to a first run,
  // which reads as "it saved nothing" — reported as exactly that. It is not
  // true and it is not false: the SURFACES and some models are restored, the
  // street itself is rebuilt from its seed every launch (the world is 61.6 MB
  // and deliberately not cached). So say that, rather than either lie.
  var restored = { tex: 0, mesh: 0 };
  // A FACT ABOUT THE HARDWARE, not a hint about styling. `(pointer: coarse)`
  // is a media query browsers answer for layout, and it matched in a headless
  // desktop — which then lost the pointer lock, because fullscreen releases it.
  // "IS THIS PERSON POINTING WITH A THUMB?" — NOT "does this screen accept a
  // finger?". Those are different questions, and asking the second one broke
  // the first ability this app has: aiming.
  //
  // `maxTouchPoints > 0` is true of every touchscreen LAPTOP, every 2-in-1 and
  // every touchscreen Chromebook — machines whose owner is holding a mouse.
  // On those this flag skipped the pointer-lock request at Play (so mouselook
  // never engaged: the cursor ran to the edge of the window and aiming "went
  // in and out of working"), forced a landscape fullscreen nobody asked for,
  // and laid the thumb HUD over a desktop. Reported on a touchscreen
  // Chromebook, 2026-08-17.
  //
  // BOTH SIGNALS, because each one alone has been WRONG here in production:
  //
  //   * `maxTouchPoints > 0` alone — what shipped — is true of every
  //     touchscreen laptop and Chromebook, and took the phone path on them.
  //   * `(pointer: coarse)` alone was tried and REVERTED for a real reason,
  //     recorded at the Play handler below: the media query is something
  //     browsers answer for LAYOUT, and it matched in a headless desktop
  //     context, which is not a statement about the hardware.
  //
  // So require the hardware AND the intent: a touch digitiser exists, and the
  // primary pointer really is coarse. That is exactly "the person is pointing
  // with a thumb", and it is right in all four corners — phone (true), a
  // touchscreen laptop (false: fine primary), the headless desktop that fooled
  // the media query (false: no digitiser), plain desktop (false).
  //
  // A hybrid therefore gets the DESKTOP contract — lock the pointer, leave the
  // window alone — and loses nothing: touch.js reveals the thumb controls on
  // the first real touchstart and sheds the lock in the same breath, so a
  // finger on a touchscreen laptop still works, and only once there is one.
  var COARSE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  var IS_TOUCH = (navigator.maxTouchPoints || 0) > 0 && COARSE;
  var gate = document.getElementById('gate');
  var bar = document.getElementById('gate-bar');
  var note = document.getElementById('gate-note');
  var go = document.getElementById('gate-go');
  var demoBtn = document.getElementById('gate-demo');

  // Phones cannot be driven by a debugger here (CDP is a wall on this device),
  // so every phase stamps a line the console — and therefore adb logcat — can
  // read. This is the only way the goal's numbers are checkable on the target.
  var T0 = (root.performance && performance.now) ? performance.now() : Date.now();
  var perfMarks = [];
  function stamp(what) {
    var ms = ((root.performance && performance.now) ? performance.now() : Date.now()) - T0;
    perfMarks.push(what + '=' + Math.round(ms));
    try { console.info('[fpsperf] ' + what + ' ' + Math.round(ms) + 'ms'); } catch (e) {}
    publishPerf('');            // incrementally: a slow device must be readable BEFORE it finishes
    return ms;
  }
  // A phone cannot be attached to a debugger here and stable Chrome does not
  // put console lines in logcat, so the numbers are written where something
  // outside can read them: the app's own private store.
  function publishPerf(extra) {
    if (!root.gifos || !root.gifos.db) return;
    try {
      root.gifos.db('perf').put({ id: 'last', at: Date.now(),
        marks: perfMarks.join(' '), ua: navigator.userAgent.slice(0, 80),
        note: extra || '' }).catch(function () {});
    } catch (e) {}
  }

  // The cache line of the perf note, so it can be published more than once —
  // once at READY and again after the flush resolves.
  function cacheNote() {
    try {
      return ' tex=' + JSON.stringify(root.TexCache.stats())
           + ' mesh=' + JSON.stringify(root.MeshCache.stats());
    } catch (e) { return ''; }
  }

  function say(text, pct) {
    if (text != null) note.textContent = text;
    if (pct != null) bar.style.width = Math.round(pct * 100) + '%';
  }

  /* ---- a bar that actually moves ---------------------------------------- */
  // "Building the world…" sat at 15% for the better part of a minute and then
  // jumped. On a slow device that is indistinguishable from a hang, and it is
  // the first thing anybody sees. The engine gives no progress callback for
  // init(), but it does init its systems one after another, so wrapping each
  // one turns "something is happening" into a bar with real numbers behind it.
  //
  // The weights are MEASURED, not guessed — from the engine's own
  // `[engine] <id> init <ms>` on the slowest device to hand — because a bar
  // that advances evenly across wildly uneven work is its own kind of lie: it
  // would crawl through the world and then leap through the last four systems.
  var INIT_W = { render: 2, materials: 2, sky: 4, world: 10, weapons: 5, fx: 1, ai: 13, ui: 0.5, netplay: 0.5 };
  var BAKE_W = 20;                 // the material bakes, which happen inside world init
  var BAKES_EXPECTED = 17;
  var initTotal = BAKE_W; for (var _k in INIT_W) initTotal += INIT_W[_k];
  var initDone = 0;

  // Boot is two long phases; this is the first 55% of the bar and prewarm owns
  // the rest, which is why the numbers here stop at 0.55.
  function initStep(w) {
    initDone += w;
    say(null, 0.05 + 0.5 * Math.min(1, initDone / initTotal));
  }

  // Wrap a system class so finishing it moves the bar. Statics (id, deps) are
  // inherited, which is what the engine's registry reads.
  function tracked(Base) {
    if (!Base) return Base;
    var w = INIT_W[Base.id] != null ? INIT_W[Base.id] : 1;
    var id = Base.id || 'sys';
    try {
      return class extends Base {
        init(ctx) {
          var r = super.init(ctx);
          var done = function (v) { initStep(w); stamp('sys:' + id); return v; };
          return (r && typeof r.then === 'function') ? r.then(done) : done(r);
        }
      };
    } catch (e) { return Base; }
  }

  function fatal(text) {
    say('', 1);
    note.innerHTML = '<b style="color:#e08b7a">' + text + '</b>';
    go.remove();
  }

  /* ------------------------------------------------------------------ */
  /* settings                                                           */
  /* ------------------------------------------------------------------ */

  // WHAT THIS DEVICE CAN ACTUALLY CARRY, MEASURED — because guessing was wrong
  // on both of the devices that matter most, in opposite directions.
  //
  // The old picker read navigator.hardwareConcurrency and whether the pointer
  // was coarse. Neither of those is a GPU. A ChromeOS Linux container has no
  // /dev/dri at all, so every pixel is SwiftShader on the CPU — but it reports
  // 4 cores and a mouse, so it was handed 'medium': 280 SECONDS to reach the
  // Play button (205 s of it building the world) and then 0.9 fps, which is
  // 2.2 seconds a frame. A Moto g24 reports EIGHT cores and a touchscreen, so
  // it was handed 'medium' too, on a Mali-G52 MC2.
  //
  // So ask the device instead, in about 150 ms, before a single building
  // exists. Two questions: what the driver CALLS itself — decisive when the
  // answer is a software rasteriser, because no amount of CPU makes one
  // playable — and then what it actually DOES, timed, because a driver string
  // is a name and not a speed. The gap is not subtle: SwiftShader measures
  // 0.011 against the Mali's 1.02, a hundredfold, so this cannot confuse them.
  //
  // The measurement is adaptive, so it costs about the same on a workstation as
  // on a phone: one pass, then double until the batch is long enough to time
  // honestly, stopping early when it already is.
  var SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|virgl|swrast|mesa offscreen|basic render|microsoft basic|software/i;

  function probeGpu() {
    var out = { ok: false, renderer: '', software: false, score: 0 };
    var gl = null, canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    try {
      gl = canvas.getContext('webgl2', { antialias: false, depth: false, alpha: false,
                                         powerPreference: 'high-performance' });
    } catch (e) {}
    if (!gl) return out;
    out.ok = true;
    try {
      var dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) out.renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
      if (!out.renderer) out.renderer = String(gl.getParameter(gl.RENDERER) || '');
    } catch (e) {}
    out.software = SOFTWARE_RE.test(out.renderer);
    try {
      // ALU-bound on purpose: a trivial shader measures driver overhead, and
      // overhead is not what decides whether a frame lands in 16 ms.
      var vs = '#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}';
      var fs = '#version 300 es\nprecision highp float;out vec4 o;uniform float u;'
             + 'void main(){vec2 p=gl_FragCoord.xy*0.01;float a=0.0;'
             + 'for(int i=0;i<64;i++){a+=sin(p.x*float(i)+u)*cos(p.y*float(i)-u);}'
             + 'o=vec4(vec3(a*0.01+0.5),1.0);}';
      var mk = function (t, src) { var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
      var prog = gl.createProgram();
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return out;
      gl.useProgram(prog);
      var uloc = gl.getUniformLocation(prog, 'u');
      gl.bindVertexArray(gl.createVertexArray());
      var px = new Uint8Array(4);
      var batch = function (n) {
        for (var i = 0; i < n; i++) { gl.uniform1f(uloc, i * 0.13); gl.drawArrays(gl.TRIANGLES, 0, 3); }
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // make the GPU finish
      };
      var t0 = (performance && performance.now) ? performance.now() : Date.now();
      batch(1);                                    // warm the pipeline; never timed
      var passes = 1, ms = 0;
      for (;;) {
        var s = performance.now();
        batch(passes);
        ms = performance.now() - s;
        if (ms >= 8 || passes >= 512 || performance.now() - t0 > 400) break;
        passes *= 2;
      }
      // BEST OF THREE, NOT ONE. The same machine measured 0.001, 0.24 and 1.76
      // across runs — a factor of 1700 — because a box doing something else
      // makes a fast device look slow, never the reverse. Contention can only
      // ADD time, so the quickest batch is the closest to the truth and the
      // median of noise is still noise. Cheap: the batch is sized to ~8 ms.
      var best = ms;
      for (var r = 0; r < 2 && performance.now() - t0 < 600; r++) {
        var s2 = performance.now();
        batch(passes);
        var m2 = performance.now() - s2;
        if (m2 < best) best = m2;
      }
      out.score = (passes * 256 * 256 / 1e6) / best * 1000;
      out.ms = Math.round(best);
    } catch (e) { /* a probe that throws must not stop the game starting */ }
    // Hand the context back rather than leaving it against the browser's limit.
    try { var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) {}
    return out;
  }

  // The settings a device gets before anybody has chosen anything. The rule is
  // NO LAG, not maximum fidelity: a player who wants it prettier can say so in
  // the pause menu and it is remembered, but nobody should have to discover the
  // pause menu to get a game that runs.
  //
  // renderScale is the lever that matters once the preset is picked — the
  // render target is width * pixelRatio * renderScale, so it is quadratic in
  // exactly the fill rate a software rasteriser does not have.
  function pickSettings() {
    var p = probeGpu();
    var s = { quality: 'medium', renderScale: null, probe: p };
    if (!p.ok) { s.quality = 'low'; s.renderScale = 0.5; return s; }
    // The driver string decides FIRST and cannot be overruled by the number. A
    // software rasteriser that happens to time well on one lucky batch is still
    // a software rasteriser, and a score is the noisier of the two signals.
    // NOBODY IS GRADED BY A SYNTHETIC SCORE ANY MORE.
    //
    // This used to run an ALU-heavy shader and map its throughput onto quality
    // tiers. It does not work, and the way it failed is instructive: a phone
    // was rated HIGH. The number measures arithmetic in a fragment shader; the
    // thing that decides whether this game runs is 1.7 million triangles across
    // 212 draw calls with shadow passes on top. Those are not the same
    // question, so no threshold over that number is ever going to be right —
    // and every attempt to pick one has been wrong, in both directions.
    //
    // So: EVERY device starts cheap, and the real frame clock decides from
    // there (see AutoScale). Starting low costs a fast machine about a second
    // of softness before it ramps up. Starting high costs a slow one the entire
    // session, which is what has been happening.
    //
    // The probe is kept for the ONE thing a driver string answers honestly —
    // whether there is a graphics chip at all — because that sets the floor to
    // start from, and it is worth saying out loud on the gate.
    if (p.software || !p.ok) {
      s.quality = 'low'; s.renderScale = 0.25; s.texCap = 128;
      s.q = { cascades: 1, shadowMapSize: 256, shadowDistance: 18,
              particleBudget: 120, decalBudget: 8, bloom: false,
              taa: false, gtao: false, ssr: false, volumetrics: false,
              motionBlur: false, anisotropy: 1,
              // Reachable only because vendor.mjs patches them into config.q.
              // ALL THREE CAMO SETS, SMALLER. Cutting the list to one broke the
              // agents that ask for the others — "[ai] unknown material set
              // camo_woodland" — and the saving was never in the count anyway.
              // Size is quadratic: three sets at 128px cost less than one at
              // 512 did, so the variants keep their own camo and the 8.4s that
              // started this is still gone.
              aiTexSize: 128, weapons: ['rifle'], fxAtlas: 256,
              // See vendor.mjs: the Web Audio render thread falls off a cliff at
              // 2000-4000 node constructions a second and does not recover. This
              // device gets the tightest cap.
              voiceRate: 12, soundBudgetWindow: 1 / 20,
              // And when the context wedges anyway — measured: once its render
              // clock slips below real time the speakers go SILENT, not quiet,
              // and it never recovers unaided — the engine's watchdog kicks it
              // back to life (see the audioHeal patch in vendor.mjs).
              audioHeal: true,
              // A ten-minute game got worse the longer it ran: 1/120 s with up
              // to eight substeps means a slow frame earns MORE physics, which
              // slows the next one. Measured f:physics 0.61 ms/frame at two
              // minutes, 9.05 at four. A wider step this device can keep up
              // with breaks the loop.
              fixedStep: 1 / 60, maxSubsteps: 3,
              // The HUD floors at 62% of a 1080p layout; on a phone that is
              // unreadable. Never smaller than the design size here.
              hudMinScale: 1.0 };
    } else {
      s.quality = 'low'; s.renderScale = 0.5; s.texCap = 128;
      // 8.4 s of a 21 s first load on a Moto g24 was this: three camo sets baked
      // at 512 px. One set at 192 px is a soldier who looks the same at the
      // distance anyone ever sees one, for a fraction of the wait.
      // SHADOWS OFF ON A PHONE, and it is not a taste decision. The cascade is
      // a second full pass over the street, and this device spends ~140 ms of
      // every 203 ms frame on the GPU with the render scale already at its
      // floor — so the cost is geometry, and the cascade is the one pass that
      // can be removed outright rather than made smaller.
      // drawDistance is NOT set here, and that is a correction. 110 m bought 96 ms ->
      // 84 ms and wrecked the picture: the sky dome sits far beyond it, so it was
      // clipped to BLACK, and the ground ran to a far plane close enough that the
      // distance haze washed the whole lower half of the screen to flat fog. That
      // is the "entire bottom half is blacked/faded/clouded out" reported from a
      // real-GPU desktop, which takes this branch; a software rasteriser takes
      // the branch below and never had it. 12% of a frame is not worth the game
      // not looking like the game.
      s.q = { shadows: false, prepass: false, pixelRatio: 1, cascades: 1, shadowMapSize: 512, shadowDistance: 40, bloom: false,
              taa: false, gtao: false, ssr: false, volumetrics: false, motionBlur: false,
              aiTexSize: 192,
              // Two of three viewmodels: 1/2 still swaps, and the smg's 4.4 s
              // share of the boot is not worth making everyone wait for.
              weapons: ['rifle', 'pistol'], fxAtlas: 256,
              // NOT a phone-only number. The sound cutting in and out was
              // reported on a desktop first, and measured worse there: the
              // budgets it replaces were per FRAME, so a machine at 200 fps
              // admitted three times the audio work of one at 60. Capped at 20
              // voices a second, a held trigger goes from an irreversible
              // collapse to dips that recover (measured at 25: stolen 1379 -> 6,
              // dropped 741 -> 0).
              voiceRate: 20, soundBudgetWindow: 1 / 30,
              // The cap softens the collapse but cannot prevent it, and it was
              // measured to be neither the cause nor the cure: with it removed
              // the same session went from a 7.9 s render-clock deficit to a
              // 30.5 s one and not one fire window reached the speakers. What
              // brings the sound back is the watchdog (audioHeal in
              // vendor.mjs): a wedged context is cycled, a re-wedged one is
              // rebuilt on a fresh context. Both kicks were proven on a
              // microphone physically listening to the speakers.
              audioHeal: true,
              fixedStep: 1 / 60, maxSubsteps: 3, hudMinScale: 1.0 };
    }
    return s;
  }

  // SAY WHAT WAS FOUND AND WHAT IS BEING BUILT FROM IT.
  //
  // The app measures the device and then quietly acts on it, which from the
  // outside is indistinguishable from not measuring at all: the gate said
  // "Building the world…" for minutes and never mentioned that it had looked,
  // what it saw, or why it chose what it chose. A player watching a slow bar
  // deserves to know the machine was asked.
  function describeDevice(a) {
    if (!a || !a.probe) return '';
    var p = a.probe;
    var scale = a.renderScale ? Math.round(a.renderScale * 100) + '%' : 'full';
    if (!p.ok) return 'Could not measure this device — building at ' + a.quality.toUpperCase() + '.';
    if (p.software) {
      return 'No graphics chip found — this device draws every pixel on the processor. '
        + 'Building a ' + a.quality.toUpperCase() + '-detail street at ' + scale + ' resolution.';
    }
    var name = (p.renderer.match(/\(([^,()]+),\s*([^,()]+)/) || [])[2] || p.renderer || 'a graphics chip';
    // No number here on purpose: the benchmark reported 1.02 and then 1198 for
    // the SAME phone, so putting it in front of a player would be showing them
    // noise dressed as a measurement. It no longer decides anything either —
    // the frame clock does — and it stays in the console for calibration only.
    return 'Graphics: ' + name.trim() + ' — building a ' + a.quality.toUpperCase()
      + '-detail street at ' + scale + ' resolution.';
  }

  var deviceEl = null;
  function showDevice(a) {
    var text = describeDevice(a);
    if (!text) return;
    if (!deviceEl) {
      deviceEl = document.createElement('div');
      deviceEl.id = 'gate-device';
      var load = document.getElementById('gate-load');
      if (load && load.parentNode) load.parentNode.insertBefore(deviceEl, load);
      else document.querySelector('.gate-box').appendChild(deviceEl);
    }
    deviceEl.textContent = text;
  }

  // THE OTHER QUADRATIC, and on a slow device it is the expensive one.
  //
  // Every surface in the street is a texture generated on the device at boot.
  // Measured on a GPU-less container: seventeen of them cost 45 SECONDS, and
  // the engine's own camo maps another 12 — 59 s of the 134 s it took to reach
  // the Play button, more than the world's geometry, the physics, the weapons
  // and the visual effects put together.
  //
  // The engine already halves texture size at 'low' (its _quality is 0.5, so a
  // 1024 map bakes at 512), and there is no tier below 'low' to ask for. So cap
  // the size instead: _size() is the one place every bake asks how big to be,
  // and a subclass is the seam that needs no fork of the engine. Baking is
  // quadratic in this, so 512 -> 256 is four times less work.
  //
  // It costs sharpness on surfaces that, on this class of device, are already
  // being rendered at a third of the screen's resolution and upscaled.
  function materialSystemFor(cap) {
    if (!root.COD.MaterialSystem) return root.COD.MaterialSystem;
    try {
      return class extends root.COD.MaterialSystem {
        _size(want) {
          var n = super._size(want);
          return cap ? Math.max(128, Math.min(n, cap)) : n;
        }
        // Seventeen of these run back to back inside world init, and they are
        // the longest unbroken stretch of the whole boot. Report each one.
        getTextureSet(name, opts) {
          // Wrapped here, not in init(): the forge is lazy, and by the time a
          // texture is asked for it exists. Idempotent per forge.
          if (useCache) { try { root.TexCache.wrap(this); } catch (e) {} }
          var set = super.getTextureSet(name, opts);
          initStep(BAKE_W / BAKES_EXPECTED);
          return set;
        }
      };
    } catch (e) { return root.COD.MaterialSystem; }
  }

  // A SAVED QUALITY IS ONLY THE PLAYER'S CHOICE IF THE PLAYER CHOSE IT.
  //
  // savePrefs() runs on sensitivity, field of view and every other setting, so
  // it was writing the CURRENT quality as a side effect of nudging the mouse
  // speed. That pinned quality to whatever happened to be active — 'medium' on
  // a machine with no graphics chip — and a pinned quality outranks the device
  // probe by design, so the probe would never run again on that device. The
  // symptom is the worst kind: an update that measurably changes nothing,
  // because the thing it fixed is being overridden by a preference the player
  // never knowingly set.
  //
  // So the choice is recorded explicitly, and it is stamped with the version
  // that made it: a quality chosen against a different build of the game is not
  // a judgement about this one.
  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    db = root.gifos.db('prefs');
    return db.get('settings').then(function (rec) {
      if (!rec) return;
      prefs = { quality: null, sensitivity: rec.sensitivity, invertY: rec.invertY, fov: rec.fov };
      if (rec.qualityChosen && rec.qualityFor === APP_VERSION) prefs.quality = rec.quality;
    }).catch(function () {});
  }

  var qualityChosen = false;
  function savePrefs() {
    if (!db || !ctx) return;
    var c = ctx.config;
    db.put({ id: 'settings',
      quality: c.quality, qualityChosen: qualityChosen, qualityFor: APP_VERSION,
      sensitivity: c.sensitivity, invertY: !!c.invertY, fov: c.fov })
      .catch(function () {});
  }
  // Only this one means "I picked a quality".
  function chooseQuality() { qualityChosen = true; savePrefs(); }

  /* ------------------------------------------------------------------ */
  /* the netplay system                                                 */
  /* ------------------------------------------------------------------ */

  // Registered like any other subsystem so it rides the engine's own loop and
  // ordering rather than a second timer racing it.
  function NetplaySystem() {}
  NetplaySystem.id = 'netplay';
  NetplaySystem.deps = ['player', 'ai'];
  NetplaySystem.prototype.init = function (context) {
    root.Remote.init(context);
    root.Net.onHit(onIncomingHit);
    root.Net.onKill(onScoredKill);
    root.Net.onRoster(renderScore);
    context.events.on('player:death', onDeath);
  };
  NetplaySystem.prototype.update = function (dt, context) {
    autoScaleTick(dt);
    if (touch) touch.tick();
    hudFeed(context);
    if (!root.Net.live()) return;
    root.Remote.sync();
    // The moment this stops being a solo game, the soldiers go. See
    // Remote.retireGarrison — the host of a room almost always booted alone.
    if (!garrisonRetired && root.Net.count() >= 2) {
      garrisonRetired = true;
      root.Remote.retireGarrison();
    }
    root.Net.tick();
    if (dead && Date.now() >= respawnAt) doRespawn();
    updateTally();
  };

  /* ------------------------------------------------------------------ */
  /* the HUD nobody was feeding                                          */
  /* ------------------------------------------------------------------ */

  // THREE HUD SYSTEMS ARE FULLY BUILT, DRAWN EVERY FRAME, AND WERE NEVER
  // GIVEN ANY DATA. Found by audit after a player reported the first one:
  //
  //   * ENEMY BLIPS. The UI calls _collectBlips() every frame, which asks the
  //     AI system for `getHudActors()` (or `.actors`) and RETURNS SILENTLY if
  //     neither is there. Nothing ever provided it, so the minimap has drawn
  //     the street, your arrow and nothing else since the first build. It is
  //     an extension point the game is expected to fill — so fill it.
  //   * INCOMING GRENADES. ui.spawnGrenade() draws the warning ring and plays
  //     grenade_warn. The garrison throws grenades to move you off a position
  //     — that is in the app's own description — and the warning has only ever
  //     fired in the HUD demo. A grenade landed at your feet in silence.
  //   * THE MATCH BAR. ui.setMatch() is never called anywhere in the engine
  //     outside its own definition, so the score line sat at its defaults.
  //
  // WHAT REVEALS AN ENEMY, and why it is not simply "everyone alive": the
  // rule from the game this is modelled on is that FIRING gives you away.
  // Blipping every living soldier is a wallhack and makes the street trivial.
  // So a contact appears when someone shoots and fades a few seconds later.
  var REVEAL_MS = 2600;
  var revealed = new Map();     // agent -> when the contact goes cold
  var matchSince = 0;           // when this room became a match, for the clock
  var nadeSeen = new Set();     // grenades already warned about, once each
  var _bo = null;               // scratch: a round's recovered origin

  /** Mark whoever fired this round, if it was not us. */
  function revealShooter(ai, r, me, now) {
    if (!r || !r.alive || !r.pos || !r.dir) return;
    if (!_bo) _bo = r.pos.clone();
    _bo.copy(r.pos).addScaledVector(r.dir, -(r.travelled || 0));
    // Ours: the muzzle is a couple of metres from the camera, and a round that
    // has not travelled yet is still sitting on it. This is also what stops
    // the map painting a contact on you every time you pull the trigger.
    if (me && Math.abs(_bo.x - me.x) < 3.5 && Math.abs(_bo.z - me.z) < 3.5) return;
    var best = null, bestD = 25;   // 5 m, squared
    for (var i = 0; i < ai.agents.length; i++) {
      var a = ai.agents[i];
      var pos = a && a.position;
      if (!pos) continue;
      var dx = pos.x - _bo.x, dz = pos.z - _bo.z;
      var d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best) revealed.set(best, now + REVEAL_MS);
  }

  // A HANDLE FOR THE SUITES, because the obvious way to test this is a lie.
  // Pushing a synthetic round into the ballistics sim does not work: a fake
  // that is missing fields the sim wants is culled inside one frame (measured
  // — liveLen went to 0 before the next rAF), so a test built that way reports
  // "no contacts" whatever the code does. This exposes the reveal itself, so a
  // guard can assert the rule — a shot at this spot marks the soldier standing
  // there — without depending on the sim keeping a counterfeit alive.
  root.__FPS_HUD__ = {
    revealAt: function (x, z) {
      var ai = ctx && ctx.peek && ctx.peek('ai');
      if (!ai || !ai.agents) return 0;
      var best = null, bestD = 25;
      for (var i = 0; i < ai.agents.length; i++) {
        var a = ai.agents[i], pos = a && a.position;
        if (!pos) continue;
        var dx = pos.x - x, dz = pos.z - z, d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = a; }
      }
      if (best) { revealed.set(best, Date.now() + REVEAL_MS); return 1; }
      return 0;
    },
    revealedCount: function () { return revealed.size; },
  };

  /** Called from the netplay system's update, i.e. once per engine frame. */
  function hudFeed(ctx) {
    var ui = ctx.peek('ui');
    var ai = ctx.peek('ai');
    if (!ui || !ai) return;
    var now = Date.now();
    var me = root.__FPS_POSE__ ? root.__FPS_POSE__() : null;

    /* ---- who is shooting ---- */
    // FIRING REVEALS YOU. That is the Call of Duty rule this copies: a soldier
    // who shoots appears on the map for a moment; a soldier who is merely
    // standing there never does, because that would be a wallhack.
    //
    // THIS READ THE WRONG THING UNTIL NOW, AND THE FEATURE HAS NEVER WORKED
    // ONCE. It asked the ballistics sim for its live rounds and reconstructed
    // each one's origin. Every part of that ran, and it could never produce a
    // single blip: `sim.spawn()` has exactly ONE call site in the engine, right
    // after `this.viewmodel.muzzleWorld(...)` — the player's own first-person
    // weapon. Soldiers hurt you through applyDamage and never put anything in
    // that pool. So sim.live holds only YOUR bullets, and the line below it
    // discarded exactly those as "ours". The list handed to the minimap was
    // empty in every game anyone has ever played, which is what was reported:
    // "I still have never seen a dot show up on the minimap for any reason."
    //
    // The soldier knows perfectly well when it is shooting, so ask it. Measured
    // on a live agent: burstLeft counts down a burst, wantFire is the intent,
    // fireCooldown is the gap between rounds. Mid-burst IS firing, and the
    // REVEAL_MS fade afterwards is what makes a contact readable rather than a
    // flicker.
    try {
      if (ai.agents) {
        for (var i = 0; i < ai.agents.length; i++) {
          var a = ai.agents[i];
          if (!a || a.alive === false || a.dead === true) continue;
          if (a.burstLeft > 0 || (a.wantFire === true && !(a.fireCooldown > 0))) {
            revealed.set(a, now + REVEAL_MS);
          }
        }
      }
    } catch (e) { /* a missing system is not worth a frame */ }

    /* ---- hand the engine its own extension point ---- */
    // Installed once, and only ours: if a future engine ships a real one, the
    // guard leaves it alone rather than fighting it.
    if (!ai.getHudActors) {
      ai.getHudActors = function () {
        var out = [];
        var t = Date.now();
        for (var it = revealed.entries(), e = it.next(); !e.done; e = it.next()) {
          var agent = e.value[0], until = e.value[1];
          if (t > until) { revealed.delete(agent); continue; }
          if (!agent || !agent.position || agent.alive === false || agent.dead === true) {
            revealed.delete(agent); continue;
          }
          out.push(agent);
        }
        return out;
      };
    }

    /* ---- incoming grenades ---- */
    try {
      var nades = ai._grenades;
      if (nades && nades.length) {
        for (var g = 0; g < nades.length; g++) {
          var n = nades[g];
          if (!n || nadeSeen.has(n)) continue;
          nadeSeen.add(n);
          var np = (n.body && n.body.position) || (n.mesh && n.mesh.position);
          // Only what is thrown AT us: the blast is 6.5 m, so a grenade across
          // the street is not a warning, it is noise.
          if (!np || (me && Math.hypot(np.x - me.x, np.z - me.z) > 22)) continue;
          try { ui.spawnGrenade(np, Math.max(0.5, n.fuse || 2.35)); } catch (e2) {}
        }
      }
      // Forget the ones that have gone off, or the set grows all session.
      if (nadeSeen.size > 32 && nades) {
        var alive = new Set(nades);
        for (var it2 = nadeSeen.values(), v = it2.next(); !v.done; v = it2.next()) {
          if (!alive.has(v.value)) nadeSeen.delete(v.value);
        }
      }
    } catch (e) { /* ditto */ }

    /* ---- the match bar ---- */
    // Only in a deathmatch, and only from numbers we actually have: this is a
    // free-for-all, so US is you and THEM is whoever is winning of the rest.
    // No invented clock — the mode line says DM and the time stays where the
    // engine put it rather than pretending there is a round timer.
    // AND WHEN THERE IS NO MATCH, THERE IS NO BAR. The engine ships this widget
    // filled with mock-up text — "43", "TDM", "4:12", "38" — and updates it
    // from a state object that stays EMPTY unless setMatch is called. Called
    // only at two players, as it was, a solo game showed 0 / TDM / a dead clock
    // / 0 for its whole length and never moved. Reported exactly that way:
    // "the score read 2 TOM 10:00 0 the entire time, and I have no idea what
    // any of that means." A frozen scoreboard is worse than none: it is a
    // scoreboard that is lying about a match you are not in.
    var inMatch = !!(root.Net && root.Net.live() && root.Net.count() >= 2);
    try {
      var barEl = ui.matchBar && ui.matchBar.root;
      if (barEl) barEl.style.display = inMatch ? '' : 'none';
    } catch (e) { /* the bar is decoration; never let it stop a frame */ }
    try {
      if (ui.setMatch && inMatch) {
        // roster() is the one place that already knows every score INCLUDING
        // ours (net.js builds it from self + others, sorted) — so the bar
        // cannot drift from the scoreboard the Tab key shows.
        var list = root.Net.roster ? root.Net.roster() : [];
        var mine = 0, top = 0;
        for (var r = 0; r < list.length; r++) {
          var row = list[r];
          if (row.me) mine = row.k || 0;
          else if ((row.k || 0) > top) top = row.k || 0;
        }
        // THE CLOCK HAS TO MOVE. This used to pass no time at all, on the
        // reasoning that inventing a round timer would be dishonest — but the
        // widget renders `uz(t.timeLeft ?? 0)` every frame regardless, so
        // refusing to feed it did not hide the clock, it froze one on screen.
        // A stopped clock is a worse lie than the one I was avoiding. There IS
        // a true number here: how long this match has been running, counted
        // from the moment the room had two people in it.
        if (!matchSince) matchSince = now;
        ui.setMatch({ scoreUs: mine, scoreThem: top, mode: 'DM',
                      timeLeft: (now - matchSince) / 1000 });
      }
    } catch (e) { /* ditto */ }
  }

  // Somebody's browser says they shot me. We are the authority on what that
  // costs us — see the note in net.js about why the target decides. The wound
  // arrives already scaled, by the shooter's collider multiplier (where the
  // headshot bonus lives) and by range, so what is left for us is to take it.
  function onIncomingHit(dmg, headshot, fromId, fromName) {
    if (!player || dead) return;
    var o = root.Net.others()[fromId];
    var from = null;
    if (o) { from = new root.COD.THREE.Vector3(o.x, o.y + 1.4, o.z); }
    player.applyDamage(dmg, from, { type: 'bullet' });
    killedBy = fromName; killedById = fromId; killedByHs = !!headshot;
    killedAt = Date.now();
    pushSelf();
  }

  // Somebody's row says I killed them — the only moment a shooter can be told,
  // because the target is what decides that it died (see net.js). Report it the
  // way upstream reports a kill on a bot, so shooting a person feels the same.
  function onScoredKill(victim, headshot) {
    if (!ui) return;
    try {
      ui.hitmarker('kill');
      if (ui.banner) ui.banner.show('Enemy Eliminated', headshot ? 'HEADSHOT' : '');
      if (ui.killfeed) ui.killfeed.push({ attacker: 'YOU', victim: victim, headshot: !!headshot, mine: true });
      // Upstream posts its OWN killfeed row from `actor:death` when the body
      // falls a frame later, and dedupes that against a recent local kill with
      // this timestamp. Setting it is how we tell it the kill it is about to
      // report is the one we just reported — otherwise every kill reads twice.
      if (ctx && ctx.time) ui._lastKillAt = ctx.time.elapsed;
    } catch (e) { /* feedback that fails is not worth losing the kill over */ }
  }

  function onDeath() {
    if (dead) return;
    dead = true;
    deaths++;
    respawnAt = Date.now() + RESPAWN_MS;
    player.setControlEnabled(false);
    var by = lastKillerId();
    root.Net.setSelf({
      hp: 0, alive: false, spawn: spawnSeq, deaths: deaths,
      killedBy: by, killedByHeadshot: by ? killedByHs : false,
    });
    root.Net.publish(true);
    banner(by ? 'Killed by ' + killedBy : 'You died', true);
  }

  // The player who is credited: the last one to shoot us, and only if they did
  // so recently enough to be the reason we are dead. A fall, a grenade, or the
  // garrison killing us is nobody's kill.
  function lastKillerId() {
    if (!killedById || Date.now() - killedAt > KILL_CREDIT_MS) return null;
    return killedById;
  }

  function doRespawn() {
    dead = false;
    killedBy = ''; killedById = null; killedByHs = false; killedAt = 0;
    spawnSeq++;
    // A different spawn point each time, or a room of three keeps landing on
    // each other's heads at the same corner.
    var world = ctx.peek('world');
    var n = (world && world.spawnPoints && world.spawnPoints.length) || 1;
    player.respawn(Math.floor(Math.random() * n));
    player.setControlEnabled(true);
    pushSelf();
    root.Net.publish(true);
    banner('', false);
  }

  function pushSelf() {
    if (!player) return;
    var by = dead ? lastKillerId() : null;
    root.Net.setSelf({
      hp: player.health ? player.health.value : 100,
      alive: !dead, spawn: spawnSeq, deaths: deaths,
      killedBy: by, killedByHeadshot: by ? killedByHs : false,
    });
  }

  /* ------------------------------------------------------------------ */
  /* scoreboard + banner                                                */
  /* ------------------------------------------------------------------ */

  var scoreEl = document.getElementById('score');
  var rowsEl = document.getElementById('score-rows');
  var tallyEl = document.getElementById('tally');
  var bannerEl = null;

  function renderScore(list) {
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += '<tr class="' + (p.me ? 'me ' : '') + (p.alive ? '' : 'dead') + '">' +
        '<td>' + esc(p.name) + '</td><td class="k">' + p.k + '</td><td class="d">' + p.d + '</td></tr>';
    }
    rowsEl.innerHTML = html;
  }

  function updateTally() {
    var n = root.Net.count();
    if (n < 2) { tallyEl.hidden = true; return; }
    tallyEl.hidden = false;
    tallyEl.textContent = n + ' in the room · hold Tab for scores';
  }

  function banner(text, on) {
    if (!bannerEl) {
      bannerEl = document.createElement('div');
      bannerEl.style.cssText = 'position:fixed;z-index:28;left:50%;top:38%;transform:translateX(-50%);' +
        'font-size:1.2rem;font-weight:600;letter-spacing:.03em;color:#e8e8f0;text-shadow:0 2px 12px #000;' +
        'pointer-events:none;text-align:center';
      document.body.appendChild(bannerEl);
    }
    bannerEl.textContent = on ? text : '';
  }

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }

  /* ------------------------------------------------------------------ */
  /* the frame clock decides, not a benchmark                           */
  /* ------------------------------------------------------------------ */

  // WHAT THE DEVICE CAN DO IS WHAT IT IS DOING, MEASURED ON THE WALL CLOCK.
  //
  // Every attempt to predict this from a synthetic number has been wrong: a
  // shader benchmark rated a phone HIGH, and a driver string only ever answers
  // "is there a graphics chip", not "can it draw a street of 1.7 million
  // triangles". The only measurement that answers the real question is the real
  // frame, so that is the one used — the same thing the player is looking at.
  //
  // The rule is asymmetric on purpose. Going DOWN is fast and needs little
  // evidence, because a player suffering does not want to wait for statistical
  // confidence. Going UP is slow and needs sustained proof, because a device
  // that oscillates between resolutions is worse than one that simply stays
  // low. Resolution is the only thing moved at runtime: it is one number, it
  // resizes render targets and nothing else, and it does not rebuild a texture
  // or a shadow map mid-game.
  var TARGET_MS = 34;          // ~30 fps: the point below which this stops being a game
  var GOOD_MS = 20;            // comfortably above it, i.e. room to spare
  var SCALE_MIN = 0.18, SCALE_STEP_DOWN = 0.75, SCALE_STEP_UP = 1.12;
  var WINDOW = 24;             // frames per verdict
  var autoScale = { on: false, cap: 1, frames: [], last: 0, good: 0, changes: 0 };

  function autoScaleInit(a) {
    autoScale.on = true;
    autoScale.cap = (a && a.renderScale != null) ? a.renderScale : 1;
    autoScale.last = Date.now();
  }

  // Called every frame from the netplay system, which already rides the loop.
  function autoScaleTick(dt) {
    if (!autoScale.on || !ctx || !dt) return;
    var f = autoScale.frames;
    f.push(dt * 1000);
    if (f.length < WINDOW) return;
    f.sort(function (x, y) { return x - y; });
    var med = f[f.length >> 1];
    f.length = 0;
    // Never faster than every 1.5 s: a resize costs a hitch of its own, and
    // paying it repeatedly to chase noise would be its own performance bug.
    if (Date.now() - autoScale.last < 1500) return;
    var q = ctx.config.q, cur = q.renderScale, next = cur;
    if (med > TARGET_MS && cur > SCALE_MIN) {
      next = Math.max(SCALE_MIN, cur * SCALE_STEP_DOWN);
      autoScale.good = 0;
    } else if (med < GOOD_MS && cur < autoScale.cap) {
      // Three consecutive comfortable windows before giving anything back.
      if (++autoScale.good < 3) return;
      autoScale.good = 0;
      next = Math.min(autoScale.cap, cur * SCALE_STEP_UP);
    } else { return; }
    if (Math.abs(next - cur) < 0.02) return;
    q.renderScale = next;
    autoScale.last = Date.now();
    autoScale.changes++;
    var rs = ctx.peek('render');
    try { if (rs && rs.resize) rs.resize(window.innerWidth, window.innerHeight, ctx); } catch (e) {}
    try {
      console.info('[fps] frame ' + med.toFixed(0) + ' ms -> resolution '
        + Math.round(next * 100) + '% (was ' + Math.round(cur * 100) + '%)');
    } catch (e) {}
    root.__FPS_SCALE__ = { med: med, scale: next, changes: autoScale.changes };
  }

  /* ------------------------------------------------------------------ */
  /* a stray key asks a question, so answer it                          */
  /* ------------------------------------------------------------------ */

  // Pressing a key that does nothing is how people ask what the keys are, and
  // in a pointer-locked first-person game there is nowhere to look it up: the
  // gate card that listed them is gone the moment you press Play.
  //
  // WHICH KEYS COUNT AS STRAY IS ASKED OF THE ENGINE, NOT LISTED HERE. The
  // binding table is a module-level constant inside the bundle with no way in,
  // but `input.action(name)` reads it, so putting a code into the held set and
  // asking whether any action fires reveals the binding without duplicating it.
  // A copy of that table in this file would be wrong the first time upstream
  // moved a key, and wrong in the direction that matters: telling somebody a
  // key does nothing when it does.
  //
  // Probed ONCE, at boot, while the engine is not yet running — mutating the
  // held set mid-game would make the player walk.
  var ACTIONS = ['forward', 'back', 'left', 'right', 'jump', 'crouch', 'prone',
                 'sprint', 'reload', 'use', 'melee', 'leanLeft', 'leanRight',
                 'swapWeapon', 'grenade', 'flashlight', 'pause'];
  // Ours, which the engine knows nothing about: Tab is the scoreboard (we take
  // it back off swapWeapon above) and Escape is the pause menu.
  var OURS = ['Tab', 'Escape'];
  var bound = null;

  function learnBindings(input) {
    var set = Object.create(null);
    for (var i = 0; i < OURS.length; i++) set[OURS[i]] = 1;
    if (!input || !input.down || !input.action) return set;
    var codes = ['Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
                 'AltLeft', 'AltRight', 'Enter', 'Backspace', 'Tab', 'Escape',
                 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    for (var c = 65; c <= 90; c++) codes.push('Key' + String.fromCharCode(c));
    for (var d = 0; d <= 9; d++) codes.push('Digit' + d);
    for (var k = 0; k < codes.length; k++) {
      var code = codes[k];
      var had = input.down.has(code);
      if (!had) input.down.add(code);
      for (var a = 0; a < ACTIONS.length; a++) {
        if (input.action(ACTIONS[a])) { set[code] = 1; break; }
      }
      if (!had) input.down.delete(code);
    }
    return set;
  }

  var helpEl = null, helpTimer = 0;
  function flashKeyHelp() {
    if (!helpEl) {
      helpEl = document.createElement('div');
      helpEl.id = 'keyhelp';
      helpEl.innerHTML =
        '<b>WASD</b> move · <b>mouse</b> aim · <b>click</b> fire · <b>right-click</b> sights<br>' +
        '<b>Shift</b> sprint · <b>Ctrl</b> crouch · <b>Space</b> jump · <b>Q/E</b> lean · <b>R</b> reload<br>' +
        '<b>1/2</b> weapon · <b>G</b> grenade · <b>F</b> use · <b>V</b> melee · <b>Tab</b> scores · <b>Esc</b> pause';
      document.body.appendChild(helpEl);
    }
    helpEl.classList.add('on');
    clearTimeout(helpTimer);
    helpTimer = setTimeout(function () { helpEl.classList.remove('on'); }, 2600);
  }

  addEventListener('keydown', function (e) {
    // Held keys repeat; one question deserves one answer.
    if (e.repeat || !bound) return;
    // Still on the gate, which is already showing the keys.
    if (gate && gate.parentNode) return;
    // A browser shortcut is not somebody asking what a key does.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (bound[e.code]) return;
    flashKeyHelp();
  });

  /* ------------------------------------------------------------------ */
  /* Tab belongs to the scoreboard                                      */
  /* ------------------------------------------------------------------ */

  // Upstream binds Tab to swapWeapon, alongside Digit1 and Digit2. We bind it
  // to the scoreboard — and the app TELLS the player to hold it — so holding Tab
  // to read the scores also swapped your rifle for your sidearm, and let go of
  // it to swap back. In a firefight, which is the only time you check the
  // scores, that is the whole game.
  //
  // preventDefault() on our own keydown does not help: both listeners are real
  // listeners on the same event and neither cancels the other. The binding table
  // is a module-level constant inside the bundle with no way in, so the two
  // methods that read it are wrapped instead, and only for this one action.
  // Digit1/Digit2 still swap, which is what the gate card now says.
  function freeTheTabKey(input) {
    if (!input || !input.action || !input.actionPressed) return;
    var action = input.action.bind(input);
    var actionPressed = input.actionPressed.bind(input);
    input.action = function (name) {
      if (name === 'swapWeapon') return input.held('Digit1') || input.held('Digit2');
      return action(name);
    };
    input.actionPressed = function (name) {
      if (name === 'swapWeapon') return input.pressed('Digit1') || input.pressed('Digit2');
      return actionPressed(name);
    };
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                               */
  /* ------------------------------------------------------------------ */

  function webgl2() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl2', { failIfMajorPerformanceCaveat: false }));
    } catch (e) { return false; }
  }

  function start() {
    if (!root.COD) return fatal('The game engine did not load.');
    if (!webgl2()) {
      return fatal('This browser has no WebGL2, which the whole game is drawn with. ' +
        'Try Chrome, Edge, Firefox or Safari 17 and up.');
    }

    var COD = root.COD;
    var canvas = document.getElementById('game');

    // The cache must be in memory before the engine starts: the forge builds
    // synchronously and cannot wait on a database mid-bake.
    // An off switch, because this cache is the newest and least proven thing
    // here and it writes pixels the world is drawn from. `GIFOS_FPS_NOCACHE=1`
    // in the console before opening the app bakes everything fresh, which is
    // how you tell a cache bug from a game bug in one step.
    useCache = !root.GIFOS_FPS_NOCACHE;
    Promise.all([loadPrefs(),
                 useCache ? root.TexCache.preload(root.gifos) : 0,
                 useCache ? root.MeshCache.preload(root.gifos) : 0]).then(function (pre) {
      var cached = (pre && pre[1]) || 0;
      restored.tex = cached;
      restored.mesh = (pre && pre[2]) || 0;
      if (cached) { try { console.info('[fps] texture cache: ' + cached + ' surfaces available'); } catch (e) {} }
      // MEASURE THE DEVICE, unless somebody has already decided for it: a
      // saved preference is a player's own choice and outranks any probe, and
      // GIFOS_FPS_QUALITY is the suites' hatch (same shape as GIFOS_CONN in the
      // runtime, for the same reason).
      // A PRESET IS A PREFERENCE. WHAT THE DEVICE CAN DRAW IS NOT.
      //
      // This used to read `chosen ? null : pickSettings()`, so choosing a
      // quality — or having one pinned by the settings bug — skipped the probe
      // AND every limit that came from it: the render scale, the texture cap,
      // the shadow cuts, all of them. The result was a machine with no graphics
      // chip rendering a full-fat scene with not one of its downgrades applied,
      // which is exactly what it looked like.
      //
      // So the probe always runs (it costs ~150 ms), the preset is still the
      // player's to choose, and the device's ceilings are clamped over the top
      // of whatever preset that is. Ask for ULTRA on a software rasteriser and
      // you get ULTRA's look with a software rasteriser's budget, because the
      // alternative is a slideshow that honours a menu.
      var chosen = root.GIFOS_FPS_QUALITY || prefs.quality;
      say('Checking what this device can draw…', 0.08);
      stamp('prefs-loaded');
      auto = pickSettings();
      stamp('probed');
      showDevice(auto);
      var config = COD.createConfig({ quality: chosen || auto.quality });
      // The render target is width * pixelRatio * renderScale, so this is the
      // lever with a square on it. Set BEFORE the engine is built, because the
      // first resize sizes every render target from it.
      // Clamp, never raise: a device ceiling can only ever make this cheaper.
      // THE SAME STREET EVERY TIME MEANS THE SAME EVERYTHING EVERY TIME.
      // Handed in if we kept it, and whatever the engine builds is kept for
      // next time. Every one of these hooks exists only because vendor.mjs
      // patches it in, and every one of them defaults to upstream's exact
      // behaviour when it is not set.
      //
      //   weaponModel/onWeaponModel   the viewmodel descriptor (nodes, and the
      //                               names of its assemblies)
      //   weaponAsm/onWeaponAsm       one assembly's MERGED, MASK-BAKED
      //                               geometry — where the 960 ms actually is
      //   aiNav/onAiNav               the walkability grid and cover points
      //   aiVariant/onAiVariant       one soldier's skinned geometry
      //
      // The seed is part of every key: one seed, one street, one garrison.
      if (useCache) {
        var MC = root.MeshCache;
        MC.useSeed(WORLD_SEED);
        config.q.weaponModel = function (name) { return MC.getWeapon(name); };
        config.q.onWeaponModel = function (name, model) { MC.putWeaponModel(name, model); };
        config.q.weaponAsm = function (id, asmName) { return MC.getWeaponAsm(id, asmName); };
        config.q.onWeaponAsm = function (id, asmName, matKey, geo) { MC.putWeaponAsm(id, asmName, matKey, geo); };
        config.q.aiNav = function (grid, cover) { return MC.getNav(grid, cover); };
        config.q.onAiNav = function (grid, cover) { MC.putNav(grid, cover); };
        config.q.aiVariant = function (name) { return MC.getVariant(name); };
        config.q.onAiVariant = function (name, v) { MC.putVariant(name, v); };
      }
      // PRE-RENDERED VOICES, unconditionally: the audio render thread was
      // measured burning a full core on live per-shot synthesis, which is what
      // silenced the game on any machine whose sustained clock cannot afford
      // it (see voicecache.js for the numbers, vendor.mjs for the seams). A
      // hit is one buffer source instead of ~40 nodes; a miss plays live and
      // renders itself for next time.
      if (root.VoiceCache) config.q.voiceCache = root.VoiceCache;
      if (auto.renderScale != null) config.q.renderScale = Math.min(config.q.renderScale, auto.renderScale);
      if (auto.q) {
        for (var qk in auto.q) {
          var want = auto.q[qk], have = config.q[qk];
          config.q[qk] = (typeof want === 'number' && typeof have === 'number') ? Math.min(have, want) : want;
        }
      }
      if (auto) {
        root.__FPS_AUTO__ = auto;   // readable by the suites and by a console
        try {
          console.info('[fps] device probe: ' + (auto.probe.renderer || 'unknown')
            + (auto.probe.software ? ' [SOFTWARE]' : '')
            + ' score=' + auto.probe.score.toFixed(3)
            + ' -> ' + auto.quality + ' @ renderScale ' + config.q.renderScale);
        } catch (e) {}
      }
      if (prefs.sensitivity != null) config.sensitivity = prefs.sensitivity;
      if (prefs.invertY != null) config.invertY = prefs.invertY;
      if (prefs.fov != null) config.fov = prefs.fov;

      engine = new COD.Engine({ canvas: canvas, config: config });
      // THE SHARED WORLD. Reseed before init(), because init() is where every
      // system draws the numbers that decide what the street looks like.
      engine.rng.seed(WORLD_SEED);

      engine
        .add(tracked(COD.RenderSystem)).add(tracked(materialSystemFor(auto.texCap))).add(tracked(COD.SkySystem))
        .add(tracked(COD.WorldSystem)).add(tracked(COD.PhysicsSystem)).add(tracked(COD.PlayerSystem))
        .add(tracked(COD.WeaponSystem)).add(tracked(COD.FxSystem)).add(tracked(COD.AiSystem))
        .add(tracked(COD.UiSystem)).add(tracked(COD.AudioSystem))
        .add(NetplaySystem);

      // Say how long, and say it once, rather than leaving a number to imply it.
      // The first launch on a machine without a graphics chip is minutes, and a
      // player who was told that waits; a player who was not closes the tab.
      say(auto.probe && auto.probe.software
        ? 'Building the street… on this device that takes a few minutes'
        : (restored.tex
            ? 'Reusing ' + restored.tex + ' saved surfaces — rebuilding the street…'
            : 'Building the street…'), 0.15);
      // Join the room BEFORE init, because whether we are alone decides whether
      // the AI garrison is spawned at all (see below) and that is decided during
      // the first update, not later.
      return Promise.all([engine.init(), root.Net.init()]).then(function (r) {
        stamp('world-built');
        var roster = r[1] || [];
        ctx = engine.ctx;
        player = ctx.peek('player');
        ui = ctx.peek('ui');

        // SOLO vs DEATHMATCH. The AI garrison is generated locally by each
        // client, so in a shared world two players would each see their own
        // private set of soldiers standing in different places — one player
        // shooting at nothing the other can see. So: alone, you fight the
        // garrison; in a room, the room IS the opposition.
        var alone = roster.filter(function (p) { return p && p.id; }).length < 2;
        if (!alone) {
          var ai = ctx.peek('ai');
          if (ai) ai.populate = function () { return 0; };
        }
        document.getElementById('gate-room').innerHTML = alone
          ? 'Playing solo against the garrison. <b>Invite someone</b> and it becomes a deathmatch.'
          : 'Deathmatch — <b>' + roster.length + ' in the room</b>.';

        // WHAT CACHING THE WORLD WOULD COST, MEASURED ON EVERY RUN.
        //
        // The street is the biggest single item left in the boot (2.0 s of 8.7 s
        // on a fleet box, ~3.4 s of 11.7 s on the phone) and it is generated the
        // same way everything else here is, so it looks like the obvious next
        // thing to keep. It is not kept, and the reason is a number rather than
        // an opinion: this walks the finished world and adds up exactly the
        // bytes that would have to cross the sandbox bridge and land in
        // IndexedDB. It is reported as `mesh.worldMB` beside the caches that DID
        // pay off, so the decision can be re-argued against a measurement
        // instead of a memory. See measureWorld() in meshcache.js.
        if (useCache) { try { root.MeshCache.measureWorld(ctx); } catch (e) {} }

        freeTheTabKey(engine.input);
        autoScaleInit(auto);
        // After freeTheTabKey, so Tab reads as ours rather than the engine's.
        bound = learnBindings(engine.input);
        root.__FPS_BOUND__ = bound;        // for the suites, and for a console
        // SAY SO WHEN THE DEVICE HAS NO GRAPHICS CHIP. Everything above makes
        // this as cheap as it can be made — measured on a GPU-less container,
        // 280 s to the Play button became 111 s — but "as cheap as possible" is
        // still 7 seconds a frame there, because the street is 1.7 million
        // triangles and no setting removes the street. A player who is told
        // that can act on it; a player who is not just thinks the game is
        // broken, which is what it looks like.
        if (auto.probe && auto.probe.software) softwareWarning();
        touch = root.Touch.init(engine.input, ui);
        root.__FPS_POSE__ = pose;
        // A handle on the running game, for the suites and for anyone poking at
        // it in a console. Upstream's own entry exposes window.__ENGINE__ for
        // the same reason; we do not use that entry, so this is where it lives.
        root.__FPS__ = { engine: engine, ctx: ctx, player: player, ui: ui, net: root.Net, remote: root.Remote };
        pushSelf();

        // Settings the player changes in the pause menu, kept for next time.
        ctx.events.on('ui:quality', chooseQuality);
        ctx.events.on('ui:sensitivity', savePrefs);
        ctx.events.on('ui:fov', savePrefs);
        ctx.events.on('ui:setting', savePrefs);

        // PREWARM STOPS BLOCKING THE DOOR.
        //
        // It compiles the 34+ shader programs up front so the first half minute
        // of play is not punctuated by 700-1200 ms freezes — upstream measured
        // those, they are real, and this still does it. What changed is that it
        // no longer happens BEFORE the Play button lights up.
        //
        // Measured on a machine with no graphics chip: 44 of the ~110 seconds
        // to the gate were this, and it is pure front-loading — every one of
        // those programs would otherwise compile on first use anyway. Making a
        // player watch a progress bar for work that has not been needed yet is
        // the most expensive kind of waiting there is: the kind with nothing at
        // the end of it. So the world is what gates Play; the shaders warm
        // behind it, and carry on warming while the player reads the card or
        // walks down the street.
        //
        // On a device that can compile them quickly this is invisible either
        // way. On the device that needs it, it is 44 seconds.
        var warm = COD.prewarm(engine, {
          onProgress: function (p) {
            if (!go.disabled) return;                 // already in; stop narrating
            say(null, 0.55 + Math.max(0, Math.min(1, p && p.t != null ? p.t : 0)) * 0.4);
          },
        });
        if (warm && warm.catch) warm.catch(function () {});
        // NOBODY WAITS FOR THIS. Measured on a Moto g24: the world was built at
        // 22.7 s and the Play button lit at 124.1 s — 101 SECONDS of shader
        // compilation, on a phone with a perfectly good GPU, for programs not
        // one of which had been needed yet. Gating on "is it a software
        // rasteriser" was the wrong question; the right one is whether anybody
        // should ever wait for work that is pure front-loading, and the answer
        // is no. It keeps compiling behind the gate and while the player walks.
        return null;
      });
    }).then(function () {
      stamp('READY');
      var fullNote = function () {
        return (auto.probe ? (auto.probe.software ? 'software' : 'gpu:' + auto.probe.renderer.slice(0, 40)) : '?')
          + ' q=' + ctx.config.quality + ' scale=' + ctx.config.q.renderScale + ' tex=' + auto.texCap + cacheNote();
      };
      publishPerf(fullNote());
      say(restored.tex
        ? 'Ready — reused ' + restored.tex + ' saved surfaces. Detail keeps sharpening as you play.'
        : 'Ready — the street is built. Detail keeps sharpening as you play.', 1);
      gate.classList.add('ready');
      if (demoBtn) demoBtn.disabled = false;
      if (useCache) {                                   // nobody waits on these now
        // …but the REPORT waits, because the note above is written BEFORE this
        // line and therefore always said pending=27, flush="" — a snapshot of
        // the moment before the write, which reads exactly like a cache that
        // never writes. Hours went into that misreading. Publish again once the
        // write has actually resolved, so the numbers describe what happened.
        var after = function () { try { publishPerf(fullNote()); } catch (e) {} };
        try { var ft = root.TexCache.flush(); if (ft && ft.then) ft.then(after, after); else after(); } catch (e) {}
        try { root.MeshCache.flush(); } catch (e) {}
      }
      // THE BUTTON SAYS WHAT IT IS. It read "Play" the whole way through the
      // build, greyed out, so people pressed it and nothing happened — reported
      // as "it took three presses" and "it's hard to tell because the button
      // says Play even when it's half greyed out". It starts as "Wait" (see
      // index.html) and only becomes Play when pressing it will actually do
      // something.
      go.textContent = 'Play';
      go.disabled = false;
      go.focus();
    }).catch(function (err) {
      console.error('[fps] boot failed', err);
      fatal('The game could not start: ' + ((err && err.message) || err));
    });
  }

  function pose() {
    if (!player) return null;
    var f = player.feetPosition;
    return {
      x: f.x, y: f.y, z: f.z,
      yaw: player.yaw, pitch: player.pitch,
      speed: player.horizontalSpeed,
      crouch: player.stance === 'crouch' || player.stance === 'prone',
    };
  }

  // Shown on the gate, not over the game: it is information for the decision
  // the player is about to make, and it must not be one more thing to dismiss
  // mid-firefight. Never a refusal — it is their device and their call.
  function softwareWarning() {
    var el = document.getElementById('gate-room');
    if (!el) return;
    var chromeOS = /CrOS/.test(navigator.userAgent);
    el.innerHTML = '<b style="color:#e8b26a">This device is drawing without a graphics chip</b>, '
      + 'so the game will be slow to start and slow to play — that is the device, not the game.'
      + (chromeOS ? ' Turning on GPU support for Linux in ChromeOS settings fixes it.' : '')
      + '<br>' + el.innerHTML;
  }

  // A TOUCH DEVICE IS A TOUCH DEVICE BEFORE IT IS TOUCHED.
  //
  // touch.js adds body.touch on the first touchstart, and `body.touch #gate-keys`
  // hides the keyboard hints — so the FIRST tap reflowed the card and moved the
  // Play button out from under the finger that was pressing it. That is the "it
  // took three presses" report, and it is not a phone-only quirk of the harness:
  // a real thumb loses the first press the same way. A coarse pointer is known
  // before anything is touched, so the layout settles before the first paint and
  // the button never moves.
  if (IS_TOUCH) document.body.classList.add('touch');

  /* ---- the first gesture ------------------------------------------------ */
  // PLAY MUST REACT ON THE TAP, AND THE GAME MUST NOT ARRIVE IN PIECES.
  //
  // What it did before: hid the gate on the click and started the engine. The
  // shaders, though, are deliberately NOT waited for — they compile behind the
  // gate so the Play button can light up as soon as the world exists (that is
  // what took first load from 124 s to 15 s on this phone, and it is right).
  // The cost landed on the player instead, and it was reported exactly as it
  // felt: "I hit play and for 10 seconds nothing happens, then for 20 seconds
  // I hear sounds and see nothing. Then finally after 40-60 seconds the game
  // screen appears." Every one of those seconds is a shader compiling on first
  // use, with the gate already gone — so the feedback was a black screen, and
  // the audio (which needs no compiling) arrived long before the picture.
  //
  // So the gate now STAYS UP across the warm-up and says so. The engine runs
  // behind it, which is what forces the compiles to happen; the bar keeps
  // moving because prewarm is still reporting; and the game is revealed only
  // once frames are actually arriving at a sane rate. Same total wait, but it
  // is a loading screen the whole way instead of a black one, and the tap gets
  // an answer immediately.
  var starting = false;
  /* ---- watch the demo -------------------------------------------------- */
  //
  // The engine ships a full combat DEMO and nothing has ever run it: a scripted
  // timeline of weapon fire, hit arcs, killfeed, banners, grenade markers,
  // damage numbers and reloads, driven from ui.debugState('combat'). It LOOPS
  // by construction (its update runs `frame++ % LOOP`), so it needs no restart
  // logic from us — which is exactly what makes it usable as a screensaver or
  // on a shop display, and is why it earns a button instead of staying dead
  // code that only upstream's capture harness ever saw.
  //
  // It is NOT a second Play: state.simulate is true for its duration, which
  // makes the HUD read from the script instead of from the player, and the
  // engine's own weapon:fire handler bows out while it is set. So the demo
  // never pretends to be a game you are playing, and leaving it is one press.
  var demoing = false;
  function startDemo() {
    if (starting || demoing) return;
    demoing = true;
    if (demoBtn) { demoBtn.disabled = true; demoBtn.textContent = 'Starting…'; }
    go.disabled = true;
    say('Starting the demo…', null);
    // FULLSCREEN FIRST, AND SYNCHRONOUSLY — this is the whole reason the demo
    // can have it when Play struggles to. Both fullscreen and pointer lock
    // want TRANSIENT user activation and the first one spends it (see the Play
    // handler below), so Play has to choose; a demo aims at nothing, so it
    // never asks for the lock and the gesture is free. It must be requested
    // here, in the click itself: everything after this is async, and by the
    // time a polled callback runs the activation is long gone.
    //
    // Landscape is locked on a touch device for the same reason the game does
    // it — a phone propped up on a shelf running this should not be a portrait
    // strip. On a desktop it is plain fullscreen, no orientation opinion.
    goFullscreenLandscape();
    engine.start();
    // Audio inside the gesture, same as Play — a demo on a shop display with no
    // sound is half a demo. No pointer lock and no fullscreen: nobody is aiming.
    if (root.__AUDIO__ && root.__AUDIO__.start) {
      try { root.__AUDIO__.setMasterVolume(0); } catch (e) {}
      root.__AUDIO__.start().catch(function () {});
    }
    var armed = false;
    var arm = function () {
      if (armed) return;
      var u = ctx && ctx.peek && ctx.peek('ui');
      if (!u || !u.debugState) return;
      armed = true;
      try { u.debugState('combat'); } catch (e) { /* a demo is never worth a crash */ }
      reveal();
      try { if (root.__AUDIO__) root.__AUDIO__.setMasterVolume(1); } catch (e) {}
      var hint = document.createElement('div');
      hint.id = 'demo-exit';
      hint.textContent = IS_TOUCH ? 'Demo — tap to stop' : 'Demo — press Esc to stop';
      document.body.appendChild(hint);
      setTimeout(function () { if (hint.parentNode) hint.style.opacity = '0'; }, 6000);
    };
    // The world may already be built (Play was lit), but the UI system is only
    // reachable once the engine has run a tick, so poll briefly rather than
    // assume an ordering.
    var tries = 0;
    var t = setInterval(function () {
      arm();
      if (armed || ++tries > 200) clearInterval(t);
    }, 100);
    var stop = function () {
      if (!demoing) return;
      demoing = false;
      try { var u = ctx.peek('ui'); if (u && u.debugState) u.debugState('clean'); } catch (e) {}
      var h = document.getElementById('demo-exit');
      if (h && h.parentNode) h.parentNode.removeChild(h);
      // Leave fullscreen with the demo. Esc already drops it on a desktop (the
      // browser does that itself, which is why the exit listener below also
      // treats a fullscreen exit as "stop"), but a tap-to-stop on a phone
      // would otherwise leave the viewer in a fullscreen menu-less street.
      try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) {}
      // Back to a street you can actually play, rather than stranding the
      // viewer in a half-lit HUD: the engine is already running, so this is
      // the ordinary game from here.
      try { if (!IS_TOUCH) engine.input.requestPointerLock(); } catch (e) {}
    };
    addEventListener('keydown', function (e) { if (e.code === 'Escape') stop(); });
    document.addEventListener('pointerdown', function () { if (demoing && IS_TOUCH) stop(); }, true);
    // Esc in fullscreen is eaten by the browser to exit fullscreen, so the
    // keydown above may never arrive — the fullscreen exit IS the intent.
    document.addEventListener('fullscreenchange', function () {
      if (demoing && !document.fullscreenElement) stop();
    });
  }
  if (demoBtn) demoBtn.addEventListener('click', startDemo);

  // Run fn once the browser has actually PAINTED. rAF fires before paint, so
  // one is not enough; the second lands after the frame is on the glass. The
  // setTimeout is the backstop for a tab that is not animating at all (a
  // backgrounded phone throttles rAF to a crawl), so a press can never be
  // swallowed by a frame that never comes.
  function afterPaint(fn) {
    var done = false;
    var go1 = function () { if (!done) { done = true; fn(); } };
    if (root.requestAnimationFrame) {
      root.requestAnimationFrame(function () { root.requestAnimationFrame(go1); });
      setTimeout(go1, 250);
    } else setTimeout(go1, 0);
  }

  // THREE WAYS TO PRESS PLAY, because one was not reachable.
  //
  // The button is a real <button>, and on a desktop that is enough. It was not
  // enough anywhere else:
  //   * On this phone over CDP, Playwright's synthesized MOUSE click hangs
  //     inside "performing click action" — the button resolves, is visible and
  //     enabled, and the dispatch simply never lands (measured across three
  //     sessions; adb-injected taps failed the same way). Every suite that
  //     needed the game running had to reach around the button entirely.
  //   * A press that only exists as a mouse click is also the least accessible
  //     shape available: no keyboard route at all.
  // So the press is now its own function with three doors onto it, all guarded
  // by `starting` so extra ones are free:
  //   1. click      — a mouse, a finger, or a trusted synthetic click.
  //   2. pointerup  — the touch/pointer path, which lands on devices where the
  //                   synthesized mouse click does not.
  //   3. Enter/Space — anywhere on the gate, not only when the button holds
  //                   focus. A keyboard is something every automation tool can
  //                   drive and every screen-reader user already has.
  function pressPlay(ev) {
    if (starting || go.disabled) return;
    startPlaying(ev);
  }
  go.addEventListener('pointerup', pressPlay);
  root.addEventListener('keydown', function (ev) {
    if (starting || go.disabled) return;
    if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
    if (gate && getComputedStyle(gate).display === 'none') return;   // gate is gone; this is gameplay
    ev.preventDefault();
    startPlaying(ev);
  });

  go.addEventListener('click', startPlaying);
  function startPlaying(ev) {
    if (starting) return;                     // a second tap must not re-enter
    starting = true;
    // Recorded because a SCRIPTED click carries no user activation, and every
    // hatch this handler opens — fullscreen, orientation, pointer lock, audio —
    // is refused without one, silently, inside a sandbox nobody can see into.
    // If this ever reads false in a report, the answer is that nobody pressed
    // the button, not that the browser is broken.
    root.__FPS_FS__ = { trusted: !!(ev && ev.isTrusted), state: 'pending' };
    // THE TAP MUST BE UNMISTAKABLE. Reported as "nothing visibly happens, the
    // play button just sits there, so a normal person ends up spamming it" —
    // so the button changes its WORD, not just its opacity. A disabled button
    // that merely dims is exactly what a slow page looks like anyway.
    go.disabled = true;
    go.textContent = 'Starting…';
    say('Warming up the shaders — first run only…', null);
    // …AND IT MUST REACH THE SCREEN. Setting the word is not showing the word:
    // engine.start() below seizes the main thread for seconds (minutes on a
    // phone's first run), and the browser paints nothing between a DOM write
    // and the block that follows it. So the button changed to 'Starting…' in
    // the DOM and the player still saw the old, live-looking 'Play' — which is
    // exactly the "nothing visibly happens, so a normal person ends up
    // spamming it" report this line was written to answer. Reported again from
    // a phone on 2026-08-17: "I may have hit Play but I did not see an
    // immediate reaction."
    //
    // Two frames, not one: rAF fires BEFORE paint, so a single one still runs
    // ahead of the pixels. The second is the promise that the pressed state is
    // on the glass before anything is allowed to block.
    // ONE GESTURE, TWO HATCHES THAT BOTH EAT IT — so the device decides which
    // one goes first. Fullscreen and pointer lock each want TRANSIENT user
    // activation and the first one spends it: asking for the pointer first left
    // the phone in a portrait strip (measured: refused, "Permissions check
    // failed"), and asking for fullscreen first broke pointer lock on the
    // desktop (measured: e2e-fps-simple's "the app locks the pointer" went red
    // the moment I swapped them).
    //
    // They are not equally valuable on both devices, which is what breaks the
    // tie. A touchscreen has no pointer to lock and is unplayable in a portrait
    // strip; a mouse has no orientation to hold and is useless without the lock.
    // So each device asks for the one it cannot do without, and the other is
    // picked up by armFullscreenRetry() on the very next tap or click.
    // THE POINTER ALWAYS, THE SCREEN ONLY WHERE IT IS THE POINT.
    //
    // Both want transient user activation and the first one spends it, so they
    // cannot both be asked for unconditionally. They are also wanted on
    // different machines, which is the way out: a mouse needs the lock and has
    // nothing to gain from fullscreen (F11 is right there), while a touchscreen
    // has no pointer to lock and is unplayable in a portrait strip.
    //
    // maxTouchPoints, not `(pointer: coarse)` ALONE: the media query is
    // something browsers answer for layout and it matched in a headless desktop
    // context, which is not a statement about the hardware. That lesson stands
    // and is why IS_TOUCH still requires a digitiser — but maxTouchPoints alone
    // was ALSO wrong, on every touchscreen laptop, so IS_TOUCH now demands both
    // (see its definition at the top). (I also briefly recorded
    // here that entering fullscreen RELEASES the lock — that was wrong. The red
    // lock assertion those runs were chasing turned out to be a stale app
    // catalog breaking the desktop mount entirely, and it is green with this
    // gating and with the catalog regenerated.)
    // A TOUCHSCREEN IS NOT ASKED FOR THE POINTER AT ALL. touch.js bans the lock
    // on touch devices anyway (Chrome on Android FREEZES touch coordinates while
    // one is held, which is what killed the movement stick), but asking and then
    // shedding is not free: the engine treats a lock it was holding disappearing
    // as Escape, and the game arrives PAUSED. Cheaper and quieter never to ask.
    // EVERY HATCH THAT NEEDS THE GESTURE IS OPENED BEFORE ANYTHING BLOCKS.
    // These used to sit AFTER engine.start(), and transient user activation
    // lasts about five seconds — so on any device where starting the engine
    // takes longer than that, the activation was already spent by the time we
    // asked. Measured on a Moto g24 (2026-08-17): a genuinely trusted tap,
    // `__FPS_FS__.trusted === true`, and fullscreen still came back
    // `refused: TypeError: not granted` — the phone then plays the game in a
    // portrait strip behind the browser chrome, which is the exact opposite of
    // the "fills the screen sideways" this release claims. Asking first costs
    // nothing: none of these needs a running engine, only a fresh gesture.
    if (!IS_TOUCH) engine.input.requestPointerLock();
    if (IS_TOUCH) goFullscreenLandscape();
    // Audio is STARTED here, inside the gesture, because that is the only place
    // a browser will allow it — but silenced until there is something to look
    // at, so it can never again be 20 seconds of gunfire over a black screen.
    if (root.__AUDIO__ && root.__AUDIO__.start) {
      try { root.__AUDIO__.setMasterVolume(0); } catch (e) {}
      root.__AUDIO__.start().catch(function () {});
    }
    afterPaint(function () {
      engine.start();
      revealWhenDrawing();
    });
  }

  // Reveal on FRAMES, not on a timer. Three consecutive frames inside 150 ms
  // means the compile stalls are behind us; a timer would either cut the player
  // off mid-stall or make a fast machine sit and wait for nothing.
  //
  // The cap is not a guess at how long warming takes — it is a promise that the
  // player is never trapped behind this. If frames are still slow at 45 s, the
  // device is simply slow and it is better to be playing a slow game than
  // watching a bar; that is the player's call to make from inside the game.
  function revealWhenDrawing() {
    var t0 = (root.performance ? performance.now() : Date.now());
    var last = t0, good = 0, seen = -1;
    (function watch() {
      var now = (root.performance ? performance.now() : Date.now());
      var frame = (engine && engine.time) ? engine.time.frame : 0;
      if (frame !== seen) {                   // a frame actually landed
        var ms = now - last;
        last = now; seen = frame;
        // FAST IS NOT THE SAME AS DRAWN. Counting only the clock let the gate
        // lift on the first few frames, which are quick precisely BECAUSE there
        // is nothing in them yet — and the player got a black screen for ten
        // seconds with the sound already running. A frame counts only if the
        // renderer actually submitted work for it.
        good = (ms < 150 && drawCalls() > 0) ? good + 1 : 0;
      }
      if (good >= 3 || now - t0 > 45000) { reveal(); return; }
      root.requestAnimationFrame(watch);
    })();
  }

  function drawCalls() {
    try {
      var r = ctx && ctx.peek && ctx.peek('render');
      var info = r && r.renderer && r.renderer.info && r.renderer.info.render;
      return info ? info.calls : 1;           // no counter to read: do not block on it
    } catch (e) { return 1; }
  }

  function reveal() {
    if (gate.classList.contains('gone')) return;
    gate.classList.add('gone');
    setTimeout(function () { gate.remove(); }, 400);
    try { if (root.__AUDIO__) root.__AUDIO__.setMasterVolume(1); } catch (e) {}
    armBackAsPause();
    if (IS_TOUCH) { armPauseOnExitFullscreen(); armFullscreenRetry(); }
    checkAiming();
  }

  // ASK AGAIN ON THE NEXT REAL TOUCH, AND KEEP ASKING UNTIL IT TAKES.
  //
  // Fullscreen and orientation lock need TRANSIENT user activation, and the Play
  // click is a crowded gesture: it also starts the engine, takes the pointer and
  // resumes audio. If anything consumes the activation first — or the click was
  // scripted, which is how a harness starts the game — the request is refused
  // with a TypeError thrown inside the sandbox, and the player gets a portrait
  // strip with no idea why.
  //
  // A player taps constantly, so the cheapest fix is to treat the NEXT tap as
  // another chance. Idempotent by construction: it stops the moment the document
  // is fullscreen, it never asks more than once every two seconds, and it is
  // silent when refused — a game that nags is worse than one in a small window.
  function armFullscreenRetry() {
    var lastTry = 0;
    var again = function () {
      if (document.fullscreenElement) return;                 // already there
      var now = Date.now();
      if (now - lastTry < 2000) return;
      lastTry = now;
      goFullscreenLandscape();
    };
    ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
      document.addEventListener(ev, again, true);
    });
  }

  // FILL THE SCREEN, AND TURN IT SIDEWAYS.
  //
  // A first-person game in a portrait strip on a phone is unplayable — you
  // cannot see anything, which is how it was reported. Both halves of this need
  // capabilities.fullscreen (see site/js/runtime.js): fullscreen is delegated
  // as a permissions policy, and the orientation lock is a sandbox flag, and
  // they ride together because a browser only honours a lock while fullscreen.
  //
  // Everything here is best-effort and silent on failure BY DESIGN. A desktop
  // has no screen to turn and rejects lock() with NotSupportedError; a player
  // who revoked the ability in the Abilities sheet gets a rejection too. Neither
  // is a fault and neither should ever interrupt a game that is otherwise fine —
  // so no throw escapes, and the game plays windowed rather than not at all.
  function goFullscreenLandscape() {
    // Why it records what happened: this is refused INSIDE a sandboxed frame,
    // where the rejection is invisible from anywhere a person can look. The one
    // channel this app has to the outside is its own store, so the outcome goes
    // there with everything else (framelog.js publishes it).
    root.__FPS_FS__ = root.__FPS_FS__ || {};
    root.__FPS_FS__.enabled = !!document.fullscreenEnabled;
    root.__FPS_FS__.state = 'asked';
    try {
      var el = document.documentElement;
      if (!el.requestFullscreen) { root.__FPS_FS__.state = 'unsupported'; return; }
      var p = el.requestFullscreen();
      if (p && p.then) {
        p.then(function () {
          root.__FPS_FS__.state = 'on';
          lockLandscape();
        }, function (err) {
          root.__FPS_FS__.state = 'refused:' + ((err && (err.name + ':' + err.message)) || '?').slice(0, 90);
        });
      } else { root.__FPS_FS__.state = 'sync'; lockLandscape(); }
    } catch (e) {
      root.__FPS_FS__.state = 'threw:' + ((e && e.message) || e);
    }
  }
  function lockLandscape() {
    try {
      var o = root.screen && root.screen.orientation;
      // Only a device that HAS an orientation to hold — a desktop rejects this,
      // and a phone held in landscape already is still worth locking so it does
      // not flip back mid-firefight.
      if (!o || !o.lock) { root.__FPS_FS__.lock = 'none'; return; }
      var q = o.lock('landscape');
      if (q && q.then) {
        q.then(function () { root.__FPS_FS__.lock = 'landscape'; },
               function (err) { root.__FPS_FS__.lock = 'refused:' + ((err && err.name) || '?'); });
      } else { root.__FPS_FS__.lock = 'sync'; }
    } catch (e) {}
  }

  // ON A PHONE, BACK IS THE PAUSE BUTTON.
  //
  // A desktop player presses Esc and the engine's menu opens. A phone player's
  // equivalent gesture is the back button, and what it did was leave the game
  // — mid-match, with no warning and no way to say "I only wanted the menu".
  // So the first entry into the game pushes a history state to land on, and
  // back spends that entry on opening the menu instead of on leaving, then
  // pushes a fresh one so the next back does the same.
  //
  // Guarded, because an app frame is sandboxed and may have an opaque origin,
  // where pushState throws SecurityError. If it does, we simply do not arm it:
  // the touch HUD's pause button and Esc still open the menu, and back behaves
  // as it always did. A pause button that throws on load would take the whole
  // boot with it, which is a far worse trade than a back button that does not
  // pause.
  // LOSING THE BIG PICTURE IS ITSELF A REASON TO PAUSE.
  //
  // On a phone the Back button does not reach a popstate handler while the app
  // is fullscreen — the browser spends it on LEAVING fullscreen, which is its
  // own rule and not one to fight. So the exit is the signal: whatever took the
  // player out of the immersive view (Back, Esc, the swipe from the edge, a
  // notification), the game should not carry on being played by nobody. Pausing
  // here is also the duty the pointer-lock path already has, for the same
  // reason: a game that keeps running while the player's attention is elsewhere
  // is a game they come back to dead.
  function armPauseOnExitFullscreen() {
    document.addEventListener('fullscreenchange', function () {
      if (document.fullscreenElement) return;                  // entering, not leaving
      // `menu.open` is a BOOLEAN on upstream's PauseMenu, not a method — show()
      // and close() are the verbs. Calling it would throw, inside a sandbox,
      // every time the player left fullscreen.
      try { if (ui && ui.menu && !ui.menu.open && ui.menu.show) ui.menu.show(); } catch (e) {}
    });
  }

  function armBackAsPause() {
    try { history.pushState({ fps: 1 }, ''); } catch (e) { return; }
    root.addEventListener('popstate', function () {
      try { if (ui && ui.menu && ui.menu.toggle) ui.menu.toggle(); } catch (e) {}
      try { history.pushState({ fps: 1 }, ''); } catch (e) {}
    });
  }

  // WHEN THE POINTER IS NOT OURS TO TAKE.
  //
  // `capabilities.pointer` is revocable, and when it is off the browser refuses
  // the lock inside the sandbox where nobody sees it: the game starts, renders,
  // sounds right, and will not turn. Worth saying out loud — but only when it
  // is TRUE.
  //
  // THE FIRST VERSION OF THIS CRIED WOLF. It asked "are we locked 900 ms after
  // Play?", which is a different question and is false for ordinary reasons:
  // the pause menu releases the pointer (that is what pausing IS), so does
  // switching window, so does taking a screenshot. It told a player whose
  // pointer worked perfectly to go and turn on a permission they already had,
  // over a game that was merely paused.
  //
  // The honest test is whether a lock was EVER obtained. If it was, the
  // capability is present and nothing here is anybody's problem.
  var everLocked = false;
  document.addEventListener('pointerlockchange', function () {
    if (document.pointerLockElement) {
      everLocked = true;
      var n = document.getElementById('no-pointer');
      if (n) n.remove();
    }
  });

  function checkAiming() {
    if (matchMedia('(pointer: coarse)').matches) return;   // a thumb needs no lock
    setTimeout(function () {
      if (everLocked || document.pointerLockElement) return;
      if (document.getElementById('no-pointer')) return;
      var n = document.createElement('div');
      n.id = 'no-pointer';
      n.innerHTML = 'The mouse pointer is switched off for this app, so you can move but not aim.<br>' +
        'Turn on <b>“Take over the mouse pointer while you play”</b> in Abilities, then reopen FPS Simple.';
      document.body.appendChild(n);
    }, 4000);
  }

  /* ---- scoreboard on Tab ------------------------------------------------ */
  addEventListener('keydown', function (e) {
    if (e.code === 'Tab') { scoreEl.hidden = false; e.preventDefault(); }
  });
  addEventListener('keyup', function (e) { if (e.code === 'Tab') scoreEl.hidden = true; });
  tallyEl.addEventListener('click', function () { scoreEl.hidden = !scoreEl.hidden; });

  /* ---- the phone's Back button ------------------------------------------ */
  // GifOS swallows Back by default so a reflex press never closes the app. Make
  // it mean something: close the scoreboard, else pause, else let it go.
  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (!scoreEl.hidden) { scoreEl.hidden = true; return; }
      if (ui && ui.menu && !ui.menu.open) ui.menu.show();
    });
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})(window);
