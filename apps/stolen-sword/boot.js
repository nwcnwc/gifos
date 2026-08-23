/*
 * Stolen Sword — GifOS shell.
 *
 * Upstream used localStorage for the land and the tutorial flag. A sandboxed
 * GifOS frame is an opaque origin: localStorage throws. This file runs first,
 * hangs a Storage-shaped object on window, and flushes the blob into
 * gifos.db('prefs') — private, inside the icon. There is no cloud.
 *
 * The room link is OS chrome — this file never draws a share control.
 */
(function (root) {
  'use strict';

  var mem = Object.create(null);
  var persistTimer = null;

  function persist() {
    persistTimer = null;
    if (!root.gifos || !root.gifos.db) return;
    try {
      var rows = [];
      for (var k in mem) rows.push({ k: k, v: mem[k] });
      root.gifos.db('prefs').put({ id: 'save', rows: rows }).catch(function () {});
    } catch (e) {}
  }

  function schedule() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 250);
  }

  var ls = {
    getItem: function (k) {
      k = String(k);
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      mem[String(k)] = String(v);
      schedule();
    },
    removeItem: function (k) {
      delete mem[String(k)];
      schedule();
    },
    clear: function () {
      for (var k in mem) delete mem[k];
      schedule();
    },
    key: function (i) {
      return Object.keys(mem)[i] || null;
    },
    get length() { return Object.keys(mem).length; }
  };

  var nativeOk = false;
  try {
    var probe = root.localStorage;
    probe.setItem('__gifos_probe', '1');
    probe.removeItem('__gifos_probe');
    nativeOk = true;
  } catch (e) {
    nativeOk = false;
  }
  if (!nativeOk) {
    try {
      Object.defineProperty(root, 'localStorage', { value: ls, configurable: true });
    } catch (e2) {
      root.localStorage = ls;
    }
  }

  function loadPrefs() {
    if (nativeOk) return Promise.resolve();
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('save').then(function (row) {
      if (!row || !row.rows) return;
      for (var i = 0; i < row.rows.length; i++) {
        var r = row.rows[i];
        if (r && r.k != null) mem[String(r.k)] = r.v == null ? '' : String(r.v);
      }
    }).catch(function () {});
  }

  var scoreEl = document.getElementById('score');
  var scoreRows = document.getElementById('score-rows');
  var tally = document.getElementById('tally');
  var hint = document.getElementById('hint');
  var showScores = false;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function landName(n) {
    n = n | 0;
    return n === 0 ? 'grove' : n === 1 ? 'bamboo' : n === 2 ? 'mountain' : n === 3 ? 'river' : '—';
  }

  function paintRoster(list) {
    if (!list || list.length < 2) {
      if (scoreEl) scoreEl.hidden = true;
      if (tally) tally.hidden = true;
      return;
    }
    if (tally) {
      tally.hidden = false;
      tally.textContent = list.length + ' swords';
    }
    if (!scoreRows) return;
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += '<tr class="' + (p.me ? 'me' : '') + (p.started ? '' : ' dead') + '">' +
        '<td>' + escapeHtml(p.name) + (p.me ? ' (you)' : '') + '</td>' +
        '<td>' + landName(p.stage) + '</td></tr>';
    }
    scoreRows.innerHTML = html;
    if (scoreEl) scoreEl.hidden = !showScores;
  }

  function hideHint() {
    document.body.classList.add('playing');
    if (hint) hint.style.display = 'none';
  }

  function boot() {
    var SS = root.StolenSword;
    if (!SS) return;

    loadPrefs().then(function () {
      SS.start();
      if (root.Net) {
        root.Net.onRoster(paintRoster);
        return root.Net.init().then(function () {
          paintRoster(root.Net.roster());
        });
      }
    }).catch(function () {
      if (root.StolenSword) root.StolenSword.start();
    });

    addEventListener('pointerdown', hideHint, { once: true });
    addEventListener('touchstart', hideHint, { once: true, passive: true });
    addEventListener('keydown', hideHint, { once: true });

    if (tally) {
      tally.addEventListener('click', function () {
        showScores = !showScores;
        if (scoreEl) scoreEl.hidden = !showScores || !scoreRows.innerHTML;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
