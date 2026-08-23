// Typing — practice, lessons, race a friend. Invite is OS chrome.
// History is private in the icon. Each racer writes ONLY their own row.
(function () {
  'use strict';
  var T = window.Typing;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var HISTORY_N = 20;
  var db = null;
  try { if (window.gifos) db = gifos.db('save'); } catch (e) {}

  var G = {
    screen: 'home',
    mode: 'practice',
    kind: 'english',
    lessonId: 'home',
    passage: '',
    typed: '',
    startedAt: 0,
    finishedAt: 0,
    seed: 0,
    focused: false,
    history: [],
    doneLessons: {},
    tick: 0
  };

  function setChip(cls, text) {
    $('chip').className = 'chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function show(id) {
    ['home', 'lessons', 'run', 'result', 'friend'].forEach(function (s) {
      $(s).hidden = s !== id;
    });
    G.screen = id;
  }
  function newSeed() { return (Math.random() * 0x100000000) >>> 0; }

  function paintPassage(el, passage, typed, focused) {
    var html = '', i, ch, cls, show;
    for (i = 0; i < passage.length; i++) {
      ch = passage.charAt(i);
      if (i < typed.length) {
        cls = typed.charAt(i) === ch ? 'ok' : 'bad';
      } else if (i === typed.length) {
        cls = 'caret' + (focused ? ' on' : '');
      } else {
        cls = 'todo';
      }
      show = ch === ' ' ? ' ' : ch;
      if (ch === ' ') html += '<span class="' + cls + ' sp"> </span>';
      else if (ch === '\n') html += '<span class="' + cls + '">\n</span>';
      else html += '<span class="' + cls + '">' + esc(show) + '</span>';
    }
    el.innerHTML = html;
  }

  function liveScore() {
    var ms = 0;
    if (G.startedAt) ms = (G.finishedAt || nowMs()) - G.startedAt;
    return T.score(G.passage, G.typed, ms);
  }

  function paintRun() {
    var s = liveScore();
    $('statWpm').textContent = String(Math.round(s.wpm));
    $('statAcc').textContent = String(Math.round(s.acc));
    $('statTime').textContent = T.fmtTime(G.startedAt ? (G.finishedAt || nowMs()) - G.startedAt : 0);
    paintPassage($('passage'), G.passage, G.typed, G.focused);
    $('runHint').textContent = G.focused
      ? (G.startedAt ? 'Backspace fixes a miss.' : 'Type to start the clock.')
      : 'Tap the passage to open the keyboard.';
    $('kindSeg').hidden = G.mode === 'lesson';
    $('runNew').textContent = G.mode === 'lesson' ? 'Again' : 'New';
  }

  function loadPassage() {
    G.seed = newSeed();
    G.passage = T.pickRun(G.mode, G.kind, G.lessonId, G.seed);
    G.typed = '';
    G.startedAt = 0;
    G.finishedAt = 0;
    $('kb').value = '';
    paintRun();
  }

  function finishRun() {
    if (G.finishedAt) return;
    G.finishedAt = nowMs();
    var s = liveScore();
    var title = G.mode === 'lesson'
      ? (T.lessonById(G.lessonId).name || 'Lesson')
      : (G.kind === 'code' ? 'Code' : 'English');
    var run = {
      at: G.finishedAt, wpm: T.round1(s.wpm), acc: T.round1(s.acc),
      ms: G.finishedAt - G.startedAt, errors: s.errors, chars: s.typed,
      kind: G.kind, mode: G.mode, title: title
    };
    G.history.unshift(run);
    if (G.history.length > HISTORY_N) G.history = G.history.slice(0, HISTORY_N);
    if (G.mode === 'lesson' && s.acc >= 90) G.doneLessons[G.lessonId] = true;
    savePrivate();
    $('resWpm').textContent = String(Math.round(s.wpm));
    $('resAcc').textContent = Math.round(s.acc) + '%';
    $('resMeta').textContent = T.fmtTime(run.ms) + '  ·  ' + s.errors + ' error' + (s.errors === 1 ? '' : 's') + '  ·  ' + s.typed + ' characters';
    setChip('ready', Math.round(s.wpm) + ' WPM');
    try { $('kb').blur(); } catch (e) {}
    show('result');
    stopTick();
  }

  function onTyped(v) {
    if (G.screen !== 'run' || G.finishedAt) return;
    if (v.length > G.passage.length) v = v.slice(0, G.passage.length);
    G.typed = v;
    if (!G.startedAt && v.length) {
      G.startedAt = nowMs();
      setChip('live', 'Typing');
      startTick();
    }
    paintRun();
    if (G.typed.length >= G.passage.length && G.passage.length) finishRun();
  }

  function bindInput(input, getter, setter) {
    input.addEventListener('input', function () {
      var v = input.value;
      var prev = getter();
      if (v.length === prev.length + 1 && v.slice(0, prev.length) === prev) {
        setter(v);
      } else if (v.length === prev.length - 1 && prev.slice(0, v.length) === v) {
        setter(v);
      } else if (v.length <= prev.length && prev.slice(0, v.length) === v) {
        setter(v);
      } else {
        // reject swipe-type / paste of a whole word
        input.value = prev;
      }
    });
    input.addEventListener('focus', function () {
      G.focused = true;
      if (G.screen === 'run') paintRun();
      if (G.screen === 'friend') mpPaint();
    });
    input.addEventListener('blur', function () {
      G.focused = false;
      if (G.screen === 'run') paintRun();
      if (G.screen === 'friend') mpPaint();
    });
  }

  bindInput($('kb'), function () { return G.typed; }, function (v) {
    $('kb').value = v;
    onTyped(v);
  });

  $('stage').addEventListener('click', function () { $('kb').focus(); });

  $('kindSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
    G.kind = b.getAttribute('data-kind');
    savePrivate();
    if (G.screen === 'run' && !G.startedAt) loadPassage();
  });

  function goHome() {
    stopTick();
    G.finishedAt = 0; G.startedAt = 0; G.typed = '';
    show('home');
    setChip('ready', 'Ready');
    paintHistory();
  }
  function startPractice() {
    G.mode = 'practice';
    show('run');
    setChip('ready', 'Practice');
    loadPassage();
    setTimeout(function () { $('kb').focus(); }, 50);
  }
  function startLesson(id) {
    G.mode = 'lesson';
    G.lessonId = id;
    show('run');
    setChip('ready', T.lessonById(id).name);
    loadPassage();
    setTimeout(function () { $('kb').focus(); }, 50);
  }

  $('practiceBtn').onclick = startPractice;
  $('lessonsBtn').onclick = function () { show('lessons'); paintLessons(); };
  $('lessonsBack').onclick = goHome;
  $('runBack').onclick = function () {
    if (G.mode === 'lesson') { show('lessons'); paintLessons(); setChip('ready', 'Lessons'); }
    else goHome();
  };
  $('runNew').onclick = function () { loadPassage(); $('kb').focus(); };
  $('againBtn').onclick = function () {
    show('run');
    loadPassage();
    setChip('ready', G.mode === 'lesson' ? T.lessonById(G.lessonId).name : 'Practice');
    setTimeout(function () { $('kb').focus(); }, 50);
  };
  $('resultHome').onclick = goHome;

  function paintLessons() {
    $('lessonList').innerHTML = T.LESSONS.map(function (L) {
      return '<button type="button" class="lesson' + (G.doneLessons[L.id] ? ' done' : '') + '" data-id="' + L.id + '">' +
        '<span class="name">' + esc(L.name) + '</span>' +
        '<span class="hint">' + esc(L.hint) + '</span></button>';
    }).join('');
  }
  $('lessonList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]'); if (!b) return;
    startLesson(b.getAttribute('data-id'));
  });

  function paintHistory() {
    var el = $('history');
    if (!G.history.length) {
      el.className = 'history empty';
      el.textContent = 'Finish a run and it shows up here.';
      return;
    }
    el.className = 'history';
    el.innerHTML = G.history.map(function (r) {
      return '<div class="row"><span class="wpm">' + Math.round(r.wpm) + ' WPM</span>' +
        '<span class="meta">' + Math.round(r.acc) + '%  ·  ' + esc(r.title || r.kind) + '</span></div>';
    }).join('');
  }

  function savePrivate() {
    if (!db) return;
    db.put({ id: 'history', runs: G.history.slice() }).catch(function () {});
    db.put({ id: 'prefs', kind: G.kind, doneLessons: G.doneLessons }).catch(function () {});
  }

  var tickId = 0;
  function startTick() {
    if (tickId) return;
    tickId = setInterval(function () {
      if (G.screen === 'run' && G.startedAt && !G.finishedAt) paintRun();
      if (G.screen === 'friend' && mp.startedAt && !mp.done) mpPaint();
    }, 200);
  }
  function stopTick() {
    if (tickId) { clearInterval(tickId); tickId = 0; }
  }

  // ---- multiplayer ----
  // One collection. Each person writes ONLY their own row (id = me).
  // The race row (shared passage) is written only by the host (lowest live id).
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 5000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = {
    on: false, id: null, name: 'You', row: null, race: null, people: [],
    hb: 0, sub: false, typed: '', startedAt: 0, finishedAt: 0, done: false, seq: -1
  };
  var _items = [];

  function isHost(people) {
    if (!people.length) return true;
    var m = people[0].id, i;
    for (i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function freshRace(hostId, seq) {
    var seed = newSeed();
    var kind = G.kind === 'code' ? 'code' : 'english';
    return {
      id: 'race', host: hostId, kind: kind, seed: seed,
      text: T.passage(kind, seed), seq: seq || 1, at: nowMs()
    };
  }
  function putMe(extra) {
    if (!mpDb || !mp.id) return;
    var s = T.score((mp.race && mp.race.text) || '', mp.typed,
      mp.startedAt ? ((mp.finishedAt || nowMs()) - mp.startedAt) : 0);
    var row = {
      id: mp.id, name: mp.name, at: nowMs(),
      seq: mp.race ? mp.race.seq : 0,
      n: mp.typed.length,
      wpm: T.round1(s.wpm),
      acc: T.round1(s.acc),
      done: !!mp.done,
      finishedAt: mp.finishedAt || 0
    };
    if (extra) {
      if (extra.seq != null) row.seq = extra.seq;
    }
    mp.row = row;
    mpDb.put(row).catch(function () {});
  }
  function putRace(r) { mp.race = r; mpDb.put(r).catch(function () {}); }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!mpDb) { setChip('', 'Play a friend needs storage.'); return; }
    (window.gifos ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null;
      mp.typed = ''; mp.startedAt = 0; mp.finishedAt = 0; mp.done = false; mp.seq = -1;
      $('fKb').value = '';
      show('friend');
      setChip('ready', 'A friend');
      if (!mp.sub) {
        mp.sub = true;
        mpDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpPaint();
    });
  }
  function mpLeave() {
    mp.on = false;
    stopTick();
    if (mp.hb) clearInterval(mp.hb); mp.hb = 0;
    if (mpDb && mp.id) mpDb.delete(mp.id).catch(function () {});
    goHome();
  }
  $('fLeave').onclick = mpLeave;

  function mpRefresh() {
    if (!mp.on) return;
    var t = nowMs();
    var people = [], race = null, i, it;
    for (i = 0; i < _items.length; i++) {
      it = _items[i];
      if (!it || !it.id) continue;
      if (it.id === 'race') { race = it; continue; }
      if (it.at && t - it.at < PRES_TTL) people.push(it);
    }
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: t });
    }
    mp.people = people;
    mp.race = race;
    if (!race) {
      if (isHost(people)) putRace(freshRace(mp.id, 1));
      mpPaint();
      return;
    }
    if (isHost(people)) {
      var next = mpReconcile(race, people);
      if (next) { putRace(next); return; }
    }
    if (race.seq !== mp.seq) {
      mp.seq = race.seq;
      mp.typed = ''; mp.startedAt = 0; mp.finishedAt = 0; mp.done = false;
      $('fKb').value = '';
      putMe();
    }
    mpPaint();
  }

  function mpReconcile(R, people) {
    var r = {
      id: 'race', host: mp.id, kind: R.kind, seed: R.seed,
      text: R.text, seq: R.seq, at: R.at, endedAt: R.endedAt || 0
    };
    var ch = false;
    if (r.host !== mp.id) { r.host = mp.id; ch = true; }
    if (!r.text) {
      r.text = T.passage(r.kind || 'english', r.seed || 1);
      ch = true;
    }
    var racers = people.filter(function (p) { return p.seq === r.seq; });
    var finished = racers.filter(function (p) { return p.done; });
    if (!r.endedAt) {
      if (finished.length >= 2 || (finished.length === 1 && people.length < 2 && (r.at && nowMs() - r.at > 2000))) {
        r.endedAt = nowMs();
        ch = true;
      }
    }
    if (r.endedAt && nowMs() - r.endedAt > END_HOLD) {
      var next = freshRace(mp.id, (r.seq || 1) + 1);
      return next;
    }
    return ch ? r : null;
  }

  function mpOnTyped(v) {
    if (!mp.on || !mp.race || mp.people.length < 2 || mp.done) {
      $('fKb').value = mp.typed || '';
      return;
    }
    var text = mp.race.text || '';
    if (v.length > text.length) v = v.slice(0, text.length);
    mp.typed = v;
    if (!mp.startedAt && v.length) {
      mp.startedAt = nowMs();
      setChip('live', 'Race');
      startTick();
    }
    var s = T.score(text, mp.typed, mp.startedAt ? nowMs() - mp.startedAt : 0);
    if (s.done) {
      mp.done = true;
      mp.finishedAt = nowMs();
    }
    putMe();
    mpPaint();
  }

  bindInput($('fKb'), function () { return mp.typed; }, function (v) {
    $('fKb').value = v;
    mpOnTyped(v);
  });
  $('fStage').addEventListener('click', function () {
    if (mp.people.length >= 2) $('fKb').focus();
  });

  function winnerOf(race, people) {
    if (!race) return null;
    var racers = people.filter(function (p) { return p.seq === race.seq; });
    var done = racers.filter(function (p) { return p.done; });
    if (!done.length) return null;
    if (done.length === 1 && racers.length > 1) {
      return { id: done[0].id, pending: true, wpm: done[0].wpm };
    }
    done.sort(function (a, b) {
      if ((b.wpm || 0) !== (a.wpm || 0)) return (b.wpm || 0) - (a.wpm || 0);
      return (a.finishedAt || 0) - (b.finishedAt || 0);
    });
    return { id: done[0].id, pending: false, wpm: done[0].wpm };
  }

  function mpPaint() {
    if (!mp.on) return;
    var race = mp.race, status = $('fStatus');
    var people = mp.people;
    if (!race) {
      $('fSeats').innerHTML = '';
      status.textContent = 'Setting up the passage…';
      return;
    }
    var text = race.text || '';
    var both = people.length >= 2;
    var win = winnerOf(race, people);
    $('fSeats').innerHTML = people.map(function (p) {
      var me = p.id === mp.id;
      var pct = text.length ? Math.min(100, Math.round((p.n || 0) * 100 / text.length)) : 0;
      var cls = 'seat' + (me ? ' me' : '') + (win && win.id === p.id && !win.pending ? ' won' : '');
      var prog = (p.done ? Math.round(p.wpm || 0) + ' WPM' : pct + '%') +
        (p.done ? '  ·  ' + Math.round(p.acc || 0) + '%' : '');
      return '<div class="' + cls + '"><span>' + esc(p.name || 'Player') + (me ? ' (you)' : '') +
        '</span><span class="prog">' + prog + '</span></div>';
    }).join('');

    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
      $('fHint').innerHTML = 'Press <b>Invite</b> (top bar) to bring a friend.';
    } else if (win && !win.pending) {
      var wname = people.filter(function (p) { return p.id === win.id; })[0];
      status.textContent = (wname && wname.id === mp.id ? 'You win.' : (wname ? wname.name : 'Someone') + ' wins.') +
        '  ' + Math.round(win.wpm || 0) + ' WPM. Next passage starting…';
      $('fHint').textContent = 'Higher speed wins if you both finish.';
    } else if (mp.done) {
      status.textContent = 'Done. Waiting for the other person to finish…';
      $('fHint').textContent = 'If they finish too, higher speed wins.';
    } else if (win && win.pending) {
      status.textContent = 'Someone finished. Keep going — higher speed still wins.';
      $('fHint').textContent = 'First to finish, or higher WPM if you both finish.';
    } else {
      status.textContent = 'Same passage. Type! First to finish, or higher speed if you both finish.';
      $('fHint').textContent = G.focused ? 'Backspace fixes a miss.' : 'Tap the passage to open the keyboard.';
    }

    var s = T.score(text, mp.typed, mp.startedAt ? ((mp.finishedAt || nowMs()) - mp.startedAt) : 0);
    $('fWpm').textContent = String(Math.round(s.wpm));
    $('fAcc').textContent = String(Math.round(s.acc));
    $('fTime').textContent = T.fmtTime(mp.startedAt ? ((mp.finishedAt || nowMs()) - mp.startedAt) : 0);
    paintPassage($('fPassage'), text, mp.typed, G.focused && both);
    $('fKb').readOnly = !both || mp.done;
  }

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (G.screen === 'friend') mpLeave();
    else if (G.screen === 'result') goHome();
    else if (G.screen === 'run') {
      if (G.mode === 'lesson') { show('lessons'); paintLessons(); setChip('ready', 'Lessons'); }
      else goHome();
    } else if (G.screen === 'lessons') goHome();
  });

  function applyKindSeg() {
    Array.prototype.forEach.call($('kindSeg').children, function (c) {
      c.classList.toggle('on', c.getAttribute('data-kind') === G.kind);
    });
  }

  setChip('ready', 'Ready');
  paintLessons();
  paintHistory();
  if (db) {
    Promise.all([db.get('history'), db.get('prefs')]).then(function (pair) {
      var h = pair[0], p = pair[1];
      if (h && h.runs && h.runs.length) G.history = h.runs.slice(0, HISTORY_N);
      if (p) {
        if (p.kind === 'code' || p.kind === 'english') G.kind = p.kind;
        if (p.doneLessons) G.doneLessons = p.doneLessons;
      }
      applyKindSeg();
      paintHistory();
      paintLessons();
    }).catch(function () {});
  }
})();
