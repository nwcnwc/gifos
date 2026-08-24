/*
 * Tiny Yurts — GifOS shell. Invite is OS chrome. Best score is private.
 */
(function (root) {
  'use strict';

  var api = typeof gifos !== 'undefined' ? gifos : null;
  var saveDb = null, playersDb = null;
  try {
    if (api && api.db) {
      saveDb = api.db('save');
      playersDb = api.db('players');
    }
  } catch (e) {}

  var rosterEl = document.getElementById('roster');
  var me = { id: 'local', name: 'You' };
  var others = {};
  var started = false;
  var lastScore = 0;

  function currentScore() {
    var v = root.localStorage && root.localStorage.getItem('Tiny Yurts');
    return v ? (parseInt(v, 10) || 0) : 0;
  }

  function paintHi(n) {
    if (!n) return;
    var nodes = document.body.querySelectorAll('div');
    for (var i = 0; i < nodes.length; i++) {
      var t = nodes[i].innerText || '';
      if (t.indexOf('Highscore:') === 0 || t.indexOf('Tip:') === 0) {
        nodes[i].innerText = 'Highscore: ' + n;
        break;
      }
    }
  }

  function publish() {
    if (!started || !playersDb || !me.id || me.id === 'local') return;
    playersDb.put({
      id: me.id, name: me.name, score: currentScore(), t: Date.now()
    }).catch(function () {});
  }

  function paintRoster() {
    var list = [{ id: me.id, name: me.name, mine: true, score: currentScore() }];
    Object.keys(others).forEach(function (id) {
      var p = others[id];
      list.push({ id: p.id, name: p.name || 'Player', mine: false, score: p.score || 0 });
    });
    if (list.length < 2) { rosterEl.hidden = true; return; }
    list.sort(function (a, b) { return b.score - a.score; });
    rosterEl.hidden = false;
    rosterEl.innerHTML = list.map(function (p) {
      return '<div class="' + (p.mine ? 'me' : '') + '">' +
        (p.name || 'Player').replace(/[<>&]/g, '') + ' · ' + p.score + '</div>';
    }).join('');
  }

  root.TYOnSave = function (key, val) {
    if (!saveDb) return;
    var rec = { id: 'prefs' };
    rec.score = root.localStorage.getItem('Tiny Yurts') || '';
    rec.sound = root.localStorage.getItem('Tiny Yurtss') || '';
    rec.grid = root.localStorage.getItem('Tiny Yurtsg') || '';
    saveDb.put(rec).catch(function () {});
    if (key === 'Tiny Yurts') {
      lastScore = parseInt(val, 10) || 0;
      publish();
      paintRoster();
    }
  };

  function hydrate(row) {
    if (!row) return;
    if (row.score) {
      root._tyMem['Tiny Yurts'] = String(row.score);
      paintHi(row.score);
    }
    if (row.sound) root._tyMem['Tiny Yurtss'] = String(row.sound);
    if (row.grid) root._tyMem['Tiny Yurtsg'] = String(row.grid);
  }

  if (api && api.onBack) api.onBack(function () { return true; });

  function bootNet() {
    if (!api || !playersDb) return;
    api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      if (me.id === 'local') return;
      started = true;
      playersDb.subscribe(function (list) {
        var seen = {};
        (list || []).forEach(function (p) {
          if (!p || !p.id || p.id === me.id) return;
          seen[p.id] = 1;
          others[p.id] = p;
        });
        Object.keys(others).forEach(function (id) { if (!seen[id]) delete others[id]; });
        paintRoster();
      });
      publish();
    }).catch(function () {});
  }

  if (!saveDb) { bootNet(); return; }
  saveDb.get('prefs').then(hydrate).catch(function () {}).then(bootNet);
})(window);
