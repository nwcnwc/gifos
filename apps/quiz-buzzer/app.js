// Quiz Buzzer — host puts the question up. Phones are pads. Invite is OS chrome.
// Host writes the match. Each player writes ONLY their own row.
(function () {
  'use strict';
  var QB = window.QuizBuzzer;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var PRES_TTL = 9000, HB_MS = 3000, TICK_MS = 200;
  var view = 'home';
  var prefsDb = null, matchDb = null, playersDb = null;
  try {
    if (window.gifos && gifos.db) {
      prefsDb = gifos.db('prefs');
      matchDb = gifos.db('match');
      playersDb = gifos.db('players');
    }
  } catch (e) {}

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function show(id) {
    view = id;
    ['home', 'lobby', 'custom', 'play', 'board'].forEach(function (k) {
      $(k).hidden = k !== id;
    });
  }
  function setRoleClass(role) {
    document.body.classList.remove('host', 'buzzer', 'solo');
    if (role) document.body.classList.add(role);
  }

  // ---- solo (host + player on this device) ----
  var solo = null;
  var progress = { asked: 0, correct: 0, streak: 0, best: 0, seen: {} };

  function saveProgress() {
    if (!prefsDb) return;
    prefsDb.put({
      id: 'progress',
      asked: progress.asked,
      correct: progress.correct,
      streak: progress.streak,
      best: progress.best,
      seen: progress.seen,
      at: nowMs()
    }).catch(function () {});
  }
  function saveSolo() {
    if (!prefsDb || !solo) return;
    prefsDb.put({
      id: 'solo',
      order: solo.order,
      pos: solo.pos,
      score: solo.score,
      phase: solo.phase,
      qid: solo.q ? solo.q.id : null,
      startedAt: solo.startedAt,
      deadline: solo.deadline,
      choice: solo.choice,
      buzzAt: solo.buzzAt,
      seconds: solo.seconds
    }).catch(function () {});
  }

  function startSolo(resume) {
    mp.on = false;
    if (!resume) {
      solo = {
        order: QB.shuffledOrder(QB.PACK.length, nowMs()),
        pos: 0, score: 0, phase: 'live', q: null,
        startedAt: 0, deadline: 0, choice: null, buzzAt: 0, seconds: 12
      };
    }
    dealSolo();
    show('play');
    setRoleClass('solo');
    setChip('live', 'Solo');
    renderPlay();
  }
  function dealSolo() {
    if (!solo) return;
    if (solo.pos >= solo.order.length) {
      solo.phase = 'board';
      solo.q = null;
      saveSolo();
      renderBoard();
      show('board');
      setRoleClass('solo');
      setChip('win', 'Round over');
      return;
    }
    solo.q = QB.PACK[solo.order[solo.pos]];
    solo.phase = 'live';
    solo.choice = null;
    solo.buzzAt = 0;
    solo.startedAt = nowMs();
    solo.deadline = solo.startedAt + solo.seconds * 1000;
    saveSolo();
  }
  function soloBuzz(choice) {
    if (!solo || solo.phase !== 'live' || solo.choice != null) return;
    solo.choice = choice;
    solo.buzzAt = nowMs();
    soloReveal();
  }
  function soloReveal() {
    if (!solo || !solo.q || solo.phase !== 'live') return;
    var t = nowMs();
    if (t < solo.deadline && solo.choice == null) return;
    solo.phase = 'revealed';
    var scored = QB.scoreQuestion({
      startedAt: solo.startedAt,
      deadline: solo.deadline,
      revealedAt: t,
      answer: solo.q.answer
    }, solo.choice == null ? [] : [{ id: 'local', name: 'You', choice: solo.choice, at: solo.buzzAt }]);
    solo.winner = scored.winner;
    solo.results = scored.results;
    progress.asked++;
    progress.seen[solo.q.id] = 1;
    if (scored.winner) {
      solo.score++;
      progress.correct++;
      progress.streak++;
      if (progress.streak > progress.best) progress.best = progress.streak;
    } else {
      progress.streak = 0;
    }
    saveProgress();
    saveSolo();
    renderPlay();
  }
  function soloNext() {
    if (!solo) return;
    solo.pos++;
    dealSolo();
    if (solo && solo.phase === 'live') {
      show('play');
      setRoleClass('solo');
      renderPlay();
    }
  }

  $('soloBtn').onclick = function () { startSolo(false); };

  // ---- multiplayer ----
  var mp = {
    on: false, id: null, name: 'You', row: null,
    people: [], hb: 0, sub: false, tick: 0,
    choice: null, buzzAt: 0, round: 0, seconds: 15, correctA: 0
  };
  var match = null;
  var _matchItems = [];
  var _playerItems = [];
  var liveAnswer = null;

  function livePeople(items, t) {
    t = t || nowMs();
    var out = [], i, it;
    for (i = 0; i < (items || []).length; i++) {
      it = items[i];
      if (!it || !it.id) continue;
      if (it.at && t - it.at >= PRES_TTL) continue;
      out.push(it);
    }
    return out;
  }
  function isHost(people) {
    people = people || mp.people;
    if (match && match.host) {
      var i, alive = false;
      for (i = 0; i < people.length; i++) if (people[i].id === match.host) alive = true;
      if (alive) return mp.id === match.host;
    }
    if (!people.length) return true;
    var m = people[0].id;
    for (i = 1; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function putMe(extra) {
    if (!playersDb || !mp.id) return;
    var row = {
      id: mp.id,
      name: mp.name,
      at: nowMs(),
      round: mp.round,
      choice: mp.choice,
      buzzAt: mp.buzzAt || 0,
      role: isHost() ? 'host' : 'buzzer'
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { row[k] = extra[k]; });
    }
    mp.row = row;
    playersDb.put(row).catch(function () {});
  }
  function putMatch(m) {
    match = m;
    if (!matchDb) return;
    matchDb.put(m).catch(function () {});
  }
  function saveLiveKey(round, answer, qid) {
    liveAnswer = answer;
    if (!prefsDb) return;
    prefsDb.put({ id: 'live', round: round, answer: answer, qid: qid || null }).catch(function () {});
  }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!matchDb || !playersDb) {
      $('homeNote').textContent = 'Play with friends needs a GifOS room. The pack still works on this device.';
      return;
    }
    (window.gifos && gifos.me ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = (me && me.id) || 'local';
      mp.name = (me && me.name) || 'You';
      mp.on = true;
      mp.row = null;
      mp.choice = null;
      mp.buzzAt = 0;
      mp.round = 0;
      solo = null;
      show('lobby');
      setRoleClass('buzzer');
      setChip('ready', 'A room');
      if (!mp.sub) {
        mp.sub = true;
        playersDb.subscribe(function (items) { _playerItems = items || []; mpRefresh(); });
        matchDb.subscribe(function (items) { _matchItems = items || []; mpRefresh(); });
      }
      putMe({ round: 0, choice: null, buzzAt: 0 });
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRefresh();
    }).catch(function () {});
  }
  function mpLeave() {
    mp.on = false;
    if (mp.hb) { clearInterval(mp.hb); mp.hb = 0; }
    if (playersDb && mp.id) playersDb.delete(mp.id).catch(function () {});
    match = null;
    liveAnswer = null;
    show('home');
    setRoleClass('');
    setChip('', 'Ready');
  }
  $('lobbyLeave').onclick = mpLeave;
  $('playLeave').onclick = function () {
    if (mp.on) mpLeave();
    else { solo = null; show('home'); setRoleClass(''); setChip('', 'Ready'); }
  };
  $('boardLeave').onclick = function () {
    if (mp.on) mpLeave();
    else { solo = null; show('home'); setRoleClass(''); setChip('', 'Ready'); }
  };

  $('secSeg').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    mp.seconds = parseInt(b.getAttribute('data-sec'), 10) || 15;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
  });
  $('cansSeg').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    mp.correctA = parseInt(b.getAttribute('data-a'), 10) || 0;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
  });

  function namesOf(people) {
    var n = {}, i, p;
    if (match && match.names) {
      Object.keys(match.names).forEach(function (k) { n[k] = match.names[k]; });
    }
    for (i = 0; i < people.length; i++) {
      p = people[i];
      n[p.id] = p.name || n[p.id] || 'Player';
    }
    n[mp.id] = mp.name;
    return n;
  }
  function scoresOf() {
    return (match && match.scores) ? Object.assign({}, match.scores) : {};
  }

  function hostStart(q, qid) {
    if (!mp.on || !isHost()) return;
    var people = mp.people;
    if (people.length < 2) return;
    var order = (match && match.packOrder && match.packOrder.length)
      ? match.packOrder
      : QB.shuffledOrder(QB.PACK.length, nowMs());
    var pos = match && typeof match.packPos === 'number' ? match.packPos : 0;
    var round = ((match && match.round) || 0) + 1;
    var t = nowMs();
    saveLiveKey(round, q.answer, qid);
    mp.round = round;
    mp.choice = null;
    mp.buzzAt = 0;
    putMatch({
      id: 'm',
      host: mp.id,
      phase: 'live',
      round: round,
      prompt: q.q,
      choices: q.choices.slice(),
      cat: q.cat || 'custom',
      qid: qid || null,
      startedAt: t,
      deadline: t + mp.seconds * 1000,
      seconds: mp.seconds,
      revealedAt: 0,
      answer: null,
      winner: null,
      results: null,
      scores: scoresOf(),
      names: namesOf(people),
      packOrder: order,
      packPos: pos
    });
    putMe({ round: round, choice: null, buzzAt: 0, role: 'host' });
  }

  $('startPackBtn').onclick = function () {
    if (!isHost()) return;
    var order = (match && match.packOrder && match.packOrder.length)
      ? match.packOrder
      : QB.shuffledOrder(QB.PACK.length, nowMs());
    var pos = match && typeof match.packPos === 'number' ? match.packPos : 0;
    if (match && match.phase === 'lobby') pos = 0;
    if (pos >= order.length) {
      hostBoard();
      return;
    }
    if (!match) {
      match = {
        id: 'm', host: mp.id, phase: 'lobby', round: 0,
        scores: {}, names: namesOf(mp.people),
        packOrder: order, packPos: 0, seconds: mp.seconds
      };
    }
    match.packOrder = order;
    match.packPos = pos;
    hostStart(QB.PACK[order[pos]], QB.PACK[order[pos]].id);
  };
  $('customBtn').onclick = function () {
    if (!isHost()) return;
    show('custom');
  };
  $('customBack').onclick = function () { show('lobby'); mpRefresh(); };
  $('customStart').onclick = function () {
    if (!isHost()) return;
    var prompt = ($('cq').value || '').trim();
    var choices = [
      ($('ca0').value || '').trim(),
      ($('ca1').value || '').trim(),
      ($('ca2').value || '').trim(),
      ($('ca3').value || '').trim()
    ];
    if (!prompt || !choices[0] || !choices[1] || !choices[2] || !choices[3]) return;
    hostStart({ q: prompt, choices: choices, cat: 'custom', answer: mp.correctA }, 'custom');
  };

  function hostReveal() {
    if (!mp.on || !isHost() || !match || match.phase !== 'live') return;
    var t = nowMs();
    var answer = liveAnswer;
    if (answer == null && match.qid && match.qid !== 'custom') {
      var q = QB.byId(match.qid);
      if (q) answer = q.answer;
    }
    if (answer == null) return;
    match.phase = 'revealed';
    var buzzes = [], i, p;
    for (i = 0; i < mp.people.length; i++) {
      p = mp.people[i];
      if (p.id === match.host) continue;
      if ((p.round || 0) !== match.round) continue;
      if (typeof p.choice !== 'number') continue;
      buzzes.push({ id: p.id, name: p.name || 'Player', choice: p.choice, at: p.buzzAt || 0 });
    }
    var scored = QB.scoreQuestion({
      startedAt: match.startedAt,
      deadline: match.deadline,
      revealedAt: t,
      answer: answer
    }, buzzes);
    var scores = scoresOf();
    if (scored.winner) scores[scored.winner.id] = (scores[scored.winner.id] || 0) + 1;
    putMatch({
      id: 'm',
      host: mp.id,
      phase: 'revealed',
      round: match.round,
      prompt: match.prompt,
      choices: match.choices,
      cat: match.cat,
      qid: match.qid,
      startedAt: match.startedAt,
      deadline: match.deadline,
      seconds: match.seconds,
      revealedAt: t,
      answer: answer,
      winner: scored.winner,
      results: scored.results,
      scores: scores,
      names: namesOf(mp.people),
      packOrder: match.packOrder || [],
      packPos: match.packPos || 0
    });
  }
  function hostNext() {
    if (!isHost() || !match) return;
    var order = match.packOrder || [];
    var pos = (match.packPos || 0) + 1;
    match.packPos = pos;
    if (!order.length || pos >= order.length) {
      hostBoard();
      return;
    }
    hostStart(QB.PACK[order[pos]], QB.PACK[order[pos]].id);
  }
  function hostBoard() {
    if (!isHost()) return;
    putMatch({
      id: 'm',
      host: mp.id,
      phase: 'board',
      round: (match && match.round) || 0,
      scores: scoresOf(),
      names: namesOf(mp.people),
      packOrder: (match && match.packOrder) || [],
      packPos: (match && match.packPos) || 0,
      seconds: mp.seconds
    });
  }
  $('revealBtn').onclick = hostReveal;
  $('nextBtn').onclick = function () {
    if (solo) soloNext();
    else hostNext();
  };
  $('endBtn').onclick = hostBoard;
  $('againBtn').onclick = function () {
    if (solo) { startSolo(false); return; }
    if (!isHost()) return;
    mp.choice = null;
    mp.buzzAt = 0;
    putMatch({
      id: 'm', host: mp.id, phase: 'lobby', round: 0,
      scores: {}, names: namesOf(mp.people),
      packOrder: QB.shuffledOrder(QB.PACK.length, nowMs()), packPos: 0,
      seconds: mp.seconds
    });
    show('lobby');
  };

  function mpBuzz(choice) {
    if (!mp.on || !match || match.phase !== 'live') return;
    if (isHost()) return;
    if (mp.round !== match.round) return;
    if (mp.choice != null) return;
    var t = nowMs();
    if (t < match.startedAt || t > match.deadline) return;
    mp.choice = choice;
    mp.buzzAt = t;
    putMe({ round: match.round, choice: choice, buzzAt: t, role: 'buzzer' });
    renderPlay();
  }

  function ensureMatch(people) {
    if (match && match.id === 'm') {
      if (isHost(people) && match.host !== mp.id) {
        match.host = mp.id;
        putMatch(match);
      }
      return;
    }
    if (!isHost(people)) return;
    putMatch({
      id: 'm', host: mp.id, phase: 'lobby', round: 0,
      scores: {}, names: namesOf(people),
      packOrder: [], packPos: 0, seconds: mp.seconds
    });
  }

  function mpRefresh() {
    if (!mp.on) return;
    var people = livePeople(_playerItems);
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: nowMs() });
    }
    mp.people = people;
    var m = null, i, it;
    for (i = 0; i < _matchItems.length; i++) {
      it = _matchItems[i];
      if (it && it.id === 'm') m = it;
    }
    match = m;
    ensureMatch(people);

    if (match && match.round && match.round !== mp.round) {
      mp.round = match.round;
      mp.choice = null;
      mp.buzzAt = 0;
      putMe({ round: match.round, choice: null, buzzAt: 0 });
    }
    if (match && match.phase === 'live' && isHost() && nowMs() >= match.deadline) {
      hostReveal();
      return;
    }

    if (match && match.phase === 'board') {
      renderBoard();
      show('board');
      setRoleClass(isHost() ? 'host' : 'buzzer');
      setChip('win', 'Board');
      return;
    }
    if (match && (match.phase === 'live' || match.phase === 'revealed')) {
      show('play');
      setRoleClass(isHost() ? 'host' : 'buzzer');
      renderPlay();
      return;
    }
    if (view === 'custom' && isHost()) return;
    renderLobby(people);
    show('lobby');
    setRoleClass(isHost() ? 'host' : 'buzzer');
  }

  function renderLobby(people) {
    var html = '', i, p, host = isHost(people);
    people = people.slice().sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    for (i = 0; i < people.length; i++) {
      p = people[i];
      html += '<li class="' + (p.id === mp.id ? 'me' : '') + '"><span>' +
        esc(p.id === mp.id ? 'You' : (p.name || 'Player')) + '</span>' +
        (host && p.id === mp.id ? '<span class="meta">hosts</span>' : '') + '</li>';
    }
    $('lobbyList').innerHTML = html || '<li><span>Just you so far</span></li>';
    $('hostSetup').hidden = !host;
    $('startPackBtn').disabled = people.length < 2;
    if (people.length < 2) {
      $('lobbyStatus').textContent = 'Waiting for friends… press Invite in the GifOS menu to send the link.';
    } else if (host) {
      $('lobbyStatus').textContent = people.length + ' here. Start when you are ready.';
    } else {
      $('lobbyStatus').textContent = people.length + ' here. Waiting for the host to start.';
    }
    setChip('ready', people.length + ' here');
  }

  function remaining() {
    var m = solo || match;
    if (!m || !m.deadline) return 0;
    return Math.max(0, Math.ceil((m.deadline - nowMs()) / 1000));
  }

  function paintPads(choices, opts) {
    opts = opts || {};
    var html = '', i, cls, locked, mark;
    for (i = 0; i < 4; i++) {
      cls = 'pad c' + i;
      locked = opts.locked === i;
      mark = '';
      if (opts.revealed) {
        if (i === opts.answer) cls += ' correct';
        else if (locked) cls += ' miss';
        else cls += ' miss';
      } else if (locked) cls += ' locked';
      html += '<button type="button" class="' + cls + '" data-i="' + i + '"' +
        (opts.disabled ? ' disabled' : '') + '>' +
        '<span class="glyph">' + QB.SHAPES[i] + '</span>' +
        '<span class="txt">' + esc(choices[i] || '') + '</span></button>';
    }
    $('pads').innerHTML = html;
  }

  if ($('pads')) {
    $('pads').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-i]') : null;
      if (!b || b.disabled) return;
      var i = parseInt(b.getAttribute('data-i'), 10);
      if (solo) soloBuzz(i);
      else mpBuzz(i);
    });
  }

  function renderPlay() {
    var host = mp.on && isHost();
    var live = solo ? solo : match;
    if (!live) return;
    var phase = live.phase;
    var choices = live.q ? live.q.choices : (live.choices || []);
    var prompt = live.q ? live.q.q : (live.prompt || '');
    var cat = live.q ? live.q.cat : (live.cat || '');
    var answer = live.q ? live.q.answer : live.answer;
    var myChoice = solo ? solo.choice : mp.choice;
    $('catChip').textContent = QB.CAT_LABEL[cat] || cat || 'Quiz';
    $('prompt').textContent = prompt;
    var left = remaining();
    $('clock').textContent = phase === 'live' ? String(left) : '—';
    $('clock').className = 'clock' + (phase === 'live' && left <= 5 ? ' low' : '');

    var disabled = phase !== 'live' || host || myChoice != null;
    paintPads(choices, {
      locked: myChoice,
      revealed: phase === 'revealed',
      answer: answer,
      disabled: disabled || host
    });

    var status = $('playStatus');
    var buzzed = $('buzzed');
    buzzed.innerHTML = '';
    $('hostBar').hidden = !(mp.on && host);
    $('revealBtn').hidden = !(mp.on && host && phase === 'live');
    $('nextBtn').hidden = !(mp.on && host && phase === 'revealed');
    $('endBtn').hidden = !(mp.on && host && phase === 'revealed');

    if (phase === 'live') {
      if (solo) {
        status.textContent = myChoice == null ? 'Tap an answer. Faster is better.' : 'Locked in.';
        status.className = 'statusline';
        setChip('live', 'Solo');
      } else if (host) {
        var n = 0, i, p;
        for (i = 0; i < mp.people.length; i++) {
          p = mp.people[i];
          if (p.id === mp.id) continue;
          var in_ = ((p.round || 0) === live.round) && typeof p.choice === 'number';
          if (in_) n++;
          buzzed.innerHTML += '<li class="' + (in_ ? 'in' : '') + '"><span>' +
            esc(p.name || 'Player') + '</span><span class="meta">' +
            (in_ ? 'in' : '…') + '</span></li>';
        }
        status.textContent = n ? (n + ' in. First correct will score.') : 'Waiting for buzzes.';
        status.className = 'statusline';
        setChip('live', 'Live');
      } else {
        status.textContent = myChoice == null
          ? 'Tap an answer. First correct scores.'
          : 'Locked in. Waiting for the host.';
        status.className = 'statusline';
        setChip('live', myChoice == null ? 'Buzz' : 'Locked');
      }
    } else if (phase === 'revealed') {
      var w = live.winner;
      var got = solo ? !!w : (w && w.id === mp.id);
      if (solo) {
        status.textContent = w ? 'Correct — you scored.' : (myChoice == null ? 'Time. Nobody scored.' : 'Not this one.');
        status.className = 'statusline ' + (w ? 'good' : 'warn');
        $('hostBar').hidden = false;
        $('revealBtn').hidden = true;
        $('nextBtn').hidden = false;
        $('endBtn').hidden = true;
        setChip(w ? 'win' : '', 'Solo ' + solo.score);
      } else {
        var line = w
          ? ((w.id === mp.id ? 'You' : (w.name || 'They')) + ' got it first.')
          : 'Nobody got it.';
        status.textContent = line;
        status.className = 'statusline ' + (got ? 'good' : '');
        var res = live.results || [];
        for (i = 0; i < res.length; i++) {
          p = res[i];
          var mark = p.score ? 'first' : (p.late ? 'late' : (p.correct ? 'correct, later' : 'wrong'));
          buzzed.innerHTML += '<li class="' + (p.score ? 'in' : '') + (p.id === mp.id ? ' me' : '') +
            '"><span>' + esc(p.id === mp.id ? 'You' : p.name) + '</span><span class="meta">' +
            esc(mark) + '</span></li>';
        }
        setChip(w ? 'win' : 'ready', 'Revealed');
      }
    }
  }

  function ranked() {
    var scores = solo ? { local: solo.score } : scoresOf();
    var names = solo ? { local: 'You' } : ((match && match.names) || {});
    var ids = Object.keys(scores);
    var i, p;
    if (mp.on) {
      for (i = 0; i < mp.people.length; i++) {
        p = mp.people[i];
        if (p.id === (match && match.host)) continue;
        if (ids.indexOf(p.id) < 0) ids.push(p.id);
        names[p.id] = p.name || names[p.id] || 'Player';
      }
    }
    ids.sort(function (a, b) {
      var da = scores[a] || 0, db = scores[b] || 0;
      if (db !== da) return db - da;
      return a < b ? -1 : 1;
    });
    return ids.map(function (id) {
      return { id: id, name: id === 'local' || id === mp.id ? 'You' : (names[id] || 'Player'), score: scores[id] || 0 };
    });
  }
  function renderBoard() {
    var rows = ranked();
    var html = '', i, r;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      html += '<li class="' + (i === 0 && r.score ? 'win' : '') + (r.id === mp.id || r.id === 'local' ? ' me' : '') +
        '"><span>' + esc(r.name) + '</span><span class="meta">' + r.score + '</span></li>';
    }
    $('boardList').innerHTML = html || '<li><span>No scores yet</span></li>';
    if (solo) {
      $('boardStatus').textContent = 'Pack done. ' + progress.correct + ' correct of ' + progress.asked +
        '. Best streak ' + progress.best + '.';
      $('againBtn').hidden = false;
      $('againBtn').textContent = 'Drill again';
    } else {
      $('boardStatus').textContent = isHost()
        ? 'New round shuffles the pack.'
        : 'Waiting for the host.';
      $('againBtn').hidden = !isHost();
      $('againBtn').textContent = 'New round';
    }
  }

  function tick() {
    if (view !== 'play') return;
    if (solo && solo.phase === 'live' && nowMs() >= solo.deadline) {
      soloReveal();
      return;
    }
    if (mp.on && match && match.phase === 'live') {
      if (isHost() && nowMs() >= match.deadline) { hostReveal(); return; }
      var left = remaining();
      $('clock').textContent = String(left);
      $('clock').className = 'clock' + (left <= 5 ? ' low' : '');
    } else if (solo && solo.phase === 'live') {
      left = remaining();
      $('clock').textContent = String(left);
      $('clock').className = 'clock' + (left <= 5 ? ' low' : '');
    }
  }

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (view === 'custom') { show('lobby'); mpRefresh(); return true; }
      if (view === 'play' || view === 'board' || view === 'lobby') {
        if (mp.on) mpLeave();
        else { solo = null; show('home'); setRoleClass(''); setChip('', 'Ready'); }
        return true;
      }
      return false;
    });
  }

  setChip('ready', 'Ready');
  if (!matchDb) {
    $('homeNote').textContent = 'Solo works on this device. Play with friends needs a GifOS room.';
  }
  if (prefsDb) {
    prefsDb.getAll().then(function (rows) {
      var by = {}, i;
      (rows || []).forEach(function (r) { if (r && r.id) by[r.id] = r; });
      if (by.progress) {
        progress.asked = by.progress.asked || 0;
        progress.correct = by.progress.correct || 0;
        progress.streak = by.progress.streak || 0;
        progress.best = by.progress.best || 0;
        progress.seen = by.progress.seen || {};
      }
      if (by.live && typeof by.live.answer === 'number') {
        liveAnswer = by.live.answer;
      }
    }).catch(function () {});
  }
  mp.tick = setInterval(tick, TICK_MS);
})();
