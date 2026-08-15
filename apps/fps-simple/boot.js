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
  var gate = document.getElementById('gate');
  var bar = document.getElementById('gate-bar');
  var note = document.getElementById('gate-note');
  var go = document.getElementById('gate-go');

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
    try {
      return class extends Base {
        init(ctx) {
          var r = super.init(ctx);
          return (r && typeof r.then === 'function')
            ? r.then(function (v) { initStep(w); return v; })
            : (initStep(w), r);
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
      out.score = (passes * 256 * 256 / 1e6) / ms * 1000;
      out.ms = Math.round(ms);
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
    if (p.software || p.score < 0.5) {
      s.quality = 'low'; s.renderScale = 0.34; s.texCap = 256;
      // SHADOWS ARE GEOMETRY, AND GEOMETRY IS WHAT THIS DEVICE HAS NONE OF.
      // The street is 603k static and 1129k instanced triangles across 212 draw
      // calls, and three shadow cascades means all of it is submitted THREE
      // MORE TIMES every frame. Cutting renderScale did nothing for that, and
      // measurably nothing for the frame rate — a 435x245 render target still
      // took 8.7 seconds a frame — because the cost was never the pixels.
      s.q = { cascades: 1, shadowMapSize: 512, shadowDistance: 28,
              particleBudget: 400, decalBudget: 16, bloom: false };
    } else if (p.score < 2) { s.quality = 'low'; s.renderScale = 0.6; s.texCap = 512; s.q = { cascades: 2 }; }
    else if (p.score < 8) { s.quality = 'medium'; }
    else if (p.score < 25) { s.quality = 'high'; }
    else { s.quality = 'ultra'; }
    return s;
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
    if (touch) touch.tick();
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
    var useCache = !root.GIFOS_FPS_NOCACHE;
    Promise.all([loadPrefs(), useCache ? root.TexCache.preload(root.gifos) : 0]).then(function (pre) {
      var cached = (pre && pre[1]) || 0;
      if (cached) { try { console.info('[fps] texture cache: ' + cached + ' surfaces available'); } catch (e) {} }
      // MEASURE THE DEVICE, unless somebody has already decided for it: a
      // saved preference is a player's own choice and outranks any probe, and
      // GIFOS_FPS_QUALITY is the suites' hatch (same shape as GIFOS_CONN in the
      // runtime, for the same reason).
      var chosen = root.GIFOS_FPS_QUALITY || prefs.quality;
      var auto = chosen ? null : pickSettings();
      var config = COD.createConfig({ quality: chosen || auto.quality });
      // The render target is width * pixelRatio * renderScale, so this is the
      // lever with a square on it. Set BEFORE the engine is built, because the
      // first resize sizes every render target from it.
      if (auto && auto.renderScale != null) config.q.renderScale = auto.renderScale;
      if (auto && auto.q) for (var qk in auto.q) config.q[qk] = auto.q[qk];
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
        .add(tracked(COD.RenderSystem)).add(tracked(materialSystemFor(auto && auto.texCap))).add(tracked(COD.SkySystem))
        .add(tracked(COD.WorldSystem)).add(tracked(COD.PhysicsSystem)).add(tracked(COD.PlayerSystem))
        .add(tracked(COD.WeaponSystem)).add(tracked(COD.FxSystem)).add(tracked(COD.AiSystem))
        .add(tracked(COD.UiSystem)).add(tracked(COD.AudioSystem))
        .add(NetplaySystem);

      // Say how long, and say it once, rather than leaving a number to imply it.
      // The first launch on a machine without a graphics chip is minutes, and a
      // player who was told that waits; a player who was not closes the tab.
      say(auto && auto.probe && auto.probe.software
        ? 'Building the street… the first time on this device takes a few minutes'
        : 'Building the street…', 0.15);
      // Join the room BEFORE init, because whether we are alone decides whether
      // the AI garrison is spawned at all (see below) and that is decided during
      // the first update, not later.
      return Promise.all([engine.init(), root.Net.init()]).then(function (r) {
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

        freeTheTabKey(engine.input);
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
        if (auto && auto.probe && auto.probe.software) softwareWarning();
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

        say('Compiling shaders…', 0.55);
        // Prewarm is not optional. Without it the first 30 seconds of play are
        // punctuated by 700-1200 ms freezes as 34+ WebGL programs compile
        // lazily, mid-firefight — upstream measured exactly this.
        return COD.prewarm(engine, {
          onProgress: function (p) { say(null, 0.55 + Math.max(0, Math.min(1, p && p.t != null ? p.t : 0)) * 0.4); },
        });
      });
    }).then(function () {
      say('Ready', 1);
      gate.classList.add('ready');
      if (useCache) { try { root.TexCache.flush(); } catch (e) {} }   // nobody waits on this now
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

  /* ---- the first gesture ------------------------------------------------ */
  go.addEventListener('click', function () {
    gate.classList.add('gone');
    setTimeout(function () { gate.remove(); }, 400);
    engine.start();
    // Same click, so it still counts as the user gesture both of these need.
    engine.input.requestPointerLock();
    if (root.__AUDIO__ && root.__AUDIO__.start) root.__AUDIO__.start().catch(function () {});
    checkAiming();
  });

  // WHEN THE POINTER IS NOT OURS TO TAKE. `capabilities.pointer` is revocable —
  // the Abilities sheet says "Uncheck to turn this off for this app" and means
  // it, so the frame can mount without allow-pointer-lock. The engine asks for
  // the lock inside a try/catch and the browser's refusal is a SecurityError
  // thrown in here, where nobody sees it: the game starts, renders, sounds
  // right, and the view will not turn. A first-person game that silently cannot
  // look around reads as a broken game, not as a setting, so say which it is.
  //
  // Detected by the OUTCOME rather than by asking whether the capability is on,
  // which also covers a browser that refuses the lock for its own reasons.
  function checkAiming() {
    if (matchMedia('(pointer: coarse)').matches) return;   // a thumb needs no lock
    setTimeout(function () {
      if (document.pointerLockElement) return;
      var n = document.createElement('div');
      n.id = 'no-pointer';
      n.innerHTML = 'The mouse pointer is switched off for this app, so you can move but not aim.<br>' +
        'Turn on <b>“Take over the mouse pointer while you play”</b> in Abilities, then reopen FPS Simple.';
      document.body.appendChild(n);
      // If it is ever granted — the player fixed it, or the browser simply took
      // a second click — the warning has stopped being true. Take it down.
      document.addEventListener('pointerlockchange', function () {
        if (document.pointerLockElement && n.parentNode) n.remove();
      });
    }, 900);
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
