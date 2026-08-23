// Drawphone. Invite is OS chrome — this file never draws a share button.
// Each person writes ONLY their own row (id = me). The host (lowest live id)
// is the only writer of the board row, and is who advances the chain.
// Finished rounds live in gifos.db('save') — the file is the archive.
(function () {
  'use strict';
  var DP = window.DP;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };
  var DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  var COLORS = ['#111111', '#e85c40', '#3d7ea6', '#3a9a5b', '#e0b03a', '#8b5a2b', '#7b4ea3', '#fffdf6'];
  var SEAT_HUE = ['#e85c40', '#3d7ea6', '#3a9a5b', '#e0b03a', '#7b4ea3', '#3aa8a0'];
  var PRES_TTL = 9000, HB_MS = 3000;

  var wordFirst = false;
  var pad = null;
  var mode = 'setup'; // setup | here | friend | archive
  var herePeople = [{ id: 'h0', name: 'Alex' }, { id: 'h1', name: 'Sam' }];
  var hereBoard = null;
  var hereIntents = {};
  var hereQueue = [];
  var hereActor = null;
  var herePass = false;
  var viewChain = 0;
  var revealStep = 0;
  var playKey = '';
  var archive = [];
  var archiveBoard = null;
  var noteTimer = 0;

  var saveDb = null, mpDb = null;
  try { if (window.gifos) saveDb = gifos.db('save'); } catch (e) {}
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}

  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false };
  var _items = [];

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipState').textContent = text;
  }
  function setBody(cls) {
    document.body.className = cls || '';
  }
  function hideAll() {
    $('setup').hidden = true;
    $('hereSetup').hidden = true;
    $('lobby').hidden = true;
    $('play').hidden = true;
    $('passSplash').hidden = true;
  }
  function showSetup() {
    mode = 'setup';
    playKey = '';
    hideAll();
    setBody('');
    $('setup').hidden = false;
    setChip('ready', 'Ready');
    paintArchive();
  }
  function showPlay() {
    hideAll();
    $('play').hidden = false;
    $('passSplash').hidden = true;
    $('wordPane').hidden = true;
    $('drawPane').hidden = true;
    $('waitPane').hidden = true;
    $('resultsPane').hidden = true;
    $('fromLine').hidden = true;
    $('playNote').hidden = true;
  }
  function note(msg) {
    var el = $('playNote');
    el.hidden = !msg;
    el.textContent = msg || '';
    if (noteTimer) clearTimeout(noteTimer);
    if (msg) {
      noteTimer = setTimeout(function () { el.hidden = true; }, 2200);
    }
  }

  $('firstSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
    wordFirst = b.getAttribute('data-first') === 'write';
    $('firstNote').textContent = wordFirst
      ? 'Each person writes a word for someone else to draw.'
      : 'Each chain starts with a simple word to draw.';
  });

  // ---- drawing pad ----
  function fitSquare(slot, wrap) {
    if (!slot || !wrap) return 0;
    var w = slot.clientWidth || 0;
    var h = slot.clientHeight || 0;
    var s = Math.floor(Math.min(w, h || w));
    if (s < 140) s = Math.max(140, Math.min(w || 140, 280));
    wrap.style.width = s + 'px';
    wrap.style.height = s + 'px';
    return s;
  }
  function layoutPad() {
    if ($('drawPane').hidden) return;
    fitSquare($('padSlot'), $('padWrap'));
    if (pad) pad.resize();
  }
  function layoutGuess() {
    if ($('wordPane').hidden || $('guessArtWrap').hidden) return;
    fitSquare($('guessSlot'), $('guessArtWrap'));
  }

  function ensurePad() {
    if (pad) { layoutPad(); return pad; }
    pad = new window.DrawPad($('pad'));
    var i, sw;
    var box = $('colors');
    box.innerHTML = '';
    for (i = 0; i < COLORS.length; i++) {
      sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'swatch' + (i === 0 ? ' on' : '');
      sw.style.background = COLORS[i];
      sw.setAttribute('data-c', COLORS[i]);
      sw.setAttribute('aria-label', i === COLORS.length - 1 ? 'eraser' : 'colour');
      box.appendChild(sw);
    }
    box.addEventListener('click', function (e) {
      var t = e.target.closest('.swatch'); if (!t || !pad) return;
      Array.prototype.forEach.call(box.children, function (c) { c.classList.remove('on'); });
      t.classList.add('on');
      pad.color = t.getAttribute('data-c');
    });
    $('undoBtn').onclick = function () { if (pad) pad.undo(); };
    $('redoBtn').onclick = function () { if (pad) pad.redo(); };
    $('clearBtn').onclick = function () { if (pad) pad.clear(); };
    function setW(w) {
      if (pad) pad.width = w;
      ['w3', 'w7', 'w14'].forEach(function (id) {
        $(id).classList.toggle('on', parseInt($(id).getAttribute('data-w'), 10) === w);
      });
    }
    $('w3').onclick = function () { setW(3); };
    $('w7').onclick = function () { setW(7); };
    $('w14').onclick = function () { setW(14); };
    layoutPad();
    return pad;
  }

  function paintGuess(strokes) {
    layoutGuess();
    var canvas = $('guessArt');
    var cssW = canvas.clientWidth || 360;
    var cssH = canvas.clientHeight || cssW;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    window.paintStrokes(ctx, strokes || [], cssW, cssH);
  }

  function paintResult(canvas, strokes) {
    var cssW = canvas.clientWidth || 320;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    window.paintStrokes(ctx, strokes || [], cssW, cssW);
  }

  function nameOf(board, id) {
    if (!id) return 'Someone';
    if (board && board.names && board.names[id]) return board.names[id];
    return 'Player';
  }

  // ---- render a board into #play ----
  function waitNames(board) {
    return DP.actors(board).map(function (id) { return nameOf(board, id); });
  }
  function fillWait(board) {
    var names = waitNames(board);
    $('waitLead').textContent = names.length
      ? ('Still waiting for: ' + names.join(', '))
      : 'Waiting for everyone to send…';
    $('waitList').innerHTML = names.map(function (n) {
      return '<li><span>' + esc(n) + '</span></li>';
    }).join('');
  }
  function renderBoard(board, meId, opts) {
    opts = opts || {};
    var prompt = (board && board.phase === 'play' && meId && !opts.pass) ? DP.promptFor(board, meId) : null;
    var acting = !!(prompt && !opts.submitted);
    var key = board
      ? [board.startedAt || 0, board.phase, board.seq, board.turn, meId || '', opts.submitted ? 1 : 0, opts.pass ? 1 : 0, viewChain, revealStep, mode].join('|')
      : '';
    if (key === playKey && acting) { layoutPad(); return; }
    if (key === playKey && board && board.phase === 'play' && !acting && !opts.pass) {
      fillWait(board);
      return;
    }
    playKey = key;
    showPlay();
    if (!board) {
      $('playTitle').textContent = 'Setting up…';
      return;
    }
    $('playCount').textContent = board.phase === 'play'
      ? ('Turn ' + (board.turn + 1) + ' of ' + board.turns)
      : '';
    if (board.phase === 'results') {
      setBody('on-results');
      setChip('ready', 'Results');
      $('playTitle').textContent = 'Results';
      $('playStatus').textContent = '';
      $('resultsPane').hidden = false;
      $('againBtn').hidden = true;
      renderResults(board, viewChain, { canAgain: !!opts.canAgain });
      return;
    }
    if (opts.pass) {
      setBody('on-pass');
      setChip('wait', 'Pass the phone');
      hideAll();
      $('passSplash').hidden = false;
      $('passName').textContent = (opts.passName || 'Next') + ', you’re up.';
      return;
    }
    if (prompt && !opts.submitted) {
      var kind = prompt.kind;
      var last = prompt.last;
      if (kind === 'word') {
        setBody('on-guess');
        setChip('ready', 'Guess');
        $('wordPane').hidden = false;
        if (last && last.type === 'draw') {
          $('playTitle').textContent = 'What is this a drawing of?';
          $('playStatus').textContent = '';
          $('guessArtWrap').hidden = false;
          if (last.by) {
            $('fromLine').hidden = false;
            $('fromLine').textContent = nameOf(board, last.by) + ' drew this.';
          }
          setTimeout(function () { paintGuess(last.strokes); }, 30);
        } else {
          $('playTitle').textContent = 'What should be drawn?';
          $('playStatus').textContent = 'A word or a short phrase.';
          $('guessArtWrap').hidden = true;
        }
        $('wordIn').value = '';
        setTimeout(function () { try { $('wordIn').focus(); } catch (e) {} }, 50);
      } else {
        setBody('on-draw');
        setChip('ready', 'Draw');
        $('drawPane').hidden = false;
        ensurePad();
        pad.clear();
        pad.enabled = true;
        var word = last && last.word ? last.word : 'something';
        $('playTitle').textContent = 'Please draw';
        $('drawPrompt').textContent = word;
        $('playStatus').textContent = '';
        if (last && last.by) {
          $('fromLine').hidden = false;
          $('fromLine').textContent = nameOf(board, last.by) + ' wrote that.';
        }
        setTimeout(layoutPad, 30);
        setTimeout(layoutPad, 180);
      }
      return;
    }
    setBody('');
    setChip('wait', 'Waiting');
    $('playTitle').textContent = 'Waiting';
    $('waitPane').hidden = false;
    fillWait(board);
  }

  function renderResults(board, idx, opts) {
    opts = opts || {};
    var chains = board.chains || [];
    if (idx < 0) idx = 0;
    if (idx >= chains.length) idx = 0;
    viewChain = idx;
    var nav = $('chainNav');
    nav.innerHTML = chains.map(function (c, i) {
      var label = (i + 1) + '. ' + (DP.firstWord(c) || 'chain');
      return '<button type="button" class="' + (i === idx ? 'on' : '') + '" data-i="' + i + '">' +
        esc(label) + '</button>';
    }).join('');
    var chain = chains[idx];
    var view = $('chainView');
    view.innerHTML = '';
    if (!chain) return;
    var owner = nameOf(board, chain.owner);
    $('presentLine').textContent = owner + ' should present this one.';
    var links = chain.links || [];
    var shown = Math.max(0, Math.min(revealStep, links.length));
    var i, L, step, who;
    for (i = 0; i < shown; i++) {
      L = links[i];
      step = document.createElement('div');
      step.className = 'step';
      if (L.seed) who = 'The first word';
      else if (i === 0 && L.type === 'word') who = esc(nameOf(board, L.by)) + ' wanted someone to draw';
      else if (L.type === 'draw') who = esc(nameOf(board, L.by)) + ' drew';
      else who = esc(nameOf(board, L.by)) + ' thought that was';
      if (L.type === 'word') {
        step.innerHTML = '<h4>' + who + '</h4><p class="word">' + esc(L.word || '') + '</p>';
        view.appendChild(step);
      } else {
        step.innerHTML = '<h4>' + who + '</h4>';
        var cv = document.createElement('canvas');
        cv.width = 400; cv.height = 400;
        step.appendChild(cv);
        view.appendChild(step);
        paintResult(cv, L.strokes);
      }
    }
    var allIn = shown >= links.length;
    $('wentFrom').hidden = !allIn;
    if (allIn) {
      $('wentFrom').innerHTML =
        '<h4>You started with</h4><p>' + esc(DP.firstWord(chain) || '—') + '</p>' +
        '<h4>and ended up with</h4><p>' + esc(DP.lastWord(chain) || '—') + '</p>';
      setTimeout(function () {
        try { $('wentFrom').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
      }, 40);
    }
    $('againBtn').hidden = !(opts.canAgain && allIn);
    var nxt = $('revealNext');
    if (!allIn) {
      nxt.hidden = false;
      nxt.textContent = shown === 0 ? 'Show the first word' : (links[shown].type === 'draw' ? 'Show the drawing' : 'Show the guess');
    } else if (chains.length > 1 && idx < chains.length - 1) {
      nxt.hidden = false;
      nxt.textContent = 'Next chain';
    } else {
      nxt.hidden = true;
    }
  }

  $('chainNav').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var i = parseInt(b.getAttribute('data-i'), 10);
    var board = currentBoard();
    revealStep = 0;
    playKey = '';
    if (board) renderResults(board, i, { canAgain: mode !== 'archive' && (mode === 'here' || (mode === 'friend' && isHost(mp.people))) });
  });
  $('revealNext').onclick = function () {
    var board = currentBoard();
    if (!board) return;
    var chain = (board.chains || [])[viewChain];
    var n = chain && chain.links ? chain.links.length : 0;
    if (revealStep < n) revealStep += 1;
    else if (viewChain < (board.chains || []).length - 1) {
      viewChain += 1;
      revealStep = 0;
    }
    playKey = '';
    renderResults(board, viewChain, { canAgain: mode !== 'archive' && (mode === 'here' || (mode === 'friend' && isHost(mp.people))) });
  };
  $('chainView').addEventListener('click', function () {
    if (!$('revealNext').hidden) $('revealNext').click();
  });

  // ---- hotseat ----
  function renderHereList() {
    $('hereList').innerHTML = herePeople.map(function (p, i) {
      var del = herePeople.length > 2
        ? '<button type="button" class="row-del" data-i="' + i + '" title="Remove" aria-label="Remove">' + DEL + '</button>'
        : '';
      return '<li><span>' + esc(p.name) + '</span>' + del + '</li>';
    }).join('');
  }
  $('hereBtn').onclick = function () {
    hideAll();
    setBody('');
    $('hereSetup').hidden = false;
    renderHereList();
    setChip('ready', 'This device');
  };
  $('hereBack').onclick = showSetup;
  $('hereList').addEventListener('click', function (e) {
    var b = e.target.closest('.row-del'); if (!b) return;
    var i = parseInt(b.getAttribute('data-i'), 10);
    if (herePeople.length > 2) herePeople.splice(i, 1);
    renderHereList();
  });
  $('hereAdd').onclick = function () {
    var n = $('hereName').value.replace(/^\s+|\s+$/g, '');
    if (!n) return;
    herePeople.push({ id: 'h' + nowMs() + herePeople.length, name: n.slice(0, 24) });
    $('hereName').value = '';
    renderHereList();
  };
  $('hereName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('hereAdd').click(); }
  });
  function hereBegin() {
    if (herePeople.length < DP.MIN) return;
    playKey = '';
    mode = 'here';
    hereBoard = DP.start(herePeople, { wordFirst: wordFirst, host: herePeople[0].id });
    hereIntents = {};
    hereQueue = DP.actors(hereBoard).slice();
    hereActor = hereQueue.shift() || null;
    herePass = true;
    viewChain = 0;
    revealStep = 0;
    hereRender();
  }
  $('hereStart').onclick = hereBegin;

  function herePerson(id) {
    var i;
    for (i = 0; i < herePeople.length; i++) if (herePeople[i].id === id) return herePeople[i];
    return { id: id, name: 'Player' };
  }
  function hereRender() {
    if (!hereBoard) return;
    if (hereBoard.phase === 'results') {
      rememberRound(hereBoard);
      renderBoard(hereBoard, null, { canAgain: true });
      return;
    }
    if (herePass && hereActor) {
      renderBoard(hereBoard, null, { pass: true, passName: herePerson(hereActor).name });
      return;
    }
    renderBoard(hereBoard, hereActor, { submitted: false, canAgain: true });
  }
  $('passGo').onclick = function () {
    herePass = false;
    playKey = '';
    hereRender();
  };
  function hereSubmit(intent) {
    if (!hereBoard || !hereActor) return;
    hereIntents[hereActor] = intent;
    if (hereQueue.length) {
      hereActor = hereQueue.shift();
      herePass = true;
      hereRender();
      return;
    }
    var next = DP.applyIntents(hereBoard, hereIntents);
    if (!next) { hereRender(); return; }
    hereBoard = next;
    hereIntents = {};
    if (hereBoard.phase === 'results') { hereActor = null; hereRender(); return; }
    hereQueue = DP.actors(hereBoard).slice();
    hereActor = hereQueue.shift() || null;
    herePass = true;
    hereRender();
  }

  // ---- send buttons ----
  function currentBoard() {
    if (mode === 'here') return hereBoard;
    if (mode === 'archive') return archiveBoard;
    return mp.board;
  }
  function submitWord() {
    var board = currentBoard();
    if (!board || board.phase !== 'play') return;
    var word = $('wordIn').value.replace(/^\s+|\s+$/g, '');
    if (!word) { note('Write a guess first.'); return; }
    var intent = { kind: 'word', seq: board.seq, word: word.slice(0, 80) };
    if (mode === 'here') hereSubmit(intent);
    else mpSubmit(intent);
  }
  function submitDraw() {
    var board = currentBoard();
    if (!board || board.phase !== 'play') return;
    ensurePad();
    if (pad.blank()) { note('Draw something first.'); return; }
    var intent = { kind: 'draw', seq: board.seq, strokes: DP.capStrokes(pad.getStrokes()) };
    if (mode === 'here') hereSubmit(intent);
    else mpSubmit(intent);
  }
  $('wordSend').onclick = submitWord;
  $('wordIn').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitWord(); }
  });
  $('drawSend').onclick = submitDraw;

  $('againBtn').onclick = function () {
    revealStep = 0;
    viewChain = 0;
    playKey = '';
    if (mode === 'here') hereBegin();
    else if (mode === 'archive') showSetup();
    else if (mode === 'friend' && isHost(mp.people) && mp.people.length >= DP.MIN) {
      putBoard(DP.start(mp.people, { wordFirst: wordFirst, host: mp.id }));
    }
  };

  $('playLeave').onclick = function () {
    if (mode === 'friend') mpLeave();
    else showSetup();
  };

  // ---- archive (rounds in the file) ----
  function rememberRound(board) {
    if (!board || board.phase !== 'results') return;
    var at = board.startedAt || nowMs();
    if (archive.length && archive[0].at === at) return;
    var round = {
      at: at,
      names: board.names || {},
      chains: board.chains || [],
      wordFirst: !!board.wordFirst,
      order: board.order || []
    };
    archive.unshift(round);
    if (archive.length > 8) archive = archive.slice(0, 8);
    if (saveDb) saveDb.put({ id: 'archive', rounds: archive }).catch(function () {});
    paintArchive();
  }
  function paintArchive() {
    var box = $('archiveBox'), list = $('archiveList');
    if (!archive.length) { box.hidden = true; return; }
    box.hidden = false;
    list.innerHTML = archive.map(function (r, i) {
      var chains = r.chains || [];
      var bits = chains.slice(0, 2).map(function (c) {
        return (DP.firstWord(c) || '?') + ' → ' + (DP.lastWord(c) || '?');
      });
      var extra = chains.length > 2 ? ', etc.' : '';
      var when = '';
      try { when = new Date(r.at).toLocaleString(); } catch (e) { when = ''; }
      return '<li><button type="button" class="linkish" data-i="' + i + '">' +
        esc(bits.join(', ') + extra) + '</button><span class="sub">' + esc(when) + '</span></li>';
    }).join('');
  }
  $('archiveList').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var i = parseInt(b.getAttribute('data-i'), 10);
    var r = archive[i]; if (!r) return;
    archiveBoard = {
      id: 'board', phase: 'results', chains: r.chains, names: r.names,
      order: r.order, wordFirst: r.wordFirst, startedAt: r.at, turn: 0, turns: 0, seq: 0
    };
    mode = 'archive';
    viewChain = 0;
    revealStep = 0;
    playKey = '';
    renderBoard(archiveBoard, null, { canAgain: false });
    $('againBtn').hidden = true;
    $('playTitle').textContent = 'A round in this file';
  });
  function loadArchive() {
    if (!saveDb) return;
    saveDb.get('archive').then(function (row) {
      archive = (row && row.rounds) || [];
      paintArchive();
    }).catch(function () {});
  }

  // ---- multiplayer ----
  function isHost(people) {
    if (!people || !people.length) return true;
    var m = people[0].id, i;
    for (i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function putMe(extra) {
    var row = { id: mp.id, name: mp.name, at: nowMs(), intent: null };
    if (mp.row && mp.row.intent) row.intent = mp.row.intent;
    if (extra && extra.intent !== undefined) row.intent = extra.intent;
    mp.row = row;
    mpDb.put(row).catch(function () {});
  }
  function putBoard(b) { mp.board = b; mpDb.put(b).catch(function () {}); }

  function mpEnter() {
    if (!mpDb) { setChip('', 'Play with friends needs storage.'); return; }
    (window.gifos ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null; mp.board = null;
      mode = 'friend';
      hideAll();
      setBody('');
      $('lobby').hidden = false;
      setChip('ready', 'A table');
      if (!mp.sub) {
        mp.sub = true;
        mpDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRefresh();
    });
  }
  function mpLeave() {
    playKey = '';
    mp.on = false;
    if (mp.hb) clearInterval(mp.hb); mp.hb = 0;
    if (mpDb && mp.id) mpDb.delete(mp.id).catch(function () {});
    mp.board = null; mp.row = null;
    showSetup();
  }
  $('friendBtn').onclick = mpEnter;
  $('lobbyLeave').onclick = mpLeave;

  function mpRefresh() {
    if (!mp.on) return;
    var t = nowMs();
    var people = [], board = null, i, it;
    for (i = 0; i < _items.length; i++) {
      it = _items[i];
      if (!it || !it.id) continue;
      if (it.id === 'board') { board = it; continue; }
      if (it.at && t - it.at < PRES_TTL) people.push(it);
    }
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: t });
    }
    people.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    mp.people = people;
    mp.board = board;
    if (mp.row) {
      for (i = 0; i < people.length; i++) if (people[i].id === mp.id) mp.row = people[i];
    }
    if (board && board.phase === 'play' && isHost(people)) {
      var next = mpReconcile(board, people);
      if (next) { putBoard(next); return; }
    }
    if (board && board.phase === 'results') rememberRound(board);
    if (mp.row && mp.row.intent && board && board.seq !== mp.row.intent.seq) {
      putMe({ intent: null });
    }
    mpRender();
  }

  function mpReconcile(B, people) {
    var b = JSON.parse(JSON.stringify(B));
    var ch = false;
    var i, p;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if (b.names[p.id] !== p.name) { b.names[p.id] = p.name; ch = true; }
    }
    if (b.phase !== 'play') {
      if (b.host !== mp.id) { b.host = mp.id; ch = true; }
      return ch ? b : null;
    }
    var intents = {};
    for (i = 0; i < people.length; i++) {
      if (people[i].intent) intents[people[i].id] = people[i].intent;
    }
    var applied = DP.applyIntents(b, intents);
    if (applied) {
      applied.host = mp.id;
      return applied;
    }
    if (b.host !== mp.id) { b.host = mp.id; ch = true; }
    return ch ? b : null;
  }

  function mpSubmit(intent) {
    putMe({ intent: intent });
    mpRender();
  }

  function mpRender() {
    if (!mp.on) return;
    var b = mp.board;
    var host = isHost(mp.people);
    if (!b || b.phase === 'lobby' || (b.phase !== 'play' && b.phase !== 'results')) {
      hideAll();
      setBody('');
      $('lobby').hidden = false;
      var seats = mp.people.map(function (p, i) {
        var me = p.id === mp.id ? ' me' : '';
        var ho = (host && p.id === mp.id) || (!host && b && b.host === p.id) ? ' host' : '';
        var col = SEAT_HUE[i % SEAT_HUE.length];
        return '<div class="seat' + me + ho + '" style="border-color:' + col + '">' + esc(p.name || 'Player') + '</div>';
      });
      if (mp.people.length < 4) {
        seats.push('<div class="seat open">Waiting for a friend…</div>');
      }
      $('lobbySeats').innerHTML = seats.join('');
      var n = mp.people.length;
      $('lobbyStart').hidden = !(host && n >= DP.MIN);
      if (n < DP.MIN) {
        $('lobbyStatus').innerHTML = 'Waiting for another player… press <b>Invite</b> in the top bar to bring a friend.';
        $('lobbyHint').hidden = true;
      } else if (host) {
        $('lobbyStatus').textContent = n + ' at the table. Start when you’re ready.';
        $('lobbyHint').hidden = true;
      } else {
        $('lobbyStatus').textContent = n + ' at the table. Waiting for the host to start.';
        $('lobbyHint').hidden = true;
      }
      setChip('ready', n + ' at the table');
      return;
    }
    var submitted = !!(mp.row && mp.row.intent && b.seq === mp.row.intent.seq);
    renderBoard(b, mp.id, { submitted: submitted, canAgain: host });
  }

  $('lobbyStart').onclick = function () {
    if (!isHost(mp.people) || mp.people.length < DP.MIN) return;
    viewChain = 0;
    revealStep = 0;
    putBoard(DP.start(mp.people, { wordFirst: wordFirst, host: mp.id }));
  };

  window.addEventListener('resize', function () {
    layoutPad();
    if (!$('guessArtWrap').hidden && !$('wordPane').hidden) {
      var b = currentBoard();
      var me = mode === 'here' ? hereActor : mp.id;
      var pr = b && me ? DP.promptFor(b, me) : null;
      if (pr && pr.last && pr.last.strokes) paintGuess(pr.last.strokes);
    }
  });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('passSplash').hidden) return;
    if (!$('play').hidden) {
      if (mode === 'friend') mpLeave();
      else showSetup();
    } else if (!$('lobby').hidden) mpLeave();
    else if (!$('hereSetup').hidden) showSetup();
  });

  loadArchive();
  setChip('ready', 'Ready');
})();
