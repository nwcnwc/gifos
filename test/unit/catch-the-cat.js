// CATCH THE CAT KEEPS THE SERIES, AND EVERY SCREEN AGREES ON IT.
//
// The race has no referee. Each player owns exactly ONE row in
// gifos.db('players') and may write only that row, so the round result is
// worked out independently on every client from the same rows. That is only
// safe if the rule is deterministic: this suite runs REAL clients side by side
// on the shipped net.js and pins that they reach the SAME tally — never one
// screen crowning a leader the other does not.
//
// It also pins the three ways the tally could quietly go wrong:
//   1. A player who walks away mid-round leaves their row behind forever (the
//      collection is the host's stored state, not a presence list). If a dead
//      row could still be 'playing', the round would hang and the series would
//      stop dead at whoever quit first.
//   2. A win by attrition is not a win. When everyone else leaves, the round
//      scores NOTHING — otherwise quitting hands the last player standing a
//      free point every round.
//   3. Nobody writes anybody else's row. Every put() is asserted to target the
//      writer's own id, because the moment one client can bump another's wins
//      the whole self-scored design is a lie.
//
// The fake room applies a put and notifies subscribers SYNCHRONOUSLY, which
// the real db does not; that only makes the interleaving tighter than reality,
// and the rule under test is about rows, not timing. Time is a fake clock so
// the staleness cutoff is exact instead of a sleep.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'catch-the-cat');
const NET = fs.readFileSync(path.join(APP, 'net.js'), 'utf8');

let failures = 0;
const check = (n, c, extra) => {
  console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (extra !== undefined && !c ? '  ' + JSON.stringify(extra) : ''));
  if (!c) failures++;
};

