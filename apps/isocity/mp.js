// Share the map, or compare cities.
//
// Share: each player writes tile strokes on THEIR own row. The host (lowest
// present id) applies legal placements onto the city row. Nobody writes
// anybody else's row.
// Compare: each player publishes THEIR city on their own row. Tap a name to
// peek; you only ever edit yours.
//
// Invite is OS chrome. This file never draws an Invite button.
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var PUB_MS = 120;
  var NTILES = 16;
  var TEX_W = 12;
  var TEX_H = 6;
  function ntiles() {
    return (root.IsoCity && typeof root.IsoCity.ntiles === 'function' && root.IsoCity.ntiles()) || NTILES;
  }
  function CELLS() { return ntiles() * ntiles(); }

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var mode = null; // 'share' | 'compare'
  var subscribed = false;
  var hbTimer = 0;
  var pubTimer = 0;
  var lastList = [];
  var seenAt = {};
  var myN = 0;
  var pending = [];
  var viewing = null;
  var lastCity = null;
  var lastPacked = '';
  var myCells = null;

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  function zeros() {
    var a = [], n = CELLS();
    for (var i = 0; i < n; i++) a.push(0);
    return a;
  }
  function legalCell(x, y, a, b) {
    var n = ntiles();
    return x >= 0 && x < n && y >= 0 && y < n &&
      a >= 0 && a < TEX_H && b >= 0 && b < TEX_W;
  }
  function packStr(cells) { return (cells || []).join(','); }
  function countFilled(cells) {
    var n = 0;
    for (var i = 0; i < (cells || []).length; i++) if (cells[i]) n++;
    return n;
  }
  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === 'city') return;
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
  function cityOf(list) {
    for (var i = 0; i < (list || []).length; i++) {
      if (list[i] && list[i].id === 'city') return list[i];
    }
    return null;
  }

  function snapshot(extra) {
    var row = {
      id: me.id,
      name: me.name,
      mode: mode,
      n: myN,
      pending: pending.slice(),
      at: now()
    };
    if (mode === 'compare') {
      row.cells = ownCells();
    }
    if (extra) {
      if (extra.pending) row.pending = extra.pending;
      if (extra.cells) row.cells = extra.cells;
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

  function putCity(c) {
    lastCity = c;
    room.put(c).catch(function () {});
  }

  function currentCells() {
    if (root.IsoCity && root.IsoCity.pack) {
      var p = root.IsoCity.pack();
      if (p && p.length === CELLS()) return p.slice();
    }
    return zeros();
  }

  function freshCity(hostId, m) {
    return {
      id: 'city',
      host: hostId,
      mode: m,
      cells: m === 'share' ? currentCells() : zeros(),
      seq: 0,
      applied: {},
      wipeN: {},
      at: now()
    };
  }

  function ownCells() {
    if (viewing && viewing !== me.id) return myCells;
    if (root.IsoCity && root.IsoCity.pack) {
      myCells = root.IsoCity.pack();
      return myCells;
    }
    return myCells;
  }

  function applyCity(cells) {
    if (!root.IsoCity || !root.IsoCity.replaceMap) return;
    var flat = (root.IsoCity.nestTo) ? root.IsoCity.nestTo(cells, ntiles()) : cells;
    var s = packStr(flat);
    if (s === lastPacked) return;
    lastPacked = s;
    root.IsoCity.replaceMap(flat);
  }

  function reconcile(C, people) {
    var c = {
      id: 'city',
      host: me.id,
      mode: C.mode || mode || 'share',
      cells: (C.cells && C.cells.length)
        ? ((root.IsoCity && root.IsoCity.nestTo) ? root.IsoCity.nestTo(C.cells, ntiles()) : C.cells.slice())
        : zeros(),
      seq: C.seq || 0,
      applied: C.applied ? Object.assign({}, C.applied) : {},
      wipeN: C.wipeN ? Object.assign({}, C.wipeN) : {},
      at: now()
    };
    var ch = c.host !== C.host;
    if (c.mode === 'share') {
      people.forEach(function (p) {
        var last = c.applied[p.id] || 0;
        var wipe = p.wipe || 0;
        if (wipe && wipe > (c.wipeN[p.id] || 0)) {
          c.cells = zeros();
          c.wipeN[p.id] = wipe;
          c.seq = (c.seq || 0) + 1;
          ch = true;
        }
        (p.pending || []).forEach(function (s) {
          if (!s || s.n <= last) return;
          if (!legalCell(s.x, s.y, s.a, s.b)) return;
          c.cells[s.x * ntiles() + s.y] = s.a * TEX_W + s.b;
          last = s.n;
          ch = true;
        });
        if (last !== (c.applied[p.id] || 0)) {
          c.applied[p.id] = last;
          c.seq = (c.seq || 0) + 1;
          ch = true;
        }
      });
    }
    return ch ? c : null;
  }

  function dropSpent(city) {
    if (!city || mode !== 'share') return;
    var last = (city.applied && city.applied[me.id]) || 0;
    var wipeLast = (city.wipeN && city.wipeN[me.id]) || 0;
    var kept = pending.filter(function (s) { return s.n > last; });
    var dropped = kept.length !== pending.length || (wipeLast && wipeLast >= myN && pending.length);
    if (dropped) {
      pending = kept;
      schedulePublish();
    }
  }

  function onPlace(x, y, a, b) {
    if (!on) return true;
    if (!legalCell(x, y, a, b)) return false;
    if (mode === 'compare' && viewing && viewing !== me.id) return false;
    if (mode === 'share') {
      myN += 1;
      pending.push({ n: myN, x: x, y: y, a: a, b: b });
      if (pending.length > 80) pending = pending.slice(-40);
      schedulePublish();
      return true;
    }
    if (mode === 'compare') {
      schedulePublish();
      return true;
    }
    return true;
  }

  function render() {
    if (!on) return;
    var people = live(lastList);
    var city = cityOf(lastList) || lastCity;
    var status = $('friend-status');
    var roster = $('friend-roster');
    var html = '';
    people.sort(function (a, b) {
      var an = a.name || '', bn = b.name || '';
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    people.forEach(function (p) {
      var mine = p.id === me.id;
      var tiles = mode === 'compare' ? countFilled(p.cells) : (p.n || 0);
      var view = viewing === p.id;
      html += '<li class="' + (mine ? 'me' : '') + (view ? ' viewing' : '') + '" data-id="' + esc(p.id) + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Player')) + '</span>' +
        '<span class="meta">' + tiles + ' tiles</span></li>';
    });
    roster.innerHTML = html || '<li>Just you so far</li>';
    var others = people.filter(function (p) { return p.id !== me.id; });
    if (mode === 'share') {
      if (!others.length) {
        status.textContent = 'This city is the map. Press Invite in the bar above the app — a friend paints here too.';
      } else {
        status.textContent = 'One city. Everyone places tiles. ' + others.length + ' with you.';
      }
      $('mineBtn').hidden = true;
    } else {
      if (viewing && viewing !== me.id) {
        var who = people.filter(function (p) { return p.id === viewing; })[0];
        status.textContent = 'Looking at ' + ((who && who.name) || 'their') + ' city. Yours is still yours.';
        $('mineBtn').hidden = false;
      } else if (!others.length) {
        status.textContent = 'Waiting for a friend — press Invite in the bar above the app. Each of you builds a city; tap a name to peek.';
        $('mineBtn').hidden = true;
      } else {
        status.textContent = 'Each of you has a city. Tap a name to look.';
        $('mineBtn').hidden = true;
      }
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var people = live(lastList);
    var city = cityOf(lastList);
    if (!city) {
      if (isHost(people)) putCity(freshCity(me.id, mode));
      render();
      return;
    }
    lastCity = city;
    if (city.mode && city.mode !== mode) {
      mode = city.mode;
    }
    if (isHost(people) && mode === 'share') {
      var next = reconcile(city, people);
      if (next) {
        putCity(next);
        city = next;
      }
    }
    if (mode === 'share') {
      dropSpent(city);
      if (city.cells) applyCity(city.cells);
    } else if (mode === 'compare') {
      if (viewing && viewing !== me.id) {
        var them = people.filter(function (p) { return p.id === viewing; })[0];
        if (them && them.cells) applyCity(them.cells);
        else {
          viewing = me.id;
          if (root.IsoCity && root.IsoCity.pack) applyCity(root.IsoCity.pack());
        }
      }
    }
    render();
  }

  function beat() {
    if (!on) return;
    publish();
    render();
  }

  function enter(which) {
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
      mode = which;
      viewing = which === 'compare' ? me.id : null;
      pending = [];
      myN = 0;
      seenAt = {};
      lastPacked = '';
      lastCity = null;
      if (root.IsoCity.flushSave) root.IsoCity.flushSave();
      myCells = root.IsoCity.pack ? root.IsoCity.pack() : null;
      root.IsoCity.mp = true;
      root.IsoCity.mode = mode;
      document.body.classList.add('together');
      $('friend-bar').hidden = false;
      if (root.IsoCity.centerMap) setTimeout(root.IsoCity.centerMap, 40);
      $('friend-hint').textContent = which === 'share'
        ? 'Press Invite in the bar above the app to send the link. Everyone paints on the same city.'
        : 'Press Invite in the bar above the app to send the link. Each of you builds a city; tap a name to peek.';
      if ($('hint')) $('hint').hidden = true;
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
    mode = null;
    viewing = null;
    pending = [];
    root.IsoCity.mp = false;
    root.IsoCity.mode = null;
    document.body.classList.remove('together');
    $('friend-bar').hidden = true;
    $('mineBtn').hidden = true;
    if (root.IsoCity.centerMap) setTimeout(root.IsoCity.centerMap, 40);
    if ($('hint') && root.IsoCity && root.IsoCity.pack) {
      var cells = root.IsoCity.pack();
      var n = 0;
      for (var i = 0; i < (cells || []).length; i++) if (cells[i]) n++;
      $('hint').hidden = n > 0;
    }
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (pubTimer) { clearTimeout(pubTimer); pubTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
    if (root.IsoCity.restoreSave) root.IsoCity.restoreSave();
  }

  function wipe() {
    if (!on) return;
    if (mode === 'share') {
      myN += 1;
      pending = [];
      room.put(snapshot({ wipe: myN, pending: [] })).catch(function () {});
      if (root.IsoCity && root.IsoCity.emptyMap) root.IsoCity.emptyMap();
      lastPacked = packStr(zeros());
    } else if (mode === 'compare') {
      if (viewing && viewing !== me.id) return;
      if (root.IsoCity && root.IsoCity.emptyMap) root.IsoCity.emptyMap();
      myCells = zeros();
      lastPacked = packStr(zeros());
      publish();
    }
  }

  function view(id) {
    if (!on || mode !== 'compare') return;
    viewing = id;
    var people = live(lastList);
    if (id === me.id) {
      if (myCells) applyCity(myCells);
    } else {
      var them = people.filter(function (p) { return p.id === id; })[0];
      if (them && them.cells) applyCity(them.cells);
    }
    render();
  }

  root.IsoCity = root.IsoCity || {};
  root.IsoCity.Mp = {
    enter: enter,
    leave: leave,
    wipe: wipe,
    onPlace: onPlace,
    view: view,
    isOn: function () { return on; },
    mode: function () { return mode; },
    viewing: function () { return viewing; }
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter('share'); });
  $('compareBtn').addEventListener('click', function (e) { e.preventDefault(); enter('compare'); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
  $('mineBtn').addEventListener('click', function (e) { e.preventDefault(); view(me.id); });
  $('friend-roster').addEventListener('click', function (e) {
    var li = e.target.closest ? e.target.closest('li') : e.target;
    while (li && li.tagName !== 'LI') li = li.parentNode;
    if (!li || !li.getAttribute) return;
    var id = li.getAttribute('data-id');
    if (id && mode === 'compare') view(id);
  });
})(window);
