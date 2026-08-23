/*
 * Tower Defense — thumb picker.
 *
 * The original palette is a 3×3 of 32 px cells on the canvas, which shrinks
 * to a fingernail on a phone. These buttons call the same preBuild / upgrade
 * / sell / pause the canvas panel does, so the vendored game never learns it
 * is being flown by a thumb.
 *
 * Canvas taps already land through td.js (touchstart → click). This file is
 * the HTML strip.
 */
(function (root) {
  'use strict';

  function game() { return root._TD && root._TD.game; }

  function sceneOf() {
    var TD = game();
    return TD && TD.stage && TD.stage.current_act && TD.stage.current_act.current_scene;
  }

  function pick(type) {
    var sc = sceneOf();
    if (!sc || !sc.map || !sc.map.preBuild) return;
    var btns = document.querySelectorAll('#picker .pick');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-type') === type);
    }
    sc.map.preBuild(type);
  }

  function pause() {
    var sc = sceneOf();
    var TD = game();
    if (!sc || !sc.panel || !sc.panel.btn_pause) return;
    sc.panel.btn_pause.onClick();
    var btn = document.getElementById('pauseBtn');
    if (btn) btn.textContent = (TD && sc.state === 2) ? 'Continue' : 'Pause';
  }

  function upgrade() {
    var sc = sceneOf();
    if (!sc || !sc.map || !sc.map.selected_building) return;
    sc.map.selected_building.tryToUpgrade(sc.panel && sc.panel.btn_upgrade);
  }

  function sell() {
    var sc = sceneOf();
    if (!sc || !sc.map || !sc.map.selected_building) return;
    sc.map.selected_building.tryToSell();
  }

  function init() {
    var wrap = document.getElementById('picker');
    if (!wrap) return;
    wrap.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.classList.contains('pick')) {
        e.preventDefault();
        pick(t.getAttribute('data-type'));
      }
    });
    var up = document.getElementById('upBtn');
    var sl = document.getElementById('sellBtn');
    var ps = document.getElementById('pauseBtn');
    if (up) up.addEventListener('click', function (e) { e.preventDefault(); upgrade(); });
    if (sl) sl.addEventListener('click', function (e) { e.preventDefault(); sell(); });
    if (ps) ps.addEventListener('click', function (e) { e.preventDefault(); pause(); });
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  root.Touch = { init: init, pick: pick };
})(window);
