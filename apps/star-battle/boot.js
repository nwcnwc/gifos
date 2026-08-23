/*
 * Star Battle — GifOS shell.
 *
 * Upstream uses localStorage for the rank list. A sandboxed GifOS frame is
 * an opaque origin: localStorage throws. This file runs first, hangs a
 * Storage-shaped object on window, and flushes the blob into gifos.db
 * ('prefs') — private, inside the icon. There is no cloud.
 *
 * It also rewrites Image() / Audio() / <img> paths through STAR_ASSETS so
 * a srcdoc iframe does not have to have an ./img directory, paints the
 * extra-ship scoreboard, and starts the Game once Net has settled.
 *
 * Invite is OS chrome — this file never draws an Invite button.
 */
(function (root) {
  'use strict';

  var mem = Object.create(null);
  var persistTimer = null;
  var prefs = { mute: false };
  var showScores = false;
  var game = null;
  var boardEl = document.getElementById('board');
  var scoreRows = document.getElementById('score-rows');
  var tally = document.getElementById('tally');
  var waitEl = document.getElementById('wait');
  var outEl = document.getElementById('out');
  var gateEl = document.getElementById('gate');
  var endEl = document.getElementById('endcard');
  var phud = document.getElementById('phud');
  var phudFuel = document.getElementById('phud-fuel');
  var phudScore = document.getElementById('phud-score');
  var portrait = false;
  var sceneName = 'start';

  function persist() {
    persistTimer = null;
    if (!root.gifos || !root.gifos.db) return;
    try {
      root.gifos.db('prefs').put({ id: 'ls', map: mem, mute: prefs.mute }).catch(function () {});
    } catch (e) {}
  }

  function schedule() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 250);
  }

  var ls = {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      mem[k] = String(v);
      schedule();
    },
    removeItem: function (k) {
      delete mem[k];
      schedule();
    },
    clear: function () {
      for (var k in mem) delete mem[k];
      schedule();
    },
    key: function (i) {
      return Object.keys(mem)[i] || null;
    },
    get length() { return Object.keys(mem).length; }
  };

  var nativeOk = false;
  try {
    var probe = root.localStorage;
    probe.setItem('__gifos_probe', '1');
    probe.removeItem('__gifos_probe');
    nativeOk = true;
  } catch (e) {
    nativeOk = false;
  }
  if (!nativeOk) {
    try {
      Object.defineProperty(root, 'localStorage', { value: ls, configurable: true });
    } catch (e2) {
      root.localStorage = ls;
    }
  }

  function norm(p) {
    return String(p || '').replace(/^\.\//, '').replace(/\/+/g, '/');
  }

  function applyAssets() {
    var A = root.STAR_ASSETS;
    if (!A) return;
    var k, key, nk;
    var byNorm = {};
    for (k in A) byNorm[norm(k)] = A[k];
    if (typeof config !== 'undefined' && config.images) {
      for (k in config.images) {
        nk = byNorm[norm(config.images[k])];
        if (nk) config.images[k] = nk;
      }
    }
    if (typeof config !== 'undefined' && config.audios) {
      for (k in config.audios) {
        nk = byNorm[norm(config.audios[k])];
        if (nk) config.audios[k] = nk;
      }
    }
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      key = imgs[i].getAttribute('src');
      nk = byNorm[norm(key)];
      if (nk) imgs[i].src = nk;
    }
  }

  function load() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('ls').then(function (row) {
      if (!row) return;
      if (row.map && typeof row.map === 'object') {
        for (var k in row.map) mem[k] = row.map[k];
      }
      if (row.mute != null) prefs.mute = !!row.mute;
    }).catch(function () {});
  }

  function escape(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function paintRoster(list) {
    if (!list || list.length < 2) {
      if (boardEl) boardEl.hidden = true;
      if (tally) tally.hidden = true;
      return;
    }
    if (tally) {
      tally.hidden = false;
      tally.textContent = list.length + ' ships';
    }
    if (!scoreRows) return;
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += '<tr class="' + (p.me ? 'me' : '') + (p.alive === false ? ' dead' : '') + '">' +
        '<td>' + escape(p.name) + (p.me ? ' (you)' : '') + '</td>' +
        '<td>' + (p.score | 0) + '</td>' +
        '<td>' + (p.fuel | 0) + '</td></tr>';
    }
    scoreRows.innerHTML = html;
    if (showScores && boardEl) boardEl.hidden = false;
  }

  function showBoard(on) {
    showScores = !!on;
    if (!boardEl) return;
    if (!scoreRows || !scoreRows.innerHTML) {
      boardEl.hidden = true;
      return;
    }
    boardEl.hidden = !on;
  }

  function fit() {
    var app = document.getElementById('app');
    var stage = document.getElementById('stage') || document.body;
    if (!app) return;
    var gw = (typeof config !== 'undefined' && config.game && config.game.w) || 960;
    var gh = (typeof config !== 'undefined' && config.game && config.game.h) || 480;
    var vw = stage.clientWidth, vh = stage.clientHeight;
    portrait = vh > vw * 1.08;
    document.body.classList.toggle('portrait', portrait);
    var playing = sceneName === 'play';
    document.body.classList.toggle('in-play', playing);
    document.body.classList.toggle('gate-on', portrait && sceneName === 'start');
    document.body.classList.toggle('end-on', portrait && (sceneName === 'over' || sceneName === 'rank'));
    if (gateEl) gateEl.hidden = !(portrait && sceneName === 'start');
    if (endEl) endEl.hidden = !(portrait && (sceneName === 'over' || sceneName === 'rank'));
    if (phud) phud.hidden = !(portrait && playing);
    var rotate = portrait && playing;
    var s = rotate
      ? Math.min(vh / gw, vw / gh)
      : Math.min(vw / gw, vh / gh);
    if (!isFinite(s) || s <= 0) s = 1;
    app.style.transform = rotate
      ? 'rotate(-90deg) scale(' + s + ')'
      : 'scale(' + s + ')';
  }

  function onScene(name) {
    sceneName = name || 'start';
    if (gateEl) gateEl.hidden = !(portrait && sceneName === 'start');
    if (endEl) endEl.hidden = !(portrait && (sceneName === 'over' || sceneName === 'rank'));
    if (phud) phud.hidden = !(portrait && sceneName === 'play');
    fit();
    if (sceneName === 'over') fillEnd();
  }

  function fillEnd() {
    if (!game || !game.data) return;
    var es = document.getElementById('end-score');
    var et = document.getElementById('end-time');
    var en = document.getElementById('end-name');
    if (es) es.textContent = String(game.data.score | 0);
    if (et) et.textContent = String(game.data.time | 0);
    var nameEl = document.getElementById('name');
    if (en && nameEl && nameEl.value && !en.value) en.value = nameEl.value;
  }

  function paintHud() {
    if (!phud || !phudFuel) return;
    var g = game || (root.__starGame);
    if (!g || !g.data) return;
    phudFuel.textContent = String(g.data.fuel | 0);
    phudScore.textContent = String(g.data.score | 0);
  }

  function showWait(on) {
    if (waitEl) waitEl.hidden = !on;
  }
  function showOut(on) {
    if (outEl) outEl.hidden = !on;
  }

  function withTimeout(p, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (v) { if (!done) { done = true; resolve(v); } };
      setTimeout(function () { finish(null); }, ms);
      p.then(finish, function () { finish(null); });
    });
  }

  function start() {
    applyAssets();
    fit();
    window.addEventListener('resize', fit);
    if (root.Touch) Touch.init();
    if (tally) {
      tally.addEventListener('click', function () {
        showBoard(!showScores);
      });
    }
    var gateBtn = document.getElementById('gate-start');
    if (gateBtn) {
      gateBtn.addEventListener('click', function () {
        var b = document.getElementById('start-btn');
        if (b) b.click();
      });
    }
    var endGo = document.getElementById('end-go');
    if (endGo) {
      endGo.addEventListener('click', function () {
        var en = document.getElementById('end-name');
        var nameEl = document.getElementById('name');
        if (en && nameEl) {
          nameEl.value = en.value;
          nameEl.dispatchEvent(new Event('input'));
        }
        var sub = document.getElementById('submit-btn');
        if (sub && !sub.disabled) sub.click();
        else if (game && game.rank) game.rank();
      });
    }
    var jobs = [withTimeout(load(), 1500)];
    if (root.Net && Net.init) jobs.push(withTimeout(Net.init(), 2500));
    Promise.all(jobs).then(function () {
      game = new Game();
      root.__starGame = game;
      if (root.Net) {
        Net.onRoster(paintRoster);
        paintRoster(Net.roster());
      }
      if (root.gifos && root.gifos.me) {
        root.gifos.me().then(function (id) {
          var nameEl = document.getElementById('name');
          if (nameEl && id && id.name && !nameEl.value) {
            nameEl.value = id.name;
            var btn = document.getElementById('submit-btn');
            if (btn) btn.removeAttribute('disabled');
          }
        }).catch(function () {});
      }
      game.start();
      fit();
    });
  }

  root.Boot = {
    start: start,
    load: load,
    persist: persist,
    applyAssets: applyAssets,
    fit: fit,
    nativeOk: nativeOk,
    showBoard: showBoard,
    showingBoard: function () { return showScores; },
    paintRoster: paintRoster,
    showWait: showWait,
    showOut: showOut,
    onScene: onScene,
    paintHud: paintHud,
    portrait: function () { return portrait; },
    scene: function () { return sceneName; },
    prefs: prefs,
    game: function () { return game; }
  };
})(window);
