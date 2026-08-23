/*
 * Remix snippets. Short css-doodle recipes from the project's own docs
 * (css-doodle.com / README), sized to fill the square. Classic IIFE.
 */
(function (root) {
  'use strict';

  root.CDSnippets = [
    {
      id: 'checker',
      name: 'Checker',
      code: [
        '@grid: 8 / 100%;',
        'background: @p(#0d0b12, #f4efe8);',
        'margin: 1px;'
      ].join('\n')
    },
    {
      id: 'tiles',
      name: 'Tiles',
      code: [
        '@grid: 12 / 100% / #0a0c27;',
        '--hue: calc(180 + 1.5 * @x * @y);',
        'background: hsl(var(--hue), 50%, 70%);',
        'margin: -.5px;',
        'transition: @r(.5s) ease;',
        'clip-path: polygon(@pick(',
        "  '0 0, 100% 0, 100% 100%',",
        "  '0 0, 100% 0, 0 100%',",
        "  '0 0, 100% 100%, 0 100%',",
        "  '100% 0, 100% 100%, 0 100%'",
        '));'
      ].join('\n')
    },
    {
      id: 'stripes',
      name: 'Stripes',
      code: [
        '@grid: 1 / 100%;',
        'background: linear-gradient(',
        '  45deg,',
        '  @stripe(',
        '    #60569e 50%, #e6437d, #ebbf4d, #60569e',
        '  )',
        ');'
      ].join('\n')
    },
    {
      id: 'scatter',
      name: 'Scatter',
      code: [
        '@grid: 6 / 100%;',
        'background: rgba(96, 86, 158, @rand(.9));',
        'transition: .2s ease @rand(200ms);',
        'transform: rotate(@rand(360deg));',
        'clip-path: polygon(',
        '  @rand(100%) 0, 100% @rand(100%), 0 @rand(100%)',
        ');'
      ].join('\n')
    },
    {
      id: 'fade',
      name: 'Fade',
      code: [
        '@grid: 7 / 100%;',
        '--alpha: calc(@abs(@abs(@row - 4) + @abs(@col - 4) - 6) / 6);',
        'background: rgba(96, 86, 158, var(--alpha));'
      ].join('\n')
    },
    {
      id: 'dots',
      name: 'Dots',
      code: [
        '@grid: 10 / 100% / #111;',
        'background: @p(#60569e, #e6437d, #ebbf4d, #0a0c27);',
        'border-radius: 50%;',
        'transform: scale(@r(.2, 1));',
        'margin: 6%;'
      ].join('\n')
    },
    {
      id: 'rings',
      name: 'Rings',
      code: [
        '@grid: 8 / 100% / #0d0b12;',
        'border: @r(2, 8)px solid @p(#60569e, #e6437d, #ebbf4d);',
        'border-radius: 50%;',
        'transform: scale(@r(.35, .95));',
        'margin: 8%;',
        'background: transparent;'
      ].join('\n')
    },
    {
      id: 'spiral',
      name: 'Spiral',
      code: [
        '@grid: 1 / 100% / #125cde;',
        '@content: @Svg(',
        '  viewBox: -50 -50 100 100 padding -12;',
        '  circle*120 {',
        '    fill: hsl(@calc(120-90*@sin.n), 80%, 50%);',
        '    r: @sqrt(@n/40);',
        '    cx: @calc(@n*.618^4 * cos(2π*@n*.618));',
        '    cy: @calc(@n*.618^4 * sin(2π*@n*.618));',
        '  }',
        ');'
      ].join('\n')
    }
  ];
})(window);
