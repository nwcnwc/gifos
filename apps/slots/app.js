// Slots — shared reels; credits are per-device. Invite is OS chrome.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var mp = window.SlotsMp;
  var M = window.SlotsMath;
  var credits = M.START;
  var stake = 10;
  var muted = false;
  var lastShown = 0;
  var pending = null;
  var audio = null;
  var shown = credits;

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function showCredits(n) {
    $('jp').textContent = String(n == null ? credits : n);
  }
  function paintStake() {
    var btns = document.querySelectorAll('.stake');
    var i;
    for (i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', (btns[i].getAttribute('data-stake') | 0) === stake);
    }
  }
  function paintRefill() {
    $('refill').hidden = credits >= 100;
  }
  function liveLabel() {
    var n = mp.on ? mp.livePeople(mp.items).length : 0;
    return n > 1 ? ('Table · ' + n) : 'Ready';
  }

  function ctx() {
    if (muted) return null;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      if (!audio) audio = new C();
      if (audio.state === 'suspended') audio.resume();
      return audio;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, gain) {
    var c = ctx();
    if (!c) return;
    try {
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.value = gain || 0.05;
      o.connect(g); g.connect(c.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      o.stop(c.currentTime + dur);
    } catch (e) {}
  }
  function sfxSpin() { tone(180, 0.08, 'sawtooth', 0.04); }
  function sfxStop() { tone(240, 0.05, 'triangle', 0.03); }
  function sfxWin(big) {
    tone(520, 0.12, 'square', 0.06);
    setTimeout(function () { tone(660, 0.12, 'square', 0.06); }, 90);
    if (big) setTimeout(function () { tone(880, 0.22, 'square', 0.07); }, 180);
  }

  async function persist() {
    if (!mp.saveDb) return;
    try {
      await mp.saveDb.put({
        id: 'last',
        credits: credits,
        symbols: slot.nextSymbols,
        stake: stake,
        muted: muted
      });
    } catch (e) {}
  }

  function countTo(target) {
    var from = shown;
    shown = target;
    if (from === target) { showCredits(target); return; }
    var t0 = Date.now ? Date.now() : 0;
    var dur = Math.min(600, 80 + Math.abs(target - from) * 2);
    function tick() {
      var t = Date.now ? Date.now() : t0 + dur;
      var p = Math.min(1, (t - t0) / dur);
      showCredits(Math.round(from + (target - from) * p));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function applyResult(symbols, fromRoom) {
    var win = M.payout(symbols, stake);
    if (!fromRoom) {
      var r = M.applySpin(credits, symbols, stake);
      credits = r.credits;
      countTo(credits);
      persist();
      paintRefill();
    }
    $('status').textContent = M.describe(symbols, win);
    $('slot').classList.toggle('hit', win > 0);
    if (win > 0) sfxWin(win >= stake * 100);
    else sfxStop();
    if (credits === 0 && !fromRoom) {
      $('status').textContent = (win ? M.describe(symbols, win) : 'On the house — a hit restocks you.');
    }
    setChip(win > 0 ? 'win' : '', win > 0 ? 'Hit' : liveLabel());
  }

  var slot = new window.Slot($('slot'), {
    inverted: false,
    onSpinStart: function () {
      setChip('play', 'Spinning');
      $('status').textContent = 'Spinning…';
      $('who').hidden = true;
      $('slot').classList.add('play');
      $('slot').classList.remove('hit');
      sfxSpin();
    },
    onSpinEnd: function (symbols) {
      $('slot').classList.remove('play');
      applyResult(symbols, slot.fromRoom);
      if (pending && !slot.busy) {
        var p = pending;
        pending = null;
        playRoom(p);
        return;
      }
    },
    onAutoPlay: function () { pull(); }
  });

  function pullLever() {
    var el = $('lever');
    el.classList.add('pulled');
    setTimeout(function () { el.classList.remove('pulled'); }, 280);
  }

  async function pull(symbols) {
    if (slot.busy) return;
    if ($('autoplay').checked === false) slot.cancelAuto();
    if (!symbols) symbols = slot.randomGrid();
    pullLever();
    if (mp.on) {
      try {
        await mp.putMe({
          spin: {
            symbols: symbols,
            t: Date.now ? Date.now() : 0,
            by: mp.me.id,
            name: mp.me.name || 'player',
            stake: stake
          }
        });
      } catch (e) {}
    }
    return slot.spinTo(symbols, false);
  }

  function playRoom(spin) {
    if (!spin || !spin.symbols) return;
    if (slot.busy) { pending = spin; return; }
    applyingWho(spin);
    slot.spinTo(spin.symbols, true);
  }
  function applyingWho(spin) {
    if (spin.by && spin.by === mp.me.id) {
      $('who').hidden = true;
      return;
    }
    $('who').hidden = false;
    $('who').textContent = (spin.name || 'A friend') + ' pulled.';
  }

  $('spin').addEventListener('click', function () { pull(); });
  $('lever').addEventListener('click', function () { pull(); });
  $('refill').addEventListener('click', function () {
    credits = credits + M.REFILL;
    countTo(credits);
    paintRefill();
    $('status').textContent = 'Topped up. 1000 credits.';
    persist();
  });
  $('mute').addEventListener('click', function () {
    muted = !muted;
    $('mute').setAttribute('aria-pressed', muted ? 'true' : 'false');
    $('mute').textContent = muted ? 'Muted' : 'Sound';
    persist();
  });
  document.getElementById('stakes').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.stake') : e.target;
    if (!b || !b.getAttribute) return;
    var n = M.clampStake(b.getAttribute('data-stake'));
    stake = n;
    paintStake();
    persist();
  });

  document.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var k = e.key || e.code;
    if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
      e.preventDefault();
      pull();
    }
  });

  function onRoom(items) {
    mp.items = items || [];
    if (!mp.on) return;
    var nLive = mp.livePeople(mp.items).length;
    if (nLive > 1) {
      $('mpHint').textContent = 'Anyone at the table can pull. Credits stay on this device.';
    }
    if (!$('slot').classList.contains('play') && !$('slot').classList.contains('hit')) {
      setChip('', liveLabel());
    }
    var spin = mp.latestSpin(mp.items);
    if (!spin || !spin.symbols) return;
    if (spin.t === lastShown) return;
    if (spin.by === mp.me.id && lastShown === 0) {
      lastShown = spin.t;
      return;
    }
    if (spin.t <= lastShown) return;
    lastShown = spin.t;
    playRoom(spin);
  }

  async function boot() {
    if (window.gifos) {
      try {
        mp.saveDb = gifos.db('save');
        mp.roomDb = gifos.db('room');
        var info = await gifos.info();
        mp.owner = !!(info && info.owner);
        var me = await gifos.me();
        if (me) mp.me = me;
      } catch (e) {}
    }
    if (mp.saveDb) {
      try {
        var rec = await mp.saveDb.get('last');
        if (rec && typeof rec.credits === 'number') credits = rec.credits;
        if (rec && rec.symbols) slot.nextSymbols = rec.symbols;
        if (rec && rec.stake != null) stake = M.clampStake(rec.stake);
        if (rec && rec.muted) muted = true;
      } catch (e) {}
    }
    shown = credits;
    showCredits();
    paintStake();
    paintRefill();
    $('mute').setAttribute('aria-pressed', muted ? 'true' : 'false');
    $('mute').textContent = muted ? 'Muted' : 'Sound';
    if (mp.roomDb) {
      mp.on = true;
      mp.roomDb.subscribe(onRoom);
      await mp.putMe();
      mp.startHeartbeat();
      setChip('', liveLabel());
    }
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () {
        if ($('autoplay').checked) {
          $('autoplay').checked = false;
          slot.cancelAuto();
          setChip('', liveLabel());
          $('status').textContent = 'Autoplay off.';
          return true;
        }
        return false;
      });
    }
  }
  boot();
})();
