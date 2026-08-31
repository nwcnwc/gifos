/*
 * Chrome Dino — extra dinos over a meeting.
 *
 * Each runner owns one row in `players` and only ever writes that row. A
 * shared obstacle seed means everyone races the same desert; ghosts sit a
 * little ahead or behind on this canvas. Publish is slow (8 Hz) because a
 * subscriber re-downloads the whole collection on every change.
 *
 * Invite is OS chrome. Solo is the original game.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 8000;

  var api = null;
  var me = { id: null, name: 'Runner' };
  var others = {};
  var lastPublished = 0;
  var seed = 0;
  var overlay = null;
  var octx = null;
  var tintCanvas = null;
  var tctx = null;
  var raf = 0;
  var attached = null;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }

  function hashId(s) {
    var h = 2166136261;
    s = String(s || '');
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function tintFor(id) {
    var h = hashId(id) % 280;
    if (h > 40 && h < 80) h += 80;
    return 'hsl(' + h + ', 62%, 42%)';
  }

  function pickSeed() {
    var id, live = null;
    for (id in others) {
      if (others[id].alive && others[id].seed) {
        if (!live || id < live.id) live = others[id];
      }
    }
    if (live) return live.seed >>> 0;
    return (now() ^ hashId(me.id)) >>> 0 || 1;
  }

  function beginRun(r) {
    seed = pickSeed();
    if (root.Runner && root.Runner.seedObstacles) root.Runner.seedObstacles(seed);
    publish(r, true);
    paintHud();
  }

  function crashed(r) {
    publish(r, true);
    paintHud();
  }

  function myPose(r) {
    var t = r && r.tRex;
    return {
      y: t ? Math.round(t.yPos) : 93,
      duck: !!(t && t.ducking),
      status: t ? t.status : 'WAITING',
      frame: t ? (t.currentFrame | 0) : 0,
      alive: !!(r && r.playing && !r.crashed),
      crashed: !!(r && r.crashed),
      distance: r ? Math.round(r.distanceRan || 0) : 0,
      score: root.Dino ? root.Dino.scoreOf(r) : 0
    };
  }

  function publish(r, force) {
    if (!api || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var p = myPose(r || (root.Runner && root.Runner.instance_));
    db('players').put({
      id: me.id,
      name: me.name,
      y: p.y,
      duck: p.duck ? 1 : 0,
      status: p.status,
      frame: p.frame,
      alive: p.alive ? 1 : 0,
      crashed: p.crashed ? 1 : 0,
      distance: p.distance,
      score: p.score,
      seed: seed || 0,
      t: t
    }).catch(function () {});
  }

  function ingest(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.distance !== p.distance || cur.y !== p.y || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Runner',
        y: p.y == null ? 93 : p.y,
        duck: !!p.duck,
        status: p.status || 'RUNNING',
        frame: p.frame | 0,
        alive: !!p.alive,
        crashed: !!p.crashed,
        distance: p.distance || 0,
        score: p.score || 0,
        seed: p.seed || 0,
        stamp: p.t,
        seen: moved ? t : (cur ? cur.seen : t),
        color: cur && cur.color ? cur.color : tintFor(p.id)
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    paintHud();
  }

  function shortName(n) {
    n = String(n || 'Runner').replace(/\s+/g, ' ').trim() || 'Runner';
    if (n.length > 10) n = n.slice(0, 9) + '\u2026';
    return n;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function roster(r) {
    var p = myPose(r || (root.Runner && root.Runner.instance_));
    var rows = [{
      id: me.id || 'local', name: me.name || 'You', mine: true,
      alive: p.alive, crashed: p.crashed, distance: p.distance, score: p.score
    }];
    for (var id in others) {
      var o = others[id];
      rows.push({
        id: o.id, name: o.name, mine: false,
        alive: o.alive, crashed: o.crashed, distance: o.distance, score: o.score
      });
    }
    rows.sort(function (a, b) {
      if (a.score !== b.score) return b.score - a.score;
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.distance - a.distance;
    });
    return rows;
  }

  function paintHud() {
    var bar = document.getElementById('racebar');
    if (!bar) return;
    var rows = roster();
    if (rows.length < 2) {
      bar.hidden = true;
      bar.innerHTML = '';
      document.body.classList.remove('racing');
      return;
    }
    document.body.classList.add('racing');
    bar.hidden = false;
    var bits = ['<div class="racers">'];
    var i, row, label, cls;
    for (i = 0; i < rows.length; i++) {
      row = rows[i];
      label = row.mine ? 'You' : shortName(row.name);
      cls = 'who' + (row.mine ? ' mine' : '') + (row.alive ? '' : ' dead') + (i === 0 ? ' lead' : '');
      bits.push('<span class="' + cls + '">' + escapeHtml(label) + ' <b>' + (row.score | 0) + '</b></span>');
    }
    bits.push('</div>');
    var meRow = rows.filter(function (x) { return x.mine; })[0];
    var lead = rows[0];
    var other = rows.filter(function (x) { return !x.mine; })[0];
    var allDead = rows.every(function (x) { return !x.alive; });
    var someoneAlive = rows.some(function (x) { return !x.mine && x.alive; });
    var someoneDead = rows.some(function (x) { return !x.mine && !x.alive; });
    var call = '';
    if (allDead) {
      if (other && lead.score === other.score && meRow && lead.score === meRow.score) {
        call = 'Tie — ' + (lead.score | 0);
      } else if (lead.mine) {
        call = 'You win — ' + (lead.score | 0) + (other ? ' to ' + (other.score | 0) : '');
      } else {
        call = escapeHtml(shortName(lead.name)) + ' wins — ' + (lead.score | 0) +
          (meRow ? ' to ' + (meRow.score | 0) : '');
      }
    } else if (!meRow.alive && someoneAlive) {
      call = 'they are still running';
    } else if (meRow && !meRow.alive && !meRow.crashed) {
      call = 'same desert — jump to race';
    } else if (meRow && meRow.alive && someoneDead) {
      call = 'they crashed — keep going';
    } else if (meRow && meRow.alive && other && other.score > meRow.score) {
      call = 'they are ahead';
    } else if (meRow && !meRow.alive) {
      call = 'jump to race — same desert';
    }
    if (call) bits.push('<div class="call">' + call + '</div>');
    bar.innerHTML = bits.join('');
  }

  function fitOverlay(r) {
    if (!overlay || !r || !r.canvas) return;
    overlay.width = r.canvas.width;
    overlay.height = r.canvas.height;
    overlay.style.width = r.canvas.style.width || (r.dimensions.WIDTH + 'px');
    overlay.style.height = r.canvas.style.height || (r.dimensions.HEIGHT + 'px');
    octx = overlay.getContext('2d');
    if (root.Runner && root.Runner.updateCanvasScaling) {
      root.Runner.updateCanvasScaling(overlay, r.dimensions.WIDTH, r.dimensions.HEIGHT);
    }
  }

  function ensureOverlay(r) {
    if (!r || !r.containerEl) return;
    if (overlay && overlay.parentNode) return;
    overlay = document.createElement('canvas');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;z-index:3;';
    r.containerEl.appendChild(overlay);
    fitOverlay(r);
  }

  function drawGhost(r, o) {
    var Trex = root.Runner && root.Runner.Trex;
    var sprite = root.Runner && root.Runner.imageSprite;
    if (!Trex || !sprite || !octx) return;
    var hidpi = window.devicePixelRatio > 1;
    var def = hidpi ? root.Runner.spriteDefinition.HDPI : root.Runner.spriteDefinition.LDPI;
    var myX = r.tRex ? r.tRex.xPos : 50;
    var x = myX + (o.distance - (r.distanceRan || 0));
    if (x < -80 || x > r.dimensions.WIDTH + 20) return;
    var y = o.y;
    var status = o.status;
    if (!Trex.animFrames[status]) status = o.crashed ? 'CRASHED' : (o.duck ? 'DUCKING' : 'RUNNING');
    var frames = Trex.animFrames[status].frames;
    var frame = frames[Math.abs(o.frame) % frames.length];
    var duck = status === 'DUCKING';
    var srcW = duck ? Trex.config.WIDTH_DUCK : Trex.config.WIDTH;
    var srcH = Trex.config.HEIGHT;
    var sx = frame, sy = 0, sw = srcW, sh = srcH;
    if (hidpi) { sx *= 2; sy *= 2; sw *= 2; sh *= 2; }
    sx += def.TREX.x;
    sy += def.TREX.y;
    if (!tintCanvas) {
      tintCanvas = document.createElement('canvas');
      tctx = tintCanvas.getContext('2d');
    }
    tintCanvas.width = srcW;
    tintCanvas.height = srcH;
    tctx.clearRect(0, 0, srcW, srcH);
    tctx.globalCompositeOperation = 'source-over';
    tctx.globalAlpha = 1;
    tctx.drawImage(sprite, sx, sy, sw, sh, 0, 0, srcW, srcH);
    tctx.globalCompositeOperation = 'source-atop';
    tctx.globalAlpha = 0.4;
    tctx.fillStyle = o.color;
    tctx.fillRect(0, 0, srcW, srcH);
    tctx.globalCompositeOperation = 'source-over';
    tctx.globalAlpha = 1;
    octx.save();
    octx.globalAlpha = o.alive ? 0.75 : 0.28;
    octx.drawImage(tintCanvas, x, y);
    octx.globalAlpha = 1;
    octx.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    octx.fillStyle = o.color;
    octx.textAlign = 'center';
    octx.textBaseline = 'bottom';
    octx.fillText(shortName(o.name), x + srcW / 2, y - 2);
    octx.restore();
  }

  function paintGhosts(r) {
    r = r || attached;
    if (!r || !octx) return;
    octx.clearRect(0, 0, r.dimensions.WIDTH, r.dimensions.HEIGHT);
    if (!countOthers()) return;
    for (var id in others) drawGhost(r, others[id]);
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    var r = root.Runner && root.Runner.instance_;
    if (!r) return;
    ensureOverlay(r);
    if (overlay && (overlay.width !== r.canvas.width || overlay.height !== r.canvas.height)) {
      fitOverlay(r);
    }
    paintGhosts(r);
  }

  function attach(r) {
    attached = r;
    ensureOverlay(r);
    if (!raf) loop();
  }

  function tick(r) {
    publish(r, false);
  }

  function countOthers() {
    var n = 0;
    for (var k in others) n++;
    return n;
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ others: 0 });
    var infoP = api.me ? api.me() : Promise.resolve({ id: 'local', name: 'Runner' });
    return infoP.then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Runner';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ others: countOthers() });
        };
        setTimeout(done, 2500);
        db('players').subscribe(function (list) {
          ingest(list || []);
          done();
        });
      });
    }).catch(function () {
      return { others: 0 };
    });
  }

  root.Net = {
    init: init,
    attach: attach,
    tick: tick,
    beginRun: beginRun,
    crashed: crashed,
    roster: roster,
    others: function () { return others; },
    me: function () { return me; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    live: function () { return !!api && !!me.id; }
  };
})(window);
