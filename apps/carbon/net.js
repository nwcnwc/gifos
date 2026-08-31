/*
 * Invite shares the live snippet + theme. Last write wins on one row.
 * Invite is OS chrome — this file never draws that button.
 */
(function (root) {
  'use strict';

  var api = null, room = null, me = { id: null, name: 'You' };
  var on = false, subscribed = false, owner = true;
  var lastAt = 0, lastBy = '';
  var skip = false;

  function statusOf(list) {
    var n = 0, names = [];
    (list || []).forEach(function (r) {
      if (r && r.id && r.id.indexOf('who_') === 0 && r.at && Date.now() - r.at < 12000) {
        n++;
        if (r.id !== 'who_' + me.id) names.push(r.name || 'Friend');
      }
    });
    if (!on) return 'Press Invite in the bar above to let a friend edit this snippet with you.';
    if (n <= 1) return 'Waiting for a friend… Invite sends the link. They get this snippet.';
    if (names.length === 1) return names[0] + ' is on this snippet.';
    return names.length + ' friends on this snippet.';
  }

  function snapshot() {
    var s = Mp.getState ? Mp.getState() : {};
    return {
      id: 'live',
      at: Date.now(),
      by: me.id,
      name: me.name,
      code: s.code || '',
      theme: s.theme,
      language: s.language,
      bg: s.bg,
      padding: s.padding,
      dropShadow: s.dropShadow,
      windowControls: s.windowControls,
      windowTheme: s.windowTheme,
      lineNumbers: s.lineNumbers,
      fontSize: s.fontSize,
      width: s.width,
      autoWidth: s.autoWidth,
      title: s.title || '',
      scale: s.scale
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    var row = snapshot();
    lastAt = row.at;
    lastBy = row.by;
    skip = true;
    room.put(row).catch(function (e) {
      if (Mp.onStatus) Mp.onStatus(String((e && e.message) || e || 'Could not share.'), true);
    });
    if (me.id) {
      room.put({ id: 'who_' + me.id, at: Date.now(), name: me.name }).catch(function () {});
    }
  }

  function applyList(list) {
    var live = null;
    (list || []).forEach(function (r) { if (r && r.id === 'live') live = r; });
    if (live && live.at && live.at > lastAt && live.by && live.by !== me.id) {
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
        room.subscribe(function (list) {
          if (skip) { skip = false; }
          applyList(list);
        });
      }
      /* Guest must not publish the default snippet over the host's live row.
         Subscribe already getAll's — they land on the host's image, then type. */
      if (owner) publish();
      else if (me.id) {
        room.put({ id: 'who_' + me.id, at: Date.now(), name: me.name }).catch(function () {});
      }
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
  root.CarbonMp = Mp;
})(typeof window !== 'undefined' ? window : this);
