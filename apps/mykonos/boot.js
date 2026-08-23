/* Gate, loop, sound, wiring. Invite is OS chrome — never a share button. */
(function (root) {
  'use strict';

  var api = root.gifos || null;
  var canvas = document.getElementById('view');
  var gate = document.getElementById('gate');
  var hud = document.getElementById('hud');
  var names = document.getElementById('names');
  var soundBtn = document.getElementById('soundBtn');
  var btnWalk = document.getElementById('btnWalk');
  var running = false;
  var last = 0;
  var soundOn = true;
  var actx = null;
  var lastStep = 0;

  function $(id) { return document.getElementById(id); }
  function db(n) { return api && api.db ? api.db(n) : null; }

  function resumeAudio() {
    try {
      if (!actx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (AC) actx = new AC();
      }
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }
  function tone(freq, dur, type, vol) {
    if (!actx || !soundOn) return;
    try {
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.04, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur);
    } catch (e) {}
  }
  function stepSound() {
    var t = Date.now();
    if (t - lastStep < 280) return;
    lastStep = t;
    tone(180 + Math.random() * 40, 0.07, 'triangle', 0.03);
  }

  function paintRoster(list) {
    if (!list || list.length < 2) {
      names.innerHTML = '';
      return;
    }
    var html = '';
    list.forEach(function (p) {
      html += (p.me ? '<b>' : '') + (p.name || 'Friend') + (p.me ? '</b>' : '') + '<br>';
    });
    names.innerHTML = html;
  }

  function loadPrefs() {
    var p = db('prefs');
    if (!p) return Promise.resolve();
    return p.get('prefs').then(function (row) {
      if (row && row.sound === 0) soundOn = false;
      soundBtn.classList.toggle('off', !soundOn);
    }).catch(function () {});
  }
  function savePrefs() {
    var p = db('prefs');
    if (!p) return;
    p.put({ id: 'prefs', sound: soundOn ? 1 : 0 }).catch(function () {});
  }

  function loop(t) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    root.Myk.draw(dt);
    if (root.Myk.pose().mv) stepSound();
    if (root.MykMp) root.MykMp.tick();
    requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    resumeAudio();
    gate.classList.add('gone');
    hud.hidden = false;
    requestAnimationFrame(loop);
  }

  function bind() {
    root.Myk.init(canvas);
    root.MykTouch.init();
    if (root.MykMp) {
      root.MykMp.onRoster(paintRoster);
      root.MykMp.init().then(function () {
        root.MykMp.publish(true);
      });
    }
    loadPrefs();
    btnWalk.addEventListener('click', start);
    soundBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      soundBtn.classList.toggle('off', !soundOn);
      if (soundOn) resumeAudio();
      savePrefs();
    });
    root.addEventListener('resize', function () { root.Myk.resize(); });
    if (api && api.onBack) {
      api.onBack(function () {
        if (!running) return false;
        running = false;
        gate.classList.remove('gone');
        hud.hidden = true;
        return true;
      });
    }
  }

  bind();
})(window);
