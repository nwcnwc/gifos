/*
 * Radius Raid — extra ships in the same arena.
 *
 * Upstream has no networking. The only channel an app has is the replicated
 * collection — gifos.db('players').subscribe(...) — hosted by the host's
 * browser. Two properties shape every decision:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      traffic is O(players²). Publish at 6 Hz, keep rows mean.
 *   2. NOBODY WRITES TO ANYBODY ELSE'S ROW. Each player owns exactly one
 *      record. The sim host publishes enemies on THEIR row; a guest publishes
 *      hit claims on THEIRS. The target of a claim is an enemy index, never
 *      another player's health — each ship applies its own damage.
 *
 * Invite is OS chrome. This file never draws a share button.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 6;
  var STALE_MS = 9000;
  var HIT_RING = 10;
  var CLAIM_TTL = 12000;

  var api = null;
  var me = { id: null, name: 'Pilot' };
  var others = {};
  var seq = 0;
  var pendingHits = [];
  var pendingGrabs = [];
  var applied = {};
  var lastPublished = 0;
  var playing = false;
  var sim = false;
  var lastHostId = null;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function tintFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var hue = h % 360;
    return 'hsl(' + hue + ', 85%, 62%)';
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve(null);
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Pilot';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function (list) { if (!settled) { settled = true; resolve(list || []); } };
        setTimeout(function () { done([]); }, 2500);
        db('players').subscribe(function (list) {
          ingest(list || []);
          done(list || []);
        });
      });
    }).catch(function () { return null; });
  }

  function ingest(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      if (p.id === me.id) continue;
      seen[p.id] = 1;
      drainClaims(p);
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Pilot',
        x: p.x, y: p.y, dir: p.dir || 0, life: p.life == null ? 1 : p.life,
        fire: !!p.fire, score: p.sc || 0, playing: !!p.playing, sim: !!p.sim,
        en: p.en, pu: p.pu, lv: p.lv, kk: p.kk, kt: p.kt, tk: p.tk,
        stamp: p.t, seen: moved ? t : cur.seen, t: t, fill: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, dir: cur.dir, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    elect();
  }

  function elect() {
    var hostId = null;
    for (var id in others) {
      var o = others[id];
      if (!o.sim || !o.playing) continue;
      if (!hostId || id < hostId) hostId = id;
    }
    if (playing && sim) {
      if (!hostId || me.id < hostId) hostId = me.id;
    }
    lastHostId = hostId;
  }

  function hostRow() {
    if (!lastHostId || lastHostId === me.id) return null;
    return others[lastHostId] || null;
  }

  function inRoom() {
    if (!api || !me.id) return false;
    for (var id in others) if (others[id].playing) return true;
    return playing && lastHostId != null && lastHostId !== me.id;
  }

  function isGuest() {
    return playing && lastHostId && lastHostId !== me.id;
  }

  function isSimHost() { return !isGuest(); }

  function drainClaims(p) {
    if (!playing || !sim || isGuest()) return;
    if (p.hits && p.hits.length && root.$ && $.enemies) {
      for (var i = 0; i < p.hits.length; i++) {
        var h = p.hits[i];
        if (!h) continue;
        var key = p.id + ':h:' + h.n;
        if (applied[key]) continue;
        applied[key] = now();
        var ei = $.enemies.length;
        while (ei--) {
          if ($.enemies[ei].index === h.i) {
            $.enemies[ei].receiveDamage(ei, h.d || 1);
            break;
          }
        }
      }
    }
    if (p.grabs && p.grabs.length && root.$ && $.powerups) {
      for (var g = 0; g < p.grabs.length; g++) {
        var grab = p.grabs[g];
        if (!grab) continue;
        var gk = p.id + ':g:' + grab.n;
        if (applied[gk]) continue;
        applied[gk] = now();
        var pi = $.powerups.length;
        while (pi--) {
          var pu = $.powerups[pi];
          if (Math.abs(pu.x - grab.x) < 40 && Math.abs(pu.y - grab.y) < 40) {
            $.powerups.splice(pi, 1);
            break;
          }
        }
      }
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in applied) if (applied[k] < cutoff) delete applied[k];
  }

  function claimHit(index, dmg) {
    if (!api || !me.id || !isGuest()) return;
    pendingHits.push({ i: index, d: dmg, n: ++seq });
    if (pendingHits.length > HIT_RING) pendingHits.shift();
    publish(true);
  }

  function claimGrab(x, y) {
    if (!api || !me.id || !isGuest()) return;
    pendingGrabs.push({ x: r1(x), y: r1(y), n: ++seq });
    if (pendingGrabs.length > HIT_RING) pendingGrabs.shift();
    publish(true);
  }

  function packEnemies() {
    var out = [];
    if (!root.$ || !$.enemies) return out;
    for (var i = 0; i < $.enemies.length; i++) {
      var e = $.enemies[i];
      out.push([e.index, e.type | 0, e.x | 0, e.y | 0, Math.round(e.life * 10), e.radius | 0, e.hue | 0]);
    }
    return out;
  }

  function packPowerups() {
    var out = [];
    if (!root.$ || !$.powerups) return out;
    for (var i = 0; i < $.powerups.length; i++) {
      var p = $.powerups[i];
      out.push([p.type | 0, p.x | 0, p.y | 0]);
    }
    return out;
  }

  function ghostEnemy(snap) {
    var def = ($.definitions && $.definitions.enemies && $.definitions.enemies[snap[1]]) || {};
    var e = Object.create($.Enemy.prototype);
    e.index = snap[0];
    e.type = snap[1];
    e.x = snap[2]; e.y = snap[3];
    e.life = (snap[4] || 0) / 10;
    e.radius = snap[5] || def.radius || 15;
    e.hue = snap[6] != null ? snap[6] : (def.hue || 0);
    e.saturation = def.saturation != null ? def.saturation : 100;
    e.lightness = def.lightness != null ? def.lightness : 50;
    e.lifeMax = def.life || 1;
    e.inView = 1; e.hitFlag = 0; e.vx = 0; e.vy = 0;
    e.value = def.value || 0;
    e.setup = function () {};
    e.behavior = function () {};
    e.death = function () {};
    e.fillStyle = 'hsla(' + e.hue + ', ' + e.saturation + '%, ' + e.lightness + '%, 0.1)';
    e.strokeStyle = 'hsla(' + e.hue + ', ' + e.saturation + '%, ' + e.lightness + '%, 1)';
    e._tx = e.x; e._ty = e.y;
    return e;
  }

  function applySnapshot() {
    var h = hostRow();
    if (!h || !h.en || !root.$) return;
    var by = {};
    var i;
    for (i = 0; i < $.enemies.length; i++) by[$.enemies[i].index] = $.enemies[i];
    var next = [];
    for (i = 0; i < h.en.length; i++) {
      var snap = h.en[i];
      var e = by[snap[0]];
      if (!e) e = ghostEnemy(snap);
      else {
        e._tx = snap[2]; e._ty = snap[3];
        e.life = (snap[4] || 0) / 10;
        e.radius = snap[5] || e.radius;
        e.hue = snap[6] != null ? snap[6] : e.hue;
      }
      next.push(e);
    }
    $.enemies = next;
    if (h.pu && $.Powerup && $.definitions && $.definitions.powerups) {
      var have = $.powerups.length;
      if (have !== h.pu.length) {
        $.powerups.length = 0;
        for (i = 0; i < h.pu.length; i++) {
          var row = h.pu[i];
          var params = $.definitions.powerups[row[0]];
          if (!params) continue;
          params = {
            type: row[0], x: row[1], y: row[2],
            title: params.title, hue: params.hue,
            saturation: params.saturation, lightness: params.lightness
          };
          try {
            var pu = new $.Powerup(params);
            pu.x = row[1];
            pu.y = row[2];
            $.powerups.push(pu);
          } catch (err) {}
        }
      } else {
        for (i = 0; i < h.pu.length && i < $.powerups.length; i++) {
          $.powerups[i].x = h.pu[i][1];
          $.powerups[i].y = h.pu[i][2];
        }
      }
    }
    if (h.sc != null) $.score = h.sc;
    if (h.lv != null && $.level) {
      if (h.lv > $.level.current) {
        $.level.current = h.lv;
        if ($.LevelPop) {
          $.levelPops.push(new $.LevelPop({ level: h.lv + 1 }));
        }
      }
      $.level.current = h.lv;
      if (h.kk != null) $.level.kills = h.kk;
      if (h.kt != null) $.level.killsToLevel = h.kt;
    }
  }

  function publish(force) {
    if (!api || !me.id || !root.$ || !$.hero) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var row = {
      id: me.id, name: me.name,
      x: r1($.hero.x), y: r1($.hero.y), dir: r1($.hero.direction || 0),
      life: r1($.hero.life), fire: $.hero.weapon && $.hero.weapon.fireFlag > 0 ? 1 : 0,
      sc: $.score | 0, playing: playing ? 1 : 0, sim: sim && playing ? 1 : 0,
      t: t
    };
    if (sim && playing) {
      row.en = packEnemies();
      row.pu = packPowerups();
      row.lv = $.level ? $.level.current : 0;
      row.kk = $.level ? $.level.kills : 0;
      row.kt = $.level ? $.level.killsToLevel : 0;
      row.tk = $.tick | 0;
    }
    if (pendingHits.length) row.hits = pendingHits.slice();
    if (pendingGrabs.length) row.grabs = pendingGrabs.slice();
    db('players').put(row).catch(function () {});
  }

  function tick() {
    if (!api || !me.id) return;
    elect();
    if (playing) publish(false);
  }

  function setPlaying(on) {
    playing = !!on;
    if (playing) {
      elect();
      sim = !lastHostId || lastHostId === me.id;
      if (!sim) {
        // someone else is already running the arena
      } else {
        sim = true;
      }
      elect();
      sim = !lastHostId || lastHostId === me.id;
      publish(true);
    } else {
      sim = false;
      pendingHits = [];
      pendingGrabs = [];
      publish(true);
    }
  }

  function poseOf(o) {
    if (!o) return null;
    if (!o.prev) return { x: o.x, y: o.y, dir: o.dir, life: o.life, fire: o.fire };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    var dd = ((o.dir - o.prev.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      y: o.prev.y + (o.y - o.prev.y) * a,
      dir: o.prev.dir + dd * a,
      life: o.life, fire: o.fire
    };
  }

  function homingTarget(ex, ey, fallback) {
    var best = fallback, bd = Infinity;
    function consider(x, y, life) {
      if (life <= 0) return;
      var dx = x - ex, dy = y - ey, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: x, y: y, life: life }; }
    }
    consider(fallback.x, fallback.y, fallback.life);
    for (var id in others) {
      var o = others[id];
      if (!o.playing) continue;
      var p = poseOf(o);
      consider(p.x, p.y, o.life);
    }
    return best;
  }

  root.Net = {
    init: init,
    tick: tick,
    publish: publish,
    setPlaying: setPlaying,
    claimHit: claimHit,
    claimGrab: claimGrab,
    applySnapshot: applySnapshot,
    poseOf: poseOf,
    others: function () { return others; },
    me: function () { return me; },
    live: function () { return !!api && !!me.id; },
    inRoom: function () {
      if (!api || !me.id) return false;
      for (var id in others) return true;
      return false;
    },
    anyoneElsePlaying: function () {
      for (var id in others) if (others[id].playing) return true;
      return false;
    },
    isGuest: isGuest,
    isSimHost: isSimHost,
    homingTarget: homingTarget,
    count: function () {
      var n = 1;
      for (var id in others) n++;
      return n;
    }
  };
})(window);
