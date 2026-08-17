/*
 * FPS Simple — pre-rendered voices, so a firefight fits the render budget.
 *
 * WHY THIS EXISTS, with the numbers that forced it. Every sound in this game
 * is synthesized live: a rifle shot is ~40 Web Audio nodes with a-rate
 * envelopes, torn down and rebuilt per shot. Measured with a microphone on a
 * second machine plus CDP's render-capacity meter plus /proc schedstat: in
 * combat the audio render thread burns ~1000 ms of CPU per second — an entire
 * core — and on a laptop whose sustained power limit halves its clock ten
 * seconds into play, that is more than the machine has. Chrome then emits
 * SILENCE for as long as the graph stays over budget, which was the whole
 * "sound goes in and out" bug. The watchdog (audioHeal in vendor.mjs) detects
 * and recovers, and sheds load each time — but detection costs 1-2 s of
 * silence per wedge, and the player asked for zero.
 *
 * So the voices stop being paid for per shot. The engine's dsp layer is
 * written against BaseAudioContext precisely so a voice renders identically
 * offline (upstream's own selftest does it); vendor.mjs adds the two seams —
 * a cache gate in _build and an offline renderer (_voRender) — and this file
 * is the policy: which kinds are cacheable, what the cache key is, how many
 * variants to keep, and when to let go of memory. A hit costs one
 * AudioBufferSourceNode (plus a gain when the caller's level isn't 1) instead
 * of ~40 nodes of live synthesis; a miss plays live exactly as upstream and
 * quietly renders that voice for next time, so the second burst of a firefight
 * is already cheap.
 *
 * WHAT IS DELIBERATELY NOT CACHED. Barks are procedural speech — level, f0
 * and tract shape the voice, not just its volume — and they are rate-limited
 * to ~2/s by the engine anyway. Explosions are rare, huge, and shaped by
 * distance and radius. Heartbeat/cloth/bodyfall/reload/ambient one-shots are
 * low-rate. All stay live; the cache covers the kinds measured at ~95% of
 * combat voice starts: shots, impacts, shells, footsteps, whizz-bys, dryfire
 * and the UI ticks.
 *
 * VARIETY. Two offline-rendered variants per key (each draws fresh jitter
 * from the audio rng), rotated, plus ±3% playbackRate at playback — the same
 * trick every sampler-based game engine uses.
 */
