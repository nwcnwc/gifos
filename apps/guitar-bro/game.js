// Falling-note trainer. Scoring, wrap, hearts and fretboard from
// makaroni4/guitar_bro. Canvas only — no live microphone.
(function (root) {
  'use strict';

  var C = root.GBConfig;
  var Songs = root.GBSongs;
  var COLS = 12;
  var MAX_HEALTH = 5;

  function randInt(min, max, signed) {
    var n = Math.floor(Math.random() * max) + (signed === false ? 0 : min);
    if (signed === false) {
      n = Math.floor(Math.random() * max) - min;
      n *= Math.floor(Math.random() * 2) === 1 ? 1 : -1;
    }
    return n;
  }

  function Explosion(ctx) {
    var list = [];
    function particle(x, y, ok) {
      this.x = x; this.y = y;
      this.xv = randInt(5, 10, false);
      this.yv = randInt(5, 10, false);
      this.size = randInt(2, 4, true);
      this.color = ok ? C.colors.green : C.colors.red;
    }
    return {
      add: function (x, y, ok) {
        var parts = [], i;
        for (i = 0; i < 25; i++) parts.push(new particle(x, y, ok));
        list.push({ particles: parts });
      },
      draw: function () {
        var e, p, keep, i, ii;
        for (i = list.length - 1; i >= 0; i--) {
          e = list[i];
          keep = [];
          for (ii = 0; ii < e.particles.length; ii++) {
            p = e.particles[ii];
            if (p.size <= 0) continue;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            p.x += p.xv; p.y += p.yv; p.size -= 0.1;
            keep.push(p);
          }
          if (keep.length) e.particles = keep;
          else list.splice(i, 1);
        }
      }
    };
  }

  function drawHeart(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x, y - h / 2, x - w / 2, y - h / 2, x - w / 2, y);
    ctx.bezierCurveTo(x - w / 2, y + h / 2, x, y + h / 2 * 2, x, y + h);
    ctx.bezierCurveTo(x, y + h / 2 * 2, x + w / 2, y + h / 2, x + w / 2, y);
    ctx.bezierCurveTo(x + w / 2, y - h / 2, x, y - h / 2, x, y);
    ctx.closePath();
    ctx.fill();
  }

  function Game(canvas) {
    var ctx = canvas.getContext('2d');
    var boom = new Explosion(ctx);
    var rocks = [];
    var highlight = { fret: -1, color: C.colors.yellow, until: 0 };
    var running = false;
    var paused = false;
    var raf = 0;
    var then = 0;
    var fpsInterval = 1000 / C.fps;
    var cssW = canvas.width || 800;
    var cssH = canvas.height || 480;
    var G = this;

    G.score = 0;
    G.health = MAX_HEALTH;
    G.hits = 0;
    G.misses = 0;
    G.resolved = 0;
    G.done = false;
    G.died = false;
    G.loop = true;
    G.songName = 'Random notes';
    G.stringId = '1';
    G.bpm = 30;
    G.mode = 'survival';
    G.seed = 1;
    G.onChange = null;
    G.onOver = null;

    function emit() { if (G.onChange) G.onChange(); }

    function layout() {
      var w = cssW, h = cssH;
      var col = w / COLS;
      var fretH = Math.max(52, Math.min(col * 1.15, h * 0.22));
      return { w: w, h: h, col: col, fretH: fretH, fretY: h - fretH };
    }

    function buildRocks() {
      var song = Songs.load(G.songName, G.stringId, G.seed);
      var L = layout();
      var i, note, dur, idx, y;
      rocks = [];
      y = 0;
      for (i = 0; i < song.length; i++) {
        note = song[i][0];
        dur = song[i][1] || 8;
        idx = note === '-' ? -1 : Songs.findNoteIndex(note, G.stringId);
        rocks.push({
          note: note,
          rest: note === '-',
          duration: dur,
          durationDistance: L.fretH * 8 / dur,
          x: idx < 0 ? -L.col : idx * L.col,
          y: y - L.fretH,
          idx: idx,
          marked: false,
          passed: false
        });
        y -= L.fretH * 8 / dur;
      }
    }

    function colliding(rock, L) {
      return rock.y + L.fretH > L.fretY;
    }

    function inWindow(rock, L) {
      return rock.y + L.fretH > L.fretY - L.fretH * 0.35 && rock.y < L.h;
    }

    function targetRock() {
      var L = layout();
      var i, r, best = null, bestY = -1e9;
      for (i = 0; i < rocks.length; i++) {
        r = rocks[i];
        if (r.passed || r.rest) continue;
        if (inWindow(r, L) && r.y > bestY) { bestY = r.y; best = r; }
      }
      return best;
    }

    function miss(rock, L) {
      if (rock.marked || rock.rest) return;
      rock.marked = true;
      G.score -= 10;
      G.health -= 1;
      G.misses += 1;
      if (G.health < 0) G.health = 0;
      boom.add(rock.x + L.col / 2, L.fretY + 4, false);
      emit();
    }

    function hit(rock, L) {
      rock.marked = true;
      G.score += 10;
      G.hits += 1;
      if (G.health < MAX_HEALTH) G.health += 1;
      boom.add(rock.x + L.col / 2, rock.y + L.fretH / 2, true);
      emit();
    }

    function finish() {
      if (G.done) return;
      G.done = true;
      running = false;
      if (G.onOver) G.onOver();
      emit();
    }

    function passRock(rock, L) {
      if (rock.passed) return;
      rock.passed = true;
      G.resolved += 1;
      if (!rock.rest && !rock.marked) miss(rock, L);
      else if (rock.marked && rock.color) {
        boom.add(rock.x + L.col / 2, L.h - 5, rock.color === C.colors.green);
      }
      if (G.mode === 'survival' && G.health <= 0) {
        G.died = true;
        finish();
        return;
      }
      if (!G.loop && G.resolved >= rocks.length) finish();
    }

    function step() {
      if (!running || paused || G.done) return;
      var L = layout();
      var beat = 60 / Math.max(8, G.bpm);
      var speed = L.fretH * 8 / (C.fps * beat);
      var i, r;
      for (i = 0; i < rocks.length; i++) {
        r = rocks[i];
        if (r.passed && !G.loop) continue;
        r.y += speed;
        if (r.y > L.h) {
          passRock(r, L);
          if (G.loop && !G.done) {
            var minY = 0, j;
            for (j = 0; j < rocks.length; j++) if (rocks[j].y < minY) minY = rocks[j].y;
            r.y = minY - r.durationDistance;
            r.marked = false;
            r.passed = false;
            r.color = null;
          }
        }
      }
    }

    function drawFretboard(L) {
      var i, x, mid = L.fretY + L.fretH / 2, rad = Math.max(3, L.fretH / 14);
      ctx.strokeStyle = C.colors.white;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, L.fretY);
      ctx.lineTo(L.w, L.fretY);
      ctx.stroke();
      for (i = 1; i < COLS; i++) {
        x = i * L.col;
        ctx.beginPath();
        ctx.moveTo(x, L.fretY);
        ctx.lineTo(x, L.h);
        ctx.stroke();
      }
      function dot(cx, cy) {
        ctx.fillStyle = C.colors.white;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      [2, 4, 6, 8].forEach(function (f) { dot(f * L.col + L.col / 2, mid); });
      dot(11 * L.col + L.col / 2, L.h - rad * 2.4);
      dot(11 * L.col + L.col / 2, L.fretY + rad * 2.4);
      if (highlight.fret >= 0 && Date.now() < highlight.until) {
        ctx.fillStyle = highlight.color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(highlight.fret * L.col, L.fretY, L.col, L.fretH);
        ctx.globalAlpha = 1;
      } else {
        highlight.fret = -1;
      }
    }

    function drawRocks(L) {
      var i, r, cx, cy, rad, fs;
      fs = Math.max(12, Math.min(28, L.col * 0.42));
      for (i = 0; i < rocks.length; i++) {
        r = rocks[i];
        if (r.rest) continue;
        if (r.y + L.fretH < 0 || r.y > L.h) continue;
        cx = r.idx * L.col + L.col / 2;
        cy = r.y + L.fretH / 2;
        rad = Math.max(10, L.col / 2 - 6);
        ctx.lineWidth = 6;
        ctx.strokeStyle = r.color || C.colors.white;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = C.colors.dark_blue;
        ctx.fill();
        ctx.fillStyle = C.colors.white;
        ctx.font = 'bold ' + fs + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r.note, cx, cy);
      }
    }

    function drawHearts(L) {
      if (G.mode !== 'survival') return;
      var i, x;
      ctx.fillStyle = C.colors.red;
      for (i = 0; i < G.health; i++) {
        x = L.w - 28 - i * 36;
        drawHeart(ctx, x, 22, 26, 16);
      }
    }

    function draw() {
      var L = layout();
      ctx.fillStyle = C.colors.dark_blue;
      ctx.fillRect(0, 0, L.w, L.h);
      drawFretboard(L);
      drawRocks(L);
      drawHearts(L);
      boom.draw();
    }

    function loop(t) {
      if (!running) return;
      raf = root.requestAnimationFrame(loop);
      if (paused) { draw(); return; }
      var elapsed = t - then;
      if (elapsed < fpsInterval) return;
      then = t - (elapsed % fpsInterval);
      step();
      draw();
    }

    G.layout = layout;
    G.target = function () {
      var r = targetRock();
      return r && !r.marked ? r.note : null;
    };
    G.playNote = function (note) {
      if (!running || paused || G.done || !note) return false;
      var L = layout();
      var fret = Songs.findNoteIndex(note, G.stringId);
      var rock = targetRock();
      highlight.fret = fret;
      highlight.until = Date.now() + 140;
      if (!rock || !colliding(rock, L)) {
        highlight.color = C.colors.yellow;
        return false;
      }
      if (rock.marked) return false;
      var ok = note === rock.note;
      highlight.color = ok ? C.colors.green : C.colors.red;
      rock.color = highlight.color;
      if (ok) hit(rock, L);
      else miss(rock, L);
      return ok;
    };
    G.tapAt = function (x, y) {
      var L = layout();
      if (y < L.fretY - L.fretH * 0.6) return false;
      var col = Math.floor(x / L.col);
      if (col < 0 || col >= COLS) return false;
      var note = Songs.notes(G.stringId)[col];
      return G.playNote(note);
    };
    G.hear = function () {
      var note = G.target();
      if (!note) {
        var n = Songs.notes(G.stringId);
        note = n[0];
      }
      var hz = Songs.freqOf(note, G.stringId);
      if (root.GBPitch) root.GBPitch.beep(hz);
      return note;
    };
    G.resize = function (w, h, dpr) {
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      dpr = dpr || 1;
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      if (canvas.style) {
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
      }
      if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) draw();
      else {
        var L = layout(), i, r;
        for (i = 0; i < rocks.length; i++) {
          r = rocks[i];
          r.x = r.idx < 0 ? -L.col : r.idx * L.col;
          r.durationDistance = L.fretH * 8 / r.duration;
        }
        draw();
      }
    };
    G.start = function (opt) {
      opt = opt || {};
      G.songName = opt.songName || G.songName;
      G.stringId = String(opt.stringId || G.stringId);
      G.bpm = +opt.bpm || G.bpm;
      G.mode = opt.mode || G.mode;
      G.seed = opt.seed == null ? G.seed : opt.seed;
      G.loop = opt.loop !== false && !opt.race;
      G.score = 0;
      G.health = MAX_HEALTH;
      G.hits = 0;
      G.misses = 0;
      G.resolved = 0;
      G.done = false;
      G.died = false;
      buildRocks();
      running = true;
      paused = false;
      then = (root.performance && performance.now()) || Date.now();
      if (raf) root.cancelAnimationFrame(raf);
      raf = root.requestAnimationFrame(loop);
      emit();
    };
    G.stop = function () {
      running = false;
      paused = false;
      if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
      draw();
    };
    G.pause = function () { paused = true; };
    G.resume = function () {
      if (!running || G.done) return;
      paused = false;
      then = (root.performance && performance.now()) || Date.now();
    };
    G.playing = function () { return running && !paused && !G.done; };
    G.paused = function () { return paused; };
    G.advance = function (n) {
      var i;
      for (i = 0; i < n; i++) {
        if (G.done) break;
        step();
      }
      draw();
    };
    G.paint = draw;
    G.snapshot = function () {
      return {
        score: G.score,
        health: G.health,
        hits: G.hits,
        misses: G.misses,
        resolved: G.resolved,
        done: G.done,
        died: G.died,
        songName: G.songName,
        stringId: G.stringId,
        bpm: G.bpm,
        mode: G.mode,
        seed: G.seed
      };
    };
    draw();
  }

  root.GBGame = Game;
})(typeof window !== 'undefined' ? window : globalThis);
