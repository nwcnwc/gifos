/*
 * Hextris — GifOS shell.
 *
 * Starts the vendored game after hydrating high scores from gifos.db,
 * wires the same-seed race, and paints the friend strip. Invite is OS
 * chrome — this file never draws an Invite button.
 */
(function (root) {
  'use strict';

  var HT = root.HT = root.HT || {};
  HT.mem = { saveState: '{}', highscores: '[]' };
  HT.best = [0, 0, 0];
  HT.rng = null;

  HT.phoneish = function () {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 520;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  };

  HT.rand = function () {
    return HT.rng ? HT.rng() : Math.random();
  };

  HT.lsGet = function (k) {
    return Object.prototype.hasOwnProperty.call(HT.mem, k) ? HT.mem[k] : null;
  };
  HT.lsSet = function (k, v) {
    HT.mem[k] = v == null ? '' : String(v);
    if (k === 'highscores') persistBest();
  };

  function persistBest() {
    var arr = [];
    try { arr = JSON.parse(HT.mem.highscores || '[]'); } catch (e) { arr = []; }
    HT.best = [arr[0] | 0, arr[1] | 0, arr[2] | 0];
    if (!root.gifos || !root.gifos.db) return;
    root.gifos.db('save').put({
      id: 'best',
      scores: HT.best
    }).catch(function () {});
  }

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('save').get('best').then(function (row) {
      if (row && row.scores && row.scores.length) {
        HT.best = [row.scores[0] | 0, row.scores[1] | 0, row.scores[2] | 0];
        HT.mem.highscores = JSON.stringify(HT.best);
      }
    }).catch(function () {});
  }

  function packStacks() {
    if (!root.MainHex || !MainHex.blocks) return '';
    var out = [];
    for (var i = 0; i < 6; i++) {
      var lane = MainHex.blocks[i] || [];
      var s = '';
      for (var j = 0; j < lane.length; j++) {
        var c = lane[j] && lane[j].color;
        var idx = (root.colors || []).indexOf(c);
        s += idx < 0 ? '0' : String(idx);
      }
      out.push(s);
    }
    return out.join(',');
  }

  HT.packStacks = packStacks;
  HT.over = function () { return root.gameState === 2; };
  HT.playing = function () { return root.gameState === 1; };

  function wrapHooks() {
    var origConsolidate = root.consolidateBlocks;
    root.consolidateBlocks = function () {
      origConsolidate.apply(this, arguments);
      if (HT.Mp) HT.Mp.onActuate();
    };
    var origCheck = root.checkGameOver;
    root.checkGameOver = function () {
      var died = origCheck.apply(this, arguments);
      if (died && HT.Mp) HT.Mp.onActuate();
      return died;
    };
    var origWrite = root.writeHighScores;
    root.writeHighScores = function () {
      origWrite.apply(this, arguments);
      persistBest();
    };
  }

  function onBack() {
    if ($('#helpScreen').is(':visible')) {
      showHelp();
      return true;
    }
    if (root.gameState === -1) {
      pause();
      return true;
    }
    return false;
  }

  function boot() {
    wrapHooks();
    initialize();
    if (root.Touch) root.Touch.init();
    if (root.gifos && root.gifos.onBack) root.gifos.onBack(onBack);
    setInterval(function () {
      var play = root.gameState === 1 || root.gameState === -1;
      document.body.classList.toggle('playing', !!play);
    }, 200);

    var friend = document.getElementById('friendBtn');
    if (friend) friend.addEventListener('click', function (e) {
      e.preventDefault();
      if (HT.Mp) HT.Mp.enter();
    });
    var leave = document.getElementById('leaveBtn');
    if (leave) leave.addEventListener('click', function (e) {
      e.preventDefault();
      if (HT.Mp) HT.Mp.leave();
    });
    var again = document.getElementById('againBtn');
    if (again) again.addEventListener('click', function (e) {
      e.preventDefault();
      if (HT.Mp) HT.Mp.playAgain();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      loadPrefs().then(boot);
    });
  } else {
    loadPrefs().then(boot);
  }
})(window);
