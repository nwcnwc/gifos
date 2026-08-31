/*
 * Co-op factory. Each builder writes only their own cursor row. Buildings
 * live in `cells` (read-write). The host writes hub progress on `world`
 * and a compact item snapshot on `flow` so guests see the same belts.
 *
 * Invite is OS chrome — this file never draws that button.
 */
(function (root) {
  'use strict';

  var PUB_MS = 140;
  var FLOW_MS = 180;
  var CUR_MS = 120;
  var STALE_MS = 9000;

  var api = null;
  var me = { id: null, name: 'You' };
  var owner = true;
  var simHost = true;
  var others = {};
  var lastCellPut = 0;
  var lastFlow = 0;
  var lastCur = 0;
  var lastWorld = 0;
  var onRoster = null;
  var game = null;
  var applying = false;
  var worldLoaded = false;
  var pendingPuts = {};
  var pendingDels = {};

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }

  function tint(id) {
    var h = 0, i;
    id = String(id || '');
    for (i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return 'hsl(' + (h % 360) + ', 70%, 48%)';
  }

  function init(g) {
    game = g;
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
    var infoP = api.info ? api.info().then(function (i) {
      owner = !!(i && i.owner);
      simHost = owner;
      return owner;
    }).catch(function () { owner = true; simHost = true; return true; }) : Promise.resolve(true);

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
        setTimeout(done, 2200);
        db('cells').subscribe(function (list) {
          ingestCells(list || []);
          done();
        });
        db('world').subscribe(function (list) {
          ingestWorld(list || []);
        });
        db('flow').subscribe(function (list) {
          ingestFlow(list || []);
        });
        db('cursors').subscribe(function (list) {
          ingestCursors(list || []);
        });
      });
    }).catch(function () {
      return { owner: true, others: 0 };
    });
  }

  function ingestCells(list) {
    if (!game) return;
    var map = {}, seen = {}, i, rec, id, t = now();
    list = list || [];
    for (i = 0; i < list.length; i++) {
      rec = list[i];
      if (!rec || !rec.id) continue;
      seen[rec.id] = 1;
      if (pendingDels[rec.id]) continue;
      map[rec.id] = rec;
      if (pendingPuts[rec.id] && pendingPuts[rec.id].k === rec.k && ((pendingPuts[rec.id].r & 3) === (rec.r & 3))) {
        delete pendingPuts[rec.id];
      }
    }
    for (id in pendingPuts) {
      if (t - pendingPuts[id].t > 8000) { delete pendingPuts[id]; continue; }
      map[id] = pendingPuts[id];
    }
    for (id in pendingDels) {
      if (t - pendingDels[id] > 8000) { delete pendingDels[id]; continue; }
      if (!seen[id]) delete pendingDels[id];
    }
    applying = true;
    game.replaceCells(Object.keys(map).map(function (k) { return map[k]; }));
    applying = false;
    if (root.SZUI) root.SZUI.paintTools();
  }

  function ingestWorld(list) {
    var rec = null, i;
    for (i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === 'world') rec = list[i];
    }
    if (!rec || !game) return;
    if (simHost && worldLoaded) return;
    worldLoaded = true;
    if (rec.level != null) game.level = rec.level | 0;
    if (rec.delivered != null) game.delivered = rec.delivered | 0;
    if (rec.seed) game.seed = rec.seed;
    game.ensureUnlocks();
    if (game.level > 0) game.hint = '';
    if (root.SZUI) root.SZUI.paintTools();
  }

  function ingestFlow(list) {
    if (simHost || !game) return;
    var rec = null, i;
    for (i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === 'flow') rec = list[i];
    }
    if (!rec) return;
    game.importItems(rec.items || []);
  }

  function ingestCursors(list) {
    var t = now(), seen = {}, i, p;
    for (i = 0; i < (list || []).length; i++) {
      p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      others[p.id] = {
        id: p.id,
        name: p.name || 'friend',
        x: p.x, y: p.y,
        color: tint(p.id),
        seen: t
      };
    }
    for (i in others) {
      if (!seen[i] || t - others[i].seen > STALE_MS) delete others[i];
    }
    var roster = [{ id: me.id, name: me.name, me: true }];
    for (i in others) roster.push(others[i]);
    if (root.SZUI) {
      root.SZUI.setCursors(roster);
      root.SZUI.paintRoster(roster);
    }
    if (onRoster) onRoster(roster);
  }

  function putCell(x, y, kind, rot) {
    if (!api || !me.id || applying) return;
    var rec = { id: x + ',' + y, k: kind, r: rot & 3, by: me.id, t: now() };
    pendingPuts[rec.id] = rec;
    delete pendingDels[rec.id];
    db('cells').put(rec).catch(function () {});
  }

  function delCell(x, y) {
    if (!api || !me.id || applying) return;
    var id = x + ',' + y;
    pendingDels[id] = now();
    delete pendingPuts[id];
    db('cells').delete(id).catch(function () {});
  }

  function publishWorld(force) {
    if (!api || !me.id || !simHost || !game) return;
    var t = now();
    if (!force && t - lastWorld < 400) return;
    lastWorld = t;
    db('world').put({
      id: 'world',
      by: me.id,
      seed: game.seed,
      level: game.level,
      delivered: game.delivered,
      t: t
    }).catch(function () {});
  }

  function publishFlow(force) {
    if (!api || !me.id || !simHost || !game) return;
    var t = now();
    if (!force && t - lastFlow < FLOW_MS) return;
    lastFlow = t;
    db('flow').put({
      id: 'flow',
      items: game.exportItems(),
      t: t
    }).catch(function () {});
  }

  function publishCursor(hover, force) {
    if (!api || !me.id || !hover) return;
    var t = now();
    if (!force && t - lastCur < CUR_MS) return;
    lastCur = t;
    db('cursors').put({
      id: me.id, name: me.name,
      x: hover.x, y: hover.y, tool: game ? game.tool : '',
      t: t
    }).catch(function () {});
  }

  function tick(hover) {
    if (!api || !me.id) return;
    if (simHost) {
      if (game && game.dirty) {
        game.dirty = false;
        publishWorld(true);
      } else {
        publishWorld(false);
      }
      publishFlow(false);
    }
    publishCursor(hover, false);
  }

  function resetWorld() {
    var list, i, xy;
    if (game) {
      list = game.exportCells();
      game.reset();
      if (api && me.id) {
        for (i = 0; i < list.length; i++) {
          xy = String(list[i].id).split(',');
          delCell(+xy[0], +xy[1]);
        }
        publishWorld(true);
        publishFlow(true);
      }
    }
  }

  function countOthers() {
    var n = 0, k;
    for (k in others) n++;
    return n;
  }

  root.SZNet = {
    init: init,
    tick: tick,
    putCell: putCell,
    delCell: delCell,
    publishWorld: publishWorld,
    resetWorld: resetWorld,
    me: function () { return me; },
    owner: function () { return owner; },
    simHost: function () { return simHost; },
    live: function () { return !!api && !!me.id; },
    others: function () { return others; },
    onRoster: function (fn) { onRoster = fn; }
  };
})(window);
