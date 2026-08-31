/* Sample designs shipped with the app. Classic JSCAD v2 scripts. */
(function (root) {
  'use strict';

  var CUBE = [
    'const { cuboid, sphere } = require(\'@jscad/modeling\').primitives',
    'const { subtract } = require(\'@jscad/modeling\').booleans',
    'const { colorize } = require(\'@jscad/modeling\').colors',
    '',
    'const getParameterDefinitions = () => [',
    '  { name: \'size\', caption: \'Cube size\', type: \'number\', initial: 20, min: 8, max: 40, step: 1 },',
    '  { name: \'hole\', caption: \'Sphere radius\', type: \'number\', initial: 13, min: 4, max: 24, step: 0.5 }',
    ']',
    '',
    'const main = (p) => {',
    '  const box = cuboid({ size: [p.size, p.size, p.size] })',
    '  const ball = sphere({ radius: p.hole, segments: 32 })',
    '  return colorize([0.25, 0.72, 0.95], subtract(box, ball))',
    '}',
    '',
    'module.exports = { main, getParameterDefinitions }',
    ''
  ].join('\n');

  var GEAR = [
    'const { cylinder, polygon } = require(\'@jscad/modeling\').primitives',
    'const { union, subtract } = require(\'@jscad/modeling\').booleans',
    'const { extrudeLinear } = require(\'@jscad/modeling\').extrusions',
    'const { colorize } = require(\'@jscad/modeling\').colors',
    '',
    'const getParameterDefinitions = () => [',
    '  { name: \'teeth\', caption: \'Teeth\', type: \'int\', initial: 16, min: 8, max: 32 },',
    '  { name: \'thick\', caption: \'Thickness\', type: \'number\', initial: 6, min: 2, max: 16, step: 0.5 },',
    '  { name: \'bore\', caption: \'Bore radius\', type: \'number\', initial: 4, min: 1, max: 10, step: 0.5 }',
    ']',
    '',
    'const gearProfile = (teeth, pitchR) => {',
    '  const outer = pitchR + pitchR / teeth * 2.25',
    '  const inner = pitchR - pitchR / teeth * 1.55',
    '  const step = Math.PI * 2 / teeth',
    '  const pts = []',
    '  for (let i = 0; i < teeth; i++) {',
    '    const a = i * step',
    '    pts.push([inner * Math.cos(a - step * 0.32), inner * Math.sin(a - step * 0.32)])',
    '    pts.push([outer * Math.cos(a - step * 0.11), outer * Math.sin(a - step * 0.11)])',
    '    pts.push([outer * Math.cos(a + step * 0.11), outer * Math.sin(a + step * 0.11)])',
    '    pts.push([inner * Math.cos(a + step * 0.32), inner * Math.sin(a + step * 0.32)])',
    '  }',
    '  return polygon({ points: pts })',
    '}',
    '',
    'const main = (p) => {',
    '  const pitchR = 20',
    '  const body = extrudeLinear({ height: p.thick }, gearProfile(p.teeth, pitchR))',
    '  const hub = cylinder({ radius: p.bore + 3.2, height: p.thick + 2, center: [0, 0, (p.thick + 2) / 2] })',
    '  const hole = cylinder({ radius: p.bore, height: p.thick + 8, center: [0, 0, p.thick / 2] })',
    '  return colorize([0.95, 0.72, 0.18], subtract(union(body, hub), hole))',
    '}',
    '',
    'module.exports = { main, getParameterDefinitions }',
    ''
  ].join('\n');

  root.JscadSamples = { cube: CUBE, gear: GEAR };
})(typeof window !== 'undefined' ? window : this);
