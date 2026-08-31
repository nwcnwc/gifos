/*
 * Breakout — extra paddle over a meeting.
 *
 * Upstream has no networking. The only channel GifOS gives an app is a
 * replicated collection. Two rules shape this:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      publish is a handful of numbers at 20 Hz, not a datagram stream.
 *   2. NOBODY WRITES TO ANYBODY ELSE'S ROW. Each player owns one record in
 *      `players`. The host alone writes `world` (the ball and the bricks).
 *
 * Host simulates the ball and the wall. The guest writes only their paddle
 * x; the host puts that paddle in the ball's hit list. Score and lives are
 * shared because they live on world.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 20;
  var WORLD_HZ = 20;
  var STALE_MS = 2500;

  var api = null;
  var me = { id: null, name: 'You' };
  var others = {};
  var owner = true;
  var world = null;
  var lastPublished = 0;
  var lastWorld = 0;
  var onRoster = null;
  var game = null;
  var wantPlay = 0;
  var seated = true;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }

  function countOthers() {
    var n = 0;
    for (var k in others) n++;
    return n;
  }

  function opponent() {
    var ids = Object.keys(others).sort();
    if (!ids.length) return null;
    if (!owner) {
      for (var i = 0; i < ids.length; i++) {
        if (others[ids[i]].host) return others[ids[i]];
      }
    }
    return others[ids[0]];
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
    var infoP = api.info ? api.info().then(function (i) {
      owner = !!(i && i.owner);
      return owner;
    }).catch(function () { owner = true; return true; }) : Promise.resolve(true);

    return infoP.then(function () {
      return api.me();
    }).then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'You';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ owner: owner, others: countOthers() });
        };
        setTimeout(done, 2500);
        db('players').subscribe(function (list) {
          ingestPlayers(list || []);
          done();
        });
        db('world').subscribe(function (list) {
          ingestWorld(list || []);
        });
      });
    }).catch(function () {
      return { owner: true, others: 0 };
    });
  }

  function ingestPlayers(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Friend',
        x: p.x,
        host: !!p.host,
        wp: !!p.wp,
        stamp: p.t,
        seen: moved ? t : (cur ? cur.seen : t)
      };
    }
    for (var id in others) {
      if (!seen[id] || t - others[id].seen > STALE_MS) delete others[id];
    }
    var opp = opponent();
    if (owner && opp && opp.wp && game) {
      try {
        if (game.is && game.is('menu')) game.play();
        else if (game.ball && !game.ball.moving) game.ball.launchNow();
      } catch (e) {}
    }
    if (onRoster) onRoster(roster());
  }

  function ingestWorld(list) {
    var rec = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === 'world') rec = list[i];
    }
    world = rec;
    if (rec && rec.seat) seated = owner || rec.seat === me.id;
    else if (owner) seated = true;
    if (owner || !rec || !game) return;
    applyWorld(rec);
  }

  function exportHits(g) {
    var b = g.court && g.court.bricks;
    if (!b) return '';
    var s = '';
    for (var i = 0; i < b.length; i++) s += b[i].hit ? '1' : '0';
    return s;
  }

  function importHits(g, s) {
    var b = g.court && g.court.bricks;
    if (!b || !s) return;
    var dirty = false, hits = 0;
    var n = Math.min(b.length, s.length);
    for (var i = 0; i < n; i++) {
      var hit = s.charAt(i) === '1';
      if (b[i].hit !== hit) { b[i].hit = hit; dirty = true; }
      if (hit) hits++;
    }
    if (dirty) {
      g.court.numhits = hits;
      g.court.rerender = true;
    }
  }

  function applyWorld(rec) {
    var g = game;
    if (rec.lv != null && rec.lv !== g.level) {
      try { g.setLevel(rec.lv); } catch (e) {}
    }
    importHits(g, rec.hits);
    if (rec.sc != null && g.score && g.score.score !== rec.sc) {
      g.score.score = rec.sc;
      if (g.score.vscore > rec.sc) g.score.vscore = rec.sc;
      g.score.rerender = true;
    }
    if (rec.li != null && g.score) g.score.setLives(rec.li);
    if (rec.hs != null && g.score && rec.hs > g.score.highscore) {
      g.score.highscore = rec.hs;
      g.score.rerender = true;
    }
    if (g.ball) {
      if (rec.bsp) g.ball.speed = rec.bsp;
      if (rec.bm) {
        g.ball.moving = true;
        g.ball.clearLaunch();
        var age = Math.max(0, Math.min(0.12, (now() - rec.t) / 1000));
        var dx = rec.bdx || 0, dy = rec.bdy || 0, sp = rec.bsp || 0;
        g.ball.setpos((rec.bx || 0) + dx * sp * age, (rec.by || 0) + dy * sp * age);
        g.ball.setdir(dx, dy);
      } else {
        g.ball.clearLaunch();
        g.ball.setdir(0, 0);
        g.ball.moving = false;
        if (rec.bx != null) g.ball.setpos(rec.bx, rec.by);
      }
    }
    if (rec.st === 'game' && g.current !== 'game') {
      g.current = 'game';
      g.refreshDOM();
    } else if (rec.st === 'menu' && g.current !== 'menu') {
      g.current = 'menu';
      g.refreshDOM();
    }
  }

  function attach(g) { game = g; }

  function askPlay() { wantPlay = 1; publish(true); }

  function publish(force) {
    if (!api || !me.id || me.id === 'local') return;
    var g = game;
    var App = root.BreakoutApp;
    if (!g || !App) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var paddle = App.localPaddle();
    if (!paddle) return;
    if (!owner && g.paddle && paddle === g.paddle) return;
    db('players').put({
      id: me.id,
      name: me.name,
      x: r1(paddle.x),
      host: owner ? 1 : 0,
      wp: wantPlay,
      t: t
    }).catch(function () {});
    if (wantPlay && g.is && !g.is('menu')) wantPlay = 0;
  }

  function publishWorld(force) {
    if (!api || !me.id || !owner) return;
    var g = game;
    if (!g || !g.ball) return;
    var t = now();
    if (!force && t - lastWorld < 1000 / WORLD_HZ) return;
    lastWorld = t;
    var b = g.ball;
    db('world').put({
      id: 'world',
      by: me.id,
      bx: r1(b.x), by: r1(b.y),
      bdx: r2(b.dx), bdy: r2(b.dy),
      bsp: r1(b.speed),
      bm: b.moving ? 1 : 0,
      hits: exportHits(g),
      lv: g.level,
      sc: g.score ? g.score.score : 0,
      li: g.score ? g.score.lives : 0,
      hs: g.score ? g.score.highscore : 0,
      st: g.current,
      seat: (function () { var o = opponent(); return o ? o.id : ''; })(),
      t: t
    }).catch(function () {});
  }

  function tick() {
    if (!api || !me.id) return;
    publish(false);
    if (owner) publishWorld(false);
  }

  function roster() {
    var App = root.BreakoutApp;
    var g = game;
    var list = [{
      id: me.id, name: me.name, me: true, host: owner,
      x: App && App.localPaddle() ? App.localPaddle().x : 0
    }];
    for (var id in others) {
      var o = others[id];
      list.push({ id: o.id, name: o.name, me: false, host: o.host, x: o.x });
    }
    return list;
  }

  root.Net = {
    init: init,
    attach: attach,
    tick: tick,
    publish: publish,
    publishWorld: publishWorld,
    askPlay: askPlay,
    roster: roster,
    opponent: opponent,
    others: function () { return others; },
    me: function () { return me; },
    owner: function () { return owner; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    live: function () { return !!api && !!me.id && countOthers() > 0; },
    seated: function () { return seated && countOthers() > 0; },
    onRoster: function (fn) { onRoster = fn; }
  };
})(window);
