/*
 * Catch the Cat — netplay.
 *
 * The room comes from the OS Invite button; this app never draws one. Each
 * player owns exactly one row in gifos.db('players') and only ever writes that
 * row: their taps, how this round ended, and their running series tally. The
 * shared starting board is a seed carried on those rows, so a subscriber
 * rebuilds the same walls locally.
 *
 * The series is SELF-SCORED, and that works because every client scores the
 * same round from the same rows. When every live player on the current round
 * has finished, the fewest taps among those who penned the cat takes it, ties
 * share it, and each client increments only its OWN wins. Two clients cannot
 * disagree unless they saw different rows, and a guest who lied about their
 * row would only be cheating themselves.
 *
 * The collection is the host's stored state, not a presence list: a player who
 * closes the app leaves their row behind forever. So rows carry a heartbeat,
 * and a player who has gone quiet for STALE_MS drops out of the roster and
 * stops holding up the round. Staleness is measured on the LOCAL clock (when
 * we last saw the stamp change), never by comparing their clock to ours.
 */
(function (root) {
  'use strict';

  var STALE_MS = 12000;
  var HB_MS = 4000;

  var api = null;
  var me = { id: null, name: 'Player' };
  var round = { id: 0, n: 0, seed: 0, by: null };
  var my = { clicks: 0, status: 'playing', wins: 0, played: 0, best: 0, streak: 0 };
  var others = {};
  var seenAt = {};
  var lastRows = [];
  var scored = 0;          // the round id already folded into the tally
  var fieldSeen = 0;       // most players ever seen on the current round
  var adopted = false;     // our own row has been read back once (a rejoin)
  var onRound = null;
  var onRoster = null;
  var onResult = null;
  var started = false;
  var beatTimer = 0;

  function db() { return api.db('players'); }

  function entry(p, mine) {
    return {
      id: p.id, name: p.name || 'Player', mine: !!mine,
      clicks: p.clicks || 0, status: p.status || 'playing',
      round: p.round || 0,
      wins: p.wins || 0, played: p.played || 0,
      best: p.best || 0, streak: p.streak || 0
    };
  }

  function mineRow() {
    return {
      id: me.id, name: me.name, round: round.id, rn: round.n, seed: round.seed,
      clicks: my.clicks, status: my.status,
      wins: my.wins, played: my.played, best: my.best, streak: my.streak
    };
  }

  // Everyone whose heartbeat is still moving. A row that stopped changing is a
  // player who walked away — they keep their place in the host's collection,
  // but not in the race.
  function liveOthers() {
    var t = Date.now();
    var out = [];
    Object.keys(others).forEach(function (id) {
      var seen = seenAt[id];
      if (seen && t - seen.at > STALE_MS) return;
      out.push(others[id]);
    });
    return out;
  }

  function standing(p) { return p.status === 'win' ? 0 : p.status === 'playing' ? 1 : 2; }

  // The leaderboard is the SERIES, not this board: wins first, then the best
  // board anyone has turned in, and only then how the round in front of them
  // is going.
  function rank(a, b) {
    if (b.wins !== a.wins) return b.wins - a.wins;
    var ab = a.best || Infinity, bb = b.best || Infinity;
    if (ab !== bb) return ab - bb;
    var as = standing(a), bs = standing(b);
    if (as !== bs) return as - bs;
    if (a.status === b.status && a.clicks !== b.clicks) return a.clicks - b.clicks;
    return (a.name || '').localeCompare(b.name || '');
  }

  function roster() {
    var list = [];
    if (me.id) list.push(entry(mineRow(), true));
    liveOthers().forEach(function (p) { list.push(entry(p, false)); });
    list.sort(rank);
    return list;
  }

  // A rejoin: our own row is still in the collection with the tally we left on
  // it. Take it back rather than starting the series over at zero.
  function adopt(row) {
    if (adopted) return;
    adopted = true;
    my.wins = Math.max(my.wins, row.wins || 0);
    my.played = Math.max(my.played, row.played || 0);
    my.streak = Math.max(my.streak, row.streak || 0);
    if (row.best) my.best = my.best ? Math.min(my.best, row.best) : row.best;
  }

  function ingest(list) {
    lastRows = list || [];
    var t = Date.now();
    var newest = round;
    var seen = {};
    lastRows.forEach(function (p) {
      if (!p || !p.id) return;
      if (p.round && p.seed && p.round > newest.id) {
        newest = { id: p.round, n: p.rn || 0, seed: p.seed, by: p.id };
      }
      if (p.id === me.id) { adopt(p); return; }
      seen[p.id] = 1;
      var was = seenAt[p.id];
      if (!was || was.stamp !== p.t) seenAt[p.id] = { stamp: p.t, at: t };
      others[p.id] = entry(p, false);
      others[p.id].t = p.t;
    });
    for (var id in others) if (!seen[id]) { delete others[id]; delete seenAt[id]; }
    if (newest.id && newest.id !== round.id) {
      round = newest;
      fieldSeen = 0;
      my.clicks = 0; my.status = 'playing';
      if (onRound) onRound(round);
    }
    settle();
    if (onRoster) onRoster(roster());
  }

  // Score the round the moment nobody live is still chasing. Fires once per
  // round id, on every client, off the same rows — so the tallies agree.
  function settle() {
    if (!round.id || scored === round.id) return;
    var field = [entry(mineRow(), true)];
    liveOthers().forEach(function (p) { if (p.round === round.id) field.push(p); });
    if (field.length > fieldSeen) fieldSeen = field.length;
    if (field.length < 2) {
      // Alone with the cat is practice, not a race. If the room HAD a field and
      // they all walked away, say so rather than leaving the round hanging —
      // but score nothing: a win by attrition is not a win.
      if (fieldSeen > 1 && my.status !== 'playing') {
        scored = round.id;
        if (onResult) onResult({ round: round.id, n: round.n, players: 1,
          abandoned: true, escaped: false, mine: false, shared: false,
          clicks: 0, winners: [] });
      }
      return;
    }
    for (var i = 0; i < field.length; i++) if (field[i].status === 'playing') return;
    scored = round.id;

    var best = Infinity;
    field.forEach(function (p) { if (p.status === 'win' && p.clicks < best) best = p.clicks; });
    var winners = field.filter(function (p) { return p.status === 'win' && p.clicks === best; });
    var won = winners.some(function (p) { return p.id === me.id; });

    my.played += 1;
    if (won) { my.wins += 1; my.streak += 1; } else { my.streak = 0; }
    publish();

    if (onResult) {
      onResult({
        round: round.id, n: round.n, players: field.length,
        escaped: winners.length === 0, mine: won, shared: winners.length > 1,
        clicks: winners.length ? best : 0,
        winners: winners.map(function (p) {
          return { id: p.id, name: p.name, mine: p.id === me.id, clicks: p.clicks };
        })
      });
    }
  }

  function publish() {
    if (!started || !api || !me.id || me.id === 'local') return;
    var row = mineRow();
    row.t = Date.now();
    db().put(row).catch(function () {});
  }

  // Republish on a timer so the others can tell we are still here, and re-read
  // the rows we already have so a player who went quiet ages out even when no
  // fresh snapshot arrives to notice it.
  function beat() {
    publish();
    ingest(lastRows);
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ solo: true });
    return api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'Player';
      if (me.id === 'local' || !api.db) return { solo: true };
      return new Promise(function (resolve) {
        var settled = false;
        var done = function () {
          if (settled) return;
          settled = true;
          started = true;
          // Announce ourselves at once. Until our row exists we are invisible,
          // and an invisible player is one the room can score a round without
          // — which is exactly what a late joiner must not be.
          publish();
          if (!beatTimer) beatTimer = setInterval(beat, HB_MS);
          resolve({ solo: false });
        };
        setTimeout(done, 2500);
        db().subscribe(function (list) {
          ingest(list || []);
          done();
        });
      });
    }).catch(function () { return { solo: true }; });
  }

  function startRound(seedOpt) {
    round = {
      id: Date.now(),
      n: (round.n || 0) + 1,
      seed: (seedOpt >>> 0) || ((Math.random() * 0x7fffffff) | 1),
      by: me.id
    };
    fieldSeen = 0;
    my.clicks = 0; my.status = 'playing';
    publish();
    if (onRound) onRound(round);
    if (onRoster) onRoster(roster());
  }

  function report(clicks, status) {
    my.clicks = clicks;
    my.status = status || my.status;
    if (my.status === 'win' && (!my.best || clicks < my.best)) my.best = clicks;
    publish();
    settle();
    if (onRoster) onRoster(roster());
  }

  root.CTCNet = {
    init: init,
    startRound: startRound,
    report: report,
    round: function () { return round; },
    me: function () { return me; },
    tally: function () { return entry(mineRow(), true); },
    roster: roster,
    set onRound(fn) { onRound = fn; },
    set onRoster(fn) { onRoster = fn; },
    set onResult(fn) { onResult = fn; }
  };
})(window);
