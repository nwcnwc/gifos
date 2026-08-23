// NxN Cube — GifOS shell around NXN.Rubiks.
// Solo is the toy. In a room, Scramble publishes a seed so every peer builds
// the same shuffle; each player then writes ONLY their own row (moves + solved).
(function () {
  'use strict';

  var Rubiks = window.NXN && (NXN.Rubiks || NXN.default);
  if (!Rubiks) throw new Error('NXN.Rubiks missing — vendor/cube.js did not boot');

  var $ = function (id) { return document.getElementById(id); };
  var cube = new Rubiks($('stage'));

  var me = { id: 'local', name: 'You' };
  var myMoves = 0;
  var mySolved = false;
  var mySolvedAt = 0;
  var applying = false;
  var raceRec = null;
  var roster = [];
  var prefsDb = null, raceDb = null, playersDb = null;

  try {
    if (window.gifos && gifos.db) {
      prefsDb = gifos.db('prefs');
      raceDb = gifos.db('race');
      playersDb = gifos.db('players');
    }
  } catch (e) {}

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }

  function setStatus(solved) {
    $('status').textContent = solved ? 'Solved' : 'Shuffled';
    $('status').className = 'stat' + (solved ? ' solved' : '');
    $('moves').textContent = String(myMoves);
  }

  function publish() {
    if (!playersDb || !me.id || me.id === 'local') return;
    playersDb.put({
      id: me.id,
      name: me.name,
      moves: myMoves,
      solved: mySolved,
      solvedAt: mySolvedAt || 0,
      seed: raceRec ? raceRec.seed : (cube.seed || 0),
      order: cube.order,
      t: Date.now()
    }).catch(function () {});
  }

  function paintBoard() {
    var list = roster.slice();
    if (me.id !== 'local' && !list.some(function (p) { return p.id === me.id; })) {
      list.push({ id: me.id, name: me.name, moves: myMoves, solved: mySolved, solvedAt: mySolvedAt });
    }
    list.sort(function (a, b) {
      if (a.solved && b.solved) return (a.solvedAt || 0) - (b.solvedAt || 0) || a.moves - b.moves;
      if (a.solved !== b.solved) return a.solved ? -1 : 1;
      return a.moves - b.moves;
    });
    var winner = list.find(function (p) { return p.solved; });
    $('board').innerHTML = list.map(function (p, i) {
      var cls = (p.id === me.id ? 'me' : '') + (winner && winner.id === p.id ? ' win' : '');
      var meta = p.solved
        ? ('solved · ' + p.moves)
        : (p.moves + ' move' + (p.moves === 1 ? '' : 's'));
      var tag = (winner && winner.id === p.id) ? ' · first' : '';
      return '<li class="' + cls + '"><span class="name">' + esc(p.name || 'Player') +
        tag + '</span><span class="meta">' + esc(meta) + '</span></li>';
    }).join('');
    if (list.length > 1) {
      $('race-note').textContent = winner
        ? (winner.name || 'Someone') + ' finished first. Scramble for another race.'
        : 'Same scramble. First to solved wins.';
    }
  }

  function applyRace(r) {
    if (!r || r.seed == null) return;
    if (raceRec && raceRec.seed === r.seed && raceRec.order === r.order) return;
    raceRec = { seed: r.seed, order: r.order, at: r.at, by: r.by };
    applying = true;
    if (cube.order !== r.order) {
      cube.setOrder(r.order);
      $('order').value = String(r.order);
    }
    cube.scramble(r.seed);
    myMoves = 0;
    mySolved = false;
    mySolvedAt = 0;
    applying = false;
    setStatus(false);
    publish();
    paintBoard();
  }

  cube.onTurn(function (info) {
    myMoves = info.moves;
    if (info.finish && cube.seed != null) {
      if (!mySolved) {
        mySolved = true;
        mySolvedAt = Date.now();
      }
    } else {
      mySolved = false;
      mySolvedAt = 0;
    }
    setStatus(!!info.finish);
    publish();
    paintBoard();
  });

  $('scramble').onclick = function () {
    var seed = cube.scramble();
    myMoves = 0;
    mySolved = false;
    mySolvedAt = 0;
    setStatus(false);
    raceRec = { seed: seed, order: cube.order, at: Date.now(), by: me.name };
    if (raceDb) {
      raceDb.put({
        id: 'race',
        seed: seed,
        order: cube.order,
        at: raceRec.at,
        by: me.name,
        byId: me.id
      }).catch(function () {});
    }
    publish();
    paintBoard();
  };

  $('restore').onclick = function () {
    cube.restore();
    myMoves = 0;
    mySolved = false;
    mySolvedAt = 0;
    setStatus(true);
    publish();
    paintBoard();
  };

  $('order').onchange = function () {
    var n = +this.value;
    cube.setOrder(n);
    myMoves = 0;
    mySolved = false;
    mySolvedAt = 0;
    setStatus(true);
    if (prefsDb) prefsDb.put({ id: 'prefs', order: n }).catch(function () {});
    if (raceDb && raceRec) {
      $('scramble').click();
      return;
    }
    publish();
    paintBoard();
  };

  if (prefsDb) {
    prefsDb.get('prefs').then(function (p) {
      if (p && p.order >= 2 && p.order <= 10 && p.order !== cube.order) {
        cube.setOrder(p.order);
        $('order').value = String(p.order);
      }
    }).catch(function () {});
  }

  var ready = window.gifos && gifos.me
    ? gifos.me().catch(function () { return { id: 'local', name: 'You' }; })
    : Promise.resolve({ id: 'local', name: 'You' });

  ready.then(function (id) {
    me.id = (id && id.id) || 'local';
    me.name = (id && id.name) || 'You';
    if (playersDb) {
      playersDb.subscribe(function (list) {
        roster = (list || []).filter(function (p) { return p && p.id; });
        paintBoard();
      });
    }
    if (raceDb) {
      raceDb.subscribe(function (list) {
        var r = (list || []).find(function (x) { return x && x.id === 'race'; });
        if (r && !applying) applyRace(r);
      });
    }
    publish();
    paintBoard();
  });

  setStatus(true);
})();
