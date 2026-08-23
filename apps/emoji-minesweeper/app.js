/*
 * Emoji Minesweeper — shell: settings, prefs, race wiring.
 *
 * Solo is the original game. When someone else is in the room (Invite is
 * OS chrome, in the GifOS menu), a seed is dealt and both boards are the
 * same. First to clear wins; times ride on each player's own row.
 */
(function () {
  'use strict';

  var DEFAULT_SET = ['🐣', '💣', '🚧', '◻️'];
  var game = null;
  var raceMode = false;
  var appliedAt = 0;
  var autoDealt = false;
  var prefsDb = null;
  var raceEl = document.getElementById('race');
  var raceRows = document.getElementById('race-rows');
  var raceNote = document.getElementById('race-note');
  var hintEl = document.getElementById('invite-hint');
  var colsEl = document.getElementById('cols');
  var rowsEl = document.getElementById('rows');
  var bombsEl = document.getElementById('bombs');
  var setEl = document.getElementById('emojiset');
  var popup = document.querySelector('.js-settings-popup');
  var settingsBtn = document.querySelector('.js-settings');

  function emojiset() {
    var v = setEl.value.split(' ');
    if (v.length < 4) return DEFAULT_SET.slice();
    return v;
  }

  function cfg() {
    return {
      cols: Number(colsEl.value) || 10,
      rows: Number(rowsEl.value) || 10,
      bombs: Number(bombsEl.value) || 10,
      emojiset: emojiset()
    };
  }

  function applyCfg(c) {
    if (!c) return;
    if (c.cols) colsEl.value = c.cols;
    if (c.rows) rowsEl.value = c.rows;
    if (c.bombs) bombsEl.value = c.bombs;
    if (c.emojiset && c.emojiset.length) {
      var joined = (Array.isArray(c.emojiset) ? c.emojiset : String(c.emojiset).split(' ')).join(' ');
      var opts = setEl.options, i, found = false;
      for (i = 0; i < opts.length; i++) {
        if (opts[i].value === joined) { setEl.selectedIndex = i; found = true; break; }
      }
      if (!found) {
        var o = document.createElement('option');
        o.value = joined;
        o.textContent = joined;
        setEl.appendChild(o);
        setEl.value = joined;
      }
    }
  }

  function newSeed() {
    var a = new Uint32Array(1);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else a[0] = (Math.random() * 0xffffffff) >>> 0;
    return a[0] || 1;
  }

  function startGame(opts) {
    opts = opts || {};
    var c = cfg();
    if (game) game.stopTimer();
    var seed = opts.seed || 0;
    game = new Game(c.cols, c.rows, c.bombs, c.emojiset, {
      seed: seed,
      firstClickSafe: !seed,
      onChange: function (snap) {
        window.MineNet.publish(snap, !!snap.result);
      }
    });
    window.game = game;
    if (window.MineNet.ready()) window.MineNet.publish(game.snapshot(), true);
  }

  function savePrefs() {
    if (!prefsDb) return;
    var c = cfg();
    prefsDb.put({ id: 'settings', cols: c.cols, rows: c.rows, bombs: c.bombs, emojiset: c.emojiset.join(' ') }).catch(function () {});
  }

  function closeSettings() {
    if (popup) popup.classList.remove('show');
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
  }

  function dealRace() {
    var c = cfg();
    var seed = newSeed();
    window.MineNet.deal({
      seed: seed,
      cols: c.cols,
      rows: c.rows,
      bombs: c.bombs,
      emojiset: c.emojiset
    });
  }

  function restart(fromSettings) {
    closeSettings();
    if (fromSettings) savePrefs();
    if (raceMode) dealRace();
    else startGame();
  }

  function enterRace(rec) {
    if (!rec || !rec.seed) return;
    raceMode = true;
    appliedAt = rec.at;
    applyCfg(rec);
    startGame({ seed: rec.seed });
    if (raceEl) raceEl.hidden = false;
  }

  function fmtTime(t) {
    if (!t) return '0.00';
    return Number(t).toFixed(2);
  }

  function winnerOf(list, seed) {
    var best = null, i, p;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || p.result !== 'won') continue;
      if (seed && p.seed && p.seed !== seed) continue;
      if (!best || p.time < best.time) best = p;
    }
    return best;
  }

  function isManager(list) {
    var id = window.MineNet.me().id;
    if (!id) return true;
    var min = id, i;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id && list[i].id < min) min = list[i].id;
    return id === min;
  }

  function renderRace(list) {
    list = list || [];
    var others = 0, i;
    for (i = 0; i < list.length; i++) if (!list[i].mine) others++;
    var rec = window.MineNet.race();
    var inRoom = others > 0 || !!rec;
    if (hintEl) hintEl.hidden = !window.MineNet.ready();
    if (!inRoom) {
      raceMode = false;
      if (raceEl) raceEl.hidden = true;
      return;
    }
    if (raceEl) raceEl.hidden = false;
    if (!raceRows) return;
    var seed = rec && rec.seed;
    var win = winnerOf(list, seed);
    raceRows.innerHTML = '';
    list.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'race-row' + (p.mine ? ' me' : '') + (win && win.id === p.id ? ' win' : '') + (p.result === 'lost' ? ' lost' : '');
      var name = document.createElement('span');
      name.className = 'who';
      name.textContent = p.mine ? (p.name || 'You') : (p.name || 'Player');
      var time = document.createElement('span');
      time.className = 'when';
      time.textContent = fmtTime(p.time);
      var bar = document.createElement('span');
      bar.className = 'bar-track';
      var fill = document.createElement('span');
      fill.className = 'bar-fill';
      var safe = p.safe || 1;
      var pct = Math.max(0, Math.min(100, Math.round((p.opened || 0) / safe * 100)));
      fill.style.width = pct + '%';
      fill.style.background = 'hsl(' + (p.hue || 40) + ' 70% 50%)';
      bar.appendChild(fill);
      var st = document.createElement('span');
      st.className = 'state';
      if (p.result === 'won') st.textContent = 'cleared';
      else if (p.result === 'lost') st.textContent = 'boom';
      else if (p.opened) st.textContent = pct + '%';
      else st.textContent = 'ready';
      row.appendChild(name);
      row.appendChild(time);
      row.appendChild(bar);
      row.appendChild(st);
      raceRows.appendChild(row);
    });
    if (raceNote) {
      if (win) raceNote.textContent = (win.mine ? 'You' : win.name) + ' wins in ' + fmtTime(win.time) + 's.';
      else if (others === 0) raceNote.textContent = 'Waiting — Invite (top bar) to race a friend. Same board, first to clear.';
      else raceNote.textContent = 'Same board. First to clear wins.';
    }
  }

  document.querySelector('.js-new-game').addEventListener('click', function () { restart(false); });
  document.querySelector('.js-popup-new-game').addEventListener('click', function () { restart(true); });
  settingsBtn.addEventListener('click', function () {
    var on = popup.classList.toggle('show');
    settingsBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
  });

  window.addEventListener('keydown', function (evt) {
    if (evt.key === 'r' || evt.key === 'R') {
      if (evt.target && (evt.target.tagName === 'INPUT' || evt.target.tagName === 'SELECT' || evt.target.tagName === 'TEXTAREA')) return;
      restart(false);
    }
    if (evt.key === 'Escape') closeSettings();
  });

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (popup.classList.contains('show')) { closeSettings(); return true; }
    });
  }

  startGame();

  if (window.gifos && gifos.db) {
    try { prefsDb = gifos.db('prefs'); } catch (e) { prefsDb = null; }
    var load = prefsDb ? prefsDb.get('settings') : Promise.resolve(null);
    load.then(function (rec) {
      if (rec) applyCfg({
        cols: rec.cols, rows: rec.rows, bombs: rec.bombs,
        emojiset: rec.emojiset ? String(rec.emojiset).split(' ') : null
      });
    }).catch(function () {}).then(function () {
      return window.MineNet.init({
        onRace: function (rec) {
          if (!rec || rec.at === appliedAt) return;
          enterRace(rec);
        },
        onRoster: function (list) {
          var rec = window.MineNet.race();
          var others = window.MineNet.others();
          // Lowest id deals once, when a second person arrives and no board
          // has been dealt yet. New Game still lets anyone deal (restart()).
          if (others > 0 && !rec && !autoDealt && isManager(list)) { autoDealt = true; dealRace(); }
          else if (rec && !raceMode) enterRace(rec);
          renderRace(list);
        }
      });
    }).then(function (st) {
      if (st && st.ok && hintEl) hintEl.hidden = false;
      if (game && window.MineNet.ready()) window.MineNet.publish(game.snapshot(), true);
    });
  }
})();
