/*
 * FPS Simple — remote players as bodies in the world.
 *
 * The trick that makes multiplayer cheap here: upstream already has skinned,
 * animated, SHOOTABLE soldiers — the AI garrison. A remote player is one of
 * those bodies with its brain taken out and its transform fed from the wire.
 *
 * Everything then falls out for free, and it is worth being precise about what
 * "free" means, because it is the whole reason this app is a few hundred lines
 * rather than a few thousand:
 *
 *   - HIT DETECTION. Agents carry hit capsules that are pushed onto the animated
 *     skeleton every frame (Agent.syncHitboxes). The ballistics system already
 *     raycasts bullets against them with penetration, drop and travel time, and
 *     already emits `damage:dealt` naming the agent it hit. So aiming at another
 *     player uses the same code as aiming at the garrison — including headshots.
 *   - FEEDBACK. The HUD's hitmarkers listen to that same event, so a hit on a
 *     person reads exactly like a hit on a bot.
 *
 * WHAT WE MUST TAKE AWAY. An agent left to itself would think, path, and SHOOT
 * BACK — a remote player's body would open fire on its own initiative. So a net
 * body is marked `staged` (upstream's own "posed, not thinking" flag) with
 * `noDamage`, and the staged path is redirected here, where it does exactly two
 * things: put the body where the wire says, and animate it.
 *
 * Local health on a net body is also neutralised. The BODY is a puppet; the
 * PERSON's health lives in their own browser (see net.js). If we let the puppet
 * die locally we would show a corpse to a player who never accepted the hit —
 * so the puppet dies when, and only when, its owner says it died.
 */
