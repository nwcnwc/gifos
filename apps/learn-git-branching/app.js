/* Learn Git Branching — GifOS shell. Progress lives in gifos.db. */
(function (root) {
  'use strict';

  var LGB = root.LGB;
  var LEVELS = root.LGB_LEVELS;
  var $ = function (id) { return document.getElementById(id); };

  var engine = new LGB.Engine();
  var undoStack = [];
  var logLines = [];
  var saveDb = null;
  var saveTimer = 0;

  var G = {
    levelId: 'intro-commits',
    mode: 'level',
    solved: false,
    commandCount: 0,
    solvedSet: {},
    golf: {},
    seenLesson: {},
    racing: false,
    goLevel: goLevel,
    touchSave: function () { saveSoon(); }
  };
  root.LGBApp = G;

  function esc(s) {
    return String(s || '').replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  }

  function md(src) {
    var blocks = String(src || '').split(/\n{2,}/);
    return blocks.map(function (block) {
      block = block.replace(/<[^>]+>/g, '');
      var lines = block.split('\n');
      if (/^### /.test(lines[0])) return '<h3>' + inline(lines[0].slice(4)) + '</h3>';
      if (/^## /.test(lines[0])) return '<h2>' + inline(lines[0].slice(3)) + '</h2>';
      if (/^# /.test(lines[0])) return '<h2>' + inline(lines[0].slice(2)) + '</h2>';
      if (/^```/.test(block)) {
        return '<pre>' + esc(lines.slice(1, /```$/.test(lines[lines.length - 1]) ? -1 : lines.length).join('\n')) + '</pre>';
      }
      if (/^[-*] /.test(lines[0])) {
        return '<ul>' + lines.map(function (l) {
          return '<li>' + inline(l.replace(/^[-*] /, '')) + '</li>';
        }).join('') + '</ul>';
      }
      return '<p>' + lines.map(inline).join('<br>') + '</p>';
    }).join('');
  }
  function inline(s) {
    return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function currentLevel() { return LEVELS.levels[G.levelId]; }

  function snapshot() {
    return {
      tree: engine.exportTree(),
      count: G.commandCount,
      solved: G.solved
    };
  }
  function pushUndo() { undoStack.push(snapshot()); if (undoStack.length > 80) undoStack.shift(); }

  function paint() {
    var tree = engine.exportTree();
    var localSvg = $('graph');
    var originWrap = $('origin-wrap');
    var originSvg = $('origin');
    var goalSvg = $('goal');
    if (engine.clonePending) {
      localSvg.classList.add('dim');
    } else localSvg.classList.remove('dim');
    root.LGBVis.render(localSvg, tree, { title: tree.originTree ? 'Local' : '' });
    if (tree.originTree) {
      originWrap.hidden = false;
      root.LGBVis.render(originSvg, tree.originTree, { title: 'Origin' });
    } else {
      originWrap.hidden = true;
    }
    var lv = currentLevel();
    var goal = null;
    if (G.mode === 'level' && lv && goalSvg) {
      $('goal-block').hidden = false;
      try {
        goal = LGB.unescapeTree(lv.goalTreeString);
        root.LGBVis.render(goalSvg, goal, { title: 'Goal' });
      } catch (e) {}
    } else {
      $('goal-block').hidden = true;
    }
    paintFiles(tree, 'files', 'workdir', 'staged');
    paintFiles(goal || {}, 'goal-files', 'goal-workdir', 'goal-staged');

    var status = $('status');
    if (G.mode === 'sandbox') {
      status.textContent = 'Sandbox — type git commands. `levels` opens the lessons.';
    } else if (G.solved) {
      var best = G.golf[G.levelId];
      var par = (lv.solutionCommand || '').split(';').filter(Boolean).length;
      status.textContent = 'Solved in ' + G.commandCount + ' command' + (G.commandCount === 1 ? '' : 's') +
        (par ? ' (par ' + par + ')' : '') +
        (best && best < G.commandCount ? '. Best: ' + best : '') + '.';
    } else {
      status.textContent = (lv ? lv.name : 'Lesson') +
        (G.commandCount ? ' · ' + G.commandCount + ' cmds' : '');
    }

    var log = $('log');
    log.innerHTML = logLines.slice(-40).map(function (l) {
      return '<div class="' + l.k + '">' + esc(l.t) + '</div>';
    }).join('');
    log.scrollTop = log.scrollHeight;

    $('solved-banner').hidden = !(G.mode === 'level' && G.solved);
    document.body.classList.toggle('has-origin', !!tree.originTree);
    document.body.classList.toggle('has-files', !$('files').hidden);
    fillSelect();
  }

  function paintFiles(tree, wrapId, wdId, stId) {
    var wrap = $(wrapId);
    var wdEl = $(wdId);
    var stEl = $(stId);
    if (!wrap || !wdEl || !stEl) return;
    var w = (tree && tree.workingChanges) || {};
    var engaged = !!(tree && (tree.changesModelEngaged || Object.keys(w).length));
    wrap.hidden = !engaged;
    if (!engaged) return;
    var wd = [];
    var st = [];
    Object.keys(w).sort().forEach(function (p) {
      if (w[p] === 'staged') st.push(p);
      else wd.push(p);
    });
    function fill(el, names) {
      el.innerHTML = names.length
        ? names.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('')
        : '<li class="empty">empty</li>';
    }
    fill(wdEl, wd);
    fill(stEl, st);
  }

  function logLine(kind, text) {
    logLines.push({ k: kind, t: text });
    if (logLines.length > 80) logLines.shift();
  }

  function checkSolved() {
    if (G.mode !== 'level' || G.solved) return;
    var lv = currentLevel();
    if (!lv) return;
    try {
      if (LGB.Compare.dispatchFromLevel(lv, engine.exportTree())) {
        G.solved = true;
        G.solvedSet[G.levelId] = true;
        var prev = G.golf[G.levelId];
        if (prev == null || G.commandCount < prev) G.golf[G.levelId] = G.commandCount;
        logLine('ok', 'Level solved! Goal tree matched.');
        if (root.LGBNet && root.LGBNet.live()) root.LGBNet.onSolved();
        saveSoon();
      }
    } catch (e) {}
  }

  function run(line) {
    line = String(line || '').trim();
    if (!line) return;
    var lower = line.toLowerCase();
    if (lower === 'undo') { doUndo(); return; }
    if (lower === 'reset' || lower === 'level reset' || lower === 'reset level') {
      resetLevel(); return;
    }
    if (lower === 'levels' || lower === 'menu') { openLevels(); return; }
    if (lower === 'hint') { showHint(); return; }
    if (lower === 'help') { showHint(); return; }
    if (lower === 'sandbox') { goSandbox(); return; }
    if (lower === 'show goal' || lower === 'goal') { $('goal-block').hidden = !$('goal-block').hidden; return; }

    var lv = currentLevel();
    if (G.mode === 'level' && lv && lv.disabledMap) {
      engine.disabledMap = lv.disabledMap;
    } else engine.disabledMap = {};

    pushUndo();
    logLine('cmd', '$ ' + line);
    var r;
    try {
      r = engine.runLines(line);
    } catch (e) {
      logLine('err', e.message || String(e));
      paint();
      return;
    }
    if (r.kind === 'interactive') {
      openRebase(r);
      paint();
      return;
    }
    if (r.kind === 'error') {
      logLine('err', r.msg);
    } else if (r.kind === 'result') {
      logLine('out', r.msg);
    } else if (r.msg) {
      logLine('out', r.msg);
    }
    if (r.warnings) r.warnings.forEach(function (w) { logLine('warn', w); });
    if (r.kind !== 'error') {
      G.commandCount += line.split(';').filter(function (s) { return s.trim(); }).length || 1;
      if (root.LGBNet && root.LGBNet.live()) root.LGBNet.onCommand();
    }
    checkSolved();
    saveSoon();
    paint();
  }

  function doUndo() {
    var snap = undoStack.pop();
    if (!snap) { logLine('warn', 'Nothing to undo.'); paint(); return; }
    engine.loadTree(snap.tree);
    G.commandCount = snap.count;
    G.solved = !!snap.solved;
    logLine('ok', 'Undid last command.');
    paint();
    saveSoon();
  }

  function resetLevel() {
    undoStack = [];
    logLines = [];
    G.solved = false;
    G.commandCount = 0;
    var lv = currentLevel();
    engine.disabledMap = (lv && lv.disabledMap) || {};
    if (G.mode === 'sandbox') engine.loadTree(null);
    else engine.loadTree(lv && lv.startTree);
    logLine('ok', 'Reset.');
    paint();
    saveSoon();
  }

  function goLevel(id, opts) {
    opts = opts || {};
    if (!LEVELS.levels[id]) return;
    G.levelId = id;
    G.mode = 'level';
    G.solved = false;
    G.commandCount = 0;
    undoStack = [];
    if (!opts.keepLog) logLines = [];
    var lv = currentLevel();
    engine.disabledMap = lv.disabledMap || {};
    engine.loadTree(lv.startTree);
    $('level-sheet').hidden = true;
    $('lesson').hidden = true;
    $('select').value = id;
    if (!opts.silent) logLine('ok', 'Lesson: ' + lv.name);
    paint();
    if (!opts.freshSkipLesson && !G.seenLesson[id] && lv.slides && lv.slides.length && !opts.race) {
      openLesson(0);
    }
    saveSoon();
    if (!opts.race && root.LGBNet && root.LGBNet.live()) root.LGBNet.onLevel(id);
  }

  function goSandbox() {
    G.mode = 'sandbox';
    G.levelId = 'sandbox';
    G.solved = false;
    G.commandCount = 0;
    undoStack = [];
    engine.disabledMap = {};
    engine.loadTree(null);
    logLine('ok', 'Sandbox. `git commit`, `git branch`, `git fakeCreateRemote`…');
    $('level-sheet').hidden = true;
    paint();
    saveSoon();
  }

  function fillSelect() {
    var sel = $('select');
    var cur = sel.value;
    var html = '<option value="sandbox"' + (G.mode === 'sandbox' ? ' selected' : '') + '>Sandbox</option>';
    LEVELS.sequences.forEach(function (seq) {
      html += '<optgroup label="' + esc(seq.name) + '">';
      seq.levels.forEach(function (id) {
        var lv = LEVELS.levels[id];
        var mark = G.solvedSet[id] ? ' ✓' : '';
        html += '<option value="' + esc(id) + '"' +
          (G.mode === 'level' && id === G.levelId ? ' selected' : '') + '>' +
          esc(lv.name) + mark + '</option>';
      });
      html += '</optgroup>';
    });
    sel.innerHTML = html;
    if (G.mode === 'sandbox') sel.value = 'sandbox';
    else sel.value = G.levelId;
  }

  function openLevels() {
    var box = $('level-list');
    box.innerHTML = LEVELS.sequences.map(function (seq) {
      var items = seq.levels.map(function (id) {
        var lv = LEVELS.levels[id];
        var mark = G.solvedSet[id] ? ' class="done"' : '';
        return '<button type="button" data-id="' + esc(id) + '"' + mark + '>' +
          esc(lv.name) + (G.solvedSet[id] ? ' ✓' : '') + '</button>';
      }).join('');
      return '<section><h3>' + esc(seq.name) + '</h3><p>' + esc(seq.about) + '</p><div class="grid">' + items + '</div></section>';
    }).join('');
    $('level-sheet').hidden = false;
  }

  var lessonIndex = 0;
  var lessonDemoEngine = null;

  function openLesson(i) {
    var lv = currentLevel();
    if (!lv || !lv.slides || !lv.slides.length) return;
    lessonIndex = Math.max(0, Math.min(i, lv.slides.length - 1));
    var slide = lv.slides[lessonIndex];
    var body = $('lesson-body');
    var demo = $('lesson-demo');
    $('lesson').hidden = false;
    $('lesson-pos').textContent = (lessonIndex + 1) + ' / ' + lv.slides.length;
    $('lesson-back').disabled = lessonIndex === 0;
    $('lesson-next').textContent = lessonIndex === lv.slides.length - 1 ? 'Start' : 'Next';
    if (slide.type === 'demo') {
      body.innerHTML = md((slide.before || []).join('\n\n'));
      demo.hidden = false;
      lessonDemoEngine = new LGB.Engine();
      lessonDemoEngine.loadTree(lv.startTree);
      if (slide.beforeCommand) lessonDemoEngine.runLines(slide.beforeCommand);
      root.LGBVis.render($('lesson-graph'), lessonDemoEngine.exportTree());
      $('lesson-run').textContent = 'Run `' + slide.command + '`';
      $('lesson-run').onclick = function () {
        if (slide.command) lessonDemoEngine.runLines(slide.command);
        root.LGBVis.render($('lesson-graph'), lessonDemoEngine.exportTree());
        if (slide.after && slide.after.length) {
          body.innerHTML = md((slide.before || []).join('\n\n')) + md(slide.after.join('\n\n'));
        }
        $('lesson-run').hidden = true;
      };
      $('lesson-run').hidden = false;
    } else {
      demo.hidden = true;
      body.innerHTML = md((slide.markdowns || []).join('\n\n'));
    }
  }

  function closeLesson() {
    $('lesson').hidden = true;
    var lv = currentLevel();
    if (lv) {
      G.seenLesson[lv.id] = true;
      saveSoon();
    }
  }

  function showHint() {
    var lv = currentLevel();
    if (G.mode === 'sandbox') {
      logLine('out', 'Sandbox commands: commit, branch, checkout, merge, rebase, reset, revert, cherry-pick, tag, fetch, pull, push, clone, fakeTeamwork, fakeCreateRemote. Helper: undo, reset, levels.');
      paint();
      return;
    }
    if (lv && lv.hint) {
      $('hint-body').innerHTML = md(lv.hint);
      $('hint-sheet').hidden = false;
    }
  }

  var rebaseState = null;
  function openRebase(r) {
    rebaseState = r;
    var box = $('rebase-list');
    box.innerHTML = r.commits.map(function (id, i) {
      return '<li draggable="true" data-id="' + esc(id) + '">' +
        '<span class="pick">pick</span> ' + esc(id) +
        '<button type="button" class="drop" data-i="' + i + '">drop</button>' +
        '<button type="button" class="up" data-i="' + i + '">↑</button>' +
        '<button type="button" class="dn" data-i="' + i + '">↓</button></li>';
    }).join('');
    $('rebase-sheet').hidden = false;
  }
  function closeRebase(apply) {
    $('rebase-sheet').hidden = true;
    if (!rebaseState) return;
    if (apply) {
      var ids = [];
      $('rebase-list').querySelectorAll('li').forEach(function (li) {
        if (!li.classList.contains('dropped')) ids.push(li.getAttribute('data-id'));
      });
      try {
        engine.rebaseFinish(ids, {}, rebaseState.onto, rebaseState.current);
        G.commandCount += 1;
        logLine('ok', 'Rebase complete.');
        checkSolved();
      } catch (e) {
        logLine('err', e.msg || e.message || String(e));
      }
      saveSoon();
      paint();
    } else {
      logLine('warn', 'Rebase aborted.');
      var snap = undoStack.pop();
      if (snap) {
        engine.loadTree(snap.tree);
        G.commandCount = snap.count;
      }
      paint();
    }
    rebaseState = null;
  }

  function nextLevel() {
    var order = [];
    LEVELS.sequences.forEach(function (s) { order = order.concat(s.levels); });
    var i = order.indexOf(G.levelId);
    var n = order[i + 1];
    if (n) goLevel(n);
    else goSandbox();
  }

  function saveSoon() {
    if (!saveDb) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 200);
  }
  function persist() {
    if (!saveDb) return;
    saveDb.put({
      id: 'save',
      levelId: G.levelId,
      mode: G.mode,
      tree: engine.exportTree(),
      commandCount: G.commandCount,
      solved: G.solved,
      solvedSet: G.solvedSet,
      golf: G.golf,
      seenLesson: G.seenLesson,
      racing: !!G.racing
    }).catch(function () {});
  }

  function restore(row) {
    if (!row) return;
    G.solvedSet = row.solvedSet || {};
    G.golf = row.golf || {};
    G.seenLesson = row.seenLesson || {};
    if (row.levelId && LEVELS.levels[row.levelId]) G.levelId = row.levelId;
    G.mode = row.mode === 'sandbox' ? 'sandbox' : 'level';
    G.commandCount = row.commandCount || 0;
    G.solved = !!row.solved;
    G.racing = !!row.racing;
    if (row.tree) engine.loadTree(row.tree);
    else if (G.mode === 'sandbox') engine.loadTree(null);
    else {
      var lv = currentLevel();
      engine.loadTree(lv && lv.startTree);
    }
  }

  var stack = [];
  function pushModal(closeFn) { stack.push(closeFn); }
  function popModal() {
    var fn = stack.pop();
    if (fn) fn();
    return !!fn;
  }

  function boot() {
    fillSelect();
    root.LGBVis.enablePan($('graph'));
    root.LGBVis.enablePan($('origin'));

    $('select').addEventListener('change', function () {
      if (this.value === 'sandbox') goSandbox();
      else goLevel(this.value);
    });
    $('cmd').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var v = this.value;
        this.value = '';
        run(v);
      }
    });
    $('runBtn').addEventListener('click', function () {
      var v = $('cmd').value;
      $('cmd').value = '';
      run(v);
      $('cmd').focus();
    });
    document.querySelectorAll('[data-chip]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-chip');
        if (t === 'undo') { doUndo(); return; }
        if (t === 'reset') { resetLevel(); return; }
        if (t === 'hint') { showHint(); return; }
        if (t === 'levels') { openLevels(); return; }
        $('cmd').value = t;
        $('cmd').focus();
      });
    });
    $('level-list').addEventListener('click', function (e) {
      var id = e.target && e.target.getAttribute('data-id');
      if (id) goLevel(id);
    });
    $('level-close').addEventListener('click', function () { $('level-sheet').hidden = true; });
    $('sandboxBtn').addEventListener('click', goSandbox);
    $('hint-close').addEventListener('click', function () { $('hint-sheet').hidden = true; });
    $('lesson-back').addEventListener('click', function () { openLesson(lessonIndex - 1); });
    $('lesson-next').addEventListener('click', function () {
      var lv = currentLevel();
      if (lessonIndex >= lv.slides.length - 1) closeLesson();
      else openLesson(lessonIndex + 1);
    });
    $('lesson-skip').addEventListener('click', closeLesson);
    $('nextBtn').addEventListener('click', nextLevel);
    $('againBtn').addEventListener('click', function () {
      var order = [];
      LEVELS.sequences.forEach(function (s) { order = order.concat(s.levels); });
      var i = order.indexOf(G.levelId);
      var n = order[i + 1] || order[0];
      if (root.LGBNet && root.LGBNet.live()) root.LGBNet.nextRound(n);
      else goLevel(n);
    });
    $('leaveBtn').addEventListener('click', function () {
      if (root.LGBNet) root.LGBNet.leave();
    });
    $('friendBtn').addEventListener('click', function () {
      if (root.LGBNet) root.LGBNet.join(G.levelId);
    });
    $('rebase-ok').addEventListener('click', function () { closeRebase(true); });
    $('rebase-abort').addEventListener('click', function () { closeRebase(false); });
    $('rebase-list').addEventListener('click', function (e) {
      var i = e.target.getAttribute('data-i');
      if (i == null) return;
      i = +i;
      var items = [].slice.call($('rebase-list').children);
      if (e.target.classList.contains('drop')) items[i].classList.toggle('dropped');
      if (e.target.classList.contains('up') && i > 0) {
        items[i - 1].before(items[i]);
      }
      if (e.target.classList.contains('dn') && i < items.length - 1) {
        items[i + 1].after(items[i]);
      }
    });

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (!$('lesson').hidden) { closeLesson(); return true; }
        if (!$('hint-sheet').hidden) { $('hint-sheet').hidden = true; return true; }
        if (!$('level-sheet').hidden) { $('level-sheet').hidden = true; return true; }
        if (!$('rebase-sheet').hidden) { closeRebase(false); return true; }
        return false;
      });
    }

    var p = Promise.resolve();
    if (root.gifos && root.gifos.db) {
      saveDb = root.gifos.db('save');
      p = saveDb.get('save').then(function (row) { restore(row); }).catch(function () {});
    }
    p.then(function () {
      if (!engine.commits || !Object.keys(engine.commits).length) {
        if (G.mode === 'sandbox') engine.loadTree(null);
        else {
          var lv = currentLevel();
          engine.loadTree(lv && lv.startTree);
        }
      }
      paint();
      return root.LGBNet ? root.LGBNet.init() : { owner: true, others: 0 };
    }).then(function () {
      if (root.LGBNet) root.LGBNet.bootJoin();
      var inRace = root.LGBNet && root.LGBNet.live();
      if (!inRace && G.mode === 'level' && currentLevel() && currentLevel().slides && !G.seenLesson[G.levelId]) {
        openLesson(0);
      }
    });

    if (root.gifos && root.gifos.launch) {
      root.gifos.launch().then(function (a) {
        if (a && a.level && LEVELS.levels[a.level]) goLevel(a.level, { silent: true });
      }).catch(function () {});
    }

    $('cmd').focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
