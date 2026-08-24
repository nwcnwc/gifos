/*
 * Extra adventurers. Invite is OS chrome — this file never draws a share
 * button. Host simulates the dungeon; guests send input and paint the
 * snapshot. Each player writes ONLY their own row.
 */
(function (root) {
  'use strict';

  var api = root.gifos || null;
  var me = { id: 'local', name: 'You' };
  var owner = true;
  var others = {};
  var held = {};
  var lastPub = 0;
  var world = null;
  var STALE = 4000;
  var TYPES = ['WARRIOR', 'VALKYRIE', 'WIZARD', 'ELF'];

  function now() { return Date.now(); }
  function db(n) { return api && api.db ? api.db(n) : null; }
  function liveOthers() {
    var list = [], id, o;
    for (id in others) {
      o = others[id];
      if (o && (now() - o.seen) < STALE) list.push(o);
    }
    return list;
  }

  function typeOf(p) {
    return p && p.type && p.type.name ? p.type.name.toUpperCase() : null;
  }

  function taken() {
    var g = root.game, have = [], i, o, t;
    if (g && g.player) {
      t = typeOf(g.player);
      if (t) have.push(t);
    }
    if (g && g.party) {
      for (i = 0; i < g.party.length; i++) {
        t = typeOf(g.party[i]);
        if (t) have.push(t);
      }
    }
    var live = liveOthers();
    for (i = 0; i < live.length; i++) {
      o = live[i];
      if (o.type && have.indexOf(o.type) < 0) have.push(o.type);
    }
    return have;
  }

  function freeType() {
    var have = taken(), i;
    for (i = 0; i < TYPES.length; i++) {
      if (have.indexOf(TYPES[i]) < 0) return TYPES[i];
    }
    return null;
  }

  function ensureParty(g) {
    if (!g || !owner || !root.GauntletPlayer || !root.GAUNTLET_TYPES) return;
    g.party = g.party || [];
    var live = liveOthers(), i, o, p, t, found, slot;
    for (i = 0; i < live.length; i++) {
      o = live[i];
      if (!o.type || !root.GAUNTLET_TYPES[o.type]) continue;
      found = null;
      for (slot = 0; slot < g.party.length; slot++) {
        if (g.party[slot].netId === o.id) { found = g.party[slot]; break; }
      }
      if (!found) {
        p = new root.GauntletPlayer();
        p.netId = o.id;
        p.slot = g.party.length + 1;
        p.join(root.GAUNTLET_TYPES[o.type]);
        if (g.map) p.onStartLevel(g.map);
        g.party.push(p);
        found = p;
      }
      found.moveLeft(!!o.l);
      found.moveRight(!!o.r);
      found.moveUp(!!o.u);
      found.moveDown(!!o.d);
      found.fire(!!o.f);
      if (o.n) found.nuke();
    }
  }

  function snapEnt(e) {
    if (!e || !e.type || e.player) return null;
    return [e.x | 0, e.y | 0, e.type.sx | 0, e.type.sy | 0, e.frame | 0];
  }

  function publish(g) {
    if (!owner || !g || !g.map) return;
    var t = now();
    if (t - lastPub < 80) return;
    lastPub = t;
    ensureParty(g);
    var d = db('world');
    if (!d) return;
    var folks = g.allPlayers(), i, p, plist = [], ents = [], e;
    for (i = 0; i < folks.length; i++) {
      p = folks[i];
      plist.push({
        id: p.netId || me.id,
        t: typeOf(p),
        x: p.x | 0, y: p.y | 0, d: p.dir | 0,
        h: Math.round(p.health), s: p.score | 0,
        k: p.keys | 0, o: p.potions | 0,
        fr: p.frame | 0, dead: !!p.dead
      });
    }
    for (i = 0; i < g.map.entities.length; i++) {
      e = snapEnt(g.map.entities[i]);
      if (e) ents.push(e);
    }
    d.put({
      id: 'world', n: g.map.nlevel, p: plist, e: ents, seen: t
    }).catch(function () {});
  }

  function dummy(sx, sy, x, y, fr) {
    return {
      active: true,
      type: { sx: sx, sy: sy },
      x: x, y: y, frame: fr, dx: 0, dy: 0
    };
  }

  function applyWorld(g) {
    if (!g || !world || !g.map) return;
    if (typeof world.n === 'number' && g.map.nlevel !== world.n && g.load) {
      g.load(world.n);
      return;
    }
    var ents = [], i, e;
    if (world.e) {
      for (i = 0; i < world.e.length; i++) {
        e = world.e[i];
        ents.push(dummy(e[2], e[3], e[0], e[1], e[4]));
      }
    }
    g.map.entities = ents;
    if (world.p) {
      for (i = 0; i < world.p.length; i++) {
        e = world.p[i];
        if (e.id === me.id && g.player) {
          g.player.x = e.x; g.player.y = e.y; g.player.dir = e.d;
          g.player.health = e.h; g.player.score = e.s;
          g.player.keys = e.k; g.player.potions = e.o;
          g.player.frame = e.fr; g.player.dead = !!e.dead;
        }
      }
    }
    if (g.viewport && g.player) g.viewport.update(0, g.player, g.map, g.viewport);
  }

  function writeSelf() {
    var d = db('players');
    if (!d) return;
    var g = root.game;
    var rec = {
      id: me.id,
      name: me.name,
      type: g && g.player ? typeOf(g.player) : null,
      l: !!held.left, r: !!held.right, u: !!held.up, dwn: !!held.down,
      f: !!held.fire, n: !!held.potion,
      seen: now()
    };
    rec.d = rec.dwn;
    delete rec.dwn;
    d.put(rec).catch(function () {});
    held.potion = false;
  }

  function onPlayers(rows) {
    others = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || r.id === me.id) continue;
      r.seen = r.seen || now();
      others[r.id] = r;
    }
  }

  function onWorld(rows) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].id === 'world') world = rows[i];
    }
  }

  function refreshBoard(g) {
    if (!g || !g.scoreboard) return;
    var folks = g.allPlayers ? g.allPlayers() : [g.player];
    for (var i = 0; i < folks.length; i++) {
      if (folks[i] && folks[i] !== g.player) g.scoreboard.refreshPlayer(folks[i]);
    }
  }

  function init() {
    if (!api) return;
    Promise.all([
      api.me ? api.me() : Promise.resolve(me),
      api.info ? api.info() : Promise.resolve({ owner: true })
    ]).then(function (pair) {
      me = pair[0] || me;
      owner = !!(pair[1] && pair[1].owner);
      var pd = db('players'), wd = db('world');
      if (pd && pd.subscribe) pd.subscribe(onPlayers);
      if (wd && wd.subscribe) wd.subscribe(onWorld);
      setInterval(writeSelf, 100);
    }).catch(function () {});
  }

  root.GauntletNet = {
    init: init,
    publish: publish,
    applyWorld: applyWorld,
    refreshBoard: refreshBoard,
    guestWatching: function () {
      return !owner && !!world && !!(root.game && root.game.map);
    },
    noteInput: function (h) { held = h || held; },
    freeType: freeType
  };

  document.addEventListener('keydown', function (ev) {
    var c = ev.keyCode;
    if (c === 37) held.left = true;
    else if (c === 39) held.right = true;
    else if (c === 38) held.up = true;
    else if (c === 40) held.down = true;
    else if (c === 32) held.fire = true;
    else if (c === 13) held.potion = true;
  });
  document.addEventListener('keyup', function (ev) {
    var c = ev.keyCode;
    if (c === 37) held.left = false;
    else if (c === 39) held.right = false;
    else if (c === 38) held.up = false;
    else if (c === 40) held.down = false;
    else if (c === 32) held.fire = false;
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})(window);
