/* Optional meeting: a read-only view of the host's recipe (look + sliders).
 * Invite is OS chrome — this file only says to press it. The photo stays here. */
(function (root) {
  'use strict';

  var api = null, room = null, me = { id: null, name: 'You' };
  var on = false, subscribed = false, guest = false, owner = true;
  var $ = function (id) { return document.getElementById(id); };

  function snapshot() {
    var s = root.MiniPhoto ? root.MiniPhoto.getState() : {};
    return {
      id: 'shared', at: Date.now(), hostId: me.id, name: me.name,
      st: s
    };
  }
  function publish() {
    if (!on || !room || !me.id || guest) return;
    room.put(snapshot()).catch(function () {});
  }
  function statusOf() {
    if (guest) return 'Showing a read-only view of the host\'s look. Your photo stays on this device.';
    return 'Press Invite (top bar) to show this look, read-only, in a meeting. They get the recipe, not the photo.';
  }
  function applyList(list) {
    var row = null;
    (list || []).forEach(function (r) { if (r && r.id === 'shared') row = r; });
    var was = guest;
    guest = !owner;
    document.body.classList.toggle('guest', guest);
    if (guest && row && row.st && root.MiniPhoto) {
      root.MiniPhoto.setState(row.st);
      if (root.MPApp) { root.MPApp.paintSliders(); root.MPApp.paint(); }
    } else if (was && !guest && Mp.onHost) Mp.onHost();
    var bar = $('friend-bar');
    if (bar) bar.hidden = !guest;
    var st = $('friend-status');
    if (st) st.textContent = statusOf();
    var hint = $('meet');
    if (Mp.onStatus) Mp.onStatus(statusOf(), guest);
  }
  function watch() {
    api = root.gifos;
    if (!api || !api.db) return;
    room = room || api.db('room');
    var who = api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
    var info = api.info ? api.info() : Promise.resolve({ owner: true });
    Promise.all([who, info]).then(function (pair) {
      var id = pair[0], inf = pair[1];
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      owner = !(inf && inf.owner === false);
      on = true;
      if (!subscribed) { subscribed = true; room.subscribe(applyList); }
      if (!guest) publish();
    }).catch(function () {});
  }
  var Mp = {
    watch: watch, publish: publish,
    get guest() { return guest; },
    onHost: null, onStatus: null,
    onState: function (st) {
      if (!on || guest) return false;
      if (st && root.MiniPhoto) root.MiniPhoto.setState(st);
      publish();
      return false;
    }
  };
  root.MPMp = Mp;
  if (root.document) watch();
})(window);
