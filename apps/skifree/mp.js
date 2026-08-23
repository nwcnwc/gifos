/*
 * SkiFree — GifOS wrap.
 *
 * Upstream is a solo ski. Everything multiplayer is here: each skier
 * publishing pose + metres + lives on their own row, ghosts of the others
 * on your slope, a farthest-wins race, and (when you are alone) a ghost of
 * your best run. Nobody writes anybody else's row. Invite chrome is the
 * OS's, not ours. Solo without a tape is the original game.
 *
 * A subscriber re-downloads the whole collection on every change, so we
 * publish slowly (~8 Hz) with small numbers.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 9000;
  var HB_MS = 2500;
  var TAPE_MS = 125;

  var api = null;
  var room = null;
  var me = { id: null, name: 'You' };
  var subscribed = false;
  var lastPublished = 0;
  var hbTimer = 0;
  var round = 1;
  var lastList = [];
  var seenAt = {};
  var others = {};
  var roundOver = false;
  var tape = null;
  var tapeStart = 0;
  var tapeArmed = false;

  var $ = function (id) { return document.getElementById(id); };

  function now() { return Date.now(); }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function hashId(s) {
    var h = 2166136261;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function tintFor(id) { return hashId(id) % 360; }

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.t;
      if (changed) seenAt[p.id] = { stamp: p.t, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function snap() {
    var s = (root.Ski && root.Ski.snap) ? root.Ski.snap() : {};
    return {
      id: me.id,
      name: me.name,
      round: round,
      x: Math.round(s.x || 0),
      y: Math.round(s.y || 0),
      part: s.part || 'south',
      dist: Math.round((s.dist || 0) * 10) / 10,
      lives: s.lives == null ? 5 : s.lives | 0,
      over: !!s.over,
      jumping: !!s.jumping,
      hit: !!s.hit,
      t: now()
    };
  }

  function racingFriends() {
    return live(lastList).length >= 2;
  }

  function racing() {
    return racingFriends() || !!(tape && tape.length);
  }

  function publish(force) {
    if (!room || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    try { room.put(snap()).catch(function () {}); } catch (e) {}
  }

  function ingest(list) {
    lastList = list || [];
    var t = now();
    var seen = {};
    var players = live(lastList, t);
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      others[p.id] = {
        id: p.id,
        name: p.name || 'Skier',
        tx: p.x || 0,
        ty: p.y || 0,
        x: cur ? cur.x : (p.x || 0),
        y: cur ? cur.y : (p.y || 0),
        part: p.part || 'south',
        dist: p.dist || 0,
        lives: p.lives == null ? 5 : p.lives,
        over: !!p.over,
        stamp: p.t,
        seen: t,
        hue: tintFor(p.id)
      };
    }
    for (var id in others) {
      if (!seen[id] || t - others[id].seen > STALE_MS) delete others[id];
    }
    paintHud();
  }

  function lerpGhosts() {
    for (var id in others) {
      var o = others[id];
      o.x += ((o.tx || 0) - o.x) * 0.38;
      o.y += ((o.ty || 0) - o.y) * 0.38;
    }
  }

  function tapePose() {
    if (!tape || !tape.length) return null;
    if (racingFriends()) return null;
    var s = (root.Ski && root.Ski.snap) ? root.Ski.snap() : {};
    if (!tapeArmed) {
      if (s.dist > 1) {
        tapeArmed = true;
        tapeStart = now();
      } else {
        var first = tape[0];
        return { x: first[0], y: first[1], part: first[2] || 'south', dist: 0, name: 'Best', hue: 195, over: false };
      }
    }
    var i = Math.min(tape.length - 1, Math.floor((now() - tapeStart) / TAPE_MS));
    var a = tape[i];
    var b = tape[Math.min(tape.length - 1, i + 1)];
    var t = ((now() - tapeStart) / TAPE_MS) - i;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return {
      x: a[0] + (b[0] - a[0]) * t,
      y: a[1] + (b[1] - a[1]) * t,
      part: (t > 0.5 ? b[2] : a[2]) || 'south',
      dist: a[3] || 0,
      name: 'Best',
      hue: 195,
      over: i >= tape.length - 1
    };
  }

  function drawOneGhost(camera, img, data, o) {
    var part = data.parts[o.part] || data.parts.south;
    if (!part) return;
    var pos = camera.mapPositionToCanvasPosition([o.x, o.y]);
    var ctx = camera;
    ctx.save();
    ctx.globalAlpha = o.over ? 0.22 : 0.7;
    ctx.filter = 'hue-rotate(' + (o.hue || 0) + 'deg)';
    ctx.drawImage(img, part[0], part[1], part[2], part[3], pos[0], pos[1], part[2], part[3]);
    ctx.filter = 'none';
    ctx.globalAlpha = 0.95;
    var label = o.name || 'Skier';
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
    var tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillRect(pos[0] - 2, pos[1] - 16, tw + 6, 13);
    ctx.fillStyle = '#16324a';
    ctx.fillText(label, pos[0], pos[1] - 5);
    ctx.restore();
  }

  function drawGhosts(camera) {
    if (!camera || !root.Ski || !root.Ski.sprites) return;
    lerpGhosts();
    var data = root.Ski.sprites.skier;
    var img = camera.getLoadedImage(data.$imageFile);
    if (!img) return;
    for (var id in others) drawOneGhost(camera, img, data, others[id]);
    var local = tapePose();
    if (local) drawOneGhost(camera, img, data, local);
  }

  function roster() {
    var s = (root.Ski && root.Ski.snap) ? root.Ski.snap() : {};
    var rows = [{
      id: me.id || 'local',
      name: me.name || 'You',
      mine: true,
      dist: s.dist || 0,
      lives: s.lives == null ? 5 : s.lives,
      over: !!s.over
    }];
    for (var id in others) {
      var o = others[id];
      rows.push({
        id: o.id, name: o.name, mine: false,
        dist: o.dist, lives: o.lives, over: o.over
      });
    }
    if (!racingFriends()) {
      var local = tapePose();
      if (local) {
        rows.push({
          id: 'best', name: 'Best', mine: false,
          dist: local.dist, lives: 0, over: !!local.over
        });
      }
    }
    rows.sort(function (a, b) {
      if (a.over !== b.over) return a.over ? 1 : -1;
      return b.dist - a.dist;
    });
    return rows;
  }

  function verdict(rows) {
    if (rows.length < 2) return null;
    if (!rows.every(function (r) { return r.over; })) return null;
    var ranked = rows.slice().sort(function (a, b) { return b.dist - a.dist; });
    if (ranked[0].dist === ranked[1].dist) {
      return { kind: 'tie', a: ranked[0], b: ranked[1] };
    }
    return { kind: 'far', winner: ranked[0] };
  }

  function paintHud() {
    var bar = $('racebar');
    if (!bar) return;
    var rows = roster();
    if (rows.length < 2) {
      bar.hidden = true;
      bar.textContent = '';
      roundOver = false;
      document.body.classList.remove('racing');
      return;
    }
    bar.hidden = false;
    document.body.classList.add('racing');
    var bits = ['<div class="racers">'];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var label = r.mine ? 'You' : (r.name || 'Skier');
      var cls = 'who' + (r.over ? ' dead' : '') + (i === 0 ? ' lead' : '') + (r.mine ? ' mine' : '');
      bits.push('<span class="' + cls + '">' + esc(label) + ' <b>' + (r.dist || 0).toFixed(0) + 'm</b>' +
        (r.over ? ' out' : '') + '</span>');
    }
    bits.push('</div>');
    var v = verdict(rows);
    var meRow = rows.filter(function (r) { return r.mine; })[0];
    var note = '';
    if (v) {
      roundOver = true;
      if (v.kind === 'tie') {
        note = 'Tie at ' + (v.a.dist || 0).toFixed(0) + ' m.';
      } else {
        var mineWin = v.winner.mine;
        note = (mineWin ? 'You win' : esc(v.winner.name || 'They') + ' wins') +
          ' — farthest skier';
      }
    } else {
      roundOver = false;
      var othersAhead = rows.filter(function (r) { return !r.mine && !r.over && r.dist > ((meRow && meRow.dist) || 0); });
      if (meRow && meRow.over) {
        note = 'You’re out. Waiting to see who skis farther.';
      } else if (othersAhead.length) {
        var lead = othersAhead[0];
        var gap = (lead.dist || 0) - ((meRow && meRow.dist) || 0);
        note = esc(lead.name || 'They') + ' is ahead by ' + gap.toFixed(0) + ' m';
      }
    }
    if (note) bits.push('<span class="note">' + note + '</span>');
    bar.innerHTML = bits.join('');

    var tip = $('overTip');
    if (meRow && meRow.over && !v) {
      if (tip) tip.textContent = 'Waiting for the others…';
    } else if (v) {
      if (tip) tip.textContent = 'Space or tap to ski again — new run.';
    } else if (tip) {
      tip.textContent = 'Space or tap to ski again';
    }
  }

  function beat() {
    publish(true);
    paintHud();
  }

  function init() {
    api = root.gifos || null;
    if (!api || !api.db) return;
    try { room = api.db('room'); } catch (e) { return; }
    (api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      if (!subscribed) {
        subscribed = true;
        room.subscribe(function (list) { ingest(list || []); });
      }
      publish(true);
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(beat, HB_MS);
    }).catch(function () {
      me.id = 'local';
    });
  }

  root.SkiMp = {
    racing: racing,
    roundOver: function () { return roundOver; },
    onBegin: function () {
      tapeArmed = false;
      tapeStart = 0;
      publish(true);
      paintHud();
    },
    onRetry: function () {
      if (racingFriends() && roundOver) {
        round = (round || 1) + 1;
        roundOver = false;
      }
      tapeArmed = false;
      tapeStart = 0;
      publish(true);
    },
    onOver: function () {
      publish(true);
      paintHud();
    },
    publish: publish,
    drawGhosts: drawGhosts,
    setTape: function (samples) {
      tape = (samples && samples.length) ? samples : null;
      tapeArmed = false;
      tapeStart = 0;
      paintHud();
    },
    canRetry: function () {
      if (!racingFriends()) return true;
      return roundOver || !snap().over;
    }
  };

  init();
})(window);
