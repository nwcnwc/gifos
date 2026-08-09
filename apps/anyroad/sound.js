// Anyroad — the noise.
//
// EVERY SOUND IN THIS FILE IS SYNTHESISED. Not a stylistic choice: the app is a
// GIF, the whole thing is a couple of hundred kilobytes, and one minute of even
// badly compressed audio is several times the size of the entire game. So there
// are no samples — there are oscillators, one noise buffer generated at boot,
// and envelopes.
//
// There is no music, deliberately. What a driving game actually sounds like is
// an engine, tyres, and other traffic; a tune would be a second thing competing
// with the one sound that carries information about what the car is doing.
//
// Three things shape the design:
//
//  1. AUTOPLAY. A browser will not start an AudioContext without a gesture, and
//     the app's first gesture is the tap on a place to drive to. unlock() is
//     called from there and is a no-op afterwards, so nothing is primed before
//     the player has asked for anything.
//  2. ONE GRAPH, BUILT ONCE. The engine, the tyres and the traffic are
//     CONTINUOUS voices whose parameters are ramped, never rebuilt. Creating
//     oscillators per frame is what makes Web Audio crackle.
//  3. TRAFFIC IS A POOL, NOT A VOICE PER CAR. Thirty cars is thirty oscillator
//     chains and a mixing load for no gain — you cannot pick four engines out
//     of a crowd anyway. Three voices, reassigned each frame to the three
//     nearest cars, is indistinguishable and costs a fixed amount.
(function (root) {
  'use strict';

  var ctx = null, master = null, sfxBus = null;
  var engine = null, tyres = null, noiseBuf = null;
  var started = false, silent = true;
  var TRAFFIC_VOICES = 3;
  var voices = [];

  // ---- the graph -----------------------------------------------------------
  function boot() {
    if (ctx) return true;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { return false; }

    master = ctx.createGain();
    master.gain.value = 0.62;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);

    // Two seconds of white noise, made once and reused by every tyre, gust,
    // impact and animal in the game.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    engine = buildMotor(0.5, 0.4, 0.28);
    engine.out.connect(sfxBus);
    buildTyres();
    for (var v = 0; v < TRAFFIC_VOICES; v++) voices.push(buildTrafficVoice());
    started = true;
    return true;
  }

  // A four-stroke is a fundamental plus a lot of odd harmonics, so: two saws a
  // few cents apart (the beating is what stops it sounding like a test tone),
  // one square an octave down for the lumpy bottom end, and a lowpass that
  // opens with load — that filter IS the difference between "accelerating" and
  // "cruising" to the ear.
  function buildMotor(a, b, c) {
    var out = ctx.createGain(); out.gain.value = 0;
    var filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 700; filt.Q.value = 3;
    filt.connect(out);
    var oscs = [];
    [['sawtooth', 1, a], ['sawtooth', 1.008, b], ['square', 0.5, c]].forEach(function (spec) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = spec[0]; g.gain.value = spec[2];
      o.frequency.value = 60;
      o.connect(g); g.connect(filt);
      o.start();
      oscs.push({ osc: o, ratio: spec[1] });
    });
    return { out: out, filt: filt, oscs: oscs, freq: 42 };
  }

  // Tyres and wind: one noise loop through a bandpass that climbs with speed.
  function buildTyres() {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    var filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 500; filt.Q.value = 0.7;
    var out = ctx.createGain(); out.gain.value = 0;
    src.connect(filt); filt.connect(out); out.connect(sfxBus);
    src.start();
    tyres = { out: out, filt: filt };
  }

  // A traffic voice: the same motor, quieter and duller (you are hearing it
  // through a windscreen and fifty metres of air), plus a panner.
  function buildTrafficVoice() {
    var m = buildMotor(0.4, 0.3, 0.22);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    var g = ctx.createGain(); g.gain.value = 0;
    m.out.connect(lp); lp.connect(g);
    var pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); g.connect(pan); pan.connect(sfxBus); }
    else g.connect(sfxBus);
    return { motor: m, gain: g, pan: pan, lp: lp, id: null };
  }

  // ---- little helpers ------------------------------------------------------
  function now() { return ctx.currentTime; }

  function ramp(param, value, t) {
    param.cancelScheduledValues(now());
    param.setTargetAtTime(value, now(), Math.max(0.005, t || 0.08));
  }

  // One shot of noise through a filter — every impact and scrape in the game is
  // a variation on this.
  function burst(opts) {
    if (!started || silent) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = opts.rate || 1;
    var filt = ctx.createBiquadFilter();
    filt.type = opts.type || 'bandpass';
    filt.frequency.value = opts.freq || 800;
    filt.Q.value = opts.q == null ? 1 : opts.q;
    var g = ctx.createGain();
    var t = now(), dur = opts.dur || 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.gain || 0.3, t + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt); filt.connect(g);
    g.connect(opts.dest || sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // One shot of TONE, with a pitch envelope. The animals and the horn.
  function tone(opts) {
    if (!started || silent) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opts.type || 'sine';
    var t = (opts.at || now()), dur = opts.dur || 0.3;
    o.frequency.setValueAtTime(opts.f0 || 220, t);
    if (opts.f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.f1), t + dur * (opts.bend || 1));
    // Vibrato, which is most of what makes a bleat a bleat.
    if (opts.vibrato) {
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = opts.vibrato;
      lg.gain.value = opts.vibratoDepth || 14;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(opts.gain == null ? 0.2 : opts.gain, t + (opts.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var tail = g;
    if (opts.filter) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = opts.filter; f.Q.value = opts.q || 1;
      g.connect(f); tail = f;
    }
    o.connect(g);
    tail.connect(opts.dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // Where a sound IS. A panner per one-shot is affordable, and a deer barking
  // on the left when it is on the left is worth more than extra synthesis.
  function place(car, x, z, maxRange) {
    var range = maxRange || 90;
    var dx = x - car.x, dz = z - car.z;
    var d = Math.hypot(dx, dz);
    if (d > range) return null;
    var g = ctx.createGain();
    var a = Math.max(0, 1 - d / range);
    g.gain.value = a * a;                               // inverse-square-ish
    var dest = g;
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner();
      p.pan.value = panFor(car, dx, dz, d);
      g.connect(p); dest = p;
    }
    dest.connect(sfxBus);
    return g;
  }

  // +1 is off the right ear, and it is relative to where the car is POINTING —
  // the player's frame of reference is the windscreen, not north.
  function panFor(car, dx, dz, d) {
    var right = Math.sin(car.yaw + Math.PI / 2) * dx + Math.cos(car.yaw + Math.PI / 2) * dz;
    return Math.max(-1, Math.min(1, right / Math.max(4, d)));
  }

  // ---- the engine, per frame ----------------------------------------------
  // A gearbox, because a single note rising with speed is a milk float. Five
  // ratios: within a gear the note climbs, at a change it drops back — that
  // sawtooth in pitch is what the ear reads as "a car".
  var GEARS = [0, 8, 16, 25, 36, 62];

  function gearNote(v) {
    v = Math.abs(v);
    for (var i = 0; i < GEARS.length - 1; i++) {
      if (v < GEARS[i + 1]) return 0.30 + 0.70 * (v - GEARS[i]) / (GEARS[i + 1] - GEARS[i]);
    }
    return 1;
  }

  function motorAt(m, v, load, gain, t) {
    var rpm = gearNote(v);
    m.freq = 38 + rpm * 128;
    for (var i = 0; i < m.oscs.length; i++) {
      ramp(m.oscs[i].osc.frequency, m.freq * m.oscs[i].ratio, t || 0.05);
    }
    ramp(m.filt.frequency, 380 + rpm * 1500 * load, 0.09);
    ramp(m.out.gain, gain, 0.10);
    return rpm;
  }

  // Both continuous voices are updated at 20 Hz — see traffic(). Shared, so
  // the engine and the mixer move together and one frame does one batch.
  // Per CALLER, because the engine and the mixer both run once per frame and a
  // single shared flag would let whichever ran first eat the tick and starve
  // the other — they would then alternate, each updating at 10 Hz.
  var lastTick = { drive: -1, traffic: -1 };
  function due(who) {
    var t = Math.floor(now() * 20);
    if (t === lastTick[who]) return false;
    lastTick[who] = t;
    return true;
  }

  function drive(state) {
    if (!started) return;
    if (silent) { ramp(engine.out.gain, 0, 0.1); ramp(tyres.out.gain, 0, 0.1); return; }
    if (!due('drive')) return gearNote(Math.abs(state.speed));
    var v = Math.abs(state.speed);
    var load = state.throttle > 0 && !state.brake ? 1 : 0.35;
    var rpm = motorAt(engine, v, load, state.idle ? 0.05 : 0.055 + gearNote(v) * 0.10 * load);

    // Tyres: nothing at rest, and the character changes with what is under
    // them — tarmac hisses, gravel and dirt rumble.
    var grit = (state.surface >= 1 || !state.onRoad) ? 1 : 0;
    ramp(tyres.out.gain, Math.min(0.14, v * v * (grit ? 0.00055 : 0.00026)), 0.15);
    ramp(tyres.filt.frequency, (grit ? 220 : 520) + v * (grit ? 9 : 22), 0.2);
    tyres.filt.Q.value = grit ? 0.8 : 1.5;
    return rpm;
  }

  // ---- traffic -------------------------------------------------------------
  // The three nearest cars get a voice; everything further away is silent. The
  // pool is reassigned rather than rebuilt, so a car driving out of earshot and
  // another driving into it costs two parameter ramps.
  //
  // Doppler is done by hand from the closing rate, because a PannerNode with
  // real Doppler is both deprecated and far more machinery than a pitch offset.
  var pick = [];
  function traffic(car, cars) {
    if (!started) return;
    // The mixer runs at 20 Hz, not at the frame rate. Every parameter here is
    // a RAMP with a time constant of ~100 ms, so updating it sixty times a
    // second schedules four ramps for every one the ear could possibly
    // resolve — and each one is a cancelScheduledValues plus a
    // setTargetAtTime on the audio thread.
    if (!due('traffic')) return;
    if (silent || !cars || !cars.length) {
      for (var q = 0; q < voices.length; q++) ramp(voices[q].gain.gain, 0, 0.2);
      return;
    }
    // The three nearest, WITHOUT sorting and without allocating. A slice+sort
    // per frame is a fresh array and a full ordering of thirty cars to answer a
    // question about three of them — the rest of this app is careful about
    // per-frame garbage and the mixer should be too.
    pick.length = 0;
    for (var n = 0; n < cars.length; n++) {
      var cd = (cars[n].x - car.x) * (cars[n].x - car.x) + (cars[n].z - car.z) * (cars[n].z - car.z);
      var at = pick.length;
      while (at > 0 && pick[at - 1].d > cd) at--;
      if (at >= TRAFFIC_VOICES) continue;
      pick.splice(at, 0, { c: cars[n], d: cd });
      if (pick.length > TRAFFIC_VOICES) pick.length = TRAFFIC_VOICES;
    }
    for (var i = 0; i < voices.length; i++) {
      var vo = voices[i], t = pick[i] && pick[i].c;
      if (!t) { ramp(vo.gain.gain, 0, 0.25); vo.id = null; continue; }
      var dx = t.x - car.x, dz = t.z - car.z;
      var d = Math.hypot(dx, dz);
      var RANGE = 120;
      if (d > RANGE) { ramp(vo.gain.gain, 0, 0.25); vo.id = null; continue; }
      var a = 1 - d / RANGE;
      // Closing rate along the line between us, for the pitch shift.
      var rel = ((t.vx || 0) - Math.sin(car.yaw) * car.speed) * (dx / Math.max(1, d))
              + ((t.vz || 0) - Math.cos(car.yaw) * car.speed) * (dz / Math.max(1, d));
      var doppler = 1 - Math.max(-0.25, Math.min(0.25, rel / 340 * 12));
      motorAt(vo.motor, Math.abs(t.speed || 0) * doppler, 0.6, 0.35, 0.08);
      ramp(vo.gain.gain, a * a * 0.55, 0.12);
      ramp(vo.lp.frequency, 500 + a * 1800, 0.15);
      if (vo.pan) ramp(vo.pan.pan, panFor(car, dx, dz, d), 0.10);
      vo.id = t.id;
    }
  }

  // ---- impacts -------------------------------------------------------------
  function crash(force) {
    if (!started || silent) return;
    var f = Math.max(0.2, Math.min(1, force));
    burst({ freq: 180, q: 0.6, dur: 0.5 * f + 0.15, gain: 0.45 * f, type: 'lowpass' });
    burst({ freq: 2600, q: 0.8, dur: 0.22, gain: 0.22 * f, rate: 1.4 });
    tone({ type: 'triangle', f0: 90 * f, f1: 34, dur: 0.35, gain: 0.3 * f, filter: 400 });
  }

  function scrape() { burst({ freq: 1400, q: 2.5, dur: 0.16, gain: 0.10, rate: 1.2 }); }
  function glass() { burst({ freq: 5200, q: 1.2, dur: 0.30, gain: 0.20, rate: 1.8, type: 'highpass' }); }

  // ---- the wildlife --------------------------------------------------------
  // A call is a pitch envelope plus a formant. What separates a cow from a
  // goose is mostly the fundamental and how fast it wobbles.
  var CALLS = {
    cow:   { type: 'sawtooth', f0: 150, f1: 108, dur: 1.10, gain: 0.62, vibrato: 5,  depth: 6,  filter: 700 },
    sheep: { type: 'sawtooth', f0: 380, f1: 300, dur: 0.55, gain: 0.52, vibrato: 22, depth: 34, filter: 1600 },
    goose: { type: 'square',   f0: 520, f1: 430, dur: 0.20, gain: 0.44, vibrato: 0,  depth: 0,  filter: 2400, repeat: 2 },
    dog:   { type: 'sawtooth', f0: 320, f1: 150, dur: 0.13, gain: 0.56, vibrato: 0,  depth: 0,  filter: 1800, repeat: 3 },
    deer:  { type: 'sawtooth', f0: 240, f1: 170, dur: 0.22, gain: 0.48, vibrato: 0,  depth: 0,  filter: 1200 },
    boar:  { type: 'sawtooth', f0: 120, f1: 92,  dur: 0.28, gain: 0.56, vibrato: 9,  depth: 8,  filter: 600, repeat: 2 },
  };

  function call(kind, car, x, z) {
    if (!started || silent) return;
    var c = CALLS[kind];
    if (!c) return;
    var dest = place(car, x, z, 150);
    if (!dest) return;
    var n = c.repeat || 1;
    for (var i = 0; i < n; i++) {
      tone({
        type: c.type, f0: c.f0 * (0.92 + Math.random() * 0.16), f1: c.f1,
        dur: c.dur, gain: c.gain, filter: c.filter,
        vibrato: c.vibrato, vibratoDepth: c.depth,
        at: now() + i * (c.dur + 0.09), dest: dest,
      });
    }
  }

  // Hitting one. Deliberately not comic: a dull thump and one short cry.
  function thump(kind, force) {
    if (!started || silent) return;
    burst({ freq: 140, q: 0.7, dur: 0.34, gain: 0.42 * force, type: 'lowpass' });
    var c = CALLS[kind];
    if (c) tone({ type: c.type, f0: c.f0 * 1.5, f1: c.f0 * 0.5, dur: 0.30, gain: 0.18, filter: c.filter });
  }

  // ---- the blaster ---------------------------------------------------------
  // A falling square through a resonant filter is the whole cliché and it is
  // the cliché for a reason: the pitch drop IS the sound. Kept short and not
  // very loud, because it fires four times a second and anything with a tail
  // turns into a drone.
  function blast() {
    if (!started || silent) return;
    tone({ type: 'square', f0: 1250, f1: 240, dur: 0.14, bend: 0.8, gain: 0.13, filter: 3200, q: 6 });
    burst({ freq: 2400, q: 2.0, dur: 0.08, gain: 0.07, rate: 1.6 });
  }

  // What it hit. Meat, metal and masonry are three different noises, and
  // hearing WHICH from a bolt you fired two hundred metres ago is most of the
  // feedback the gun gets.
  function zap(kind) {
    if (!started || silent) return;
    if (kind === 'animal') {
      burst({ freq: 700, q: 1.1, dur: 0.20, gain: 0.16, type: 'lowpass' });
      tone({ type: 'sawtooth', f0: 420, f1: 120, dur: 0.16, gain: 0.09, filter: 900 });
    } else if (kind === 'wreck' || kind === 'car') {
      burst({ freq: 1600, q: 1.4, dur: 0.26, gain: 0.15, rate: 1.3 });
      tone({ type: 'triangle', f0: 160, f1: 55, dur: 0.28, gain: 0.14, filter: 500 });
    } else {
      burst({ freq: 1100, q: 1.8, dur: 0.12, gain: 0.09, rate: 1.1 });
    }
  }

  function horn() {
    tone({ type: 'sawtooth', f0: 330, dur: 0.45, gain: 0.16, filter: 1800 });
    tone({ type: 'sawtooth', f0: 415, dur: 0.45, gain: 0.13, filter: 1800 });
  }

  // ---- settings ------------------------------------------------------------
  // Silence has to be immediate and total: a phone making engine noise in a
  // quiet room is a bug however good it sounds.
  function setMode(mode) {
    silent = (mode === 'off');
    if (!started) return;
    if (silent) {
      ramp(engine.out.gain, 0, 0.05);
      ramp(tyres.out.gain, 0, 0.05);
      for (var i = 0; i < voices.length; i++) ramp(voices[i].gain.gain, 0, 0.05);
    }
    ramp(master.gain, silent ? 0 : 0.62, 0.05);
  }

  // The first gesture. Browsers will not start an audio graph without one, and
  // the app's first is the tap on somewhere to drive to.
  function unlock(mode) {
    if (!boot()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    setMode(mode || 'on');
    return true;
  }

  // Hitting water. A broadband burst that falls in pitch (the cavity closing
  // over), plus a longer hiss of spray. `deep` adds the swallow underneath —
  // the difference between blasting through a puddle and going under.
  function splash(force, deep) {
    if (!started || silent) return;
    var f = Math.max(0.25, Math.min(1, force));
    burst({ freq: 1400, q: 0.5, dur: 0.28 * f + 0.12, gain: 0.30 * f, rate: 1.2 });
    burst({ freq: 420, q: 0.7, dur: 0.45 * f + 0.2, gain: 0.26 * f, type: 'lowpass' });
    tone({ type: 'sine', f0: 300 * f, f1: 70, dur: 0.40, gain: 0.20 * f, filter: 700 });
    if (deep) {
      // The gulp: low, slow, and it keeps going after the spray has stopped.
      tone({ type: 'sine', f0: 120, f1: 38, dur: 1.1, gain: 0.26, filter: 320 });
      burst({ freq: 220, q: 1.2, dur: 1.0, gain: 0.16, type: 'lowpass' });
    }
  }

  // SOMEBODY WON. A rising major arpeggio with a shimmer on top, then a couple
  // of cracks for the fireworks. Everyone in the room hears it, including the
  // people who lost — a finish nobody else notices is not an event.
  function fanfare(place) {
    if (!started || silent) return;
    var root0 = place === 1 ? 392 : 330;            // G for a win, E otherwise
    var notes = [0, 4, 7, 12, 16];
    for (var i = 0; i < notes.length; i++) {
      (function (i) {
        setTimeout(function () {
          var f = root0 * Math.pow(2, notes[i] / 12);
          tone({ type: 'triangle', f0: f, f1: f, dur: 0.42, gain: 0.22, filter: 4200 });
          tone({ type: 'sine', f0: f * 2, f1: f * 2, dur: 0.30, gain: 0.10, filter: 6000 });
        }, i * 110);
      })(i);
    }
    for (var k = 0; k < 4; k++) {
      (function (k) {
        setTimeout(function () {
          burst({ freq: 900 + k * 400, q: 0.5, dur: 0.35, gain: 0.20, rate: 1.3 });
          tone({ type: 'sine', f0: 160, f1: 50, dur: 0.30, gain: 0.16, filter: 500 });
        }, 420 + k * 230);
      })(k);
    }
  }

  root.Sound = {
    unlock: unlock, setMode: setMode, drive: drive, traffic: traffic,
    crash: crash, scrape: scrape, glass: glass, blast: blast, zap: zap, splash: splash,
    call: call, thump: thump, horn: horn, fanfare: fanfare,
    ready: function () { return started; },
    // Test seam: the whole point of synthesis is that there is no file to
    // assert about, so a suite has to be able to see the graph.
    debug: function () {
      return started ? {
        state: ctx.state, engineHz: engine.freq,
        engineGain: engine.out.gain.value, tyreGain: tyres.out.gain.value,
        traffic: voices.map(function (v) { return +v.gain.gain.value.toFixed(3); }),
        silent: silent, master: master.gain.value,
      } : null;
    },
  };
})(window);
