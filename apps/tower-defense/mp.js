// Share the map: coop place towers.
//
// Each player writes placements on THEIR own row. The host (lowest present
// id) applies legal ones onto the map row. Nobody writes anybody else's row.
// Invite is OS chrome. This file never draws an Invite button.
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var PUB_MS = 120;
  var TYPES = { wall: 1, cannon: 1, LMG: 1, HMG: 1, laser_gun: 1 };

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var pubTimer = 0;
  var lastList = [];
  var seenAt = {};
  var myN = 0;
  var pending = [];
  var lastPacked = '';
  var lastMap = null;

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === 'map') return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      var rec = seenAt[p.id];
      if (t - rec.seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }
  function isHost(people) {
    people = people || live(lastList);
    if (!people.length) return true;
    var m = people[0].id;
    for (var i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return me.id === m;
  }
  function mapOf(list) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === 'map') return list[i];
    }
    return null;
  }
  function legalCell(mx, my) {
    return mx >= 0 && mx < 16 && my >= 0 && my < 16;
  }
  function legalType(t) { return !!TYPES[t]; }

  function game() { return root._TD && root._TD.game; }
  function mainMap() {
    var TD = game();
    return TD && TD.stage && TD.stage.map;
  }

  function packBuildings() {
    var map = mainMap();
    if (!map || !map.buildings) return [];
    var out = [];
    for (var i = 0; i < map.buildings.length; i++) {
      var b = map.buildings[i];
      if (!b || !b.is_valid || b.is_pre_building || !b.grid) continue;
      out.push({
        mx: b.grid.mx | 0,
        my: b.grid.my | 0,
        type: b.type,
        level: b.level | 0,
        owner: b.owner || ''
      });
    }
    return out;
  }
  function packStr(list) {
    return (list || []).map(function (b) {
      return [b.mx, b.my, b.type, b.level, b.owner].join(':');
    }).join('|');
  }

  function applyMap(list) {
    var map = mainMap();
    if (!map || !map.getGrid) return;
    var want = {};
    (list || []).forEach(function (b) {
      if (!b || !legalCell(b.mx, b.my) || !legalType(b.type)) return;
      want[b.mx + ',' + b.my] = b;
    });
    var keep = {};
    pending.forEach(function (s) {
      if (s.act === 'place') keep[s.mx + ',' + s.my] = 1;
      if (s.act === 'sell') keep[s.mx + ',' + s.my] = 2;
    });
    for (var i = 0; i < map.grids.length; i++) {
      var g = map.grids[i];
      var k = g.mx + ',' + g.my;
      var w = want[k];
      var flag = keep[k];
      if (flag === 2) {
        if (g.building && !g.building.is_pre_building) g.removeBuilding();
        continue;
      }
      if (!w) {
        if (flag === 1) continue;
        if (g.building && !g.building.is_pre_building) g.removeBuilding();
        continue;
      }
      if (!g.building) {
        g.addBuilding(w.type);
        if (g.building) {
          g.building.owner = w.owner || '';
          var lv = w.level | 0;
          while (g.building.level < lv) g.building.upgrade();
        }
      } else if (!g.building.is_pre_building) {
        if (g.building.type !== w.type) {
          g.removeBuilding();
          g.addBuilding(w.type);
        }
        if (g.building) {
          g.building.owner = w.owner || g.building.owner || '';
          while (g.building.level < (w.level | 0)) g.building.upgrade();
        }
      }
    }
    if (map.checkHasWeapon) map.checkHasWeapon();
  }

  function snapshot(extra) {
    var row = {
      id: me.id,
      name: me.name,
      n: myN,
      pending: pending.slice(),
      at: now()
    };
    if (extra) {
      if (extra.pending) row.pending = extra.pending;
      if (extra.wipe) row.wipe = extra.wipe;
    }
    return row;
  }
  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }
  function schedulePublish() {
    if (pubTimer) return;
    pubTimer = setTimeout(function () {
      pubTimer = 0;
      publish();
    }, PUB_MS);
  }
  function putMap(c) {
    lastMap = c;
    room.put(c).catch(function () {});
  }
  function freshMap(hostId) {
    return {
      id: 'map',
      host: hostId,
      buildings: packBuildings(),
      seq: 0,
      applied: {},
      wipeN: {},
      at: now()
    };
  }

  function placeOnHost(mx, my, type, owner) {
    var map = mainMap();
    if (!map || !map.getGrid) return false;
    if (!legalCell(mx, my) || !legalType(type)) return false;
    var g = map.getGrid(mx, my);
    if (!g || g.building) return false;
    if (g.checkBlock && g.checkBlock()) return false;
    g.addBuilding(type);
    if (g.building) g.building.owner = owner || '';
    return true;
  }
  function upgradeOnHost(mx, my) {
    var map = mainMap();
    if (!map || !map.getGrid) return false;
    var g = map.getGrid(mx, my);
    if (!g || !g.building || g.building.is_pre_building) return false;
    g.building.upgrade();
    return true;
  }
  function sellOnHost(mx, my) {
    var map = mainMap();
    if (!map || !map.getGrid) return false;
    var g = map.getGrid(mx, my);
    if (!g || !g.building || g.building.is_pre_building) return false;
    g.removeBuilding();
    return true;
  }

  function reconcile(C, people) {
    var c = {
      id: 'map',
      host: me.id,
      buildings: (C.buildings && C.buildings.slice) ? C.buildings.slice() : packBuildings(),
      seq: C.seq || 0,
      applied: C.applied ? Object.assign({}, C.applied) : {},
      wipeN: C.wipeN ? Object.assign({}, C.wipeN) : {},
      at: now()
    };
    var ch = c.host !== C.host;
    people.forEach(function (p) {
      var last = c.applied[p.id] || 0;
      var wipe = p.wipe || 0;
      if (wipe && wipe > (c.wipeN[p.id] || 0)) {
        var map = mainMap();
        if (map && map.grids) {
          for (var i = 0; i < map.grids.length; i++) {
            var g = map.grids[i];
            if (g.building && !g.building.is_pre_building) g.removeBuilding();
          }
          if (map.checkHasWeapon) map.checkHasWeapon();
        }
        c.wipeN[p.id] = wipe;
        c.seq = (c.seq || 0) + 1;
        ch = true;
        last = 0;
      }
      (p.pending || []).forEach(function (s) {
        if (!s || s.n <= last) return;
        // Host already applied their own clicks locally.
        if (p.id !== me.id) {
          if (s.act === 'place') placeOnHost(s.mx, s.my, s.type, p.id);
          else if (s.act === 'upgrade') upgradeOnHost(s.mx, s.my);
          else if (s.act === 'sell') sellOnHost(s.mx, s.my);
        }
        last = s.n;
        ch = true;
      });
      if (last !== (c.applied[p.id] || 0)) {
        c.applied[p.id] = last;
        c.seq = (c.seq || 0) + 1;
        ch = true;
      }
    });
    c.buildings = packBuildings();
    return ch ? c : null;
  }

  function dropSpent(city) {
    if (!city) return;
    var last = (city.applied && city.applied[me.id]) || 0;
    var wipeLast = (city.wipeN && city.wipeN[me.id]) || 0;
    var kept = pending.filter(function (s) { return s.n > last; });
    var dropped = kept.length !== pending.length || (wipeLast && wipeLast >= myN && pending.length);
    if (dropped) {
      pending = kept;
      schedulePublish();
    }
  }

  function enqueue(act, mx, my, type) {
    if (!on) return true;
    if (act === 'place' && (!legalCell(mx, my) || !legalType(type))) return false;
    myN += 1;
    var s = { n: myN, act: act, mx: mx, my: my };
    if (type) s.type = type;
    pending.push(s);
    if (pending.length > 80) pending = pending.slice(-40);
    schedulePublish();
    return true;
  }

  function render() {
    if (!on) return;
    var people = live(lastList);
    var status = $('friend-status');
    var roster = $('friend-roster');
    var html = '';
    people.sort(function (a, b) {
      var an = a.name || '', bn = b.name || '';
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    people.forEach(function (p) {
      var mine = p.id === me.id;
      var n = p.n || 0;
      html += '<li class="' + (mine ? 'me' : '') + '" data-id="' + esc(p.id) + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Player')) + '</span>' +
        '<span class="meta">' + n + ' moves</span></li>';
    });
    roster.innerHTML = html || '<li>Just you so far</li>';
    var others = people.filter(function (p) { return p.id !== me.id; });
    if (!others.length) {
      status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can place towers in the meantime.';
    } else {
      status.textContent = 'One map. Everyone places towers. ' + others.length + ' with you.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var people = live(lastList);
    var city = mapOf(lastList);
    if (!city) {
      if (isHost(people)) putMap(freshMap(me.id));
      render();
      return;
    }
    lastMap = city;
    if (isHost(people)) {
      var next = reconcile(city, people);
      if (next) {
        putMap(next);
        city = next;
      }
    }
    dropSpent(city);
    if (city.buildings) {
      var s = packStr(city.buildings);
      if (s !== lastPacked) {
        lastPacked = s;
        applyMap(city.buildings);
      }
    }
    render();
  }

  function beat() {
    if (!on) return;
    publish();
    render();
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      $('friend-status').textContent = 'Sharing needs a GifOS room.';
      return;
    }
    room = api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      pending = [];
      myN = 0;
      seenAt = {};
      lastPacked = '';
      lastMap = null;
      document.body.classList.add('together');
      $('friend-bar').hidden = false;
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      publish();
      beat();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {});
  }

  function leave() {
    on = false;
    pending = [];
    document.body.classList.remove('together');
    $('friend-bar').hidden = true;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (pubTimer) { clearTimeout(pubTimer); pubTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
  }

  function wipe() {
    if (!on) return;
    myN += 1;
    pending = [];
    room.put(snapshot({ wipe: myN, pending: [] })).catch(function () {});
    lastPacked = '';
  }

  root.TDHooks = {
    meId: function () { return me.id; },
    onPlace: function (mx, my, type) { return enqueue('place', mx, my, type); },
    onUpgrade: function (mx, my) {
      var map = mainMap();
      var g = map && map.getGrid && map.getGrid(mx, my);
      if (g && g.building && g.building.owner && g.building.owner !== me.id) return false;
      return enqueue('upgrade', mx, my);
    },
    onSell: function (mx, my) {
      var map = mainMap();
      var g = map && map.getGrid && map.getGrid(mx, my);
      if (g && g.building && g.building.owner && g.building.owner !== me.id) return false;
      return enqueue('sell', mx, my);
    },
    onRestart: function () { wipe(); }
  };

  root.TDMp = {
    enter: enter,
    leave: leave,
    wipe: wipe,
    isOn: function () { return on; }
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
})(window);
