/* Alley numbers and the throw from tincoats/bowling main.js
 * (f3ef2da813cac5874c85019f86243bcacbad2a46). Classic script. */
(function (root) {
  'use strict';
  root.BowlLayout = {
    laneWidth: 6,
    ballStart: { x: 0, z: -7 },
    ballRadius: 0.75,
    ballMass: 2,
    pinMass: 1,
    pinRadius: 0.22,
    restitution: 0.25,
    clampX: 2.5,
    moveScale: 0.02,
    minFlickY: 30,
    maxFlickMs: 1000,
    verticalBias: 1.5,
    impulseOf: function (dy) {
      return Math.min(40, 20 + (dy / 8));
    },
    pins: [
      { x: 0, z: 10 },
      { x: 0.5, z: 11 }, { x: -0.5, z: 11 },
      { x: 0, z: 12 }, { x: 1, z: 12 }, { x: -1, z: 12 },
      { x: -1.5, z: 13 }, { x: -0.5, z: 13 }, { x: 0.5, z: 13 }, { x: 1.5, z: 13 }
    ]
  };
})(window);
