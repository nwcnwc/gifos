/*
 * Catch the Cat — netplay.
 *
 * The room comes from the OS Invite button; this app never draws one. Each
 * player owns exactly one row in gifos.db('players') and only ever writes that
 * row. There is no referee: every client scores the round off the same rows,
 * so two screens cannot disagree unless they saw different rows, and a guest
 * who lied about their row would only be cheating themselves.
 *
 * TWO SHAPES OF ROUND, both carried on the same rows, both self-scored.
 *
 *   RACE — everyone gets the same seed, plays their own private copy, and the
 *   fewest taps to pen the cat takes the round. The row says how your board is
 *   going (clicks / status) and carries your running series tally.
 *
 *   CO-OP — one board, one cat each, no turns. The row additionally carries the
 *   walls YOU placed (so every client can union them into the shared board) and
 *   where YOUR cat is (so every client can draw it without simulating it). The
 *   room clears the round when every live cat is walled in, and loses it the
 *   moment ANY cat reaches the rim — which is why the co-op verdict does not
 *   wait for the field to finish the way the race verdict does. An escape is
 *   already the answer.
 *
 * The mode lives on the ROUND, not on the player, so a room cannot be half in
 * one game and half in the other: starting a round is what chooses.
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
  var round = { id: 0, n: 0, seed: 0, by: null, mode: 'race' };
  var my = {
    clicks: 0, status: 'playing', wins: 0, played: 0, best: 0, streak: 0,
    seat: 0, walls: [], ci: 0, cj: 0, cd: 5, cstate: 'chasing', cleared: 0
  };
  var others = {};
  var seenAt = {};
  var lastRows = [];
  var scored = 0;          // the round id already folded into the tally
  var fieldSeen = 0;       // most players ever seen on the current round
  var adopted = false;     // our own row has been read back once (a rejoin)
  var onRound = null;
  var onRoster = null;
  var onResult = null;
  var onMirror = null;
  var started = false;
  var beatTimer = 0;

  function db() { return api.db('players'); }

  function entry(p, mine) {
    return {
      id: p.id, name: p.name || 'Player', mine: !!mine,
      clicks: p.clicks || 0, status: p.status || 'playing',
      round: p.round || 0,
      wins: p.wins || 0, played: p.played || 0,
      best: p.best || 0, streak: p.streak || 0,
      cleared: p.cleared || 0,
      seat: p.seat || 0, walls: p.walls || [],
      ci: p.ci || 0, cj: p.cj || 0, cd: typeof p.cd === 'number' ? p.cd : 5,
      cstate: p.cstate || 'chasing'
    };
  }

  function mineRow() {
    return {
      id: me.id, name: me.name, round: round.id, rn: round.n, seed: round.seed,
      mode: round.mode,
      clicks: my.clicks, status: my.status,
      wins: my.wins, played: my.played, best: my.best, streak: my.streak,
      cleared: my.cleared,
      seat: my.seat, walls: my.walls,
      ci: my.ci, cj: my.cj, cd: my.cd, cstate: my.cstate
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

  // Co-op has no leaderboard — nobody is beating anybody. Order by seat so the
  // list matches the colours on the board and stops jumping about.
  function bySeat(a, b) {
    if (a.seat !== b.seat) return a.seat - b.seat;
    return (a.name || '').localeCompare(b.name || '');
  }

  function roster() {
    var list = [];
    if (me.id) list.push(entry(mineRow(), true));
    liveOthers().forEach(function (p) { list.push(entry(p, false)); });
    list.sort(round.mode === 'coop' ? bySeat : rank);
    return list;
  }

  // Everyone on the CURRENT round, me included. The field for a verdict.
  function field() {
    var out = [entry(mineRow(), true)];
    liveOthers().forEach(function (p) { if (p.round === round.id) out.push(p); });
    return out;
  }

  // A rejoin: our own row is still in the collection with the tally we left on
  // it. Take it back rather than starting the series over at zero.
  function adopt(row) {
    if (adopted) return;
    adopted = true;
    my.wins = Math.max(my.wins, row.wins || 0);
    my.played = Math.max(my.played, row.played || 0);
    my.streak = Math.max(my.streak, row.streak || 0);
    my.cleared = Math.max(my.cleared, row.cleared || 0);
    if (row.best) my.best = my.best ? Math.min(my.best, row.best) : row.best;
  }

  // Your seat is your place in the sorted list of everyone live when the round
  // began. Sorted ids, so every client computes the same one for you without
  // anyone handing seats out — and a late joiner simply takes the next one.
  function pickSeat() {
    var ids = [me.id];
    liveOthers().forEach(function (p) { ids.push(p.id); });
    ids.sort();
    var at = ids.indexOf(me.id);
    return at < 0 ? 0 : at;
  }

  function ingest(list) {
    lastRows = list || [];
    var t = Date.now();
    var newest = round;
    var seen = {};
    lastRows.forEach(function (p) {
      if (!p || !p.id) return;
      if (p.round && p.seed && p.round > newest.id) {
        newest = { id: p.round, n: p.rn || 0, seed: p.seed, by: p.id, mode: p.mode === 'coop' ? 'coop' : 'race' };
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
      my.walls = []; my.cstate = 'chasing';
      my.seat = pickSeat();
      if (onRound) onRound(round);
    }
    if (round.mode === 'coop' && onMirror) {
      onMirror(liveOthers().filter(function (p) { return p.round === round.id; }));
    }
    settle();
    if (onRoster) onRoster(roster());
  }

  function settle() {
    if (!round.id || scored === round.id) return;
    if (round.mode === 'coop') { settleCoop(); return; }
    settleRace();
  }

  // Score the round the moment nobody live is still chasing. Fires once per
  // round id, on every client, off the same rows — so the tallies agree.
  function settleRace() {
    var list = field();
    if (list.length > fieldSeen) fieldSeen = list.length;
    if (list.length < 2) {
      // Alone with the cat is practice, not a race. If the room HAD a field and
      // they all walked away, say so rather than leaving the round hanging —
      // but score nothing: a win by attrition is not a win.
      if (fieldSeen > 1 && my.status !== 'playing') {
        scored = round.id;
        if (onResult) onResult({ round: round.id, n: round.n, mode: 'race', players: 1,
          abandoned: true, escaped: false, mine: false, shared: false,
          clicks: 0, winners: [] });
      }
      return;
    }
    for (var i = 0; i < list.length; i++) if (list[i].status === 'playing') return;
    scored = round.id;

    var best = Infinity;
    list.forEach(function (p) { if (p.status === 'win' && p.clicks < best) best = p.clicks; });
    var winners = list.filter(function (p) { return p.status === 'win' && p.clicks === best; });
    var won = winners.some(function (p) { return p.id === me.id; });

    my.played += 1;
    if (won) { my.wins += 1; my.streak += 1; } else { my.streak = 0; }
    publish();

    if (onResult) {
      onResult({
        round: round.id, n: round.n, mode: 'race', players: list.length,
        escaped: winners.length === 0, mine: won, shared: winners.length > 1,
        clicks: winners.length ? best : 0,
        winners: winners.map(function (p) {
          return { id: p.id, name: p.name, mine: p.id === me.id, clicks: p.clicks };
        })
      });
    }
  }

  // Co-op is a room verdict, not a personal one, and the two halves are not
  // symmetric. An ESCAPE ends it at once — waiting for the others to finish
  // penning their cats would be waiting to be told something already decided.
  // A CLEAR has to wait for every live cat.
  function settleCoop() {
    var list = field();
    if (list.length > fieldSeen) fieldSeen = list.length;
    var gone = list.filter(function (p) { return p.cstate === 'gone'; });
    var chasing = list.filter(function (p) { return p.cstate === 'chasing'; });
    if (!gone.length && chasing.length) return;
    scored = round.id;

    var taps = 0;
    list.forEach(function (p) { taps += p.clicks || 0; });
    my.played += 1;
    if (!gone.length) my.cleared += 1;
    publish();

    if (onResult) {
      onResult({
        round: round.id, n: round.n, mode: 'coop', players: list.length,
        cleared: !gone.length, taps: taps,
        escapees: gone.map(function (p) {
          return { id: p.id, name: p.name, mine: p.id === me.id };
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

  function startRound(seedOpt, modeOpt) {
    round = {
      id: Date.now(),
      n: (round.n || 0) + 1,
      seed: (seedOpt >>> 0) || ((Math.random() * 0x7fffffff) | 1),
      by: me.id,
      mode: modeOpt === 'coop' ? 'coop' : (modeOpt === 'race' ? 'race' : round.mode)
    };
    fieldSeen = 0;
    my.clicks = 0; my.status = 'playing';
    my.walls = []; my.cstate = 'chasing';
    my.seat = pickSeat();
    publish();
    if (onRound) onRound(round);
    if (onMirror && round.mode === 'coop') onMirror([]);
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

  // The co-op equivalent: your taps, your walls and your cat, all on your own
  // row. `walls` is the compact i*100+j key list rules.js already keeps.
  function reportCoop(state) {
    my.clicks = state.clicks || 0;
    my.walls = state.walls || [];
    my.ci = state.i; my.cj = state.j; my.cd = state.dir;
    my.cstate = state.state || 'chasing';
    my.seat = typeof state.seat === 'number' ? state.seat : my.seat;
    publish();
    settle();
    if (onRoster) onRoster(roster());
  }

  root.CTCNet = {
    init: init,
    startRound: startRound,
    report: report,
    reportCoop: reportCoop,
    round: function () { return round; },
    mode: function () { return round.mode; },
    seat: function () { return my.seat; },
    me: function () { return me; },
    tally: function () { return entry(mineRow(), true); },
    roster: roster,
    set onRound(fn) { onRound = fn; },
    set onRoster(fn) { onRoster = fn; },
    set onResult(fn) { onResult = fn; },
    set onMirror(fn) { onMirror = fn; }
  };
})(window);
