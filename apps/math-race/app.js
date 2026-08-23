/*
 * Math Race — classic-script port of iloire/math-race.
 *
 * Upstream is Node + knockout + a socket.io game server. GifOS drops
 * type=module and the sandbox has nowhere to fetch a server from, so this
 * file is ordinary classic JS: same race (first correct scores, next
 * equation immediately), a local clock for practice, and a friend mode
 * where the host (lowest live id) is the clock and the only writer of
 * the match row. Players publish an answer; the host applies it if it
 * is first and legal. Invite is OS chrome — this app does not draw an
 * invite button.
 */
(function () {
  'use strict';
  var R = window.MathRace;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var PRES_TTL = 9000, HB_MS = 3000, TICK_MS = 250, FLASH_MS = 420;
  var MAX_CHARS = 5, HISTORY_N = 8;

  var api = typeof gifos !== 'undefined' ? gifos : null;
  var saveDb = null, matchDb = null, playersDb = null;
  try {
    if (api && api.db) {
      saveDb = api.db('save');
      matchDb = api.db('match');
      playersDb = api.db('players');
    }
  } catch (e) {}

  var setup = { duration: 60, difficulty: 'easy' };
  var best = {};
  var history = [];

  var view = 'setup';
  var solo = null;
  var typed = '';
  var flashTimer = 0;
  var tickTimer = 0;
  var padBuilt = false;
  var seenQ = -1;

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function show(id) {
    view = id;
    $('setup').hidden = id !== 'setup';
    $('game').hidden = id !== 'game';
    $('friend').hidden = id !== 'friend';
  }
  function fmtTime(sec) {
    sec = Math.max(0, sec | 0);
    var m = (sec / 60) | 0, s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function remainingOf(endsAt, now) {
    return Math.max(0, Math.ceil((endsAt - now) / 1000));
  }

  function setSeg(root, attr, value) {
    var btns = root.querySelectorAll('button');
    var i, b;
    for (i = 0; i < btns.length; i++) {
      b = btns[i];
      b.className = b.getAttribute(attr) === String(value) ? 'on' : '';
    }
  }
  function bindSeg(id, attr, apply) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : e.target;
      if (!b || !b.getAttribute(attr)) return;
      apply(b.getAttribute(attr));
    });
  }

  function renderBest() {
    var key = R.bestKey(setup.difficulty, setup.duration);
    var n = best[key];
    var where = saveDb ? 'Saved on this device, inside the file.' : 'This visit only (open in GifOS to keep a best).';
    if (n == null) $('bestLine').textContent = 'No best yet for this setting. ' + where;
    else $('bestLine').textContent = 'Best ' + n + ' in ' + setup.duration + 's. ' + where;
  }
  function persistSave() {
    if (!saveDb) return;
    saveDb.put({
      id: 'prefs',
      duration: setup.duration,
      difficulty: setup.difficulty,
      best: best,
      history: history.slice(0, HISTORY_N)
    }).catch(function () {});
  }
  function maybeBest(score) {
    var key = R.bestKey(setup.difficulty, setup.duration);
    if (typeof score !== 'number') return false;
    if (best[key] == null || score > best[key]) {
      best[key] = score;
      persistSave();
      return true;
    }
    return false;
  }

  bindSeg('durSeg', 'data-dur', function (v) {
    setup.duration = parseInt(v, 10) || 60;
    setSeg($('durSeg'), 'data-dur', setup.duration);
    persistSave();
    renderBest();
  });
  bindSeg('diffSeg', 'data-diff', function (v) {
    setup.difficulty = v === 'medium' || v === 'hard' ? v : 'easy';
    setSeg($('diffSeg'), 'data-diff', setup.difficulty);
    persistSave();
    renderBest();
  });

  function buildPad() {
    if (padBuilt) return;
    padBuilt = true;
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '\u2212', '0', '⌫', 'GO'];
    var root = $('pad');
    keys.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = k;
      if (k === 'GO') b.className = 'go';
      else if (k === '⌫' || k === '\u2212') b.className = 'ghosty';
      b.setAttribute('data-k', k);
      b.addEventListener('click', function () { handleKey(k); });
      root.appendChild(b);
    });
  }

  function setTyped(s) {
    typed = s;
    var el = $('answer');
    if (!typed) {
      el.textContent = '\u00a0';
      el.className = 'answer empty';
    } else {
      el.textContent = typed;
      el.className = 'answer';
    }
  }
  function flash(kind, msg, cls) {
    var wrap = $('eqWrap');
    wrap.className = 'eqwrap' + (kind ? ' ' + kind : '');
    var st = $('statusLine');
    st.textContent = msg || '';
    st.className = 'statusline' + (cls ? ' ' + cls : '');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      wrap.className = 'eqwrap';
      if (view === 'game' && (solo && solo.phase === 'playing' || (mp.on && mp.match && mp.match.phase === 'playing'))) {
        if (st.textContent === msg) { st.textContent = ''; st.className = 'statusline'; }
      }
    }, FLASH_MS);
  }

  function currentEq() {
    if (solo) return solo.eq;
    if (mp.on && mp.match && mp.match.phase === 'playing') return R.unpackEq(mp.match.eq);
    return null;
  }
  function canAnswer() {
    if (view !== 'game') return false;
    if (solo) return solo.phase === 'playing';
    if (mp.on && mp.match && mp.match.phase === 'playing') {
      return remainingOf(mp.match.endsAt, nowMs()) > 0;
    }
    return false;
  }

  function handleKey(k) {
    if (k === 'GO' || k === 'Enter') { submit(); return; }
    if (!canAnswer()) return;
    if (k === '⌫' || k === 'Backspace') {
      setTyped(typed.slice(0, -1));
      return;
    }
    if (k === '\u2212' || k === '-') {
      if (!typed) setTyped('-');
      return;
    }
    if (k.length === 1 && k >= '0' && k <= '9') {
      var next = typed + k;
      if (next.length > MAX_CHARS) return;
      setTyped(next);
    }
  }

  function submit() {
    if (!canAnswer()) return;
    var n = R.parseAnswer(typed);
    if (n == null) return;
    if (solo) {
      submitSolo(n);
      return;
    }
    submitMp(n);
  }

  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }
  function startTick(fn) {
    stopTick();
    tickTimer = setInterval(fn, TICK_MS);
  }

  function paintClock(sec, playing) {
    var el = $('clock');
    el.textContent = fmtTime(sec);
    el.className = 'clock' + (playing && sec <= 10 ? ' low' : '');
    if (playing) setChip(sec <= 10 ? 'warn' : 'play', fmtTime(sec) + ' left');
  }

  function paintScores(rows, meId) {
    var list = $('scoreList');
    if (!rows || !rows.length) { list.hidden = true; list.innerHTML = ''; return; }
    list.hidden = false;
    rows.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
    list.innerHTML = rows.map(function (r) {
      var mine = r.id === meId ? ' me' : '';
      var label = r.id === meId ? 'You' : esc(r.name || 'Player');
      return '<li class="' + mine + '"><span>' + label + '</span><b>' + (r.score || 0) + '</b></li>';
    }).join('');
  }

  function paintEquation(eq) {
    $('equation').textContent = eq ? eq.display : '—';
  }

  function paintGame() {
    buildPad();
    if (solo) {
      $('score').textContent = String(solo.score);
      paintEquation(solo.eq);
      paintClock(solo.phase === 'playing' ? remainingOf(solo.endsAt, nowMs()) : 0, solo.phase === 'playing');
      paintScores(null);
      if (solo.phase === 'ended') {
        var beat = solo.beat;
        $('statusLine').className = 'statusline' + (beat ? ' good' : '');
        $('statusLine').textContent = beat
          ? ('Time. New best — ' + solo.score + '.')
          : ('Time. Score ' + solo.score + '.');
        setChip('ready', 'Time');
      }
      return;
    }
    if (mp.on && mp.match) {
      var m = mp.match;
      var myScore = (m.scores && m.scores[mp.id]) || 0;
      $('score').textContent = String(myScore);
      var eq = R.unpackEq(m.eq);
      paintEquation(m.phase === 'playing' || m.phase === 'ended' ? eq : null);
      var rem = m.phase === 'playing' ? remainingOf(m.endsAt, nowMs()) : (m.remaining || 0);
      paintClock(rem, m.phase === 'playing');
      var rows = [];
      var id;
      for (id in (m.names || {})) {
        if (!Object.prototype.hasOwnProperty.call(m.names, id)) continue;
        rows.push({ id: id, name: m.names[id], score: (m.scores && m.scores[id]) || 0 });
      }
      mp.people.forEach(function (p) {
        if (!rows.some(function (r) { return r.id === p.id; })) {
          rows.push({ id: p.id, name: p.name, score: (m.scores && m.scores[p.id]) || 0 });
        }
      });
      paintScores(rows, mp.id);
      if (m.phase === 'ended') {
        var top = rows.slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); })[0];
        var win = top && rows.filter(function (r) { return r.score === top.score; }).length === 1;
        var mineWin = win && top && top.id === mp.id;
        $('statusLine').className = 'statusline' + (mineWin ? ' good' : '');
        $('statusLine').textContent = mineWin
          ? ('Time. You win with ' + myScore + '.')
          : (top ? ('Time. ' + (top.id === mp.id ? 'You' : (top.name || 'They')) + ' ' + top.score + '.') : 'Time.');
        setChip('ready', 'Time');
      } else if (m.phase === 'playing') {
        if (m.q !== seenQ) {
          seenQ = m.q;
          setTyped('');
          if (m.lastWinner && m.lastWinner.id && m.lastWinner.id !== mp.id) {
            flash('good', (m.lastWinner.name || 'They') + ' scored — next.', 'good');
          }
        }
      }
    }
  }

  // ---- solo ----
  function startSolo() {
    mp.on = false;
    var dur = setup.duration;
    var now = nowMs();
    solo = {
      phase: 'playing',
      difficulty: setup.difficulty,
      duration: dur,
      score: 0,
      eq: R.make(setup.difficulty),
      startedAt: now,
      endsAt: now + dur * 1000,
      beat: false
    };
    setTyped('');
    $('statusLine').textContent = '';
    $('statusLine').className = 'statusline';
    $('eqWrap').className = 'eqwrap';
    show('game');
    paintGame();
    startTick(tickSolo);
  }
  function tickSolo() {
    if (!solo || solo.phase !== 'playing') return;
    var rem = remainingOf(solo.endsAt, nowMs());
    paintClock(rem, true);
    if (rem <= 0) endSolo();
  }
  function submitSolo(n) {
    if (!solo || solo.phase !== 'playing') return;
    if (R.isCorrect(solo.eq, n)) {
      solo.score += 1;
      solo.eq = R.make(solo.difficulty);
      setTyped('');
      flash('good', 'Yes — next.', 'good');
      paintGame();
    } else {
      setTyped('');
      flash('bad', 'Nope — same equation.', 'warn');
    }
  }
  function endSolo() {
    if (!solo || solo.phase === 'ended') return;
    solo.phase = 'ended';
    solo.beat = maybeBest(solo.score);
    history.unshift({
      at: nowMs(),
      score: solo.score,
      duration: solo.duration,
      difficulty: solo.difficulty,
      vs: 'solo'
    });
    history = history.slice(0, HISTORY_N);
    persistSave();
    stopTick();
    paintGame();
    renderBest();
  }

  $('soloBtn').onclick = startSolo;
  $('backBtn').onclick = function () {
    stopTick();
    if (mp.on) {
      show('friend');
      setChip('ready', 'A friend');
      mpRenderLobby();
      return;
    }
    solo = null;
    show('setup');
    setChip('ready', 'Ready');
    renderBest();
  };

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (view !== 'game') return;
    if (e.key === 'Backspace') { handleKey('Backspace'); e.preventDefault(); return; }
    if (e.key === 'Enter') { handleKey('Enter'); e.preventDefault(); return; }
    if (e.key === '-' || e.key === '\u2212') { handleKey('-'); e.preventDefault(); return; }
    if (e.key.length === 1 && e.key >= '0' && e.key <= '9') { handleKey(e.key); e.preventDefault(); }
  });

  // ---- multiplayer ----
  // match row: host only. players row: id = me.id only.
  var mp = {
    on: false, id: null, name: 'You', row: null, match: null, people: [],
    hb: 0, sub: false, duration: 60, difficulty: 'easy'
  };
  var _matchItems = [], _playerItems = [];

  function isHost(people) {
    var list = people && people.length ? people : [{ id: mp.id }];
    var m = list[0].id, i;
    for (i = 0; i < list.length; i++) if (list[i].id < m) m = list[i].id;
    return mp.id === m;
  }
  function livePeople(items) {
    var t = nowMs(), out = [], i, it;
    for (i = 0; i < (items || []).length; i++) {
      it = items[i];
      if (!it || !it.id || it.id === 'match') continue;
      if (it.at && t - it.at < PRES_TTL) out.push(it);
    }
    if (mp.id && !out.some(function (p) { return p.id === mp.id; })) {
      out.push(mp.row || { id: mp.id, name: mp.name, at: t });
    }
    return out;
  }
  function putMe(extra) {
    if (!playersDb || !mp.id || mp.id === 'local') return;
    var row = { id: mp.id, name: mp.name, at: nowMs(), intent: null };
    if (mp.row && mp.row.intent) row.intent = mp.row.intent;
    if (extra && extra.intent !== undefined) row.intent = extra.intent;
    mp.row = row;
    playersDb.put(row).catch(function () {});
  }
  function putMatch(m) {
    if (!matchDb) return;
    mp.match = m;
    matchDb.put(m).catch(function () {});
  }
  function freshMatch(hostId, dur, diff) {
    return {
      id: 'match',
      host: hostId,
      phase: 'lobby',
      duration: dur || 60,
      difficulty: diff || 'easy',
      q: 0,
      seq: 0,
      eq: null,
      scores: {},
      names: {},
      remaining: dur || 60,
      startedAt: 0,
      endsAt: 0,
      lastWinner: null,
      history: (mp.match && mp.match.history) || []
    };
  }
  function nextEq(m) {
    var eq = R.make(m.difficulty);
    m.eq = R.packEq(eq);
    m.q = (m.q || 0) + 1;
    m.seq = (m.seq || 0) + 1;
    m.lastWinner = null;
  }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!matchDb || !playersDb) {
      setChip('warn', 'Needs GifOS');
      $('bestLine').textContent = 'Play a friend needs the invite bar — open this inside GifOS.';
      return;
    }
    (api && api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null;
      solo = null;
      mp.duration = setup.duration;
      mp.difficulty = setup.difficulty;
      show('friend');
      setChip('ready', 'A friend');
      if (!mp.sub) {
        mp.sub = true;
        matchDb.subscribe(function (items) { _matchItems = items || []; mpRefresh(); });
        playersDb.subscribe(function (items) { _playerItems = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRenderLobby();
    });
  }
  function mpLeave() {
    mp.on = false;
    stopTick();
    if (mp.hb) clearInterval(mp.hb); mp.hb = 0;
    if (playersDb && mp.id && mp.id !== 'local') playersDb.delete(mp.id).catch(function () {});
    show('setup');
    setChip('ready', 'Ready');
    renderBest();
  }
  $('fLeave').onclick = mpLeave;

  function mpRefresh() {
    if (!mp.on) return;
    var people = livePeople(_playerItems);
    mp.people = people;
    var match = null, i, it;
    for (i = 0; i < _matchItems.length; i++) {
      it = _matchItems[i];
      if (it && it.id === 'match') match = it;
    }
    mp.match = match;
    if (mp.row) {
      for (i = 0; i < people.length; i++) if (people[i].id === mp.id) mp.row = people[i];
    }
    if (!match) {
      if (isHost(people)) putMatch(freshMatch(mp.id, mp.duration, mp.difficulty));
      mpRenderLobby();
      return;
    }
    if (isHost(people)) {
      var next = mpReconcile(match, people);
      if (next) { putMatch(next); return; }
    }
    if (mp.row && mp.row.intent && match.seq !== mp.row.intent.seq) {
      putMe({ intent: null });
    }
    if (match.phase === 'playing') {
      if (view !== 'game') {
        seenQ = -1;
        setTyped('');
        $('statusLine').textContent = '';
        $('eqWrap').className = 'eqwrap';
        show('game');
        startTick(tickMp);
      }
      paintGame();
    } else if (match.phase === 'ended' && view === 'game') {
      stopTick();
      paintGame();
    } else {
      stopTick();
      if (view !== 'friend') show('friend');
      mpRenderLobby();
    }
  }

  function mpReconcile(M, people) {
    var m = JSON.parse(JSON.stringify(M));
    var ch = false;
    var ids = {};
    people.forEach(function (p) {
      ids[p.id] = p;
      if (!m.names) m.names = {};
      if (m.names[p.id] !== p.name) { m.names[p.id] = p.name; ch = true; }
    });
    if (m.host !== mp.id) { m.host = mp.id; ch = true; }
    if (m.phase === 'playing') {
      var rem = remainingOf(m.endsAt, nowMs());
      if (rem !== m.remaining) { m.remaining = rem; ch = true; }
      if (rem <= 0) {
        m.phase = 'ended';
        m.remaining = 0;
        var hist = (m.history || []).slice();
        hist.unshift({
          at: nowMs(),
          scores: m.scores || {},
          names: m.names || {},
          duration: m.duration,
          difficulty: m.difficulty
        });
        m.history = hist.slice(0, HISTORY_N);
        ch = true;
        return m;
      }
      var candidates = [];
      people.forEach(function (p) {
        var intent = p.intent;
        if (!intent || intent.kind !== 'answer') return;
        if (intent.seq !== m.seq || intent.q !== m.q) return;
        var eq = R.unpackEq(m.eq);
        if (!eq) return;
        if (!R.isCorrect(eq, intent.value)) return;
        candidates.push({ id: p.id, name: p.name, at: intent.at || p.at || 0 });
      });
      var winner = R.pickWinner(candidates);
      if (winner) {
        if (!m.scores) m.scores = {};
        m.scores[winner.id] = (m.scores[winner.id] || 0) + 1;
        m.lastWinner = { id: winner.id, name: winner.name };
        nextEq(m);
        ch = true;
      }
    }
    return ch ? m : null;
  }

  function tickMp() {
    if (!mp.on || !mp.match) return;
    if (mp.match.phase !== 'playing') return;
    var rem = remainingOf(mp.match.endsAt, nowMs());
    paintClock(rem, true);
    if (isHost(mp.people) && rem <= 0) {
      var next = mpReconcile(mp.match, mp.people);
      if (next) putMatch(next);
    }
  }

  function submitMp(n) {
    var m = mp.match;
    if (!m || m.phase !== 'playing') return;
    var eq = R.unpackEq(m.eq);
    if (!eq) return;
    if (!R.isCorrect(eq, n)) {
      setTyped('');
      flash('bad', 'Nope — same equation.', 'warn');
      return;
    }
    putMe({ intent: { kind: 'answer', q: m.q, seq: m.seq, value: n, at: nowMs() } });
    setTyped('');
    flash('good', 'In!', 'good');
  }

  function hostStart() {
    if (!isHost(mp.people)) return;
    var m = mp.match ? JSON.parse(JSON.stringify(mp.match)) : freshMatch(mp.id, mp.duration, mp.difficulty);
    var now = nowMs();
    m.phase = 'playing';
    m.duration = mp.duration;
    m.difficulty = mp.difficulty;
    m.scores = {};
    m.q = 0;
    m.seq = (m.seq || 0);
    m.startedAt = now;
    m.endsAt = now + m.duration * 1000;
    m.remaining = m.duration;
    m.lastWinner = null;
    nextEq(m);
    putMatch(m);
    seenQ = -1;
    setTyped('');
    $('statusLine').textContent = '';
    $('eqWrap').className = 'eqwrap';
    show('game');
    startTick(tickMp);
    paintGame();
  }
  $('fStart').onclick = hostStart;

  bindSeg('fDurSeg', 'data-dur', function (v) {
    if (!isHost(mp.people)) return;
    mp.duration = parseInt(v, 10) || 60;
    setSeg($('fDurSeg'), 'data-dur', mp.duration);
    if (mp.match && mp.match.phase === 'lobby') {
      var m = JSON.parse(JSON.stringify(mp.match));
      m.duration = mp.duration;
      putMatch(m);
    }
  });
  bindSeg('fDiffSeg', 'data-diff', function (v) {
    if (!isHost(mp.people)) return;
    mp.difficulty = v === 'medium' || v === 'hard' ? v : 'easy';
    setSeg($('fDiffSeg'), 'data-diff', mp.difficulty);
    if (mp.match && mp.match.phase === 'lobby') {
      var m = JSON.parse(JSON.stringify(mp.match));
      m.difficulty = mp.difficulty;
      putMatch(m);
    }
  });

  function mpRenderLobby() {
    var people = mp.people || [];
    var host = isHost(people);
    var m = mp.match;
    $('fHostBits').hidden = !host || (m && m.phase === 'playing');
    setSeg($('fDurSeg'), 'data-dur', (m && m.duration) || mp.duration);
    setSeg($('fDiffSeg'), 'data-diff', (m && m.difficulty) || mp.difficulty);
    var html = '';
    var scores = (m && m.scores) || {};
    var ended = m && m.phase === 'ended';
    people.forEach(function (p) {
      var mine = p.id === mp.id ? ' me' : '';
      var tag = (m && m.host === p.id) || (host && p.id === mp.id) ? 'host' : 'here';
      if (ended || (m && m.phase === 'playing')) tag = String(scores[p.id] || 0);
      html += '<li class="' + mine + '"><span>' + esc(p.id === mp.id ? 'You' : (p.name || 'Player')) +
        '</span><span class="n">' + esc(tag) + '</span></li>';
    });
    $('fPeople').innerHTML = html;
    if (ended) {
      $('fStatus').textContent = host
        ? 'Round over. Start another when you are ready.'
        : 'Round over. Waiting for the host to start another.';
      $('fStart').textContent = 'Start another';
    } else if (people.length < 2) {
      $('fStatus').innerHTML = 'Waiting for another player\u2026 press <b>Invite</b> (top bar) to bring a friend.';
      $('fStart').textContent = 'Start round';
    } else if (host) {
      $('fStatus').textContent = 'You are the host. Same equations, live scores. Start when ready.';
      $('fStart').textContent = 'Start round';
    } else {
      $('fStatus').textContent = 'Waiting for the host to start the round.';
      $('fStart').textContent = 'Start round';
    }
    $('fInviteNote').hidden = people.length >= 2;
  }

  if (api && api.onBack) {
    api.onBack(function () {
      if (view === 'friend' || (view === 'game' && mp.on)) { mpLeave(); return true; }
      if (view === 'game') {
        stopTick(); solo = null; show('setup'); setChip('ready', 'Ready'); return true;
      }
      return false;
    });
  }

  setChip('ready', 'Ready');
  renderBest();
  if (saveDb) {
    saveDb.get('prefs').then(function (p) {
      if (!p) return;
      if (p.duration === 30 || p.duration === 60 || p.duration === 90) setup.duration = p.duration;
      if (p.difficulty === 'easy' || p.difficulty === 'medium' || p.difficulty === 'hard') setup.difficulty = p.difficulty;
      if (p.best && typeof p.best === 'object') best = p.best;
      if (Array.isArray(p.history)) history = p.history.slice(0, HISTORY_N);
      setSeg($('durSeg'), 'data-dur', setup.duration);
      setSeg($('diffSeg'), 'data-diff', setup.difficulty);
      renderBest();
    }).catch(function () {});
  }
})();
