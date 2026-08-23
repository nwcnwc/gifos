// Cube Composer shell: level select, tap/drag program, canvas, private save.
(function (root) {
  'use strict';

  var CC = root.CC;
  var $ = function (id) { return document.getElementById(id); };

  var G = {
    levelId: CC.firstLevel,
    program: [],
    solved: false,
    programs: {},
    solvedSet: {}
  };
  root.CCGame = G;

  var saveDb = null;
  var saveTimer = 0;
  var drag = null;
  try {
    if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save');
  } catch (e) {}

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  }

  function nameToHTML(s) {
    s = String(s);
    s = s.replace(/\{(X|Cyan|Brown|Red|Orange|Yellow)\}/g, function (_, c) {
      return '<span class="cube ' + c + '"></span>';
    });
    s = s.replace(/\[/g, '<span class="stack">').replace(/\]/g, '</span>');
    return s;
  }

  function replaceTransformers(ch, text) {
    if (!text) return '';
    var out = text;
    ch.transformers.forEach(function (t) {
      out = out.split('`' + t.id + '`').join('<span class="transformer">' + nameToHTML(t.name) + '</span>');
    });
    return out;
  }

  function currentChapter() { return CC.getChapter(G.levelId); }
  function currentLevel() { return CC.getLevel(G.levelId); }

  function stepsNow() {
    var ch = currentChapter();
    var lv = currentLevel();
    return CC.allSteps(CC.getFns(ch, G.program), lv.initial);
  }

  function paintCanvases() {
    var main = $('canvas');
    var goal = $('goal');
    var dpr = root.devicePixelRatio || 1;
    var mr = main.getBoundingClientRect();
    var gr = goal.getBoundingClientRect();
    CC.isoFaces.sizeCanvas(main, Math.max(1, mr.width), Math.max(1, mr.height), dpr);
    CC.isoFaces.sizeCanvas(goal, Math.max(1, gr.width), Math.max(1, gr.height), dpr);
    var lv = currentLevel();
    var steps = stepsNow();
    CC.isoFaces.paint(main, CC.isoFaces.steps(steps), { dpr: dpr, pad: 18 });
    CC.isoFaces.paint(goal, CC.isoFaces.wall(lv.target, 0), { dpr: dpr, pad: 10 });
  }

  function fillSelect() {
    var sel = $('levels');
    var html = '';
    CC.chapters.forEach(function (ch) {
      html += '<optgroup label="' + esc(ch.name) + '">';
      ch.levels.forEach(function (lv) {
        var mark = G.solvedSet[lv.id] ? ' ✓' : '';
        html += '<option value="' + esc(lv.id) + '"' +
          (lv.id === G.levelId ? ' selected' : '') + '>' +
          esc(CC.levelTitle(lv)) + mark + '</option>';
      });
      html += '</optgroup>';
    });
    sel.innerHTML = html;
  }

  function renderLists() {
    var ch = currentChapter();
    var used = {};
    G.program.forEach(function (id) { used[id] = true; });
    var avail = $('available');
    var prog = $('program');
    avail.innerHTML = '';
    prog.innerHTML = '';
    ch.transformers.forEach(function (t) {
      if (!used[t.id]) avail.appendChild(fnItem(t));
    });
    G.program.forEach(function (id) {
      var t = ch.lookup[id];
      if (t) prog.appendChild(fnItem(t));
    });
  }

  function fnItem(t) {
    var li = document.createElement('li');
    li.setAttribute('data-id', t.id);
    li.innerHTML = nameToHTML(t.name);
    li.addEventListener('pointerdown', onPointerDown);
    return li;
  }

  function renderHelp() {
    var ch = currentChapter();
    var lv = currentLevel();
    $('help').innerHTML = lv.help ? replaceTransformers(ch, lv.help) : '';
  }

  function renderSolved() {
    var steps = stepsNow();
    var last = steps[steps.length - 1];
    var match = CC.wallsEqual(last, currentLevel().target);
    var was = G.solved;
    G.solved = match;
    if (match) G.solvedSet[G.levelId] = true;
    var msg = $('message');
    var badge = $('solved');
    msg.hidden = !match;
    if (match && !was) {
      badge.classList.remove('flash');
      void badge.offsetWidth;
      badge.classList.add('flash');
      if (root.CCMp) root.CCMp.onSolved();
    }
  }

  function render() {
    renderLists();
    renderHelp();
    paintCanvases();
    renderSolved();
    if (root.CCMp) root.CCMp.onChange();
  }

  function saveSoon() {
    G.programs[G.levelId] = G.program.slice();
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveDb.put({
        id: 'save',
        currentLevel: G.levelId,
        programs: G.programs,
        solved: G.solvedSet
      }).catch(function () {});
    }, 200);
  }

  function setProgram(ids) {
    G.program = ids.slice();
    G.programs[G.levelId] = G.program.slice();
    render();
    saveSoon();
  }

  function addFn(id) {
    if (G.program.indexOf(id) >= 0) return;
    setProgram(G.program.concat([id]));
  }

  function removeFn(id) {
    setProgram(G.program.filter(function (x) { return x !== id; }));
  }

  function onPointerDown(e) {
    if (e.button && e.button !== 0) return;
    var li = e.currentTarget;
    var list = li.parentNode.id;
    drag = {
      el: li,
      list: list,
      id: li.getAttribute('data-id'),
      x: e.clientX,
      y: e.clientY,
      moved: false,
      pointerId: e.pointerId
    };
    try { li.setPointerCapture(e.pointerId); } catch (err) {}
    li.addEventListener('pointermove', onPointerMove);
    li.addEventListener('pointerup', onPointerUp);
    li.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && dx * dx + dy * dy < 256) return;
    drag.moved = true;
    if (drag.list !== 'program') return;
    drag.el.classList.add('ghost');
    var prog = $('program');
    var kids = [].slice.call(prog.children).filter(function (n) { return n !== drag.el; });
    var before = null, i, r;
    for (i = 0; i < kids.length; i++) {
      r = kids[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { before = kids[i]; break; }
    }
    if (before) prog.insertBefore(drag.el, before);
    else prog.appendChild(drag.el);
  }

  function onPointerUp() {
    if (!drag) return;
    var el = drag.el;
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    el.classList.remove('ghost');
    if (!drag.moved) {
      if (drag.list === 'available') addFn(drag.id);
      else removeFn(drag.id);
    } else if (drag.list === 'program') {
      var ids = [].map.call($('program').children, function (n) { return n.getAttribute('data-id'); });
      setProgram(ids);
    }
    drag = null;
  }

  function goLevel(id, opt) {
    opt = opt || {};
    if (!CC.getLevel(id)) return;
    G.programs[G.levelId] = G.program.slice();
    G.levelId = id;
    G.program = opt.fresh ? [] : (G.programs[id] || []).slice();
    G.solved = false;
    fillSelect();
    render();
    if (!opt.race) saveSoon();
  }
  G.goLevel = goLevel;

  function resetLevel() {
    setProgram([]);
  }

  function nextLevel() {
    if (root.CCMp && root.CCMp.on) {
      root.CCMp.playAgain();
      return;
    }
    goLevel(CC.nextLevel(G.levelId));
  }

  function prevLevel() {
    if (root.CCMp && root.CCMp.on) return;
    goLevel(CC.prevLevel(G.levelId));
  }

  $('levels').addEventListener('change', function () {
    if (root.CCMp && root.CCMp.on) {
      this.value = G.levelId;
      return;
    }
    goLevel(this.value);
  });
  $('resetBtn').addEventListener('click', resetLevel);
  $('nextBtn').addEventListener('click', nextLevel);

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    var k = e.key;
    if (k === 'r' || k === 'R') resetLevel();
    else if (k === 'n' || k === 'N' || k === 'ArrowRight') nextLevel();
    else if (k === 'p' || k === 'P' || k === 'ArrowLeft') prevLevel();
  });

  var resizeTimer = 0;
  root.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(paintCanvases, 50);
  });

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (root.CCMp && root.CCMp.on) root.CCMp.leave();
    });
  }

  function boot() {
    fillSelect();
    render();
    root.requestAnimationFrame(function () { paintCanvases(); });
    if (root.ResizeObserver) {
      var ro = new ResizeObserver(function () { paintCanvases(); });
      ro.observe($('stage'));
      ro.observe($('goal'));
    }
    if (root.CCMp) root.CCMp.watch();
  }

  if (saveDb && saveDb.get) {
    saveDb.get('save').then(function (row) {
      if (row) {
        if (row.currentLevel && CC.getLevel(row.currentLevel)) G.levelId = row.currentLevel;
        if (row.programs) G.programs = row.programs;
        if (row.solved) G.solvedSet = row.solved;
        G.program = (G.programs[G.levelId] || []).slice();
      }
      boot();
    }).catch(boot);
  } else {
    boot();
  }
})(window);
