/*
 * jsnes — player two over a meeting.
 *
 * The only channel is a replicated collection. Each peer writes ONLY
 * their own row in `pads` (a button mask). The host writes `session`
 * (which cart, pause, reset) and, for a dump they dropped, `cart` once.
 * Guests never put() those. Both run the same ROM; the host is pad 1,
 * the first guest is pad 2. A third arrival watches.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 24;
  var STALE_MS = 4000;

  var api = null;
  var me = { id: null, name: 'P1' };
  var owner = true;
  var others = {};
  var guestId = null;
  var lastPub = 0;
  var lastMask = -1;
  var lastReset = 0;
  var lastPause = false;
  var lastHash = '';
  var hostId = null;
  var onRoom = null;
  var onCart = null;
  var pendingCart = null;

  function db(n) { return api && api.db ? api.db(n) : null; }
  function now() { return Date.now(); }

  function countOthers() {
    var n = 0, id;
    for (id in others) n++;
    return n;
  }

  function pickGuest() {
    var best = null, id;
    for (id in others) {
      var o = others[id];
      if (!best || o.seen < best.seen) best = o;
    }
    guestId = best ? best.id : null;
    return guestId;
  }

  function ingestPads(list) {
    var t = now(), seen = {}, i, p;
    for (i = 0; i < (list || []).length; i++) {
      p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      others[p.id] = { id: p.id, name: p.name || 'P2', mask: p.mask | 0, seen: t };
    }
    for (i in others) if (!seen[i] || t - others[i].seen > STALE_MS) delete others[i];
    pickGuest();
    applyRemote();
    if (onRoom) onRoom(roster());
  }

  function ingestSession(list) {
    var rec = null, i;
    for (i = 0; i < (list || []).length; i++) if (list[i] && list[i].id === 'ses') rec = list[i];
    if (!rec) return;
    if (rec.by) hostId = rec.by;
    if (owner) return;
    if (rec.resetN && rec.resetN !== lastReset) {
      lastReset = rec.resetN;
      if (root.Emu) root.Emu.reset();
    }
    if (!!rec.paused !== lastPause) {
      lastPause = !!rec.paused;
      if (root.Emu) root.Emu.setPaused(lastPause);
    }
    if (rec.hash && rec.hash !== lastHash) {
      lastHash = rec.hash;
      pendingCart = rec;
      if (onCart) onCart(rec);
    }
  }

  function applyRemote() {
    if (!root.Emu) return;
    if (owner) {
      var g = guestId && others[guestId];
      if (g) root.Emu.applyMask(2, g.mask);
      return;
    }
    var h = (hostId && others[hostId]) || null;
    if (!h) {
      for (var id in others) { h = others[id]; break; }
    }
    if (h) root.Emu.applyMask(1, h.mask);
  }

  function roster() {
    var list = [{ id: me.id, name: me.name, me: true, pad: owner ? 1 : 2 }];
    var id;
    for (id in others) {
      list.push({
        id: id, name: others[id].name, me: false,
        pad: owner ? (id === guestId ? 2 : 0) : 1
      });
    }
    return list;
  }

  function publish(force) {
    if (!api || !me.id) return;
    var t = now();
    var mask = root.Emu ? root.Emu.localMask() : 0;
    if (!force && t - lastPub < 1000 / PUBLISH_HZ && mask === lastMask) return;
    lastPub = t;
    lastMask = mask;
    var col = db('pads');
    if (!col) return;
    col.put({ id: me.id, name: me.name, mask: mask, t: t }).catch(function () {});
  }

  function publishSession(extra) {
    if (!api || !me.id || !owner) return;
    var cart = root.Emu && root.Emu.cart();
    var rec = {
      id: 'ses',
      by: me.id,
      hash: cart ? cart.hash : '',
      name: cart ? cart.name : '',
      sample: cart ? !!cart.sample : false,
      sampleId: cart && cart.sample ? cart.id : '',
      paused: !!(root.Emu && root.Emu.paused()),
      resetN: lastReset,
      t: now()
    };
    if (extra) for (var k in extra) rec[k] = extra[k];
    if (rec.resetN) lastReset = rec.resetN;
    lastPause = rec.paused;
    lastHash = rec.hash;
    var col = db('session');
    if (col) col.put(rec).catch(function () {});
  }

  function publishCart(bytes, meta) {
    if (!api || !me.id || !owner) return;
    var col = db('cart');
    if (!col) return;
    col.put({
      id: 'cart',
      hash: meta.hash,
      name: meta.name,
      sample: !!meta.sample,
      sampleId: meta.sample ? meta.id : '',
      bytes: bytes,
      t: now()
    }).catch(function () {});
  }

  function fetchCart() {
    var col = db('cart');
    if (!col) return Promise.resolve(null);
    return col.get('cart').catch(function () { return null; });
  }

  function bumpReset() {
    lastReset = (lastReset | 0) + 1;
    publishSession({ resetN: lastReset });
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
    var infoP = api.info ? api.info().then(function (i) {
      owner = !!(i && i.owner);
      return owner;
    }).catch(function () { owner = true; return true; }) : Promise.resolve(true);

    return infoP.then(function () {
      return api.me();
    }).then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || (owner ? 'P1' : 'P2');
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ owner: owner, others: countOthers() });
        };
        setTimeout(done, 1800);
        db('pads').subscribe(function (list) {
          ingestPads(list || []);
          done();
        });
        db('session').subscribe(function (list) {
          ingestSession(list || []);
        });
      });
    }).catch(function () {
      return { owner: true, others: 0 };
    });
  }

  function beforeFrame() {
    if (!api || !me.id) return;
    publish(false);
    applyRemote();
  }

  root.Net = {
    init: init,
    beforeFrame: beforeFrame,
    publish: publish,
    publishSession: publishSession,
    publishCart: publishCart,
    fetchCart: fetchCart,
    bumpReset: bumpReset,
    roster: roster,
    me: function () { return me; },
    owner: function () { return owner; },
    live: function () { return !!api && !!me.id; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    others: function () { return countOthers(); },
    guestId: function () { return guestId; },
    onRoom: function (fn) { onRoom = fn; },
    onCart: function (fn) { onCart = fn; },
    pendingCart: function () { return pendingCart; }
  };
})(window);
