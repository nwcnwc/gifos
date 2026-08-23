/*
 * Dante — optional ghosts over a meeting.
 *
 * Upstream has no networking. Each devil owns one row in `players` and
 * only ever writes that row: pose, look, souls caught. A ghost is that
 * row drawn with the local player mesh. Solo is the original game.
 *
 * A subscriber re-downloads the WHOLE collection on every change, so
 * publish is slow (8 Hz) with interpolation, not a datagram stream.
 * Invite is OS chrome. This file never draws a share button.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 9000;
  var SLOT_BODY = 25;

  var api = null;
  var me = { id: null, name: 'Dante' };
  var others = {};
  var lastPublished = 0;
  var onRoster = null;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function tintFor(id) {
    var h = 0;
    id = String(id || '');
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function yawOfBody() {
    var E = root.DanteEngine;
    if (!E || !E.allModels) return 0;
    var m = E.allModels[E.MODEL_ID_PLAYER_BODY];
    if (!m || !m.$matrix) return 0;
    var mat = m.$matrix;
    return Math.atan2(mat.m13, mat.m11) * 180 / Math.PI;
  }

  function pose() {
    var E = root.DanteEngine;
    var p = E && E.player_position_final;
    return {
      x: p ? p.x : 0,
      y: p ? p.y : 0,
      z: p ? p.z : 0,
      yaw: yawOfBody(),
      souls: E && E.soulsCount ? E.soulsCount() : 0
    };
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ others: 0 });
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Dante';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ others: countOthers() });
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

  function ingest(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.z !== p.z || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Dante',
        x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0,
        souls: p.souls | 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t,
        hue: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, z: cur.z, yaw: cur.yaw, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  function angLerp(a, b, k) {
    var d = ((b - a + 540) % 360) - 180;
    return a + d * k;
  }

  function poseOf(o) {
    if (!o.prev) return { x: o.x, y: o.y, z: o.z, yaw: o.yaw };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      y: o.prev.y + (o.y - o.prev.y) * a,
      z: o.prev.z + (o.z - o.prev.z) * a,
      yaw: angLerp(o.prev.yaw, o.yaw, a)
    };
  }

  function publish(force) {
    if (!api || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var p = pose();
    db('players').put({
      id: me.id, name: me.name,
      x: r1(p.x), y: r1(p.y), z: r1(p.z),
      yaw: r1(p.yaw),
      souls: p.souls | 0,
      t: t
    }).catch(function () {});
  }

  function tick() { publish(false); }

  function writeSlot(buf, slot, m) {
    var E = root.DanteEngine;
    E.matrixToArray(m, buf, slot);
  }

  function drawGhosts(gl, mainShader) {
    var E = root.DanteEngine;
    if (!E || !E.transformsBuffer || !E.allModels) return;
    var n = 0;
    for (var id in others) n++;
    if (!n) return;
    var body = E.allModels[E.MODEL_ID_PLAYER_BODY];
    var leg1 = E.allModels[E.MODEL_ID_PLAYER_LEG1];
    if (!body || !leg1 || body.$vertexBegin == null) return;

    var buf = E.transformsBuffer;
    var saved = buf.slice(SLOT_BODY * 16, (SLOT_BODY + 3) * 16);
    var loc = mainShader('j');

    for (var gid in others) {
      var o = others[gid];
      if (now() - o.seen > STALE_MS) continue;
      var p = poseOf(o);
      var m = new DOMMatrix();
      m.translateSelf(p.x, p.y, p.z);
      m.rotateSelf(0, p.yaw);
      writeSlot(buf, SLOT_BODY, m);
      writeSlot(buf, SLOT_BODY + 1, m);
      writeSlot(buf, SLOT_BODY + 2, m);
      gl.uniform4fv(loc, buf);
      gl.drawElements(
        gl.TRIANGLES,
        leg1.$vertexEnd - body.$vertexBegin,
        gl.UNSIGNED_SHORT,
        body.$vertexBegin * 2
      );
    }
    buf.set(saved, SLOT_BODY * 16);
    gl.uniform4fv(loc, buf);
  }

  function roster() {
    var E = root.DanteEngine;
    var list = [{
      id: me.id, name: me.name, me: true,
      souls: E && E.soulsCount ? E.soulsCount() : 0
    }];
    for (var id in others) {
      var o = others[id];
      list.push({ id: o.id, name: o.name, me: false, souls: o.souls });
    }
    list.sort(function (a, b) { return (b.souls - a.souls) || a.name.localeCompare(b.name); });
    return list;
  }

  function countOthers() {
    var n = 0;
    for (var k in others) n++;
    return n;
  }

  root.Net = {
    init: init,
    tick: tick,
    publish: publish,
    roster: roster,
    others: function () { return others; },
    me: function () { return me; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    live: function () { return !!api && !!me.id; },
    onRoster: function (fn) { onRoster = fn; },
    drawGhosts: drawGhosts
  };
})(window);
