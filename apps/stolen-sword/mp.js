/*
 * Stolen Sword — extra swordsmen over a meeting.
 *
 * Upstream has no networking. The only channel GifOS gives an app is a
 * replicated collection. Two rules shape this:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      publish is slow (8 Hz) with interpolation, not a datagram stream.
 *   2. NOBODY WRITES TO ANYBODY ELSE'S ROW. Each swordsman owns one record
 *      in `players`. Ghosts are poses, not a shared sim — everyone fights
 *      their own grove. Solo is the original game.
 *
 * The room link is OS chrome. This file never draws a share control.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 9000;

  var api = null;
  var me = { id: null, name: 'Sword' };
  var others = {};
  var lastPublished = 0;
  var onRoster = null;
  var skel = null;
  var hooked = false;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function tintFor(id) {
    var h = 0;
    id = String(id || '');
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (h % 360);
  }

  function colorsFor(hue, health) {
    var shirt = health === 2 ? 'hsl(' + hue + ', 18%, 78%)' : 'hsl(4, 72%, 62%)';
    return [
      'hsl(' + hue + ', 12%, 38%)',
      'hsl(' + hue + ', 10%, 12%)',
      shirt,
      'hsl(' + hue + ', 14%, 22%)',
      'hsl(' + hue + ', 10%, 52%)'
    ];
  }

  function ss() { return root.StolenSword; }

  function myPose() {
    var S = ss();
    if (!S || !S.player || !S.player.p) {
      return { x: 0, y: 0, facing: 1, stage: 0, wave: -1, health: 2, started: false };
    }
    return {
      x: S.player.p.x,
      y: S.player.p.y,
      facing: S.getFacing ? S.getFacing() : 1,
      stage: S.stageIndex ? S.stageIndex() : 0,
      wave: S.stageWave ? S.stageWave() : -1,
      health: S.health ? S.health() : 2,
      started: S.started ? S.started() : false
    };
  }

  function publish(force) {
    if (!api || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var p = myPose();
    var rec = {
      id: me.id,
      name: me.name,
      x: r1(p.x),
      y: r1(p.y),
      f: p.facing < 0 ? -1 : 1,
      st: p.stage | 0,
      wv: p.wave | 0,
      hp: p.health | 0,
      on: !!p.started,
      t: t
    };
    try { db('players').put(rec).catch(function () {}); } catch (e) {}
  }

  function ingest(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Sword',
        x: p.x || 0,
        y: p.y || 0,
        facing: p.f < 0 ? -1 : 1,
        stage: p.st | 0,
        wave: p.wv | 0,
        health: p.hp == null ? 2 : p.hp | 0,
        started: !!p.on,
        stamp: p.t,
        seen: moved ? t : cur.seen,
        t: t,
        hue: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  function interp(g) {
    if (!g.prev || !g.prev.t) return { x: g.x, y: g.y };
    var dt = g.t - g.prev.t;
    if (dt <= 0) return { x: g.x, y: g.y };
    var u = Math.min(1, (now() - g.t) / dt);
    return {
      x: g.prev.x + (g.x - g.prev.x) * u,
      y: g.prev.y + (g.y - g.prev.y) * u
    };
  }

  function paintGhosts(ctx) {
    var S = ss();
    if (!S || !skel) return;
    var myStage = S.stageIndex ? S.stageIndex() : 0;
    var pose = S.POSE_CHARGE || [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (var id in others) {
      var g = others[id];
      if (g.stage !== myStage) continue;
      var p = interp(g);
      ctx.save();
      ctx.globalAlpha = g.started ? 0.45 : 0.22;
      skel.p(pose);
      skel.d(ctx, { x: p.x, y: p.y }, colorsFor(g.hue, g.health), g.facing);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  function hookDraw() {
    if (hooked) return;
    var S = ss();
    if (!S || !S.player || !S.KEY_OBJECT_ON_UPDATE) return;
    if (!S.player[S.KEY_OBJECT_ON_UPDATE]) return;
    hooked = true;
    skel = S.createSkeleton();
    S.player[S.KEY_OBJECT_ON_UPDATE].push(function () {
      S.draw(26, paintGhosts);
      publish(false);
    });
  }

  function roster() {
    var mine = myPose();
    var rows = [{
      id: me.id || 'local',
      name: me.name || 'You',
      me: true,
      stage: mine.stage,
      wave: mine.wave,
      health: mine.health,
      started: mine.started
    }];
    for (var id in others) {
      var o = others[id];
      rows.push({
        id: o.id, name: o.name, me: false,
        stage: o.stage, wave: o.wave, health: o.health, started: o.started
      });
    }
    rows.sort(function (a, b) {
      if (a.stage !== b.stage) return b.stage - a.stage;
      return (b.wave | 0) - (a.wave | 0);
    });
    return rows;
  }

  function init() {
    hookDraw();
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ others: 0 });
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Sword';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          publish(true);
          resolve({ others: Object.keys(others).length });
        };
        setTimeout(done, 2500);
        db('players').subscribe(function (list) {
          ingest(list || []);
          done();
        });
      });
    }).catch(function () {
      return { others: 0 };
    });
  }

  root.Net = {
    init: init,
    roster: roster,
    onRoster: function (fn) { onRoster = fn; },
    live: function () { return Object.keys(others).length > 0; }
  };
})(window);
