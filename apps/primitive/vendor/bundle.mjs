// One-shot: stitch vendor/src/*.js (ESM) into a classic IIFE.
// Run: node apps/primitive/vendor/bundle.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const src = (name) => readFileSync(join(dir, 'src', name), 'utf8');

function strip(code) {
  return code
    .replace(/^import\s+.*\n/gm, '')
    .replace(/^export default class /gm, 'class ')
    .replace(/^export class /gm, 'class ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export const /gm, 'const ')
    .replace(/[ \t]*if \(-differenceChange > currentDifference\) debugger;\n/, '')
    .replace(/^[ \t]*console\.log\(.*\);\n/gm, '');
}

const util = strip(src('util.js'));
const canvas = strip(src('canvas.js'));
const state = strip(src('state.js'));
const shape = strip(src('shape.js'));
const step = strip(src('step.js'));
const optimizer = strip(src('optimizer.js'));

const out = `/* primitive.js engine — classic IIFE of ondras/primitive.js js/src
 * pin 20bad107bc7ccf002b14fbec77959d2cbea9c630 (MIT)
 * UI (app.js/ui.js) and unused workers are not included.
 * GifOS patches: Canvas.fromImage, Optimizer.stop/onDone, no debugger.
 */
(function (root) {
'use strict';
${util}
var util = {
  SVGNS: SVGNS,
  clamp: clamp,
  clampColor: clampColor,
  distanceToDifference: distanceToDifference,
  differenceToDistance: differenceToDistance,
  difference: difference,
  computeColorAndDifferenceChange: computeColorAndDifferenceChange
};
${canvas}
Canvas.fromImage = function (img, cfg) {
  var w = img.naturalWidth || img.width;
  var h = img.naturalHeight || img.height;
  var computeScale = getScale(w, h, cfg.computeSize);
  cfg.width = w / computeScale;
  cfg.height = h / computeScale;
  var viewScale = getScale(w, h, cfg.viewSize);
  cfg.scale = computeScale / viewScale;
  var canvas = this.empty(cfg);
  canvas.ctx.drawImage(img, 0, 0, cfg.width, cfg.height);
  if (cfg.fill == "auto") { cfg.fill = getFill(canvas); }
  return canvas;
};
${state}
${shape}
${step}
${optimizer}
Optimizer.prototype.stop = function () {
  this._stopped = true;
};
Optimizer.prototype._continue = function () {
  if (this._stopped) {
    if (typeof this.onDone === 'function') {
      this.onDone({ stopped: true, steps: this._steps, distance: this.state.distance });
    }
    return;
  }
  if (this._steps < this.cfg.steps) {
    var self = this;
    setTimeout(function () { self._addShape(); }, 10);
  } else if (typeof this.onDone === 'function') {
    this.onDone({ stopped: false, steps: this._steps, distance: this.state.distance });
  }
};

root.Primitive = {
  Canvas: Canvas,
  Optimizer: Optimizer,
  Shape: Shape,
  Triangle: Triangle,
  Rectangle: Rectangle,
  Ellipse: Ellipse,
  Smiley: Smiley,
  Step: Step,
  State: State,
  clamp: clamp,
  clampColor: clampColor,
  differenceToDistance: differenceToDistance,
  distanceToDifference: distanceToDifference,
  SVGNS: SVGNS
};
})(typeof window !== 'undefined' ? window : this);
`;

writeFileSync(join(dir, 'primitive.js'), out);
console.log('wrote vendor/primitive.js', out.length, 'chars');
