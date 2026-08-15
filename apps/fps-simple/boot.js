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

  var engine = null, ctx = null, player = null, ui = null, touch = null;
  var db = null, prefs = { quality: null, sensitivity: null, invertY: null, fov: null };
  var spawnSeq = 1, dead = false, respawnAt = 0, killedBy = '';
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
  function onIncomingHit(dmg, headshot, fromId, fromName) {
    if (!player || dead) return;
    var o = root.Net.others()[fromId];
    var from = null;
    if (o) { from = new root.COD.THREE.Vector3(o.x, o.y + 1.4, o.z); }
    player.applyDamage(dmg * (headshot ? 1 : 1), from, { type: 'bullet' });
    killedBy = fromName;
    pushSelf();
  }

  function onDeath() {
    if (dead) return;
    dead = true;
    deaths++;
    respawnAt = Date.now() + RESPAWN_MS;
    player.setControlEnabled(false);
    root.Net.setSelf({ hp: 0, alive: false, spawn: spawnSeq, deaths: deaths, killedBy: lastKillerId() });
    root.Net.publish(true);
    banner(killedBy ? 'Killed by ' + killedBy : 'You died', true);
  }

  function lastKillerId() {
    var others = root.Net.others();
    for (var id in others) if (others[id].name === killedBy) return id;
    return null;
  }

  function doRespawn() {
    dead = false;
    killedBy = '';
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
    root.Net.setSelf({
      hp: player.health ? player.health.value : 100,
      alive: !dead, spawn: spawnSeq, deaths: deaths,
      killedBy: dead ? lastKillerId() : null,
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
      var config = COD.createConfig({ quality: prefs.quality || defaultQuality() });
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

        touch = root.Touch.init(engine.input, ui);
        root.__FPS_POSE__ = pose;
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
  });

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
