// Fruit-machine symbols drawn as SVG data URLs. The original ships a
// KPD Media Star Wars pack we cannot redistribute; the reel engine is
// unchanged.
(function (g) {
  'use strict';
  function svg(body) {
    return 'data:image/svg+xml,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + body + '</svg>'
    );
  }
  var bg = '<rect width="100" height="100" rx="10" fill="#1a1420"/>';
  g.SlotSymbols = {
    cherry: svg(bg + '<circle cx="38" cy="62" r="16" fill="#d42838"/><circle cx="62" cy="66" r="16" fill="#c42030"/><path d="M48 50 C48 28 62 18 72 16" stroke="#3a8a3a" stroke-width="5" fill="none"/><ellipse cx="70" cy="18" rx="10" ry="6" fill="#4caf50"/>'),
    lemon: svg(bg + '<ellipse cx="50" cy="52" rx="32" ry="24" fill="#f0d040"/><ellipse cx="50" cy="52" rx="24" ry="16" fill="#ffe060"/><path d="M50 28 C58 22 70 26 72 30" stroke="#c8a020" stroke-width="3" fill="none"/>'),
    grape: svg(bg + '<circle cx="50" cy="38" r="12" fill="#7b3aa8"/><circle cx="38" cy="52" r="12" fill="#8b48b8"/><circle cx="62" cy="52" r="12" fill="#6a2a98"/><circle cx="44" cy="66" r="11" fill="#9b58c8"/><circle cx="58" cy="66" r="11" fill="#7b3aa8"/><ellipse cx="58" cy="22" rx="12" ry="6" fill="#4caf50"/>'),
    bell: svg(bg + '<path d="M32 42 C32 24 68 24 68 42 L72 68 H28 Z" fill="#f0d040"/><rect x="28" y="66" width="44" height="8" rx="3" fill="#d4a030"/><circle cx="50" cy="78" r="6" fill="#f0d080"/><rect x="44" y="22" width="12" height="8" rx="3" fill="#c8a020"/>'),
    seven: svg(bg + '<text x="50" y="72" text-anchor="middle" font-size="64" font-family="Impact,Arial Black,sans-serif" font-weight="800" fill="#e02030">7</text>'),
    bar: svg(bg + '<rect x="14" y="36" width="72" height="28" rx="4" fill="#f4ece0"/><text x="50" y="58" text-anchor="middle" font-size="22" font-family="Impact,Arial Black,sans-serif" fill="#1a1208">BAR</text>'),
    star: svg(bg + '<polygon points="50,14 60,38 86,40 66,58 72,84 50,70 28,84 34,58 14,40 40,38" fill="#f0d040"/>'),
    diamond: svg(bg + '<polygon points="50,12 88,50 50,88 12,50" fill="#3ec6e0"/><polygon points="50,22 78,50 50,78 22,50" fill="#7ae0f0"/>'),
    clover: svg(bg + '<circle cx="50" cy="34" r="14" fill="#2e9a46"/><circle cx="34" cy="52" r="14" fill="#2e9a46"/><circle cx="66" cy="52" r="14" fill="#2e9a46"/><circle cx="50" cy="64" r="14" fill="#248a3a"/><rect x="47" y="70" width="6" height="18" fill="#1e6a2e"/>')
  };
  g.SLOT_NAMES = ['cherry', 'lemon', 'grape', 'bell', 'seven', 'bar', 'star', 'diamond', 'clover'];
})(window);
