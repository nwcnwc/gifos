/* Optional meeting: the same card, on everyone else's screen.
 * Each person writes THEIR own row. The live host (lowest id) is the
 * card that is shown. Nobody writes anybody else's row.
 * Invite is OS chrome — this file only says to press it. */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var subscribed = false;
  var hbTimer = 0;
  var lastList = [];
  var seenAt = {};
  var guest = false;

  var now = function () { return Date.now(); };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c];
    });
  };

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function hostOf(players) {
    if (!players.length) return null;
    var h = players[0];
    for (var i = 1; i < players.length; i++) {
      if (players[i].id < h.id) h = players[i];
    }
    return h;
  }

  function snapshot() {
    var card = Mp.getCard ? Mp.getCard() : {};
    return {
      id: me.id,
      name: me.name,
      at: now(),
      ssid: card.ssid || '',
      password: card.password || '',
      encryptionMode: card.encryptionMode || 'WPA',
      eapMethod: card.eapMethod || 'PWD',
      eapIdentity: card.eapIdentity || '',
      hidePassword: !!card.hidePassword,
      hiddenSSID: !!card.hiddenSSID,
      portrait: !!card.portrait,
      hideTip: !!card.hideTip
    };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    room.put(snapshot()).catch(function () {});
  }

  function statusOf(players) {
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!others.length) {
      return 'Press Invite (top bar) to show this card in a meeting. Nothing is uploaded on its own.';
    }
    if (guest) {
      var h = hostOf(players);
      var who = h && h.id !== me.id ? (h.name || 'a friend') : 'a friend';
      return 'Showing the same card from ' + who + '. Point a phone at it.';
    }
    if (others.length === 1) {
      return 'Showing this card in the meeting — ' + (others[0].name || 'a friend') + ' can see it.';
    }
    return 'Showing this card in the meeting — ' + others.length + ' people can see it.';
  }

  function applyHost(players) {
    var h = hostOf(players);
    var wasGuest = guest;
    guest = !!(h && me.id && h.id !== me.id);
    if (guest && h) {
      if (Mp.onRemote) Mp.onRemote(h);
    } else if (wasGuest && !guest) {
      if (Mp.onHost) Mp.onHost();
    }
    document.body.classList.toggle('guest', guest);
    if (Mp.onStatus) Mp.onStatus(statusOf(players), guest, othersCount(players));
  }

  function othersCount(players) {
    return players.filter(function (p) { return p.id !== me.id; }).length;
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    applyHost(live(lastList));
  }

  function beat() {
    if (!on) return;
    publish();
    applyHost(live(lastList));
  }

  function watch() {
    api = root.gifos;
    if (!api || !api.db) {
      if (Mp.onStatus) {
        Mp.onStatus('Press Invite (top bar) to show this card in a meeting. Nothing is uploaded on its own.', false, 0);
      }
      return;
    }
    room = room || api.db('room');
    var who = api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
    who.then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      on = true;
      if (!subscribed) {
        subscribed = true;
        room.subscribe(onRoom);
      }
      beat();
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {});
  }

  var Mp = {
    watch: watch,
    publish: publish,
    get guest() { return guest; },
    esc: esc,
    getCard: null,
    onRemote: null,
    onHost: null,
    onStatus: null
  };

  root.WifiMp = Mp;
})(window);
