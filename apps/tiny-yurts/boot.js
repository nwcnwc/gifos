/*
 * Tiny Yurts — GifOS shell.
 * Invite is OS chrome. Best score is private. gifos.db hydrates into the
 * localStorage stub; the title highscore is painted on after that. The jam
 * itself is a static script so the packer inlines it.
 */
(function (root) {
  'use strict';

  var api = typeof gifos !== 'undefined' ? gifos : null;
  var saveDb = null, playersDb = null;
  try {
    if (api && api.db) {
      saveDb = api.db('save');
      playersDb = api.db('players');
    }
  } catch (e) {}

  var rosterEl = document.getElementById('roster');
  var me = { id: 'local', name: 'You' };
  var others = {};
  var started = false;
  var lastScore = 0;

  function currentScore() {
    var v = root.localStorage && root.localStorage.getItem('Tiny Yurts');
    return v ? (parseInt(v, 10) || 0) : 0;
  }

  function paintHi(n) {
    if (!n) return;
    var nodes = document.body.querySelectorAll('div');
    for (var i = 0; i < nodes.length; i++) {
      var t = nodes[i].innerText || '';
      if (t.indexOf('Highscore:') === 0 || t.indexOf('Tip:') === 0) {
        nodes[i].innerText = 'Highscore: ' + n;
        break;
      }
    }
  }

  function publish() {
    if (!started || !playersDb || !me.id || me.id === 'local') return;
    playersDb.put({
      id: me.id, name: me.name, score: currentScore(), t: Date.now()
    }).catch(function () {});
  }

  function paintRoster() {
    var list = [{ id: me.id, name: me.name, mine: true, score: currentScore() }];
    Object.keys(others).forEach(function (id) {
      var p = others[id];
      list.push({ id: p.id, name: p.name || 'Player', mine: false, score: p.score || 0 });
    });
    if (list.length < 2) { rosterEl.hidden = true; return; }
    list.sort(function (a, b) { return b.score - a.score; });
    rosterEl.hidden = false;
    rosterEl.innerHTML = list.map(function (p) {
      return '<div class="' + (p.mine ? 'me' : '') + '">' +
        (p.name || 'Player').replace(/[<>&]/g, '') + ' · ' + p.score + '</div>';
    }).join('');
  }

  root.TYOnSave = function (key, val) {
    if (!saveDb) return;
    var rec = { id: 'prefs' };
    rec.score = root.localStorage.getItem('Tiny Yurts') || '';
    rec.sound = root.localStorage.getItem('Tiny Yurtss') || '';
    rec.grid = root.localStorage.getItem('Tiny Yurtsg') || '';
    saveDb.put(rec).catch(function () {});
    if (key === 'Tiny Yurts') {
      lastScore = parseInt(val, 10) || 0;
      publish();
      paintRoster();
    }
  };

  function hydrate(row) {
    if (!row) return;
    if (row.score) {
      root._tyMem['Tiny Yurts'] = String(row.score);
      lastScore = parseInt(row.score, 10) || 0;
    }
    if (row.sound) root._tyMem['Tiny Yurtss'] = String(row.sound);
    if (row.grid) root._tyMem['Tiny Yurtsg'] = String(row.grid);
  }

  /* Portrait used to crop the valley: the jam SVG is slice + maxHeight 68vw,
     so on a 390×844 phone the board is a 265px strip and the left/right farms
     fall off the screen. Meet + a height that fits the 208:112 viewBox keeps
     every cell under a finger. Landscape keeps the original slice fill. */
  function fitBoard() {
    var svgs = document.querySelectorAll('svg');
    var board = null;
    for (var i = 0; i < svgs.length; i++) {
      var vb = svgs[i].getAttribute('viewBox') || '';
      if (vb.indexOf('0 0 208') === 0) { board = svgs[i]; break; }
    }
    if (!board) return;
    var w = root.innerWidth || 360, h = root.innerHeight || 640;
    var portrait = h > w;
    board.style.touchAction = 'none';
    if (portrait) {
      board.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      board.style.maxHeight = 'none';
      board.style.maxWidth = '100vw';
      board.style.width = '100vw';
      var boardH = Math.min(h * 0.58, w * (112 / 208) * 1.28);
      board.style.height = Math.round(boardH) + 'px';
      document.body.classList.add('portrait');
    } else {
      board.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      board.style.maxHeight = '68vw';
      board.style.maxWidth = '200vh';
      board.style.width = '100vw';
      board.style.height = '100vh';
      document.body.classList.remove('portrait');
    }
    var title = null;
    var nodes = document.body.querySelectorAll('div');
    for (var j = 0; j < nodes.length; j++) {
      if ((nodes[j].innerText || '') === 'Tiny Yurts' && nodes[j].children.length === 0) {
        title = nodes[j];
        break;
      }
    }
    if (title && w < 520) title.style.fontSize = '42px';
  }

  function pauseButton() {
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (b.style.width === '64px' && b.style.height === '64px') return b;
    }
    return null;
  }

  if (api && api.onBack) {
    var backPaused = false;
    api.onBack(function () {
      var pause = pauseButton();
      var playing = pause && parseFloat(pause.style.opacity || '0') > 0.5;
      if (playing && !backPaused) {
        pause.click();
        backPaused = true;
        return true;
      }
      backPaused = false;
      return false;
    });
  }

  function bootNet() {
    if (!api || !playersDb) return;
    api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      if (me.id === 'local') return;
      started = true;
      playersDb.subscribe(function (list) {
        var seen = {};
        (list || []).forEach(function (p) {
          if (!p || !p.id || p.id === me.id) return;
          seen[p.id] = 1;
          others[p.id] = p;
        });
        Object.keys(others).forEach(function (id) { if (!seen[id]) delete others[id]; });
        paintRoster();
      });
      publish();
    }).catch(function () {});
  }

  /* vendor/game.js is a static <script> so the packer inlines it. A dynamic
     src= fetch from this iframe has nowhere to go (about:srcdoc). The jam
     already ran and read localStorage; we paint the saved highscore over the
     title and fit the valley to the phone. */
  fitBoard();
  root.addEventListener('resize', fitBoard);
  if (root.visualViewport) root.visualViewport.addEventListener('resize', fitBoard);

  if (!saveDb) { bootNet(); return; }
  saveDb.get('prefs').then(function (row) {
    hydrate(row);
    paintHi(currentScore());
  }).catch(function () {}).then(bootNet);
})(window);
