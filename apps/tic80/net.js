/*
 * TIC-80 — the desk over a meeting.
 *
 * The only channel is a replicated collection. Each peer writes ONLY
 * their own row in `pads`. Anyone may put a cart on `desk` (filename +
 * bytes). The host writes `session` (whose cart is loaded). Guests never
 * put() session. A cart you save or drop shows up for them.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 4000;
  var api = null;
  var me = { id: null, name: 'P1' };
  var owner = true;
  var others = {};
  var lastPub = 0;
  var lastMask = -1;
  var deskSeen = {};
  var onRoom = null;
  var onDesk = null;
  var maskNow = 0;

  function db(n) { return api && api.db ? api.db(n) : null; }
  function now() { return Date.now(); }

  function roster() {
    var list = [{ id: me.id, name: me.name, me: true }], id;
    for (id in others) list.push({ id: id, name: others[id].name, me: false });
    return list;
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
    if (onRoom) onRoom(roster());
  }

  function ingestDesk(list) {
    var i, r, b, name;
    for (i = 0; i < (list || []).length; i++) {
      r = list[i];
      if (!r || !r.id || r.by === me.id) continue;
      if (deskSeen[r.id] === r.t) continue;
      deskSeen[r.id] = r.t;
      b = root.TicFS && root.TicFS.bytesOf(r.bytes);
      if (!b) continue;
      name = r.id;
      if (root.TicFS) root.TicFS.putCart(name, b);
      if (onDesk) onDesk(name, b);
    }
  }

  function publishPad(force) {
    var col = db('pads');
    if (!col || !me.id) return;
    var t = now();
    if (!force && t - lastPub < (1000 / PUBLISH_HZ) && maskNow === lastMask) return;
    lastPub = t;
    lastMask = maskNow;
    col.put({ id: me.id, name: me.name, mask: maskNow | 0, t: t }).catch(function () {});
  }

  function publishCart(name, bytes) {
    var col = db('desk');
    if (!col || !name || !bytes) return;
    var t = now();
    deskSeen[name] = t;
    col.put({
      id: name, name: name, by: me.id,
      bytes: root.TicFS ? root.TicFS.b64(bytes) : null,
      t: t
    }).catch(function () {});
  }

  function publishSession(cart) {
    var col = db('session');
    if (!col || !owner) return;
    col.put({ id: 'ses', by: me.id, cart: cart || '', t: now() }).catch(function () {});
  }

  function setMask(m) { maskNow = m | 0; publishPad(false); }

  function start(gifos, who, isOwner, hooks) {
    api = gifos;
    me = who || me;
    owner = !!isOwner;
    onRoom = hooks && hooks.onRoom;
    onDesk = hooks && hooks.onDesk;
    var pads = db('pads'), desk = db('desk');
    if (pads && pads.subscribe) pads.subscribe(function (list) { ingestPads(list); });
    if (desk && desk.subscribe) desk.subscribe(function (list) { ingestDesk(list); });
    publishPad(true);
    setInterval(function () { publishPad(false); }, 250);
  }

  root.TicNet = {
    start: start,
    setMask: setMask,
    publishCart: publishCart,
    publishSession: publishSession,
    roster: roster
  };
})(window);
