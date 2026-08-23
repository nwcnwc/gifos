/*
 * Star Battle — the GifOS wrap around the original classes.
 *
 * Vendor files are unmodified. This file runs last, hangs extra-ship
 * simulation, hit claims, and the host-sim on the prototypes the original
 * already has, then starts the Game.
 */
(function (root) {
  'use strict';

  var nextEid = 1;
  var installed = false;

  function isGuest() {
    return !!(root.Net && Net.live() && !Net.owner());
  }

  function install() {
    if (installed) return;
    installed = true;

    var origFactory = Play.prototype.factory;
    Play.prototype.factory = function (elem) {
      var o = origFactory.call(this, elem);
      if (o && o._eid == null) o._eid = nextEid++;
      return o;
    };

    var origAppend = Play.prototype.appendElement;
    Play.prototype.appendElement = function () {
      if (isGuest()) {
        if (this.stars) this.append(this.stars);
        return;
      }
      origAppend.call(this);
    };

    function wrapRemoteUpdate(Ctor, orig) {
      Ctor.prototype.update = function () {
        if (this._remote) {
          if (this._tx != null) this.x += (this._tx - this.x) * 0.4;
          if (this._ty != null) this.y += (this._ty - this.y) * 0.4;
          if (this.run) this.draw();
          else if (this._deathing) this._deathing();
          return;
        }
        orig.call(this);
      };
    }
    wrapRemoteUpdate(Enemy, Enemy.prototype.update);
    wrapRemoteUpdate(Meteorite, Meteorite.prototype.update);
    wrapRemoteUpdate(Friend, Friend.prototype.update);
    wrapRemoteUpdate(Fuel, Fuel.prototype.update);
    wrapRemoteUpdate(Star, Star.prototype.update);
    wrapRemoteUpdate(Bullet, Bullet.prototype.update);

    var origBC = Play.prototype.bulletCollision;
    Play.prototype.bulletCollision = function (bullet, arr, callback) {
      if (!isGuest()) return origBC.call(this, bullet, arr, callback);
      var self = this;
      arr.forEach(function (el) {
        self.collision(bullet, el, function (a, b) {
          a.reduceLife();
          var lethal = (b.life || 1) <= 1;
          if (root.Net && b._eid != null) Net.claim(b._eid);
          if (lethal) callback(b);
        });
      });
    };

    var origPC = Play.prototype.playerCollision;
    Play.prototype.playerCollision = function (el, callback) {
      if (isGuest() && el && el._remote) {
        var self = this;
        this.collision(this.player, el, function () {
          if (el._hitMe) return;
          el._hitMe = true;
          if (root.Net && el._eid != null) Net.claim(el._eid);
          callback(el);
        });
        return;
      }
      origPC.call(this, el, callback);
    };

    var origInitPlayer = Play.prototype.initPlayer;
    Play.prototype.initPlayer = function () {
      origInitPlayer.call(this);
      if (root.Net && Net.me && Net.me() && Net.me().id && this.player) {
        var id = Net.me().id;
        var h = 0;
        for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
        var gh = (typeof config !== 'undefined' && config.game && config.game.h) || 480;
        var ph = this.player.h || 70;
        this.player.y = 30 + (h % Math.max(1, gh - ph - 60));
      }
    };

    var origToggle = Game.prototype.toggleScene;
    Game.prototype.toggleScene = function (scene) {
      origToggle.call(this, scene);
      if (root.Boot && Boot.onScene) Boot.onScene(scene);
    };

    var origSetup = Play.prototype.setup;
    Play.prototype.setup = function () {
      nextEid = 1;
      origSetup.call(this);
      if (root.Boot && Boot.showOut) Boot.showOut(false);
      if (root.Boot && Boot.prefs.mute) this.mute();
      if (root.Net) {
        Net.setPlaying(true);
        if (isGuest()) Net.importWorld(this);
      }
      if (root.Boot && Boot.fit) Boot.fit();
      if (root.Boot && Boot.portrait && Boot.portrait() && root.Touch && Touch.reveal) Touch.reveal();
    };

    var origUn = Play.prototype.uninstall;
    Play.prototype.uninstall = function () {
      origUn.call(this);
      if (root.Net) Net.setPlaying(false);
      if (root.Boot && Boot.fit) Boot.fit();
    };

    var origEvent = Play.prototype.event;
    Play.prototype.event = function () {
      origEvent.call(this);
      hotkey.reg('TAB', function () {
        if (root.Boot) Boot.showBoard(!Boot.showingBoard());
      }, true);
    };

    var origOver = Game.prototype.over;
    Game.prototype.over = function () {
      if (root.Net && Net.live() && Net.owner() && this.scene === this.scenes.play) {
        var n = Net.othersPlaying ? Net.othersPlaying() : 0;
        if (n > 0) {
          this.data.end = true;
          if (this.scenes.play.player) this.scenes.play.player.run = false;
          if (root.Boot && Boot.showOut) Boot.showOut(true);
          if (root.Net) Net.setPlaying(true);
          return;
        }
      }
      origOver.call(this);
    };

    var origUF = Play.prototype.updateFuel;
    Play.prototype.updateFuel = function (num) {
      if (this.game.data.end && root.Net && Net.owner && Net.owner() && Net.othersPlaying && Net.othersPlaying() > 0) {
        this.game.data.fuel = 0;
        var fuelEl = document.getElementById('fuel');
        if (fuelEl) fuelEl.innerHTML = (typeof numberFormat === 'function') ? numberFormat(0) : '00';
        return;
      }
      origUF.call(this, num);
    };

    var origUpdate = Play.prototype.update;
    Play.prototype.update = function () {
      if (isGuest()) Net.importWorld(this);
      origUpdate.call(this);
      if (root.Net && Net.live()) {
        Net.tick();
        Net.drawShips(this.ctx, this);
        if (root.Boot && Boot.paintRoster) Boot.paintRoster(Net.roster());
        if (root.Boot && Boot.showWait) {
          Boot.showWait(isGuest() && !Net.hasWorld());
        }
      }
      if (root.Boot && Boot.paintHud) Boot.paintHud();
    };

    var origMute = Play.prototype.mute;
    Play.prototype.mute = function () {
      origMute.call(this);
      if (root.Boot && Boot.prefs) {
        Boot.prefs.mute = true;
        Boot.persist();
      }
    };
    var origSpeak = Play.prototype.speak;
    Play.prototype.speak = function () {
      origSpeak.call(this);
      if (root.Boot && Boot.prefs) {
        Boot.prefs.mute = false;
        Boot.persist();
      }
    };
  }

  install();
  if (root.Boot && Boot.start) Boot.start();
})(window);
