// Guitar Bro shell: menu, tap, Listen (a clip, never a live mic), private prefs.
(function (root) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game-canvas');
  var wave = $('wave');
  var game = new root.GBGame(canvas);
  root.GB = game;

  var api = root.gifos || null;
  var prefsDb = null;
  var saveTimer = 0;
  var listening = false;
  var lastHeard = '';

  try {
    if (api && api.db) prefsDb = api.db('prefs');
  } catch (e) {}

  function fillSelect(sel, items, value, labelFn) {
    var html = '', i, v, lab;
    for (i = 0; i < items.length; i++) {
      v = items[i];
      lab = labelFn ? labelFn(v) : v;
      html += '<option value="' + String(v).replace(/"/g, '&quot;') + '"' +
        (String(v) === String(value) ? ' selected' : '') + '>' + lab + '</option>';
    }
    sel.innerHTML = html;
    sel.value = value;
  }

  function currentMenu() {
    var modeEl = document.querySelector('input[name="mode"]:checked');
    return {
      songName: $('song').value,
      stringId: $('string').value,
      bpm: Math.max(8, Math.min(240, +$('bpm').value || 30)),
      mode: (modeEl && modeEl.value) || 'survival',
      seed: (Math.random() * 0x100000000) >>> 0
    };
  }

  function syncMenu(ch) {
    if (!ch) return;
    if (ch.songName) $('song').value = ch.songName;
    if (ch.stringId) $('string').value = String(ch.stringId);
    if (ch.bpm) $('bpm').value = ch.bpm;
    var m = ch.mode === 'practice' ? 'practice' : 'survival';
    var el = document.querySelector('input[name="mode"][value="' + m + '"]');
    if (el) el.checked = true;
  }

  function savePrefs() {
    if (!prefsDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var m = currentMenu();
      prefsDb.put({
        id: 'prefs',
        songName: m.songName,
        stringId: m.stringId,
        bpm: m.bpm,
        mode: m.mode
      }).catch(function () {});
    }, 200);
  }

  function sizeCanvas() {
    var stage = $('stage');
    var r = stage.getBoundingClientRect();
    var dpr = root.devicePixelRatio || 1;
    game.resize(Math.max(1, r.width), Math.max(1, r.height), dpr);
  }

  function setHud() {
    $('score').textContent = String(game.score);
    var hint = $('hint');
    if (game.done) {
      hint.textContent = game.died ? 'Out of hearts.' : 'Song over. Score ' + game.score + '.';
    } else if (listening) {
      hint.textContent = 'Play the note on your guitar, then press Stop.';
    } else {
      var t = game.target();
      hint.textContent = t
        ? ('Play ' + t + ' — tap the fret, or Listen.')
        : 'Tap a fret as the note arrives. Listen hears your guitar.';
    }
    if (lastHeard) $('heard').textContent = lastHeard;
  }

  function plotWave(samples) {
    var ctx = wave.getContext('2d');
    var w = wave.width, h = wave.height, i, n, x, y, start, span;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#F1FAEE';
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (!samples || !samples.length) {
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    start = 0;
    for (i = 0; i < samples.length - 1; i++) {
      if (samples[i] < 0 && samples[i + 1] >= 0) { start = i; break; }
    }
    span = Math.min(500, samples.length - start);
    for (i = 0; i < span; i++) {
      x = i / (span - 1) * w;
      y = h / 2 - samples[start + i] * (h * 0.42);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function showMenu() {
    $('menu').hidden = false;
    $('hud').classList.remove('live');
    if (root.GBMp && root.GBMp.on) return;
    game.stop();
  }

  function hideMenu() {
    $('menu').hidden = true;
    $('hud').classList.add('live');
  }

  function setRace(on) {
    ['song', 'string', 'bpm'].forEach(function (id) { $(id).disabled = !!on; });
    document.querySelectorAll('input[name="mode"]').forEach(function (el) { el.disabled = !!on; });
    $('startBtn').hidden = !!on;
  }

  function startFromMenu() {
    var m = currentMenu();
    savePrefs();
    $('over-copy').textContent = 'Pick a string. Notes fall down the neck. Play them on a real guitar, or tap the fret.';
    hideMenu();
    game.start({
      songName: m.songName,
      stringId: m.stringId,
      bpm: m.bpm,
      mode: m.mode,
      seed: m.seed,
      race: !!(root.GBMp && root.GBMp.on),
      loop: !(root.GBMp && root.GBMp.on)
    });
    setHud();
  }

  function onGameChange() {
    setHud();
    if (root.GBMp) root.GBMp.onPlayed();
    if (game.done && !(root.GBMp && root.GBMp.on)) {
      $('over-copy').textContent = game.died
        ? 'Game over. Try a slower beat, or switch to Practice.'
        : 'Nice one. Score ' + game.score + '.';
      showMenu();
    }
  }

  game.onChange = onGameChange;
  game.onOver = onGameChange;

  function tap(e) {
    if (!game.playing()) return;
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left);
    var y = (e.clientY - r.top);
    game.tapAt(x, y);
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    tap(e);
  });

  $('startBtn').addEventListener('click', function (e) {
    e.preventDefault();
    startFromMenu();
  });

  $('pauseBtn').addEventListener('click', function (e) {
    e.preventDefault();
    if (root.GBMp && root.GBMp.on) return;
    showMenu();
  });

  $('hearBtn').addEventListener('click', function (e) {
    e.preventDefault();
    var note = game.hear();
    if (note) {
      lastHeard = 'Heard as a tone: ' + note;
      setHud();
    }
  });

  function canListen() {
    return api && typeof api.recordAudio === 'function';
  }

  $('listenBtn').addEventListener('click', function (e) {
    e.preventDefault();
    if (listening) return;
    if (!canListen()) {
      lastHeard = 'Open this inside GifOS to use Listen.';
      setHud();
      return;
    }
    if (!game.playing() && !game.paused()) startFromMenu();
    listening = true;
    $('listenBtn').disabled = true;
    game.pause();
    setHud();
    api.recordAudio({ maxSeconds: 2 }).then(function (clip) {
      return root.GBPitch.decode(clip);
    }).then(function (aud) {
      plotWave(aud.samples);
      var cfg = root.GBConfig.strings[game.stringId];
      var note = root.GBPitch.detect(aud.samples, aud.rate, cfg);
      lastHeard = note ? ('Heard ' + note) : 'No clear note. Try closer to the mic.';
      game.resume();
      if (note) game.playNote(note);
    }).catch(function () {
      lastHeard = 'Listen cancelled.';
      game.resume();
    }).then(function () {
      listening = false;
      $('listenBtn').disabled = false;
      setHud();
    });
  });

  ['song', 'string', 'bpm'].forEach(function (id) {
    $(id).addEventListener('change', savePrefs);
  });
  document.querySelectorAll('input[name="mode"]').forEach(function (el) {
    el.addEventListener('change', savePrefs);
  });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (game.playing() || game.paused()) {
        if (root.GBMp && root.GBMp.on) return;
        showMenu();
      } else {
        startFromMenu();
      }
    }
  });

  root.addEventListener('resize', function () { sizeCanvas(); });
  if (root.ResizeObserver) {
    new ResizeObserver(function () { sizeCanvas(); }).observe($('stage'));
  }

  if (api && api.onBack) {
    api.onBack(function () {
      if (root.GBMp && root.GBMp.on) root.GBMp.leave();
      else if (game.playing() || game.paused()) showMenu();
    });
  }

  $('listenBtn').hidden = !canListen();

  fillSelect($('song'), root.GBSongs.names, 'Smoke on the Water (Tempo=112)');
  fillSelect($('string'), Object.keys(root.GBConfig.strings), '1', function (id) {
    return root.GBConfig.strings[id].name;
  });

  root.GBApp = {
    showMenu: showMenu,
    hideMenu: hideMenu,
    syncMenu: syncMenu,
    setRace: setRace,
    chart: currentMenu,
    sizeCanvas: sizeCanvas
  };

  function boot() {
    sizeCanvas();
    plotWave(null);
    setHud();
    if (root.GBMp) root.GBMp.watch();
  }

  if (prefsDb && prefsDb.get) {
    prefsDb.get('prefs').then(function (row) {
      if (row) {
        if (row.songName) $('song').value = row.songName;
        if (row.stringId) $('string').value = String(row.stringId);
        if (row.bpm) $('bpm').value = row.bpm;
        if (row.mode) {
          var el = document.querySelector('input[name="mode"][value="' + row.mode + '"]');
          if (el) el.checked = true;
        }
      }
      boot();
    }).catch(boot);
  } else {
    boot();
  }
})(window);
