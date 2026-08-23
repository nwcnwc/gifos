/*
 * Air Hockey — GifOS shell around MortimerGoro's AirHockeyWebGL.
 *
 * vendor/* is the unmodified upstream (three r66, box2dweb, the table,
 * paddles, puck, ice, physics, AI). Everything GifOS-specific lives here:
 * no dat.GUI, loaders that do not XHR (the sandbox blocks it), Web Audio
 * fallback, touch, and two-device play over gifos.db.
 *
 * MULTIPLAYER. Invite is OS chrome — this app never draws a share button.
 * The host (the person who opened the app) is the near paddle and simulates
 * the puck. The friend writes only their own paddle. Nobody writes anybody
 * else's row.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 20;
  var STALE_MS = 2500;

  var api = root.gifos || null;
  var me = { id: 'local', name: 'You' };
  var owner = true;
  var others = {};
  var opponent = null;
  var hadOpponent = false;
  var acc = 0;
  var netReady = !api;
  var soundOn = true;
  var actx = null;
  var gameScene = null;
  var renderer = null;
  var canvas = null;
  var projector = null;

  var hint = document.getElementById('hint');
  var soundBtn = document.getElementById('soundBtn');
  var scoreA = document.getElementById('playerA_score');
  var scoreB = document.getElementById('playerB_score');

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function db(n) { return api && api.db ? api.db(n) : null; }
  function now() { return Date.now(); }
  function isMp() { return !!(opponent && (now() - opponent.seen) < STALE_MS); }
  function round(n) { return Math.round(n * 1000) / 1000; }

  /* ------------------------------------------------------------------ */
  /* loaders — CSP connect-src is none; XHR/Image src paths never fire   */
  /* ------------------------------------------------------------------ */

  function patchLoaders() {
    THREE.ImageUtils.loadTexture = function (url, mapping, onLoad) {
      var img = document.querySelector('img[data-src="' + url + '"]');
      var texture = new THREE.Texture(img || undefined, mapping);
      function apply() {
        if (img) texture.image = img;
        texture.needsUpdate = true;
        if (onLoad) onLoad(texture);
      }
      if (img && img.complete && img.naturalWidth) apply();
      else if (img) img.addEventListener('load', apply);
      else apply();
      return texture;
    };

    THREE.OBJMTLLoader.prototype.load = function (url, mtlurl, onLoad) {
      var files = root.HOCKEY_FILES || {};
      var objText = files[url];
      var mtlText = files[mtlurl];
      if (objText == null || mtlText == null) {
        throw new Error('missing model ' + url + ' / ' + mtlurl);
      }
      var scope = this;
      var mtlLoader = new THREE.MTLLoader(url.substr(0, url.lastIndexOf('/') + 1));
      var materials = mtlLoader.parse(mtlText);
      materials.preload();
      var object = scope.parse(objText);
      object.traverse(function (obj) {
        if (obj instanceof THREE.Mesh && obj.material && obj.material.name) {
          var mat = materials.create(obj.material.name);
          if (mat) obj.material = mat;
        }
      });
      onLoad(object);
    };
  }

  /* ------------------------------------------------------------------ */
  /* sounds — original Audio() src paths cannot load; use the hidden     */
  /* <audio> tags (rewritten to data URLs) and a beep if they fail       */
  /* ------------------------------------------------------------------ */

  function resumeAudio() {
    try {
      if (!actx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (AC) actx = new AC();
      }
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }

  function beep(freq, dur) {
    if (!actx || !soundOn) return;
    try {
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.08, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur);
    } catch (e) {}
  }

  function playEl(el, volume, fallback) {
    if (!soundOn || !el) { if (fallback) fallback(); return; }
    try {
      var a = el.cloneNode(true);
      a.volume = volume || 0.5;
      var p = a.play();
      if (p && p.catch) p.catch(function () { if (fallback) fallback(); });
    } catch (e) { if (fallback) fallback(); }
  }

  Hockey.Audio.init = function (model) {
    this.model = model;
    this.hitSounds = [document.getElementById('aud-hit1'), document.getElementById('aud-hit2')];
    this.edgeSounds = [document.getElementById('aud-edge1'), document.getElementById('aud-edge2')];
    this.goalSounds = [document.getElementById('aud-goal1')];
  };
  Hockey.Audio.playRandomSound = function (target, volume) {
    if (!this.model || !this.model.soundEnabled || !target || !target.length) return;
    var el = target[Math.floor(Math.random() * target.length)];
    playEl(el, volume, function () {
      if (target === Hockey.Audio.hitSounds) beep(520, 0.06);
      else if (target === Hockey.Audio.edgeSounds) beep(240, 0.05);
      else beep(330, 0.12);
    });
  };
  Hockey.Audio.playHitSound = function (volume) { this.playRandomSound(this.hitSounds, volume); };
  Hockey.Audio.playGoalSound = function (volume) { this.playRandomSound(this.goalSounds, volume); };
  Hockey.Audio.playEdgeSound = function (volume) { this.playRandomSound(this.edgeSounds, volume); };

  Hockey.GameModel.prototype.createGUI = function () {};

  /* Upstream AI.js references an undeclared `paddle` when defending the
     goal mouth. Same function, that identifier is myPos. */
  Hockey.AI.prototype.play = function () {
    var model = this.model;
    var myPos = model.playerB.paddle.position;
    var tableSize = model.tableSize;
    var paddleRadius = model.playerB.radius;
    var targetPuck = null;
    var bestHeuristic = 0;
    var targetPos = new THREE.Vector3(0, 0, 0);

    for (var i = 0; i < model.pucks.length; ++i) {
      var puck = model.pucks[i];
      var score = this.heuristic(puck);
      if (score > 0 && score > bestHeuristic) {
        targetPuck = puck;
        bestHeuristic = score;
      }
    }

    if (targetPuck) {
      var puckPos = targetPuck.mesh.position;
      targetPos.set(puckPos.x, tableSize.height, puckPos.z - paddleRadius * 0.9 - targetPuck.radius * 0.9);
    } else {
      targetPos.set(0, tableSize.height, -tableSize.depth * 0.4);
    }

    targetPos.x = Math.max(-tableSize.width / 2 + paddleRadius, targetPos.x);
    targetPos.x = Math.min(tableSize.width / 2 - paddleRadius, targetPos.x);
    targetPos.z = Math.min(0, targetPos.z);
    targetPos.z = Math.max(-tableSize.depth / 2 + paddleRadius, targetPos.z);

    if (targetPos.z + paddleRadius < (-tableSize.depth * (0.5 - model.goalSize.depth))
        && Math.abs(myPos.x) < tableSize.width * model.goalSize.width * 0.5 + paddleRadius) {
      myPos.z = -tableSize.depth * (0.5 - model.goalSize.depth) + paddleRadius;
    }

    var diffX = Math.abs(targetPos.x - myPos.x);
    var diffZ = Math.abs(targetPos.z - myPos.z);
    var speed = 0.1 + 0.9 * model.difficulty;
    var speedX = tableSize.width * 0.03 * speed;
    var speedZ = tableSize.depth * 0.03 * speed;
    myPos.x += Math.min(diffX, speedX) * (myPos.x > targetPos.x ? -1 : 1);
    myPos.z += Math.min(diffZ, speedZ) * (myPos.z > targetPos.z ? -1 : 1);
  };

  /* ------------------------------------------------------------------ */
  /* start the original scene                                            */
  /* ------------------------------------------------------------------ */

  function whenImages(fn) {
    var imgs = [document.getElementById('tex-floor'), document.getElementById('tex-surface')];
    var left = imgs.length;
    function one() { if (--left <= 0) fn(); }
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete) one();
      else {
        imgs[i].addEventListener('load', one);
        imgs[i].addEventListener('error', one);
      }
    }
  }

  function init() {
    patchLoaders();
    projector = new THREE.Projector();

    canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas });
    renderer.setClearColor(0x000000);
    document.getElementById('container').appendChild(canvas);

    var model = new Hockey.GameModel();
    model.numPucks = 1;
    model.soundEnabled = soundOn;
    gameScene = new Hockey.GameScene(renderer, model);

    var origUpdate = Hockey.GameScene.prototype.update;
    Hockey.GameScene.prototype.update = function () {
      if (this.model.state === Hockey.GameModel.STATES.LOADING) return;
      if (!this.model.playerA || !this.model.playerA.paddle) return;
      if (isMp() && !owner) {
        guestUpdate(this);
        return;
      }
      if (isMp() && owner && opponent && this.model.playerB.paddle) {
        this.model.playerB.paddle.position.x = opponent.x;
        this.model.playerB.paddle.position.z = opponent.z;
        this.model.playerB.paddle.position.y = this.model.tableSize.height;
        var ai = this.ai;
        this.ai = { play: function () {} };
        try { origUpdate.call(this); } catch (e) {}
        this.ai = ai;
        return;
      }
      try { origUpdate.call(this); } catch (e) {}
    };

    Hockey.GameScene.prototype.updateScores = function () {
      paintScores();
    };

    fit();
    window.addEventListener('resize', fit);

    canvas.addEventListener('pointerdown', function (ev) {
      resumeAudio();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      if (gameScene) gameScene.processInput(ev.clientX, ev.clientY);
      ev.preventDefault();
    }, { passive: false });
    canvas.addEventListener('pointermove', function (ev) {
      if (gameScene) gameScene.processInput(ev.clientX, ev.clientY);
      ev.preventDefault();
    }, { passive: false });

    var last = now();
    function frame() {
      var t = now();
      var dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (gameScene) gameScene.render();
      publish(dt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    setHint();
    paintScores();
  }

  function fit() {
    if (!renderer || !canvas) return;
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    renderer.setSize(canvas.width, canvas.height);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    if (gameScene && gameScene.camera) {
      gameScene.camera.aspect = w / h;
      gameScene.camera.updateProjectionMatrix();
    }
  }

  /* ------------------------------------------------------------------ */
  /* guest: paint host puck, move own paddle, never simulate a goal      */
  /* ------------------------------------------------------------------ */

  function guestUpdate(scene) {
    var model = scene.model;
    var tableSize = model.tableSize;
    if (!tableSize || !tableSize.width || !model.playerB.paddle) return;

    var camera = scene.camera;
    var cy = 2.5 + tableSize.height;
    camera.position.set(0, cy, -tableSize.depth);
    camera.lookAt(new THREE.Vector3(0, tableSize.height, 0));

    var px = (scene.input.x / window.innerWidth) * 2 - 1;
    var py = -(scene.input.y / window.innerHeight) * 2 + 1;
    var vector = new THREE.Vector3(px, py, 0.5);
    projector.unprojectVector(vector, camera);
    var ray = new THREE.Ray(camera.position.clone(), vector.sub(camera.position).normalize());
    var intersect = ray.intersectPlane(scene.inputPlane);

    var paddle = model.playerB.paddle;
    var paddleRadius = model.playerB.radius;
    if (intersect) {
      paddle.position.x = Math.max(-tableSize.width / 2 + paddleRadius, Math.min(tableSize.width / 2 - paddleRadius, intersect.x));
      paddle.position.z = Math.min(0, intersect.z);
      paddle.position.z = Math.max(-tableSize.depth / 2 + paddleRadius, paddle.position.z);
      paddle.position.y = tableSize.height;
      if (paddle.position.z - paddleRadius < (-tableSize.depth * (0.5 - model.goalSize.depth))
          && Math.abs(paddle.position.x) < tableSize.width * model.goalSize.width * 0.5 + paddleRadius) {
        paddle.position.z = -tableSize.depth * (0.5 - model.goalSize.depth) + paddleRadius;
      }
    }

    if (!opponent) return;
    if (model.playerA.paddle && opponent.ax != null) {
      model.playerA.paddle.position.x = opponent.ax;
      model.playerA.paddle.position.z = opponent.az;
      model.playerA.paddle.position.y = tableSize.height;
    }
    if (opponent.pucks && model.pucks) {
      var age = Math.max(0, Math.min(0.12, (now() - opponent.seen) / 1000));
      for (var i = 0; i < model.pucks.length && i < opponent.pucks.length; i++) {
        var src = opponent.pucks[i];
        var dst = model.pucks[i];
        if (!dst || !dst.mesh) continue;
        dst.mesh.position.x = src.x + (src.vx || 0) * age;
        dst.mesh.position.z = src.z + (src.vz || 0) * age;
        dst.active = !!src.on;
        dst.mesh.traverse(function (o) { o.visible = !!src.on; });
      }
    }
    if (opponent.sa != null) model.playerA.score = opponent.sa;
    if (opponent.sb != null) model.playerB.score = opponent.sb;
    paintScores();
  }

  /* ------------------------------------------------------------------ */
  /* net — each player owns exactly one row                              */
  /* ------------------------------------------------------------------ */

  function ingest(list) {
    var t = now(), seen = {};
    opponent = null;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.z !== p.z || cur.stamp !== p.t || cur.host !== p.host;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Friend',
        x: p.x, z: p.z,
        ax: p.ax, az: p.az,
        stamp: p.t,
        seen: moved ? t : cur.seen,
        host: p.host,
        pucks: p.pucks,
        sa: p.sa, sb: p.sb
      };
    }
    for (var id in others) if (!seen[id] || t - others[id].seen > STALE_MS) delete others[id];

    var ids = Object.keys(others).sort();
    if (!owner) {
      for (var j = 0; j < ids.length; j++) {
        if (others[ids[j]].host) { opponent = others[ids[j]]; break; }
      }
      if (!opponent && ids.length) opponent = others[ids[0]];
    } else if (ids.length) {
      opponent = others[ids[0]];
    }
    maybeSwitchMode();
  }

  function maybeSwitchMode() {
    var want = isMp();
    if (want && !hadOpponent) {
      hadOpponent = true;
      if (gameScene && gameScene.model) {
        gameScene.model.playerA.score = 0;
        gameScene.model.playerB.score = 0;
        if (gameScene.prepareToServe) gameScene.prepareToServe();
      }
    } else if (!want && hadOpponent) {
      hadOpponent = false;
    }
    setHint();
    paintScores();
  }

  function myPaddle() {
    if (!gameScene || !gameScene.model) return null;
    return (!isMp() || owner) ? gameScene.model.playerA.paddle : gameScene.model.playerB.paddle;
  }

  function publish(dt) {
    var players = db('players');
    if (!netReady || !players || !me.id || me.id === 'local') return;
    if (!gameScene || !gameScene.model || gameScene.model.state === Hockey.GameModel.STATES.LOADING) return;
    var paddle = myPaddle();
    if (!paddle) return;
    acc += dt;
    if (acc < 1 / PUBLISH_HZ) return;
    acc = 0;
    var rec = {
      id: me.id,
      name: me.name,
      x: round(paddle.position.x),
      z: round(paddle.position.z),
      t: now()
    };
    if (owner) {
      rec.host = 1;
      rec.ax = rec.x;
      rec.az = rec.z;
      rec.sa = gameScene.model.playerA.score;
      rec.sb = gameScene.model.playerB.score;
      rec.pucks = [];
      var list = gameScene.model.pucks || [];
      for (var i = 0; i < list.length; i++) {
        var puck = list[i];
        var v = gameScene.simulation ? gameScene.simulation.getPuckVelocity(puck.mesh) : { x: 0, y: 0 };
        rec.pucks.push({
          x: round(puck.mesh.position.x),
          z: round(puck.mesh.position.z),
          vx: round(v.x || 0),
          vz: round(v.y || 0),
          on: puck.active ? 1 : 0
        });
      }
    }
    players.put(rec).catch(function () {});
  }

  function bootNet() {
    if (!api || !api.db) return;
    var ready = [];
    if (api.me) ready.push(api.me().then(function (m) {
      me.id = (m && m.id) || 'local';
      me.name = (m && m.name) || 'You';
    }).catch(function () {}));
    if (api.info) ready.push(api.info().then(function (i) {
      owner = !!(i && i.owner);
    }).catch(function () {}));
    Promise.all(ready).then(function () {
      netReady = true;
      db('players').subscribe(function (list) { ingest(list || []); });
      setHint();
      paintScores();
    });
  }

  /* ------------------------------------------------------------------ */
  /* chrome                                                              */
  /* ------------------------------------------------------------------ */

  function paintScores() {
    if (!gameScene || !gameScene.model) return;
    var a = gameScene.model.playerA.score || 0;
    var b = gameScene.model.playerB.score || 0;
    var left = owner || !isMp() ? (me.name || 'You') : ((opponent && opponent.name) || 'Host');
    var right;
    if (isMp()) right = owner ? ((opponent && opponent.name) || 'Friend') : (me.name || 'You');
    else right = 'CPU';
    scoreA.textContent = left + ': ' + a;
    scoreB.textContent = right + ': ' + b;
  }

  function setHint() {
    if (isMp()) {
      hint.textContent = owner
        ? 'You are this end · drag your paddle'
        : 'You are the far end · drag your paddle';
    } else {
      hint.textContent = 'Drag your paddle · Press Invite for a friend';
    }
  }

  function setSound(on) {
    soundOn = !!on;
    if (gameScene && gameScene.model) gameScene.model.soundEnabled = soundOn;
    soundBtn.classList.toggle('off', !soundOn);
    soundBtn.textContent = soundOn ? '♪' : '×';
    var prefs = db('prefs');
    if (prefs) prefs.put({ id: 'sound', on: soundOn }).catch(function () {});
  }
  soundBtn.addEventListener('click', function (ev) {
    ev.stopPropagation();
    resumeAudio();
    setSound(!soundOn);
  });

  var prefs = db('prefs');
  if (prefs && prefs.get) {
    Promise.resolve(prefs.get('sound')).then(function (r) {
      if (r && r.on === false) setSound(false);
    }).catch(function () {});
  }

  setHint();
  bootNet();
  whenImages(init);
})(window);
