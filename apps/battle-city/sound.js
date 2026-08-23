/* SFX from feichao93/battle-city. Hidden <audio> tags in index.html are
   rewritten to data: URLs by the GifOS runtime, so we play those. */
(function (root) {
  'use strict';
  var els = {};
  var muted = false;
  function load() {
    var nodes = document.querySelectorAll('#sfx audio[data-name]');
    for (var i = 0; i < nodes.length; i++) els[nodes[i].getAttribute('data-name')] = nodes[i];
  }
  function play(name) {
    if (muted) return;
    var src = els[name];
    if (!src) return;
    try {
      var a = src.cloneNode(true);
      a.volume = name === 'stage_start' ? 0.85 : 0.7;
      var p = a.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  root.BCSound = { load: load, play: play, mute: function (v) { muted = !!v; } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
