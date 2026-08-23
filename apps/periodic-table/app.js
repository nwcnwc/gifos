/* Periodic Table — table, quiz, race a friend. Invite is OS chrome. */
(function () {
  'use strict';
  var P = window.PT;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var view = 'table';
  var filter = 'all';
  var query = '';
  var openZ = 0;
  var saveDb = null, roomDb = null;
  try {
    if (window.gifos && gifos.db) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  var stats = { id: 'stats', best: 0, last: 0, played: 0 };
  function saveStats() {
    if (!saveDb) return;
    saveDb.put({ id: 'stats', best: stats.best, last: stats.last, played: stats.played, at: nowMs() }).catch(function () {});
  }

  function setView(v) {
    view = v;
    $('tableView').hidden = v !== 'table';
    $('quizView').hidden = v !== 'quiz';
    $('friendView').hidden = v !== 'friend';
    $('moreView').hidden = v !== 'more';
    Array.prototype.forEach.call($('tabs').children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-view') === v);
    });
    if (v !== 'table') closeSheet();
    if (v === 'quiz') quizStart(false);
    if (v === 'friend') mpEnter();
    if (v !== 'friend' && mp.on) mpLeave();
  }
  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    setView(b.getAttribute('data-view'));
  });

  // ---- table ----
  function matchesQuery(el, q) {
    if (!q) return true;
    if (String(el.z) === q) return true;
    if (el.symbol.toLowerCase() === q) return true;
    if (el.name.toLowerCase().indexOf(q) === 0) return true;
    if (el.former && el.former.toLowerCase().indexOf(q) === 0) return true;
    return false;
  }
  function paintTable() {
    var q = query.trim().toLowerCase();
    var html = [];
    var r, c, map = {};
    P.ELEMENTS.forEach(function (el) { map[el.cell.r + ',' + el.cell.c] = el; });
    for (r = 0; r < 9; r++) {
      for (c = 0; c < 18; c++) {
        var el = map[r + ',' + c];
        if (el) {
          var dim = (filter !== 'all' && el.category !== filter) || (q && !matchesQuery(el, q));
          html.push(
            '<button type="button" class="cell ' + el.category + (dim ? ' dim' : '') + (openZ === el.z ? ' hit' : '') +
            '" data-z="' + el.z + '" aria-label="' + esc(el.name) + '">' +
            '<span class="n">' + el.z + '</span><span class="s">' + esc(el.symbol) + '</span></button>'
          );
        } else if (r === 5 && c === 2) {
          html.push('<button type="button" class="ph lanthanide" data-ph="lanthanide">57–71</button>');
        } else if (r === 6 && c === 2) {
          html.push('<button type="button" class="ph actinide" data-ph="actinide">89–103</button>');
        } else {
          html.push('<div class="gap"></div>');
        }
      }
    }
    $('table').innerHTML = html.join('');
  }
  $('table').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var ph = b.getAttribute('data-ph');
    if (ph) { setFilter(ph); return; }
    var z = parseInt(b.getAttribute('data-z'), 10);
    if (z) openSheet(z);
  });

  function setFilter(cat) {
    filter = cat;
    Array.prototype.forEach.call($('filters').children, function (b) {
      b.classList.toggle('on', b.getAttribute('data-cat') === cat);
    });
    paintTable();
  }
  (function buildFilters() {
    var html = ['<button type="button" class="all on" data-cat="all">All</button>'];
    P.CATS.forEach(function (c) {
      html.push('<button type="button" class="' + c + '" data-cat="' + c + '">' + esc(P.LABELS[c]) + '</button>');
    });
    $('filters').innerHTML = html.join('');
    $('filters').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      setFilter(b.getAttribute('data-cat'));
    });
  })();
  $('search').addEventListener('input', function () {
    query = this.value || '';
    paintTable();
  });

  function openSheet(z) {
    var el = P.byZ(z); if (!el) return;
    openZ = z;
    $('sheetSym').textContent = el.symbol;
    $('sheetSym').style.color = P.COLORS[el.category] || '#fff';
    $('sheetName').textContent = el.name;
    $('sheetFacts').innerHTML =
      '<div><dt>Number</dt><dd>' + el.z + '</dd></div>' +
      '<div><dt>Mass</dt><dd>' + el.mass + '</dd></div>' +
      '<div><dt>Category</dt><dd><span class="catpill" style="background:' + P.COLORS[el.category] + ';color:#0a0a0f">' +
      esc(P.LABELS[el.category]) + '</span></dd></div>' +
      '<div><dt>Shells</dt><dd>' + esc(el.shells.split('-').join(' · ')) + '</dd></div>' +
      '<div><dt>Period</dt><dd>' + el.period + '</dd></div>' +
      '<div><dt>Group</dt><dd>' + (el.group ? el.group : 'f-block') + '</dd></div>';
    $('sheet').hidden = false;
    paintTable();
  }
  function closeSheet() {
    openZ = 0;
    $('sheet').hidden = true;
    paintTable();
  }
  $('sheetClose').onclick = closeSheet;

  // ---- local quiz ----
  var QN = P.RACE;
  var quiz = { items: [], i: 0, right: 0, locked: false, seed: 0 };
  function quizStart(force) {
    if (!force && quiz.items.length && quiz.i < quiz.items.length) {
      quizRender();
      return;
    }
    quiz.seed = (nowMs() ^ (Math.random() * 0x7fffffff)) >>> 0;
    quiz.items = P.quiz(quiz.seed, QN);
    quiz.i = 0;
    quiz.right = 0;
    quiz.locked = false;
    $('qAgain').hidden = true;
    $('qBest').textContent = String(stats.best);
    quizRender();
  }
  function quizRender() {
    $('qBest').textContent = String(stats.best);
    if (quiz.i >= quiz.items.length) {
      $('qProg').textContent = 'Done';
      $('qRight').textContent = String(quiz.right);
      $('qPrompt').textContent = 'You got ' + quiz.right + ' of ' + QN + '.';
      $('qChoices').innerHTML = '';
      $('qNote').textContent = quiz.right >= stats.best && quiz.right ? 'Best on this device.' : '';
      $('qAgain').hidden = false;
      return;
    }
    var it = quiz.items[quiz.i];
    $('qProg').textContent = (quiz.i + 1) + ' / ' + QN;
    $('qRight').textContent = String(quiz.right);
    $('qPrompt').textContent = it.prompt;
    $('qNote').textContent = '';
    $('qChoices').innerHTML = it.choices.map(function (c, i) {
      return '<button type="button" data-i="' + i + '">' + esc(String(c)) + '</button>';
    }).join('');
  }
  $('qChoices').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || quiz.locked) return;
    var it = quiz.items[quiz.i]; if (!it) return;
    var i = parseInt(b.getAttribute('data-i'), 10);
    quiz.locked = true;
    var nodes = $('qChoices').querySelectorAll('button');
    Array.prototype.forEach.call(nodes, function (n) { n.disabled = true; });
    if (i === it.answer) {
      b.classList.add('right');
      quiz.right++;
      $('qNote').textContent = 'Right.';
    } else {
      b.classList.add('wrong');
      nodes[it.answer].classList.add('right');
      $('qNote').textContent = 'It was ' + it.choices[it.answer] + '.';
    }
    $('qRight').textContent = String(quiz.right);
    setTimeout(function () {
      quiz.i++;
      quiz.locked = false;
      if (quiz.i >= quiz.items.length) {
        stats.last = quiz.right;
        stats.played++;
        if (quiz.right > stats.best) stats.best = quiz.right;
        saveStats();
      }
      quizRender();
    }, i === it.answer ? 420 : 900);
  });
  $('qAgain').onclick = function () { quizStart(true); };

  // ---- extra tables ----
  $('hcRows').innerHTML = P.HYDROCARBONS.map(function (h) {
    return '<div class="row">' + esc(h.name) + '<span>' + esc(h.formula) + ' · ' + esc(h.kind) + '</span></div>';
  }).join('');
  $('indRows').innerHTML = P.INDICATORS.map(function (h) {
    return '<div class="row">' + esc(h.name) + '<span>acid ' + esc(h.acid) + ' · alkali ' + esc(h.alkali) + '</span></div>';
  }).join('');
  $('solRows').innerHTML = P.SOLUBILITY.map(function (s) {
    return '<li>' + esc(s) + '</li>';
  }).join('');

  // ---- multiplayer: same seed, race to N. Each writes ONLY their own row.
  // Host (lowest live id) writes the shared quiz row.
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mp = { on: false, id: null, name: 'You', row: null, quiz: null, people: [], hb: 0, sub: false };
  var _items = [];
  var fLocked = false;

  function isHost(people) {
    if (!people.length) return true;
    var m = people[0].id, i;
    for (i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function freshQuiz(hostId) {
    return {
      id: 'quiz', host: hostId, seed: (nowMs() ^ (Math.random() * 0x7fffffff)) >>> 0,
      n: QN, seq: 0, startedAt: nowMs(), winner: null, winnerName: '', endedAt: 0
    };
  }
  function putMe(extra) {
    if (!roomDb || !mp.id) return;
    var row = {
      id: mp.id, name: mp.name, at: nowMs(),
      seq: mp.quiz ? mp.quiz.seq : 0,
      q: mp.row && mp.row.q ? mp.row.q : 0,
      correct: mp.row && mp.row.correct ? mp.row.correct : 0,
      wrong: mp.row && mp.row.wrong ? mp.row.wrong : 0,
      done: !!(mp.row && mp.row.done),
      finishedAt: mp.row && mp.row.finishedAt ? mp.row.finishedAt : 0
    };
    if (extra) {
      if (extra.q !== undefined) row.q = extra.q;
      if (extra.correct !== undefined) row.correct = extra.correct;
      if (extra.wrong !== undefined) row.wrong = extra.wrong;
      if (extra.done !== undefined) row.done = extra.done;
      if (extra.finishedAt !== undefined) row.finishedAt = extra.finishedAt;
      if (extra.seq !== undefined) row.seq = extra.seq;
    }
    mp.row = row;
    roomDb.put(row).catch(function () {});
  }
  function putQuiz(q) { mp.quiz = q; roomDb.put(q).catch(function () {}); }

  function mpEnter() {
    if (!roomDb) {
      $('fStatus').textContent = 'Play a friend needs storage.';
      $('fStatus').className = 'statusline warn';
      return;
    }
    if (mp.on) { mpRender(); return; }
    (window.gifos ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null; mp.quiz = null;
      fLocked = false;
      if (!mp.sub) {
        mp.sub = true;
        roomDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRender();
    });
  }
  function mpLeave() {
    mp.on = false;
    if (mp.hb) clearInterval(mp.hb); mp.hb = 0;
    if (roomDb && mp.id) roomDb.delete(mp.id).catch(function () {});
    mp.row = null; mp.quiz = null;
  }
  $('fLeave').onclick = function () {
    mpLeave();
    setView('table');
  };

  function mpRefresh() {
    if (!mp.on) return;
    var t = nowMs();
    var people = [], quiz = null, i, it;
    for (i = 0; i < _items.length; i++) {
      it = _items[i];
      if (!it || !it.id) continue;
      if (it.id === 'quiz') { quiz = it; continue; }
      if (it.at && t - it.at < PRES_TTL) people.push(it);
    }
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: t });
    }
    mp.people = people;
    mp.quiz = quiz;
    if (mp.row) {
      for (i = 0; i < people.length; i++) if (people[i].id === mp.id) mp.row = people[i];
    }
    if (!quiz) {
      if (isHost(people)) putQuiz(freshQuiz(mp.id));
      mpRender();
      return;
    }
    if (isHost(people)) {
      var next = mpReconcile(quiz, people);
      if (next) { putQuiz(next); return; }
    }
    if (mp.row && quiz && mp.row.seq !== quiz.seq) {
      putMe({ seq: quiz.seq, q: 0, correct: 0, wrong: 0, done: false, finishedAt: 0 });
      fLocked = false;
    }
    mpRender();
  }

  function mpReconcile(Q, people) {
    var q = {
      id: 'quiz', host: mp.id, seed: Q.seed, n: Q.n || QN, seq: Q.seq || 0,
      startedAt: Q.startedAt, winner: Q.winner || null, winnerName: Q.winnerName || '',
      endedAt: Q.endedAt || 0
    };
    var ch = false;
    if (q.host !== mp.id) ch = true;
    var others = people.filter(function (p) { return p.id !== mp.id; });
    if (!q.winner && others.length) {
      var done = people.filter(function (p) { return p.done && p.seq === q.seq; });
      if (done.length) {
        done.sort(function (a, b) {
          var fa = a.finishedAt || 0, fb = b.finishedAt || 0;
          if (fa && fb && fa !== fb) return fa - fb;
          if (a.id < b.id) return -1;
          if (a.id > b.id) return 1;
          return 0;
        });
        q.winner = done[0].id;
        q.winnerName = done[0].name || 'Player';
        q.endedAt = nowMs();
        ch = true;
      }
    }
    if (q.winner && q.endedAt && nowMs() - q.endedAt > END_HOLD) {
      q.seed = (nowMs() ^ (Math.random() * 0x7fffffff)) >>> 0;
      q.seq = (q.seq || 0) + 1;
      q.winner = null; q.winnerName = ''; q.endedAt = 0; q.startedAt = nowMs();
      ch = true;
    }
    return ch ? q : null;
  }

  function mpAnswer(i) {
    var q = mp.quiz, row = mp.row;
    if (!q || !row || fLocked || q.winner) return;
    if (row.done) return;
    var idx = row.q || 0;
    var it = P.quizItem(q.seed, idx);
    if (!it) return;
    fLocked = true;
    var right = i === it.answer;
    var correct = (row.correct || 0) + (right ? 1 : 0);
    var wrong = (row.wrong || 0) + (right ? 0 : 1);
    var nxt = idx + 1;
    var done = correct >= (q.n || QN);
    var extra = { q: nxt, correct: correct, wrong: wrong, seq: q.seq, done: done };
    if (done) extra.finishedAt = nowMs();
    var nodes = $('fChoices').querySelectorAll('button');
    Array.prototype.forEach.call(nodes, function (n) { n.disabled = true; });
    if (nodes[i]) nodes[i].classList.add(right ? 'right' : 'wrong');
    if (!right && nodes[it.answer]) nodes[it.answer].classList.add('right');
    $('fNote').textContent = right ? 'Right.' : ('It was ' + it.choices[it.answer] + '.');
    putMe(extra);
    setTimeout(function () { fLocked = false; mpRender(); }, right ? 380 : 800);
  }

  $('fChoices').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    mpAnswer(parseInt(b.getAttribute('data-i'), 10));
  });

  function mpRender() {
    if (!mp.on) return;
    var q = mp.quiz, status = $('fStatus');
    var people = mp.people || [];
    $('fBoard').innerHTML = people.map(function (p) {
      var me = p.id === mp.id;
      var score = (p.seq === (q && q.seq) ? (p.correct || 0) : 0);
      var tag = q && q.winner === p.id ? ' · won' : (p.done && p.seq === (q && q.seq) ? ' · done' : '');
      return '<div class="seat' + (me ? ' me' : '') + '">' + esc(p.name || 'Player') +
        '<div class="n">' + score + ' / ' + (q ? q.n : QN) + tag + '</div></div>';
    }).join('');
    if (!q) {
      status.textContent = 'Setting up the quiz…';
      $('fPrompt').textContent = '';
      $('fChoices').innerHTML = '';
      $('fNote').textContent = '';
      return;
    }
    var live = people.filter(function (p) { return p.id !== mp.id; });
    if (!live.length) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (q.winner) {
      var mine = q.winner === mp.id;
      status.textContent = mine ? 'You got there first. Next race starting…' : ((q.winnerName || 'They') + ' got there first. Next race starting…');
    } else {
      status.textContent = 'Same questions. First to ' + q.n + ' right wins.';
    }
    var row = mp.row || { q: 0, correct: 0 };
    var idx = row.q || 0;
    if (q.winner || (row.done && row.seq === q.seq)) {
      $('fPrompt').textContent = row.done || q.winner ? ('You got ' + (row.correct || 0) + ' right.') : '';
      $('fChoices').innerHTML = '';
      if (!q.winner && row.done) $('fNote').textContent = 'Waiting for the others…';
      return;
    }
    if (!live.length) {
      $('fPrompt').textContent = '';
      $('fChoices').innerHTML = '';
      $('fNote').textContent = '';
      return;
    }
    var it = P.quizItem(q.seed, idx);
    if (!it) return;
    $('fPrompt').textContent = it.prompt;
    if (!fLocked) {
      $('fChoices').innerHTML = it.choices.map(function (c, i) {
        return '<button type="button" data-i="' + i + '">' + esc(String(c)) + '</button>';
      }).join('');
      $('fNote').textContent = (idx + 1) + ' · ' + (row.correct || 0) + ' right';
    }
  }

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (!$('sheet').hidden) { closeSheet(); return true; }
      if (view === 'friend') { mpLeave(); setView('table'); return true; }
      if (view !== 'table') { setView('table'); return true; }
      return false;
    });
  }

  paintTable();
  if (saveDb) {
    saveDb.get('stats').then(function (s) {
      if (!s) return;
      stats.best = s.best || 0;
      stats.last = s.last || 0;
      stats.played = s.played || 0;
      $('qBest').textContent = String(stats.best);
    }).catch(function () {});
  }
})();
