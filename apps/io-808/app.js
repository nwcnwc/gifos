// iO-808 shell: 808 face, private patterns, sequencer clock.
// Classic script. Solo writes gifos.db('patterns'). A shared beat never
// overwrites that row — mp.js holds the room.
(function (root) {
  'use strict';

  var IO = root.IO808;
  var $ = function (id) { return document.getElementById(id); };

  var PARTS = [IO.FIRST_PART, IO.SECOND_PART];
  var VARIATIONS = [IO.A_VARIATION, IO.B_VARIATION];

  var INST = [
    { id: 0, short: 'AC', name: 'Accent', knobs: [], sw: null },
    { id: 1, short: 'BD', name: 'Bass Drum', knobs: ['tone', 'decay'], sw: null },
    { id: 2, short: 'SD', name: 'Snare Drum', knobs: ['tone', 'snappy'], sw: null },
    { id: 3, short: 'LT', name: 'Low Tom / Conga', knobs: ['tuning'], sw: ['Conga', 'Tom'] },
    { id: 4, short: 'MT', name: 'Mid Tom / Conga', knobs: ['tuning'], sw: ['Conga', 'Tom'] },
    { id: 5, short: 'HT', name: 'Hi Tom / Conga', knobs: ['tuning'], sw: ['Conga', 'Tom'] },
    { id: 6, short: 'RS', name: 'Rim / Claves', knobs: [], sw: ['Claves', 'Rim'] },
    { id: 7, short: 'CP', name: 'Clap / Maracas', knobs: [], sw: ['Maracas', 'Clap'] },
    { id: 8, short: 'CB', name: 'Cowbell', knobs: [], sw: null },
    { id: 9, short: 'CY', name: 'Cymbal', knobs: ['tone', 'decay'], sw: null },
    { id: 10, short: 'OH', name: 'Open Hat', knobs: ['decay'], sw: null },
    { id: 11, short: 'CH', name: "Closed Hat", knobs: [], sw: null }
  ];

  function emptySteps() {
    var steps = {}, track, inst, p, v, s;
    for (track = 0; track < 16; track++) {
      for (inst = 0; inst < 12; inst++) {
        for (p = 0; p < PARTS.length; p++) {
          for (v = 0; v < VARIATIONS.length; v++) {
            for (s = 0; s < 16; s++) steps[IO.stepKey(track, inst, PARTS[p], VARIATIONS[v], s)] = false;
          }
        }
      }
    }
    return steps;
  }

  function emptyLengths() {
    var lengths = {}, track;
    for (track = 0; track < 16; track++) {
      lengths[IO.patternLengthKey(track, IO.FIRST_PART)] = 16;
      lengths[IO.patternLengthKey(track, IO.SECOND_PART)] = 0;
    }
    return lengths;
  }

  function defaultInstruments() {
    return {
      0: { level: 0 },
      1: { level: 75, tone: 50, decay: 50 },
      2: { level: 75, tone: 50, snappy: 50 },
      3: { level: 75, tuning: 50, selector: 1 },
      4: { level: 75, tuning: 50, selector: 1 },
      5: { level: 75, tuning: 50, selector: 1 },
      6: { level: 75, selector: 1 },
      7: { level: 75, selector: 1 },
      8: { level: 75 },
      9: { level: 75, tone: 50, decay: 50 },
      10: { level: 75, decay: 50 },
      11: { level: 75 }
    };
  }

  function seedHouse(steps) {
    var on = function (inst, hits) {
      hits.forEach(function (s) { steps[IO.stepKey(0, inst, IO.FIRST_PART, IO.A_VARIATION, s)] = true; });
    };
    on(1, [0, 4, 8, 12]);
    on(2, [4, 12]);
    on(11, [0, 2, 4, 6, 8, 10, 12, 14]);
    on(7, [4, 12]);
  }

  function freshState() {
    var steps = emptySteps();
    seedHouse(steps);
    return {
      instrumentState: defaultInstruments(),
      patternLengths: emptyLengths(),
      steps: steps,
      currentPart: IO.FIRST_PART,
      currentVariation: IO.A_VARIATION,
      currentMeasure: 0,
      selectedPattern: 0,
      currentPattern: 0,
      playing: false,
      selectedInstrumentTrack: 1,
      masterVolume: 70,
      basicVariationPosition: 0,
      tempo: 135,
      fineTempo: 0,
      currentStep: 0
    };
  }

  var state = freshState();
  var audioCtx = null;
  var clock = null;
  var tickEvent = null;
  var outputChain = null;
  var currentTempo = null;
  var saveDb = null;
  var saveTimer = 0;
  var saved = null;
  var sharing = false;

  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('patterns'); } catch (e) {}

  function persist() {
    if (!saveDb || sharing) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var row = snapshot();
      saved = row;
      saveDb.put(row).catch(function () {});
    }, 400);
  }

  function packPattern(pattern) {
    var hex = '', inst, p, v, s, n, i;
    pattern = pattern == null ? state.selectedPattern : pattern;
    for (inst = 0; inst < 12; inst++) {
      for (p = 0; p < PARTS.length; p++) {
        for (v = 0; v < VARIATIONS.length; v++) {
          n = 0;
          for (s = 0; s < 16; s++) {
            if (state.steps[IO.stepKey(pattern, inst, PARTS[p], VARIATIONS[v], s)]) n |= (1 << s);
          }
          hex += ('0000' + n.toString(16)).slice(-4);
        }
      }
    }
    i = IO.patternLengthKey(pattern, IO.FIRST_PART);
    return {
      bits: hex,
      first: state.patternLengths[i] || 16,
      second: state.patternLengths[IO.patternLengthKey(pattern, IO.SECOND_PART)] || 0,
      pattern: pattern
    };
  }

  function unpackPattern(packed) {
    if (!packed || typeof packed.bits !== 'string' || packed.bits.length !== 192) return;
    var pattern = packed.pattern | 0;
    if (pattern < 0 || pattern > 15) return;
    var i = 0, inst, p, v, s, n;
    for (inst = 0; inst < 12; inst++) {
      for (p = 0; p < PARTS.length; p++) {
        for (v = 0; v < VARIATIONS.length; v++) {
          n = parseInt(packed.bits.slice(i, i + 4), 16) || 0;
          i += 4;
          for (s = 0; s < 16; s++) {
            state.steps[IO.stepKey(pattern, inst, PARTS[p], VARIATIONS[v], s)] = !!(n & (1 << s));
          }
        }
      }
    }
    state.patternLengths[IO.patternLengthKey(pattern, IO.FIRST_PART)] = packed.first || 16;
    state.patternLengths[IO.patternLengthKey(pattern, IO.SECOND_PART)] = packed.second || 0;
    state.selectedPattern = pattern;
    if (!state.playing) state.currentPattern = pattern;
  }

  function snapshot() {
    return {
      id: 'kit',
      instrumentState: state.instrumentState,
      patternLengths: state.patternLengths,
      steps: state.steps,
      masterVolume: state.masterVolume,
      tempo: state.tempo,
      fineTempo: state.fineTempo,
      selectedPattern: state.selectedPattern,
      selectedInstrumentTrack: state.selectedInstrumentTrack,
      basicVariationPosition: state.basicVariationPosition,
      currentPart: state.currentPart,
      currentVariation: state.currentVariation,
      at: Date.now()
    };
  }

  function shareKit() {
    var s = snapshot();
    return {
      instrumentState: s.instrumentState,
      masterVolume: s.masterVolume,
      tempo: s.tempo,
      fineTempo: s.fineTempo,
      selectedPattern: s.selectedPattern,
      selectedInstrumentTrack: s.selectedInstrumentTrack,
      basicVariationPosition: s.basicVariationPosition,
      currentPart: s.currentPart,
      currentVariation: s.currentVariation,
      packed: packPattern(s.selectedPattern)
    };
  }

  function applyKit(row, opts) {
    if (!row) return;
    if (row.instrumentState) state.instrumentState = row.instrumentState;
    if (row.patternLengths) state.patternLengths = row.patternLengths;
    if (row.steps) state.steps = row.steps;
    if (row.masterVolume != null) state.masterVolume = row.masterVolume;
    if (row.tempo != null) state.tempo = row.tempo;
    if (row.fineTempo != null) state.fineTempo = row.fineTempo;
    if (row.selectedPattern != null) state.selectedPattern = row.selectedPattern;
    if (row.selectedInstrumentTrack != null) state.selectedInstrumentTrack = row.selectedInstrumentTrack;
    if (row.basicVariationPosition != null) state.basicVariationPosition = row.basicVariationPosition;
    if (row.currentPart) state.currentPart = row.currentPart;
    if (row.currentVariation) state.currentVariation = row.currentVariation;
    if (!state.playing) {
      state.currentPattern = state.selectedPattern;
    }
    if (outputChain) outputChain.outputGain.amplitude.value = IO.equalPower(state.masterVolume);
    if (!(opts && opts.silent)) render();
  }

  function variationOf() {
    var pos = state.basicVariationPosition;
    if (pos <= 0) return IO.A_VARIATION;
    if (pos >= 2) return IO.B_VARIATION;
    return state.playing ? state.currentVariation : IO.A_VARIATION;
  }

  function patternLength() {
    return state.patternLengths[IO.patternLengthKey(state.currentPattern, state.currentPart)] || 16;
  }

  function requestAudio() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return;
    }
    var AC = root.AudioContext || root.webkitAudioContext;
    audioCtx = new AC();
    IO.triggerSilent(audioCtx);
    clock = new IO.Clock(audioCtx);
    var limiter = new IO.Limiter(audioCtx);
    limiter.connect(audioCtx.destination);
    var gain = new IO.VCA(audioCtx);
    gain.amplitude.value = IO.equalPower(state.masterVolume);
    gain.connect(limiter);
    outputChain = { outputLimiter: limiter, outputGain: gain };
  }

  function handleTick(ev) {
    IO.stepTrigger(state, ev.deadline, outputChain.outputGain, clock, audioCtx);
    clock.ctx; // keep a ref
    var deadline = ev.deadline;
    setTimeout(function () { advance(); }, Math.max(0, (deadline - audioCtx.currentTime) * 1000));
  }

  function getNextVariation(cur, pos) {
    if (pos === 0) return IO.A_VARIATION;
    if (pos === 2) return IO.B_VARIATION;
    return cur === IO.A_VARIATION ? IO.B_VARIATION : IO.A_VARIATION;
  }

  function advance() {
    if (!state.playing) return;
    var len = patternLength();
    if (state.currentStep + 1 >= len) {
      if (state.currentPart === IO.FIRST_PART) {
        var second = state.patternLengths[IO.patternLengthKey(state.currentPattern, IO.SECOND_PART)] || 0;
        if (second !== 0) {
          state.currentStep = 0;
          state.currentPart = IO.SECOND_PART;
        } else {
          state.currentStep = 0;
          state.currentPart = IO.FIRST_PART;
          state.currentVariation = getNextVariation(state.currentVariation, state.basicVariationPosition);
        }
      } else {
        state.currentStep = 0;
        state.currentPart = IO.FIRST_PART;
        state.currentVariation = getNextVariation(state.currentVariation, state.basicVariationPosition);
      }
    } else {
      state.currentStep += 1;
    }
    renderSteps();
  }

  function startClock() {
    requestAudio();
    clock.start();
    currentTempo = state.tempo + state.fineTempo;
    var beat = 60 / currentTempo / 4;
    tickEvent = clock.callbackAtTime(handleTick, audioCtx.currentTime + 0.1)
      .repeat(beat)
      .tolerance({ late: 0.01 });
  }

  function stopClock() {
    if (tickEvent) { tickEvent.clear(); tickEvent = null; }
    if (clock) clock.stop();
    currentTempo = null;
  }

  function setPlaying(on) {
    if (on === state.playing) return;
    if (on) {
      requestAudio();
      state.currentStep = 0;
      state.currentPart = IO.FIRST_PART;
      state.currentVariation = state.basicVariationPosition > 1 ? IO.B_VARIATION : IO.A_VARIATION;
      state.currentPattern = state.selectedPattern;
      state.playing = true;
      startClock();
    } else {
      state.playing = false;
      stopClock();
    }
    render();
  }

  function retune() {
    if (!state.playing || !tickEvent) return;
    var next = state.tempo + state.fineTempo;
    if (!currentTempo) { currentTempo = next; return; }
    if (clock && tickEvent) clock.timeStretch(audioCtx.currentTime, [tickEvent], currentTempo / next);
    currentTempo = next;
  }

  function keyOf(step) {
    return IO.stepKey(state.selectedPattern, state.selectedInstrumentTrack, state.currentPart, variationOf(), step);
  }

  function toggleStep(step) {
    var k = keyOf(step);
    state.steps[k] = !state.steps[k];
    persist();
    renderSteps();
    if (IO.Mp && IO.Mp.isOn()) IO.Mp.onStep(state.selectedInstrumentTrack, state.currentPart, variationOf(), step, state.steps[k]);
  }

  function clearPattern() {
    var inst, s, p, v;
    for (inst = 0; inst < 12; inst++) {
      for (p = 0; p < PARTS.length; p++) {
        for (v = 0; v < VARIATIONS.length; v++) {
          for (s = 0; s < 16; s++) {
            state.steps[IO.stepKey(state.selectedPattern, inst, PARTS[p], VARIATIONS[v], s)] = false;
          }
        }
      }
    }
    persist();
    render();
    if (IO.Mp && IO.Mp.isOn()) IO.Mp.onKit();
  }

  function setInstrument(id) {
    state.selectedInstrumentTrack = id;
    render();
  }

  function setKnob(id, name, value) {
    state.instrumentState[id][name] = value;
    persist();
    if (name === 'level' || name === 'selector') renderInstrument(id);
    if (IO.Mp && IO.Mp.isOn()) IO.Mp.onKnob(id, name, value);
  }

  function setTempo(v) {
    state.tempo = v;
    retune();
    persist();
    $('tempo-val').textContent = String(Math.round(state.tempo + state.fineTempo));
    if (IO.Mp && IO.Mp.isOn()) IO.Mp.onTempo();
  }

  function setFine(v) {
    state.fineTempo = v;
    retune();
    persist();
    $('tempo-val').textContent = String(Math.round(state.tempo + state.fineTempo));
    if (IO.Mp && IO.Mp.isOn()) IO.Mp.onTempo();
  }

  function setVolume(v) {
    state.masterVolume = v;
    if (outputChain) outputChain.outputGain.amplitude.value = IO.equalPower(v);
    persist();
    if (IO.Mp && IO.Mp.isOn()) IO.Mp.onTempo();
  }

  function setPattern(n) {
    state.selectedPattern = n;
    if (!state.playing) state.currentPattern = n;
    persist();
    render();
    if (IO.Mp && IO.Mp.isOn()) IO.Mp.onKit();
  }

  function setVariation(pos) {
    state.basicVariationPosition = pos;
    if (!state.playing) state.currentVariation = pos > 1 ? IO.B_VARIATION : IO.A_VARIATION;
    persist();
    render();
    if (IO.Mp && IO.Mp.isOn()) IO.Mp.onKit();
  }

  function setPart(part) {
    state.currentPart = part;
    persist();
    render();
  }

  function padLabel(s) {
    if (s < 4) return '1';
    if (s < 8) return '2';
    if (s < 12) return '3';
    return '4';
  }

  function renderInstruments() {
    var host = $('instruments');
    var html = '';
    INST.forEach(function (inst) {
      var st = state.instrumentState[inst.id];
      var on = state.selectedInstrumentTrack === inst.id;
      html += '<button type="button" class="col' + (on ? ' on' : '') + '" data-inst="' + inst.id + '">';
      html += '<span class="short">' + inst.short + '</span>';
      html += '<span class="iname">' + inst.name + '</span>';
      html += '<label>Level<input type="range" min="0" max="100" value="' + st.level + '" data-knob="level" data-inst="' + inst.id + '"></label>';
      inst.knobs.forEach(function (k) {
        html += '<label>' + k + '<input type="range" min="0" max="100" value="' + (st[k] || 0) + '" data-knob="' + k + '" data-inst="' + inst.id + '"></label>';
      });
      if (inst.sw) {
        html += '<span class="sw"><button type="button" data-sel="0" data-inst="' + inst.id + '"' + (st.selector === 0 ? ' class="on"' : '') + '>' + inst.sw[0] + '</button>';
        html += '<button type="button" data-sel="1" data-inst="' + inst.id + '"' + (st.selector === 1 ? ' class="on"' : '') + '>' + inst.sw[1] + '</button></span>';
      }
      html += '</button>';
    });
    host.innerHTML = html;
  }

  function renderInstrument(id) {
    var col = $('instruments').querySelector('[data-inst="' + id + '"].col');
    if (!col) { renderInstruments(); return; }
    col.classList.toggle('on', state.selectedInstrumentTrack === id);
  }

  function renderSteps() {
    var host = $('steps');
    var html = '';
    var s, k, hit, play;
    var len = state.patternLengths[IO.patternLengthKey(state.selectedPattern, state.currentPart)] || 16;
    for (s = 0; s < 16; s++) {
      k = keyOf(s);
      hit = !!state.steps[k];
      play = state.playing && state.currentPattern === state.selectedPattern && state.currentStep === s;
      html += '<button type="button" class="step' + (hit ? ' hit' : '') + (play ? ' play' : '') + (s >= len ? ' off' : '') + '" data-step="' + s + '">';
      html += '<i></i><span>' + (s + 1) + '</span><em>' + padLabel(s) + '</em></button>';
    }
    host.innerHTML = html;
  }

  function renderPats() {
    var host = $('pats');
    var html = '';
    var n;
    for (n = 0; n < 16; n++) {
      html += '<button type="button" class="pat' + (state.selectedPattern === n ? ' on' : '') + '" data-pat="' + n + '">' + (n + 1) + '</button>';
    }
    host.innerHTML = html;
  }

  function render() {
    $('tempo').value = state.tempo;
    $('fine').value = state.fineTempo;
    $('vol').value = state.masterVolume;
    $('tempo-val').textContent = String(Math.round(state.tempo + state.fineTempo));
    $('start').textContent = state.playing ? 'Stop' : 'Start';
    $('start').classList.toggle('go', state.playing);
    document.body.classList.toggle('playing', state.playing);
    $('var-a').classList.toggle('on', state.basicVariationPosition === 0);
    $('var-ab').classList.toggle('on', state.basicVariationPosition === 1);
    $('var-b').classList.toggle('on', state.basicVariationPosition === 2);
    $('part-1').classList.toggle('on', state.currentPart === IO.FIRST_PART);
    $('part-2').classList.toggle('on', state.currentPart === IO.SECOND_PART);
    renderInstruments();
    renderPats();
    renderSteps();
  }

  function onInstruments(e) {
    var t = e.target;
    var col = t.closest ? t.closest('.col') : null;
    if (t.getAttribute && t.getAttribute('data-sel') != null) {
      e.preventDefault();
      e.stopPropagation();
      setKnob(+t.getAttribute('data-inst'), 'selector', +t.getAttribute('data-sel'));
      render();
      return;
    }
    if (t.tagName === 'INPUT') return;
    if (col && col.getAttribute('data-inst') != null) setInstrument(+col.getAttribute('data-inst'));
  }

  function onInstrumentsInput(e) {
    var t = e.target;
    if (t.tagName !== 'INPUT') return;
    setKnob(+t.getAttribute('data-inst'), t.getAttribute('data-knob'), +t.value);
  }

  function onSteps(e) {
    var t = e.target.closest ? e.target.closest('.step') : e.target;
    if (!t || t.getAttribute('data-step') == null) return;
    toggleStep(+t.getAttribute('data-step'));
  }

  function onPats(e) {
    var t = e.target;
    if (t.getAttribute('data-pat') == null) return;
    setPattern(+t.getAttribute('data-pat'));
  }

  function load() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id === 'kit' && r.steps) saved = r;
      });
      if (saved) applyKit(saved);
      else persist();
    }).catch(function () {});
  }

  $('instruments').addEventListener('click', onInstruments);
  $('instruments').addEventListener('input', onInstrumentsInput);
  $('steps').addEventListener('click', onSteps);
  $('pats').addEventListener('click', onPats);
  $('start').addEventListener('click', function () { setPlaying(!state.playing); });
  $('clear').addEventListener('click', function () { clearPattern(); });
  $('tempo').addEventListener('input', function (e) { setTempo(+e.target.value); });
  $('fine').addEventListener('input', function (e) { setFine(+e.target.value); });
  $('vol').addEventListener('input', function (e) { setVolume(+e.target.value); });
  $('var-a').addEventListener('click', function () { setVariation(0); });
  $('var-ab').addEventListener('click', function () { setVariation(1); });
  $('var-b').addEventListener('click', function () { setVariation(2); });
  $('part-1').addEventListener('click', function () { setPart(IO.FIRST_PART); });
  $('part-2').addEventListener('click', function () { setPart(IO.SECOND_PART); });

  root.addEventListener('pagehide', function () {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
    if (saveDb && !sharing) saveDb.put(snapshot()).catch(function () {});
  });

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (IO.Mp && IO.Mp.isOn()) IO.Mp.leave();
    });
  }

  IO.Machine = {
    state: function () { return state; },
    snapshot: snapshot,
    shareKit: shareKit,
    packPattern: packPattern,
    unpackPattern: unpackPattern,
    applyKit: applyKit,
    persist: persist,
    render: render,
    setSharing: function (on) { sharing = !!on; },
    isSharing: function () { return sharing; },
    flushSave: function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; }
      if (saveDb) { saved = snapshot(); saveDb.put(saved).catch(function () {}); }
    },
    restoreSave: function () {
      if (saved) applyKit(saved);
    }
  };

  render();
  load();
})(window);
