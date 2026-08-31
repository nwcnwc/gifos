/*
 * Hextris — a race, not a shared hex.
 *
 * Shared seed so both players get the same sequence of falling blocks.
 * Each then plays THEIR hex and publishes score + stacks on THEIR row.
 * Nobody writes anybody else's row. Last one still stacking wins; if
 * both hexes fill, highest score among the stuck boards takes it.
 *
 * Invite is OS chrome. This file only tells the player to press Invite.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var mySeed = 0;
  var round = 1;
  var usedSeed = null;
  var usedRound = 0;
  var lastList = [];
  var seenAt = {};
  var roundOver = false;
  var lastPub = 0;

  var $id = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s || '').replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function newSeed() { return (Math.random() * 0x100000000) >>> 0; }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      var rec = seenAt[p.id];
      if (t - rec.seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function adopted(list) {
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.seed != null; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return { round: maxR, seed: cand[0].seed, by: cand[0].id };
  }

  function snapshot() {
    return {
      id: me.id,
      name: me.name,
      seed: mySeed,
      round: round,
      score: root.score | 0,
      over: !!(root.HT && HT.over && HT.over()),
      stacks: (root.HT && HT.packStacks) ? HT.packStacks() : '',
      at: now()
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    var t = now();
    if (t - lastPub < 80) return;
    lastPub = t;
    room.put(snapshot()).catch(function () {});
  }

  function applySeed(seed, r) {
    usedSeed = seed;
    usedRound = r;
    round = r;
    roundOver = false;
    root.HT.rng = mulberry32(seed >>> 0);
    var go = $id('gameoverscreen');
    if (go) go.style.display = 'none';
    if (typeof init === 'function') init(1);
    lastPub = 0;
    publish();
    paintThem(null);
  }

  function verdict(players) {
    if (players.length < 2) return null;
    var alive = players.filter(function (p) { return !p.over; });
    if (alive.length === 1) return { kind: 'last', winner: alive[0] };
    if (alive.length > 1) return null;
    var ranked = players.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    if ((ranked[0].score || 0) === (ranked[1].score || 0)) return { kind: 'tie', a: ranked[0], b: ranked[1] };
    return { kind: 'score', winner: ranked[0] };
  }

  function pickOther(players) {
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!others.length) return null;
    others.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    return others[0];
  }

  function paintThem(p) {
    var wrap = $id('them-wrap');
    if (!wrap) return;
    if (!p) { wrap.hidden = true; return; }
    wrap.hidden = false;
    var nm = $id('them-name');
    if (nm) nm.textContent = (p.name || 'Friend') + ' · ' + (p.score || 0) + (p.over ? ' · out' : '');
    var c = $id('them');
    if (!c || !c.getContext) return;
    var ctx = c.getContext('2d');
    var W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2 + 4;
    var side = 18;
    var colors = root.colors || ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71'];
    function hex(x, y, r, fill) {
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = (Math.PI / 180) * (30 + i * 60);
        var px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    }
    hex(cx, cy, 46, '#bdc3c7');
    hex(cx, cy, side, '#2c3e50');
    var lanes = String(p.stacks || '').split(',');
    var bh = 7;
    for (var lane = 0; lane < 6; lane++) {
      var stack = lanes[lane] || '';
      var ang = (Math.PI / 180) * (30 + lane * 60);
      for (var k = 0; k < stack.length; k++) {
        var idx = stack.charCodeAt(k) - 48;
        if (idx < 0 || idx > 3) idx = 0;
        var dist = side * Math.sqrt(3) / 2 + 4 + k * bh;
        var bx = cx + Math.cos(ang) * dist;
        var by = cy + Math.sin(ang) * dist;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ang + Math.PI / 2);
        ctx.fillStyle = colors[idx];
        ctx.beginPath();
        ctx.moveTo(-6, -bh / 2);
        ctx.lineTo(6, -bh / 2);
        ctx.lineTo(8, bh / 2);
        ctx.lineTo(-8, bh / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function renderMp() {
    if (!on) return;
    var players = live(lastList);
    var v = verdict(players);
    var status = $id('friend-status');
    var scores = $id('friend-scores');
    var again = $id('againBtn');
    var html = '';
    players.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    players.forEach(function (p) {
      var mine = p.id === me.id;
      html += '<li class="' + (mine ? 'me' : '') + (p.over ? ' out' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Player')) + '</span>' +
        '<span class="meta">' + (p.score || 0) + (p.over ? ' · out' : '') + '</span>' +
        '</li>';
    });
    if (scores) scores.innerHTML = html;

    var other = pickOther(players);
    paintThem(other);

    var others = players.filter(function (p) { return p.id !== me.id; });
    if (v) {
      roundOver = true;
      if (v.kind === 'tie') {
        if (status) status.textContent = 'Tie at ' + (v.a.score || 0) + '.';
      } else {
        var mineWin = v.winner.id === me.id;
        var who = mineWin ? 'You' : (v.winner.name || 'They');
        var why = v.kind === 'last' ? ' still stacking' : ' wins on score';
        if (status) status.textContent = who + why + ' (' + (v.winner.score || 0) + ').';
      }
      if (again) again.hidden = false;
    } else {
      roundOver = false;
      if (again) again.hidden = true;
      if (!others.length) {
        if (status) status.innerHTML = 'Press <b>Invite</b> in the bar above, then send the link. You can play now — same blocks when they join.';
      } else if (root.HT && HT.over && HT.over()) {
        if (status) status.textContent = 'You’re out. Waiting on the rest.';
      } else {
        if (status) status.textContent = others.length === 1
          ? (others[0].name || 'Friend') + ' · ' + (others[0].score || 0)
          : others.length + ' playing · last one stacking wins';
      }
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.seed !== usedSeed || ad.round !== usedRound)) {
      if (ad.by !== me.id) mySeed = ad.seed;
      applySeed(ad.seed, ad.round);
    }
    renderMp();
  }

  function beat() {
    if (!on) return;
    lastPub = 0;
    publish();
    renderMp();
  }

  function enter() {
    api = root.gifos;
    var bar = $id('friend-bar');
    if (bar) bar.hidden = false;
    if (!api || !api.db) {
      var s = $id('friend-status');
      if (s) s.textContent = 'Play a friend needs a GifOS room.';
      return;
    }
    room = api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      document.body.classList.add('friend');
      $id('friendBtn').hidden = true;
      mySeed = newSeed();
      round = 1;
      usedSeed = null;
      usedRound = 0;
      roundOver = false;
      seenAt = {};
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      if (!usedSeed) applySeed(mySeed, round);
      beat();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {});
  }

  function leave() {
    on = false;
    roundOver = false;
    root.HT.rng = null;
    document.body.classList.remove('friend');
    var bar = $id('friend-bar');
    if (bar) bar.hidden = true;
    $id('friendBtn').hidden = false;
    var again = $id('againBtn');
    if (again) again.hidden = true;
    paintThem(null);
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
    if (typeof init === 'function') init(1);
  }

  function playAgain() {
    if (!on || !roundOver) return;
    mySeed = newSeed();
    round = (usedRound || round || 1) + 1;
    applySeed(mySeed, round);
  }

  function onActuate() {
    if (!on) return;
    publish();
    renderMp();
  }

  function onRestart() {
    if (!on) return false;
    if (roundOver) playAgain();
    return true;
  }

  root.HT = root.HT || {};
  root.HT.Mp = {
    enter: enter,
    leave: leave,
    playAgain: playAgain,
    onActuate: onActuate,
    onRestart: onRestart,
    mulberry32: mulberry32,
    live: function () { return on; }
  };
})(window);