(function (root) {
  'use strict';

  var ctx = null, ai = null, THREE = null;
  var bodies = {};            // playerId -> { agent, spawn, dead }
  var byAgent = new Map();    // agent -> playerId, for hit attribution
  var VARIANTS = ['vanguard', 'irregular', 'breacher'];
  var _v = null, _aim = null;

  function init(context) {
    ctx = context;
    THREE = root.COD.THREE;
    ai = ctx.peek('ai');
    if (!ai) return false;
    _v = new THREE.Vector3();
    _aim = new THREE.Vector3();

    // Redirect upstream's staged-agent path for OUR bodies only. Anything it
    // staged for its own reasons still goes through its own code.
    var staged = ai._updateStaged.bind(ai);
    ai._updateStaged = function (a, dt) {
      if (a.staged && a.staged.net) return drive(a, dt);
      return staged(a, dt);
    };

    // My bullets, landing on somebody. `damage:dealt` fires for every agent hit
    // by anything, so the filter matters: only bodies WE own the mapping for,
    // and only while their owner still thinks they are alive.
    ctx.events.on('damage:dealt', function (e) {
      if (!e || !e.target) return;
      var id = byAgent.get(e.target);
      if (!id) return;
      var rec = bodies[id];
      if (!rec || rec.dead) return;
      root.Net.claimHit(id, damageFor(e), !!e.headshot, rec.spawn);
    });
    return true;
  }

  // WHAT A PERSON COSTS, versus what a bot costs. `damage:dealt` carries the
  // raw wound — barrel damage scaled by the collider that was hit, which is
  // where the headshot multiplier already lives. It does NOT carry range: the
  // AI system applies its own distance falloff (full damage inside 22 m, tapering
  // to 0.45x by 77 m) when it hands the wound to an agent, and that step is the
  // one a net body skips, because a net body never takes damage locally.
  //
  // Claiming e.amount raw therefore made a PERSON take up to 2.2x what a BOT
  // takes from the identical shot at the identical range, so a rifle killed a
  // friend across the market square in two hits and a soldier standing next to
  // them in five. Ask the AI system for the same number it would have used.
  function damageFor(e) {
    var k = 1;
    try { if (ai && typeof ai._falloff === 'function') k = ai._falloff(e.point); } catch (err) {}
    return e.amount * (k > 0 && k <= 1 ? k : 1);
  }

  /* ------------------------------------------------------------------ */
  /* the per-frame puppet update                                        */
  /* ------------------------------------------------------------------ */

  function drive(a, dt) {
    var s = a.staged;
    var o = root.Net.others()[s.id];
    if (!o) return;
    var p = root.Net.poseOf(o);

    a.position.set(p.x, p.y, p.z);
    a.yaw = p.yaw;
    a.speed = p.mv;
    a.crouch = !!o.crouch;
    a.stateTime += dt;

    // Where the body is LOOKING. The rig aims at a point, not an angle, so turn
    // their yaw/pitch back into one 12 m out — far enough that the aim IK reads
    // as a person sighting down a street rather than staring at their own boots.
    var cp = Math.cos(p.pitch);
    _aim.set(
      p.x + Math.sin(p.yaw) * 12 * cp,
      p.y + 1.5 - Math.sin(p.pitch) * 12,
      p.z + Math.cos(p.yaw) * 12 * cp
    );
    a.aimTarget.copy(_aim);
    a.lastKnown.copy(_aim);
    a.lastKnownAge = 0;
    a.aimWeight = 1;
    a.hasTarget = false;      // no target => the brain has nothing to shoot at
    a.hasMoveTarget = false;
    a.wantFire = false;

    // Keep the physics capsule with the body, or bullets would hit where it used
    // to be and players would walk through each other's colliders.
    if (a.controller && a.controller.teleport) a.controller.teleport(p.x, p.y, p.z);

    a._drive(dt);
  }

  /* ------------------------------------------------------------------ */
  /* roster -> bodies                                                   */
  /* ------------------------------------------------------------------ */

  /** Called every frame from boot: reconcile the world's bodies with the wire. */
  function sync() {
    if (!ai) return;
    var others = root.Net.others();
    for (var id in others) {
      var o = others[id];
      var rec = bodies[id];
      // A respawn is a NEW body. Reusing the old one would mean reviving a
      // ragdoll mid-flight, and the skeleton is under the physics solver by then.
      if (rec && rec.spawn !== o.spawn) { removeBody(id); rec = null; }
      if (!rec && o.alive) rec = addBody(id, o);
      if (!rec) continue;
      if (!o.alive && !rec.dead) killBody(id, o);
    }
    for (var have in bodies) if (!others[have]) removeBody(have);
  }

  function addBody(id, o) {
    var variant = VARIANTS[Math.abs(hash(id)) % VARIANTS.length];
    var a;
    try {
      a = ai.spawn(variant, _v.set(o.x, o.y, o.z), o.yaw, {});
    } catch (err) {
      console.warn('[fps] could not spawn a body for ' + id, err);
      return null;
    }
    // Posed, not thinking — and never a source of damage to anyone.
    a.staged = { net: true, id: id, noDamage: true };
    // Upstream's killfeed reads `actor.name` off the body that fell, and an
    // agent has no name — every death of a real person read "ENEMY killed
    // OPERATOR". Name the puppet after the player wearing it and upstream's own
    // feed says who actually died, with nothing else changed.
    a.name = o.name || 'Player';
    // The puppet cannot be killed locally: its owner decides that. Without this,
    // a hit we THINK landed would drop a body the other player never conceded.
    a.applyDamage = function () { return false; };
    byAgent.set(a, id);
    bodies[id] = { agent: a, spawn: o.spawn, dead: false };
    return bodies[id];
  }

  // Their browser says they died. Now — and only now — let the body fall, using
  // upstream's own ragdoll path so it lands like every other corpse in the game.
  function killBody(id, o) {
    var rec = bodies[id];
    if (!rec || rec.dead) return;
    rec.dead = true;
    var a = rec.agent;
    delete a.applyDamage;                 // back to the prototype, so the kill lands
    a.staged = null;                      // stop puppeting: physics owns it now
    try {
      a.applyDamage(500, 'torso', a.position.clone(), _v.set(0, 0, 1));
    } catch (err) { /* a corpse that refuses to fall is not worth a crash */ }
  }

  function removeBody(id) {
    var rec = bodies[id];
    if (!rec) return;
    byAgent.delete(rec.agent);
    try { ai.remove ? ai.remove(rec.agent) : despawn(rec.agent); } catch (e) {}
    delete bodies[id];
  }

  // Upstream has no public despawn (nothing in a single-player game ever leaves),
  // so take the agent out of the list and its group out of the scene by hand.
  function despawn(a) {
    var i = ai.agents.indexOf(a);
    if (i >= 0) ai.agents.splice(i, 1);
    if (a.group && a.group.parent) a.group.parent.remove(a.group);
    if (a.colliders && ai.phys) {
      for (var c = 0; c < a.colliders.length; c++) {
        try { ai.phys.removeCollider(a.colliders[c]); } catch (e) {}
      }
    }
  }

  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

  /** Drop every body — used when the room empties, and on teardown. */
  function clear() { for (var id in bodies) removeBody(id); }

  root.Remote = { init: init, sync: sync, clear: clear, count: function () { var n = 0; for (var k in bodies) n++; return n; } };
})(window);
