/*
 * Dante — GifOS shell.
 *
 * The vendored game starts itself. This file hangs the extra-devil net
 * on that loop, paints the roster, and keeps the LEVER button honest.
 * Invite is OS chrome — this file never draws an Invite button.
 */
(function (root) {
  'use strict';

  var scoreEl = document.getElementById('score');
  var scoreRows = document.getElementById('score-rows');
  var tally = document.getElementById('tally');
  var showBoard = false;

  function escape(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function paintRoster(list) {
    if (!list || list.length < 2) {
      scoreEl.hidden = true;
      tally.hidden = true;
      return;
    }
    tally.hidden = false;
    tally.textContent = list.length + ' in Hell';
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += '<tr class="' + (p.me ? 'me' : '') + '">' +
        '<td>' + escape(p.name) + (p.me ? ' (you)' : '') + '</td>' +
        '<td>' + (p.souls | 0) + ' / 13</td></tr>';
    }
    scoreRows.innerHTML = html;
    scoreEl.hidden = !showBoard;
  }

  function boot() {
    if (root.Touch) root.Touch.init();

    if (root.DanteEngine) {
      root.DanteEngine.drawGhosts = function (gl, shader) {
        if (root.Net) root.Net.drawGhosts(gl, shader);
        if (root.Net) root.Net.tick();
      };
    }

    if (tally) {
      tally.addEventListener('click', function () {
        showBoard = !showBoard;
        scoreEl.hidden = !showBoard || !scoreRows.innerHTML;
      });
    }

    var roomP = root.Net ? root.Net.init() : Promise.resolve({ others: 0 });
    roomP.then(function () {
      if (root.Net) {
        root.Net.onRoster(paintRoster);
        paintRoster(root.Net.roster());
        root.Net.publish(true);
      }
    }).catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
