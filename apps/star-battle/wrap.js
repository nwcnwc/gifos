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
      origPC.call(this, el, callback);
      if (isGuest() && el && !el.run && el._eid != null && root.Net) {
        Net.claim(el._eid);
      }
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

    var origSetup = Play.prototype.setup;
    Play.prototype.setup = function () {
      nextEid = 1;
      origSetup.call(this);
      if (root.Boot && Boot.prefs.mute) this.mute();
      if (root.Net) {
        Net.setPlaying(true);
        if (isGuest()) Net.importWorld(this);
      }
    };

    var origUn = Play.prototype.uninstall;
    Play.prototype.uninstall = function () {
      origUn.call(this);
      if (root.Net) Net.setPlaying(false);
    };

    var origEvent = Play.prototype.event;
    Play.prototype.event = function () {
      origEvent.call(this);
      hotkey.reg('TAB', function () {
        if (root.Boot) Boot.showBoard(!Boot.showingBoard());
      }, true);
    };

    var origUpdate = Play.prototype.update;
    Play.prototype.update = function () {
      if (isGuest()) Net.importWorld(this);
      origUpdate.call(this);
      if (root.Net && Net.live()) {
        Net.tick();
        Net.drawShips(this.ctx, this);
        if (root.Boot && Boot.paintRoster) Boot.paintRoster(Net.roster());
      }
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
