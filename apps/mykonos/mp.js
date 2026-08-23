/* Extra people walking. Each player writes only THEIR row.
 * Invite is OS chrome — this file never draws a share button. */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 6;
  var STALE_MS = 9000;
  var W = root.MykWorld;

  var api = null;
  var me = { id: null, name: 'You' };
  var others = {};
  var lastPublished = 0;
  var onRoster = null;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r2(n) { return Math.round(n * 100) / 100; }

  function spawnFor(id) {
    var spots = [
      [5.5, 7.5], [6.5, 7.5], [5.5, 6.5], [11.5, 7.5], [7.5, 5.5], [7.5, 11.5]
    ];
    var h = 0, i;
    id = String(id || '');
    for (i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
    return spots[h % spots.length];
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve(null);
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'You';
      var sp = spawnFor(me.id);
      if (root.Myk.setPose) root.Myk.setPose(sp[0], sp[1]);
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

  function poseOf(o) {
    if (!o.prev) return { x: o.x, y: o.y, yaw: o.yaw };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    var dy = ((o.yaw - o.prev.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      y: o.prev.y + (o.y - o.prev.y) * a,
      yaw: o.prev.yaw + dy * a
    };
  }

  function ingest(list) {
    var t = now(), seen = {}, i, p, cur, moved;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      cur = others[p.id];
      moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Friend',
        x: p.x, y: p.y, yaw: p.yaw || 0, mv: p.mv || 0,
        tint: W.tintFor(p.id),
        stamp: p.t, seen: moved ? t : cur.seen, t: t,
        prev: cur ? { x: cur.x, y: cur.y, yaw: cur.yaw, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    paint();
    if (onRoster) onRoster(roster());
  }

  function paint() {
    var list = [], id, p, o;
    for (id in others) {
      o = others[id];
      p = poseOf(o);
      list.push({
        id: o.id, name: o.name, x: p.x, y: p.y, yaw: p.yaw,
        mv: o.mv, tint: o.tint
      });
    }
    root.Myk.setOthers(list);
  }

  function publish(force) {
    if (!api || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    var po = root.Myk.pose();
    if (!po) return;
    lastPublished = t;
    db('players').put({
      id: me.id, name: me.name,
      x: r2(po.x), y: r2(po.y), yaw: r2(po.yaw),
      mv: po.mv ? 1 : 0,
      t: t
    }).catch(function () {});
  }

  function tick() {
    if (!api || !me.id) return;
    paint();
    publish(false);
  }

  function roster() {
    var list = [{ id: me.id, name: me.name, me: true }];
    for (var id in others) list.push({ id: id, name: others[id].name, me: false });
    return list;
  }

  function countOthers() {
    var n = 0, k;
    for (k in others) n++;
    return n;
  }

  root.MykMp = {
    init: init,
    tick: tick,
    publish: publish,
    roster: roster,
    me: function () { return me; },
    live: function () { return !!api && !!me.id; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    onRoster: function (fn) { onRoster = fn; }
  };
})(window);
