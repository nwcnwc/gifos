/*
 * Invite shares the live pattern + text. Last write wins on one row.
 * Invite is OS chrome — this file never draws that button.
 */
(function (root) {
  'use strict';

  var api = null, room = null, me = { id: null, name: 'You' };
  var on = false, subscribed = false, owner = true;
  var lastAt = 0, lastBy = '';
  var primed = false;

  function statusOf(list) {
    var n = 0, names = [];
    (list || []).forEach(function (r) {
      if (r && r.id && r.id.indexOf('who_') === 0 && r.at && Date.now() - r.at < 12000) {
        n++;
        if (r.id !== 'who_' + me.id) names.push(r.name || 'Friend');
      }
    });
    if (!on) return 'Press Invite in the bar above to share this pattern with a friend.';
    if (n <= 1) return 'Waiting for a friend… Invite sends the link. They get this pattern.';
    if (names.length === 1) return names[0] + ' is on this pattern.';
    return names.length + ' friends on this pattern.';
  }

  function snapshot() {
    var s = Mp.getState ? Mp.getState() : {};
    return {
      id: 'live',
      at: Date.now(),
      by: me.id,
      name: me.name,
      pattern: s.pattern || '',
      flags: s.flags || 'g',
      text: s.text || '',
      subst: s.subst || '',
      listDelim: s.listDelim || '',
      tool: s.tool || 'replace',
      mode: s.mode || 'text',
      tests: s.tests || []
    };
  }

  function beatWho() {
    if (!on || !room || !me.id) return;
    room.put({ id: 'who_' + me.id, at: Date.now(), name: me.name }).catch(function () {});
  }

  function publish() {
    if (!on || !room || !me.id || !primed) return;
    var row = snapshot();
    lastAt = row.at;
    lastBy = row.by;
    room.put(row).catch(function (e) {
      if (Mp.onStatus) Mp.onStatus(String((e && e.message) || e || 'Could not share.'), true);
    });
    beatWho();
  }

  function applyList(list) {
    var live = null;
    (list || []).forEach(function (r) { if (r && r.id === 'live') live = r; });
    var remote = !!(live && live.by !== me.id);
    if (!primed) {
      /* First getAll is the join. A guest who publishes the sample here
       * last-write-wins over the host's live expression. Adopt that row.
       * If the guest arrived a tick early, wait — do not write the sample. */
      if (remote) {
        primed = true;
        lastAt = live.at || 0;
        lastBy = live.by;
        if (Mp.onRemote) Mp.onRemote(live);
      } else if (!live && owner === false) {
        if (Mp.onStatus) Mp.onStatus(statusOf(list), false);
        return;
      } else {
        primed = true;
        publish();
      }
    } else if (remote && live.at && live.at > lastAt) {
      lastAt = live.at;
      lastBy = live.by;
      if (Mp.onRemote) Mp.onRemote(live);
    }
    if (Mp.onStatus) Mp.onStatus(statusOf(list), false);
  }

  function watch() {
    api = root.gifos;
    if (!api || !api.db) {
      if (Mp.onStatus) Mp.onStatus(statusOf([]), false);
      return;
    }
    try { room = room || api.db('room'); } catch (e) { return; }
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
        room.subscribe(applyList);
      }
      beatWho();
    }).catch(function () {});
  }

  var hb = 0;
  function beat() {
    if (hb) return;
    hb = setInterval(function () {
      if (!on || !room || !me.id) return;
      room.put({ id: 'who_' + me.id, at: Date.now(), name: me.name }).catch(function () {});
    }, 3000);
  }

  var Mp = {
    watch: watch,
    publish: publish,
    beat: beat,
    get owner() { return owner; },
    get live() { return on; },
    getState: null,
    onRemote: null,
    onStatus: null
  };
  root.RegExrNet = Mp;
})(window);