// ---- a controllable clock, shared by every client in the room ----------------
function makeClock() {
  const timers = new Map();
  let seq = 1;
  const clock = {
    t: 1000000,
    setTimeout(fn, ms) { const id = seq++; timers.set(id, { fn, at: clock.t + (ms || 0), every: 0 }); return id; },
    setInterval(fn, ms) { const id = seq++; timers.set(id, { fn, at: clock.t + ms, every: ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    clearInterval(id) { timers.delete(id); },
    // Step forward, firing whatever comes due in order. Repeating timers are
    // rescheduled, so a long advance beats as many times as real time would.
    advance(ms) {
      const end = clock.t + ms;
      for (;;) {
        let next = null;
        for (const [id, tm] of timers) if (tm.at <= end && (!next || tm.at < next[1].at)) next = [id, tm];
        if (!next) break;
        clock.t = next[1].at;
        if (next[1].every) next[1].at = clock.t + next[1].every; else timers.delete(next[0]);
        next[1].fn();
      }
      clock.t = end;
    },
  };
  return clock;
}

// ---- one collection, shared by every client, exactly like the host's --------
function makeRoom() {
  const rows = new Map();
  const subs = [];
  const puts = [];
  const snapshot = () => [...rows.values()].map((r) => JSON.parse(JSON.stringify(r)));
  const notify = () => subs.slice().forEach((cb) => cb(snapshot()));
  return {
    rows, puts, snapshot,
    handle(by) {
      return {
        put(rec) { puts.push({ by, wrote: rec.id }); rows.set(rec.id, JSON.parse(JSON.stringify(rec))); notify(); return Promise.resolve(rec); },
        getAll() { return Promise.resolve(snapshot()); },
        subscribe(cb) { subs.push(cb); cb(snapshot()); },
      };
    },
  };
}

// ---- a client: net.js on its own window, on the shared room and clock -------
async function join(room, clock, id, name) {
  const own = [];   // this client's timers, so a tab can actually be CLOSED
  const sandbox = {
    console, Math, Object, Array, JSON, String, Number, Boolean, Promise, Infinity,
    Date: { now: () => clock.t },
    setTimeout: (fn, ms) => { const t = clock.setTimeout(fn, ms); own.push(t); return t; },
    clearTimeout: clock.clearTimeout,
    setInterval: (fn, ms) => { const t = clock.setInterval(fn, ms); own.push(t); return t; },
    clearInterval: clock.clearInterval,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.gifos = { me: () => Promise.resolve({ id, name }), db: () => room.handle(id) };
  vm.createContext(sandbox);
  vm.runInContext(NET, sandbox, { filename: 'net.js' });
  const net = sandbox.CTCNet;
  const results = [];
  net.onResult = (r) => results.push(r);
  const info = await net.init();
  return {
    id, name, net, results, info,
    seat(who) { return net.roster().filter((p) => p.id === who)[0]; },
    tally() { return net.tally(); },
    // The tab closes: no more heartbeat, and the row stays behind in the
    // collection exactly as the host would keep it.
    quit() { own.forEach((t) => clock.clearInterval(t)); },
  };
}

const wait = () => new Promise((r) => setImmediate(r));

(async () => {
  // ---------------------------------------------------------------- same board
  {
    const clock = makeClock(), room = makeRoom();
    const a = await join(room, clock, 'a', 'Ana');
    a.net.startRound(0x1234);
    const b = await join(room, clock, 'b', 'Bo');
    await wait();
    check('a guest lands on the host\'s board', b.net.round().seed === a.net.round().seed,
      { host: a.net.round().seed, guest: b.net.round().seed });
    check('...and on the same round number', b.net.round().n === a.net.round().n && a.net.round().n === 1,
      { host: a.net.round().n, guest: b.net.round().n });
  }

  // ------------------------------------------------------ fewest taps takes it
  {
    const clock = makeClock(), room = makeRoom();
    const a = await join(room, clock, 'a', 'Ana');
    a.net.startRound(0x1234);
    const b = await join(room, clock, 'b', 'Bo');
    await wait();
    b.net.report(14, 'win');
    clock.advance(50);
    a.net.report(10, 'win');
    await wait();

    check('the round scores once on the winner\'s screen', a.results.length === 1, a.results);
    check('...and once on the loser\'s', b.results.length === 1, b.results);
    check('fewest taps takes the round', a.results[0].mine === true && b.results[0].mine === false, a.results[0]);
    check('both screens name the same winner',
      a.results[0].winners.length === 1 && b.results[0].winners.length === 1 &&
      a.results[0].winners[0].id === 'a' && b.results[0].winners[0].id === 'a', [a.results[0].winners, b.results[0].winners]);
    check('the winning score is the winner\'s taps', a.results[0].clicks === 10 && b.results[0].clicks === 10);

    // The tally each client keeps for the OTHER player is that player's own
    // published row — this is where two screens would disagree.
    check('the winner has the win on both screens', a.seat('a').wins === 1 && b.seat('a').wins === 1,
      { onA: a.seat('a').wins, onB: b.seat('a').wins });
    check('the loser has none on both screens', a.seat('b').wins === 0 && b.seat('b').wins === 0,
      { onA: a.seat('b').wins, onB: b.seat('b').wins });
    check('the loser still keeps a personal best', b.tally().best === 14, b.tally());
    check('the standings put the leader first', a.net.roster()[0].id === 'a' && b.net.roster()[0].id === 'a');
    check('nobody wrote anybody else\'s row', room.puts.every((p) => p.by === p.wrote), room.puts.filter((p) => p.by !== p.wrote));
  }

  // ----------------------------------------------------------------- a tie
  {
    const clock = makeClock(), room = makeRoom();
    const a = await join(room, clock, 'a', 'Ana');
    a.net.startRound(0x1234);
    const b = await join(room, clock, 'b', 'Bo');
    await wait();
    a.net.report(12, 'win');
    clock.advance(50);
    b.net.report(12, 'win');
    await wait();
    check('a tie is shared, not broken', a.results[0].shared === true && a.results[0].winners.length === 2, a.results[0]);
    check('...and both sides claim it', a.results[0].mine === true && b.results[0].mine === true);
    check('...and both tallies show the win on both screens',
      a.seat('a').wins === 1 && a.seat('b').wins === 1 && b.seat('a').wins === 1 && b.seat('b').wins === 1,
      { onA: [a.seat('a').wins, a.seat('b').wins], onB: [b.seat('a').wins, b.seat('b').wins] });
  }

  // ------------------------------------------------ the cat gets away from all
  {
    const clock = makeClock(), room = makeRoom();
    const a = await join(room, clock, 'a', 'Ana');
    a.net.startRound(0x1234);
    const b = await join(room, clock, 'b', 'Bo');
    await wait();
    a.net.report(9, 'lose');
    clock.advance(50);
    b.net.report(11, 'lose');
    await wait();
    check('nobody wins a round the cat escaped', a.results[0].escaped === true && a.results[0].winners.length === 0, a.results[0]);
    check('...and no win is credited', a.seat('a').wins === 0 && a.seat('b').wins === 0);
    check('...but the round counts as played', a.tally().played === 1 && b.tally().played === 1);
  }

  // -------------------------------------------------------------- the streak
  {
    const clock = makeClock(), room = makeRoom();
    const a = await join(room, clock, 'a', 'Ana');
    a.net.startRound(0x1234);
    const b = await join(room, clock, 'b', 'Bo');
    await wait();
    const round = (aTaps, bTaps) => {
      a.net.report(aTaps, 'win');
      clock.advance(50);
      b.net.report(bTaps, 'win');
      clock.advance(50);
      a.net.startRound(0);
      clock.advance(50);
    };
    round(10, 20); round(10, 20);
    check('a run of wins is a streak', a.tally().streak === 2 && a.tally().wins === 2, a.tally());
    check('...and the loser\'s streak stays at zero', b.tally().streak === 0 && b.tally().wins === 0, b.tally());
    round(30, 12);
    check('losing a round breaks the streak', a.tally().streak === 0 && a.tally().wins === 2, a.tally());
    check('...and starts the other one\'s', b.tally().streak === 1 && b.tally().wins === 1, b.tally());
    check('the best board is the fewest taps ever, not the last', a.tally().best === 10, a.tally());
    check('the lead changes hands in the standings order', a.net.roster()[0].id === 'a', a.net.roster().map((p) => p.id + ':' + p.wins));
  }

  // ------------------------------------------------------- alone is not a race
  {
    const clock = makeClock(), room = makeRoom();
    const a = await join(room, clock, 'a', 'Ana');
    a.net.startRound(0x1234);
    a.net.report(7, 'win');
    clock.advance(100);
    await wait();
    check('playing alone scores nothing', a.results.length === 0 && a.tally().wins === 0, a.tally());
    check('...but still counts as a personal best', a.tally().best === 7);
  }

  // ------------------------------------------- a quiet player stops holding up
  {
    const clock = makeClock(), room = makeRoom();
    const a = await join(room, clock, 'a', 'Ana');
    a.net.startRound(0x1234);
    const b = await join(room, clock, 'b', 'Bo');
    const c = await join(room, clock, 'c', 'Cy');
    await wait();
    a.net.report(10, 'win');
    b.net.report(16, 'win');
    clock.advance(1000);
    await wait();
    check('a round waits for everyone still chasing', a.results.length === 0, a.results);
    check('...and says so in the standings', a.net.roster().filter((p) => p.status === 'playing').length === 1);

    // Cy's tab is gone. The row stays behind in the host's collection forever,
    // so only the heartbeat can tell the difference.
    c.quit();
    clock.advance(20000);
    await wait();
    check('a player whose heartbeat stopped leaves the roster',
      a.net.roster().map((p) => p.id).join(',') === 'a,b', a.net.roster().map((p) => p.id));
    check('...and the round scores without them', a.results.length === 1 && a.results[0].winners[0].id === 'a', a.results);
    check('...on both live screens', b.results.length === 1 && b.results[0].mine === false, b.results);
  }

  // ------------------------------------------------- a win by attrition is not
  {
    const clock = makeClock(), room = makeRoom();
    const a = await join(room, clock, 'a', 'Ana');
    a.net.startRound(0x1234);
    const b = await join(room, clock, 'b', 'Bo');
    await wait();
    a.net.report(10, 'win');
    b.quit();
    clock.advance(20000);
    await wait();
    check('the last player standing wins nothing', a.tally().wins === 0, a.tally());
    check('...and the round is called off, not left hanging',
      a.results.length === 1 && a.results[0].abandoned === true, a.results);
  }

  // --------------------------------------------------- a rejoin keeps the tally
  {
    const clock = makeClock(), room = makeRoom();
    const a = await join(room, clock, 'a', 'Ana');
    a.net.startRound(0x1234);
    const b = await join(room, clock, 'b', 'Bo');
    await wait();
    a.net.report(10, 'win');
    clock.advance(50);
    b.net.report(20, 'win');
    clock.advance(50);
    check('the win is on the row before the reload', room.rows.get('a').wins === 1, room.rows.get('a'));
    const again = await join(room, clock, 'a', 'Ana');
    await wait();
    check('reopening the app does not reset the series', again.tally().wins === 1, again.tally());
    check('...and keeps the best board too', again.tally().best === 10, again.tally());
  }

  // ------------------------------------------------------------ the source rule
  {
    const src = NET;
    const puts = src.match(/db\(\)\.put\(/g) || [];
    check('there is exactly one writer of a row', puts.length === 1, puts);
    check('...and it writes our own id', /function publish\(\)[\s\S]*?var row = mineRow\(\);/.test(src));
  }

  console.log(failures ? '\nFAIL ' + failures : '\nALL GREEN');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
