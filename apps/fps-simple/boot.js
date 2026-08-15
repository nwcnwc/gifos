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
  var gate = document.getElementById('gate');
  var bar = document.getElementById('gate-bar');
  var note = document.getElementById('gate-note');
  var go = document.getElementById('gate-go');

  function say(text, pct) {
    if (text != null) note.textContent = text;
    if (pct != null) bar.style.width = Math.round(pct * 100) + '%';
  }

  function fatal(text) {
    say('', 1);
    note.innerHTML = '<b style="color:#e08b7a">' + text + '</b>';
    go.remove();
  }

  /* ------------------------------------------------------------------ */
  /* settings                                                           */
  /* ------------------------------------------------------------------ */

  // A phone is not a workstation. Upstream defaults to 'ultra', which is its
  // screenshot setting — its own README measures real gameplay at 12-17 fps and
  // 700-1200 ms stalls at high resolution. So: pick by device, let the player
  // override in the pause menu, and remember what they picked.
  // What the device can actually carry. Overridden by a saved preference, and
  // before that by root.GIFOS_FPS_QUALITY — a hatch for the suites, which run on
  // a software rasteriser where building the world at 'medium' takes ~35 s and a
  // two-peer deathmatch test would spend its life waiting on scenery it never
  // looks at. Same shape as GIFOS_CONN in the runtime, for the same reason.
  function defaultQuality() {
    var touchy = matchMedia('(pointer: coarse)').matches;
    var cores = navigator.hardwareConcurrency || 4;
    if (touchy) return cores >= 8 ? 'medium' : 'low';
    return cores >= 8 ? 'high' : 'medium';
  }

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    db = root.gifos.db('prefs');
    return db.get('settings').then(function (rec) {
      if (rec) prefs = { quality: rec.quality, sensitivity: rec.sensitivity, invertY: rec.invertY, fov: rec.fov };
    }).catch(function () {});
  }

  function savePrefs() {
    if (!db || !ctx) return;
    var c = ctx.config;
    db.put({ id: 'settings', quality: c.quality, sensitivity: c.sensitivity, invertY: !!c.invertY, fov: c.fov })
      .catch(function () {});
  }

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
    root.Net.tick();
    if (dead && Date.now() >= respawnAt) doRespawn();
    updateTally();
  };

  // Somebody's browser says they shot me. We are the authority on what that
  // costs us — see the note in net.js about why the target decides.
  // The wound arrives already scaled — the shooter's collider multiplier (which
  // is where the headshot bonus lives) and the range falloff are both applied
  // before it goes on the wire, so what is left for us is to take it.
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

    loadPrefs().then(function () {
      var config = COD.createConfig({ quality: root.GIFOS_FPS_QUALITY || prefs.quality || defaultQuality() });
      if (prefs.sensitivity != null) config.sensitivity = prefs.sensitivity;
      if (prefs.invertY != null) config.invertY = prefs.invertY;
      if (prefs.fov != null) config.fov = prefs.fov;

      engine = new COD.Engine({ canvas: canvas, config: config });
      // THE SHARED WORLD. Reseed before init(), because init() is where every
      // system draws the numbers that decide what the street looks like.
      engine.rng.seed(WORLD_SEED);

      engine
        .add(COD.RenderSystem).add(COD.MaterialSystem).add(COD.SkySystem)
        .add(COD.WorldSystem).add(COD.PhysicsSystem).add(COD.PlayerSystem)
        .add(COD.WeaponSystem).add(COD.FxSystem).add(COD.AiSystem)
        .add(COD.UiSystem).add(COD.AudioSystem)
        .add(NetplaySystem);

      say('Building the world…', 0.15);
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
        touch = root.Touch.init(engine.input, ui);
        root.__FPS_POSE__ = pose;
        // A handle on the running game, for the suites and for anyone poking at
        // it in a console. Upstream's own entry exposes window.__ENGINE__ for
        // the same reason; we do not use that entry, so this is where it lives.
        root.__FPS__ = { engine: engine, ctx: ctx, player: player, ui: ui, net: root.Net, remote: root.Remote };
        pushSelf();

        // Settings the player changes in the pause menu, kept for next time.
        ctx.events.on('ui:quality', savePrefs);
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
