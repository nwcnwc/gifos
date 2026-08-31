/*
 * HexGL — GifOS shell.
 *
 * Loads packed .assets/ into blob URLs / JSON, starts the vendored game,
 * keeps best times in gifos.db, and paints live ghosts. Invite is OS
 * chrome — this file never draws an Invite button.
 */
(function (root) {
  'use strict';

  var prefs = { mute: false, quality: null, hud: true, best: 0, replay: null };
  var hexGL = null;
  var racing = false;
  var starting = false;
  var ghostMesh = null;
  var ghostCtl = null;
  var ghostData = null;
  var remoteMeshes = {};


  function $(id) { return document.getElementById(id); }
  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 520;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  }
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) { return false; }
  }
  function fmtMs(ms) {
    if (!ms || ms < 0) return '—';
    var t = bkcore.Timer.msToTime(ms);
    return t.m + "'" + t.s + "''" + t.ms;
  }
  function bootNote(msg) {
    var el = $('boot-note');
    if (el) el.textContent = msg;
  }
  function bootBar(frac) {
    var el = $('boot-bar');
    if (el) el.style.width = Math.max(0, Math.min(100, frac * 100)).toFixed(1) + '%';
  }

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('prefs').then(function (row) {
      if (!row) return;
      if (row.mute != null) prefs.mute = !!row.mute;
      if (row.quality != null) prefs.quality = row.quality | 0;
      if (row.hud != null) prefs.hud = !!row.hud;
      if (row.best) prefs.best = row.best | 0;
      if (row.replay && row.replay.length) prefs.replay = row.replay;
    }).catch(function () {});
  }
  function savePrefs() {
    if (!root.gifos || !root.gifos.db) return;
    root.gifos.db('prefs').put({
      id: 'prefs',
      mute: prefs.mute,
      quality: prefs.quality,
      hud: prefs.hud,
      best: prefs.best,
      replay: prefs.replay || null
    }).catch(function () {});
  }

  function mimeOf(k) {
    if (/\.png$/i.test(k)) return 'image/png';
    if (/\.jpe?g$/i.test(k)) return 'image/jpeg';
    if (/\.ogg$/i.test(k)) return 'audio/ogg';
    if (/\.js$/i.test(k)) return 'application/json';
    return 'application/octet-stream';
  }

  function loadPackedAssets(done) {
    var idx = root.HEXGL_ASSET_INDEX;
    root.HEXGL_URLS = root.HEXGL_URLS || {};
    root.HEXGL_GEOMS = root.HEXGL_GEOMS || {};
    root.HEXGL_BUFFERS = root.HEXGL_BUFFERS || {};
    if (!idx) { done(new Error('asset index missing')); return; }
    var g = root.gifos;
    var keys = Object.keys(idx);
    if (!g || typeof g.assets !== 'function') {
      bootNote('This GifOS cannot hand HexGL its track — update GifOS, then open the app again.');
      done(new Error('no gifos.assets'));
      return;
    }
    var total = 0, got = 0, i;
    for (i = 0; i < keys.length; i++) total += idx[keys[i]] || 1;
    var next = 0, inflight = 0, missing = [];
    var mb = function (n) { return (n / 1048576).toFixed(1); };
    function land(k, buf) {
      if (/\.js$/i.test(k)) {
        var text = new TextDecoder('utf-8').decode(buf);
        root.HEXGL_GEOMS[k] = JSON.parse(text);
        return;
      }
      if (/^audio\//i.test(k)) {
        root.HEXGL_BUFFERS[k] = buf;
        return;
      }
      root.HEXGL_URLS[k] = URL.createObjectURL(new Blob([buf], { type: mimeOf(k) }));
    }
    function settle(k) {
      got += idx[k] || 1;
      inflight--;
      bootBar(got / total);
      bootNote('Carrying the track in — ' + mb(got) + ' of ' + mb(total) + ' MB.');
      pump();
    }
    function fetchOne(k, retried) {
      inflight++;
      g.assets(k).then(function (buf) {
        land(k, buf);
        settle(k);
      }).catch(function () {
        inflight--;
        if (!retried) { fetchOne(k, true); return; }
        missing.push(k);
        inflight++;
        settle(k);
      });
    }
    function pump() {
      while (inflight < 4 && next < keys.length) fetchOne(keys[next++], false);
      if (!inflight && next >= keys.length) {
        bootBar(1);
        if (missing.length) bootNote(missing.length + ' pieces did not arrive.');
        else bootNote('Opening the garage…');
        done(missing.length ? new Error('missing ' + missing.length) : null);
      }
    }
    pump();
  }

  function compactReplay(data) {
    if (!data || !data.length) return null;
    var out = [];
    var lastT = -1e9;
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row || row[0] - lastT < 80) continue;
      out.push([
        row[0] | 0,
        Math.round(row[1] * 10) / 10,
        Math.round(row[2] * 10) / 10,
        Math.round(row[3] * 10) / 10,
        Math.round(row[4] * 1000) / 1000,
        Math.round(row[5] * 1000) / 1000,
        Math.round(row[6] * 1000) / 1000,
        Math.round(row[7] * 1000) / 1000
      ]);
      lastT = row[0];
      if (out.length >= 4000) break;
    }
    return out.length ? out : null;
  }

  function paintBest() {
    var el = $('best-line');
    if (el) el.textContent = prefs.best ? ('Best ' + fmtMs(prefs.best)) : 'Best —';
  }
  function paintQuality() {
    var el = $('s-quality');
    if (el) el.textContent = 'Quality: ' + (prefs.quality === 0 ? 'Low' : 'Mid');
  }
  function paintHud() {
    var el = $('s-hud');
    if (el) el.textContent = 'HUD: ' + (prefs.hud ? 'On' : 'Off');
  }
  function paintMute() {
    var el = $('s-mute');
    if (el) el.textContent = 'Sound: ' + (prefs.mute ? 'Off' : 'On');
  }

  function applyMute() {
    if (!root.bkcore || !root.bkcore.Audio) return;
    if (!root.bkcore.Audio._playRaw) {
      root.bkcore.Audio._playRaw = root.bkcore.Audio.play;
      root.bkcore.Audio.play = function (id) {
        if (prefs.mute) return;
        return root.bkcore.Audio._playRaw.call(this, id);
      };
    }
    try {
      root.bkcore.Audio.volume('bg', prefs.mute ? 0 : 1);
      root.bkcore.Audio.volume('wind', prefs.mute ? 0 : 0.35);
    } catch (e) {}
  }

  function defaultQuality() {
    if (prefs.quality === 0 || prefs.quality === 1) return prefs.quality;
    return phoneish() ? 0 : 1;
  }

  function show(id) {
    ['boot', 'menu', 'credits', 'load', 'race', 'finish', 'nowebgl'].forEach(function (k) {
      var el = $(k);
      if (el) el.hidden = k !== id;
    });
  }

  function paintRoster(list) {
    var note = $('room-note');
    var n = (list ? list.length : 0) + 1;
    var live = root.Net && root.Net.live() && n > 1;
    if (note) {
      note.textContent = live
        ? (n + ' ships — Invite ghosts race the same line')
        : '';
    }
    var board = $('ghost-board');
    var rows = $('board-rows');
    if (!board || !rows) return;
    if (!live) { board.hidden = true; return; }
    board.hidden = false;
    var html = '<div class="board-row me"><span>' + escapeHtml((root.Net.me() && root.Net.me().name) || 'You') + '</span><span>' + fmtMs(prefs.best) + '</span></div>';
    for (var i = 0; i < list.length; i++) {
      html += '<div class="board-row"><span>' + escapeHtml(list[i].name) + '</span><span>' + fmtMs(list[i].best || list[i].fin) + '</span></div>';
    }
    rows.innerHTML = html;
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function makeGhostMaterial(hue) {
    var colors = [0x66ddff, 0xff88aa, 0xaaff88, 0xffdd66, 0xcc88ff];
    var c = colors[Math.abs(hue | 0) % colors.length];
    return new THREE.MeshBasicMaterial({
      color: c,
      opacity: 0.42,
      transparent: true,
      depthWrite: false
    });
  }

  function ensureGhosts() {
    if (!hexGL || !hexGL.track || !hexGL.track.lib) return;
    var geom = hexGL.track.lib.get('geometries', 'ship.feisar');
    var scene = hexGL.manager.get('game') && hexGL.manager.get('game').scene;
    if (!geom || !scene) return;
    if (!ghostMesh && prefs.replay && prefs.replay.length) {
      ghostMesh = new THREE.Mesh(geom, makeGhostMaterial(190));
      ghostMesh.useQuaternion = true;
      scene.add(ghostMesh);
      ghostCtl = {
        teleport: function (p, q) {
          ghostMesh.position.copy(p);
          ghostMesh.quaternion.copy(q);
          ghostMesh.visible = true;
        }
      };
      ghostData = new bkcore.hexgl.RaceData('Cityscape', 'replay', ghostCtl);
      ghostData.import(prefs.replay);
    }
  }

  function tickGhosts() {
    if (!hexGL || !racing) return;
    var gp = hexGL.gameplay;
    var t = gp && gp.timer ? gp.timer.time.elapsed : 0;
    if (ghostData && ghostCtl && ghostMesh && gp && gp.step >= 4) {
      if (ghostData.seek >= ghostData.last) ghostMesh.visible = false;
      else try { ghostData.applyInterpolated(t); } catch (e) {}
    }
    var scene = hexGL.manager.get('game') && hexGL.manager.get('game').scene;
    var geom = hexGL.track && hexGL.track.lib && hexGL.track.lib.get('geometries', 'ship.feisar');
    if (scene && geom && root.Net) {
      var list = root.Net.ghosts();
      var seen = {};
      for (var i = 0; i < list.length; i++) {
        var g = list[i];
        seen[g.id] = 1;
        var mesh = remoteMeshes[g.id];
        if (!mesh) {
          mesh = new THREE.Mesh(geom, makeGhostMaterial(g.hue));
          mesh.useQuaternion = true;
          scene.add(mesh);
          remoteMeshes[g.id] = mesh;
        }
        mesh.position.set(g.x, g.y, g.z);
        mesh.quaternion.set(g.qx, g.qy, g.qz, g.qw);
        mesh.visible = true;
      }
      for (var id in remoteMeshes) {
        if (!seen[id]) remoteMeshes[id].visible = false;
      }
    }
    publishPose();
  }

  function publishPose(force) {
    if (!root.Net || !hexGL || !hexGL.components || !hexGL.components.shipControls) return;
    var c = hexGL.components.shipControls;
    var p = c.getPosition();
    var q = c.getQuaternion();
    var gp = hexGL.gameplay;
    root.Net.publish({
      x: p.x, y: p.y, z: p.z,
      qx: q.x, qy: q.y, qz: q.z, qw: q.w,
      lap: gp ? gp.lap : 0,
      fin: gp && gp.finishTime ? gp.finishTime : 0,
      best: prefs.best
    }, force);
  }

  function wrapLoop() {
    var orig = hexGL.update.bind(hexGL);
    hexGL.update = function () {
      tickGhosts();
      orig();
    };
  }

  function onFinish(f, laps, gameplay) {
    racing = false;
    var finished = gameplay && gameplay.result === gameplay.results.FINISH;
    var ms = gameplay && gameplay.finishTime ? gameplay.finishTime : 0;
    $('finish-state').textContent = finished ? 'Finished' : 'Destroyed';
    $('finish-time').textContent = finished ? fmtMs(ms) : '—';
    var lapHtml = '';
    if (finished && laps) {
      for (var i = 0; i < 3; i++) {
        var L = laps[i];
        lapHtml += 'Lap ' + (i + 1) + '  ' + (L ? fmtMs(typeof L === 'number' ? L : (L.m * 60000 + L.s * 1000 + L.ms)) : '—') + (i < 2 ? '   ' : '');
      }
    }
    // laps from gameplay.lapTimes are raw ms
    if (finished && gameplay && gameplay.lapTimes) {
      lapHtml = gameplay.lapTimes.map(function (n, i) { return 'L' + (i + 1) + ' ' + fmtMs(n); }).join('   ');
    }
    $('finish-laps').textContent = lapHtml;
    if (finished && ms && (!prefs.best || ms < prefs.best)) {
      prefs.best = ms;
      if (gameplay.raceData) prefs.replay = compactReplay(gameplay.raceData.export());
      savePrefs();
      paintBest();
      $('finish-msg').textContent = 'New best';
      if (ghostData && prefs.replay) {
        ghostData.import(prefs.replay);
        ghostData.reset();
      }
    } else {
      $('finish-msg').textContent = finished ? 'Well done' : 'Maybe next time';
    }
    $('finish-best').textContent = prefs.best ? ('Best ' + fmtMs(prefs.best)) : '';
    show('finish');
    publishPose(true);
    try {
      if (root.bkcore.Audio) {
        root.bkcore.Audio.stop('bg');
        root.bkcore.Audio.stop('wind');
      }
    } catch (e) {}
  }

  function startRace() {
    if (starting || racing) return;
    if (!hasWebGL()) { show('nowebgl'); return; }
    starting = true;
    if (root.bkcore && root.bkcore.Audio && root.bkcore.Audio._ctx && root.bkcore.Audio._ctx.resume) {
      root.bkcore.Audio._ctx.resume().catch(function () {});
    }
    show('load');
    var quality = defaultQuality();
    prefs.quality = quality;
    savePrefs();
    var hex = new bkcore.hexgl.HexGL({
      document: document,
      width: window.innerWidth,
      height: window.innerHeight,
      container: $('main'),
      overlay: $('overlay'),
      gameover: null,
      quality: quality,
      difficulty: 0,
      hud: prefs.hud,
      controlType: 0,
      godmode: false,
      track: 'Cityscape'
    });
    hexGL = hex;
    window.hexGL = hex;
    hex.displayScore = function (f, l) {
      this.active = false;
      onFinish(f, l, this.gameplay);
    };
    var bar = $('progressbar');
    hex.load({
      onLoad: function () {
        hex.init();
        var c = hex.components.shipControls;
        if (c && root.Touch) root.Touch.attach(c);
        wrapLoop();
        ensureGhosts();
        if (ghostData) ghostData.reset();
        starting = false;
        racing = true;
        show('race');
        tryLock();
        hex.start();
        applyMute();
        publishPose(true);
      },
      onError: function (s) {
        starting = false;
        bootNote('Could not load ' + s);
        show('menu');
      },
      onProgress: function (p) {
        if (bar) bar.style.width = (p.loaded / p.total * 100) + '%';
      }
    });
  }

  function tryLock() {
    if (!root.gifos) return;
    var el = $('race');
    if (el && el.requestFullscreen && phoneish()) {
      el.requestFullscreen().then(function () {
        if (root.screen && root.screen.orientation && root.screen.orientation.lock) {
          return root.screen.orientation.lock('landscape').catch(function () {});
        }
      }).catch(function () {});
    }
  }

  function stopRace(toMenu) {
    racing = false;
    starting = false;
    if (hexGL) {
      hexGL.active = false;
      try {
        if (root.bkcore.Audio) {
          root.bkcore.Audio.stop('bg');
          root.bkcore.Audio.stop('wind');
          root.bkcore.Audio.stop('boost');
        }
      } catch (e) {}
      if (hexGL._onEsc) {
        hexGL.document.removeEventListener('keydown', hexGL._onEsc, false);
      }
      if (hexGL.renderer && hexGL.renderer.domElement && hexGL.renderer.domElement.parentNode) {
        hexGL.renderer.domElement.parentNode.removeChild(hexGL.renderer.domElement);
      }
      hexGL = null;
      window.hexGL = null;
    }
    ghostMesh = null;
    ghostCtl = null;
    ghostData = null;
    remoteMeshes = {};
    $('main').innerHTML = '';
    $('overlay').innerHTML = '';
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(function () {});
    }
    if (toMenu) show('menu');
  }

  function raceAgain() {
    show('load');
    $('progressbar').style.width = '0%';
    stopRace(false);
    setTimeout(startRace, 40);
  }

  function wireMenu() {
    $('start').onclick = function () { startRace(); };
    $('s-quality').onclick = function () {
      prefs.quality = defaultQuality() === 0 ? 1 : 0;
      paintQuality();
      savePrefs();
    };
    $('s-hud').onclick = function () {
      prefs.hud = !prefs.hud;
      paintHud();
      savePrefs();
    };
    $('s-mute').onclick = function () {
      prefs.mute = !prefs.mute;
      paintMute();
      savePrefs();
      applyMute();
    };
    $('s-credits').onclick = function () { show('credits'); };
    $('credits').onclick = function () { show('menu'); };
    $('again').onclick = function () { raceAgain(); };
    $('to-menu').onclick = function () { stopRace(true); };
  }

  function boot() {
    if (!hasWebGL()) { show('nowebgl'); return; }
    if (prefs.quality == null) prefs.quality = defaultQuality();
    paintBest();
    paintQuality();
    paintHud();
    paintMute();
    wireMenu();
    root.Touch.init();
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (!$('credits').hidden) { show('menu'); return true; }
        if (!$('finish').hidden) { stopRace(true); return true; }
        if (racing) { stopRace(true); return true; }
        return false;
      });
    }
    var roomP = root.Net ? root.Net.init() : Promise.resolve({ owner: true, others: 0 });
    roomP.then(function () {
      if (root.Net) root.Net.onRoster(paintRoster);
      paintRoster(root.Net ? root.Net.roster() : []);
    });
    show('menu');
  }

  function begin() {
    loadPrefs().then(function () {
      loadPackedAssets(function (err) {
        if (err && !Object.keys(root.HEXGL_URLS || {}).length) {
          bootNote('The track did not arrive. Reopen the app.');
          return;
        }
        boot();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin);
  else begin();
})(window);
