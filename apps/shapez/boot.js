/*
 * shapez.io — GifOS shell.
 *
 * Wires the factory to gifos.db so the file is the save, and to invite
 * co-op. Invite is OS chrome — this file never draws that button.
 */
(function (root) {
  'use strict';

  var g;

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve(null);
    return root.gifos.db('prefs').get('prefs').catch(function () { return null; });
  }

  function savePrefs() {
    if (!root.gifos || !root.gifos.db || !g) return;
    root.gifos.db('prefs').put({
      id: 'prefs',
      camX: g.camX,
      camY: g.camY,
      zoom: g.zoom,
      rate: g.rate,
      tool: g.tool,
      rot: g.rot
    }).catch(function () {});
  }

  var camTimer = 0;
  function onCam() {
    clearTimeout(camTimer);
    camTimer = setTimeout(savePrefs, 400);
  }

  function boot(prefs) {
    g = new root.SZGame();
    g.init(root.SZ, null);
    if (prefs) {
      if (prefs.camX != null) g.camX = prefs.camX;
      if (prefs.camY != null) g.camY = prefs.camY;
      if (prefs.zoom) g.zoom = prefs.zoom;
      if (prefs.rate) g.rate = prefs.rate;
      if (prefs.rot != null) g.rot = prefs.rot & 3;
    }

    var meId = 'local';
    var netP = root.SZNet ? root.SZNet.init(g) : Promise.resolve({ owner: true, others: 0 });
    netP.then(function (room) {
      room = room || { owner: true, others: 0 };
      g.drive = !root.SZNet || !root.SZNet.live() || !!root.SZNet.simHost();
      if (root.SZNet && root.SZNet.me()) meId = root.SZNet.me().id || 'local';
      root.SZUI.setMe(meId);
      root.SZUI.init(g, {
        meId: meId,
        onPlace: function (x, y, k, r) {
          if (root.SZNet) root.SZNet.putCell(x, y, k, r);
          savePrefs();
        },
        onErase: function (x, y) {
          if (root.SZNet) root.SZNet.delCell(x, y);
        },
        onRotate: function (x, y, r) {
          var c = g.cell(x, y);
          if (c && root.SZNet) root.SZNet.putCell(x, y, c.k, r);
        },
        onCam: onCam
      });
      if (prefs && prefs.tool) root.SZUI.setTool(prefs.tool);
      if (root.gifos && root.gifos.onBack) {
        root.gifos.onBack(function () {
          return root.SZUI.back();
        });
      }
      if (room.others > 0 || (root.SZNet && root.SZNet.live() && !room.owner)) {
        g.toast('A friend is on this factory — you both build on the same belts.');
      }
    }).catch(function () {
      root.SZUI.init(g, { meId: 'local', onCam: onCam });
    });
  }

  function start() {
    loadPrefs().then(boot);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
