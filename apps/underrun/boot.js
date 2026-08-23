/*
 * Underrun — GifOS shell.
 *
 * Vendor files are unmodified. This file runs last: it points load_image at
 * the packed PNGs, unlocks audio on the first gesture, hangs the twin-stick
 * and extra soldiers on the prototypes the original already has, and keeps
 * a best floor in gifos.db. Invite is OS chrome — this file never draws an
 * Invite button.
 */
(function (root) {
  'use strict';

  var prefs = { floor: 0 };
  var scoreEl = document.getElementById('score');
  var scoreRows = document.getElementById('score-rows');
  var tally = document.getElementById('tally');
  var hud = document.getElementById('hud');
  var hudFloor = document.getElementById('hud-floor');
  var hudBest = document.getElementById('hud-best');
  var showScores = false;
  var playing = false;
  var pendingMusic = null;
  var wantStart = false;
  var origLoadImage = load_image;
  var origAudioPlay = audio_play;
  var origEndFrame = renderer_end_frame;
  var origPlayerUpdate = entity_player_t.prototype._update;
  var origPlasmaInit = entity_plasma_t.prototype._init;
  var origCpuCheck = entity_cpu_t.prototype._check;
  var origSpiderUpdate = entity_spider_t.prototype._update;
  var origSentryUpdate = entity_sentry_t.prototype._update;
  var origSpiderKill = entity_spider_t.prototype._kill;
  var origSentryKill = entity_sentry_t.prototype._kill;

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('prefs').then(function (row) {
      if (row && row.floor) prefs.floor = row.floor | 0;
    }).catch(function () {});
  }

  function savePrefs() {
    if (!root.gifos || !root.gifos.db) return;
    root.gifos.db('prefs').put({
      id: 'prefs', floor: prefs.floor
    }).catch(function () {});
  }

  function escape(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function paintRoster(list) {
    if (!list || list.length < 2) {
      scoreEl.hidden = true;
      tally.hidden = true;
      return;
    }
    tally.hidden = false;
    tally.textContent = list.length + ' soldiers';
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += '<tr class="' + (p.me ? 'me' : '') + (p.h > 0 ? '' : ' dead') + '">' +
        '<td>' + escape(p.name) + (p.me ? ' (you)' : '') + '</td>' +
        '<td>' + (p.h | 0) + '</td>' +
        '<td>' + (p.lv | 0) + '</td></tr>';
    }
    scoreRows.innerHTML = html;
  }

  function showBoard(on) {
    if (!scoreRows.innerHTML) return;
    scoreEl.hidden = !on;
  }

  function paintHud() {
    if (!hud) return;
    var fl = (typeof current_level === 'number' ? current_level : 0) | 0;
    var best = prefs.floor | 0;
    if (playing && fl > 0) {
      hudFloor.hidden = false;
      hudFloor.textContent = 'FLOOR ' + fl;
    } else {
      hudFloor.hidden = true;
      hudFloor.textContent = '';
    }
    if (best > 0 && !(playing && best === fl)) {
      hudBest.hidden = false;
      hudBest.textContent = 'BEST ' + best;
    } else {
      hudBest.hidden = true;
      hudBest.textContent = '';
    }
    hud.hidden = !((playing && fl > 0) || (best > 0 && !(playing && best === fl)));
  }

  function tryStart() {
    if (!wantStart || playing) return;
    if (typeof _document === 'undefined' || !_document.onclick) return;
    var fn = _document.onclick;
    wantStart = false;
    try { fn({ preventDefault: function () {} }); } catch (e) {}
  }

  root.load_image = function (name, callback) {
    var el = document.getElementById('img-' + name);
    if (!el) {
      origLoadImage(name, callback);
      return;
    }
    var go = function () { callback.call(el); };
    if (el.complete && el.naturalWidth) go();
    else {
      el.onload = go;
      el.onerror = function () { origLoadImage(name, callback); };
    }
  };

  root.audio_play = function (buffer, loop) {
    if (!buffer) return;
    if (loop) {
      pendingMusic = buffer;
      try {
        if (audio_ctx && audio_ctx.state === 'suspended') return;
      } catch (e) {}
    }
    origAudioPlay(buffer, loop);
    if (loop) pendingMusic = null;
  };

  function unlockAudio() {
    if (!audio_ctx) return;
    var playPending = function () {
      if (pendingMusic) {
        origAudioPlay(pendingMusic, true);
        pendingMusic = null;
      }
    };
    try {
      if (audio_ctx.state === 'suspended' && audio_ctx.resume) {
        audio_ctx.resume().then(playPending).catch(function () {});
      } else playPending();
    } catch (e) {}
  }

  entity_player_t.prototype._update = function () {
    if (root.Touch && Touch.active()) {
      var m = Touch.move();
      var a = Touch.aim();
      keys[key_left] = m.x < -0.28 ? 1 : 0;
      keys[key_right] = m.x > 0.28 ? 1 : 0;
      keys[key_up] = m.y < -0.28 ? 1 : 0;
      keys[key_down] = m.y > 0.28 ? 1 : 0;
      var px = this.x + 6 + camera_x + c.width * 0.5;
      var py = -34 + c.height * 0.8;
      if (Math.abs(a.x) + Math.abs(a.y) > 0.08) {
        mouse_x = px + a.x * 90;
        mouse_y = py + a.y * 90;
      }
      keys[key_shoot] = a.on ? 1 : 0;
    }
    origPlayerUpdate.call(this);
  };

  entity_plasma_t.prototype._init = function (angle) {
    origPlasmaInit.call(this, angle);
    if (!root._underrunRemotePlasma && root.Net) root.Net.shot(angle, this.x, this.z);
  };

  entity_cpu_t.prototype._check = function (other) {
    var was = this.h;
    origCpuCheck.call(this, other);
    if (was == 5 && this.h == 10 && other === entity_player && root.Net) {
      root.Net.claimCpu(this.x, this.z);
    }
  };

  function chaseNearest(orig) {
    return function () {
      var t = root.Net && Net.live() ? Net.nearest(this.x, this.z) : null;
      if (!t || t === entity_player || !entity_player) return orig.call(this);
      var px = entity_player.x, pz = entity_player.z;
      entity_player.x = t.x; entity_player.z = t.z;
      orig.call(this);
      entity_player.x = px; entity_player.z = pz;
    };
  }
  entity_spider_t.prototype._update = chaseNearest(origSpiderUpdate);
  entity_sentry_t.prototype._update = chaseNearest(origSentryUpdate);

  entity_spider_t.prototype._kill = function () {
    origSpiderKill.call(this);
    if (root.Net) root.Net.addKill();
  };
  entity_sentry_t.prototype._kill = function () {
    origSentryKill.call(this);
    if (root.Net) root.Net.addKill();
  };

  root.renderer_end_frame = function () {
    if (root.Net && playing) {
      root.Net.tick();
      root.Net.draw();
    }
    origEndFrame();
    if (current_level > prefs.floor) {
      prefs.floor = current_level;
      savePrefs();
    }
    paintHud();
    showBoard(showScores);
  };

  function applyStickMouse(ev) {
    if (root.Touch && Touch.active()) {
      ev.preventDefault();
      return true;
    }
    return false;
  }
  var origMove = _document.onmousemove;
  _document.onmousemove = function (ev) {
    if (applyStickMouse(ev)) return;
    origMove(ev);
  };
  var origDown = _document.onmousedown;
  _document.onmousedown = function (ev) {
    if (applyStickMouse(ev)) return;
    origDown(ev);
  };
  var origUp = _document.onmouseup;
  _document.onmouseup = function (ev) {
    if (applyStickMouse(ev)) return;
    origUp(ev);
  };

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Tab') {
      ev.preventDefault();
      showScores = !showScores;
      showBoard(showScores);
    }
  });

  tally.addEventListener('click', function () {
    showScores = !showScores;
    showBoard(showScores);
  });

  document.addEventListener('pointerdown', function () {
    unlockAudio();
    wantStart = true;
    tryStart();
  });
  setInterval(tryStart, 120);

  var origNext = next_level;
  root.next_level = function (callback) {
    playing = true;
    if (root.Touch) Touch.setPlay(true);
    origNext(callback);
  };

  if (typeof terminal_text_story === 'string') {
    if (terminal_text_story.indexOf('ON A PHONE') < 0) {
      root.terminal_text_story = terminal_text_story.replace(
        'USE WASD OR CURSOR KEYS TO MOVE, MOUSE TO SHOOT',
        'USE WASD OR CURSOR KEYS TO MOVE, MOUSE TO SHOOT\n' +
        'ON A PHONE: LEFT THUMB WALKS, RIGHT THUMB AIMS AND FIRES'
      );
    }
    var coarse = false;
    try {
      coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    } catch (e) {}
    if (coarse) {
      root.terminal_text_story = root.terminal_text_story.replace(
        'CLICK TO INITIATE YOUR DEPLOYMENT',
        'TAP TO INITIATE YOUR DEPLOYMENT'
      );
    }
  }

  if (root.Touch) Touch.init();

  loadPrefs().then(function () {
    paintHud();
    if (!root.Net) return;
    root.Net.init().then(function () {
      root.Net.onRoster(paintRoster);
      paintRoster(root.Net.roster());
    });
  });
})(window);
