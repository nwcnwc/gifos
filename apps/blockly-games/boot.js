/*
 * Blockly Games — GifOS shell.
 * Progress in gifos.db. Invite is OS chrome. Back leaves a game for the list.
 */
(function (root) {
  'use strict';

  var workspace = null, gameName = 'home', level = 1, adopting = false, darkTheme = null;
  var saveTimer = 0, xmlCache = {}, solved = { puzzle: false, maze: [], turtle: [] };
  var onChangeQuiet = false;

  function $(id) { return document.getElementById(id); }

  function phone() {
    return window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
  }

  function speed() {
    var el = $('speed');
    return el ? Number(el.value) : 50;
  }

  function engine() {
    if (gameName === 'maze') return root.MazeGame;
    if (gameName === 'turtle') return root.TurtleGame;
    if (gameName === 'puzzle') return root.PuzzleGame;
    return null;
  }

  function parseXml(text) {
    if (root.Blockly.utils && root.Blockly.utils.xml && root.Blockly.utils.xml.textToDom) {
      return root.Blockly.utils.xml.textToDom(text);
    }
    return new DOMParser().parseFromString(text, 'text/xml').documentElement;
  }

  function xmlOf() {
    if (!workspace || !root.Blockly || !root.Blockly.Xml) return xmlCache[gameName + ':' + level] || '';
    try {
      return root.Blockly.Xml.domToText(root.Blockly.Xml.workspaceToDom(workspace));
    } catch (e) { return ''; }
  }

  function loadXml(text) {
    if (!workspace || !text) return;
    try {
      var dom = parseXml(text);
      workspace.clear();
      root.Blockly.Xml.domToWorkspace(dom, workspace);
    } catch (e) {}
  }

  function snapshot() {
    return {
      id: 'save',
      game: gameName,
      level: level,
      solved: solved,
      xml: xmlCache
    };
  }

  function saveDb() {
    if (!root.gifos || !root.gifos.db) return;
    if (gameName !== 'home') xmlCache[gameName + ':' + level] = xmlOf();
    root.gifos.db('save').put(snapshot()).catch(function () {});
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDb, 350);
  }

  function markSolved() {
    if (gameName === 'puzzle') solved.puzzle = true;
    else if (gameName === 'maze' && solved.maze.indexOf(level) < 0) solved.maze.push(level);
    else if (gameName === 'turtle' && solved.turtle.indexOf(level) < 0) solved.turtle.push(level);
    paintHome();
    paintLevels();
    scheduleSave();
  }

  function paintHome() {
    var mp = solved.maze.length, tp = solved.turtle.length;
    $('prog-puzzle').textContent = solved.puzzle ? 'Solved' : 'One puzzle';
    $('prog-maze').textContent = mp ? mp + ' / 10 paths' : '10 paths';
    $('prog-turtle').textContent = tp ? tp + ' / 10 pictures' : '10 pictures';
  }

  function paintLevels() {
    var nav = $('levels'), g = engine();
    nav.innerHTML = '';
    if (!g || g.maxLevel < 2) return;
    var done = gameName === 'maze' ? solved.maze : solved.turtle;
    for (var i = 1; i <= g.maxLevel; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(i);
      if (i === level) b.className = 'on';
      if (done.indexOf(i) >= 0) b.classList.add('done');
      b.setAttribute('data-level', String(i));
      nav.appendChild(b);
    }
  }

  function beep(ok) {
    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine';
      o.frequency.value = ok ? 880 : 220;
      g.gain.value = 0.05;
      o.connect(g); g.connect(ac.destination);
      o.start();
      setTimeout(function () { o.stop(); ac.close(); }, ok ? 180 : 280);
    } catch (e) {}
  }

  function showModal(text, then) {
    $('modal-body').textContent = text;
    $('modal').hidden = false;
    $('modal-ok').onclick = function () {
      $('modal').hidden = true;
      if (then) then();
    };
  }

  function patchSprites() {
    var url = root.BG_ASSETS && root.BG_ASSETS.sprites;
    if (!url) return;
    Array.prototype.forEach.call(document.querySelectorAll('image'), function (img) {
      var href = img.getAttribute('href') || img.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
      if (href.indexOf('sprites.png') >= 0) {
        img.setAttribute('href', url);
        img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll('style'), function (st) {
      if (st.textContent && st.textContent.indexOf('sprites.png') >= 0) {
        st.textContent = st.textContent.replace(/url\((['"]?)[^)]*sprites\.png\1\)/g, function () {
          return 'url("' + url + '")';
        });
      }
    });
  }

  function disposeWs() {
    if (workspace) {
      try { workspace.dispose(); } catch (e) {}
      workspace = null;
    }
    $('blockly').innerHTML = '';
  }

  function inject(g) {
    disposeWs();
    root.BGBlocks.initCommon();
    if (gameName === 'maze') root.BGBlocks.initMaze();
    if (gameName === 'turtle') root.BGBlocks.initTurtle();
    if (gameName === 'puzzle') root.BGBlocks.initPuzzle();
    var opts = {
      trashcan: gameName !== 'puzzle',
      sounds: false,
      media: './',
      zoom: {
        controls: true,
        wheel: true,
        startScale: phone() ? 0.72 : (gameName === 'maze' ? 1.15 - level * 0.03 : 1),
        maxScale: 2,
        minScale: 0.4
      },
      move: { scrollbars: true, drag: true, wheel: true },
      maxBlocks: g.maxBlocks(level),
      renderer: 'geras'
    };
    if (gameName !== 'puzzle') opts.toolbox = g.toolbox(level);
    if (!darkTheme && root.Blockly.Themes && root.Blockly.Themes.Classic) {
      try {
        darkTheme = root.Blockly.Theme.defineTheme('gifosdark', {
          base: root.Blockly.Themes.Classic,
          componentStyles: {
            workspaceBackgroundColour: '#0e121a',
            toolboxBackgroundColour: '#161b28',
            toolboxForegroundColour: '#e8e4d8',
            flyoutBackgroundColour: '#121722',
            scrollbarColour: '#3a4258',
            insertionMarkerColour: '#7ecf7e'
          }
        });
      } catch (e) { darkTheme = root.Blockly.Themes.Classic; }
    }
    if (darkTheme) opts.theme = darkTheme;
    workspace = root.Blockly.inject($('blockly'), opts);
    patchSprites();
    setTimeout(patchSprites, 50);
    var view = $('view');
    g.mount(workspace, view, level);
    var key = gameName + ':' + level;
    if (xmlCache[key]) loadXml(xmlCache[key]);
    else if (gameName === 'puzzle') g.seedIfEmpty();
    else loadXml(g.defaultXml(level));
    workspace.addChangeListener(function (ev) {
      if (onChangeQuiet) return;
      if (ev && ev.isUiEvent) return;
      scheduleSave();
      if (!adopting && root.Net && root.Net.live()) root.Net.bump();
      var cap = workspace.remainingCapacity && workspace.remainingCapacity();
      var el = $('capacity');
      if (el) {
        if (cap === Infinity || cap == null) el.hidden = true;
        else { el.hidden = false; el.textContent = cap + ' blocks left'; }
      }
    });
    root.Blockly.svgResize(workspace);
  }

  function setChrome() {
    var puzzle = gameName === 'puzzle';
    $('run').hidden = puzzle;
    $('reset').hidden = true;
    $('check').hidden = !puzzle;
    $('speed').parentNode.style.display = puzzle ? 'none' : '';
    $('title').textContent = gameName === 'maze' ? 'Maze' : gameName === 'turtle' ? 'Turtle' : 'Puzzle';
    $('hint').hidden = false;
    $('play').classList.toggle('is-puzzle', gameName === 'puzzle');
    paintLevels();
  }

  function showPlay(name, lv, xml, fromNet) {
    gameName = name;
    level = Math.max(1, Math.min(engine().maxLevel, lv || 1));
    if (xml) xmlCache[name + ':' + level] = xml;
    $('home').hidden = true;
    $('play').hidden = false;
    setChrome();
    inject(engine());
    if (!fromNet && root.Net && root.Net.live()) root.Net.bump();
    scheduleSave();
  }

  function showHome() {
    if (gameName !== 'home') {
      xmlCache[gameName + ':' + level] = xmlOf();
      if (engine()) engine().reset();
    }
    disposeWs();
    gameName = 'home';
    $('play').hidden = true;
    $('home').hidden = false;
    paintHome();
    scheduleSave();
    if (root.Net && root.Net.live()) root.Net.bump();
  }

  function resultOf(res) {
    $('run').hidden = false;
    $('reset').hidden = true;
    if (res === 'win' || res === true) {
      beep(true);
      markSolved();
      var g = engine();
      if (gameName === 'puzzle') showModal('Perfect! All the pieces fit.');
      else if (level < g.maxLevel) {
        showModal('Congratulations! Ready for level ' + (level + 1) + '?', function () {
          showPlay(gameName, level + 1);
        });
      } else {
        showModal('Congratulations! You finished ' + gameName + '.');
      }
    } else if (res === 'loop') {
      showModal('Your solution works, but you can do better. Draw it with a loop.');
    } else if (res === 'stack') {
      showModal('On this level, stack all the blocks together in the workspace.');
    } else if (res === 'crash' || res === 'fail' || res === false) {
      beep(false);
    }
  }

  function go() {
    root.BGBlocks.initCommon();
    paintHome();

    document.querySelectorAll('.card').forEach(function (c) {
      c.addEventListener('click', function () {
        showPlay(c.getAttribute('data-game'), 1);
      });
    });
    $('back').addEventListener('click', showHome);
    $('levels').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      showPlay(gameName, parseInt(b.getAttribute('data-level'), 10));
    });
    $('run').addEventListener('click', function () {
      var g = engine();
      if (!g) return;
      $('run').hidden = true;
      $('reset').hidden = false;
      g.run(resultOf);
    });
    $('reset').addEventListener('click', function () {
      var g = engine();
      if (g) g.reset();
      $('run').hidden = false;
      $('reset').hidden = true;
    });
    $('check').addEventListener('click', function () {
      var g = engine();
      if (!g || !g.check) return;
      resultOf(g.check() ? 'win' : 'fail');
    });
    $('hint').addEventListener('click', function () {
      var g = engine();
      if (g) showModal(g.hint(level));
    });
    $('modal').addEventListener('click', function (e) {
      if (e.target.id === 'modal') $('modal').hidden = true;
    });
    window.addEventListener('resize', function () {
      if (workspace) root.Blockly.svgResize(workspace);
      var g = engine();
      if (g) g.resize();
    });

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (!$('modal').hidden) { $('modal').hidden = true; return true; }
        if (gameName !== 'home') { showHome(); return true; }
        return false;
      });
    }

    root.BG = {
      speed: speed,
      xml: xmlOf,
      adopt: function (p) {
        if (!p || !p.game) return;
        adopting = true;
        if (p.game === 'home') showHome();
        else showPlay(p.game, p.level || 1, p.xml || '', true);
        adopting = false;
      }
    };
    Object.defineProperty(root.BG, 'game', { get: function () { return gameName; } });
    Object.defineProperty(root.BG, 'level', { get: function () { return level; } });

    if (root.gifos && root.gifos.launch) {
      root.gifos.launch().then(function (a) {
        if (!a) return;
        var g = String(a.game || '').toLowerCase();
        if (g === 'puzzle' || g === 'maze' || g === 'turtle') {
          showPlay(g, parseInt(a.level, 10) || 1);
        }
      }).catch(function () {});
    }
  }

  function restore(row) {
    if (!row) return;
    if (row.solved) {
      solved.puzzle = !!row.solved.puzzle;
      solved.maze = row.solved.maze || [];
      solved.turtle = row.solved.turtle || [];
    }
    if (row.xml) xmlCache = row.xml;
    if (row.game && row.game !== 'home') {
      showPlay(row.game, row.level || 1);
    }
  }

  function boot() {
    var load = Promise.resolve();
    if (root.gifos && root.gifos.db) {
      load = root.gifos.db('save').get('save').then(restore).catch(function () {});
    }
    load.then(function () {
      go();
      if (root.Net) root.Net.init();
    }).catch(go);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
