// Piano Trainer — classic rewrite of ZaneH/piano-trainer. Invite is OS chrome.
(function () {
  'use strict';
  var PT = window.PT, Snd = window.PTSound;
  var $ = function (id) { return document.getElementById(id); };

  var trainer = PT.Trainer.create();
  var saveDb = null, roomDb = null, me = { id: 'local', name: 'You' };
  var saveTimer = 0;
  var together = false;
  var pointers = {};
  var firstRun = true;
  var flashTimer = 0;

  try {
    if (window.gifos) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var rec = PT.snapshot(trainer);
      rec.seen = true;
      saveDb.put(rec).catch(function () {});
    }, 180);
  }

  function publish() {
    if (!together || !roomDb || !me.id) return;
    roomDb.put({
      id: me.id, name: me.name, at: Date.now(),
      mode: trainer.mode, tonicId: trainer.tonicId, step: trainer.step,
      quizPrompt: trainer.quiz && trainer.quiz.prompt
    }).catch(function () {});
  }

  function paintCircle() {
    var el = $('circle');
    if (trainer.mode !== 'fifths') { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '';
    var t = trainer.tonic();
    var fifthName = PT.fifthAbove(t.name);
    PT.FIFTHS.forEach(function (n, i) {
      var a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wedge' + (n === t.name ? ' on' : '') + (n === fifthName ? ' fifth' : '');
      b.textContent = n;
      b.setAttribute('aria-label', n + ' major');
      b.style.left = (50 + 38 * Math.cos(a)) + '%';
      b.style.top = (50 + 38 * Math.sin(a)) + '%';
      b.onclick = function () {
        var match = PT.TONICS.filter(function (x) { return x.kind === 'major' && x.name === n; })[0];
        if (!match) return;
        trainer.tonicId = match.id;
        trainer.reset();
        paint(); persist(); publish();
      };
      el.appendChild(b);
    });
    var hub = document.createElement('span');
    hub.className = 'hub';
    hub.textContent = t.name;
    el.appendChild(hub);
  }

  function midiFromPoint(x, y) {
    var stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
    var i, el, m;
    for (i = 0; i < stack.length; i++) {
      el = stack[i];
      if (!el || !el.getAttribute) continue;
      m = parseInt(el.getAttribute('data-midi'), 10);
      if (m) return m;
    }
    return 0;
  }

  function paintPiano() {
    var el = $('piano');
    el.innerHTML = '';
    var want = trainer.want();
    var nextSet = {};
    if (trainer.mode !== 'quiz' && !trainer.hard) {
      want.forEach(function (n) {
        nextSet[n] = 1; nextSet[n + 12] = 1; nextSet[n - 12] = 1;
      });
    }
    if (trainer.mode === 'quiz' && trainer.quiz && trainer.quiz.type === 'play' && trainer.quiz.midi && !trainer.hard) {
      nextSet[trainer.quiz.midi] = 1;
      nextSet[trainer.quiz.midi + 12] = 1;
    }
    var wCount = PT.WHITES.length;
    PT.WHITES.forEach(function (midi, i) {
      var k = document.createElement('button');
      k.type = 'button';
      k.className = 'key white' + (trainer.held[midi] ? ' on' : '') + (nextSet[midi] ? ' next' : '');
      k.style.left = (i * (100 / wCount)) + '%';
      k.style.width = (100 / wCount) + '%';
      k.setAttribute('data-midi', midi);
      k.setAttribute('aria-label', PT.noteName(midi));
      var lab = document.createElement('span');
      lab.className = 'letter';
      lab.textContent = PT.noteName(midi);
      k.appendChild(lab);
      if (PT.HOME_LABEL[midi]) {
        var h = document.createElement('span');
        h.className = 'home';
        h.textContent = PT.HOME_LABEL[midi];
        k.appendChild(h);
      }
      el.appendChild(k);
    });
    PT.BLACKS.forEach(function (midi) {
      var k = document.createElement('button');
      k.type = 'button';
      k.className = 'key black' + (trainer.held[midi] ? ' on' : '') + (nextSet[midi] ? ' next' : '');
      var after = -1, i;
      for (i = 0; i < PT.WHITES.length; i++) if (PT.WHITES[i] < midi) after = i;
      var slot = 100 / wCount;
      k.style.left = ((after + 0.68) * slot) + '%';
      k.setAttribute('data-midi', midi);
      k.setAttribute('aria-label', PT.noteName(midi));
      if (PT.HOME_LABEL[midi]) {
        var hb = document.createElement('span');
        hb.className = 'home';
        hb.textContent = PT.HOME_LABEL[midi];
        k.appendChild(hb);
      }
      el.appendChild(k);
    });
  }

  function degreeLabel() {
    if (trainer.mode === 'quiz' || trainer.mode === 'scales') return '';
    var t = trainer.tonic();
    var rom = PT.romanOf(t.kind);
    var idx = trainer.step % 7;
    return rom[idx] || '';
  }

  function paintPrompt() {
    $('quizScore').textContent = trainer.quizAsked ? String(trainer.quizScore) : '—';
    var rounds = trainer.rounds | 0;
    var chip = $('doneChip');
    if (rounds) {
      chip.hidden = false;
      chip.textContent = rounds + (rounds === 1 ? ' round' : ' rounds');
    } else {
      chip.hidden = true;
    }
    var coach = $('coach');
    if (firstRun && trainer.mode === 'scales' && trainer.step === 0 && !trainer.quizAsked) {
      coach.hidden = false;
      coach.textContent = 'Gold keys are next. Start on C — tap it, or press A.';
    } else {
      coach.hidden = true;
    }
    if (trainer.mode === 'quiz' && trainer.quiz) {
      $('prompt').textContent = trainer.quiz.prompt;
      var box = $('quizBox');
      box.hidden = false;
      box.innerHTML = '';
      trainer.quiz.options.forEach(function (opt) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = opt;
        b.onclick = function () { answerQuiz(opt, b); };
        box.appendChild(b);
      });
      return;
    }
    var boxOff = $('quizBox');
    boxOff.hidden = true;
    boxOff.innerHTML = '';
    var t = trainer.tonic();
    var want = trainer.want();
    var names = want.map(function (n) { return PT.noteName(n); }).join(' · ');
    var label = { scales: 'scale', chords: 'triad', sevenths: 'seventh', fifths: 'fifth' }[trainer.mode] || 'notes';
    var deg = degreeLabel();
    var bits = [t.label, label];
    if (deg) bits.push(deg);
    if (names && !trainer.hard) bits.push(names);
    $('prompt').textContent = bits.join(' · ');
  }

  function answerQuiz(opt, btn) {
    if (trainer.mode !== 'quiz' || !trainer.quiz) return;
    var ok = PT.scoreQuiz(trainer.quiz, opt).ok;
    if (btn) btn.className = ok ? 'good' : 'bad';
    trainer.answer(opt);
    persist();
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { paint(); publish(); }, ok ? 420 : 700);
  }

  function paint() {
    paintPrompt();
    paintCircle();
    paintPiano();
    [].forEach.call($('modes').querySelectorAll('button'), function (x) {
      x.classList.toggle('on', x.getAttribute('data-mode') === trainer.mode);
    });
    $('tonic').value = trainer.tonicId;
    $('hard').checked = trainer.hard;
    $('shuffle').checked = trainer.shuffle;
  }

  function down(midi) {
    if (!midi || trainer.held[midi]) return;
    Snd.attack(midi);
    var r = trainer.down(midi);
    if (firstRun) { firstRun = false; trainer.seen = true; }
    if (r.quiz && r.ok) persist();
    if (r.complete) {
      $('prompt').textContent = 'Nice. Again.';
      persist();
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(function () { paint(); publish(); }, 420);
      paintPiano();
      return;
    }
    paint();
    if (r.advanced) publish();
  }

  function up(midi) {
    if (!midi || !trainer.held[midi]) return;
    trainer.up(midi);
    Snd.release(midi);
    paintPiano();
  }

  function fillTonic() {
    var sel = $('tonic');
    sel.innerHTML = '';
    PT.TONICS.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.id; o.textContent = t.label;
      sel.appendChild(o);
    });
    sel.value = trainer.tonicId;
  }

  function setMode(mode) {
    if (PT.MODES.indexOf(mode) < 0) return;
    if (flashTimer) clearTimeout(flashTimer);
    trainer.mode = mode;
    trainer.reset();
    paint(); persist(); publish();
  }

  $('tonic').onchange = function () {
    trainer.tonicId = this.value;
    trainer.reset(); paint(); persist(); publish();
  };
  $('hard').onchange = function () { trainer.hard = this.checked; paint(); persist(); };
  $('shuffle').onchange = function () { trainer.shuffle = this.checked; trainer.reset(); paint(); persist(); };
  $('modes').onclick = function (e) {
    var b = e.target;
    if (!b.getAttribute || !b.getAttribute('data-mode')) return;
    setMode(b.getAttribute('data-mode'));
  };
  $('hearBtn').onclick = function () {
    var notes = trainer.mode === 'quiz' && trainer.quiz && trainer.quiz.notes
      ? trainer.quiz.notes
      : trainer.want();
    if (!notes.length && trainer.quiz && trainer.quiz.midi) notes = [trainer.quiz.midi];
    if (!notes.length) return;
    Snd.playList(notes, notes.length > 1 ? 0.14 : 0);
  };

  var piano = $('piano');
  piano.addEventListener('pointerdown', function (e) {
    var midi = midiFromPoint(e.clientX, e.clientY);
    if (!midi) return;
    e.preventDefault();
    try { piano.setPointerCapture(e.pointerId); } catch (err) {}
    if (pointers[e.pointerId] && pointers[e.pointerId] !== midi) up(pointers[e.pointerId]);
    pointers[e.pointerId] = midi;
    down(midi);
  });
  piano.addEventListener('pointermove', function (e) {
    if (pointers[e.pointerId] == null) return;
    var midi = midiFromPoint(e.clientX, e.clientY);
    if (!midi || midi === pointers[e.pointerId]) return;
    up(pointers[e.pointerId]);
    pointers[e.pointerId] = midi;
    down(midi);
  });
  function pointerEnd(e) {
    var midi = pointers[e.pointerId];
    if (!midi) return;
    delete pointers[e.pointerId];
    up(midi);
  }
  piano.addEventListener('pointerup', pointerEnd);
  piano.addEventListener('pointercancel', pointerEnd);
  piano.addEventListener('lostpointercapture', pointerEnd);

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (e.target && (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT')) return;
    var midi = PT.HOME[e.code];
    if (!midi) return;
    e.preventDefault();
    down(midi);
  });
  window.addEventListener('keyup', function (e) {
    var midi = PT.HOME[e.code];
    if (!midi) return;
    up(midi);
  });

  $('togetherBtn').onclick = function () {
    together = !together;
    this.classList.toggle('on', together);
    $('togetherNote').hidden = !together;
    if (together) {
      publish();
      if (roomDb && roomDb.subscribe) {
        roomDb.subscribe(function (rows) {
          var list = rows || [];
          var other = null, i;
          for (i = 0; i < list.length; i++) {
            if (list[i] && list[i].id && list[i].id !== me.id) {
              if (!other || (list[i].at || 0) > (other.at || 0)) other = list[i];
            }
          }
          var note = $('friendNote');
          if (!other) { note.hidden = true; return; }
          note.hidden = false;
          note.textContent = (other.name || 'Friend') + ' · ' + (other.mode || '') +
            (other.quizPrompt ? ' · ' + other.quizPrompt : '');
        });
      }
    } else {
      $('friendNote').hidden = true;
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

  function applyLaunch(go) {
    if (!go) return;
    if (go.mode) setMode(String(go.mode));
    if (go.key) {
      var want = String(go.key).toLowerCase();
      var hit = PT.TONICS.filter(function (t) {
        return t.id === want || t.label.toLowerCase() === want || t.id === want.replace(/\s+/g, '-');
      })[0];
      if (hit) {
        trainer.tonicId = hit.id;
        trainer.reset();
        paint(); persist();
      }
    }
  }

  function boot() {
    fillTonic();
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
        if (!rec) {
          firstRun = true;
          trainer.reset();
          paint();
          return;
        }
        PT.applySave(trainer, rec);
        firstRun = !rec.seen && !(rec.rounds | 0) && !(rec.quizAsked | 0);
        trainer.reset();
        paint();
      }).catch(function () {});
    }).then(function () {
      if (window.gifos && gifos.launch) {
        return gifos.launch().then(applyLaunch).catch(function () {});
      }
    }).then(tryMidi);
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () {
        if (together) { $('togetherBtn').onclick(); return true; }
        var coachEl = $('coach');
        if (coachEl && !coachEl.hidden) { firstRun = false; paint(); return true; }
        return false;
      });
    }
  }
  boot();
})();
