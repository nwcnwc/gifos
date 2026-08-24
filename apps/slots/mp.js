// Room: anyone can pull. Each person writes ONLY their own row.
// The latest spin across live rows is the table. Credits stay private.
// Invite is OS chrome.
(function (g) {
  'use strict';
  var PRES_TTL = 12000, HB_MS = 3000;

  function nowMs() { return Date.now ? Date.now() : 0; }

  var mp = {
    on: false,
    me: { id: 'local', name: '' },
    owner: true,
    items: [],
    saveDb: null,
    roomDb: null,
    hb: 0
  };

  function livePeople(items) {
    var t = nowMs();
    return (items || []).filter(function (it) {
      return it && it.kind === 'seat' && it.t && (t - it.t) < PRES_TTL;
    });
  }

  function latestSpin(items) {
    var best = null;
    livePeople(items).forEach(function (it) {
      if (!it.spin || !it.spin.symbols) return;
      if (!best || (it.spin.t || 0) > (best.t || 0)) best = it.spin;
    });
    return best;
  }

  async function putMe(extra) {
    extra = extra || {};
    if (!mp.roomDb || !mp.on) return;
    var rec = {
      id: mp.me.id,
      kind: 'seat',
      name: mp.me.name || 'player',
      t: nowMs(),
      owner: mp.owner
    };
    var k;
    for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) rec[k] = extra[k];
    try { await mp.roomDb.put(rec); } catch (e) {}
  }

  function startHeartbeat() {
    stopHeartbeat();
    mp.hb = setInterval(function () { putMe(); }, HB_MS);
  }
  function stopHeartbeat() {
    if (mp.hb) { clearInterval(mp.hb); mp.hb = 0; }
  }

  mp.livePeople = livePeople;
  mp.latestSpin = latestSpin;
  mp.putMe = putMe;
  mp.startHeartbeat = startHeartbeat;
  mp.stopHeartbeat = stopHeartbeat;
  g.SlotsMp = mp;
})(window);
