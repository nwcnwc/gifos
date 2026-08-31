/*
 * Matter Sandbox — GifOS shell.
 *
 * Loads the last scene from gifos.db, mounts the playground, and wires
 * the shared room. Invite is OS chrome — this file never draws that button.
 */
(function (root) {
  'use strict';

  var saveDb = null;
  var saveTimer = 0;
  var ui = null;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function persist() {
    if (!saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = 0;
      var scene = root.MSPhysics.exportScene();
      saveDb.put({ id: 'scene', scene: scene, grav: root.MSPhysics.gravity() }).catch(function () {});
      root.MSPhysics.markClean();
    }, 800);
  }

  function paintRoster(list) {
    var bar = $('friend-bar');
    var scores = $('friend-scores');
    var status = $('friend-status');
    var live = !!(root.MSNet && root.MSNet.live());
    document.body.classList.toggle('friend', live);
    if (!live) {
      if (bar) bar.hidden = true;
      return;
    }
    if (bar) bar.hidden = false;
    var n = (list && list.length) || 1;
    if (status) {
      status.textContent = n < 2
        ? 'Waiting for a friend. Send the Invite in the bar above.'
        : n + ' in the room — same pile, everyone drops and grabs.';
    }
    if (!scores) return;
    var html = '';
    (list || []).forEach(function (p) {
      html += '<li class="' + (p.me ? 'me' : '') + '"><span class="name">' +
        (p.me ? 'You' : esc(p.name || 'Friend')) + '</span></li>';
    });
    scores.innerHTML = html;
  }

  function loadSave() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve(null);
    saveDb = root.gifos.db('save');
    return saveDb.get('scene').then(function (row) {
      if (row && row.scene && row.scene.b && row.scene.b.length) return row.scene;
      return null;
    }).catch(function () { return null; });
  }

  function boot(scene, owner) {
    var canvas = $('world');
    ui = root.MSApp.mount(canvas, {
      owner: owner !== false,
      scene: scene,
      onAction: function (a) {
        persist();
        if (root.MSNet) root.MSNet.onAction(a);
      },
      onTick: function () {
        if (root.MSNet) root.MSNet.tick();
        if (root.MSPhysics.isDirty()) persist();
      }
    });
    root.MSUI = ui;

    var share = $('shareBtn');
    if (share) {
      share.addEventListener('click', function (e) {
        e.preventDefault();
        $('friend-bar').hidden = false;
        document.body.classList.add('friend');
      });
    }
    var leave = $('leaveBtn');
    if (leave) {
      leave.addEventListener('click', function (e) {
        e.preventDefault();
        $('friend-bar').hidden = true;
        document.body.classList.remove('friend');
      });
    }

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (ui.paused()) { ui.setPaused(false); return true; }
        if (ui.tool() !== 'grab') { ui.setTool('grab'); return true; }
        if (!$('friend-bar').hidden && !(root.MSNet && root.MSNet.live())) {
          $('friend-bar').hidden = true;
          document.body.classList.remove('friend');
          return true;
        }
        return false;
      });
    }

    var roomP = root.MSNet ? root.MSNet.init() : Promise.resolve({ owner: true, others: 0 });
    roomP.then(function (room) {
      room = room || { owner: true, others: 0 };
      ui.setOwner(!!room.owner);
      if (root.MSNet) {
        root.MSNet.onRoster(paintRoster);
        paintRoster(root.MSNet.roster());
      }
    }).catch(function () {});
  }

  function start() {
    var sceneP = loadSave();
    var infoP = (root.gifos && root.gifos.info)
      ? root.gifos.info().catch(function () { return { owner: true }; })
      : Promise.resolve({ owner: true });
    Promise.all([sceneP, infoP]).then(function (pair) {
      boot(pair[0], !!(pair[1] && pair[1].owner !== false));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
