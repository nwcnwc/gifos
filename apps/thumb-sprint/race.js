/*
 * Thumb Sprint — rules. Classic script, no ESM.
 *
 * Each racer writes ONLY their own lane row (taps, position). The host
 * alone writes the race row (seed, startAt, false-start flags, finish
 * order). writeRace() refuses anyone else — a second racer cannot put it.
 */
(function (root) {
  'use strict';

  var FINISH = 100;
  var TAP_GAIN = 2.5;
  var STALL_MS = 900;
  var MAX_LANES = 4;
  var COUNTDOWN_MS = 3000;
  var PHOTO_MS = 1400;
  var SAMPLE_MS = 50;
  var CPU_BASE = 172;
  var CPU_JITTER = 14;

  function freshRace(opts) {
    opts = opts || {};
    return {
      id: 'race',
      host: opts.host || '',
      seed: opts.seed != null ? opts.seed : ((Math.random() * 1e9) | 0),
      startAt: opts.startAt || 0,
      falseStarts: opts.falseStarts ? Object.assign({}, opts.falseStarts) : {},
      finishOrder: opts.finishOrder ? opts.finishOrder.slice() : [],
      seats: opts.seats ? opts.seats.slice() : [],
      names: opts.names ? Object.assign({}, opts.names) : {},
      seq: opts.seq || 0,
      phase: opts.phase || 'lobby'
    };
  }

  function freshLane(id, name) {
    return {
      id: id,
      name: name || 'You',
      taps: 0,
      position: 0,
      falseStart: false,
      finishedAt: 0,
      at: 0,
      ready: false
    };
  }

  function canWriteRace(writerId, race) {
    if (!race || !writerId) return false;
    return writerId === race.host;
  }

  function cloneRace(race) {
    return {
      id: 'race',
      host: race.host,
      seed: race.seed,
      startAt: race.startAt,
      falseStarts: Object.assign({}, race.falseStarts || {}),
      finishOrder: (race.finishOrder || []).slice(),
      seats: (race.seats || []).slice(),
      names: Object.assign({}, race.names || {}),
      seq: race.seq || 0,
      phase: race.phase || 'lobby'
    };
  }

  // Host-only. A second racer's write is refused: same object comes back.
  function writeRace(race, writerId, patch) {
    if (!canWriteRace(writerId, race)) return race;
    var next = cloneRace(race);
    if (!patch) return next;
    if (patch.host != null) next.host = patch.host;
    if (patch.seed != null) next.seed = patch.seed;
    if (patch.startAt != null) next.startAt = patch.startAt;
    if (patch.falseStarts) next.falseStarts = Object.assign({}, patch.falseStarts);
    if (patch.finishOrder) next.finishOrder = patch.finishOrder.slice();
    if (patch.seats) next.seats = patch.seats.slice();
    if (patch.names) next.names = Object.assign({}, patch.names);
    if (patch.seq != null) next.seq = patch.seq;
    if (patch.phase) next.phase = patch.phase;
    return next;
  }

  function tap(lane, race, now) {
    lane = lane || {};
    race = race || {};
    var startAt = race.startAt || 0;
    var out = {
      id: lane.id,
      name: lane.name,
      taps: lane.taps || 0,
      position: lane.position || 0,
      falseStart: !!lane.falseStart,
      finishedAt: lane.finishedAt || 0,
      at: now || 0,
      ready: !!lane.ready
    };
    if (out.finishedAt) return out;
    if (now < startAt) {
      out.falseStart = true;
      out.position = 0;
      return out;
    }
    if (out.falseStart && now < startAt + STALL_MS) {
      out.position = 0;
      return out;
    }
    out.taps = out.taps + 1;
    out.position = Math.min(FINISH, out.taps * TAP_GAIN);
    if (out.position >= FINISH) out.finishedAt = now;
    return out;
  }

  function finishOrder(lanes, finishDistance) {
    finishDistance = finishDistance == null ? FINISH : finishDistance;
    var done = (lanes || []).filter(function (l) {
      return l && (l.position || 0) >= finishDistance && l.finishedAt;
    });
    done.sort(function (a, b) {
      var d = a.finishedAt - b.finishedAt;
      if (d) return d;
      return String(a.id).localeCompare(String(b.id));
    });
    return done.map(function (l) { return l.id; });
  }

  function winnerOf(lanes, finishDistance) {
    var order = finishOrder(lanes, finishDistance);
    return order.length ? order[0] : null;
  }

  function compile(race, writerId, lanes) {
    if (!canWriteRace(writerId, race)) return race;
    var fs = Object.assign({}, race.falseStarts || {});
    (lanes || []).forEach(function (l) {
      if (l && l.id && l.falseStart) fs[l.id] = true;
    });
    var order = finishOrder(lanes, FINISH);
    var phase = race.phase;
    if (order.length) phase = 'finish';
    else if (race.startAt && (lanes || []).length) phase = race.phase === 'lobby' ? 'countdown' : race.phase;
    return writeRace(race, writerId, {
      falseStarts: fs,
      finishOrder: order,
      phase: phase
    });
  }

  function cpuInterval(seed, n) {
    var x = ((seed >>> 0) + Math.imul(n + 1, 1103515245)) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15;
    return CPU_BASE + (x % (CPU_JITTER * 2 + 1)) - CPU_JITTER;
  }

  function cpuStep(lane, race, now) {
    race = race || {};
    var startAt = race.startAt || 0;
    var seed = race.seed || 0;
    var out = freshLane(lane && lane.id ? lane.id : 'cpu', (lane && lane.name) || 'Computer');
    out.ready = true;
    out.at = now || 0;
    if (now < startAt) return out;
    var acc = 0, n = 0, safety = 0;
    while (safety++ < 80) {
      acc += cpuInterval(seed, n);
      var tapAt = startAt + acc;
      if (tapAt > now) break;
      out = tap(out, race, tapAt);
      n = out.taps;
      if (out.finishedAt) break;
    }
    return out;
  }

  function ghostAt(samples, startAt, now, dt) {
    dt = dt || SAMPLE_MS;
    if (!samples || !samples.length) return 0;
    if (now < startAt) return 0;
    var i = (now - startAt) / dt;
    var lo = Math.floor(i);
    if (lo >= samples.length) return samples[samples.length - 1];
    if (lo < 0) return 0;
    var hi = lo + 1;
    var a = samples[lo] || 0;
    var b = hi < samples.length ? samples[hi] : a;
    return a + (b - a) * (i - lo);
  }

  function samplePush(buf, startAt, now, position, dt) {
    dt = dt || SAMPLE_MS;
    if (!buf) return buf;
    if (now < startAt) return buf;
    var idx = Math.floor((now - startAt) / dt);
    while (buf.length <= idx) buf.push(position);
    if (idx >= 0) buf[idx] = position;
    return buf;
  }

  root.ThumbSprint = {
    FINISH: FINISH,
    finishDistance: FINISH,
    TAP_GAIN: TAP_GAIN,
    STALL_MS: STALL_MS,
    MAX_LANES: MAX_LANES,
    COUNTDOWN_MS: COUNTDOWN_MS,
    PHOTO_MS: PHOTO_MS,
    SAMPLE_MS: SAMPLE_MS,
    freshRace: freshRace,
    freshLane: freshLane,
    canWriteRace: canWriteRace,
    writeRace: writeRace,
    tap: tap,
    finishOrder: finishOrder,
    winnerOf: winnerOf,
    compile: compile,
    cpuInterval: cpuInterval,
    cpuStep: cpuStep,
    ghostAt: ghostAt,
    samplePush: samplePush
  };
})(this);
