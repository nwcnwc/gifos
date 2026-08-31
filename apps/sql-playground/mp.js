/* Shared database is the `file` collection. Invite is OS chrome. */
(function (root) {
  'use strict';

  var api = null, file = null, me = { id: null, name: 'You' };
  var subscribed = false, guest = false, owner = true;

  function statusOf() {
    if (guest) return 'Shared database — SQL you run is live for everyone.';
    return 'Press Invite (top bar) to share this database. Anyone on the link can query and change it.';
  }

  function applyList(list) {
    var row = null;
    (list || []).forEach(function (r) { if (r && r.id === 'db') row = r; });
    var was = guest;
    guest = !owner;
    if (root.document && root.document.body) {
      root.document.body.classList.toggle('guest', guest);
    }
    if (Mp.onRemote) Mp.onRemote(row, guest);
    if (was !== guest && !guest && Mp.onHost) Mp.onHost();
    if (Mp.onStatus) Mp.onStatus(statusOf(), guest);
  }

  function watch() {
    api = root.gifos;
    if (!api || !api.db) {
      if (Mp.onStatus) Mp.onStatus(statusOf(), false);
      return;
    }
    try { file = file || api.db('file'); } catch (e) { return; }
    var who = api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
    var info = api.info ? api.info() : Promise.resolve({ owner: true });
    Promise.all([who, info]).then(function (pair) {
      var id = pair[0], inf = pair[1];
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      owner = !(inf && inf.owner === false);
      guest = !owner;
      if (!subscribed) { subscribed = true; file.subscribe(applyList); }
      else applyList([]);
    }).catch(function () {});
  }

  var Mp = {
    watch: watch,
    get guest() { return guest; },
    get owner() { return owner; },
    onRemote: null,
    onHost: null,
    onStatus: null
  };
  root.SqlPlayMp = Mp;
})(typeof window !== 'undefined' ? window : this);
