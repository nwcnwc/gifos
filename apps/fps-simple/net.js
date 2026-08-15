/*
 * FPS Simple — netplay transport.
 *
 * Upstream has NO networking of any kind: not one file in it mentions a socket,
 * a peer or a datachannel. It is you against a procedurally-spawned garrison.
 * Everything multiplayer about this app is here and in remote.js.
 *
 * WHAT GIFOS GIVES US, AND WHAT IT COSTS. The only channel an app has is the
 * replicated collection — gifos.db('players').subscribe(...) — hosted by the
 * host's browser. Two properties shape every decision below:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      traffic is O(players²). The answer is a LOW publish rate with client-side
 *      interpolation, not a high one, and rows kept mean (coordinates rounded to
 *      the centimetre — a shooter cannot tell, and it is a third of the bytes).
 *   2. There is no datagram path and no server tick. So this cannot be, and does
 *      not pretend to be, competitive-grade netcode.
 *
 * NOBODY WRITES TO ANYBODY ELSE'S ROW. Each player owns exactly one record and
 * only ever reads the others — anyroad's rule, and it is what lets this work with
 * no authority to arbitrate. That decides how damage flows:
 *
 *   - The SHOOTER decides what it hit, locally, against the bodies it can see —
 *     "favour the shooter", the same call every net FPS makes, and the only one
 *     that feels right when the wire is 6 Hz. Claims ride on the shooter's own
 *     row as a short ring of recent shots.
 *   - The TARGET decides what that costs it. It applies the damage to itself,
 *     decides its own death, and publishes its own health. A client that ignored
 *     incoming hits would be cheating, and it would be cheating in a game you
 *     reach by sending someone a link — the threat model is friends, so the
 *     honest design is the simple one, said plainly in the README.
 *
 * A claim is deduped on (shooter id, sequence), because a row is re-delivered
 * on every unrelated change and a hit must land exactly once.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 6;         // see (1) — the rate the platform actually wants
  var STALE_MS = 9000;        // a player unheard-from this long stops being drawn
  var HIT_RING = 8;           // recent claims carried on my row
  var CLAIM_TTL = 12000;      // how long a dedupe key is worth remembering

  var api = null;             // window.gifos, or null when opened outside GifOS
  var me = { id: null, name: 'Player' };
  var others = {};            // id -> interpolation record
  var seq = 0;                // my hit-claim sequence, monotonic within a session
  var pendingHits = [];       // claims I have made recently, riding on my row
  var appliedClaims = {};     // "shooterId:seq" -> when we applied it
  var appliedTotal = 0;       // how many DISTINCT claims we have ever accepted
  var acc = 0;
  var onHit = null;           // (dmg, headshot, fromId, fromName) -> void
  var onRoster = null;        // (list) -> void, for the scoreboard
  var lastPublished = 0;
  var self = { hp: 100, k: 0, d: 0, alive: true, spawn: 0, lastKilledBy: null, killAck: {} };
  var started = false;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }

  // A stable colour per player, derived from the id rather than assigned, so the
  // same person is the same colour in everyone's game with nothing negotiated.
  function tintFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (h % 360) / 360;
  }

  var r2 = function (n) { return Math.round(n * 100) / 100; };

  /* ------------------------------------------------------------------ */
  /* joining                                                            */
  /* ------------------------------------------------------------------ */

  // Resolves with the roster AS IT STANDS, which is what decides whether this is
  // a solo game against the garrison or a deathmatch (see boot.js). subscribe()
  // fires immediately with the current contents, so this settles in a tick — but
  // it is raced against a timeout anyway: an app that hangs on boot because the
  // room was slow is a worse app than one that starts alone.
  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve(null);
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Player';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function (list) { if (!settled) { settled = true; resolve(list || []); } };
        setTimeout(function () { done([]); }, 2500);
        db('players').subscribe(function (list) {
          ingest(list || []);
          done(list || []);
        });
      });
    }).catch(function () { return null; });
  }

  function ingest(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      if (p.id === me.id) { reconcileSelf(p); continue; }
      seen[p.id] = 1;
      drainClaims(p);
      var cur = others[p.id];
      // Staleness is measured by when we last saw the row CHANGE, not by the
      // sender's clock (which is not ours) and not by delivery time (which would
      // make a player who left months ago permanently fresh — their row lives on
      // in the host's db). Anyroad paid for this lesson; we inherit it.
      var moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.z !== p.z || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Player',
        x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0, pitch: p.pitch || 0,
        mv: p.mv || 0, crouch: !!p.cr, alive: p.alive !== false, hp: p.hp == null ? 100 : p.hp,
        k: p.k || 0, d: p.d || 0, spawn: p.sp || 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t, hue: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, z: cur.z, yaw: cur.yaw, pitch: cur.pitch, t: cur.t } : null,
      };
      // They are telling the room I killed them. Count it once — the ack key
      // stops a redelivered row scoring the same kill again and again.
      if (p.lastKilledBy && p.lastKilledBy.by === me.id) {
        var ak = p.id + ':' + p.lastKilledBy.at;
        if (!self.killAck[ak]) { self.killAck[ak] = 1; self.k++; publish(true); }
      }
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  // My own row, echoed back. The host is the authority on what is stored, so if
  // it trimmed or refused something this is where we would learn it. We keep our
  // own health — nobody else may lower it except through a claim.
  function reconcileSelf(p) {
    if (p && p.k > self.k) self.k = p.k;
  }

  /* ------------------------------------------------------------------ */
  /* damage                                                             */
  /* ------------------------------------------------------------------ */

  // Claims addressed to me, from somebody else's row.
  function drainClaims(p) {
    if (!p.hits || !p.hits.length || !onHit) return;
    for (var i = 0; i < p.hits.length; i++) {
      var h = p.hits[i];
      if (!h || h.to !== me.id) continue;
      var key = p.id + ':' + h.n;
      if (appliedClaims[key]) continue;
      appliedClaims[key] = now();
      appliedTotal++;
      // A claim that predates my current life is a shot fired at the body I was
      // wearing before I respawned. It must not follow me into the new one.
      if (h.sp != null && h.sp !== self.spawn) continue;
      if (!self.alive) continue;
      onHit(h.d || 0, !!h.hs, p.id, p.name || 'Player');
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in appliedClaims) if (appliedClaims[k] < cutoff) delete appliedClaims[k];
  }

  /** I hit someone. Ride the claim on my own row; their browser decides. */
  function claimHit(targetId, dmg, headshot, targetSpawn) {
    if (!api || !me.id) return;
    pendingHits.push({ to: targetId, d: Math.round(dmg), hs: !!headshot, n: ++seq, sp: targetSpawn });
    if (pendingHits.length > HIT_RING) pendingHits.shift();
    publish(true); // a hit is the one thing not worth waiting up to 166 ms for
  }

  /* ------------------------------------------------------------------ */
  /* publishing                                                         */
  /* ------------------------------------------------------------------ */

  function setSelf(s) {
    self.hp = s.hp; self.alive = s.alive; self.spawn = s.spawn;
    if (s.deaths != null) self.d = s.deaths;
    if (s.killedBy) self.lastKilledBy = { by: s.killedBy, at: s.spawn };
  }

  function publish(force) {
    if (!api || !me.id || !root.__FPS_POSE__) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var p = root.__FPS_POSE__();
    if (!p) return;
    db('players').put({
      id: me.id, name: me.name,
      x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(p.yaw), pitch: r2(p.pitch),
      mv: r2(p.speed), cr: !!p.crouch,
      hp: Math.round(self.hp), alive: !!self.alive, sp: self.spawn,
      k: self.k, d: self.d,
      lastKilledBy: self.lastKilledBy,
      hits: pendingHits.slice(),
      t: t,
    }).catch(function () { /* a dropped frame of presence is not an error */ });
    started = true;
  }

  // Called every frame. The rate limit inside publish() is on the WALL clock,
  // not on dt, and deliberately: a paused game runs its update loop with dt 0,
  // and a player who paused must not silently go stale and vanish from everyone
  // else's room while they are reading the menu.
  function tick() {
    if (!api || !me.id) return;
    publish(false);
  }

  /* ------------------------------------------------------------------ */
  /* reading                                                            */
  /* ------------------------------------------------------------------ */

  /** Where a remote player is RIGHT NOW, interpolated between the last two rows. */
  function poseOf(o) {
    if (!o.prev) return { x: o.x, y: o.y, z: o.z, yaw: o.yaw, pitch: o.pitch, mv: o.mv };
    var span = Math.max(60, o.t - o.prev.t);
    // Deliberately behind: render at (now - one publish interval) so there is
    // always a real sample on both sides and remote players glide instead of
    // snapping. The cost is ~166 ms of lag on other people's positions, which is
    // the honest price of a 6 Hz wire and is why the shooter decides its hits.
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    var dy = ((o.yaw - o.prev.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      y: o.prev.y + (o.y - o.prev.y) * a,
      z: o.prev.z + (o.z - o.prev.z) * a,
      yaw: o.prev.yaw + dy * a,
      pitch: o.prev.pitch + (o.pitch - o.prev.pitch) * a,
      mv: o.mv,
    };
  }

  function roster() {
    var list = [{ id: me.id, name: me.name, k: self.k, d: self.d, alive: self.alive, me: true }];
    for (var id in others) {
      list.push({ id: id, name: others[id].name, k: others[id].k, d: others[id].d, alive: others[id].alive, me: false });
    }
    list.sort(function (a, b) { return (b.k - a.k) || (a.d - b.d) || a.name.localeCompare(b.name); });
    return list;
  }

  root.Net = {
    init: init,
    tick: tick,
    publish: publish,
    setSelf: setSelf,
    claimHit: claimHit,
    poseOf: poseOf,
    roster: roster,
    others: function () { return others; },
    me: function () { return me; },
    count: function () { var n = 0; for (var k in others) n++; return n + 1; },
    live: function () { return !!api && !!me.id; },
    // Distinct claims paid, ever. The dedupe is invisible from the outside —
    // health regenerates, so a duplicate hit can be masked within seconds — and
    // a guard that cannot see it is a guard that passes when it breaks.
    appliedTotal: function () { return appliedTotal; },
    onHit: function (fn) { onHit = fn; },
    onRoster: function (fn) { onRoster = fn; },
  };
})(window);
