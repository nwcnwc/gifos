// Slots — toy credits, shared reels. Invite is OS chrome.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var mp = window.SlotsMp;
  var STAKE = 10;
  var START = 1000;
  var credits = START;
  var lastShown = 0;
  var applying = false;

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function showCredits() {
    $('jp').textContent = String(credits);
  }
  function middle(symbols) {
    return symbols.map(function (col) { return col[1]; });
  }
  function payout(symbols) {
    var m = middle(symbols);
    var i, n = 1;
    for (i = 1; i < m.length && m[i] === m[0]; i++) n++;
    if (n < 3) return 0;
    if (n === 5) return STAKE * 100;
    if (m[0] === 'seven') return STAKE * 50;
    return STAKE * 10;
  }
  function describe(symbols, win) {
    var m = middle(symbols);
    if (win >= STAKE * 100) return 'Five of a kind — ' + win + '!';
    if (win >= STAKE * 50) return 'Three 7s — ' + win + '!';
    if (win > 0) return 'Three ' + m[0] + 's — ' + win + '!';
    return m.join(' · ');
  }

  async function persist() {
    if (!mp.saveDb) return;
    try {
      await mp.saveDb.put({ id: 'last', credits: credits, symbols: slot.nextSymbols });
    } catch (e) {}
  }

  function applyResult(symbols, fromRoom) {
    var win = payout(symbols);
    if (!fromRoom) {
      credits = Math.max(0, credits - STAKE) + win;
      showCredits();
      persist();
    }
    $('status').textContent = describe(symbols, win);
    setChip(win > 0 ? 'win' : '', win > 0 ? 'Hit' : 'Ready');
  }

  var slot = new window.Slot($('slot'), {
    inverted: false,
    onSpinStart: function () {
      setChip('play', 'Spinning');
      $('status').textContent = 'Spinning…';
    },
    onSpinEnd: function (symbols) {
      applyResult(symbols, applying);
      applying = false;
    }
  });

  async function pull(symbols) {
    if (slot.busy) return;
    if (!symbols) symbols = slot.randomGrid();
    if (mp.on) {
      await mp.putMe({ spin: { symbols: symbols, t: Date.now ? Date.now() : 0, by: mp.me.id } });
    }
    return slot.spinTo(symbols);
  }

  $('spin').addEventListener('click', function () { pull(); });

  function onRoom(items) {
    mp.items = items || [];
    if (!mp.on) return;
    var spin = mp.latestSpin(mp.items);
    if (!spin || !spin.symbols || spin.t === lastShown) return;
    if (spin.by === mp.me.id && lastShown === 0) {
      lastShown = spin.t;
      return;
    }
    if (spin.t <= lastShown) return;
    lastShown = spin.t;
    if (slot.busy) return;
    applying = true;
    slot.spinTo(spin.symbols);
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
      } catch (e) {}
    }
    showCredits();
    if (mp.roomDb) {
      mp.on = true;
      mp.roomDb.subscribe(onRoom);
      await mp.putMe();
      mp.startHeartbeat();
      setChip('', 'Table');
      $('mpHint').textContent = 'Anyone at the table can pull. Credits stay on this device.';
    }
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () {
        if ($('autoplay').checked) {
          $('autoplay').checked = false;
          return true;
        }
        return false;
      });
    }
  }
  boot();
})();
