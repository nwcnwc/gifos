/*
 * Duck Hunt — GifOS shell. Best score in the file. Invite is OS chrome.
 */
(function (root) {
  'use strict';
  var prefs = { best: 0 };
  var db = null;
  try { if (root.gifos) db = gifos.db('save'); } catch (e) {}

  function load() {
    if (!db) return Promise.resolve();
    return db.get('save').then(function (row) {
      if (row && row.best != null) prefs.best = row.best | 0;
    }).catch(function () {});
  }
  function save(best) {
    if (best > prefs.best) prefs.best = best | 0;
    if (!db) return;
    db.put({ id: 'save', best: prefs.best }).catch(function () {});
  }

  function start() {
    document.getElementById('gate').hidden = true;
    document.body.classList.add('play');
    if (typeof root.DuckHuntStart === 'function') root.DuckHuntStart();
    else console.error('DuckHuntStart missing');
    var room = document.getElementById('gate-room');
    if (room) room.textContent = 'Press Invite in the bar above to send the link.';
  }

  document.getElementById('gate-go').addEventListener('click', start);
  document.getElementById('best').textContent = prefs.best ? ('Best ' + prefs.best) : '';

  load().then(function () {
    document.getElementById('best').textContent = prefs.best ? ('Best ' + prefs.best) : '';
    document.getElementById('gate-go').disabled = false;
  });

  if (root.gifos && gifos.db) {
    try {
      gifos.db('room').subscribe(function (rows) {
        var n = 0, i;
        for (i = 0; i < rows.length; i++) if (rows[i] && rows[i].id) n++;
        var tally = document.getElementById('tally');
        if (tally) {
          tally.hidden = n < 2;
          tally.textContent = n + ' at the pond';
        }
      });
      gifos.me().then(function (who) {
        gifos.db('room').put({ id: (who && who.id) || 'solo', t: Date.now() }).catch(function () {});
      }).catch(function () {});
    } catch (e) {}
  }

  root.DHSave = { save: save, prefs: prefs };
})(window);
