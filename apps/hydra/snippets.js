/* Named hydra patches. The dialect is Olivia Jack's; these are the
 * getting-started shapes, sized to fill a screen. Classic IIFE.
 */
(function (root) {
  'use strict';

  root.HydraSnippets = [
    {
      id: 'osc',
      name: 'Osc',
      code: [
        'osc(20, 0.1, 0.8)',
        '  .out()'
      ].join('\n')
    },
    {
      id: 'kaleid',
      name: 'Kaleid',
      code: [
        'osc(18, 0.1, 0.9)',
        '  .kaleid(5)',
        '  .color(0.9, 0.3, 0.6)',
        '  .out()'
      ].join('\n')
    },
    {
      id: 'modulate',
      name: 'Modulate',
      code: [
        'osc(20, 0.03, 0.8)',
        '  .modulate(noise(3, 0.1), 0.25)',
        '  .color(0.2, 0.7, 1)',
        '  .out()'
      ].join('\n')
    },
    {
      id: 'shape',
      name: 'Shape',
      code: [
        'shape(4, 0.3, 0.01)',
        '  .repeat(3, 3)',
        '  .kaleid(3)',
        '  .color(0.2, 0.65, 0.95)',
        '  .rotate(() => time * 0.15)',
        '  .out()'
      ].join('\n')
    },
    {
      id: 'voronoi',
      name: 'Voronoi',
      code: [
        'voronoi(8, 0.3, 0.2)',
        '  .color(0.95, 0.35, 0.55)',
        '  .modulate(osc(4, 0.1), 0.05)',
        '  .out()'
      ].join('\n')
    },
    {
      id: 'feedback',
      name: 'Feedback',
      code: [
        'src(o0)',
        '  .modulate(osc(6, 0, 1.5), 0.02)',
        '  .blend(osc(8, 0.1, 1.2).color(0.9, 0.2, 0.5), 0.12)',
        '  .scale(1.01)',
        '  .out()'
      ].join('\n')
    },
    {
      id: 'spin',
      name: 'Spin',
      code: [
        'osc(10, 0.1, 1.2)',
        '  .rotate(() => time * 0.2)',
        '  .kaleid(4)',
        '  .colorama(0.05)',
        '  .out()'
      ].join('\n')
    },
    {
      id: 'finger',
      name: 'Finger',
      code: [
        'osc(20, 0.1, 0.8)',
        '  .kaleid(() => 2 + 6 * mouse.x / width)',
        '  .color(0.8, 0.3, 1)',
        '  .out()'
      ].join('\n')
    }
  ];
})(typeof window !== 'undefined' ? window : this);
