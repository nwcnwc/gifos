/*
 * Shared pond. Each player writes only THEIR row in `players`.
 * Highest seq wins — whoever typed last, the frogs hop on both screens.
 * Presence frogs along the water are the "two frogs in the same pond".
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 1800;
  var TYPING_MS = 450;

  var api = null;
  var me = { id: null, name: 'Frog' };
  var owner = true;
  var others = {};
  var seq = 0;
  var lastAdopted = 0;
  var lastType = 0;
  var hbTimer = 0;
  var onMates = null;
  var lastList = [];
  var seenAt = {};
  var colors = ['green', 'yellow', 'red'];

  function now() { return Date.now(); }
  function db(n) { return api.db(n); }

  function tint(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return colors[h % colors.length];
  }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function snapshot() {
    var g = root.Froggy;
    var code = '';
    var el = document.getElementById('code');
    if (el) code = el.value;
    return {
      id: me.id,
      name: me.name,
      color: tint(me.id || 'x'),
      level: g ? g.level : 0,
      code: code,
      seq: seq,
      winning: !!(g && g.winning),
      at: now()
    };
  }

  function publish() {
    if (!api || !me.id) return;
    db('players').put(snapshot()).catch(function () {});
  }

  function bump(why) {
    seq += 1;
    if (why === 'type') lastType = now();
    publish();
  }

  function adopt(p) {
    var g = root.Froggy;
    if (!g) return;
    lastAdopted = p.seq | 0;
    if (p.winning) {
      if (!g.winning) g.win();
      return;
    }
    if ((p.level | 0) !== g.level || g.winning) {
      g.goLevel(p.level | 0, p.code || '');
    } else {
      g.setCode(p.code || '');
    }
  }

  function pickLeader(players) {
    var best = null;
    players.forEach(function (p) {
      if (!best || (p.seq | 0) > (best.seq | 0) ||
          ((p.seq | 0) === (best.seq | 0) && p.id < best.id)) {
        best = p;
      }
    });
    return best;
  }

  function ingest(list) {
    lastList = list || [];
    var players = live(lastList);
    others = {};
    players.forEach(function (p) {
      if (p.id === me.id) {
        if ((p.seq | 0) > seq) seq = p.seq | 0;
        return;
      }
      others[p.id] = p;
    });
    var leader = pickLeader(players);
    if (leader && leader.id !== me.id && (leader.seq | 0) > lastAdopted) {
      var typing = (now() - lastType) < TYPING_MS;
      if (!typing) adopt(leader);
    }
    paint();
  }

  function roster() {
    var players = live(lastList);
    var out = [];
    var seen = {};
    players.forEach(function (p) {
      if (seen[p.id]) return;
      seen[p.id] = 1;
      out.push({
        id: p.id,
        name: p.name || 'Frog',
        me: p.id === me.id,
        color: p.color || tint(p.id)
      });
    });
    if (me.id && !seen[me.id]) {
      out.unshift({ id: me.id, name: me.name, me: true, color: tint(me.id) });
    }
    return out;
  }

  function paint() {
    var list = roster();
    var mates = document.getElementById('mates');
    var pond = document.getElementById('pond-frogs');
    var roomy = list.length > 1;
    if (!mates || !pond) return;
    if (!roomy) {
      mates.hidden = true;
      pond.hidden = true;
      mates.innerHTML = '';
      pond.innerHTML = '';
      return;
    }
    mates.hidden = false;
    pond.hidden = false;
    mates.innerHTML = list.map(function (p) {
      return '<span class="mate' + (p.me ? ' me' : '') + '">' +
        '<span class="dot" style="background:' + frogHex(p.color) + '"></span>' +
        esc(p.name) + (p.me ? ' (you)' : '') +
        '</span>';
    }).join('');
    pond.innerHTML = list.map(function (p) {
      return '<div class="pond-frog">' +
        '<div class="sprite ' + p.color + '"></div>' +
        '<div class="who">' + esc(p.name) + (p.me ? ' (you)' : '') + '</div>' +
        '</div>';
    }).join('');
    if (onMates) onMates(list);
  }

  function frogHex(c) {
    return c === 'red' ? '#E45454' : c === 'yellow' ? '#F5D14A' : '#69DA6B';
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]);
    });
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
    var infoP = api.info
      ? api.info().then(function (i) { owner = !!(i && i.owner); return owner; })
          .catch(function () { owner = true; return true; })
      : Promise.resolve(true);
    return infoP.then(function () { return api.me(); }).then(function (id) {
      me.id = (id && id.id) ? id.id : 'local';
      me.name = (id && id.name) || 'Frog';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ owner: owner, others: roster().length - 1 });
        };
        setTimeout(done, 2200);
        db('players').subscribe(function (list) {
          ingest(list || []);
          done();
        });
        bump('join');
        hbTimer = setInterval(function () { publish(); }, HB_MS);
      });
    }).catch(function () {
      return { owner: true, others: 0 };
    });
  }

  root.Pond = {
    init: init,
    bump: bump,
    publish: publish,
    roster: roster,
    me: function () { return me; },
    owner: function () { return owner; },
    live: function () { return !!api && !!me.id; },
    count: function () { return roster().length; },
    onMates: function (fn) { onMates = fn; }
  };
})(window);
