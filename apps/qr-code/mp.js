/* Optional meeting: the same code, on everyone else's screen.
 * The host writes the one shared row. Guests only look.
 * Invite is OS chrome — this file only says to press it. */
(function (root) {
  'use strict';

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var guest = false;
  var owner = true;

  function snapshot() {
    var s = Mp.getState ? Mp.getState() : {};
    return {
      id: 'shared',
      at: Date.now(),
      hostId: me.id,
      name: me.name,
      payload: s.payload || '',
      ecc: s.ecc || 'M',
      size: s.size || 224,
      dark: s.dark || '#000000',
      light: s.light || '#ffffff'
    };
  }

  function publish() {
    if (!on || !room || !me.id || guest) return;
    room.put(snapshot()).catch(function () {});
  }

  function statusOf() {
    if (guest) return 'Showing the same code from the host. Point a phone at it.';
    return 'Press Invite (top bar) to show this code in a meeting. Nothing is uploaded on its own.';
  }

  function applyList(list) {
    var row = null;
    (list || []).forEach(function (r) {
      if (r && r.id === 'shared') row = r;
    });
    var was = guest;
    guest = !owner;
    document.body.classList.toggle('guest', guest);
    if (guest && row && Mp.onRemote) Mp.onRemote(row);
    else if (was && !guest && Mp.onHost) Mp.onHost();
    if (Mp.onStatus) Mp.onStatus(statusOf(), guest);
  }

  function onRoom(list) {
    if (!on) return;
    applyList(list || []);
  }

  function watch() {
    api = root.gifos;
    if (!api || !api.db) {
      if (Mp.onStatus) Mp.onStatus(statusOf(), false);
      return;
    }
    room = room || api.db('room');
    var who = api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
    var info = api.info ? api.info() : Promise.resolve({ owner: true });
    Promise.all([who, info]).then(function (pair) {
      var id = pair[0], inf = pair[1];
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      owner = !(inf && inf.owner === false);
      on = true;
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      }
      if (!guest) publish();
    }).catch(function () {});
  }

  var Mp = {
    watch: watch,
    publish: publish,
    get guest() { return guest; },
    getState: null,
    onRemote: null,
    onHost: null,
    onStatus: null
  };

  root.QrMp = Mp;
})(window);
