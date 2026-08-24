/* Start Orca. The grid is the save. Invite is OS chrome. */
(function (root) {
  'use strict';

  var db = null;
  try { if (root.gifos && root.gifos.db) db = root.gifos.db('save'); } catch (e) {}
  var room = null;
  try { if (root.gifos && root.gifos.db) room = root.gifos.db('room'); } catch (e2) {}

  var client = new Client();
  client.install(document.body);

  var bar = document.createElement('p');
  bar.id = 'meet';
  bar.className = 'meet';
  bar.innerHTML = 'Press <b>Invite</b> (top bar) to look together. The grid stays on this device until then.';
  document.body.appendChild(bar);

  function snapshot() {
    return {
      id: 'grid',
      orca: '' + client.orca,
      w: client.orca.w,
      h: client.orca.h,
      f: client.orca.f,
      tilew: client.tile.w,
      tileh: client.tile.h,
      bpm: client.clock.speed.value
    };
  }

  function save() {
    if (!db) return;
    db.put(snapshot()).catch(function () {});
  }

  function apply(rec) {
    if (!rec || !rec.orca) return;
    var w = rec.w || 1, h = rec.h || 1;
    client.orca.load(w, h, rec.orca, rec.f || 0);
    if (rec.tilew && rec.tileh) {
      client.tile.w = rec.tilew;
      client.tile.h = rec.tileh;
    }
    if (rec.bpm && client.clock && client.clock.setSpeed) {
      client.clock.setSpeed(rec.bpm, rec.bpm, true);
    }
    client.history.reset();
    client.history.record(client.orca.s);
    client.resize();
    client.update();
  }

  function boot() {
    client.start();
    root.orcaClient = client;
    if (!db || !db.get) return;
    db.get('grid').then(function (rec) {
      apply(rec);
    }).catch(function () {});
  }

  if (document.readyState === 'complete') boot();
  else root.addEventListener('load', boot);

  setInterval(save, 1500);
  root.addEventListener('blur', save);
  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () { client.toggleGuide(false); client.commander.stop(); client.cursor.reset(); });
  }

  if (room && room.subscribe) {
    room.subscribe(function (rows) {
      var n = (rows || []).filter(function (r) { return r && r.id; }).length;
      if (n > 1) {
        bar.innerHTML = 'A friend is here. Each of you has a grid on your own device. Press <b>Invite</b> only shares the meeting, not the operators.';
      }
    });
  }
})(typeof window !== 'undefined' ? window : this);
