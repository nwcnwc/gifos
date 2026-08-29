/* Bowling alley: ten-pin score, 2-D physics, perspective paint.
 * Layout/throw numbers come from BowlLayout (tincoats/bowling). */
(function (root) {
  'use strict';

  var L = root.BowlLayout;
  var PIN_N = 10;
  var FALL_SPEED = 1.15;
  var FALL_DIST = 0.42;
  var GUTTER = 2.62;
  var PIT_Z = 14.6;
  var APPROACH_Z = L.ballStart.z;
  var LANE_Z0 = -8.2;
  var LANE_Z1 = 14.2;
  var STILL = 0.08;
  var SETTLE_S = 0.55;
  var MAX_ROLL_S = 7;

  function hypot(x, z) { return Math.sqrt(x * x + z * z); }
  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }

  /* ------------------------------------------------------------------ */
  /* ten-pin scoring                                                     */
  /* ------------------------------------------------------------------ */

  function throwsOf(frames, from, n) {
    var got = [], i, t, f;
    for (i = from; i < 10 && got.length < n; i++) {
      f = frames[i] || [];
      for (t = 0; t < f.length && got.length < n; t++) got.push(f[t] | 0);
    }
    return got;
  }

  function frameClosed(frames, i) {
    var f = frames[i] || [];
    if (i < 9) return f[0] === 10 || f.length >= 2;
    if (f[0] === 10 || ((f[0] || 0) + (f[1] || 0) === 10)) return f.length >= 3;
    return f.length >= 2;
  }

  function frameReady(frames, i) {
    if (!frameClosed(frames, i)) return false;
    var f = frames[i] || [];
    if (i >= 9) return true;
    if (f[0] === 10) return throwsOf(frames, i + 1, 2).length >= 2;
    if ((f[0] || 0) + (f[1] || 0) === 10) return throwsOf(frames, i + 1, 1).length >= 1;
    return true;
  }

  function frameScore(frames, i) {
    var f = frames[i] || [];
    var a = f[0] | 0, b = f[1] | 0, c = f[2] | 0;
    if (i >= 9) return a + b + c;
    if (a === 10) {
      var nx = throwsOf(frames, i + 1, 2);
      return 10 + (nx[0] | 0) + (nx[1] | 0);
    }
    if (a + b === 10) {
      var n1 = throwsOf(frames, i + 1, 1);
      return 10 + (n1[0] | 0);
    }
    return a + b;
  }

  function running(frames) {
    var tot = 0, out = [], i;
    for (i = 0; i < 10; i++) {
      if (!frameReady(frames, i)) { out.push(null); continue; }
      tot += frameScore(frames, i);
      out.push(tot);
    }
    return out;
  }

  function totalOf(frames) {
    var r = running(frames), i, v = 0;
    for (i = 0; i < r.length; i++) if (r[i] != null) v = r[i];
    return v;
  }

  function gameOver(frames) {
    return frameClosed(frames, 9);
  }

  function markThrow(v, first, isTenth) {
    if (v == null) return '';
    if (first && v === 10) return 'X';
    if (!first && v === 10 && isTenth) return 'X';
    if (v === 0) return '-';
    return String(v);
  }

  function marks(frame, tenth) {
    var a = frame[0], b = frame[1], c = frame[2], out = ['', '', ''];
    if (a == null) return out;
    if (a === 10) {
      out[0] = tenth ? 'X' : '';
      out[1] = tenth ? '' : 'X';
      if (tenth) {
        if (b != null) out[1] = b === 10 ? 'X' : markThrow(b, false, true);
        if (c != null) {
          if (b === 10) out[2] = c === 10 ? 'X' : markThrow(c, false, true);
          else if ((b | 0) + c === 10) out[2] = '/';
          else out[2] = markThrow(c, false, true);
        }
      }
      return out;
    }
    out[0] = markThrow(a, true, tenth);
    if (b == null) return out;
    if (a + b === 10) out[1] = '/';
    else out[1] = markThrow(b, false, tenth);
    if (tenth && c != null) {
      if (a + b === 10) out[2] = c === 10 ? 'X' : markThrow(c, false, true);
      else out[2] = markThrow(c, false, true);
    }
    return out;
  }

  var Score = {
    running: running,
    total: totalOf,
    gameOver: gameOver,
    frameClosed: frameClosed,
    marks: marks
  };

  /* ------------------------------------------------------------------ */
  /* physics                                                             */
  /* ------------------------------------------------------------------ */

  function makePin(i) {
    var p = L.pins[i];
    return {
      i: i, x: p.x, z: p.z, hx: p.x, hz: p.z,
      vx: 0, vz: 0, r: L.pinRadius, mass: L.pinMass,
      up: 1, rot: 0
    };
  }

  function resetPin(p) {
    p.x = p.hx; p.z = p.hz; p.vx = 0; p.vz = 0; p.up = 1; p.rot = 0; p.r = L.pinRadius;
  }

  function Game() {
    this.ball = {
      x: L.ballStart.x, z: L.ballStart.z,
      vx: 0, vz: 0, r: L.ballRadius, mass: L.ballMass,
      gutter: 0
    };
    this.pins = [];
    var i;
    for (i = 0; i < PIN_N; i++) this.pins.push(makePin(i));
    this.frames = [];
    this.cur = [];
    this.rolling = false;
    this.settled = true;
    this.stillT = 0;
    this.rollT = 0;
    this.standAtThrow = PIN_N;
    this.hits = 0;
    this.lastResult = null;
  }

  Game.prototype.reset = function () {
    this.frames = [];
    this.cur = [];
    this.lastResult = null;
    this.resetRack(true);
    this.resetBall();
  };

  Game.prototype.resetBall = function () {
    var b = this.ball;
    b.x = L.ballStart.x;
    b.z = L.ballStart.z;
    b.vx = 0; b.vz = 0; b.gutter = 0;
    this.rolling = false;
    this.settled = true;
    this.stillT = 0;
    this.rollT = 0;
    this.hits = 0;
  };

  Game.prototype.resetRack = function (all) {
    var i, p;
    for (i = 0; i < PIN_N; i++) {
      p = this.pins[i];
      if (all || p.up) resetPin(p);
      else {
        p.x = 8; p.z = 16; p.vx = 0; p.vz = 0; p.r = 0;
      }
    }
  };

  Game.prototype.standing = function () {
    var n = 0, i;
    for (i = 0; i < PIN_N; i++) if (this.pins[i].up) n++;
    return n;
  };

  Game.prototype.mask = function () {
    var m = 0, i;
    for (i = 0; i < PIN_N; i++) if (this.pins[i].up) m |= (1 << i);
    return m;
  };

  Game.prototype.setX = function (x) {
    if (this.rolling) return;
    this.ball.x = clamp(x, -L.clampX, L.clampX);
  };

  Game.prototype.nudgeX = function (dxPx) {
    if (this.rolling) return;
    this.setX(this.ball.x + dxPx * L.moveScale);
  };

  Game.prototype.canAim = function () {
    return !this.rolling && !Score.gameOver(this.frames);
  };

  Game.prototype.throwImpulse = function (iz, ix) {
    if (this.rolling || Score.gameOver(this.frames)) return false;
    if (!(iz > 0)) return false;
    var b = this.ball;
    b.vz = iz / b.mass;
    b.vx = (ix || 0) / b.mass;
    b.gutter = 0;
    this.rolling = true;
    this.settled = false;
    this.stillT = 0;
    this.rollT = 0;
    this.hits = 0;
    this.standAtThrow = this.standing();
    this.lastResult = null;
    return true;
  };

  function collide(a, b, e) {
    var dx = b.x - a.x, dz = b.z - a.z;
    var dist = hypot(dx, dz);
    var min = a.r + b.r;
    if (dist >= min || dist < 1e-8) return 0;
    var nx = dx / dist, nz = dz / dist;
    var invA = 1 / a.mass, invB = 1 / b.mass, inv = invA + invB;
    var overlap = min - dist;
    a.x -= nx * overlap * (invA / inv);
    a.z -= nz * overlap * (invA / inv);
    b.x += nx * overlap * (invB / inv);
    b.z += nz * overlap * (invB / inv);
    var rvn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rvn > 0) return 0;
    var j = -(1 + e) * rvn / inv;
    a.vx -= j * nx * invA;
    a.vz -= j * nz * invA;
    b.vx += j * nx * invB;
    b.vz += j * nz * invB;
    return Math.abs(j);
  }

  function maybeFall(p, j) {
    if (!p.up) return;
    var spd = hypot(p.vx, p.vz);
    var d = hypot(p.x - p.hx, p.z - p.hz);
    if (spd > FALL_SPEED || d > FALL_DIST || j > 2.4) {
      p.up = 0;
    }
  }

  Game.prototype._substep = function (dt) {
    var b = this.ball, pins = this.pins, i, j, p, q, hit, e;
    if (b.gutter) {
      b.x += (b.x < 0 ? -1 : 1) * 0.4 * dt;
      b.x = clamp(b.x, -3.15, 3.15);
    } else {
      b.x += b.vx * dt;
      if (Math.abs(b.x) > GUTTER) {
        b.gutter = 1;
        b.vx = 0;
        b.x = b.x < 0 ? -GUTTER - 0.12 : GUTTER + 0.12;
      }
    }
    b.z += b.vz * dt;
    b.vx *= Math.pow(0.50, dt);
    b.vz *= Math.pow(0.70, dt);
    if (b.z > PIT_Z + 0.8) { b.z = PIT_Z + 0.8; b.vz *= -0.12; b.vx *= 0.4; }

    for (i = 0; i < PIN_N; i++) {
      p = pins[i];
      if (p.r <= 0) continue;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.rot += (p.up ? 0 : hypot(p.vx, p.vz)) * dt * 1.6;
      p.vx *= Math.pow(p.up ? 0.08 : 0.18, dt);
      p.vz *= Math.pow(p.up ? 0.08 : 0.18, dt);
      if (p.z > PIT_Z) { p.up = 0; p.vz *= -0.15; p.z = PIT_Z; }
      if (p.z < 8.4 && !p.up) { p.vz *= 0.4; }
      if (Math.abs(p.x) > 3.05) {
        p.up = 0;
        p.vx *= -0.2;
        p.x = clamp(p.x, -3.05, 3.05);
      }
    }

    e = L.restitution;
    if (!b.gutter) {
      for (i = 0; i < PIN_N; i++) {
        p = pins[i];
        if (p.r <= 0) continue;
        hit = collide(b, p, e);
        if (hit) {
          this.hits += 1;
          maybeFall(p, hit);
        }
      }
    }
    for (i = 0; i < PIN_N; i++) {
      p = pins[i];
      if (p.r <= 0) continue;
      for (j = i + 1; j < PIN_N; j++) {
        q = pins[j];
        if (q.r <= 0) continue;
        hit = collide(p, q, e + 0.08);
        if (hit) {
          maybeFall(p, hit);
          maybeFall(q, hit);
        }
      }
    }
  };

  Game.prototype.step = function (dt) {
    if (!this.rolling) return;
    var sub = Math.max(1, Math.min(8, Math.ceil(hypot(this.ball.vx, this.ball.vz) * dt / 0.18)));
    var sdt = dt / sub, i;
    for (i = 0; i < sub; i++) this._substep(sdt);
    this.rollT += dt;

    var moving = hypot(this.ball.vx, this.ball.vz) > STILL;
    if (!this.ball.gutter && this.ball.z < PIT_Z - 0.4 && this.ball.z > APPROACH_Z + 0.5) {
      moving = moving || hypot(this.ball.vx, this.ball.vz) > STILL * 0.5;
    }
    for (i = 0; i < PIN_N; i++) {
      if (this.pins[i].r > 0 && hypot(this.pins[i].vx, this.pins[i].vz) > STILL) moving = true;
    }
    if (!moving) this.stillT += dt;
    else this.stillT = 0;

    if (this.stillT >= SETTLE_S || this.rollT >= MAX_ROLL_S) {
      this.rolling = false;
      this.settled = true;
      this.ball.vx = 0;
      this.ball.vz = 0;
      for (i = 0; i < PIN_N; i++) { this.pins[i].vx = 0; this.pins[i].vz = 0; }
      this.lastResult = this.commitThrow();
    }
  };

  Game.prototype.commitThrow = function () {
    var left = this.standing();
    var knocked = this.standAtThrow - left;
    if (knocked < 0) knocked = 0;
    var guttered = !!this.ball.gutter && knocked === 0;
    var fi = this.frames.length;
    var tenth = fi >= 9;
    this.cur.push(knocked);
    var cur = this.cur;
    var strike = cur.length === 1 && knocked === 10;
    var spare = cur.length === 2 && !tenth && (cur[0] + cur[1] === 10);
    if (tenth) {
      spare = cur.length === 2 && cur[0] !== 10 && cur[0] + cur[1] === 10;
    }
    var close = false, reset = false, done = false;
    if (!tenth) {
      if (cur[0] === 10 || cur.length >= 2) { close = true; reset = true; }
    } else {
      if (cur.length === 1) reset = cur[0] === 10;
      else if (cur.length === 2) {
        if (cur[0] === 10) reset = cur[1] === 10;
        else if (cur[0] + cur[1] === 10) reset = true;
        else { close = true; done = true; }
      } else {
        close = true; done = true;
      }
    }
    if (close) {
      this.frames.push(cur.slice());
      this.cur = [];
    }
    if (reset) this.resetRack(true);
    else this.resetRack(false);
    this.resetBall();
    var tot = Score.total(this.frames);
    return {
      knocked: knocked,
      standing: left,
      strike: !!strike,
      spare: !!spare,
      gutter: guttered,
      close: close,
      done: done || Score.gameOver(this.frames),
      total: tot,
      frames: this.frames,
      cur: this.cur.slice()
    };
  };

  Game.prototype.pack = function () {
    var b = this.ball, pins = [], i, p;
    for (i = 0; i < PIN_N; i++) {
      p = this.pins[i];
      pins.push([
        Math.round(p.x * 100) / 100,
        Math.round(p.z * 100) / 100,
        p.up ? 1 : 0,
        Math.round(p.vx * 100) / 100,
        Math.round(p.vz * 100) / 100
      ]);
    }
    return {
      ball: [
        Math.round(b.x * 100) / 100,
        Math.round(b.z * 100) / 100,
        Math.round(b.vx * 100) / 100,
        Math.round(b.vz * 100) / 100,
        b.gutter ? 1 : 0
      ],
      pins: pins,
      rolling: this.rolling ? 1 : 0
    };
  };

  Game.prototype.applyPack = function (s) {
    if (!s || !s.ball) return;
    var b = this.ball, p, i, q;
    b.x = s.ball[0]; b.z = s.ball[1]; b.vx = s.ball[2]; b.vz = s.ball[3];
    b.gutter = s.ball[4] ? 1 : 0;
    this.rolling = !!s.rolling;
    this.settled = !this.rolling;
    if (s.pins) {
      for (i = 0; i < PIN_N && i < s.pins.length; i++) {
        p = this.pins[i]; q = s.pins[i];
        p.x = q[0]; p.z = q[1]; p.up = q[2] ? 1 : 0; p.vx = q[3] || 0; p.vz = q[4] || 0;
        p.r = p.up || hypot(p.x - p.hx, p.z - p.hz) < 4 ? L.pinRadius : 0;
      }
    }
  };

  /* ------------------------------------------------------------------ */
  /* paint — looking down the lane from behind the ball                  */
  /* ------------------------------------------------------------------ */

  /*
   * The camera. The floor's vanishing line is `horizon`, and everything on the
   * floor is drawn below it — so the horizon decides how much of the frame the
   * alley gets, and the focal length decides where the foul line lands.
   *
   * It used to be `H * 0.70` with `f = min(W, H) * 1.12`. That put the
   * vanishing line seven tenths of the way down the frame and threw the foul
   * line far below the bottom of it: measured at 1100x790, the pins landed at
   * y = 714 of 790 and the whole alley was squeezed into the bottom fifth with
   * empty dark above. It is the same shape on a phone (pins at 647 of 812), and
   * nothing like the lane on the app's own store card, which is a lane filling
   * the frame with the pins near the top.
   *
   * The vanishing line now sits just off the top and f is solved so the foul
   * line (dz = 4.0, hence the 1.2 = camY / 4.0 * 1) lands exactly on the bottom
   * edge. The pins come out around a sixth of the way down at any aspect, and
   * the gutters run off the bottom corners the way they do on the card. f is
   * also capped against W so a narrow portrait phone does not end up standing
   * on the ball.
   */
  function project(x, y, z, W, H) {
    var camY = 4.8, camZ = -12.2;
    var dz = z - camZ;
    if (dz < 0.35) dz = 0.35;
    var horizon = H * 0.02;
    var f = Math.min((H - horizon) / 1.2, W * 1.7);
    return { x: W * 0.5 + x * f / dz, y: horizon + (camY - y) * f / dz, s: f / dz };
  }

  function laneQuad(ctx, W, H) {
    var z0 = LANE_Z0, z1 = LANE_Z1, hw = L.laneWidth / 2;
    var a = project(-hw, 0, z0, W, H);
    var b = project(hw, 0, z0, W, H);
    var c = project(hw, 0, z1, W, H);
    var d = project(-hw, 0, z1, W, H);
    return [a, b, c, d];
  }

  function fillQuad(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawPin(ctx, p, W, H) {
    var foot = project(p.x, 0, p.z, W, H);
    if (p.up) {
      var neck = project(p.x, 0.72, p.z, W, H);
      var head = project(p.x, 1.05, p.z, W, H);
      var rw = Math.max(2.2, p.r * foot.s * 1.15);
      var rh = Math.max(6, (foot.y - head.y));
      ctx.save();
      ctx.translate(foot.x, foot.y);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(0, 2, rw * 1.1, rw * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath();
      ctx.moveTo(-rw * 0.55, -rh * 0.08);
      ctx.quadraticCurveTo(-rw, -rh * 0.45, -rw * 0.42, -rh * 0.78);
      ctx.quadraticCurveTo(-rw * 0.22, -rh * 1.02, 0, -rh * 1.05);
      ctx.quadraticCurveTo(rw * 0.22, -rh * 1.02, rw * 0.42, -rh * 0.78);
      ctx.quadraticCurveTo(rw, -rh * 0.45, rw * 0.55, -rh * 0.08);
      ctx.quadraticCurveTo(rw * 0.7, rh * 0.02, 0, rh * 0.05);
      ctx.quadraticCurveTo(-rw * 0.7, rh * 0.02, -rw * 0.55, -rh * 0.08);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,28,22,.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#c43c32';
      ctx.fillRect(-rw * 0.38, -rh * 0.62, rw * 0.76, Math.max(2, rh * 0.1));
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.ellipse(-rw * 0.18, -rh * 0.82, rw * 0.16, rh * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      var along = Math.atan2(p.vz, p.vx || 0.01);
      var body = project(p.x, 0.12, p.z, W, H);
      var rw = Math.max(3, p.r * body.s * 3.2);
      ctx.save();
      ctx.translate(body.x, body.y);
      ctx.rotate(along * 0.25 + p.rot);
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath(); ctx.ellipse(2, 3, rw, rw * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8e2d6';
      ctx.beginPath(); ctx.ellipse(0, 0, rw, rw * 0.38, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c43c32';
      ctx.fillRect(-rw * 0.15, -rw * 0.28, rw * 0.3, rw * 0.56);
      ctx.restore();
    }
  }

  function drawBall(ctx, b, W, H) {
    var y = b.gutter ? -0.35 : L.ballRadius;
    var p = project(b.x, y, b.z, W, H);
    var r = Math.max(4, L.ballRadius * p.s);
    var g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r);
    g.addColorStop(0, '#f07058');
    g.addColorStop(0.45, '#c43828');
    g.addColorStop(1, '#6a1810');
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.ellipse(p.x - r * 0.28, p.y - r * 0.32, r * 0.22, r * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  Game.prototype.draw = function (ctx, W, H) {
    var i, z, hw = L.laneWidth / 2;
    ctx.fillStyle = '#121018';
    ctx.fillRect(0, 0, W, H);
    var sky = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    sky.addColorStop(0, '#1c1830');
    sky.addColorStop(1, '#0e0c14');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.55);

    var gL = project(-hw - 0.55, 0, LANE_Z0, W, H);
    var gR = project(hw + 0.55, 0, LANE_Z0, W, H);
    var gLf = project(-hw - 0.55, 0, LANE_Z1, W, H);
    var gRf = project(hw + 0.55, 0, LANE_Z1, W, H);
    ctx.fillStyle = '#2a2e38';
    ctx.beginPath();
    ctx.moveTo(gL.x, gL.y); ctx.lineTo(gLf.x, gLf.y); ctx.lineTo(gRf.x, gRf.y); ctx.lineTo(gR.x, gR.y);
    ctx.closePath(); ctx.fill();

    var q = laneQuad(ctx, W, H);
    var wood = ctx.createLinearGradient(q[0].x, 0, q[1].x, 0);
    wood.addColorStop(0, '#8a5a28');
    wood.addColorStop(0.5, '#c49a58');
    wood.addColorStop(1, '#8a5a28');
    fillQuad(ctx, q, wood);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(q[0].x, q[0].y); ctx.lineTo(q[1].x, q[1].y); ctx.lineTo(q[2].x, q[2].y); ctx.lineTo(q[3].x, q[3].y);
    ctx.closePath(); ctx.clip();
    ctx.strokeStyle = 'rgba(70,40,16,.18)';
    ctx.lineWidth = 1;
    for (i = -4; i <= 4; i++) {
      var a = project(i * 0.62, 0, LANE_Z0, W, H);
      var b = project(i * 0.62, 0, LANE_Z1, W, H);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(40, 24, 10, .55)';
    var arrows = [-1.2, -0.6, 0, 0.6, 1.2];
    for (i = 0; i < arrows.length; i++) {
      var az = -1.2;
      var ap = project(arrows[i], 0.01, az, W, H);
      var s = ap.s * 0.08;
      ctx.beginPath();
      ctx.moveTo(ap.x, ap.y - s * 3);
      ctx.lineTo(ap.x - s * 1.4, ap.y + s);
      ctx.lineTo(ap.x + s * 1.4, ap.y + s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    var pitA = project(-hw - 0.2, 0, LANE_Z1 - 0.05, W, H);
    var pitB = project(hw + 0.2, 0, LANE_Z1 - 0.05, W, H);
    var pitC = project(hw + 0.8, 0.4, LANE_Z1 + 2.4, W, H);
    var pitD = project(-hw - 0.8, 0.4, LANE_Z1 + 2.4, W, H);
    ctx.fillStyle = '#1a1210';
    ctx.beginPath();
    ctx.moveTo(pitA.x, pitA.y); ctx.lineTo(pitB.x, pitB.y); ctx.lineTo(pitC.x, pitC.y); ctx.lineTo(pitD.x, pitD.y);
    ctx.closePath(); ctx.fill();

    var order = [];
    for (i = 0; i < PIN_N; i++) order.push(this.pins[i]);
    order.sort(function (p, q) { return q.z - p.z; });
    for (i = 0; i < order.length; i++) {
      if (order[i].z > this.ball.z) drawPin(ctx, order[i], W, H);
    }
    drawBall(ctx, this.ball, W, H);
    for (i = 0; i < order.length; i++) {
      if (order[i].z <= this.ball.z) drawPin(ctx, order[i], W, H);
    }

    var near = project(0, 0, LANE_Z0, W, H);
    ctx.fillStyle = '#3a2414';
    ctx.fillRect(0, near.y, W, H - near.y + 2);
  };

  root.Bowl = { Score: Score, Game: Game, layout: L };
})(window);
