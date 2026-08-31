/* Grid Garden — vanilla port of js/game.js from thomaspark/gridgarden (MIT).
 * jQuery, browser storage, analytics and hash-language routing are gone.
 * Persist and room hooks are filled in by boot.js / net.js.
 */
(function (root) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function qs(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
  function addClass(el, name) { if (el) el.classList.add(name); }
  function remClass(el, name) { if (el) el.classList.remove(name); }
  function hasClass(el, name) { return !!(el && el.classList.contains(name)); }
  function setHtml(el, html) { if (el) el.innerHTML = html; }
  function setText(el, t) { if (el) el.textContent = t; }
  function show(el) { if (el) el.style.display = ''; }
  function hide(el) { if (el) el.style.display = 'none'; }

  function fitBed() {
    var b = $('board');
    if (!b) return;
    var cell = b.clientWidth / 5;
    if (!(cell > 0)) return;
    var px = cell + 'px';
    b.style.setProperty('--cell', px);
    document.documentElement.style.setProperty('--cell', px);
  }

  var COLORS = { c: 'carrot', w: 'weed' };

  var game = {
    language: 'en',
    level: 0,
    answers: {},
    solved: [],
    changed: false,
    advancing: false,
    skipPersist: false,

    start: function () {
      setText(qs('#level-counter .total')[0], String(levels.length));
      show($('editor'));
      hide($('share'));
      this.setHandlers();
      this.loadMenu();
      this.translate();
      this.loadLevel(levels[this.level]);
      fitBed();
      if (root.requestAnimationFrame) root.requestAnimationFrame(fitBed);
      on(root, 'resize', fitBed);
      var d = document.documentElement.style;
      if (!('gridArea' in d)) {
        var warning = (messages.warningUnsupported[game.language] || messages.warningUnsupported.en);
        hide($('editor'));
        hide($('level-counter'));
        hide($('instructions'));
        var box = document.createElement('div');
        box.className = 'unsupported';
        box.textContent = warning;
        $('editor').parentNode.insertBefore(box, $('editor'));
      }
    },

    setHandlers: function () {
      on($('next'), 'click', function () {
        $('code').focus();
        if (hasClass($('next'), 'disabled')) {
          if (!qs('.treatment').some(function (el) { return hasClass(el, 'animated'); })) {
            game.tryagain();
          }
          return;
        }
        if (game.advancing) return;
        game.advancing = true;
        remClass($('next'), 'animated');
        remClass($('next'), 'animation');
        qs('.treatment').forEach(function (el) { addClass(el, 'gone'); });
        qs('.arrow').forEach(function (el) { addClass(el, 'disabled'); });
        addClass($('next'), 'disabled');
        setTimeout(function () {
          qs('.carrot, .weed').forEach(function (el) { addClass(el, 'correct'); });
        }, 400);
        setTimeout(function () {
          game.advancing = false;
          if (game.level >= levels.length - 1) game.win();
          else game.next();
        }, 1600);
      });

      on($('code'), 'keydown', function (e) {
        if (e.keyCode !== 13) return;
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          game.check();
          $('next').click();
          return;
        }
        var max = parseInt($('code').getAttribute('data-lines'), 10) || 1;
        var code = $('code').value;
        var trim = code.trim();
        var codeLength = code.split('\n').length;
        var trimLength = trim.split('\n').length;
        if (codeLength >= max) {
          if (codeLength === trimLength) {
            e.preventDefault();
            $('next').click();
          } else {
            $('code').value = trim;
            $('code').focus();
          }
        }
      });

      var checkSoon = game.debounce(function () { game.check(); }, 200);
      on($('code'), 'input', function () {
        game.changed = true;
        remClass($('next'), 'animated');
        remClass($('next'), 'animation');
        addClass($('next'), 'disabled');
        checkSoon();
        if (typeof game.onCode === 'function') game.onCode($('code').value);
      });

      on($('editor'), 'animationend', function () {
        $('editor').className = '';
      });

      on($('labelReset'), 'click', function () {
        var warningReset = messages.warningReset[game.language] || messages.warningReset.en;
        if (!root.confirm(warningReset)) return;
        game.level = 0;
        game.answers = {};
        game.solved = [];
        game.loadLevel(levels[0]);
        qs('.level-marker').forEach(function (el) { remClass(el, 'solved'); });
        game.persist();
      });

      on(document.body, 'click', function () {
        hide($('levelsWrapper'));
      });
      on($('levelsWrapper'), 'click', function (e) { e.stopPropagation(); });
      on($('level-indicator'), 'click', function (e) { e.stopPropagation(); });
    },

    prev: function () {
      if (this.level <= 0) return;
      this.level--;
      this.loadLevel(levels[this.level]);
    },

    next: function () {
      if (this.level >= levels.length - 1) return;
      this.level++;
      this.loadLevel(levels[this.level]);
    },

    goTo: function (i, opts) {
      i = i | 0;
      if (i < 0) i = 0;
      if (i > levels.length - 1) i = levels.length - 1;
      this.saveAnswer();
      this.level = i;
      this.loadLevel(levels[i], opts);
    },

    loadMenu: function () {
      var wrap = $('levels');
      wrap.innerHTML = '';
      levels.forEach(function (level, i) {
        var marker = document.createElement('span');
        marker.className = 'level-marker';
        marker.setAttribute('data-level', String(i));
        marker.setAttribute('title', level.name);
        marker.textContent = String(i + 1);
        if (game.solved.indexOf(level.name) !== -1) addClass(marker, 'solved');
        marker.addEventListener('click', function (e) {
          e.stopPropagation();
          game.saveAnswer();
          game.level = parseInt(marker.getAttribute('data-level'), 10);
          game.loadLevel(levels[game.level]);
        });
        wrap.appendChild(marker);
      });
      on($('level-indicator'), 'click', function (e) {
        e.stopPropagation();
        var w = $('levelsWrapper');
        if (w.style.display === 'block') hide(w);
        else { w.style.display = 'block'; }
      });
      on(qs('.arrow.left')[0], 'click', function () {
        if (hasClass(this, 'disabled')) return;
        game.saveAnswer();
        game.prev();
      });
      on(qs('.arrow.right')[0], 'click', function () {
        if (hasClass(this, 'disabled')) return;
        game.saveAnswer();
        game.next();
      });
    },

    loadLevel: function (level, opts) {
      opts = opts || {};
      if (!level) return;
      show($('editor'));
      hide($('share'));
      remClass($('view'), 'won');
      var plants = $('plants');
      var garden = $('garden');
      plants.className = '';
      garden.className = '';
      plants.removeAttribute('style');
      garden.removeAttribute('style');
      plants.innerHTML = '';
      garden.innerHTML = '';
      $('soil').className = '';
      $('overlay').className = '';
      $('soil').removeAttribute('style');
      $('overlay').removeAttribute('style');
      hide($('levelsWrapper'));
      qs('.level-marker').forEach(function (el, i) {
        if (i === game.level) addClass(el, 'current');
        else remClass(el, 'current');
      });
      setText(qs('#level-counter .current')[0], String(game.level + 1));
      setText($('before'), level.before);
      setText($('after'), level.after);
      remClass($('next'), 'animated');
      remClass($('next'), 'animation');
      addClass($('next'), 'disabled');

      var instructions = (level.instructions && (level.instructions[game.language] || level.instructions.en)) || '';
      setHtml($('instructions'), instructions);

      qs('.arrow.disabled').forEach(function (el) { remClass(el, 'disabled'); });
      if (this.level === 0) addClass(qs('.arrow.left')[0], 'disabled');
      if (this.level === levels.length - 1) addClass(qs('.arrow.right')[0], 'disabled');

      var answer = opts.code != null ? opts.code : (game.answers[level.name] || '');
      $('code').value = answer;
      try { $('code').focus(); } catch (e) {}

      this.loadDocs();

      var lines = Object.keys(level.style || {}).length || 1;
      $('code').style.height = (20 * lines) + 'px';
      $('code').setAttribute('data-lines', String(lines));

      var string = level.board || '';
      for (var i = 0; i < string.length; i++) {
        var color = COLORS[string.charAt(i)];
        var plant = document.createElement('div');
        plant.className = 'plant ' + color;
        plant.setAttribute('data-color', color);
        var pbg = document.createElement('div');
        pbg.className = 'bg';
        plant.appendChild(pbg);
        var treatment = document.createElement('div');
        treatment.className = 'treatment ' + color;
        treatment.setAttribute('data-color', color);
        var tbg = document.createElement('div');
        tbg.className = 'bg';
        treatment.appendChild(tbg);
        plants.appendChild(plant);
        garden.appendChild(treatment);
      }

      var classes = level.classes;
      if (classes) {
        for (var rule in classes) {
          if (!Object.prototype.hasOwnProperty.call(classes, rule)) continue;
          qs(rule).forEach(function (node) {
            classes[rule].split(/\s+/).forEach(function (c) { if (c) addClass(node, c); });
          });
        }
      }

      var selector = level.selector || '';
      var styleObj = level.style || {};
      qs('#plants ' + selector).forEach(function (node) {
        for (var prop in styleObj) {
          if (Object.prototype.hasOwnProperty.call(styleObj, prop)) {
            node.style.setProperty(prop, String(styleObj[prop]).replace(/;$/, ''));
          }
        }
      });

      game.changed = false;
      game.applyStyles();
      fitBed();
      game.check();
      if (!opts.silent) game.persist();
      if (typeof game.onLevel === 'function' && !opts.remote) game.onLevel(game.level);
    },

    loadDocs: function () {
      qs('#instructions code').forEach(function (code) {
        var text = code.textContent;
        if (!(text in docs)) return;
        addClass(code, 'help');
        var hideTip = function () {
          qs('#instructions .tooltip').forEach(function (t) { t.parentNode.removeChild(t); });
        };
        var showTip = function () {
          if (qs('#instructions .tooltip').length) return;
          var html = docs[text][game.language] || docs[text].en;
          var tip = document.createElement('div');
          tip.className = 'tooltip';
          tip.innerHTML = html;
          var r = code.getBoundingClientRect();
          var ir = $('instructions').getBoundingClientRect();
          tip.style.top = (r.bottom - ir.top + $('instructions').scrollTop + 13) + 'px';
          tip.style.left = Math.max(0, r.left - ir.left) + 'px';
          $('instructions').appendChild(tip);
        };
        on(code, 'mouseenter', showTip);
        on(code, 'mouseleave', hideTip);
        on(code, 'click', function (e) {
          e.stopPropagation();
          if (qs('#instructions .tooltip').length) hideTip();
          else showTip();
        });
      });
    },

    applyStyles: function () {
      var level = levels[game.level];
      if (!level) return;
      var code = $('code').value;
      var selector = level.selector || '';
      if (selector) {
        qs('#garden ' + selector).forEach(function (node) {
          node.setAttribute('style', code);
        });
      } else {
        $('soil').setAttribute('style', code || '');
        $('overlay').setAttribute('style', code || '');
      }
      game.saveAnswer();
    },

    check: function () {
      game.applyStyles();
      var level = levels[game.level];
      if (!level) return false;
      var treatments = {};
      var correct = true;
      qs('.treatment').forEach(function (el) {
        var cs = root.getComputedStyle(el);
        var r = el.getBoundingClientRect();
        var key = JSON.stringify({
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.floor(parseFloat(cs.width)),
          height: Math.floor(parseFloat(cs.height))
        });
        treatments[key] = el.getAttribute('data-color');
      });
      qs('.plant').forEach(function (el) {
        var cs = root.getComputedStyle(el);
        var r = el.getBoundingClientRect();
        var key = JSON.stringify({
          top: Math.round(r.top),
          left: Math.round(r.left),
          width: Math.floor(parseFloat(cs.width)),
          height: Math.floor(parseFloat(cs.height))
        });
        var val = el.getAttribute('data-color');
        if (!(key in treatments) || treatments[key] !== val) correct = false;
      });
      if (correct && qs('.plant').length) {
        if (game.solved.indexOf(level.name) === -1) game.solved.push(level.name);
        var marker = document.querySelector('[data-level="' + game.level + '"]');
        if (marker) addClass(marker, 'solved');
        remClass($('next'), 'disabled');
        addClass($('next'), 'animated');
        addClass($('next'), 'animation');
        game.persist();
        if (typeof game.onSolved === 'function') game.onSolved(game.level);
      }
      if (typeof game.onCheck === 'function') game.onCheck(correct);
      return correct;
    },

    saveAnswer: function () {
      var level = levels[this.level];
      if (!level) return;
      game.answers[level.name] = $('code').value;
    },

    tryagain: function () {
      addClass($('editor'), 'animated');
      addClass($('editor'), 'shake');
    },

    win: function () {
      var solution = $('code').value;
      this.loadLevel(levelWin, { silent: true, code: solution });
      hide($('editor'));
      $('code').value = solution;
      addClass($('view'), 'won');
      show($('share'));
      if (typeof game.onWin === 'function') game.onWin();
    },

    translate: function () {
      document.title = (messages.title && (messages.title[game.language] || messages.title.en)) || 'Grid Garden';
      document.documentElement.setAttribute('lang', game.language);
      qs('.translate').forEach(function (el) {
        var label = el.getAttribute('id');
        if (!label || !messages[label]) return;
        setText(el, messages[label][game.language] || messages[label].en);
      });
    },

    persist: function () {
      if (game.skipPersist) return;
      if (typeof game.onPersist === 'function') {
        game.onPersist({
          level: game.level,
          answers: game.answers,
          solved: game.solved.slice()
        });
      }
    },

    setCode: function (code, opts) {
      opts = opts || {};
      if ($('code').value === code) return;
      game.skipPersist = !!opts.remote;
      $('code').value = code;
      game.check();
      game.skipPersist = false;
    },

    debounce: function (func, wait) {
      var timeout;
      return function () {
        var args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function () { func.apply(game, args); }, wait);
      };
    }
  };

  root.game = game;
})(window);
