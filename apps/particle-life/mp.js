/*
 * Share the jar — one mix, everyone stirs.
 *
 * Shared (round, seed, colors, count) so every device starts the same jar.
 * Each player publishes a poke on THEIR own row. Nobody writes anybody
 * else's row. The seed lives on those rows too: everyone adopts the seed
 * of the lowest-id player on the current round.
 *
 * Invite is OS chrome. This file never draws a share sheet.
 */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var PL = root.ParticleLife;

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
  var usedColors = 0;
  var usedCount = 0;
  var lastList = [];
  var seenAt = {};
  var pokeSeq = 0;
  var lastPoke = null;
  var applied = {};
  var lastPub = 0;

  var $ = function (id) { return document.getElementById(id); };
  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  function newSeed() { return (Math.random() * 0x100000000) >>> 0; }

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

  // Highest round anyone has published, then the lexicographically smallest
  // id on that round. Deterministic; never needs a shared row.
  function adopted(list) {
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.seed != null; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var a = cand[0];
    return {
      round: maxR,
      seed: a.seed,
      colors: a.colors || 4,
      count: a.count || 180,
      by: a.id
    };
  }

  function snapshot() {
    var row = {
      id: me.id,
      name: me.name,
      seed: mySeed,
      round: round,
      colors: PL.settings.numColors,
      count: PL.settings.atoms.count,
      pokeSeq: pokeSeq,
      at: now()
    };
    if (lastPoke) {
      row.px = lastPoke.x;
      row.py = lastPoke.y;
      row.ps = lastPoke.sign;
    }
    return row;
  }

  function publish() {
    if (!on || !room || !me.id) return;
    var t = now();
    if (t - lastPub < 80) return;
    lastPub = t;
    room.put(snapshot()).catch(function () {});
  }

  function applyWorld(ad) {
    usedSeed = ad.seed;
    usedRound = ad.round;
    usedColors = ad.colors;
    usedCount = ad.count;
    round = ad.round;
    if (ad.by !== me.id) mySeed = ad.seed;
    PL.settings.numColors = ad.colors;
    PL.settings.atoms.count = ad.count;
    PL.setSeed(ad.seed);
    var colors = $('colors');
    var count = $('count');
    if (colors) colors.value = String(ad.colors);
    if (count) {
      count.value = String(ad.count);
      $('countN').textContent = String(ad.count);
    }
    if (root.PLApp) root.PLApp.paintSeed();
    lastPub = 0;
    publish();
  }

  function applyPokes(players) {
    players.forEach(function (p) {
      if (!p.id || p.id === me.id) return;
      if (p.pokeSeq == null || p.px == null || p.py == null) return;
      var last = applied[p.id] || 0;
      if (p.pokeSeq <= last) return;
      applied[p.id] = p.pokeSeq;
      PL.poke(p.px * PL.WORLD_W, p.py * PL.WORLD_H, p.ps < 0 ? -1 : 1);
    });
  }

  function renderMp() {
    if (!on) return;
    var players = live(lastList);
    var status = $('friend-status');
    var scores = $('friend-scores');
    var html = '';
    players.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    players.forEach(function (p) {
      var mine = p.id === me.id;
      html += '<li class="' + (mine ? 'me' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Friend')) + '</span>' +
        '<span class="meta">' + (mine && lastPoke ? 'stirring' : (p.pokeSeq ? 'in the jar' : 'watching')) + '</span>' +
        '</li>';
    });
    if (scores) scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';

    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!status) return;
    if (!others.length) {
      status.textContent = 'Waiting for a friend… Invite sends the link. You can stir — they start from the same mix.';
    } else if (others.length === 1) {
      status.textContent = (others[0].name || 'Friend') + ' is in the jar. Tap to stir — they see it.';
    } else {
      status.textContent = others.length + ' friends in the jar. Tap to stir — everyone sees it.';
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (ad.seed !== usedSeed || ad.round !== usedRound || ad.colors !== usedColors || ad.count !== usedCount)) {
      applyWorld(ad);
    }
    applyPokes(live(lastList));
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
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      var s = $('friend-status');
      if (s) s.textContent = 'Share the jar needs a GifOS room.';
      return true;
    }
    if (on) return true;
    room = api.db('room');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      document.body.classList.add('friend');
      $('friend-bar').hidden = false;
      $('shareBtn').hidden = true;
      mySeed = PL.getSeed();
      if (!mySeed) mySeed = newSeed();
      round = 1;
      usedSeed = null;
      usedRound = 0;
      usedColors = 0;
      usedCount = 0;
      pokeSeq = 0;
      lastPoke = null;
      seenAt = {};
      applied = {};
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      } else {
        onRoom(lastList);
      }
      if (!usedSeed) applyWorld({
        seed: mySeed,
        round: round,
        colors: PL.settings.numColors,
        count: PL.settings.atoms.count,
        by: me.id
      });
      beat();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {});
    return true;
  }

  function leave() {
    on = false;
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('shareBtn').hidden = false;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
  }

  function onPoke(nx, ny, sign) {
    if (!on) return;
    pokeSeq += 1;
    lastPoke = { x: nx, y: ny, sign: sign < 0 ? -1 : 1 };
    publish();
  }

  function onNewMix() {
    if (!on) return false;
    mySeed = newSeed();
    round = (usedRound || round || 1) + 1;
    applyWorld({
      seed: mySeed,
      round: round,
      colors: PL.settings.numColors,
      count: PL.settings.atoms.count,
      by: me.id
    });
    return true;
  }

  function onRecipe(chg) {
    if (!on) return false;
    if (chg.colors) PL.settings.numColors = chg.colors;
    if (chg.count) PL.settings.atoms.count = chg.count;
    mySeed = PL.getSeed();
    round = (usedRound || round || 1) + 1;
    applyWorld({
      seed: mySeed,
      round: round,
      colors: PL.settings.numColors,
      count: PL.settings.atoms.count,
      by: me.id
    });
    return true;
  }

  function onReset() {
    if (!on) return false;
    // A reset is a new mix of the same seed — bump the round so everyone
    // re-pours the jar from the opening positions.
    round = (usedRound || round || 1) + 1;
    applyWorld({
      seed: mySeed || PL.getSeed(),
      round: round,
      colors: PL.settings.numColors,
      count: PL.settings.atoms.count,
      by: me.id
    });
    return true;
  }

  root.PLMp = {
    enter: enter,
    leave: leave,
    onPoke: onPoke,
    onNewMix: onNewMix,
    onRecipe: onRecipe,
    onReset: onReset,
    busy: function () { return on; }
  };

  $('shareBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });

  // A guest who arrived through Invite is already in a room — sit down.
  // The owner still presses Share the jar; gifos.db exists on a solo open too.
  if (root.gifos && root.gifos.info) {
    root.gifos.info().then(function (i) {
      if (!on && i && i.owner === false) enter();
    }).catch(function () {});
  }
})(window);
