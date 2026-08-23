/*
 * Tower Game — GifOS wrap.
 *
 * Upstream is a solo tap-to-stack game. Everything multiplayer is here: a
 * shared RNG seed so the crane's opening angles match, each player publishing
 * floors + score + hearts on their own row, and a tallest-wins race. Nobody
 * writes anybody else's row. Invite chrome is the OS's, not ours. Solo is
 * the original game.
 *
 * A subscriber re-downloads the whole collection on every change, so we
 * publish slowly (~4 Hz) with small numbers.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 4;
  var STALE_MS = 9000;
  var HB_MS = 2500;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var subscribed = false;
  var lastPublished = 0;
  var hbTimer = 0;
  var mySeed = 0;
  var usedSeed = null;
  var round = 1;
  var usedRound = 0;
  var lastList = [];
  var seenAt = {};
  var roundOver = false;
  var origRandom = Math.random;

  var $ = function (id) { return document.getElementById(id); };

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function newSeed() { return (Math.random() * 0x100000000) >>> 0 || 1; }

  function applyRng(seed) {
    if (!seed) { Math.random = origRandom; return; }
    var r = mulberry32(seed >>> 0);
    Math.random = function () { return r(); };
  }

  function now() { return Date.now(); }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.t;
      if (changed) seenAt[p.id] = { stamp: p.t, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  // Authority for (round, seed): the highest round anyone has published, then
  // the lexicographically smallest id on that round. Deterministic, and it
  // never needs a shared row — each player only ever puts their own id.
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

  function snap() {
    var g = root.Tower && root.Tower.game;
    var floors = g ? (g.getVariable('SUCCESS_COUNT') || 0) : 0;
    var score = g ? (g.getVariable('GAME_SCORE') || 0) : 0;
    var failed = g ? (g.getVariable('FAILED_COUNT') || 0) : 0;
    var playing = !!(g && g.getVariable('GAME_START_NOW'));
    return {
      id: me.id,
      name: me.name,
      seed: mySeed,
      round: round,
      floors: floors | 0,
      score: score | 0,
      failed: failed | 0,
      over: !playing && failed >= 3,
      t: now()
    };
  }

  function racing() {
    return live(lastList).length >= 2;
  }

  function publish(force) {
    if (!room || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    try { room.put(snap()).catch(function () {}); } catch (e) {}
  }

  function pickSeed() {
    var ad = adopted(lastList);
    // Never adopt an older round — Play again already incremented ours and
    // lastList still has the previous seed until we publish.
    if (ad && ad.round >= round) {
      mySeed = ad.seed >>> 0;
      round = ad.round;
      usedSeed = mySeed;
      usedRound = round;
      return mySeed;
    }
    if (!mySeed) mySeed = newSeed();
    usedSeed = mySeed;
    usedRound = round;
    return mySeed;
  }

  function verdict(players) {
    if (players.length < 2) return null;
    if (!players.every(function (p) { return p.over; })) return null;
    var ranked = players.slice().sort(function (a, b) {
      if ((b.floors || 0) !== (a.floors || 0)) return (b.floors || 0) - (a.floors || 0);
      return (b.score || 0) - (a.score || 0);
    });
    if (ranked[0].floors === ranked[1].floors && ranked[0].score === ranked[1].score) {
      return { kind: 'tie', a: ranked[0], b: ranked[1] };
    }
    return { kind: 'height', winner: ranked[0] };
  }

  function paintHud() {
    var bar = $('racebar');
    if (!bar) return;
    var players = live(lastList);
    if (players.length < 2) { bar.hidden = true; bar.textContent = ''; return; }
    bar.hidden = false;
    players.sort(function (a, b) {
      if ((b.floors || 0) !== (a.floors || 0)) return (b.floors || 0) - (a.floors || 0);
      return (b.score || 0) - (a.score || 0);
    });
    var bits = [];
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      var mine = p.id === me.id;
      var label = mine ? 'You' : (p.name || 'Player');
      var cls = 'who' + (p.over ? ' dead' : '') + (i === 0 ? ' lead' : '');
      bits.push('<span class="' + cls + '">' + esc(label) + ' ' + (p.floors | 0) + 'f' +
        (p.over ? ' out' : '') + '</span>');
    }
    var v = verdict(players);
    var line = bits.join(' · ');
    var meRow = players.filter(function (p) { return p.id === me.id; })[0];
    if (v) {
      roundOver = true;
      if (v.kind === 'tie') {
        line += '<span class="note">Tie at ' + (v.a.floors | 0) + ' floors.</span>';
      } else {
        var mineWin = v.winner.id === me.id;
        line += '<span class="note">' + (mineWin ? 'You win' : esc(v.winner.name || 'They') + ' wins') +
          ' — tallest tower</span>';
      }
    } else {
      roundOver = false;
      var others = players.filter(function (p) { return p.id !== me.id; });
      if (meRow && meRow.over) {
        line += '<span class="note">You’re out. Waiting to see who stacks higher.</span>';
      } else if (others.length && others[0].floors > ((meRow && meRow.floors) || 0)) {
        line += '<span class="note">they are ahead</span>';
      }
    }
    bar.innerHTML = line;

    var again = $('again');
    var tip = $('overTip');
    if (meRow && meRow.over && !v) {
      if (again) again.hidden = true;
      if (tip) tip.textContent = 'Waiting for the others…';
    } else if (v) {
      if (again) again.hidden = false;
      if (tip) tip.textContent = 'Play again — new round.';
    } else if (again) {
      again.hidden = false;
    }
  }

  function onRoom(list) {
    lastList = list || [];
    var ad = adopted(lastList);
    if (ad && (ad.seed !== usedSeed || ad.round !== usedRound)) {
      if (ad.by !== me.id) mySeed = ad.seed;
      usedSeed = ad.seed;
      usedRound = ad.round;
      round = ad.round;
    }
    paintHud();
  }

  function beat() {
    publish(true);
    paintHud();
  }

  function init() {
    api = root.gifos || null;
    if (!api || !api.db) return;
    try { room = api.db('room'); } catch (e) { return; }
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      if (!mySeed) mySeed = newSeed();
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      }
      publish(true);
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {
      me.id = 'local';
    });
  }

  root.TowerMp = {
    racing: racing,
    roundOver: function () { return roundOver; },
    onBegin: function () {
      var seed = pickSeed();
      applyRng(seed);
      publish(true);
    },
    onRetry: function () {
      if (racing() && roundOver) {
        mySeed = newSeed();
        round = (usedRound || round || 1) + 1;
        roundOver = false;
      }
      var seed = pickSeed();
      applyRng(seed);
      publish(true);
    },
    onOver: function () {
      publish(true);
      paintHud();
    },
    publish: publish,
    canRetry: function () {
      if (!racing()) return true;
      return roundOver || !snap().over;
    }
  };

  init();
})(window);
