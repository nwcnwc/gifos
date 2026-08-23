/*
 * uiGradients — GifOS chrome around ghosh's colour list.
 *
 * vendor/gradients.js sets UIGradientsData. This file is the shell: browse,
 * copy the recipe, private hearts, last pick on this device.
 *
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var DIRS = ['to left', 'to bottom', 'to right', 'to top'];
  var FAMILIES = [
    { id: 'all', label: 'All' },
    { id: 'favs', label: '♥ Hearts' },
    { id: 'reds', label: 'Red', color: '#cb2d3e' },
    { id: 'oranges', label: 'Orange', color: '#d76b26' },
    { id: 'yellows', label: 'Yellow', color: '#ffd200' },
    { id: 'greens', label: 'Green', color: '#159957' },
    { id: 'cyans', label: 'Cyan', color: '#1cb5e0' },
    { id: 'blues', label: 'Blue', color: '#155799' },
    { id: 'magentas', label: 'Magenta', color: '#ef32d9' },
    { id: 'whites', label: 'White', color: '#eaeaea' },
    { id: 'grays', label: 'Gray', color: '#c0c0cb' },
    { id: 'blacks', label: 'Black', color: '#333333' }
  ];
  var COPY_OK = [
    'You got it. Go make something.',
    'Excellent choice. It will look great.',
    'Very well.',
    'Done. Go for it.',
    'Nice one. You have good taste.'
  ];

  var api = root.gifos || null;
  var saveDb = null;
  var saveTimer = 0;
  var list = [];
  var byName = {};
  var families = {};
  var current = { name: '', dir: 'to right', dirIndex: 2 };
  var favs = {};
  var filter = 'all';
  var query = '';
  var toastTimer = 0;

  var $ = function (id) { return document.getElementById(id); };

  function data() {
    var raw = root.UIGradientsData;
    if (!Array.isArray(raw)) return [];
    // Original site shows newest first.
    return raw.slice().reverse();
  }

  function keyOf(name) {
    return String(name || '').replace(/\s/g, '');
  }

  function find(name) {
    if (!name) return null;
    if (byName[name]) return byName[name];
    var k = keyOf(name);
    for (var i = 0; i < list.length; i++) {
      if (keyOf(list[i].name) === k) return list[i];
    }
    return null;
  }

  function indexOf(name) {
    var g = find(name);
    if (!g) return 0;
    for (var i = 0; i < list.length; i++) if (list[i].name === g.name) return i;
    return 0;
  }

  function hexToRgb(hex) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    var n = parseInt(hex, 16);
    if (!isFinite(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function familyOf(hex) {
    var rgb = hexToRgb(hex);
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (max === g) h = ((b - r) / d + 2) * 60;
      else h = ((r - g) / d + 4) * 60;
    }
    if (l < 0.2) return 'blacks';
    if (l > 0.85) return 'whites';
    if (s < 0.20) return 'grays';
    if (h < 30) return 'reds';
    if (h < 60) return 'oranges';
    if (h < 90) return 'yellows';
    if (h < 150) return 'greens';
    if (h < 210) return 'cyans';
    if (h < 270) return 'blues';
    if (h < 330) return 'magentas';
    return 'reds';
  }

  function cssFor(g, dir) {
    g = g || { colors: ['#ffffff', '#000000'] };
    dir = dir || 'to right';
    var colors = g.colors || ['#ffffff', '#000000'];
    var first = colors[0];
    var rev = colors.slice().reverse().join(', ');
    return 'background: ' + first + ';  /* fallback for old browsers */\n' +
      'background: -webkit-linear-gradient(' + dir + ', ' + rev + ');  /* Chrome 10-25, Safari 5.1-6 */\n' +
      'background: linear-gradient(' + dir + ', ' + rev + '); /* W3C, IE 10+/ Edge, Firefox 16+, Chrome 26+, Opera 12+, Safari 7+ */\n';
  }

  function displayCss(g, dir) {
    g = g || { colors: ['#ffffff', '#000000'] };
    dir = dir || 'to right';
    return 'linear-gradient(' + dir + ', ' + (g.colors || []).join(', ') + ')';
  }

  function say(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg || '';
    if (toastTimer) clearTimeout(toastTimer);
    if (msg) {
      toastTimer = setTimeout(function () {
        toastTimer = 0;
        el.textContent = '';
      }, 1800);
    }
  }

  function persist(immediate) {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      var names = [];
      Object.keys(favs).forEach(function (n) { if (favs[n]) names.push(n); });
      saveDb.put({ id: 'last', name: current.name, dir: current.dir }).catch(function () {});
      saveDb.put({ id: 'favs', names: names }).catch(function () {});
    };
    if (immediate) write();
    else saveTimer = setTimeout(write, 250);
  }

  function paintFav() {
    var on = !!favs[current.name];
    var b = $('favBtn');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = on ? '♥ Favourited' : '♡ Favourite';
  }

  function paintSwatches(g) {
    var box = $('swatches');
    box.textContent = '';
    (g.colors || []).forEach(function (c) {
      var li = document.createElement('li');
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      li.title = 'Copy ' + c;
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.style.background = c;
      var lab = document.createElement('span');
      lab.textContent = c;
      li.appendChild(chip);
      li.appendChild(lab);
      function go(e) {
        e.preventDefault();
        copyText(c, 'Copied ' + c);
      }
      li.addEventListener('click', go);
      li.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') go(e);
      });
      box.appendChild(li);
    });
  }

  function paint() {
    var g = find(current.name) || list[0];
    if (!g) return;
    current.name = g.name;
    $('stage').style.background = displayCss(g, current.dir);
    $('which').textContent = g.name;
    $('recipe').textContent = cssFor(g, current.dir);
    paintSwatches(g);
    paintFav();
    var cards = $('grid').querySelectorAll('button');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('on', cards[i].getAttribute('data-name') === g.name);
    }
  }

  function setPick(name, dir, fromRemote) {
    var g = find(name);
    if (!g) return false;
    if (dir && DIRS.indexOf(dir) >= 0) {
      current.dir = dir;
      current.dirIndex = DIRS.indexOf(dir);
    }
    current.name = g.name;
    paint();
    if (!fromRemote) persist();
    return true;
  }

  function step(delta) {
    if (!list.length) return;
    var i = indexOf(current.name);
    i = (i + delta + list.length) % list.length;
    pick(list[i].name);
  }

  function rotate() {
    current.dirIndex = (current.dirIndex + 1) % DIRS.length;
    current.dir = DIRS[current.dirIndex];
    if (root.UGMp && root.UGMp.onPick && root.UGMp.onPick(current.name, current.dir)) return;
    paint();
    persist();
  }

  function pick(name) {
    if (root.UGMp && root.UGMp.onPick && root.UGMp.onPick(name, current.dir)) return;
    setPick(name, current.dir, false);
  }

  function toggleFav() {
    if (!current.name) return;
    if (favs[current.name]) delete favs[current.name];
    else favs[current.name] = true;
    paintFav();
    persist(true);
    if (!$('browse').hidden) renderGrid();
  }

  function fallbackCopy(t, ok) {
    var pre = $('recipe');
    var hold = pre.textContent;
    pre.textContent = t;
    var range = document.createRange();
    range.selectNodeContents(pre);
    var sel = root.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var worked = false;
    try { worked = document.execCommand('copy'); } catch (e) { worked = false; }
    sel.removeAllRanges();
    pre.textContent = hold;
    paint();
    if (worked) ok();
    else say('Select the recipe and copy it.');
  }

  function copyText(t, okMsg) {
    var ok = function () { say(okMsg); };
    if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
      root.navigator.clipboard.writeText(t).then(ok, function () { fallbackCopy(t, ok); });
    } else fallbackCopy(t, ok);
  }

  function copyRecipe() {
    var g = find(current.name);
    if (!g) return;
    var msg = COPY_OK[(Math.random() * COPY_OK.length) | 0];
    copyText(cssFor(g, current.dir), msg);
  }

  function visible() {
    var out = [];
    var q = query.toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var g = list[i];
      if (q && g.name.toLowerCase().indexOf(q) < 0) continue;
      if (filter === 'favs' && !favs[g.name]) continue;
      if (filter !== 'all' && filter !== 'favs') {
        var pal = families[g.name] || [];
        if (pal.indexOf(filter) < 0) continue;
      }
      out.push(g);
    }
    return out;
  }

  function renderFilters() {
    var box = $('filters');
    box.textContent = '';
    FAMILIES.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = f.label;
      b.setAttribute('data-id', f.id);
      if (f.color) b.style.borderColor = f.color;
      b.classList.toggle('on', filter === f.id);
      b.addEventListener('click', function (e) {
        e.preventDefault();
        filter = f.id;
        renderFilters();
        renderGrid();
      });
      box.appendChild(b);
    });
  }

  function renderGrid() {
    var box = $('grid');
    box.textContent = '';
    var rows = visible();
    rows.forEach(function (g) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-name', g.name);
      b.style.background = displayCss(g, current.dir);
      b.classList.toggle('on', g.name === current.name);
      var lab = document.createElement('span');
      lab.textContent = g.name;
      b.appendChild(lab);
      if (favs[g.name]) {
        var h = document.createElement('span');
        h.className = 'heart';
        h.textContent = ' ♥';
        b.appendChild(h);
      }
      b.addEventListener('click', function (e) {
        e.preventDefault();
        pick(g.name);
        closeBrowse();
      });
      box.appendChild(b);
    });
    $('browse-count').textContent = rows.length + ' of ' + list.length;
  }

  function openBrowse() {
    $('browse').hidden = false;
    renderFilters();
    renderGrid();
    $('search').focus();
  }

  function closeBrowse() {
    $('browse').hidden = true;
  }

  function onKey(e) {
    if (e.repeat) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'PRE') return;
    if (!$('browse').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeBrowse(); }
      return;
    }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); rotate(); }
    else if (e.key === 'Enter') { e.preventDefault(); copyRecipe(); }
    else if (e.key === 'Escape') closeBrowse();
  }

  function bind() {
    $('prevBtn').addEventListener('click', function (e) { e.preventDefault(); step(-1); });
    $('nextBtn').addEventListener('click', function (e) { e.preventDefault(); step(1); });
    $('rotateBtn').addEventListener('click', function (e) { e.preventDefault(); rotate(); });
    $('copyBtn').addEventListener('click', function (e) { e.preventDefault(); copyRecipe(); });
    $('favBtn').addEventListener('click', function (e) { e.preventDefault(); toggleFav(); });
    $('browseBtn').addEventListener('click', function (e) { e.preventDefault(); openBrowse(); });
    $('browseClose').addEventListener('click', function (e) { e.preventDefault(); closeBrowse(); });
    $('search').addEventListener('input', function () {
      query = $('search').value || '';
      renderGrid();
    });
    root.addEventListener('keydown', onKey);
  }

  function bootList() {
    list = data();
    byName = {};
    families = {};
    list.forEach(function (g) {
      byName[g.name] = g;
      var set = {};
      (g.colors || []).forEach(function (c) { set[familyOf(c)] = true; });
      families[g.name] = Object.keys(set);
    });
  }

  function loadSave() {
    if (!api || !api.db) return Promise.resolve();
    saveDb = api.db('save');
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r) return;
        if (r.id === 'favs' && Array.isArray(r.names)) {
          r.names.forEach(function (n) { if (find(n)) favs[n] = true; });
        }
      });
      if (root.UGMp && root.UGMp.busy()) return;
      (rows || []).forEach(function (r) {
        if (r && r.id === 'last' && r.name) setPick(r.name, r.dir, true);
      });
    }).catch(function () {});
  }

  function boot() {
    bootList();
    bind();
    if (list.length) {
      var start = list[(Math.random() * list.length) | 0];
      current.name = start.name;
      paint();
    }
    loadSave().then(function () { paint(); });
  }

  root.UGApp = {
    setPick: setPick,
    persist: persist,
    cssFor: cssFor,
    displayCss: displayCss,
    familyOf: familyOf,
    current: function () { return { name: current.name, dir: current.dir }; },
    find: find
  };

  boot();
})(window);
