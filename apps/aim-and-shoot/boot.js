/*
 * Aim and Shoot — GifOS shell.
 * Invite is OS chrome. Best generation is private. A room is a cabinet of
 * generations — each player aims in their own arena.
 */
(function (root) {
  'use strict';

  root.AAS = root.AAS || {};

  var api = typeof gifos !== 'undefined' ? gifos : null;
  var saveDb = null, playersDb = null;
  try {
    if (api && api.db) {
      saveDb = api.db('save');
      playersDb = api.db('players');
    }
  } catch (e) {}

  var hiEl = document.getElementById('hi');
  var rosterEl = document.getElementById('roster');
  var best = 1;
  var gen = 1;
  var me = { id: 'local', name: 'You' };
  var others = {};
  var started = false;

  function setBest(n) {
    n = n | 0;
    if (n > best) best = n;
    hiEl.textContent = 'BEST GEN ' + best;
  }

  function persist(n) {
    if (!saveDb || n <= best) { setBest(Math.max(best, n)); return; }
    setBest(n);
    saveDb.put({ id: 'best', generation: n }).catch(function () {});
  }

  function publish() {
    if (!started || !playersDb || !me.id || me.id === 'local') return;
    playersDb.put({
      id: me.id, name: me.name, generation: gen, best: best, t: Date.now()
    }).catch(function () {});
  }

  function paintRoster() {
    var list = [{ id: me.id, name: me.name, mine: true, generation: gen, best: best }];
    Object.keys(others).forEach(function (id) {
      var p = others[id];
      list.push({ id: p.id, name: p.name || 'Player', mine: false, generation: p.generation || 1, best: p.best || 1 });
    });
    if (list.length < 2) { rosterEl.hidden = true; return; }
    list.sort(function (a, b) { return (b.generation || 0) - (a.generation || 0); });
    rosterEl.hidden = false;
    rosterEl.innerHTML = list.map(function (p) {
      return '<div class="' + (p.mine ? 'me' : '') + '">' +
        (p.name || 'Player').replace(/[<>&]/g, '') +
        ' · gen ' + (p.generation || 1) + '</div>';
    }).join('');
  }

  root.AAS.onGeneration = function (g) {
    gen = g | 0;
    persist(gen);
    publish();
    paintRoster();
  };
  root.AAS.onGameover = function (g) {
    persist(g | 0);
    gen = 1;
    publish();
    paintRoster();
  };

  document.addEventListener('touchstart', function reveal() {
    document.body.classList.add('touch');
    if (typeof root.AASShowPad === 'function') root.AASShowPad();
    document.removeEventListener('touchstart', reveal);
  }, { passive: true });

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
  saveDb.get('best').then(function (row) {
    if (row && row.generation) setBest(row.generation | 0);
  }).catch(function () {}).then(bootNet);
})(window);
