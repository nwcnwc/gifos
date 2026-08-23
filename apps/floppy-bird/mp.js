/*
 * Floppy Bird — GifOS wrap.
 *
 * Upstream is a solo tap-flap game with Math.random pipes and a cookie
 * highscore. Everything multiplayer is here: a shared pipe seed, each bird
 * publishing y + alive + distance on its own row, ghosts of the others, and
 * a farthest-wins race. Nobody writes anybody else's row. Invite chrome is
 * the OS's, not ours. Solo is the original game.
 *
 * A subscriber re-downloads the whole collection on every change, so we
 * publish slowly (~8 Hz) with small numbers.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 8000;
  var SCROLL = 1000 / 7500; // px/ms — matches vendor/main.css animPipe

  var api = null;
  var me = { id: null, name: 'Player' };
  var others = {};
  var lastPublished = 0;
  var runStart = 0;
  var frozenDist = 0;
  var pipeSeed = 1;
  var pipeRng = null;
  var prefsDb = null;
  var roomDb = null;
  var savedHigh = 0;

  if (root.FLOPPY_ASSETS && root.FLOPPY_ASSETS['assets/replay.png']) {
    var replayImg = document.getElementById('replayimg');
    if (replayImg) replayImg.src = root.FLOPPY_ASSETS['assets/replay.png'];
  }

  root.FloppyBird = {
    getScore: function (cname) {
      if (cname === 'highscore') return String(savedHigh || 0);
      return '';
    },
    setScore: function (cname, value) {
      if (cname !== 'highscore') return;
      var n = parseInt(value, 10) || 0;
      if (n > savedHigh) savedHigh = n;
      savePrefs();
    }
  };

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashId(s) {
    var h = 2166136261;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function tintFor(id) {
    return hashId(id) % 360;
  }

  function resetPipes(seed) {
    pipeSeed = (seed >>> 0) || 1;
    pipeRng = mulberry32(pipeSeed);
  }

  function pickSeed() {
    var id;
    for (id in others) {
      if (others[id].alive && others[id].seed) return others[id].seed >>> 0;
    }
    return (Date.now() ^ hashId(me.id || 'local')) >>> 0 || 1;
  }

  function myDistance() {
    if (typeof currentstate !== 'undefined' && currentstate === states.GameScreen && runStart) {
      return (Date.now() - runStart) * SCROLL;
    }
    return frozenDist;
  }

  function myAlive() {
    return typeof currentstate !== 'undefined' && currentstate === states.GameScreen;
  }

  function savePrefs() {
    if (!prefsDb) return;
    try {
      prefsDb.put({ id: 'highscore', n: savedHigh }).catch(function () {});
    } catch (e) {}
  }

  function loadPrefs() {
    if (!api || !api.db) return;
    try { prefsDb = api.db('prefs'); } catch (e) { return; }
    prefsDb.get('highscore').then(function (row) {
      if (row && row.n > savedHigh) {
        savedHigh = row.n | 0;
        if (typeof highscore !== 'undefined' && savedHigh > highscore) highscore = savedHigh;
      }
    }).catch(function () {});
  }

  function publish(force) {
    if (!roomDb || !me.id) return;
    var now = Date.now();
    if (!force && now - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = now;
    var y = (typeof position === 'number') ? position : 180;
    var dist = myDistance();
    var rec = {
      id: me.id,
      name: me.name,
      y: Math.round(y),
      alive: myAlive(),
      distance: Math.round(dist),
      score: (typeof score === 'number') ? score : 0,
      seed: pipeSeed,
      t: now
    };
    try { roomDb.put(rec).catch(function () {}); } catch (e) {}
  }

  function ingest(list) {
    var now = Date.now();
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.y !== p.y || cur.distance !== p.distance || cur.stamp !== p.t || cur.alive !== !!p.alive;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Player',
        y: p.y == null ? 180 : p.y,
        alive: !!p.alive,
        distance: p.distance || 0,
        score: p.score || 0,
        seed: p.seed || 0,
        stamp: p.t,
        seen: moved ? now : cur.seen,
        hue: tintFor(p.id)
      };
    }
    for (var id in others) {
      if (!seen[id] || now - others[id].seen > STALE_MS) delete others[id];
    }
    paintGhosts();
    paintHud();
  }

  function paintGhosts() {
    var fly = document.getElementById('flyarea');
    if (!fly) return;
    var myD = myDistance();
    var seen = {};
    var id, el, o, x;
    for (id in others) {
      seen[id] = 1;
      o = others[id];
      el = document.getElementById('ghost-' + id);
      if (!el) {
        el = document.createElement('div');
        el.id = 'ghost-' + id;
        el.className = 'bird ghost animated';
        el.style.filter = 'hue-rotate(' + o.hue + 'deg)';
        fly.appendChild(el);
      }
      x = 60 + (o.distance - myD);
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(o.y) + 'px';
      el.style.opacity = o.alive ? '0.5' : '0.22';
      el.style.transform = o.alive ? '' : 'rotate(90deg)';
    }
    var ghosts = fly.querySelectorAll('.ghost');
    for (var i = 0; i < ghosts.length; i++) {
      var gid = ghosts[i].id.replace(/^ghost-/, '');
      if (!seen[gid]) ghosts[i].parentNode.removeChild(ghosts[i]);
    }
  }

  function roster() {
    var rows = [{
      id: me.id || 'local',
      name: me.name || 'You',
      mine: true,
      alive: myAlive(),
      distance: myDistance(),
      score: (typeof score === 'number') ? score : 0
    }];
    for (var id in others) {
      var o = others[id];
      rows.push({
        id: o.id, name: o.name, mine: false,
        alive: o.alive, distance: o.distance, score: o.score
      });
    }
    rows.sort(function (a, b) {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.distance - a.distance;
    });
    return rows;
  }

  function paintHud() {
    var bar = document.getElementById('racebar');
    if (!bar) return;
    var rows = roster();
    if (rows.length < 2) { bar.hidden = true; bar.textContent = ''; return; }
    bar.hidden = false;
    var bits = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var label = r.mine ? 'You' : r.name;
      var cls = 'who' + (r.alive ? '' : ' dead') + (i === 0 ? ' lead' : '');
      bits.push('<span class="' + cls + '">' + escapeHtml(label) + ' ' + (r.score | 0) +
        (r.alive ? '' : ' crashed') + '</span>');
    }
    var allDead = rows.every(function (r) { return !r.alive; });
    var line = bits.join(' · ');
    if (allDead) {
      var win = rows[0];
      line += '<div>' + (win.mine ? 'You win' : escapeHtml(win.name) + ' wins') +
        ' — farthest bird</div>';
    } else if (!rows[0].mine && rows[0].alive) {
      line += '<div>they are ahead</div>';
    } else if (rows[0].mine && rows[0].alive) {
      var someoneDead = rows.some(function (r) { return !r.mine && !r.alive; });
      if (someoneDead) line += '<div>they crashed — keep going</div>';
    }
    bar.innerHTML = line;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  // Seeded pipes — same sequence for everyone on this course.
  root.updatePipes = function () {
    $('.pipe').filter(function () { return $(this).position().left <= -100; }).remove();
    var padding = 80;
    var constraint = flyArea - pipeheight - (padding * 2);
    if (!pipeRng) pipeRng = mulberry32(pipeSeed);
    var topheight = Math.floor((pipeRng() * constraint) + padding);
    var bottomheight = (flyArea - pipeheight) - topheight;
    var newpipe = $('<div class="pipe animated"><div class="pipe_upper" style="height: ' +
      topheight + 'px;"></div><div class="pipe_lower" style="height: ' +
      bottomheight + 'px;"></div></div>');
    $('#flyarea').append(newpipe);
    pipes.push(newpipe);
  };

  var _startGame = root.startGame;
  root.startGame = function () {
    resetPipes(pickSeed());
    runStart = Date.now();
    frozenDist = 0;
    _startGame();
    publish(true);
  };

  var _playerDead = root.playerDead;
  root.playerDead = function () {
    if (runStart) frozenDist = (Date.now() - runStart) * SCROLL;
    _playerDead();
    publish(true);
    paintHud();
  };

  var _showSplash = root.showSplash;
  root.showSplash = function () {
    runStart = 0;
    frozenDist = 0;
    _showSplash();
    publish(true);
  };

  var _gameloop = root.gameloop;
  root.gameloop = function () {
    _gameloop();
    publish(false);
    paintGhosts();
  };

  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

  function initNet() {
    api = root.gifos || null;
    if (!api || !api.db) return;
    loadPrefs();
    try { roomDb = api.db('room'); } catch (e) { return; }
    var settled = false;
    function go() {
      if (settled) return;
      settled = true;
    }
    api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'Player';
      go();
      roomDb.subscribe(function (list) { ingest(list || []); });
      publish(true);
    }).catch(function () {
      me.id = 'local';
      go();
    });
    setTimeout(go, 2500);
  }

  initNet();
})(window);
