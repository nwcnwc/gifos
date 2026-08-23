/*
 * Q1K3 — remote players as bodies in the world.
 *
 * The cheap trick: upstream already has shootable humanoid models (the
 * grunt / enforcer / zombie). A remote player is one of those bodies
 * with the brain removed and the transform fed from the wire. Local
 * shots already collide with anything in game_entities_enemies, so a
 * person costs the same pellets a grunt does.
 *
 * The puppet never dies locally. Health lives in the owner's browser;
 * we hide the body when they say they are dead, and we claim the hit
 * on our own row when we shoot them.
 */
(function (root) {
  'use strict';

  var bodies = {};

  function kindOf(o) {
    var k = o.kind || 0;
    if (k === 1) return { model: model_enforcer, t: 19, s: 28 };
    if (k === 2) return { model: model_zombie, t: 18, s: 24 };
    return { model: model_grunt, t: 17, s: 24 };
  }

  function spawnOne(o) {
    if (typeof entity_t === 'undefined' || typeof game_spawn === 'undefined') return null;
    var k = kindOf(o);
    var e = game_spawn(entity_t, vec3(o.x || 0, o.y || 0, o.z || 0));
    e._nid = o.id;
    e._spawn = o.spawn || 0;
    e.s = vec3(12, k.s, 12);
    e._model = k.model;
    e._texture = k.t;
    e._health = 1000;
    e._gravity = 0;
    e.f = 0;
    e._check_against = ENTITY_GROUP_NONE;
    e._anim = [1, [0]];
    e._update = function () {
      if (this._hidden) return;
      this._draw_model();
    };
    e._receive_damage = function (from, amount) {
      if (this._hidden) return;
      if (root.Net) root.Net.claimHit(this._nid, amount, this._spawn);
      this._spawn_particles(2, 200, model_blood, 18, 0.5);
    };
    e._kill = function () { /* puppet: the owner decides */ };
    if (typeof game_entities_enemies !== 'undefined') game_entities_enemies.push(e);
    return e;
  }

  function drop(id) {
    var e = bodies[id];
    if (!e) return;
    e._dead = 1;
    e._hidden = 1;
    if (typeof game_entities_enemies !== 'undefined') {
      game_entities_enemies = game_entities_enemies.filter(function (x) { return x !== e; });
    }
    delete bodies[id];
  }

  function sync() {
    if (!root.Net || typeof game_entities === 'undefined') return;
    var others = root.Net.others();
    var seen = {};
    for (var id in others) {
      seen[id] = 1;
      var o = others[id];
      var e = bodies[id];
      if (!e || e._dead) {
        e = spawnOne(o);
        if (!e) continue;
        bodies[id] = e;
      }
      e._spawn = o.spawn || 0;
      e._hidden = !o.alive;
      if (e._hidden) {
        e.s = vec3(0, 0, 0);
        continue;
      }
      var k = kindOf(o);
      e.s = vec3(12, k.s, 12);
      var p = root.Net.poseOf(o);
      e.p.x = p.x; e.p.y = p.y; e.p.z = p.z;
      e._yaw = p.yaw + Math.PI / 2;
      e._anim = o.mv ? [0.40, [1, 2, 3, 4]] : [1, [0]];
    }
    for (var bid in bodies) {
      if (!seen[bid]) drop(bid);
    }
  }

  function onReset() {
    bodies = {};
  }

  root.Remote = { sync: sync, onReset: onReset, drop: drop };
})(window);
