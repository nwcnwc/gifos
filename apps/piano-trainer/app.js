// Piano Trainer — classic rewrite of ZaneH/piano-trainer. Invite is OS chrome.
(function () {
  'use strict';
  var PT = window.PT, Snd = window.PTSound;
  var $ = function (id) { return document.getElementById(id); };

  var WHITES = [48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72];
  var BLACKS = [49, 51, 54, 56, 58, 61, 63, 66, 68, 70];
  var HOME = {
    KeyA: 48, KeyS: 50, KeyD: 52, KeyF: 53, KeyG: 55, KeyH: 57, KeyJ: 59,
    KeyK: 60, KeyL: 62, Semicolon: 64, Quote: 65,
    KeyW: 49, KeyE: 51, KeyT: 54, KeyY: 56, KeyU: 58, KeyO: 61, KeyP: 63
  };

  var state = {
    mode: 'scales', tonicId: 'c-major', hard: false, shuffle: false,
    held: {}, step: 0, target: [], quiz: null, quizScore: 0, together: false
  };
  var saveDb = null, roomDb = null, me = { id: 'local', name: 'You' };
  var saveTimer = 0;

  try {
    if (window.gifos) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  function tonic() {
    var i;
    for (i = 0; i < PT.TONICS.length; i++) if (PT.TONICS[i].id === state.tonicId) return PT.TONICS[i];
    return PT.TONICS[0];
  }
  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      saveDb.put({
        id: 'last', mode: state.mode, tonicId: state.tonicId,
        hard: state.hard, shuffle: state.shuffle, quizScore: state.quizScore
      }).catch(function () {});
    }, 200);
  }
  function publish() {
    if (!state.together || !roomDb || !me.id) return;
    roomDb.put({
      id: me.id, name: me.name, at: Date.now(),
      mode: state.mode, tonicId: state.tonicId, step: state.step,
      quizPrompt: state.quiz && state.quiz.prompt
    }).catch(function () {});
  }

  function buildTarget() {
    var t = tonic();
    var scale = PT.scaleNotes(t);
    var mode = state.mode;
    if (mode === 'quiz') {
      state.target = [];
      state.quiz = PT.quizItem();
      state.step = 0;
      return;
    }
    state.quiz = null;
    var start = 0;
    if (state.shuffle) start = Math.floor(Math.random() * 7);
    if (mode === 'scales') {
      var up = scale.slice(start).concat(scale.slice(1, start + 1).map(function (n) { return n + 12; }));
      var down = up.slice().reverse().slice(1);
      state.target = up.concat(down);
    } else if (mode === 'chords') {
      state.target = [];
      var i;
      for (i = 0; i < 7; i++) state.target.push(PT.triad(scale, (start + i) % 7));
    } else if (mode === 'sevenths') {
      state.target = [];
      for (i = 0; i < 7; i++) state.target.push(PT.seventh(scale, (start + i) % 7));
    } else if (mode === 'fifths') {
      var note = scale[start];
      state.target = [note, PT.fifthOf(scale, note)];
    }
    state.step = 0;
  }

  function currentWant() {
    var w = state.target[state.step];
    if (w == null) return [];
    return Array.isArray(w) ? w : [w];
  }

  function paintPiano() {
    var el = $('piano');
    el.innerHTML = '';
    var want = currentWant();
    var nextSet = {};
    if (!state.hard) want.forEach(function (n) { nextSet[n] = 1; nextSet[n + 12] = 1; nextSet[n - 12] = 1; });
    var wCount = WHITES.length;
    WHITES.forEach(function (midi, i) {
      var k = document.createElement('button');
      k.type = 'button';
      k.className = 'key white' + (state.held[midi] ? ' on' : '') + (nextSet[midi] ? ' next' : '');
      k.style.left = (i * (100 / wCount)) + '%';
      k.style.width = (100 / wCount) + '%';
      k.setAttribute('data-midi', midi);
      k.setAttribute('aria-label', PT.noteName(midi));
      el.appendChild(k);
    });
    BLACKS.forEach(function (midi) {
      var k = document.createElement('button');
      k.type = 'button';
      k.className = 'key black' + (state.held[midi] ? ' on' : '') + (nextSet[midi] ? ' next' : '');
      var after = -1, i;
      for (i = 0; i < WHITES.length; i++) if (WHITES[i] < midi) after = i;
      var slot = 100 / wCount;
      k.style.left = ((after + 0.72) * slot) + '%';
      k.setAttribute('data-midi', midi);
      k.setAttribute('aria-label', PT.noteName(midi));
      el.appendChild(k);
    });
  }

  function paintPrompt() {
    if (state.mode === 'quiz' && state.quiz) {
      $('prompt').textContent = state.quiz.prompt;
      var box = $('quizBox');
      box.hidden = false;
      box.innerHTML = '';
      state.quiz.options.forEach(function (opt) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = opt;
        b.onclick = function () { answerQuiz(opt, b); };
        box.appendChild(b);
      });
      return;
    }
    $('quizBox').hidden = true;
    var t = tonic();
    var want = currentWant();
    var names = want.map(function (n) { return PT.noteName(n); }).join(' · ');
    var label = { scales: 'scale', chords: 'triad', sevenths: 'seventh', fifths: 'fifth' }[state.mode] || 'notes';
    $('prompt').textContent = t.label + ' · ' + label + (names && !state.hard ? ' · ' + names : '');
    $('quizScore').textContent = String(state.quizScore);
  }

  function answerQuiz(opt, btn) {
    if (!state.quiz) return;
    var ok = opt === state.quiz.answer;
    btn.className = ok ? 'good' : 'bad';
    if (ok) state.quizScore++;
    persist();
    setTimeout(function () { buildTarget(); paint(); publish(); }, 650);
  }

  function paint() { paintPrompt(); paintPiano(); }

  function down(midi) {
    if (state.held[midi]) return;
    state.held[midi] = 1;
    Snd.attack(midi);
    checkProgress();
    paintPiano();
  }
  function up(midi) {
    if (!state.held[midi]) return;
    delete state.held[midi];
    Snd.release(midi);
    paintPiano();
  }

  function checkProgress() {
    if (state.mode === 'quiz') return;
    var want = currentWant();
    if (!want.length) return;
    var held = Object.keys(state.held).map(Number);
    if (want.length === 1) {
      var hit = held.some(function (h) { return PT.samePitch(h, want[0]); });
      if (!hit) return;
    } else if (!PT.chordMatch(held, want)) return;
    state.step++;
    if (state.step >= state.target.length) {
      $('prompt').textContent = 'Nice. Again.';
      setTimeout(function () { buildTarget(); paint(); publish(); }, 500);
      return;
    }
    paint();
    publish();
  }

  function fillTonic() {
    var sel = $('tonic');
    sel.innerHTML = '';
    PT.TONICS.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.id; o.textContent = t.label;
      sel.appendChild(o);
    });
    sel.value = state.tonicId;
  }

  $('tonic').onchange = function () {
    state.tonicId = this.value;
    buildTarget(); paint(); persist(); publish();
  };
  $('hard').onchange = function () { state.hard = this.checked; paint(); persist(); };
  $('shuffle').onchange = function () { state.shuffle = this.checked; buildTarget(); paint(); persist(); };
  $('modes').onclick = function (e) {
    var b = e.target;
    if (!b.getAttribute || !b.getAttribute('data-mode')) return;
    state.mode = b.getAttribute('data-mode');
    [].forEach.call($('modes').querySelectorAll('button'), function (x) {
      x.classList.toggle('on', x.getAttribute('data-mode') === state.mode);
    });
    buildTarget(); paint(); persist(); publish();
  };

  $('piano').addEventListener('pointerdown', function (e) {
    var el = e.target;
    var midi = el && el.getAttribute && parseInt(el.getAttribute('data-midi'), 10);
    if (!midi) return;
    e.preventDefault();
    down(midi);
    var upOnce = function () { up(midi); window.removeEventListener('pointerup', upOnce); };
    window.addEventListener('pointerup', upOnce);
  });

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    var midi = HOME[e.code];
    if (!midi) return;
    e.preventDefault();
    down(midi);
  });
  window.addEventListener('keyup', function (e) {
    var midi = HOME[e.code];
    if (!midi) return;
    up(midi);
  });

  $('togetherBtn').onclick = function () {
    state.together = !state.together;
    this.classList.toggle('on', state.together);
    $('togetherNote').hidden = !state.together;
    if (state.together) {
      publish();
      if (roomDb) roomDb.subscribe(function () {});
    }
  };

  function tryMidi() {
    if (!navigator.requestMIDIAccess) return;
    navigator.requestMIDIAccess().then(function (access) {
      $('midiHint').textContent = 'MIDI keyboard ready.';
      function hook(port) {
        port.onmidimessage = function (ev) {
          var d = ev.data; if (!d || d.length < 2) return;
          var cmd = d[0] & 0xf0, n = d[1];
          if (cmd === 0x90 && d[2] > 0) down(n);
          else if (cmd === 0x80 || (cmd === 0x90 && d[2] === 0)) up(n);
        };
      }
      access.inputs.forEach(hook);
      access.onstatechange = function (e) { if (e.port && e.port.state === 'connected') hook(e.port); };
    }).catch(function () {});
  }

  function boot() {
    fillTonic();
    buildTarget();
    paint();
    var p = Promise.resolve();
    if (window.gifos && gifos.me) {
      p = gifos.me().then(function (id) {
        me.id = id && id.id ? id.id : 'local';
        me.name = (id && id.name) || 'You';
      }).catch(function () {});
    }
    p.then(function () {
      if (!saveDb) return;
      return saveDb.get('last').then(function (rec) {
        if (!rec) return;
        if (rec.mode) state.mode = rec.mode;
        if (rec.tonicId) state.tonicId = rec.tonicId;
        state.hard = !!rec.hard;
        state.shuffle = !!rec.shuffle;
        state.quizScore = rec.quizScore | 0;
        $('hard').checked = state.hard;
        $('shuffle').checked = state.shuffle;
        $('tonic').value = state.tonicId;
        [].forEach.call($('modes').querySelectorAll('button'), function (x) {
          x.classList.toggle('on', x.getAttribute('data-mode') === state.mode);
        });
        buildTarget(); paint();
      }).catch(function () {});
    }).then(tryMidi);
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () {
        if (state.together) { $('togetherBtn').onclick(); return true; }
        return false;
      });
    }
  }
  boot();
})();
