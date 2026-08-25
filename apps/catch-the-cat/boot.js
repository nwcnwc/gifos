/*
 * Catch the Cat — the GifOS shell.
 *
 * engine.js runs upstream's rules headless, rules.js owns the three modes,
 * view.js draws the table and walks the cats, net.js carries the room. This
 * file is the glue and the words: it turns a tap into a move, a move into a
 * published row, and a verdict into a sentence.
 *
 * ONE THING WORTH KNOWING. The rules move a cat a whole hex the instant you
 * tap; the cat you can SEE takes ~600 ms to walk it. So the wire is told the
 * truth at once — your row must never lag what your board has already decided,
 * or another screen would score a round you had not finished — while the
 * ANNOUNCEMENT waits for the cat's feet to land (view.onSettled). Flashing
 * "the cat is walled in" over a cat that is still mid-stride reads as a bug
 * even when the arithmetic is right.
 */
(function (root) {
  'use strict';

  var GifCat = root.GifCat;
  var racing = false;
  var mode = 'solo';
  var seed = 1;
  var round = 0;
  var over = false;          // this board is finished for me
  var settled = false;       // the ROOM has called the round
  var hinted = false;

  var $ = function (id) { return root.document.getElementById(id); };
  var statusEl = $('status'), clicksEl = $('clicks'), rosterEl = $('roster');
  var stageEl = $('stage'), flashEl = $('flash'), modesEl = $('modes');
  var undoBtn = $('undo'), againBtn = $('again');
  var flashAt = 0;

  function taps(n) { return n === 1 ? '1 tap' : n + ' taps'; }

  function names(list) {
    var n = list.map(function (p) { return p.mine ? 'You' : (p.name || 'Player'); });
    if (n.length < 3) return n.join(' and ');
    return n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  // A short shout over the board. Never over the dots you are about to tap:
  // it clears itself, and it never eats a pointer (pointer-events: none).
  function flash(msg, kind) {
    flashEl.textContent = msg;
    flashEl.className = kind || '';
    flashEl.hidden = false;
    clearTimeout(flashAt);
    flashAt = setTimeout(function () { flashEl.hidden = true; }, 2800);
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = kind || '';
  }

  function setClicks(n) { clicksEl.textContent = taps(n || 0); }

  function armAgain(next) {
    againBtn.textContent = next ? (racing ? 'Next round' : 'New board') : 'New board';
    againBtn.classList.toggle('ready', !!next);
  }

  // Say it once the cat has actually arrived. See the note at the top.
  function announce(fn) { GifCat.view.onSettled(fn); }

  function stopTaps() { over = true; stageEl.classList.add('done'); }

  function repaint() {
    GifCat.view.setWalls(GifCat.rules.isWall);
    GifCat.view.setCats(GifCat.rules.cats());
    undoBtn.disabled = !GifCat.rules.canUndo() || settled;
  }

  // ------------------------------------------------------------- a new board
  function start(nextSeed, nextMode) {
    seed = (nextSeed >>> 0) || 1;
    mode = nextMode || (racing ? 'race' : 'solo');
    over = false; settled = false;
    stageEl.classList.remove('done');
    flashEl.hidden = true;
    armAgain(false);
    GifCat.rules.reset({
      seed: seed, mode: mode,
      seat: racing ? root.CTCNet.seat() : 0,
      me: { id: root.CTCNet.me().id || 'me', name: root.CTCNet.me().name || 'You' }
    });
    setClicks(0);
    repaint();
    GifCat.view.resetView(true);
    setStatus(
      mode === 'coop' ? 'One board, a cat each. Nobody wins until every cat is penned.'
      : mode === 'race' ? (round ? 'Round ' + round + '. Same board for everyone — fewest taps takes it.'
                                 : 'Same board for everyone — fewest taps takes it.')
      : 'Tap the dots. Wall the cat in.');
    if (racing) push();
    if (!hinted) {
      hinted = true;
      setTimeout(function () { flash('Drag to turn the board. Pinch to zoom.'); }, 700);
    }
  }

  // What our row says about us right now.
  function push(finalState) {
    if (!racing) return;
    if (mode === 'coop') {
      var c = GifCat.rules.myCat();
      root.CTCNet.reportCoop({
        clicks: GifCat.rules.clicks(), walls: GifCat.rules.walls(),
        i: c.i, j: c.j, dir: c.dir, state: finalState || GifCat.rules.state(),
        seat: GifCat.rules.seat()
      });
    } else {
      var st = GifCat.rules.state();
      root.CTCNet.report(GifCat.rules.clicks(),
        st === 'caught' ? 'win' : st === 'gone' ? 'lose' : 'playing');
    }
  }

  // ------------------------------------------------------------------- a tap
  function tap(i, j) {
    if (over || settled) return;
    var res = GifCat.rules.tap(i, j);
    if (!res.ok) {
      if (res.why === 'wall') setStatus('Already a wall.');
      else if (res.why === 'cat') setStatus("That's a cat. Wall around it.");
      return;
    }
    setClicks(res.clicks);
    repaint();
    push();

    if (mode === 'coop') {
      // Your own cat finishing does NOT finish your round: the walls you keep
      // laying are what pens everyone else's. Only the room's verdict stops
      // the board, and that arrives through onResult.
      if (res.state === 'caught') setStatus('Your cat is penned. Keep walling for the others.', 'win');
      else if (res.state === 'gone') setStatus('Your cat reached the rim.', 'lose');
      else setStatus('Tap the dots. Wall the cats in.');
      return;
    }
    if (res.state === 'caught') {
      stopTaps();
      announce(function () {
        setStatus('The cat is walled in — ' + taps(res.clicks) + '.' + (racing ? ' Waiting on the others.' : ''), 'win');
        if (!racing) { flash('Walled in — ' + taps(res.clicks) + '.', 'win'); armAgain(true); }
      });
    } else if (res.state === 'gone') {
      stopTaps();
      announce(function () {
        setStatus('The cat reached the edge.' + (racing ? ' Waiting on the others.' : ''), 'lose');
        if (!racing) { flash('It got away.', 'lose'); armAgain(true); }
      });
    } else {
      setStatus(racing && round ? 'Round ' + round + '.' : 'Tap the dots. Wall the cat in.');
    }
  }

  // ------------------------------------------------------------- the standings
  function drawRoster(list) {
    if (!racing) { rosterEl.hidden = true; return; }
    list = list || [];
    rosterEl.hidden = false;
    rosterEl.classList.toggle('coop', mode === 'coop');
    if (list.length < 2) {
      rosterEl.innerHTML = '<div class="wait">Waiting for someone else — they get this same board.</div>';
      return;
    }
    if (mode === 'coop') { drawTeam(list); return; }

    var lead = 0;
    list.forEach(function (p) { if (p.wins > lead) lead = p.wins; });
    var chasing = list.filter(function (p) { return p.status === 'playing'; });
    var head = round ? 'Round ' + round : 'This board';
    if (!chasing.length) head += ' · over';
    else if (chasing.length === 1) head += ' · waiting on ' + (chasing[0].mine ? 'you' : chasing[0].name);
    else head += ' · ' + chasing.length + ' still chasing';

    var rows = list.map(function (p, n) {
      var cls = 'row' + (p.mine ? ' me' : '') +
        (p.status === 'win' ? ' win' : p.status === 'lose' ? ' lose' : '');
      var crown = (lead > 0 && p.wins === lead) ? '<b class="crown" title="Leading the room">♛</b>' : '';
      var streak = p.streak > 1 ? '<b class="streak" title="' + p.streak + ' rounds in a row">🔥' + p.streak + '</b>' : '';
      var board = p.status === 'win' ? taps(p.clicks)
        : p.status === 'lose' ? 'got away'
        : taps(p.clicks) + '…';
      return '<div class="' + cls + '">' +
        '<span class="rank">' + (n + 1) + '</span>' +
        '<span class="who">' + crown + escapeHtml(p.name || 'Player') +
        (p.mine ? ' (you)' : '') + streak + '</span>' +
        '<b class="wins' + (p.wins ? '' : ' zero') + '">' + p.wins + '</b>' +
        '<span class="taps">' + board + '</span></div>';
    }).join('');

    rosterEl.innerHTML =
      '<div class="head"><span class="rank">#</span><span class="who">' + escapeHtml(head) + '</span>' +
      '<b class="wins">wins</b><span class="taps">this board</span></div>' + rows;
  }

  // No ranking here on purpose. Nobody is beating anybody in a co-op round —
  // the only number that means anything is the room's, so the head carries it
  // and the rows just say who is still chasing what.
  function drawTeam(list) {
    var chasing = list.filter(function (p) { return p.cstate === 'chasing'; });
    var out = list.filter(function (p) { return p.cstate === 'gone'; });
    var total = 0;
    list.forEach(function (p) { total += p.clicks || 0; });
    var head = round ? 'Round ' + round : 'Together';
    if (out.length) head += ' · one got out';
    else if (!chasing.length) head += ' · all penned';
    else head += ' · ' + chasing.length + ' loose';

    var rows = list.map(function (p) {
      var cls = 'row' + (p.mine ? ' me' : '') +
        (p.cstate === 'caught' ? ' win' : p.cstate === 'gone' ? ' lose' : '');
      var tone = GifCat.rules.TONES[(p.seat || 0) % GifCat.rules.TONES.length];
      var st = p.cstate === 'caught' ? 'penned' : p.cstate === 'gone' ? 'got out' : taps(p.clicks) + '…';
      return '<div class="' + cls + '">' +
        '<i class="pip" style="--tone:' + tone + '"></i>' +
        '<span class="who">' + escapeHtml(p.name || 'Player') + (p.mine ? ' (you)' : '') + '</span>' +
        '<span class="taps">' + st + '</span></div>';
    }).join('');

    rosterEl.innerHTML =
      '<div class="head"><i class="pip" style="--tone:transparent"></i>' +
      '<span class="who">' + escapeHtml(head) + '</span>' +
      '<span class="taps">' + taps(total) + '</span></div>' + rows;
  }

  // ---------------------------------------------------------------- verdicts
  function showResult(r) {
    settled = true;
    undoBtn.disabled = true;
    announce(function () {
      armAgain(true);
      if (r.mode === 'coop') { coopResult(r); return; }
      stopTaps();
      if (r.abandoned) {
        flash('Everyone else left the round.');
        setStatus('Everyone else left. Nothing to score — start a new board.');
        return;
      }
      if (r.escaped) {
        flash('The cat got away from everyone.', 'lose');
        setStatus('Nobody penned it. Next round?', 'lose');
        return;
      }
      var who = names(r.winners);
      if (r.mine && !r.shared) {
        flash('Round ' + r.n + ' is yours — ' + taps(r.clicks) + '!', 'win');
        setStatus('You take round ' + r.n + ' with ' + taps(r.clicks) + '.', 'win');
      } else if (r.shared) {
        flash('Split at ' + taps(r.clicks) + ' — ' + who + '.', r.mine ? 'win' : '');
        setStatus(who + ' tie for round ' + r.n + ' at ' + taps(r.clicks) + '.', r.mine ? 'win' : '');
      } else {
        flash(who + ' takes it — ' + taps(r.clicks) + '.', 'lose');
        setStatus(who + ' wins round ' + r.n + ' with ' + taps(r.clicks) + '.', 'lose');
      }
    });
  }

  function coopResult(r) {
    stopTaps();
    if (r.cleared) {
      flash('Every cat penned — ' + taps(r.taps) + ' between you.', 'win');
      setStatus('Round ' + r.n + ' cleared. ' + taps(r.taps) + ' between ' + r.players + '.', 'win');
    } else {
      var who = names(r.escapees);
      flash(who + (r.escapees.length === 1 && r.escapees[0].mine ? ' let one out.' : ' lost a cat.'), 'lose');
      setStatus("One cat reached the rim, so the room loses it — " + who + '. Next round?', 'lose');
    }
  }

  // -------------------------------------------------------------------- wiring
  undoBtn.addEventListener('click', function () {
    if (settled) return;
    if (!GifCat.rules.undo()) { setStatus('Nothing to undo.'); return; }
    over = false;
    stageEl.classList.remove('done');
    setClicks(GifCat.rules.clicks());
    repaint();
    push();
    setStatus(mode === 'coop' ? 'Tap the dots. Wall the cats in.' : 'Tap the dots. Wall the cat in.');
  });

  againBtn.addEventListener('click', function () {
    if (racing) root.CTCNet.startRound(0, mode);
    else start(((Math.random() * 0x7fffffff) | 1));
  });

  $('recenter').addEventListener('click', function () { GifCat.view.resetView(true); });
  $('flat').addEventListener('click', function () { GifCat.view.flatten(); });

  Array.prototype.forEach.call(modesEl.querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      var want = b.dataset.mode;
      if (!racing || want === mode) return;
      root.CTCNet.startRound(0, want);
    });
  });

  function paintModes() {
    modesEl.hidden = !racing;
    Array.prototype.forEach.call(modesEl.querySelectorAll('button'), function (b) {
      b.classList.toggle('on', b.dataset.mode === mode);
    });
  }

  var resizeAt = 0;
  root.addEventListener('resize', function () {
    clearTimeout(resizeAt);
    resizeAt = setTimeout(function () { GifCat.view.layout(); repaint(); }, 160);
  });

  // ------------------------------------------------------------------- boot
  function boot() {
    GifCat.engine.boot().then(function () {
      GifCat.view.mount({
        stage: stageEl, scene: $('scene'), plate: $('plate'),
        cells: $('cells'), cats: $('cats')
      });
      GifCat.view.onTap(tap);
      return root.CTCNet.init();
    }).then(function (info) {
      racing = !(info && info.solo);
      if (!racing) {
        mode = 'solo';
        paintModes();
        start(((Math.random() * 0x7fffffff) | 1), 'solo');
        return;
      }
      root.CTCNet.onRound = function (r) {
        round = r.n || 0;
        mode = r.mode;
        paintModes();
        start(r.seed, r.mode);
      };
      root.CTCNet.onRoster = drawRoster;
      root.CTCNet.onResult = showResult;
      root.CTCNet.onMirror = function (rows) {
        if (mode !== 'coop') return;
        GifCat.rules.mirror(rows);
        repaint();
      };
      var r = root.CTCNet.round();
      if (r && r.id) { round = r.n || 0; mode = r.mode; paintModes(); start(r.seed, r.mode); }
      else {
        // First snapshot can be empty while the host's row is still in flight.
        // Put a board up now; only mint a round if nobody else has one shortly.
        var local = ((Math.random() * 0x7fffffff) | 1);
        mode = 'race';
        paintModes();
        start(local, 'race');
        setTimeout(function () {
          if (!root.CTCNet.round().id) root.CTCNet.startRound(local, 'race');
        }, 800);
      }
      drawRoster(root.CTCNet.roster());
    }).catch(function (e) {
      setStatus('The game did not load.');
      try { root.console.error(e); } catch (x) {}
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
