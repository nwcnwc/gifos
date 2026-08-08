// Anyroad — the built world: roads, buildings, water.
//
// Geometry comes from OpenStreetMap through Overpass, one query per tile, and
// is turned into three meshes laid over the terrain. Three things drive the
// design here, all of them consequences of where the data comes from:
//
//  - Overpass is donated infrastructure with a per-IP budget. One query per
//    tile, cached hard, and never re-asked for a tile we already hold.
//  - The GifOS fetch bridge caps a response at 8 MB. A dense city tile with
//    every building can blow past that, so a tile that comes back too large is
//    retried WITHOUT buildings and remembered as dense — degraded, not broken.
//  - What gets persisted is the parsed geometry, not the JSON and not the mesh.
//    Meshes are rebuilt whenever the frame re-pins; the JSON is ten times the
//    size of what we keep. And the cache is capped, because a GifOS app's db
//    is baked into its GIF when you save it.
(function (root) {
  'use strict';

  var TILE_ZOOM = 15;          // ~1.2 km per tile: small enough that a city tile fits
  var CACHE_MAX = 48;          // tiles of parsed geometry kept in the db
  var MAX_BUILDINGS = 1200;    // per tile, densest-first is not worth the bytes

  // Metres of carriageway per OSM highway class, and how light the surface is.
  // Anything not listed is not drawn — service alleys and footpaths would
  // quadruple the geometry for very little of the feeling of driving.
  var ROAD_CLASS = {
    motorway:      { w: 14, tone: 0.62, rank: 6, cruise: 33 },
    motorway_link: { w: 8,  tone: 0.62, rank: 5, cruise: 20 },
    trunk:         { w: 12, tone: 0.60, rank: 6, cruise: 30 },
    trunk_link:    { w: 8,  tone: 0.60, rank: 5, cruise: 19 },
    primary:       { w: 11, tone: 0.58, rank: 5, cruise: 24 },
    primary_link:  { w: 7,  tone: 0.58, rank: 4, cruise: 16 },
    secondary:     { w: 9,  tone: 0.55, rank: 4, cruise: 21 },
    secondary_link:{ w: 6,  tone: 0.55, rank: 3, cruise: 15 },
    tertiary:      { w: 8,  tone: 0.52, rank: 3, cruise: 19 },
    tertiary_link: { w: 6,  tone: 0.52, rank: 3, cruise: 15 },
    residential:   { w: 7,  tone: 0.48, rank: 2, cruise: 14 },
    unclassified:  { w: 6,  tone: 0.46, rank: 2, cruise: 14 },
    living_street: { w: 6,  tone: 0.46, rank: 2, cruise: 14 },
    service:       { w: 4,  tone: 0.42, rank: 1, cruise: 9 },
    track:         { w: 3.5,tone: 0.38, rank: 1, cruise: 8, unsealed: true },
  };

  // ---- what is this road MADE of? ------------------------------------------
  // Same story as the buildings: OSM tags `surface` on the way and the parser
  // never looked. A `highway=track` through a field was drawn as tarmac with a
  // painted centre line down it, which is not a detail — a dirt track and a
  // B road are different things to drive on and looked identical.
  //
  //   0 sealed (asphalt, concrete, the default)
  //   1 gravel (compacted, fine_gravel, pebblestone)
  //   2 dirt   (ground, earth, mud, sand, grass — no markings, ruts)
  //   3 stone  (cobblestone, sett, paving_stones — old town centres)
  var SURFACE = {
    asphalt: 0, concrete: 0, paved: 0, chipseal: 0, 'concrete:plates': 0, metal: 0,
    gravel: 1, compacted: 1, fine_gravel: 1, pebblestone: 1, shells: 1,
    unpaved: 2, ground: 2, dirt: 2, earth: 2, mud: 2, sand: 2, grass: 2, woodchips: 2,
    cobblestone: 3, sett: 3, paving_stones: 3, bricks: 3, 'cobblestone:flattened': 3,
  };

  function surfaceOf(tags) {
    var s = SURFACE[tags.surface];
    if (s !== undefined) return s;
    if (tags.tracktype) return tags.tracktype === 'grade1' ? 1 : 2;   // graded, or not
    // Untagged: a track is a track whatever nobody said about it.
    return ROAD_CLASS[tags.highway] && ROAD_CLASS[tags.highway].unsealed ? 2 : 0;
  }

  // Lanes widen a road far more honestly than its classification does — a
  // six-lane primary and a two-lane primary are the same OSM class.
  function laneCount(tags) {
    var n = parseFloat(tags.lanes);
    if (!isFinite(n) || n < 1) return 0;             // 0 = "nobody said"
    return Math.min(10, Math.round(n));
  }

  function bboxOf(tile) {
    var b = root.Geo.tileBounds(tile.z, tile.x, tile.y);
    // Overpass wants south,west,north,east.
    return b.south + ',' + b.west + ',' + b.north + ',' + b.east;
  }

  function query(tile, withBuildings) {
    var bb = bboxOf(tile);
    var parts = ['way["highway"~"^(' + Object.keys(ROAD_CLASS).join('|') + ')$"](' + bb + ');'];
    if (withBuildings) parts.push('way["building"](' + bb + ');');
    parts.push('way["natural"="water"](' + bb + ');');
    return '[out:json][timeout:25];(' + parts.join('') + ');out geom;';
  }

  // ---- parse ---------------------------------------------------------------
  // Overpass `out geom` inlines each way's coordinates, so no node table to
  // resolve. Coordinates are rounded to 6 decimals (~0.1 m) — beyond that we
  // would be storing noise at real cost.
  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  function parse(json, withBuildings) {
    var ways = [], bld = [], wat = [];
    var els = (json && json.elements) || [];
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (!e.geometry || e.geometry.length < 2) continue;
      var flat = [];
      for (var g = 0; g < e.geometry.length; g++) { flat.push(r6(e.geometry[g].lat), r6(e.geometry[g].lon)); }
      var tags = e.tags || {};
      if (tags.highway && ROAD_CLASS[tags.highway]) {
        // [4] is the NAME, and it has been in every response we have ever
        // made — `out geom` returns the way's whole tag set and the parser
        // took three of them. A road you are driving down that cannot tell
        // you what it is called is a map with the labels torn off.
        ways.push([tags.highway, flat, surfaceOf(tags), laneCount(tags), tags.name || '']);
      } else if (tags.building && withBuildings) {
        // [3] is the BRAND, packed as a colour (see packBrand). A cache written
        // before brands existed simply has no fourth element — undefined packs
        // to 0, which means "no sign", so old caches keep working and upgrade
        // themselves as tiles are re-fetched.
        if (bld.length < MAX_BUILDINGS) {
          var brand = packBrand(tags), bcls = classify(tags);
          // Only a shopfront paints a sign board, and a building carrying a
          // recognised retail brand IS a shop however it was tagged — a Tesco
          // mapped as `building=yes` with nothing but `brand=Tesco` would
          // otherwise render as an anonymous grey box with the sign suppressed.
          if (brand && bcls === CLS.UNKNOWN) bcls = CLS.RETAIL;
          bld.push([buildingHeight(tags, ringAreaM2(flat)), flat, bcls, brand]);
        }
      } else if (tags.natural === 'water') {
        wat.push(flat);
      }
    }
    return { ways: ways, bld: bld, wat: wat };
  }

  // ---- what KIND of building is this? --------------------------------------
  // OSM has always told us. `building=house`, `building=retail`,
  // `building=warehouse` — the value was right there in the response and the
  // parser tested `tags.building` for TRUTHINESS and threw the value away, so
  // a terrace of houses, a shopping parade and a distribution shed were the
  // same grey extrusion at whatever height they happened to have.
  //
  // Eight classes, because eight is what the eye can tell apart from a moving
  // car. They drive the facade, the roof, the default height when nobody
  // tagged one, and whether the ground floor is a shopfront.
  var CLS = {
    UNKNOWN: 0, HOUSE: 1, APARTMENTS: 2, RETAIL: 3,
    OFFICE: 4, INDUSTRIAL: 5, OUTBUILDING: 6, CIVIC: 7,
  };

  var BUILDING_CLASS = {
    // Someone lives here, one household at a time.
    house: 1, detached: 1, semidetached_house: 1, terrace: 1, terraced_house: 1,
    bungalow: 1, residential: 1, cabin: 1, static_caravan: 1, houseboat: 1, farm: 1,
    // Someone lives here, stacked.
    apartments: 2, dormitory: 2, hotel: 2,
    // You buy something here — the class that gets a shopfront.
    retail: 3, supermarket: 3, kiosk: 3, shop: 3, mall: 3,
    // Someone works here at a desk.
    commercial: 4, office: 4, government: 4,
    // Someone works here with a forklift.
    industrial: 5, warehouse: 5, factory: 5, manufacture: 5, hangar: 5,
    silo: 5, storage_tank: 5, barn: 5, farm_auxiliary: 5, greenhouse: 5, service: 5,
    // Too small to be anything: sheds, garages, a roof on posts.
    garage: 6, garages: 6, shed: 6, hut: 6, roof: 6, carport: 6, cabin_shed: 6,
    // Everyone's building.
    church: 7, chapel: 7, cathedral: 7, mosque: 7, synagogue: 7, temple: 7,
    school: 7, university: 7, college: 7, kindergarten: 7, hospital: 7,
    civic: 7, public: 7, museum: 7, train_station: 7, sports_centre: 7, stadium: 7,
  };

  function classify(tags) {
    var c = BUILDING_CLASS[tags.building];
    if (c) return c;
    // The building tag said nothing useful ("yes", by a mile the commonest
    // value). Other tags on the same way often do — a way carrying shop=* IS a
    // shop whatever its building tag claims.
    if (tags.shop) return CLS.RETAIL;
    if (tags.office) return CLS.OFFICE;
    if (tags.tourism === 'hotel' || tags.tourism === 'hostel') return CLS.APARTMENTS;
    if (tags.amenity === 'place_of_worship' || tags.amenity === 'school'
        || tags.amenity === 'hospital' || tags.amenity === 'townhall'
        || tags.amenity === 'university' || tags.amenity === 'college') return CLS.CIVIC;
    if (tags.amenity === 'restaurant' || tags.amenity === 'cafe'
        || tags.amenity === 'bar' || tags.amenity === 'pub'
        || tags.amenity === 'fast_food' || tags.amenity === 'bank'
        || tags.amenity === 'pharmacy' || tags.amenity === 'fuel'
        || tags.amenity === 'fuel_station') return CLS.RETAIL;
    return CLS.UNKNOWN;   // resolved by SIZE at build time — see extrude()
  }

  // ---- whose shop is it? ---------------------------------------------------
  // OSM names businesses — `name=McDonald's`, `brand=Aldi`, and increasingly a
  // `brand:wikidata` that is language-proof — and the parser threw all of it
  // away. What comes back is the one thing that reads from a moving car: the
  // COLOUR OF THE SIGN. A red-and-yellow fascia on the corner is recognisable
  // at a distance where lettering is still four unreadable pixels.
  //
  // Deliberately colours and NOT logos or wordmarks. Those are trademarks, and
  // reproducing them inside a game is a different question from colouring a
  // band; a sign board in a company's own colours is what a filmed street
  // looks like anyway.
  //
  // Keyed by brand:wikidata where there is one (it survives translation and
  // spelling), then by a normalised name.
  var BRAND_COLOUR = {
    // fast food
    'q38076': [0.85, 0.16, 0.11], mcdonalds: [0.85, 0.16, 0.11],
    'q177054': [0.79, 0.13, 0.16], burgerking: [0.79, 0.13, 0.16],
    'q524757': [0.90, 0.11, 0.14], kfc: [0.90, 0.11, 0.14],
    'q244457': [0.05, 0.42, 0.24], subway: [0.05, 0.42, 0.24],
    'q37158': [0.00, 0.44, 0.29], starbucks: [0.00, 0.44, 0.29],
    'q608845': [0.42, 0.11, 0.27], costa: [0.42, 0.11, 0.27], costacoffee: [0.42, 0.11, 0.27],
    'q3403981': [0.00, 0.24, 0.63], greggs: [0.00, 0.24, 0.63],
    'q1141226': [0.88, 0.08, 0.14], dominos: [0.88, 0.08, 0.14], dominospizza: [0.88, 0.08, 0.14],
    // groceries
    'q487494': [0.00, 0.33, 0.62], tesco: [0.00, 0.33, 0.62],
    'q125054': [0.00, 0.30, 0.60], aldi: [0.00, 0.30, 0.60],
    'q151954': [0.00, 0.31, 0.62], lidl: [0.00, 0.31, 0.62],
    sainsburys: [0.94, 0.45, 0.09], asda: [0.00, 0.44, 0.75], morrisons: [0.00, 0.40, 0.24],
    carrefour: [0.00, 0.35, 0.68], walmart: [0.00, 0.44, 0.75], target: [0.80, 0.10, 0.15],
    // fuel — the sign you look for when the tank is low
    'q154950': [0.95, 0.76, 0.05], shell: [0.95, 0.76, 0.05],
    'q152057': [0.00, 0.47, 0.24], bp: [0.00, 0.47, 0.24],
    esso: [0.83, 0.14, 0.16], total: [0.90, 0.30, 0.10], texaco: [0.85, 0.12, 0.14],
    // everything else that paints its whole shopfront one colour
    ikea: [0.00, 0.35, 0.68], decathlon: [0.00, 0.45, 0.65], boots: [0.00, 0.23, 0.55],

    // NORTH AMERICA. The list above was written from a British high street —
    // Greggs, Costa, Morrisons, Boots — which is a fine list and the wrong one
    // for most of the planet's drivers. Keyed by NAME rather than
    // brand:wikidata: the Q-ids above are ones I could verify, and a guessed
    // Q-id is worse than no Q-id because it silently paints the wrong brand's
    // colour on somebody's corner. Names are matched normalised (lowercased,
    // punctuation stripped), so both "In-N-Out" and "In-N-Out Burger" land.
    innout: [0.87, 0.16, 0.20], innoutburger: [0.87, 0.16, 0.20],
    chickfila: [0.86, 0.14, 0.20], tacobell: [0.44, 0.16, 0.49],
    wendys: [0.79, 0.11, 0.16], dunkin: [0.95, 0.44, 0.10],
    dunkindonuts: [0.95, 0.44, 0.10], chipotle: [0.60, 0.18, 0.13],
    fiveguys: [0.79, 0.10, 0.24], whataburger: [0.94, 0.35, 0.06],
    jackinthebox: [0.85, 0.15, 0.20], sonic: [0.90, 0.25, 0.15],
    sonicdrivein: [0.90, 0.25, 0.15], popeyes: [0.94, 0.42, 0.09],
    arbys: [0.80, 0.14, 0.18], dairyqueen: [0.85, 0.13, 0.19],
    pandaexpress: [0.83, 0.13, 0.16], shakeshack: [0.42, 0.72, 0.55],
    // groceries and pharmacy
    traderjoes: [0.79, 0.13, 0.15], safeway: [0.83, 0.13, 0.16],
    kroger: [0.00, 0.34, 0.65], albertsons: [0.00, 0.36, 0.63],
    publix: [0.13, 0.42, 0.21], costco: [0.88, 0.13, 0.18],
    wholefoods: [0.00, 0.42, 0.24], wholefoodsmarket: [0.00, 0.42, 0.24],
    cvs: [0.80, 0.10, 0.14], cvspharmacy: [0.80, 0.10, 0.14],
    walgreens: [0.80, 0.10, 0.14],
    // fuel — the sign you look for when the tank is low, US edition
    chevron: [0.00, 0.31, 0.62], exxon: [0.85, 0.13, 0.16],
    mobil: [0.85, 0.13, 0.16], arco: [0.00, 0.35, 0.66],
    valero: [0.00, 0.40, 0.68], circlek: [0.90, 0.36, 0.10],
    '7eleven': [0.85, 0.16, 0.18],
    // hardware and big box
    homedepot: [0.95, 0.42, 0.06], lowes: [0.00, 0.29, 0.62],
    bestbuy: [0.00, 0.33, 0.71],
  };

  // Lowercase, strip everything that is not a letter or digit, and drop a
  // leading "the" — OSM carries "The Home Depot" and "The Range" exactly as the
  // company writes them, and a table keyed on homedepot would miss every one.
  function normBrand(s) {
    var n = String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    return n.replace(/^the(?=.{3})/, '');
  }

  // Pack an RGB into ONE float's integer part: 4 bits a channel, 0-15 each.
  // Sixteen levels is coarse and a sign is a flat colour at 40 m, so nothing
  // that matters is lost — and it means the brand rides inside the seed the
  // shader already carries, with no new vertex attribute, no change to the
  // packed mesh format and no cache migration.
  //
  // FOUR bits, not five, for a numeric reason: seed is stored in a Float32Array
  // and the brand occupies its integer part, so every bit the brand takes is a
  // bit of fractional precision the seed loses. Capped at 4095 the seed keeps
  // ~12 fractional bits; at 5 bits a channel it would keep 9, and the seed
  // drives window jitter and palette choice across every building on screen.
  function packRgb(c) {
    var r = Math.round(c[0] * 15), g = Math.round(c[1] * 15), b = Math.round(c[2] * 15);
    return (r * 256 + g * 16 + b) + 1;       // +1 so a black sign is not "no sign"
  }

  function packBrand(tags) {
    var c = BRAND_COLOUR[normBrand(tags['brand:wikidata'] || '')]
         || BRAND_COLOUR[normBrand(tags.brand || '')]
         || BRAND_COLOUR[normBrand(tags.name || '')]
         || BRAND_COLOUR[normBrand(tags.operator || '')];
    return c ? packRgb(c) : 0;
  }

  // ---- how tall is it? -----------------------------------------------------
  // Most buildings in OSM carry no height at all, so most of what you drive
  // past is a GUESS, and the guess used to be made from the class alone:
  // `building=commercial` meant 15 m, which is five storeys, invented out of
  // silence. A large two-storey house next door to a mapper becomes an office
  // block, and there is no tag anywhere that said so.
  //
  // Two changes. First, read more of what OSM does say — heights come tagged
  // in feet, with units, and split across roof and body. Second, when there is
  // genuinely nothing, guess from the FOOTPRINT as well as the class, because
  // area constrains height in the real world: nobody builds five storeys on
  // 3000 m² of ground, and a 2000 m² "commercial" building is a big shed with
  // a car park, not a tower.

  // Metres, from the several ways OSM writes a length: "12", "12 m", "40'",
  // "40 ft", "12.5m". Feet matter — US buildings are tagged in them and
  // parseFloat("40'") is 40 METRES if nobody looks at the quote.
  function metresFrom(v) {
    if (v == null) return NaN;
    var s = String(v).trim();
    var n = parseFloat(s);
    if (!isFinite(n) || n <= 0) return NaN;
    if (/('|ft|feet)\s*$/i.test(s)) return n * 0.3048;
    return n;
  }

  // Storeys → metres. A storey is not one number: a warehouse's single storey
  // is taller than a whole house.
  var STOREY = [3.1, 2.9, 3.0, 3.6, 3.7, 6.0, 2.6, 3.8];

  // Storeys to ASSUME per class when nothing is tagged, and the footprint area
  // (m²) above which that assumption drops by one — the big-footprint form of
  // the same building is always the flatter one. `null` means area never
  // changes the answer: a shed is a shed at any size.
  var GUESS = [
    { levels: 2, wide: 500,  min: 1 },   // 0 unknown  — the commonest case by far
    { levels: 2, wide: null, min: 2 },   // 1 house    — two storeys, however grand
    { levels: 4, wide: 1200, min: 3 },   // 2 flats
    { levels: 2, wide: 700,  min: 1 },   // 3 retail   — big box is one tall storey
    { levels: 3, wide: 1200, min: 2 },   // 4 office   — WAS 15 m flat; that was the bug
    { levels: 1, wide: null, min: 1 },   // 5 industrial
    { levels: 1, wide: null, min: 1 },   // 6 outbuilding
    { levels: 2, wide: 1800, min: 1 },   // 7 civic
  ];

  // areaM2 is optional: callers that have not measured the footprint get the
  // class's plain assumption, which is what the old behaviour was.
  function buildingHeight(tags, areaM2) {
    // 1. An explicit height, in whatever unit it was written.
    var h = metresFrom(tags.height) || metresFrom(tags['building:height']);
    if (isFinite(h) && h > 0) return Math.min(300, h);
    // 2. Storeys. `building:levels` counts the BODY; a tagged roof adds to it.
    var cls = classify(tags);
    var lv = parseFloat(tags['building:levels']);
    if (isFinite(lv) && lv > 0) {
      var body = lv * STOREY[cls];
      var roof = metresFrom(tags['roof:height']);
      var roofLv = parseFloat(tags['roof:levels']);
      if (isFinite(roof) && roof > 0) body += roof;
      else if (isFinite(roofLv) && roofLv > 0) body += roofLv * 2.2;
      return Math.min(300, body);
    }
    // 3. Someone's estimate is still worth more than ours.
    var est = metresFrom(tags.est_height);
    if (isFinite(est) && est > 0) return Math.min(300, est);
    // 4. Nothing. Guess — conservatively, and with the footprint in hand.
    var g = GUESS[cls] || GUESS[0];
    var levels = g.levels;
    if (g.wide && isFinite(areaM2) && areaM2 > g.wide) {
      // Every doubling past the threshold takes another storey off, never
      // below the class's floor. Inventing storeys is the expensive mistake:
      // a building drawn too short reads as a building, one drawn too tall
      // reads as a different building.
      levels = Math.max(g.min, levels - Math.floor(Math.log(areaM2 / g.wide) / Math.LN2) - 1);
    }
    return levels * STOREY[cls];
  }

  // Footprint area in m², from a flat [lat,lon,lat,lon,…] ring. The shoelace on
  // degrees scaled at the ring's own latitude — good to a fraction of a percent
  // at building scale, and it costs one cos().
  function ringAreaM2(flat) {
    if (flat.length < 6) return NaN;
    var latSum = 0, n = flat.length / 2;
    for (var i = 0; i < flat.length; i += 2) latSum += flat[i];
    var mLat = root.Geo.metresPerDegLat(latSum / n), mLon = root.Geo.metresPerDegLon(latSum / n);
    var a = 0;
    for (var j = 0; j < flat.length; j += 2) {
      var k = (j + 2) % flat.length;
      a += (flat[j + 1] * mLon) * (flat[k] * mLat) - (flat[k + 1] * mLon) * (flat[j] * mLat);
    }
    return Math.abs(a) / 2;
  }

  // ---- persistence ---------------------------------------------------------
  // A private collection: a guest in a race keeps their own cache and none of
  // this ever crosses the relay, which is a control-plane pipe with a hard
  // bandwidth budget — syncing a map cache through it would sink multiplayer.
  var index = null;   // key -> lastUsed, mirrored in memory to avoid a read per tile

  function db() { return root.Host.db('roadcache'); }

  function loadIndex() {
    if (index) return Promise.resolve(index);
    return db().get('index').then(function (rec) {
      index = (rec && rec.map) || {};
      return index;
    }).catch(function () { index = {}; return index; });
  }

  function saveIndex() {
    return db().put({ id: 'index', map: index }).catch(function () {});
  }

  function evictIfNeeded() {
    var keys = Object.keys(index);
    if (keys.length <= CACHE_MAX) return Promise.resolve();
    keys.sort(function (a, b) { return index[a] - index[b]; });      // oldest first
    var drop = keys.slice(0, keys.length - CACHE_MAX);
    return Promise.all(drop.map(function (k) {
      delete index[k];
      return db().delete('t' + k).catch(function () {});
    }));
  }

  // ---- fetch or recall -----------------------------------------------------
  var memory = {};   // key -> parsed geometry, this session

  // A cached DENSE record (roads-only, because the buildings query once failed
  // or came back too big) must not be the tile's fate forever. It was: the
  // cache served it before any fetch was considered, so one bad evening at the
  // map server took a neighbourhood's buildings away permanently — "my own
  // address is building-less", from a player whose tile had 504'd once. A
  // dense record now carries its fetch time and EXPIRES: past the TTL the tile
  // is re-asked WITH buildings, and only if that fails again does the stale
  // roads-only copy carry on (degraded service, never a degraded cache).
  var DENSE_RETRY_MS = 6 * 60 * 60 * 1000;

  function loadTile(tile) {
    var key = root.Geo.tileKey(tile);
    if (memory[key]) return Promise.resolve(memory[key]);

    return loadIndex().then(function () {
      return db().get('t' + key).catch(function () { return null; });
    }).then(function (rec) {
      if (rec && rec.ways) {
        // Records saved before `at` existed have no timestamp — treated as
        // stale, so every player's dense tiles retry once and get stamped.
        var staleDense = rec.dense && (Date.now() - (rec.at || 0) > DENSE_RETRY_MS)
          && root.Sources.current.quality !== 'low';
        if (!staleDense) {
          var hit = { ways: rec.ways, bld: rec.bld || [], wat: rec.wat || [], dense: !!rec.dense };
          memory[key] = hit;
          index[key] = Date.now(); saveIndex();
          return hit;
        }
        return fetchTile(tile, key).catch(function () {
          // The retry failed too — the stale roads are still a world to drive.
          var old = { ways: rec.ways, bld: rec.bld || [], wat: rec.wat || [], dense: true };
          memory[key] = old;
          index[key] = Date.now(); saveIndex();
          return old;
        });
      }
      return fetchTile(tile, key);
    });
  }

  function fetchTile(tile, key) {
    var wantBuildings = root.Sources.current.quality !== 'low';
    var url = root.Sources.roads.url;

    function ask(withBuildings) {
      return root.Net.json(url + '?data=' + encodeURIComponent(query(tile, withBuildings)))
        .then(function (json) { return parse(json, withBuildings); });
    }

    return ask(wantBuildings).catch(function (err) {
      // Two different ways a dense tile refuses to load, and both mean the same
      // thing — this query is too big for this tile:
      //   "response too large"  the GifOS bridge's own 8 MB response cap
      //   HTTP 504              Overpass gave up on the query's cost
      // Either way, drop the buildings and take the roads. Without the 504 case
      // a city centre retries the identical too-expensive query forever, which
      // reads to the player as an app that simply never finishes loading.
      if (wantBuildings && (/too large/i.test(err.message || '') || err.status === 504)) {
        return ask(false).then(function (g) { g.dense = true; return g; });
      }
      throw err;
    }).then(function (geom) {
      memory[key] = geom;
      index[key] = Date.now();
      return db().put({
        id: 't' + key, ways: geom.ways, bld: geom.bld, wat: geom.wat, dense: !!geom.dense,
        at: Date.now(),   // when these bytes were fetched — a dense record expires against this
      }).catch(function () {}).then(evictIfNeeded).then(saveIndex).then(function () { return geom; });
    });
  }

  // ---- geometry building ---------------------------------------------------
  // All three meshes are built in world metres against the current frame, with
  // heights sampled from the SAME terrain the car drives on.
  // Ground height for geometry building — and an honest ledger of the times it
  // had no answer. `out geom` returns WHOLE ways, which run far beyond the
  // tile that asked for them, over terrain that may not be loaded yet; every
  // such sample used to become a silent 0, so the road (and anything near it)
  // was baked hundreds of metres underground and STAYED there — a built tile
  // never rebuilt, the terrain later loaded in above the corpse, and a city
  // ended at a hard line of grass with the street names still working (the
  // road index is 2-D and never sampled a height in its life). The counter is
  // how build() knows the tile is a guess, so the app can rebuild it when the
  // ground it was missing arrives.
  var groundMisses = 0;
  function groundAt(frame, x, z, lift) {
    var h = root.Terrain.heightAt(frame, x, z);
    if (h === null) { groundMisses++; return lift; }
    return h + lift;
  }

  // THE GRASS FLOWING INTO THE ROAD. A ribbon only samples the ground at the
  // way's OWN nodes, and OSM puts those wherever the road bends — on a straight
  // they can be a hundred metres apart. The terrain heightfield has a post
  // every ten. So between two road nodes the tarmac was a straight line in Y
  // across ground that rises and falls under it, and everywhere the ground won
  // it came through the surface. It was not a z-fighting problem and no amount
  // of lift would have fixed it: the road was genuinely below the hill.
  //
  // Split every segment so no piece is longer than one terrain post. Costs
  // vertices on long straights, which is exactly where they were missing.
  // SIX metres, not eight or ten, and the reason is latitude. A z14 terrain
  // tile is 2.4 km of ground at the equator but shrinks by cos(lat) — in Paris
  // it is about 1.6 km, so its 256 posts are 6.2 m apart, not 9.4. A step
  // chosen against the equator undersamples every city in Europe, which is
  // where the grass was coming through.
  var ROAD_STEP = 6;

  function densify(pts, step) {
    if (pts.length < 2) return pts;
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      var d = Math.hypot(b.x - a.x, b.z - a.z);
      var n = Math.min(64, Math.floor(d / step));
      for (var k = 1; k <= n; k++) {
        var t = k / (n + 1);
        out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      }
      out.push(b);
    }
    return out;
  }

  // A polyline to a ribbon. Vertex normals are mitred so the surface stays
  // continuous through a bend instead of showing a wedge of terrain at every
  // corner; the mitre is limited so a hairpin does not fire a spike off to
  // infinity.
  function ribbon(frame, pts, halfWidth, lift, out, tone, surface, lanes) {
    if (pts.length < 2) return;
    var n = pts.length;
    var left = [], right = [];
    for (var i = 0; i < n; i++) {
      var prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
      var dx = next.x - prev.x, dz = next.z - prev.z;
      var len = Math.hypot(dx, dz) || 1;
      var nx = -dz / len, nz = dx / len;          // left-hand normal
      // Mitre: widen by 1/cos(half-angle) where the path turns.
      var scale = 1;
      if (i > 0 && i < n - 1) {
        var ax = pts[i].x - pts[i - 1].x, az = pts[i].z - pts[i - 1].z;
        var bx = pts[i + 1].x - pts[i].x, bz = pts[i + 1].z - pts[i].z;
        var la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1;
        var cosA = (ax * bx + az * bz) / (la * lb);
        scale = Math.min(3, 1 / Math.max(0.34, Math.sqrt((1 + cosA) / 2)));
      }
      var w = halfWidth * scale;
      left.push({ x: pts[i].x + nx * w, z: pts[i].z + nz * w });
      right.push({ x: pts[i].x - nx * w, z: pts[i].z - nz * w });
    }
    var base = out.pos.length / 3;
    var along = 0;   // metres travelled down THIS way, for the centre-line dash
    for (var k = 0; k < n; k++) {
      if (k > 0) along += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
      var l = left[k], r = right[k];
      out.pos.push(l.x, groundAt(frame, l.x, l.z, lift), l.z);
      out.pos.push(r.x, groundAt(frame, r.x, r.z, lift), r.z);
      // v runs ACROSS the ribbon (0 at one kerb, 1 at the other) so the shader
      // can paint a centre line and kerb edges with no extra geometry; u runs
      // ALONG it in metres, which is what makes the dashes a fixed size on the
      // ground instead of stretching with the length of the way.
      out.uv.push(along, 0, along, 1);
      out.tone.push(tone, tone);
      // (surface, lanes) per vertex — what it is made of and how many lanes to
      // paint on it. Constant along a way, but attributes are the only channel
      // a ribbon has, and a uniform would mean a draw call per way.
      out.rinfo.push(surface || 0, lanes || 2, surface || 0, lanes || 2);
    }
    for (var s = 0; s < n - 1; s++) {
      var a = base + s * 2, b = a + 1, c = a + 2, d = a + 3;
      out.idx.push(a, c, b, b, c, d);
    }

    // SKIRTS. Densifying fixes the road following the hill; this covers the
    // last case, which is the ground rising ACROSS the carriageway — a road cut
    // into a slope has terrain higher than the tarmac on its uphill side, and
    // the edge of a flat ribbon leaves a hairline of grass lying over it. A
    // short vertical band hanging from each kerb hides that from every angle
    // for two quads per cross-section, and doubles as the kerb face.
    // ONLY WHERE IT IS NEEDED. A skirt down every kerb of every road TRIPLES
    // the road geometry — measured, 12,960 indices a tile became 77,760 — and
    // on flat ground it hides nothing, because there is nothing above the
    // tarmac to hide. Sample the ground just outside each kerb: if it sits
    // below the carriageway, that side needs no skirt at all, which is most of
    // every town.
    var need = [];
    for (var q = 0; q < n; q++) {
      var lq = left[q], rq = right[q];
      var ly = groundAt(frame, lq.x, lq.z, lift), ry = groundAt(frame, rq.x, rq.z, lift);
      var lo = groundAt(frame, lq.x + (lq.x - pts[q].x) * 0.22, lq.z + (lq.z - pts[q].z) * 0.22, 0);
      var ro = groundAt(frame, rq.x + (rq.x - pts[q].x) * 0.22, rq.z + (rq.z - pts[q].z) * 0.22, 0);
      need.push({ l: lo > ly - 0.08, r: ro > ry - 0.08, ly: ly, ry: ry });
    }
    for (var t2 = 0; t2 < n - 1; t2++) {
      var a2 = need[t2], b2 = need[t2 + 1];
      if (a2.l || b2.l) skirtQuad(out, left[t2], a2.ly, left[t2 + 1], b2.ly, tone, surface, lanes, 0.02);
      if (a2.r || b2.r) skirtQuad(out, right[t2], a2.ry, right[t2 + 1], b2.ry, tone, surface, lanes, 0.98);
    }
  }

  // One hanging quad under a stretch of kerb.
  function skirtQuad(out, p0, y0, p1, y1, tone, surface, lanes, v) {
    var b = out.pos.length / 3;
    out.pos.push(p0.x, y0, p0.z, p0.x, y0 - SKIRT, p0.z,
                 p1.x, y1, p1.z, p1.x, y1 - SKIRT, p1.z);
    for (var i = 0; i < 4; i++) {
      out.uv.push(0, v);
      out.tone.push(tone);
      out.rinfo.push(surface || 0, lanes || 2);
    }
    // Both windings, because which way a kerb faces depends on which side of
    // the road it is and the culling rule is global.
    out.idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    out.idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  var SKIRT = 0.55;   // metres of kerb face hanging below the carriageway

  // Ear clipping. Building footprints and lakes are small, simple polygons, so
  // an O(n²) clip is far cheaper than the code to do better.
  function triangulate(poly) {
    var n = poly.length;
    if (n < 3) return [];
    var idx = [], v = [];
    for (var i = 0; i < n; i++) v.push(i);
    // Orientation: work counter-clockwise so the ear test has one sign.
    var area = 0;
    for (var j = 0; j < n; j++) {
      var p = poly[j], q = poly[(j + 1) % n];
      area += p.x * q.z - q.x * p.z;
    }
    if (area < 0) v.reverse();

    function cross(a, b, c) { return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x); }
    function inside(a, b, c, p) {
      return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
    }

    var guard = 0;
    while (v.length > 3 && guard++ < n * n) {
      var clipped = false;
      for (var k = 0; k < v.length; k++) {
        var i0 = v[(k + v.length - 1) % v.length], i1 = v[k], i2 = v[(k + 1) % v.length];
        var a = poly[i0], b = poly[i1], c = poly[i2];
        if (cross(a, b, c) <= 0) continue;              // reflex, not an ear
        var ok = true;
        for (var m = 0; m < v.length; m++) {
          var vi = v[m];
          if (vi === i0 || vi === i1 || vi === i2) continue;
          if (inside(a, b, c, poly[vi])) { ok = false; break; }
        }
        if (!ok) continue;
        // Reversed: the ear test runs in the (x, z) plane, where a
        // counter-clockwise triangle faces DOWN once y is up. Emitting them
        // reversed means every roof and lake faces the sky, which is the only
        // way they survive back-face culling.
        idx.push(i2, i1, i0);
        v.splice(k, 1);
        clipped = true;
        break;
      }
      if (!clipped) break;                              // degenerate; take what we have
    }
    if (v.length === 3) idx.push(v[2], v[1], v[0]);
    return idx;
  }

  function toWorld(frame, flat) {
    var pts = [];
    for (var i = 0; i < flat.length; i += 2) pts.push(frame.toWorld(flat[i], flat[i + 1]));
    return pts;
  }

  // ---- scenery -------------------------------------------------------------
  // OSM knows where the woods are, but asking for them is a whole extra layer
  // in every Overpass query — on donated infrastructure, for scenery. So the
  // trees are GROWN instead: a deterministic scatter over the tile, rejected
  // wherever the world already has something (road, building, water, cliff).
  //
  // Deterministic matters. The hash is over the world position, so a tile
  // rebuilt after the frame re-pins grows the SAME wood in the SAME place —
  // otherwise every re-pin would replant the countryside in front of you.
  //
  // This is the biggest single thing the app can do for the look of a place
  // with no satellite drape, because bare heightfield green is exactly what a
  // landscape does not look like. It is also why it is one static mesh per
  // tile: 300 trees as 300 draw calls would cost more than everything else in
  // the frame put together.
  var TREE_STEP = 34;          // metres between candidate sites
  var TREE_MAX = 240;          // per tile — a hard ceiling on bytes AND on fill
  var TREE_CLEAR = 4.0;        // metres of clearance from a carriageway edge

  function hash2(x, z) {
    var h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return h - Math.floor(h);
  }

  // A cone on a stick. Eight triangles for the canopy, four for the trunk, and
  // at any distance you actually see one from a car that is enough — the shape
  // and the colour do the work, not the polygon count.
  function tree(x, base, z, h, r, tint, out) {
    var trunkR = Math.max(0.12, r * 0.13), trunkH = h * 0.34;
    var bark = [0.26, 0.20, 0.15];
    var v0 = out.pos.length / 3;
    var i, ang, nx, nz;
    for (i = 0; i < 4; i++) {
      ang = i * Math.PI / 2 + 0.4;
      nx = Math.cos(ang); nz = Math.sin(ang);
      out.pos.push(x + nx * trunkR, base, z + nz * trunkR);
      out.pos.push(x + nx * trunkR, base + trunkH, z + nz * trunkR);
      out.nrm.push(nx, 0, nz, nx, 0, nz);
      out.col.push(bark[0], bark[1], bark[2], bark[0], bark[1], bark[2]);
    }
    for (i = 0; i < 4; i++) {
      var a = v0 + i * 2, b = a + 1, c = v0 + ((i + 1) % 4) * 2, d = c + 1;
      out.idx.push(a, c, b, b, c, d);
    }
    // Canopy: two stacked rings pinched to a point, which reads as a broadleaf
    // crown from the side and as a blob from above — both of which are right.
    var ringY = [base + trunkH * 0.75, base + h * 0.62], ringR = [r, r * 0.66];
    var rings = [];
    for (var ri = 0; ri < 2; ri++) {
      var start = out.pos.length / 3;
      for (i = 0; i < 6; i++) {
        ang = i * Math.PI / 3;
        nx = Math.cos(ang); nz = Math.sin(ang);
        out.pos.push(x + nx * ringR[ri], ringY[ri], z + nz * ringR[ri]);
        out.nrm.push(nx * 0.7, 0.35, nz * 0.7);
        // Every leaf face slightly its own colour, so a wood is not one flat
        // green shape with a hole cut in the sky.
        var j = hash2(x + i * 3.1, z + ri * 7.7) * 0.18 - 0.09;
        out.col.push(tint[0] + j, tint[1] + j * 0.8, tint[2] + j * 0.5);
      }
      rings.push(start);
    }
    var apex = out.pos.length / 3;
    out.pos.push(x, base + h, z);
    out.nrm.push(0, 1, 0);
    out.col.push(tint[0] * 1.12, tint[1] * 1.12, tint[2] * 1.12);
    for (i = 0; i < 6; i++) {
      var i2 = (i + 1) % 6;
      out.idx.push(rings[0] + i, rings[1] + i2, rings[0] + i2);
      out.idx.push(rings[0] + i, rings[1] + i, rings[1] + i2);
      out.idx.push(rings[1] + i, apex, rings[1] + i2);
    }
  }

  function scatter(frame, tile, geom, roadIndex, wallIndex) {
    var out = { pos: [], nrm: [], col: [], idx: [] };
    // Trunks, as collidable segments and as shadow casters. A tree you can
    // drive through is scenery; a tree you cannot is a hazard, and the whole
    // point of putting them beside a road is that leaving the road costs
    // something.
    var trunks = [], shade = [];
    if (!tile) return { mesh: pack(out, ['pos', 'nrm', 'col']), trunks: trunks, shade: shade };
    var b = root.Geo.tileBounds(tile.z, tile.x, tile.y);
    var c1 = frame.toWorld(b.north, b.west), c2 = frame.toWorld(b.south, b.east);
    var x0 = Math.min(c1.x, c2.x), x1 = Math.max(c1.x, c2.x);
    var z0 = Math.min(c1.z, c2.z), z1 = Math.max(c1.z, c2.z);
    var planted = 0;
    var probe = [];

    for (var gx = Math.floor(x0 / TREE_STEP); gx * TREE_STEP < x1 && planted < TREE_MAX; gx++) {
      for (var gz = Math.floor(z0 / TREE_STEP); gz * TREE_STEP < z1 && planted < TREE_MAX; gz++) {
        var r1 = hash2(gx, gz), r2 = hash2(gx + 91.3, gz - 47.9), r3 = hash2(gx * 1.7, gz * 2.3 + 5.1);
        // Clumping: trees come in copses, and a uniform scatter is the one
        // arrangement no landscape on Earth has.
        var clump = hash2(Math.floor(gx / 4) * 3.7, Math.floor(gz / 4) * 5.9);
        if (r3 > 0.20 + clump * 0.72) continue;
        var x = (gx + r1) * TREE_STEP, z = (gz + r2) * TREE_STEP;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;

        var road = nearestRoad(roadIndex, x, z);
        if (road && road.dist < road.halfWidth + TREE_CLEAR) continue;
        probe.length = 0;
        nearWalls(wallIndex, x, z, probe);
        var blocked = false;
        for (var w = 0; w < probe.length; w += 4) {
          // Anything within a few metres of a footprint edge is a courtyard, a
          // pavement or the inside of the building itself.
          if (segDist(x, z, probe[w], probe[w + 1], probe[w + 2], probe[w + 3]) < 5) { blocked = true; break; }
        }
        if (blocked) continue;

        var y = root.Terrain.heightAt(frame, x, z);
        if (y === null) { groundMisses++; continue; }   // not loaded — the tile is a guess
        if (y < 0.6) continue;                          // in the sea
        // No trees on a cliff: sample the slope the same way the car does.
        var yn = root.Terrain.heightAt(frame, x + 6, z), ye = root.Terrain.heightAt(frame, x, z + 6);
        if (yn !== null && ye !== null && Math.max(Math.abs(yn - y), Math.abs(ye - y)) > 4.2) continue;

        var h = 5.5 + r1 * 7.5, rad = 1.7 + r2 * 2.1;
        // Conifer above the treeline-ish, broadleaf below, and a few dying back
        // to autumn either way.
        var conifer = y > 900 || r3 < 0.06;
        var tint = conifer ? [0.16 + r1 * 0.05, 0.30 + r2 * 0.07, 0.20 + r1 * 0.05]
                           : [0.22 + r2 * 0.14, 0.38 + r1 * 0.12, 0.16 + r2 * 0.08];
        if (r2 > 0.93) tint = [0.52, 0.40, 0.16];       // one in fifteen has turned
        var th = conifer ? h * 1.25 : h, tr = conifer ? rad * 0.62 : rad;
        tree(x, y, z, th, tr, tint, out);
        // The trunk as a small square of wall segments. A single segment would
        // be a flat plank the car can slide along the edge of; four make a post
        // that pushes you out whichever way you hit it.
        var tw = Math.max(0.22, tr * 0.14);
        trunks.push(x - tw, z - tw, x + tw, z - tw,
                    x + tw, z - tw, x + tw, z + tw,
                    x + tw, z + tw, x - tw, z + tw,
                    x - tw, z + tw, x - tw, z - tw);
        shade.push(x, y, z, tr, th);
        planted++;
      }
    }
    return { mesh: pack(out, ['pos', 'nrm', 'col']), trunks: trunks, shade: shade };
  }

  // ---- shadows, baked -------------------------------------------------------
  // A shadow map is the honest way to do this and it is the wrong trade here:
  // a depth pass over the whole world every frame, on a phone, for a sun that
  // NEVER MOVES. Static sun, static geometry — so the shadows are computed once
  // per tile at build time and drawn as flat dark polygons lying on the ground.
  // Zero per-frame cost beyond the fill.
  //
  // The shape of a shadow is the Minkowski sum of the footprint and the segment
  // the sun sweeps it along, which for a convex footprint is exactly the convex
  // hull of the footprint and its translated copy. That matters for a reason
  // that is not aesthetics: OVERLAPPING translucent polygons double-darken, so
  // a shadow drawn as "footprint + swept quads" gets a visible dark seam down
  // the middle. One convex hull per building has no overlap at all.
  // ABOVE THE ROAD, not merely above the terrain. Road ribbons are laid at
  // terrain + 0.18 so they do not z-fight with the ground; a shadow lifted only
  // 0.14 is therefore four centimetres UNDER the tarmac, the depth test hides
  // it, and shadows stop dead at the kerb — which is exactly what they did.
  // 0.30 clears the carriageway by 12 cm and is still far too small a step to
  // read as a floating decal on open ground.
  var ROAD_LIFT = 0.18;
  // Above the HIGHEST road: junction z-fighting is settled by lifting each road
  // a millimetre per class rank, so the tallest carriageway sits at
  // ROAD_LIFT + 6 * 0.012. A shadow at 0.30 would sink under a motorway.
  var SHADOW_LIFT = 0.36;

  function hull(pts) {
    if (pts.length < 3) return pts;
    var p = pts.slice().sort(function (a, b) { return a.x === b.x ? a.z - b.z : a.x - b.x; });
    var cross = function (o, a, b) { return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x); };
    var lower = [], upper = [], i;
    for (i = 0; i < p.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p[i]) <= 0) lower.pop();
      lower.push(p[i]);
    }
    for (i = p.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0) upper.pop();
      upper.push(p[i]);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  // One convex polygon, as a fan, with every vertex dropped onto the terrain.
  function shadowFan(frame, ring, out) {
    if (ring.length < 3) return;
    var v0 = out.pos.length / 3;
    for (var i = 0; i < ring.length; i++) {
      out.pos.push(ring[i].x, groundAt(frame, ring[i].x, ring[i].z, SHADOW_LIFT), ring[i].z);
    }
    for (var t = 1; t + 1 < ring.length; t++) out.idx.push(v0, v0 + t, v0 + t + 1);
  }

  // Two meshes, not one: tree shadows have to be dropped at exactly the same
  // distance as the trees themselves, or the far hillside is covered in shadows
  // with nothing standing in them.
  function buildShadows(frame, geom, trees) {
    var out = { pos: [], idx: [] }, twig = { pos: [], idx: [] };
    var sun = root.Render && root.Render.sun ? root.Render.sun() : [0.45, 0.78, 0.30];
    // How far a metre of height throws its shadow, and in which direction.
    var reach = Math.min(4.0, 1 / Math.max(0.18, sun[1]));
    var dx = -sun[0] * reach, dz = -sun[2] * reach;

    for (var b = 0; b < geom.bld.length; b++) {
      var poly = toWorld(frame, geom.bld[b][1]);
      if (poly.length > 2 && poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
      if (poly.length < 3) continue;
      var h = geom.bld[b][0];
      var pts = [];
      for (var i = 0; i < poly.length; i++) {
        pts.push(poly[i]);
        pts.push({ x: poly[i].x + dx * h, z: poly[i].z + dz * h });
      }
      shadowFan(frame, hull(pts), out);
    }

    // Trees: the same sweep, but the caster is a disc rather than a footprint,
    // so a hexagon at the trunk and a hexagon at the cast position is plenty.
    for (var t = 0; t < trees.length; t += 5) {
      var tx = trees[t], ty = trees[t + 1], tz = trees[t + 2];
      var rad = trees[t + 3], th = trees[t + 4];
      var ring = [];
      for (var k = 0; k < 6; k++) {
        var a = k * Math.PI / 3;
        var ox = Math.cos(a) * rad * 0.85, oz = Math.sin(a) * rad * 0.85;
        ring.push({ x: tx + ox, z: tz + oz });
        ring.push({ x: tx + ox + dx * th * 0.75, z: tz + oz + dz * th * 0.75 });
      }
      shadowFan(frame, hull(ring), twig);
    }
    return { buildings: pack(out, ['pos']), trees: pack(twig, ['pos']) };
  }

  function tileCentre(frame, tile) {
    if (!tile) return null;
    var b = root.Geo.tileBounds(tile.z, tile.x, tile.y);
    return frame.toWorld((b.north + b.south) / 2, (b.west + b.east) / 2);
  }

  function segDist(x, z, ax, az, bx, bz) {
    var vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz;
    var t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
    return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
  }

  // Build all four meshes for one tile's geometry.
  function build(frame, geom, tile) {
    groundMisses = 0;
    var roads = { pos: [], uv: [], tone: [], rinfo: [], idx: [] };
    var paths = [];
    for (var i = 0; i < geom.ways.length; i++) {
      var cls = ROAD_CLASS[geom.ways[i][0]];
      if (!cls) continue;
      // [2] surface, [3] lanes — absent on a tile cached before they were
      // parsed, which reads as sealed and unstated, i.e. exactly the old
      // behaviour. Old caches keep working and improve as they refresh.
      var surf = geom.ways[i][2] || 0, lanes = geom.ways[i][3] || 0;
      // A tagged lane count beats the class width: a six-lane primary and a
      // two-lane primary are the same OSM class and very much not the same road.
      var width = lanes ? Math.max(cls.w * 0.6, lanes * 3.3) : cls.w;
      var pts = toWorld(frame, geom.ways[i][1]);
      // INTERSECTIONS. Two ways crossing lay two ribbons at the same height on
      // the same ground, and coplanar geometry is the one thing a depth buffer
      // cannot resolve — junctions were a mess of flickering triangles with the
      // markings of both roads fighting through each other. A millimetre of
      // lift per class rank settles it, permanently and in the right order: the
      // bigger road runs THROUGH the junction and the smaller one stops at it,
      // which is also how the give-way works in real life.
      ribbon(frame, densify(pts, ROAD_STEP), width / 2, ROAD_LIFT + cls.rank * 0.012, roads,
             cls.tone, surf, lanes || Math.max(1, Math.round(cls.w / 3.4)));
      // Keep the world-space polyline: traffic drives along it. It is already
      // computed for the ribbon, so this costs a reference rather than the
      // work, and it means traffic needs no road graph of its own. Real roads
      // only — nobody commutes down a farm track, and a service alley full of
      // cars looks like a car park that has escaped.
      if (cls.rank >= 2 && pts.length >= 2) {
        paths.push({ pts: pts, cruise: cls.cruise, half: width / 2, surface: surf,
                     name: geom.ways[i][4] || '' });
      }
    }

    // binfo carries (baseY, seed, class) per vertex: the shader needs the building's
    // own ground level to lay out floors, and a stable per-building seed so a
    // street is not one uniform grey. Neither can be derived in the fragment
    // stage — world Y alone cannot tell a ground floor from a fifth floor on a
    // hill, which is exactly how a terrace ends up with staggered windows.
    var walls = { pos: [], nrm: [], tone: [], binfo: [], idx: [] };
    for (var b = 0; b < geom.bld.length; b++) {
      // [2] is the class, and a tile cached before classes existed simply has
      // no third element — undefined becomes UNKNOWN and the size heuristic in
      // extrude() picks it up. Old caches upgrade themselves; nobody has to
      // clear anything.
      extrude(frame, toWorld(frame, geom.bld[b][1]), geom.bld[b][0], walls,
              geom.bld[b][2] || 0, geom.bld[b][3] || 0);
    }

    var water = { pos: [], idx: [] };
    for (var w = 0; w < geom.wat.length; w++) {
      var poly = toWorld(frame, geom.wat[w]);
      if (poly.length > 2 && poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
      var tris = triangulate(poly);
      var base = water.pos.length / 3;
      // Water sits at the lowest ground under its own outline, so a lake reads
      // as filling a basin rather than draped over one.
      var low = Infinity;
      for (var pi = 0; pi < poly.length; pi++) low = Math.min(low, groundAt(frame, poly[pi].x, poly[pi].z, 0));
      if (!isFinite(low)) low = 0;
      for (var pj = 0; pj < poly.length; pj++) water.pos.push(poly[pj].x, low + 0.3, poly[pj].z);
      for (var ti = 0; ti < tris.length; ti++) water.idx.push(base + tris[ti]);
    }

    // The road index and a buildings-only wall index come FIRST, because the
    // scatter asks both of them where it may not plant. The wall index is then
    // rebuilt WITH the trunks in it, so the car collides with trees through
    // exactly the same path it collides with buildings — one collision system,
    // not two. Bucketing a few hundred segments twice is microseconds at tile
    // build time and it keeps the ordering honest.
    var roadIndex = buildIndex(frame, geom);
    var wallIndex = buildWallIndex(frame, geom);
    var scenery = root.Sources.current.quality === 'normal'
      ? scatter(frame, tile, geom, roadIndex, wallIndex) : null;
    if (scenery && scenery.trunks.length) wallIndex = buildWallIndex(frame, geom, scenery.trunks);
    var shadows = buildShadows(frame, geom, scenery ? scenery.shade : []);

    return {
      roads: pack(roads, ['pos', 'uv', 'tone', 'rinfo']),
      buildings: pack(walls, ['pos', 'nrm', 'tone', 'binfo']),
      water: pack(water, ['pos']),
      trees: scenery ? scenery.mesh : null,
      shadows: shadows.buildings,
      treeShadows: shadows.trees,
      // Where this tile sits, so the draw loop can drop DISTANT scenery without
      // rebuilding anything. Trees are the most numerous thing in the world and
      // the ones a kilometre away are a green haze the fog eats anyway.
      centre: tileCentre(frame, tile),
      paths: paths,
      index: roadIndex,
      walls: wallIndex,
      // How many ground samples had no terrain under them. Zero means every
      // vertex stands on real ground; anything else means parts of this tile
      // are a guess pinned at y≈0 and it should be REBUILT when more terrain
      // arrives — see buildPending in app.js.
      incomplete: groundMisses,
    };
  }

  // ---- building walls, for collision --------------------------------------
  // Same bucketing trick as the road index, over the footprint EDGES. A city
  // tile can hold a thousand buildings and the car needs an answer every frame,
  // so the only thing a query may touch is the handful of edges in its own cell
  // and the eight around it.
  function buildWallIndex(frame, geom, extra) {
    var segs = [], map = Object.create(null);
    // Anything else that is solid, as flat [x1,z1,x2,z2,…] — tree trunks, so
    // far. Stamped into the same buckets, so nearWalls answers for them without
    // knowing they are not buildings.
    if (extra) {
      for (var e = 0; e + 3 < extra.length; e += 4) {
        var ei = segs.length / 4;
        segs.push(extra[e], extra[e + 1], extra[e + 2], extra[e + 3]);
        var ex0 = Math.floor(Math.min(extra[e], extra[e + 2]) / CELL);
        var ex1 = Math.floor(Math.max(extra[e], extra[e + 2]) / CELL);
        var ez0 = Math.floor(Math.min(extra[e + 1], extra[e + 3]) / CELL);
        var ez1 = Math.floor(Math.max(extra[e + 1], extra[e + 3]) / CELL);
        for (var ecx = ex0; ecx <= ex1; ecx++) for (var ecz = ez0; ecz <= ez1; ecz++) {
          var ek = ecx + ',' + ecz;
          (map[ek] || (map[ek] = [])).push(ei);
        }
      }
    }
    for (var b = 0; b < geom.bld.length; b++) {
      var poly = toWorld(frame, geom.bld[b][1]);
      if (poly.length > 2 && poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
      if (poly.length < 3) continue;
      for (var i = 0; i < poly.length; i++) {
        var a = poly[i], c = poly[(i + 1) % poly.length];
        var idx = segs.length / 4;
        segs.push(a.x, a.z, c.x, c.z);
        var x0 = Math.floor(Math.min(a.x, c.x) / CELL), x1 = Math.floor(Math.max(a.x, c.x) / CELL);
        var z0 = Math.floor(Math.min(a.z, c.z) / CELL), z1 = Math.floor(Math.max(a.z, c.z) / CELL);
        for (var cx = x0; cx <= x1; cx++) for (var cz = z0; cz <= z1; cz++) {
          var k = cx + ',' + cz;
          (map[k] || (map[k] = [])).push(idx);
        }
      }
    }
    return { segs: new Float32Array(segs), map: map, cell: CELL };
  }

  // Every wall edge whose cell neighbourhood contains (x, z). Returns a flat
  // array [x1,z1,x2,z2, …] because the caller runs it per frame and an array of
  // objects here would be a per-frame allocation storm.
  function nearWalls(index, x, z, out) {
    if (!index) return out;
    var cx = Math.floor(x / index.cell), cz = Math.floor(z / index.cell);
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      var list = index.map[(cx + dx) + ',' + (cz + dz)];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var o = list[i] * 4;
        out.push(index.segs[o], index.segs[o + 1], index.segs[o + 2], index.segs[o + 3]);
      }
    }
    return out;
  }

  // ---- "am I on tarmac?" ---------------------------------------------------
  // The car needs this every frame, and a city tile holds thousands of segments,
  // so a linear scan is out. Segments are bucketed into a coarse uniform grid at
  // BUILD time (once per tile) and the query looks only at the car's own cell
  // and its eight neighbours — a couple of dozen segments instead of thousands.
  var STRIDE = 8;  // x1,z1,x2,z2,halfWidth,cruise,surface,nameId
  var CELL = 64;   // metres; comfortably larger than the longest reasonable step

  function buildIndex(frame, geom) {
    var segs = [], map = Object.create(null);
    // Names live in a per-tile table and the segments carry an INDEX into it.
    // A Float32Array cannot hold a string, and interning them means the answer
    // to "what road is this" is one array lookup rather than a string compare.
    var names = [''], nameOf = Object.create(null);
    function cellKey(cx, cz) { return cx + ',' + cz; }
    for (var w = 0; w < geom.ways.length; w++) {
      var cls = ROAD_CLASS[geom.ways[w][0]];
      if (!cls) continue;
      var pts = toWorld(frame, geom.ways[w][1]);
      var surf = geom.ways[w][2] || 0;
      var lanes = geom.ways[w][3] || 0;
      var half = (lanes ? Math.max(cls.w * 0.6, lanes * 3.3) : cls.w) / 2;
      var nm = geom.ways[w][4] || '';
      var nameId = 0;
      if (nm) {
        if (nameOf[nm] === undefined) { nameOf[nm] = names.length; names.push(nm); }
        nameId = nameOf[nm];
      }
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1];
        var idx = segs.length / STRIDE;
        // The same half width the RIBBON was built with, or "am I on tarmac"
        // answers about a road of a different size from the one being drawn.
        segs.push(a.x, a.z, b.x, b.z, half, cls.cruise, surf, nameId);
        // Stamp the segment into every cell its bounding box touches, so a long
        // segment is found from anywhere along it.
        var x0 = Math.floor(Math.min(a.x, b.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x) / CELL);
        var z0 = Math.floor(Math.min(a.z, b.z) / CELL), z1 = Math.floor(Math.max(a.z, b.z) / CELL);
        for (var cx = x0; cx <= x1; cx++) for (var cz = z0; cz <= z1; cz++) {
          var k = cellKey(cx, cz);
          (map[k] || (map[k] = [])).push(idx);
        }
      }
    }
    return { segs: new Float32Array(segs), map: map, cell: CELL, names: names };
  }

  // Every DISTINCT named road within a radius, nearest first. This is what
  // makes a junction announce itself: the road you are on is one name, and a
  // side street you are passing is another one that was not there a moment ago.
  // Same bucket walk as nearestRoad, so it costs the same couple of dozen
  // segment tests.
  function namesNear(index, x, z, radius, out) {
    if (!index || !index.names) return out;
    var cx = Math.floor(x / index.cell), cz = Math.floor(z / index.cell);
    var r2 = radius * radius;
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      var list = index.map[(cx + dx) + ',' + (cz + dz)];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var o = list[i] * STRIDE;
        var id = index.segs[o + 7];
        if (!id) continue;
        var ax = index.segs[o], az = index.segs[o + 1];
        var bx = index.segs[o + 2], bz = index.segs[o + 3];
        var vx = bx - ax, vz = bz - az;
        var len2 = vx * vx + vz * vz;
        var t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
        var px = ax + vx * t - x, pz = az + vz * t - z;
        var d2 = px * px + pz * pz;
        if (d2 > r2) continue;
        var name = index.names[id];
        var seen = false;
        for (var k = 0; k < out.length; k++) {
          if (out[k].name === name) { seen = true; if (d2 < out[k].d2) out[k].d2 = d2; break; }
        }
        if (!seen) out.push({ name: name, d2: d2, x: ax + vx * t, z: az + vz * t });
      }
    }
    return out;
  }

  // Perpendicular distance from (x,z) to the nearest carriageway, and that
  // road's half width. Returns null when this tile has nothing near.
  function nearestRoad(index, x, z) {
    if (!index) return null;
    var cx = Math.floor(x / index.cell), cz = Math.floor(z / index.cell);
    var best = Infinity, bestHalf = 0, bestCruise = 14, bestSurf = 0, bestName = 0;
    var bestX = 0, bestZ = 0, bestVX = 0, bestVZ = 1;
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      var list = index.map[(cx + dx) + ',' + (cz + dz)];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var o = list[i] * STRIDE;
        var ax = index.segs[o], az = index.segs[o + 1];
        var bx = index.segs[o + 2], bz = index.segs[o + 3];
        var vx = bx - ax, vz = bz - az;
        var len2 = vx * vx + vz * vz;
        var t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
        var px = ax + vx * t, pz = az + vz * t;
        var d = Math.hypot(x - px, z - pz);
        if (d < best) {
          best = d; bestHalf = index.segs[o + 4]; bestCruise = index.segs[o + 5];
          bestSurf = index.segs[o + 6];
          bestName = index.segs[o + 7];
          // The POINT, not just the distance. The wildlife walks toward the
          // nearest carriageway to cross it, and the unstick rescue puts the
          // car back down on it — both need somewhere to aim, and recomputing
          // it in the caller would mean walking the index twice.
          bestX = px; bestZ = pz;
          bestVX = vx; bestVZ = vz;
        }
      }
    }
    return best === Infinity ? null
      : { dist: best, halfWidth: bestHalf, cruise: bestCruise, surface: bestSurf,
          name: (index.names && index.names[bestName]) || '',
          x: bestX, z: bestZ, dx: bestVX, dz: bestVZ };
  }

  // Push every corner radially away from the centroid. Not a true polygon
  // offset — a true one needs edge intersections and mitre limits — but for the
  // convex-ish rectangles buildings actually are, it is the same answer.
  function outset(poly, d) {
    var cx = cxOf(poly), cz = czOf(poly), out = [];
    for (var i = 0; i < poly.length; i++) {
      var dx = poly[i].x - cx, dz = poly[i].z - cz, l = Math.hypot(dx, dz) || 1;
      out.push({ x: poly[i].x + dx / l * d, z: poly[i].z + dz / l * d });
    }
    return out;
  }

  function cxOf(poly) { var t = 0; for (var i = 0; i < poly.length; i++) t += poly[i].x; return t / poly.length; }
  function czOf(poly) { var t = 0; for (var i = 0; i < poly.length; i++) t += poly[i].z; return t / poly.length; }

  // A square column between two heights — chimneys, and nothing else so far.
  function stack(out, x, z, r, y0, y1, base, seed, cls) {
    var c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (var i = 0; i < 4; i++) {
      var a = c[i], b = c[(i + 1) % 4];
      var nx = (a[0] + b[0]) / 2, nz = (a[1] + b[1]) / 2;
      var v0 = out.pos.length / 3;
      out.pos.push(x + a[0] * r, y0, z + a[1] * r, x + b[0] * r, y0, z + b[1] * r,
                   x + a[0] * r, y1, z + a[1] * r, x + b[0] * r, y1, z + b[1] * r);
      for (var k = 0; k < 4; k++) { out.nrm.push(nx, 0, nz); out.tone.push(0.62); out.binfo.push(base, seed, cls); }
      out.idx.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
    }
    var t0 = out.pos.length / 3;
    for (var q = 0; q < 4; q++) {
      out.pos.push(x + c[q][0] * r, y1, z + c[q][1] * r);
      out.nrm.push(0, 1, 0); out.tone.push(0.55); out.binfo.push(base, seed, cls);
    }
    out.idx.push(t0, t0 + 2, t0 + 1, t0, t0 + 3, t0 + 2);
  }

  // The roof, as a RIDGE rather than a point. An apex over the centroid gives
  // every house a pyramid, and a street of pyramids is a street of tents — real
  // roofs run a ridge along the long axis and hip or gable at the ends. The
  // ridge is a segment through the centroid along the footprint's long axis;
  // collapse it to zero length and this is the old pyramid, which is still the
  // right answer for a square plan.
  function roofOver(poly, base, top, ridge, seed, tone, out) {
    var cx = cxOf(poly), cz = czOf(poly);
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (var q = 0; q < poly.length; q++) {
      minX = Math.min(minX, poly[q].x); maxX = Math.max(maxX, poly[q].x);
      minZ = Math.min(minZ, poly[q].z); maxZ = Math.max(maxZ, poly[q].z);
    }
    var spanX = maxX - minX, spanZ = maxZ - minZ;
    var alongX = spanX >= spanZ;
    var long = alongX ? spanX : spanZ, short = alongX ? spanZ : spanX;
    // GABLE or HIP, by the building's own seed. Both are common, and a street
    // where every roof is hipped looks as manufactured as one where every roof
    // is a pyramid.
    var gable = seed > 0.5;
    var half = gable ? long / 2 : Math.max(0, (long - short) / 2);
    var ax = alongX ? cx - half : cx, az = alongX ? cz : cz - half;
    var bx = alongX ? cx + half : cx, bz = alongX ? cz : cz + half;

    for (var e = 0; e < poly.length; e++) {
      var p0 = poly[e], p1 = poly[(e + 1) % poly.length];
      var mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2;
      // Each eave runs up to whichever end of the ridge is nearer.
      var da = (mx - ax) * (mx - ax) + (mz - az) * (mz - az);
      var db = (mx - bx) * (mx - bx) + (mz - bz) * (mz - bz);
      var rx = da < db ? ax : bx, rz = da < db ? az : bz;
      var ex = p1.x - p0.x, ez = p1.z - p0.z, el = Math.hypot(ex, ez) || 1;
      var ox = ez / el, oz = -ex / el;              // outward, horizontal
      var slope = Math.hypot(rx - mx, rz - mz) || 1;
      var hyp = Math.hypot(slope, ridge);
      var r0 = out.pos.length / 3;
      out.pos.push(p0.x, top, p0.z, p1.x, top, p1.z, rx, top + ridge, rz);
      for (var k = 0; k < 3; k++) {
        out.nrm.push(ox * slope / hyp, ridge / hyp, oz * slope / hyp);
        out.tone.push(tone + 0.05);
        out.binfo.push(base, seed, 8);            // 8 = tile, never a wall
      }
      out.idx.push(r0, r0 + 2, r0 + 1);
    }
  }

  function extrude(frame, poly, height, out, cls, brand) {
    if (poly.length < 3) return;
    if (poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
    if (poly.length < 3) return;
    // OSM building ways come in both windings, and the wall normal is derived
    // from edge direction — so half of every city would face inward and vanish.
    // Normalise to positive signed area first; then the per-edge normal below
    // is reliably outward.
    var signed = 0;
    for (var s = 0; s < poly.length; s++) {
      var pa = poly[s], pb = poly[(s + 1) % poly.length];
      signed += pa.x * pb.z - pb.x * pa.z;
    }
    if (signed < 0) poly.reverse();
    // One ground height for the whole footprint: a building does not follow the
    // hill, it sits on it (and per-corner heights make walls visibly skew).
    var base = Infinity;
    for (var i = 0; i < poly.length; i++) base = Math.min(base, groundAt(frame, poly[i].x, poly[i].z, 0));
    if (!isFinite(base)) base = 0;
    var top = base + height;
    var tone = 0.5 + Math.min(0.35, height / 160);
    // A stable seed from the footprint's first corner — same building, same
    // colour, every time it is rebuilt after a re-pin.
    var seed = Math.abs(Math.sin(poly[0].x * 12.9898 + poly[0].z * 78.233) * 43758.5453) % 1;
    // The brand's sign colour rides in the INTEGER part of the same float. The
    // shader has always read this component as fract(), so the whole integer
    // range was sitting there unused — which is why a brand needs no new vertex
    // attribute, no change to the packed mesh format and no cache migration.
    // Only a shopfront ever paints it, so carrying it on every vertex of every
    // building costs nothing.
    seed += (brand || 0);

    // `building=yes` is by far the commonest value in OSM and says nothing. But
    // the FOOTPRINT says plenty: 90 m² and two storeys is a house, 4000 m² and
    // two storeys is a shed, and 300 m² and eleven storeys is an office block.
    // Guessing from size is not as good as a tag, and it is far better than
    // painting a whole suburb as the same anonymous grey slab.
    var area = Math.abs(signed) / 2;
    if (!cls) {
      cls = (area < 440 && height <= 9) ? 1                       // HOUSE
          : (area > 1200 && height <= 12) ? 5                     // INDUSTRIAL: big and flat
          : (height >= 12) ? 4                                    // OFFICE: tall
          : 0;
    }
    // A pitched roof is the single loudest signal that a thing is a HOUSE, and
    // no amount of facade shading substitutes for it — a flat-topped box reads
    // as a block of flats at any size. Hipped from the footprint's centroid:
    // n triangles, correct for the rectangles most houses are, and merely a bit
    // fanciful on an L-shape, which is a trade worth taking at 50 km/h.
    var pitched = (cls === 1 || cls === 6 || cls === 7) && poly.length <= 12 && area < 900;
    var ridge = 0;
    if (pitched) {
      // Pitch scaled to the SHORT span, or a long terrace grows an alpine peak.
      var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (var q = 0; q < poly.length; q++) {
        minX = Math.min(minX, poly[q].x); maxX = Math.max(maxX, poly[q].x);
        minZ = Math.min(minZ, poly[q].z); maxZ = Math.max(maxZ, poly[q].z);
      }
      ridge = Math.max(1.2, Math.min(4.5, Math.min(maxX - minX, maxZ - minZ) * 0.32));
    }

    for (var e = 0; e < poly.length; e++) {
      var a = poly[e], b = poly[(e + 1) % poly.length];
      var dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      var nx = dz / len, nz = -dx / len;
      var v0 = out.pos.length / 3;
      out.pos.push(a.x, base, a.z, b.x, base, b.z, a.x, top, a.z, b.x, top, b.z);
      for (var k = 0; k < 4; k++) { out.nrm.push(nx, 0, nz); out.tone.push(tone); out.binfo.push(base, seed, cls); }
      out.idx.push(v0, v0 + 2, v0 + 1, v0 + 1, v0 + 2, v0 + 3);
    }

    if (pitched) {
      // EAVES. The roof oversails the walls by a third of a metre, which is the
      // difference between a house and a box with a lid on it — the shadow line
      // under an overhang is most of what the eye reads as "roof".
      roofOver(outset(poly, 0.34), base, top, ridge, seed, tone, out);
      // A chimney is four square metres of geometry and it is the second
      // loudest "this is a house" signal after the roof itself — a pitched box
      // with nothing on it still reads as a hut.
      if (seed > 0.22) {
        var chx = poly[0].x * 0.35 + cxOf(poly) * 0.65, chz = poly[0].z * 0.35 + czOf(poly) * 0.65;
        var chTop = top + ridge + 0.7 + seed * 0.5;
        stack(out, chx, chz, 0.28, top - 0.4, chTop, base, seed, 9);
      }
      return;
    }

    // Flat roof.
    var tris = triangulate(poly);
    var rbase = out.pos.length / 3;
    for (var r = 0; r < poly.length; r++) {
      out.pos.push(poly[r].x, top, poly[r].z);
      out.nrm.push(0, 1, 0);
      out.tone.push(tone + 0.08);
      out.binfo.push(base, seed, cls);
    }
    for (var t = 0; t < tris.length; t++) out.idx.push(rbase + tris[t]);
  }

  function pack(o, attrs) {
    var m = { count: o.idx.length };
    attrs.forEach(function (a) {
      var key = a === 'pos' ? 'positions' : a === 'nrm' ? 'normals'
              : a === 'uv' ? 'uvs' : a === 'col' ? 'colors' : a;
      m[key] = new Float32Array(o[a]);
    });
    m.indices = (o.pos.length / 3 > 65535) ? new Uint32Array(o.idx) : new Uint16Array(o.idx);
    return m;
  }

  root.Roads = {
    TILE_ZOOM: TILE_ZOOM,
    loadTile: loadTile, build: build, ROAD_CLASS: ROAD_CLASS, nearestRoad: nearestRoad,
    nearWalls: nearWalls, segDist: segDist, namesNear: namesNear,
    clearCache: function () {
      memory = {};
      return loadIndex().then(function () {
        var keys = Object.keys(index);
        index = {};
        return Promise.all(keys.map(function (k) { return db().delete('t' + k).catch(function () {}); }))
          .then(saveIndex);
      });
    },
    cacheSize: function () { return index ? Object.keys(index).length : 0; },
    // Pure decisions, exported so a suite can assert them directly. Guessing a
    // height and recognising a brand both have loud visual consequences and
    // neither is observable from the far end of build(), which only ever hands
    // back triangles — by then a two-storey house and a five-storey office are
    // the same array of numbers.
    heightOf: buildingHeight, brandOf: packBrand, areaOf: ringAreaM2,
  };
})(window);
