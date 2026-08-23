// Play a friend — a race on the same song, not a shared neck.
//
// Shared (round, song, string, bpm, mode, seed) so both people play the same
// chart. Each player publishes score + hits on THEIR row. Nobody writes
// anybody else's. Highest score when the song ends wins. Invite is OS chrome.
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 2000;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var round = 1;
  var used = null;
  var lastList = [];
  var seenAt = {};
  var roundOver = false;
  var declined = false;

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
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function adopted(list) {
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.round || 1) > maxR) maxR = p.round || 1; });
    var cand = players.filter(function (p) { return (p.round || 1) === maxR && p.songName; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var p = cand[0];
    return {
      round: maxR,
      songName: p.songName,
      stringId: p.stringId,
      bpm: p.bpm,
      mode: p.mode,
      seed: p.seed,
      by: p.id
    };
  }

  function chartOf(g) {
    return {
      songName: g.songName,
      stringId: g.stringId,
      bpm: g.bpm,
      mode: g.mode,
      seed: g.seed
    };
  }

  function sameChart(a, b) {
    return a && b && a.songName === b.songName && String(a.stringId) === String(b.stringId) &&
      +a.bpm === +b.bpm && a.mode === b.mode && +a.seed === +b.seed;
  }

  function snapshot() {
    var g = root.GB;
    var s = g ? g.snapshot() : {};
    s.id = me.id;
    s.name = me.name;
    s.round = round;
    s.at = now();
    return s;
  }

  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }

  function applyChart(ch, r, mine) {
    used = {
      round: r,
      songName: ch.songName,
      stringId: ch.stringId,
      bpm: ch.bpm,
      mode: ch.mode,
      seed: ch.seed,
      by: ch.by
    };
    round = r;
    roundOver = false;
    if (root.GB) {
      root.GB.start({
        songName: ch.songName,
        stringId: ch.stringId,
        bpm: ch.bpm,
        mode: ch.mode,
        seed: ch.seed,
        race: true,
        loop: false
      });
    }
    if (root.GBApp && root.GBApp.syncMenu) root.GBApp.syncMenu(ch);
    if (root.GBApp && root.GBApp.hideMenu) root.GBApp.hideMenu();
    if (root.GBApp && root.GBApp.setRace) root.GBApp.setRace(true);
    publish();
  }

  function verdict(players) {
    var finished = players.filter(function (p) { return p.done; });
    if (!finished.length) return null;
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!others.length) return null;
    var allDone = players.every(function (p) { return p.done; });
    if (!allDone && finished.length < 2) return null;
    var ranked = players.slice().sort(function (a, b) {
      return (b.score || 0) - (a.score || 0) || (a.at || 0) - (b.at || 0);
    });
    return { winner: ranked[0], allDone: allDone };
  }

  function render() {
    if (!on) return;
    var players = live(lastList);
    var v = verdict(players);
    var status = $('friend-status');
    var scores = $('friend-scores');
    var again = $('againBtn');
    var html = '';
    players.sort(function (a, b) {
      return (b.score || 0) - (a.score || 0);
    });
    players.forEach(function (p) {
      var mine = p.id === me.id;
      var tag = (p.score || 0) + ' · ' + (p.hits || 0) + ' hit' + ((p.hits || 0) === 1 ? '' : 's');
      if (p.died) tag += ' · out';
      else if (p.done) tag += ' · done';
      html += '<li class="' + (mine ? 'me' : '') + (v && v.winner && v.winner.id === p.id ? ' win' : '') + '">' +
        '<span class="name">' + (mine ? 'You' : esc(p.name || 'Player')) + '</span>' +
        '<span class="meta">' + tag + '</span></li>';
    });
    scores.innerHTML = html || '<li><span class="name">Just you so far</span></li>';

    var others = players.filter(function (p) { return p.id !== me.id; });
    if (v && v.allDone) {
      roundOver = true;
      var mineWin = v.winner.id === me.id;
      var who = mineWin ? 'You' : (v.winner.name || 'They');
      status.textContent = who + ' won with ' + (v.winner.score || 0) + '.';
      again.hidden = false;
    } else {
      roundOver = false;
      again.hidden = true;
      if (!others.length) {
        status.textContent = 'Waiting for a friend… press Invite (GifOS menu) to send the link. You can play in the meantime — they get the same song.';
      } else if (root.GB && root.GB.done) {
        status.textContent = 'You finished. Waiting for the others.';
      } else {
        status.textContent = others.length === 1
          ? ((others[0].name || 'Friend') + ' is on ' + (others[0].score || 0) + '.')
          : (others.length + ' playing. Highest score wins.');
      }
    }
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad && (!used || ad.round !== used.round || !sameChart(ad, used))) {
      applyChart(ad, ad.round, ad.by === me.id);
    }
    render();
  }

  function beat() {
    if (!on) return;
    publish();
    render();
  }

  function startRace() {
    on = true;
    document.body.classList.add('friend');
    $('friend-bar').hidden = false;
    $('friendBtn').hidden = true;
    roundOver = false;
    seenAt = {};
    var g = root.GB;
    var ch = (root.GBApp && root.GBApp.chart) ? root.GBApp.chart() : (g ? chartOf(g) : null);
    if (!ch) ch = { songName: 'Random notes', stringId: '1', bpm: 30, mode: 'survival', seed: 1 };
    if (!ch.seed) ch.seed = (Math.random() * 0x100000000) >>> 0;
    round = 1;
    used = null;
    applyChart(ch, round, true);
    beat();
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = setInterval(beat, HB_MS);
  }

  function enter() {
    api = root.gifos;
    if (!api || !api.db) {
      $('friend-bar').hidden = false;
      $('friend-status').textContent = 'Play a friend needs a GifOS room.';
      return;
    }
    room = room || api.db('players');
    var who = (me.id && me.id !== 'local')
      ? Promise.resolve(me)
      : (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' }));
    who.then(function (id) {
      if (id && id.id) { me.id = id.id; me.name = id.name || 'You'; }
      else if (!me.id) { me.id = 'local'; me.name = 'You'; }
      declined = false;
      watch();
      startRace();
    }).catch(function () {});
  }

  function watch() {
    api = root.gifos;
    if (!api || !api.db) return;
    room = room || api.db('players');
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || me.id || 'local';
      me.name = (id && id.name) || me.name || 'You';
      if (subscribed) return;
      subscribed = true;
      room.subscribe(function (list) {
        lastList = list || [];
        if (!on) {
          if (declined) return;
          var others = live(lastList).filter(function (p) { return p.id && p.id !== me.id; });
          if (others.length) startRace();
        } else {
          onRoom(lastList);
        }
      });
    }).catch(function () {});
  }

  function leave() {
    on = false;
    declined = true;
    roundOver = false;
    document.body.classList.remove('friend');
    $('friend-bar').hidden = true;
    $('friendBtn').hidden = false;
    $('againBtn').hidden = true;
    if (hbTimer) { clearInterval(hbTimer); hbTimer = 0; }
    if (room && me.id) room.delete(me.id).catch(function () {});
    if (root.GB) root.GB.stop();
    if (root.GBApp && root.GBApp.setRace) root.GBApp.setRace(false);
    if (root.GBApp && root.GBApp.showMenu) root.GBApp.showMenu();
  }

  function playAgain() {
    if (!on || !roundOver) return;
    var g = root.GB;
    var ch = g ? chartOf(g) : used;
    ch.seed = (Math.random() * 0x100000000) >>> 0;
    round = (used && used.round ? used.round : round) + 1;
    applyChart(ch, round, true);
  }

  function onPlayed() {
    if (!on) return;
    publish();
    render();
  }

  root.GBMp = {
    enter: enter,
    leave: leave,
    playAgain: playAgain,
    onPlayed: onPlayed,
    watch: watch,
    get on() { return on; }
  };

  $('friendBtn').addEventListener('click', function (e) { e.preventDefault(); enter(); });
  $('leaveBtn').addEventListener('click', function (e) { e.preventDefault(); leave(); });
  $('againBtn').addEventListener('click', function (e) { e.preventDefault(); playAgain(); });
})(window);