(function (root) {
  'use strict';

  var VARIANTS = 2;
  var MAX_SECONDS = 90;        // total cached audio; ~32 MB of float stereo
  var TAIL = 0.05;             // keep this much silence after the last sample
  // Generous offline render lengths per kind; trimmed after rendering.
  var LEN = { shot: 3.0, impact: 1.2, shell: 1.6, step: 0.9, whizz: 0.7, dryfire: 0.8 };

  var map = Object.create(null);
  var order = [];              // LRU: keys, oldest first
  var total = 0;               // seconds of cached audio
  var chain = Promise.resolve();  // renders run one at a time

  function bucket(x, edges) {
    for (var i = 0; i < edges.length; i++) if (x <= edges[i]) return i;
    return edges.length;
  }

  // The key is the identity of the SOUND, not of the event: everything that
  // shapes the waveform is in it, everything that only scales it is not.
  function keyFor(kind, dist, o, space) {
    switch (kind) {
      case 'shot': {
        var p = o.profile || {};
        // echoBoost is computed from the space probe inside _build; quantize
        // it so a doorway does not mint a new cache line per footstep.
        var echo = 0.75 + space.street * 0.7 + space.tight * 0.35 + space.tunnel * 0.8 + space.open * 0.2;
        return 's|' + (p.bodyF || 0) + '.' + (p.crackF || 0) + '|' + (o.firstPerson ? 1 : 0)
          + '|' + bucket(dist, [3, 20, 60]) + '|' + Math.round(echo * 2);
      }
      case 'impact': return 'i|' + (o.surface || 'concrete') + '|' + bucket(o.energy == null ? 1 : o.energy, [0.7, 1.1]);
      case 'step': return 't|' + (o.surface || 'concrete') + '|' + (o.gait || 'walk') + '|' + (o.gear ? 1 : 0);
      case 'shell': return 'h|' + (o.surface || 'concrete');
      case 'whizz': return 'w|' + bucket(o.miss == null ? 3 : o.miss, [1, 3]);
      case 'dryfire': case 'hitmarker': case 'headshot': case 'kill': case 'armour':
      case 'damage': case 'grenade_warn': case 'regen': case 'lowhealth':
        return 'u|' + kind;
      default: return null;    // bark, explosion, heartbeat, reload, ambient, cloth, bodyfall: live
    }
  }

  // These kinds' `level` scales volume linearly, so the buffer is rendered at
  // level 1 and the level is applied at playback with one gain node.
  function levelOf(kind, o) {
    if (o && o.level != null && kind !== 'impact') return o.level;
    return 1;
  }

  function touch(key) {
    var i = order.indexOf(key);
    if (i >= 0) order.splice(i, 1);
    order.push(key);
  }

  function evict() {
    while (total > MAX_SECONDS && order.length) {
      var key = order.shift();
      var e = map[key];
      if (!e) continue;
      for (var i = 0; i < e.v.length; i++) total -= e.v[i].buffer.duration;
      delete map[key];
    }
  }

  // Cut the trailing silence off a rendered buffer — most voices are far
  // shorter than the generous render window, and cached silence is cached rent.
  function trim(actx, buf) {
    var last = 0;
    for (var c = 0; c < buf.numberOfChannels; c++) {
      var d = buf.getChannelData(c);
      for (var i = d.length - 1; i > last; i--) {
        if (d[i] > 1e-4 || d[i] < -1e-4) { if (i > last) last = i; break; }
      }
    }
    var n = Math.min(buf.length, last + Math.ceil(TAIL * buf.sampleRate));
    if (n >= buf.length - 256) return buf;
    var out = actx.createBuffer(buf.numberOfChannels, Math.max(256, n), buf.sampleRate);
    for (var c2 = 0; c2 < buf.numberOfChannels; c2++) {
      out.copyToChannel(buf.getChannelData(c2).subarray(0, out.length), c2);
    }
    return out;
  }

  function queueRender(audio, key, e, kind, dist, o) {
    e.busy++;
    // Render at neutral level; the playback path applies the caller's level.
    var o2 = {};
    for (var k in o) o2[k] = o[k];
    if (o2.level != null && kind !== 'impact') o2.level = 1;
    var secs = LEN[kind] || 1.2;
    chain = chain.then(function () {
      return audio._voRender(kind, dist, o2, secs).then(function (r) {
        e.busy--;
        if (!r || !r.buffer) return;
        var b = trim(audio.actx, r.buffer);
        e.v.push({ buffer: b, send: r.send });
        total += b.duration;
        evict();
      }, function () { e.busy--; });
    });
  }

  root.VoiceCache = {
    /** The seam _build calls. Returns a {node, end, send} voice, or null. */
    get: function (audio, kind, when, dist, o) {
      try {
        if (!audio || !audio.actx) return null;
        var key = keyFor(kind, dist, o || {}, audio._space || {});
        if (!key) return null;
        var e = map[key] || (map[key] = { v: [], busy: 0, n: 0 });
        if (e.v.length + e.busy < VARIANTS) queueRender(audio, key, e, kind, dist, o || {});
        if (!e.v.length) return null;
        e.n = (e.n + 1) % e.v.length;
        var pick = e.v[e.n];
        var actx = audio.actx;
        var src = actx.createBufferSource();
        src.buffer = pick.buffer;
        src.playbackRate.value = 0.97 + Math.random() * 0.06;
        var lvl = levelOf(kind, o || {});
        var node = src;
        if (lvl !== 1) {
          var g = actx.createGain();
          g.gain.value = lvl;
          src.connect(g);
          node = g;
        }
        src.start(Math.max(when, actx.currentTime));
        touch(key);
        this.stats.hits++;
        return { node: node, end: when + pick.buffer.duration + TAIL, send: pick.send };
      } catch (err) {
        return null;           // any surprise: fall back to live synthesis
      }
    },
    stats: { hits: 0 },
    /** For the beacon/suites: how much is cached, and how hot it runs. */
    report: function () {
      var keys = 0, variants = 0;
      for (var k in map) { keys++; variants += map[k].v.length; }
      return { keys: keys, variants: variants, seconds: +total.toFixed(1), hits: this.stats.hits };
    },
  };
})(window);
