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
  var bg = '<rect width="100" height="100" rx="12" fill="#16101c"/>' +
    '<rect x="3" y="3" width="94" height="94" rx="10" fill="none" stroke="#2a2030" stroke-width="2"/>';
  g.SlotSymbols = {
    cherry: svg(bg +
      '<circle cx="36" cy="64" r="18" fill="#d42838"/><circle cx="36" cy="64" r="10" fill="#e84858"/>' +
      '<circle cx="64" cy="68" r="18" fill="#c42030"/><circle cx="64" cy="68" r="10" fill="#d43848"/>' +
      '<path d="M48 50 C48 26 64 16 76 14" stroke="#2e8a3a" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="74" cy="16" rx="12" ry="6" fill="#4caf50"/>'),
    lemon: svg(bg +
      '<ellipse cx="50" cy="54" rx="34" ry="26" fill="#e8c020"/>' +
      '<ellipse cx="50" cy="54" rx="26" ry="18" fill="#ffe060"/>' +
      '<path d="M50 28 C60 20 74 24 76 30" stroke="#c8a020" stroke-width="3" fill="none"/>' +
      '<ellipse cx="38" cy="48" rx="6" ry="10" fill="#fff6a0" opacity=".5"/>'),
    grape: svg(bg +
      '<circle cx="50" cy="36" r="13" fill="#7b3aa8"/>' +
      '<circle cx="36" cy="50" r="13" fill="#8b48b8"/>' +
      '<circle cx="64" cy="50" r="13" fill="#6a2a98"/>' +
      '<circle cx="42" cy="66" r="12" fill="#9b58c8"/>' +
      '<circle cx="58" cy="66" r="12" fill="#7b3aa8"/>' +
      '<circle cx="50" cy="78" r="11" fill="#6a2a98"/>' +
      '<ellipse cx="60" cy="20" rx="14" ry="7" fill="#4caf50"/>' +
      '<path d="M50 28 L56 20" stroke="#2e6a32" stroke-width="3"/>'),
    bell: svg(bg +
      '<path d="M32 42 C32 22 68 22 68 42 L73 68 H27 Z" fill="#f0d040"/>' +
      '<path d="M36 42 C36 26 64 26 64 42" fill="#ffe680"/>' +
      '<rect x="26" y="66" width="48" height="9" rx="3" fill="#d4a030"/>' +
      '<circle cx="50" cy="80" r="7" fill="#f0d080"/>' +
      '<rect x="44" y="18" width="12" height="10" rx="3" fill="#c8a020"/>'),
    seven: svg(bg +
      '<text x="50" y="74" text-anchor="middle" font-size="68" font-family="Impact,Arial Black,sans-serif" font-weight="800" fill="#e02030">7</text>' +
      '<text x="50" y="74" text-anchor="middle" font-size="68" font-family="Impact,Arial Black,sans-serif" font-weight="800" fill="none" stroke="#8a1018" stroke-width="2">7</text>'),
    bar: svg(bg +
      '<rect x="12" y="34" width="76" height="32" rx="5" fill="#f4ece0"/>' +
      '<rect x="16" y="38" width="68" height="24" rx="3" fill="#1a1208"/>' +
      '<text x="50" y="57" text-anchor="middle" font-size="20" font-family="Impact,Arial Black,sans-serif" fill="#f4ece0">BAR</text>'),
    star: svg(bg +
      '<polygon points="50,12 61,38 90,40 68,60 75,88 50,72 25,88 32,60 10,40 39,38" fill="#f0d040"/>' +
      '<polygon points="50,22 58,40 78,42 62,56 67,76 50,64 33,76 38,56 22,42 42,40" fill="#ffe680"/>'),
    diamond: svg(bg +
      '<polygon points="50,10 90,50 50,90 10,50" fill="#1aa8c8"/>' +
      '<polygon points="50,20 80,50 50,80 20,50" fill="#5ad8f0"/>' +
      '<polygon points="50,28 58,50 50,54 42,50" fill="#e8fbff"/>'),
    clover: svg(bg +
      '<circle cx="50" cy="32" r="15" fill="#2e9a46"/>' +
      '<circle cx="32" cy="52" r="15" fill="#2e9a46"/>' +
      '<circle cx="68" cy="52" r="15" fill="#2e9a46"/>' +
      '<circle cx="50" cy="66" r="15" fill="#248a3a"/>' +
      '<rect x="47" y="72" width="6" height="18" rx="2" fill="#1e6a2e"/>')
  };
  g.SLOT_NAMES = ['cherry', 'lemon', 'grape', 'bell', 'seven', 'bar', 'star', 'diamond', 'clover'];
})(window);
