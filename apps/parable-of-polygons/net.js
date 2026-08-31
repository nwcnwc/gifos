/*
 * Shared triangle/square town. Invite is OS chrome — this file never
 * draws that button. One record in `town`; anyone may drag or move a
 * slider, the host is the one who runs the automatic steps.
 *
 * Nobody writes anyone else's row: there is only one row, id "sandbox".
 * A subscriber re-downloads the whole collection, so we publish on
 * drop / slider / start-stop, and at 4 Hz while the sim is running.
 */
(function (root) {
  'use strict';

  var HZ = 4;
  var api = null;
  var me = { id: null, name: '' };
  var owner = true;
  var onTown = null;
  var onRoom = null;
  var lastPub = 0;
  var applying = false;
  var others = 0;
  var live = false;

  function db(n) { return api.db(n); }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0, live: false });
    var infoP = api.info
      ? api.info().then(function (i) { owner = !!(i && i.owner); return owner; })
          .catch(function () { owner = true; return true; })
      : Promise.resolve(true);
    return infoP.then(function () {
      return api.me();
    }).then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || '';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          live = true;
          resolve({ owner: owner, others: others, live: true });
        };
        setTimeout(done, 1800);
        db('town').subscribe(function (list) {
          ingest(list || []);
          done();
        });
      });
    }).catch(function () {
      return { owner: true, others: 0, live: false };
    });
  }

  function ingest(list) {
    var rec = null;
    var n = 0;
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r) continue;
      if (r.id === 'sandbox') rec = r;
      if (r.id && r.id.indexOf('here:') === 0) {
        seen[r.id] = 1;
        if (r.id !== 'here:' + me.id) n++;
      }
    }
    others = n;
    if (onRoom) onRoom({ owner: owner, others: others, live: true });
    if (!rec || !onTown) return;
    if (rec.by === me.id && !applying) return;
    applying = true;
    try { onTown(rec); } finally { applying = false; }
  }

  function publish(town, extra) {
    if (!api || !me.id || applying) return;
    extra = extra || {};
    var t = Date.now();
    if (!extra.force && t - lastPub < 1000 / HZ) return;
    lastPub = t;
    var rec = {
      id: 'sandbox',
      by: me.id,
      name: me.name,
      bias: +town.bias,
      nonconform: +town.nonconform,
      emptiness: +town.emptiness,
      ratioT: +town.ratioT,
      running: !!town.running,
      cells: town.exportCells(),
      t: t
    };
    db('town').put(rec).catch(function () {});
  }

  function here() {
    if (!api || !me.id) return;
    db('town').put({
      id: 'here:' + me.id,
      by: me.id,
      name: me.name,
      t: Date.now()
    }).catch(function () {});
  }

  root.Net = {
    init: init,
    publish: publish,
    here: here,
    owner: function () { return owner; },
    me: function () { return me; },
    others: function () { return others; },
    live: function () { return live; },
    onTown: function (fn) { onTown = fn; },
    onRoom: function (fn) { onRoom = fn; }
  };
})(window);
