/*
 * Flexbox Froggy — vanilla port of thomaspark/flexboxfroggy game.js.
 * Persistence and the shared pond live in boot.js / net.js; this file
 * is the editor, the frogs, and the 24 levels.
 */
(function (root) {
  'use strict';

  var COLORS = { g: 'green', r: 'red', y: 'yellow' };

  var game = {
    colorblind: false,
    difficulty: 'easy',
    level: 0,
    answers: {},
    solved: [],
    changed: false,
    winning: false,
    clickedCode: null,
    onChange: null
  };

  function $(id) { return document.getElementById(id); }
  function qs(sel, el) { return (el || document).querySelector(sel); }
  function qsa(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  function levels() { return root.LEVELS; }

  game.start = function () {
    $('level-total').textContent = String(levels().length);
    game.loadMenu();
    game.setHandlers();
    game.loadLevel(levels()[game.level] || levels()[0]);
  };

  game.setHandlers = function () {
    $('next').addEventListener('click', function () {
      if (this.classList.contains('disabled')) {
        if (!qs('.frog.bounceOutUp')) game.tryagain();
        return;
      }
      this.classList.remove('animated', 'animation');
      qsa('.frog').forEach(function (f) { f.classList.add('bounceOutUp'); });
      qsa('.arrow, #next').forEach(function (n) { n.classList.add('disabled'); });
      setTimeout(function () {
        if (game.level >= levels().length - 1) game.win();
        else game.next();
      }, 900);
    });

    var code = $('code');
    code.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.keyCode !== 13) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        game.check();
        $('next').click();
        return;
      }
      var max = parseInt(code.getAttribute('data-lines'), 10) || 1;
      var val = code.value;
      var trim = val.trim();
      var codeLength = val.split('\n').length;
      var trimLength = trim.split('\n').length;
      if (codeLength >= max) {
        if (codeLength === trimLength) {
          e.preventDefault();
          $('next').click();
        } else {
          code.value = trim;
        }
      }
    });
    code.addEventListener('input', game.debounce(function () { game.check(); }, 180));
    code.addEventListener('input', function () {
      game.changed = true;
      $('next').classList.remove('animated', 'animation');
      $('next').classList.add('disabled');
      if (game.onChange) game.onChange('type');
    });

    $('editor').addEventListener('animationend', function () {
      this.classList.remove('shake');
    });

    $('labelReset').addEventListener('click', function () {
      if (!confirm('Reset the game?\n\nSolved levels and typed CSS will be cleared, and you will go back to level 1.')) return;
      game.level = 0;
      game.answers = {};
      game.solved = [];
      game.winning = false;
      qsa('.level-marker').forEach(function (m) { m.classList.remove('solved'); });
      game.loadLevel(levels()[0]);
      if (game.onChange) game.onChange('reset');
    });

    $('labelSettings').addEventListener('click', function (e) {
      e.stopPropagation();
      $('levelsWrapper').hidden = true;
      var tip = $('settings-tip');
      tip.hidden = !tip.hidden;
      var docTip = qs('#instructions .tooltip');
      if (docTip) docTip.remove();
    });

    qsa('#difficulty input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        game.difficulty = qs('#difficulty input:checked').value;
        document.body.classList.toggle('hide-directions', game.difficulty !== 'easy');
        if (game.onChange) game.onChange('prefs');
      });
    });

    qsa('#colorblind input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        game.colorblind = qs('#colorblind input:checked').value === 'true';
        qsa('.lilypad, .frog').forEach(function (n) {
          n.classList.toggle('cb-friendly', game.colorblind);
        });
        if (game.onChange) game.onChange('prefs');
      });
    });

    document.body.addEventListener('click', function () {
      $('settings-tip').hidden = true;
      var t = qs('#instructions .tooltip');
      if (t) t.remove();
      game.clickedCode = null;
    });
    qsa('.tooltip, .toggle, #level-indicator').forEach(function (n) {
      n.addEventListener('click', function (e) { e.stopPropagation(); });
    });

    $('level-indicator').addEventListener('click', function (e) {
      e.stopPropagation();
      $('settings-tip').hidden = true;
      var wrap = $('levelsWrapper');
      wrap.hidden = !wrap.hidden;
      var t = qs('#instructions .tooltip');
      if (t) t.remove();
    });

    $('prev-btn').addEventListener('click', function () {
      if (this.classList.contains('disabled')) return;
      game.saveAnswer();
      game.prev();
    });
    $('next-arrow').addEventListener('click', function () {
      if (this.classList.contains('disabled')) return;
      game.saveAnswer();
      game.next();
    });
  };

  game.prev = function () {
    if (game.level <= 0) return;
    game.winning = false;
    game.level--;
    game.loadLevel(levels()[game.level]);
    if (game.onChange) game.onChange('nav');
  };

  game.next = function () {
    game.winning = false;
    if (game.difficulty === 'hard') {
      game.level = Math.floor(Math.random() * levels().length);
    } else {
      game.level = Math.min(game.level + 1, levels().length - 1);
    }
    game.loadLevel(levels()[game.level]);
    if (game.onChange) game.onChange('nav');
  };

  game.loadMenu = function () {
    var box = $('levels');
    box.innerHTML = '';
    levels().forEach(function (level, i) {
      var m = document.createElement('span');
      m.className = 'level-marker';
      m.setAttribute('data-level', String(i));
      m.title = level.name;
      m.textContent = String(i + 1);
      if (game.solved.indexOf(level.name) !== -1) m.classList.add('solved');
      m.addEventListener('click', function () {
        game.saveAnswer();
        game.winning = false;
        game.level = i;
        game.loadLevel(levels()[i]);
        if (game.onChange) game.onChange('nav');
      });
      box.appendChild(m);
    });
  };

  game.loadLevel = function (level) {
    if (!level) return;
    game.winning = false;
    $('editor').hidden = false;
    $('win-banner').hidden = true;
    var pond = $('pond');
    var bg = $('background');
    pond.className = '';
    bg.className = '';
    pond.removeAttribute('style');
    bg.removeAttribute('style');
    pond.innerHTML = '';
    bg.innerHTML = '';
    $('levelsWrapper').hidden = true;

    qsa('.level-marker').forEach(function (m, i) {
      m.classList.toggle('current', i === game.level);
    });
    $('level-current').textContent = String(game.level + 1);
    $('before').textContent = level.before || '';
    $('after').textContent = level.after || '';
    $('next').classList.remove('animated', 'animation');
    $('next').classList.add('disabled');

    var hide = game.difficulty !== 'easy';
    document.body.classList.toggle('hide-directions', hide);
    $('instructions').innerHTML = level.instructions || '';

    $('prev-btn').classList.toggle('disabled', game.level === 0);
    $('next-arrow').classList.toggle('disabled', game.level === levels().length - 1);

    var answer = game.answers[level.name] || '';
    $('code').value = answer;

    game.loadDocs();

    var lines = Object.keys(level.style || {}).length || 1;
    $('code').style.height = (20 * lines) + 'px';
    $('code').setAttribute('data-lines', String(lines));

    var cb = game.colorblind ? ' cb-friendly' : '';
    var board = level.board || '';
    for (var i = 0; i < board.length; i++) {
      var color = COLORS[board.charAt(i)] || 'green';
      var pad = document.createElement('div');
      pad.className = 'lilypad ' + color + cb;
      pad.setAttribute('data-color', color);
      var padBg = document.createElement('div');
      padBg.className = 'bg';
      padBg.style.transform = game.transform();
      pad.appendChild(padBg);
      bg.appendChild(pad);

      var frog = document.createElement('div');
      frog.className = 'frog ' + color + cb;
      frog.setAttribute('data-color', color);
      var frogBg = document.createElement('div');
      frogBg.className = 'bg animated pulse infinite';
      frog.appendChild(frogBg);
      pond.appendChild(frog);
    }

    var classes = level.classes;
    if (classes) {
      Object.keys(classes).forEach(function (rule) {
        qsa(rule).forEach(function (n) { n.classList.add(classes[rule]); });
      });
    }

    var selector = level.selector || '';
    applyTarget('#background', selector, level.style || {});

    game.changed = false;
    game.applyStyles();
    game.compare();
  };

  function applyTarget(rootSel, selector, style) {
    var sel = selector ? (rootSel + ' ' + selector) : rootSel;
    qsa(sel).forEach(function (n) {
      Object.keys(style).forEach(function (k) { n.style.setProperty(k, style[k]); });
    });
  }

  game.loadDocs = function () {
    qsa('#instructions code').forEach(function (code) {
      var text = code.textContent;
      if (!(text in root.DOCS)) return;
      code.classList.add('help');
      code.addEventListener('click', function (e) {
        e.stopPropagation();
        var existing = qs('#instructions .tooltip');
        if (existing && game.clickedCode === code) {
          existing.remove();
          game.clickedCode = null;
          return;
        }
        $('levelsWrapper').hidden = true;
        $('settings-tip').hidden = true;
        if (existing) existing.remove();
        var tip = document.createElement('div');
        tip.className = 'tooltip';
        tip.innerHTML = root.DOCS[text];
        var r = code.getBoundingClientRect();
        var side = $('sidebar').getBoundingClientRect();
        tip.style.top = (r.bottom - side.top + $('sidebar').scrollTop + 10) + 'px';
        tip.style.left = Math.max(8, r.left - side.left) + 'px';
        $('instructions').appendChild(tip);
        qsa('code', tip).forEach(function (c) {
          c.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var pValue = (ev.target.textContent || '').split(' ')[0];
            pValue = defaultPropVal(pValue);
            game.writeCSS(text, pValue);
            game.check();
            if (game.onChange) game.onChange('type');
          });
        });
        game.clickedCode = code;
      });
    });
  };

  function defaultPropVal(pValue) {
    if (pValue === '<integer>') return '0';
    if (pValue === '<flex-direction>') return 'row nowrap';
    return pValue;
  }

  game.applyStyles = function () {
    var level = game.winning ? root.LEVEL_WIN : levels()[game.level];
    if (!level) return;
    var code = $('code').value;
    var selector = level.selector || '';
    var sel = selector ? ('#pond ' + selector) : '#pond';
    qsa(sel).forEach(function (n) { n.setAttribute('style', code); });
    game.saveAnswer();
  };

  game.check = function () {
    var go = function () {
      game.applyStyles();
      game.compare();
    };
    if (!document.startViewTransition) {
      go();
      return;
    }
    try {
      var t = document.startViewTransition(function () { game.applyStyles(); });
      t.finished.then(function () { game.compare(); }).catch(function () { game.compare(); });
    } catch (err) {
      go();
    }
  };

  game.compare = function () {
    if (game.winning) return;
    var level = levels()[game.level];
    var pond = $('pond');
    var bg = $('background');
    var frogs = {};
    var correct = true;

    qsa('.frog', pond).forEach(function (el) {
      var p = posOf(el, pond);
      frogs[keyOf(p)] = el.getAttribute('data-color');
    });
    qsa('.lilypad', bg).forEach(function (el) {
      var p = posOf(el, bg);
      var k = keyOf(p);
      var val = el.getAttribute('data-color');
      if (!(k in frogs) || frogs[k] !== val) correct = false;
    });

    if (correct) {
      if (game.solved.indexOf(level.name) === -1) game.solved.push(level.name);
      var marker = qs('[data-level="' + game.level + '"]');
      if (marker) marker.classList.add('solved');
      $('next').classList.remove('disabled');
      $('next').classList.add('animated', 'animation');
    } else {
      game.changed = true;
      $('next').classList.remove('animated', 'animation');
      $('next').classList.add('disabled');
    }
  };

  function posOf(el, parent) {
    var a = el.getBoundingClientRect();
    var b = parent.getBoundingClientRect();
    return {
      top: Math.floor(a.top - b.top),
      left: Math.floor(a.left - b.left)
    };
  }
  function keyOf(p) { return p.top + ',' + p.left; }

  game.saveAnswer = function () {
    if (game.winning) return;
    var level = levels()[game.level];
    if (level) game.answers[level.name] = $('code').value;
  };

  game.tryagain = function () {
    $('editor').classList.add('shake');
  };

  game.win = function () {
    var solution = $('code').value;
    game.winning = true;
    game.loadWin(solution);
    if (game.onChange) game.onChange('win');
  };

  game.loadWin = function (solution) {
    var level = root.LEVEL_WIN;
    $('editor').hidden = true;
    $('win-banner').hidden = false;
    $('instructions').innerHTML = level.instructions;
    document.body.classList.remove('hide-directions');
    var pond = $('pond');
    var bg = $('background');
    pond.className = '';
    bg.className = '';
    pond.removeAttribute('style');
    bg.removeAttribute('style');
    pond.innerHTML = '';
    bg.innerHTML = '';
    var board = level.board || '';
    var cb = game.colorblind ? ' cb-friendly' : '';
    for (var i = 0; i < board.length; i++) {
      var color = COLORS[board.charAt(i)] || 'green';
      var pad = document.createElement('div');
      pad.className = 'lilypad ' + color + cb;
      var padBg = document.createElement('div');
      padBg.className = 'bg';
      padBg.style.transform = game.transform();
      pad.appendChild(padBg);
      bg.appendChild(pad);
      var frog = document.createElement('div');
      frog.className = 'frog ' + color + cb;
      var frogBg = document.createElement('div');
      frogBg.className = 'bg bounce';
      frog.appendChild(frogBg);
      pond.appendChild(frog);
    }
    if (level.classes) {
      Object.keys(level.classes).forEach(function (rule) {
        qsa(rule).forEach(function (n) { n.classList.add(level.classes[rule]); });
      });
    }
    $('code').value = solution || '';
  };

  game.transform = function () {
    var scale = 1 + ((Math.random() / 5) - 0.2);
    var rotate = 360 * Math.random();
    return 'scale(' + scale + ') rotate(' + rotate + 'deg)';
  };

  game.writeCSS = function (pName, pValue) {
    var keywords = Object.keys(root.DOCS);
    if (keywords.indexOf(pValue) !== -1) return;
    var tokens = $('code').value.trim().split(/[\n:;]+/).filter(function (i) { return i; });
    var content = '';
    var filled = false;
    tokens.forEach(function (token, i) {
      var trimmedToken = token.trim();
      if (keywords.indexOf(trimmedToken) === -1) return;
      var append = content !== '' ? '\n' : '';
      if (trimmedToken === pName && !filled) {
        filled = true;
        append += trimmedToken + ': ' + pValue + ';';
      } else if (i + 1 < tokens.length) {
        var nxt = tokens[i + 1].trim();
        var val = keywords.indexOf(nxt) === -1 ? nxt : '';
        append += trimmedToken + ': ' + val + ';';
      }
      content += append;
    });
    if (!filled) {
      content += content !== '' ? '\n' : '';
      content += pName + ': ' + pValue + ';';
    }
    $('code').value = content;
    $('code').focus();
  };

  game.debounce = function (func, wait) {
    var timeout;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function () { func.apply(ctx, args); }, wait);
    };
  };

  game.snapshot = function () {
    return {
      level: game.level,
      answers: game.answers,
      solved: game.solved.slice(),
      colorblind: game.colorblind,
      difficulty: game.difficulty,
      winning: game.winning,
      code: $('code') ? $('code').value : ''
    };
  };

  game.restorePrefs = function (row) {
    if (!row) return;
    if (row.colorblind != null) game.colorblind = !!row.colorblind;
    if (row.difficulty) game.difficulty = row.difficulty;
    if (typeof row.level === 'number') game.level = row.level;
    if (row.answers && typeof row.answers === 'object') game.answers = row.answers;
    if (Array.isArray(row.solved)) game.solved = row.solved.slice();
    var cb = qs('#colorblind input[value="' + (game.colorblind ? 'true' : 'false') + '"]');
    if (cb) cb.checked = true;
    var df = qs('#difficulty input[value="' + game.difficulty + '"]');
    if (df) df.checked = true;
  };

  game.goLevel = function (idx, code) {
    idx = idx | 0;
    if (idx < 0 || idx >= levels().length) return;
    game.winning = false;
    game.level = idx;
    if (typeof code === 'string') game.answers[levels()[idx].name] = code;
    game.loadLevel(levels()[idx]);
  };

  game.setCode = function (code) {
    if ($('code').value === code) {
      game.check();
      return;
    }
    $('code').value = code;
    game.check();
  };

  game.anyOverlay = function () {
    if (!$('levelsWrapper').hidden) return 'levels';
    if (!$('settings-tip').hidden) return 'settings';
    if (qs('#instructions .tooltip')) return 'docs';
    return null;
  };

  game.closeOverlays = function () {
    $('levelsWrapper').hidden = true;
    $('settings-tip').hidden = true;
    var t = qs('#instructions .tooltip');
    if (t) t.remove();
    game.clickedCode = null;
  };

  root.Froggy = game;
})(window);
