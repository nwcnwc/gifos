/*
 * Radius Raid — the GifOS wrap around the original 13 KB game.
 *
 * Vendor files are unmodified. This file runs last, replaces $.init so prefs
 * can load from gifos.db, then hangs the twin-stick, the extra ships, and the
 * host-sim on the prototypes the original already has.
 */
(function (root) {
  'use strict';

  var origInit = $.init;
  var installed = false;

  function fit() {
    if (!$.wrap || !$.cw) return;
    $.wrap.style.marginLeft = '0px';
    $.wrap.style.marginTop = '0px';
    var pad = 20;
    var s = Math.min(
      window.innerWidth / ($.cw + pad),
      window.innerHeight / ($.ch + pad)
    );
    if (!isFinite(s) || s <= 0) s = 1;
    $.wrap.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }

  function mousescreen() {
    var rect = $.cmg.getBoundingClientRect();
    var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    $.mouse.sx = ($.mouse.ax - rect.left) * ($.cw / w);
    $.mouse.sy = ($.mouse.ay - rect.top) * ($.ch / h);
    $.mouse.x = $.mouse.sx - $.screen.x;
    $.mouse.y = $.mouse.sy - $.screen.y;
  }

  function wrapInput() {
    var origMove = $.mousemovecb;
    $.mousemovecb = function (e) {
      if (root.Touch && Touch.active() && $.state === 'play') {
        e.preventDefault();
        return;
      }
      $.mouse.ax = e.clientX;
      $.mouse.ay = e.clientY;
      mousescreen();
      if (e.cancelable) e.preventDefault();
    };
    var origDown = $.mousedowncb;
    $.mousedowncb = function (e) {
      if (root.Touch && Touch.active() && $.state === 'play') {
        e.preventDefault();
        return;
      }
      origDown(e);
    };
    var origUp = $.mouseupcb;
    $.mouseupcb = function (e) {
      if (root.Touch && Touch.active() && $.state === 'play') {
        e.preventDefault();
        return;
      }
      origUp(e);
    };
    $.mousescreen = mousescreen;
    var origResize = $.resizecb;
    $.resizecb = function () {
      origResize();
      fit();
      mousescreen();
    };
    var origBlur = $.blurcb;
    $.blurcb = function () {
      if (root.Touch && Touch.active()) return;
      origBlur();
    };

    // Menu taps: map a finger onto the same mouse the original buttons already
    // read. During play the sticks own the pointers.
    function menuTouch(e, down) {
      if (root.Touch && Touch.active() && $.state === 'play') return;
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      $.mouse.ax = t.clientX;
      $.mouse.ay = t.clientY;
      mousescreen();
      $.mouse.down = down ? 1 : 0;
      if (e.cancelable) e.preventDefault();
    }
    window.addEventListener('touchstart', function (e) { menuTouch(e, 1); }, { passive: false });
    window.addEventListener('touchmove', function (e) { menuTouch(e, 1); }, { passive: false });
    window.addEventListener('touchend', function (e) { menuTouch(e, 0); }, { passive: false });
  }

  function wrapHero() {
    var orig = $.Hero.prototype.update;
    $.Hero.prototype.update = function () {
      var stickOn = root.Touch && Touch.active() && this.life > 0;
      var m = stickOn ? Touch.move() : { x: 0, y: 0 };
      var using = stickOn && (m.x || m.y);
      var saved = {
        up: $.keys.state.up, down: $.keys.state.down,
        left: $.keys.state.left, right: $.keys.state.right
      };
      if (using) {
        $.keys.state.up = $.keys.state.down = $.keys.state.left = $.keys.state.right = 0;
      }
      if (stickOn) {
        var a = Touch.aim();
        if (a.on) {
          $.mouse.x = this.x + a.x * 420;
          $.mouse.y = this.y + a.y * 420;
          $.mouse.down = 1;
        } else {
          $.mouse.x = this.x + Math.cos(this.direction) * 420;
          $.mouse.y = this.y + Math.sin(this.direction) * 420;
          if (!$.autofire) $.mouse.down = 0;
        }
      }
      var vx0 = this.vx, vy0 = this.vy, x0 = this.x, y0 = this.y;
      orig.call(this);
      if (using && this.life > 0) {
        var nvx = vx0 + m.x * this.accel * $.dt;
        var nvy = vy0 + m.y * this.accel * $.dt;
        if (nvx > this.vmax) nvx = this.vmax;
        if (nvx < -this.vmax) nvx = -this.vmax;
        if (nvy > this.vmax) nvy = this.vmax;
        if (nvy < -this.vmax) nvy = -this.vmax;
        this.vx = nvx * 0.9;
        this.vy = nvy * 0.9;
        this.x = x0 + this.vx * $.dt;
        this.y = y0 + this.vy * $.dt;
        if (this.x >= $.ww - this.radius) this.x = $.ww - this.radius;
        if (this.x <= this.radius) this.x = this.radius;
        if (this.y >= $.wh - this.radius) this.y = $.wh - this.radius;
        if (this.y <= this.radius) this.y = this.radius;
      }
      $.keys.state.up = saved.up;
      $.keys.state.down = saved.down;
      $.keys.state.left = saved.left;
      $.keys.state.right = saved.right;
    };
  }

  function wrapEnemies() {
    var origSpawn = $.spawnEnemies;
    $.spawnEnemies = function () {
      if (root.Net && Net.isGuest()) return;
      origSpawn();
    };
    var origUpdate = $.Enemy.prototype.update;
    $.Enemy.prototype.update = function (i) {
      if (root.Net && Net.isGuest()) {
        if (this._tx != null) {
          this.x += (this._tx - this.x) * 0.4;
          this.y += (this._ty - this.y) * 0.4;
        }
        if ($.util.arcInRect(this.x, this.y, this.radius, -$.screen.x, -$.screen.y, $.cw, $.ch)) this.inView = 1;
        else this.inView = 0;
        return;
      }
      var hx, hy, hl, t;
      if (root.Net && Net.inRoom() && Net.isSimHost()) {
        t = Net.homingTarget(this.x, this.y, $.hero);
        hx = $.hero.x; hy = $.hero.y; hl = $.hero.life;
        $.hero.x = t.x; $.hero.y = t.y; $.hero.life = t.life;
      }
      origUpdate.call(this, i);
      if (t) { $.hero.x = hx; $.hero.y = hy; $.hero.life = hl; }
    };
    var origDmg = $.Enemy.prototype.receiveDamage;
    $.Enemy.prototype.receiveDamage = function (i, val) {
      if (root.Net && Net.isGuest()) {
        Net.claimHit(this.index, val);
        this.hitFlag = 10;
        if (this.inView) $.audio.play('hit');
        return;
      }
      origDmg.call(this, i, val);
    };
  }

  function wrapPowerups() {
    var orig = $.Powerup.prototype.update;
    $.Powerup.prototype.update = function (i) {
      if (root.Net && Net.isGuest()) {
        if (this._taken) return;
        if ($.hero.life > 0 && $.util.arcIntersectingRect($.hero.x, $.hero.y, $.hero.radius + 2, this.x, this.y, this.width, this.height)) {
          this._taken = 1;
          $.audio.play('powerup');
          $.powerupTimers[this.type] = 300;
          $.powerupsCollected++;
          Net.claimGrab(this.x, this.y);
        }
        return;
      }
      orig.call(this, i);
    };
    var origRender = $.Powerup.prototype.render;
    $.Powerup.prototype.render = function (i) {
      if (this._taken) return;
      origRender.call(this, i);
    };
  }

  function drawShip(x, y, dir, fill) {
    var r = 10;
    $.ctxmg.save();
    $.ctxmg.translate(x, y);
    $.ctxmg.rotate(dir - $.pi / 4);
    $.ctxmg.fillStyle = fill;
    $.ctxmg.fillRect(0, 0, r, r);
    $.ctxmg.restore();
    $.ctxmg.save();
    $.ctxmg.translate(x, y);
    $.ctxmg.rotate(dir - $.pi / 4 + $.twopi / 3);
    $.ctxmg.fillStyle = fill;
    $.ctxmg.fillRect(0, 0, r, r);
    $.ctxmg.restore();
    $.ctxmg.save();
    $.ctxmg.translate(x, y);
    $.ctxmg.rotate(dir - $.pi / 4 - $.twopi / 3);
    $.ctxmg.fillStyle = fill;
    $.ctxmg.fillRect(0, 0, r, r);
    $.ctxmg.restore();
    $.util.fillCircle($.ctxmg, x, y, r - 3, fill);
  }

  function drawOthers() {
    if (!root.Net || !$.hero) return;
    var others = Net.others();
    var any = false;
    for (var id in others) { any = true; break; }
    if (!any) return;
    $.ctxmg.save();
    $.ctxmg.translate($.screen.x - $.rumble.x, $.screen.y - $.rumble.y);
    for (var k in others) {
      var o = others[k];
      if (!o.playing || o.life <= 0) continue;
      var p = Net.poseOf(o);
      if (!p) continue;
      var fill = o.fire ? 'hsla(' + $.util.rand(0, 359) + ', 100%, ' + $.util.rand(20, 80) + '%, 1)' : o.fill;
      drawShip(p.x, p.y, p.dir, fill);
      if (o.name) {
        $.ctxmg.beginPath();
        $.text({
          ctx: $.ctxmg, x: p.x, y: p.y - 18,
          text: String(o.name).slice(0, 12).toUpperCase(),
          hspacing: 1, vspacing: 1, halign: 'center', valign: 'bottom',
          scale: 1, snap: 1, render: 1
        });
        $.ctxmg.fillStyle = o.fill;
        $.ctxmg.fill();
      }
    }
    $.ctxmg.restore();
  }

  function wrapMinimap() {
    var orig = $.renderMinimap;
    $.renderMinimap = function () {
      orig();
      if (!root.Net) return;
      var others = Net.others();
      for (var id in others) {
        var o = others[id];
        if (!o.playing || o.life <= 0) continue;
        var p = Net.poseOf(o);
        if (!p) continue;
        $.ctxmg.fillStyle = o.fill;
        $.ctxmg.fillRect(
          $.minimap.x + Math.floor(p.x * $.minimap.scale),
          $.minimap.y + Math.floor(p.y * $.minimap.scale),
          2, 2
        );
      }
    };
  }

  function respawn() {
    if (!$.hero) return;
    $.hero.x = $.ww / 2;
    $.hero.y = $.wh / 2;
    $.hero.vx = 0;
    $.hero.vy = 0;
    $.hero.life = 1;
    $.hero.takingDamage = 0;
    $.gameoverTick = 0;
    $.gameoverExplosion = 0;
    $.buttons.length = 0;
    $.state = 'play';
    $.lt = Date.now();
    $.mouse.down = 0;
  }

  function wrapSetState() {
    var orig = $.setState;
    $.setState = function (state) {
      if (state === 'gameover' && root.Net && Net.inRoom() && Net.anyoneElsePlaying()) {
        respawn();
        return;
      }
      if (state === 'credits') {
        orig(state);
        var i = $.buttons.length;
        while (i--) {
          if ($.buttons[i].title === 'JS13KGAMES') {
            $.buttons[i].action = function () { $.mouse.down = 0; };
          }
        }
        return;
      }
      orig(state);
      // Pause is still the same round — keep publishing pose so a paused
      // ship does not vanish. Only the menu (and solo game-over) leaves the arena.
      var inArena = state === 'play' || state === 'pause';
      if (root.Touch) Touch.setPlay(state === 'play');
      if (root.Net) Net.setPlaying(inArena);
    };
  }

  function wrapPlay() {
    var origPlay = $.states.play;
    $.states.play = function () {
      if (root.Net && Net.isGuest()) Net.applySnapshot();
      origPlay();
      if (root.Net) Net.tick();
      drawOthers();
    };
    var origMenu = $.states.menu;
    $.states.menu = function () {
      origMenu();
      if (root.Net) Net.tick();
    };
    var origPause = $.states.pause;
    $.states.pause = function () {
      origPause();
      if (root.Net) Net.tick();
    };
  }

  function wrapStorage() {
    var orig = $.updateStorage;
    $.updateStorage = function () {
      orig();
      if (root.Boot && Boot.persist) Boot.persist();
    };
  }

  function install() {
    if (installed) return;
    installed = true;
    wrapHero();
    wrapEnemies();
    wrapPowerups();
    wrapMinimap();
    wrapPlay();
    wrapStorage();
    fit();
    if (root.Touch) Touch.init();
    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if ($.state === 'play') { $.setState('pause'); return; }
        if ($.state === 'pause' || $.state === 'stats' || $.state === 'credits' || $.state === 'gameover') {
          $.setState('menu');
        }
      });
    }
  }

  function withTimeout(p, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () { if (!done) { done = true; resolve(); } };
      setTimeout(finish, ms);
      p.then(finish, finish);
    });
  }

  $.init = function () {
    wrapInput();
    wrapSetState();
    var go = function () {
      origInit();
      install();
    };
    var jobs = [];
    if (root.Boot && Boot.load) jobs.push(withTimeout(Boot.load(), 1500));
    if (root.Net && Net.init) jobs.push(withTimeout(Net.init(), 2500));
    if (!jobs.length) go();
    else Promise.all(jobs).then(go, go);
  };
})(window);
