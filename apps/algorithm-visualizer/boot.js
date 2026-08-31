/*
 * Shell: catalog, input, player chrome, gifos.db save, follow-along.
 * Invite is OS chrome — this file never draws that button.
 */
(function (root) {
  'use strict';

  var player = null;
  var renderer = null;
  var state = {
    algo: 'bubble-sort',
    input: null,
    guest: false
  };
  var saveTimer = 0;
  var followLock = false;
  var lastFollow = null;

  var $ = function (id) { return document.getElementById(id); };

  function escape(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function paintCatalog() {
    var host = $('catalog');
    var cats = [];
    var i, a;
    for (i = 0; i < AVAlgos.list.length; i++) {
      a = AVAlgos.list[i];
      if (cats.indexOf(a.category) < 0) cats.push(a.category);
    }
    var html = '';
    for (var c = 0; c < cats.length; c++) {
      html += '<h2>' + escape(cats[c]) + '</h2><ul>';
      for (i = 0; i < AVAlgos.list.length; i++) {
        a = AVAlgos.list[i];
        if (a.category !== cats[c]) continue;
        html += '<li><button type="button" class="algo' + (a.id === state.algo ? ' on' : '') +
          '" data-id="' + escape(a.id) + '">' + escape(a.name) + '</button></li>';
      }
      html += '</ul>';
    }
    host.innerHTML = html;
  }

  function currentMeta() {
    return AVAlgos.byId(state.algo) || { name: state.algo, blurb: '', kind: 'array' };
  }

  function paintTitle() {
    var m = currentMeta();
    $('title').textContent = m.name;
    $('blurb').textContent = m.blurb;
  }

  function inputKind() {
    return (currentMeta().kind) || 'array';
  }

  function paintInput() {
    var box = $('inputs');
    var kind = inputKind();
    var inp = state.input || {};
    var guest = state.guest;
    var dis = guest ? ' disabled' : '';
    var html = '';
    if (kind === 'array' || kind === 'search') {
      html += '<label>Array <input id="in-array" type="text" spellcheck="false"' + dis +
        ' value="' + escape((inp.array || []).join(', ')) + '"></label>';
      if (kind === 'search') {
        html += '<label>Find <input id="in-target" type="number"' + dis +
          ' value="' + escape(inp.target != null ? inp.target : '') + '"></label>';
      }
    } else if (kind === 'n') {
      html += '<label>n <input id="in-n" type="number" min="2" max="12"' + dis +
        ' value="' + escape(inp.n != null ? inp.n : 8) + '"></label>';
    } else if (kind === 'strings') {
      html += '<label>A <input id="in-a" type="text" spellcheck="false"' + dis +
        ' value="' + escape(inp.a || '') + '"></label>';
      html += '<label>B <input id="in-b" type="text" spellcheck="false"' + dis +
        ' value="' + escape(inp.b || '') + '"></label>';
    } else if (kind === 'knapsack') {
      html += '<label>Values <input id="in-values" type="text" spellcheck="false"' + dis +
        ' value="' + escape((inp.values || []).join(', ')) + '"></label>';
      html += '<label>Weights <input id="in-weights" type="text" spellcheck="false"' + dis +
        ' value="' + escape((inp.weights || []).join(', ')) + '"></label>';
      html += '<label>Cap <input id="in-cap" type="number" min="1"' + dis +
        ' value="' + escape(inp.capacity != null ? inp.capacity : 7) + '"></label>';
    } else if (kind === 'graph') {
      html += '<label>Start <input id="in-start" type="number" min="0"' + dis +
        ' value="' + escape(inp.start != null ? inp.start : 0) + '"></label>';
      html += '<label>End <input id="in-end" type="number" min="0"' + dis +
        ' value="' + escape(inp.end != null ? inp.end : 0) + '"></label>';
      html += '<span class="hint">Shuffle rebuilds the graph</span>';
    } else if (kind === 'grid') {
      html += '<label>Row <input id="in-sr" type="number" min="0"' + dis +
        ' value="' + escape(inp.sr != null ? inp.sr : 1) + '"></label>';
      html += '<label>Col <input id="in-sc" type="number" min="0"' + dis +
        ' value="' + escape(inp.sc != null ? inp.sc : 1) + '"></label>';
    }
    $('shuffle').disabled = guest;
    $('apply').disabled = guest;
    box.innerHTML = html;
  }

  function parseNums(s) {
    return String(s || '').split(/[,\s]+/).map(function (x) { return +x; }).filter(function (n) {
      return isFinite(n);
    });
  }

  function readInput() {
    var kind = inputKind();
    var inp = state.input ? AV.clone(state.input) : {};
    function val(id) { var el = $(id); return el ? el.value : ''; }
    if (kind === 'array' || kind === 'search') {
      var arr = parseNums(val('in-array'));
      if (arr.length) inp.array = arr;
      if (kind === 'search') {
        var t = val('in-target');
        if (t !== '') inp.target = +t;
      }
    } else if (kind === 'n') {
      var n = +val('in-n');
      if (n) inp.n = n;
    } else if (kind === 'strings') {
      if (val('in-a')) inp.a = val('in-a');
      if (val('in-b')) inp.b = val('in-b');
    } else if (kind === 'knapsack') {
      var vs = parseNums(val('in-values'));
      var ws = parseNums(val('in-weights'));
      if (vs.length) inp.values = vs;
      if (ws.length) inp.weights = ws;
      if (val('in-cap')) inp.capacity = +val('in-cap');
    } else if (kind === 'graph') {
      if (val('in-start') !== '') inp.start = +val('in-start');
      if (val('in-end') !== '') inp.end = +val('in-end');
    } else if (kind === 'grid') {
      if (val('in-sr') !== '') inp.sr = +val('in-sr');
      if (val('in-sc') !== '') inp.sc = +val('in-sc');
    }
    return inp;
  }

  function loadAlgo(id, input, opts) {
    opts = opts || {};
    if (!AVAlgos.byId(id)) id = 'bubble-sort';
    state.algo = id;
    var rec;
    try {
      rec = AVAlgos.run(id, input);
    } catch (e) {
      $('blurb').textContent = 'Could not run that input.';
      return;
    }
    state.input = rec.input;
    paintCatalog();
    paintTitle();
    paintInput();
    player.load(rec, {
      play: opts.play !== false && !opts.paused,
      cursor: opts.cursor
    });
    if (opts.play === false || opts.paused) player.play(false);
    if (opts.speed) player.setSpeed(opts.speed);
    persist();
    publish(true);
  }

  function persist() {
    if (!root.gifos || !root.gifos.db) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      root.gifos.db('save').put({
        id: 'last',
        algo: state.algo,
        input: state.input,
        speed: player.speed
      }).catch(function () {});
    }, 250);
  }

  function publish(force) {
    if (state.guest) return;
    if (!root.AVNet || !root.AVNet.live()) return;
    var snap = player.snapshot();
    root.AVNet.publish({
      algo: state.algo,
      input: state.input,
      cursor: snap.cursor,
      playing: snap.playing,
      speed: snap.speed
    }, force);
  }

  function paintPlayer(snap) {
    $('play').textContent = snap.playing ? 'Pause' : 'Play';
    $('play').setAttribute('aria-label', snap.playing ? 'Pause' : 'Play');
    var max = Math.max(1, snap.len);
    $('seek').max = max;
    $('seek').value = snap.cursor;
    $('count').textContent = snap.cursor + ' / ' + snap.len;
    $('speed').value = String(snap.speed);
    $('prev').disabled = snap.cursor <= 0;
    $('next').disabled = snap.cursor >= snap.len;
  }

  function paintRoster(list) {
    var el = $('room');
    if (!list || list.length < 2) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    if (state.guest) el.textContent = 'Following · ' + list.length;
    else el.textContent = list.length + ' watching';
  }

  function onFollow(rec) {
    if (!rec || !rec.algo) return;
    followLock = true;
    var same = lastFollow && lastFollow.algo === rec.algo &&
      JSON.stringify(lastFollow.input) === JSON.stringify(rec.input);
    lastFollow = rec;
    if (!same) {
      loadAlgo(rec.algo, rec.input, {
        play: !!rec.playing,
        cursor: rec.cursor,
        speed: rec.speed,
        paused: !rec.playing
      });
    } else {
      if (rec.speed && rec.speed !== player.speed) player.setSpeed(rec.speed);
      if ((rec.cursor | 0) !== player.cursor) player.seek(rec.cursor | 0);
      if (!!rec.playing !== player.playing) player.play(!!rec.playing);
    }
    followLock = false;
  }

  function guestGuard() {
    if (!state.guest) return false;
    $('blurb').textContent = 'Following the host — they pick the algorithm.';
    return true;
  }

  function bind() {
    $('catalog').addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('button.algo') : null;
      if (!btn) return;
      if (guestGuard()) return;
      loadAlgo(btn.getAttribute('data-id'), null, { play: true });
      document.body.classList.remove('nav-open');
    });
    $('menu').addEventListener('click', function () {
      document.body.classList.toggle('nav-open');
    });
    $('shuffle').addEventListener('click', function () {
      if (guestGuard()) return;
      var inp = AVAlgos.shuffleInput(state.algo);
      loadAlgo(state.algo, inp, { play: true });
    });
    $('apply').addEventListener('click', function () {
      if (guestGuard()) return;
      loadAlgo(state.algo, readInput(), { play: true });
    });
    $('play').addEventListener('click', function () {
      if (guestGuard()) return;
      player.toggle();
      publish(true);
    });
    $('prev').addEventListener('click', function () {
      if (guestGuard()) return;
      player.step(-1);
      publish(true);
    });
    $('next').addEventListener('click', function () {
      if (guestGuard()) return;
      player.step(1);
      publish(true);
    });
    $('seek').addEventListener('input', function () {
      if (guestGuard()) return;
      player.play(false);
      player.seek($('seek').value | 0);
      publish(false);
    });
    $('speed').addEventListener('change', function () {
      if (guestGuard()) return;
      player.setSpeed($('speed').value);
      persist();
      publish(true);
    });
    window.addEventListener('keydown', function (ev) {
      if (ev.target && /input|textarea|select/i.test(ev.target.tagName)) return;
      if (ev.key === ' ') {
        ev.preventDefault();
        if (guestGuard()) return;
        player.toggle();
        publish(true);
      } else if (ev.key === 'ArrowRight') {
        if (guestGuard()) return;
        player.step(1); publish(true);
      } else if (ev.key === 'ArrowLeft') {
        if (guestGuard()) return;
        player.step(-1); publish(true);
      }
    });
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (document.body.classList.contains('nav-open')) {
          document.body.classList.remove('nav-open');
          return true;
        }
        return false;
      });
    }
  }

  function restoreSave() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve(null);
    return root.gifos.db('save').get('last').then(function (row) {
      return row || null;
    }).catch(function () { return null; });
  }

  function launchAlgo() {
    if (!root.gifos || !root.gifos.launch) return Promise.resolve(null);
    return root.gifos.launch().then(function (go) {
      if (go && go.algo) return String(go.algo);
      return null;
    }).catch(function () { return null; });
  }

  function boot() {
    renderer = new AVRender.Renderer();
    renderer.mount($('stage'));
    player = new AVPlayer(renderer);
    player.onChange = function (snap) {
      paintPlayer(snap);
      if (!followLock) publish(false);
    };
    paintCatalog();
    bind();

    var roomP = root.AVNet ? root.AVNet.init() : Promise.resolve({ owner: true, others: 0 });
    Promise.all([roomP, restoreSave(), launchAlgo()]).then(function (pack) {
      var room = pack[0] || { owner: true };
      var saved = pack[1];
      var launched = pack[2];
      state.guest = !room.owner;
      document.body.classList.toggle('guest', state.guest);
      if (root.AVNet) {
        root.AVNet.onRoster(paintRoster);
        paintRoster(root.AVNet.roster());
        if (state.guest) root.AVNet.onFollow(onFollow);
      }
      var id = launched && AVAlgos.byId(launched) ? launched : (saved && saved.algo) || 'bubble-sort';
      var input = (saved && saved.algo === id) ? saved.input : null;
      var speed = saved && saved.speed ? saved.speed : 1;
      if (state.guest) {
        paintTitle();
        paintInput();
        // Host snapshot arrives on subscribe; until then show the default.
        if (!lastFollow) loadAlgo(id, input, { play: false, paused: true, speed: speed });
      } else {
        loadAlgo(id, input, { play: true, speed: speed });
      }
    }).catch(function () {
      loadAlgo('bubble-sort', null, { play: true });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
