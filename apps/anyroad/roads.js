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
  // The disk cache is measured in BYTES, not tiles, because that is the thing
  // the player is actually being asked about ("how much offline map do you
  // want to keep?") and because a rural tile and a city tile differ by more
  // than an order of magnitude.
  //
  // Worth being clear what this budget is NOT: it has nothing to do with what
  // tanks a phone. This is parsed geometry in IndexedDB — disk, and cheap.
  // What costs is RESIDENCY: MAX_TERRAIN_TILES/MAX_ROAD_TILES in app.js bound
  // the tiles that hold GL buffers and get redrawn every frame, and those stay
  // capped however big this gets. Keeping three thousand tiles on disk costs a
  // phone nothing; drawing forty-nine of them costs it the frame rate.
  var CACHE_BUDGET = 8 * 1024 * 1024;      // default ~8 MB of offline map
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

  // ---- what is the ground actually MADE of? --------------------------------
  // Until now a tree's species was chosen by ALTITUDE — conifer above 900 m,
  // broadleaf below — which is a guess dressed as a rule, and it plants the
  // same Surrey oak in the Mojave. OSM has been carrying the answer the whole
  // time: `natural=wood`, `landuse=forest`, `natural=scrub`, and best of all
  // `leaf_type=broadleaved|needleleaved|mixed`, which NAMES the tree rather
  // than inferring it from height above sea level.
  //
  // Free, no key, properly typed, and it works for every player rather than
  // only the ones who set up imagery. Satellite can refine this later where OSM
  // is silent; it should not be the first source when a tag exists.
  //
  // `plant` is trees per candidate site (0..1), `bush` makes them low and wide,
  // and `leaf` is the default species where no leaf_type is tagged.
  var LAND = {
    wood:      { id: 1, plant: 0.95, leaf: 'mixed' },
    forest:    { id: 1, plant: 0.95, leaf: 'mixed' },
    scrub:     { id: 2, plant: 0.80, leaf: 'bush', bush: true },
    heath:     { id: 3, plant: 0.30, leaf: 'bush', bush: true },
    grassland: { id: 4, plant: 0.06, leaf: 'broad' },
    meadow:    { id: 4, plant: 0.06, leaf: 'broad' },
    grass:     { id: 4, plant: 0.05, leaf: 'broad' },
    village_green:     { id: 4, plant: 0.18, leaf: 'broad' },
    recreation_ground: { id: 4, plant: 0.12, leaf: 'broad' },
    park:      { id: 4, plant: 0.35, leaf: 'broad' },
    farmland:  { id: 5, plant: 0.02, leaf: 'broad' },
    orchard:   { id: 6, plant: 0.90, leaf: 'broad', orchard: true },
    vineyard:  { id: 6, plant: 0.55, leaf: 'bush', bush: true, orchard: true },
    residential: { id: 7, plant: 0.22, leaf: 'broad' },
    industrial:  { id: 8, plant: 0.04, leaf: 'broad' },
    retail:      { id: 8, plant: 0.04, leaf: 'broad' },
    commercial:  { id: 8, plant: 0.06, leaf: 'broad' },
    allotments:  { id: 9, plant: 0.10, leaf: 'bush', bush: true },
    // Ground that grows nothing. Named rather than merely absent, because
    // "no tag here" and "bare rock here" are different facts and only one of
    // them should suppress the fallback scatter.
    sand:      { id: 10, plant: 0 }, beach: { id: 10, plant: 0 },
    bare_rock: { id: 10, plant: 0 }, scree: { id: 10, plant: 0 },
    shingle:   { id: 10, plant: 0 }, glacier: { id: 10, plant: 0 },
    wetland:   { id: 11, plant: 0.05, leaf: 'bush', bush: true },
    quarry:    { id: 10, plant: 0 }, landfill: { id: 10, plant: 0 },
  };
  var LAND_KEYS = Object.keys(LAND);

  // leaf_type is the tag that actually names the species group.
  function leafOf(tags, dflt) {
    var lt = tags['leaf_type'];
    if (lt === 'needleleaved') return 'conifer';
    if (lt === 'broadleaved') return 'broad';
    if (lt === 'mixed') return 'mixed';
    return dflt || 'mixed';
  }

  function bboxOf(tile) {
    var b = root.Geo.tileBounds(tile.z, tile.x, tile.y);
    // Overpass wants south,west,north,east.
    return b.south + ',' + b.west + ',' + b.north + ',' + b.east;
  }

  // DETAIL LEVELS, shed cheapest-first when a tile is too expensive:
  //   2  roads + buildings + landcover + pools     (what you want)
  //   1  roads + buildings                         (drop the scenery data)
  //   0  roads only                                (last resort)
  //
  // This used to be a boolean, and that was a real bug the day landcover and
  // pools were added to it: the extra rings made the query heavier, more tiles
  // hit Overpass's cost ceiling, and the ONLY fallback threw away BUILDINGS —
  // so streets came back with no houses on them. Buildings are the thing you
  // actually look at; woodland polygons are not worth losing them for.
  function query(tile, detail) {
    var bb = bboxOf(tile);
    var parts = ['way["highway"~"^(' + Object.keys(ROAD_CLASS).join('|') + ')$"](' + bb + ');'];
    if (detail >= 1) {
      parts.push('way["building"](' + bb + ');');
    }
    if (detail >= 2) {
      // Landcover rides the SAME query and is dropped by the SAME fallback: a
      // tile dense enough to blow Overpass's budget on buildings would blow it
      // on woodland too, and two requests where one will do is the abuse the
      // per-IP policy exists to stop.
      parts.push('way["natural"~"^(' + LAND_KEYS.join('|') + ')$"](' + bb + ');');
      parts.push('way["landuse"~"^(' + LAND_KEYS.join('|') + ')$"](' + bb + ');');
      parts.push('way["leisure"~"^(park|garden|golf_course)$"](' + bb + ');');
      // SWIMMING POOLS. A pool is not natural=water — it is leisure=swimming_pool
      // — so the water query never saw one and gardens full of them came out dry.
      // Measured in Beverly Hills: 92 pools in a 900 m box, all leisure, median
      // 72 m². That is car-sized, which is what makes it a hazard worth having.
      parts.push('way["leisure"="swimming_pool"](' + bb + ');');
      parts.push('way["amenity"="swimming_pool"](' + bb + ');');
    }
    // WATER IS NOT ONE TAG, and asking only for natural=water is why a drive at
    // Niagara Falls had no river in it. The forms that matter:
    //   natural=water        the common area form (lakes, ponds, most of them)
    //   waterway=riverbank   how large rivers are still very widely mapped
    //   landuse=reservoir    a dammed body, in LAND under no key at all, so
    //                        nothing fetched it — not even the landcover clause
    // Cheap, same shape as the clauses above, and water is a HAZARD you can
    // drown in, so it stays at every detail level rather than being shed.
    parts.push('way["natural"="water"](' + bb + ');');
    parts.push('way["waterway"="riverbank"](' + bb + ');');
    parts.push('way["landuse"~"^(reservoir|basin)$"](' + bb + ');');
    // And the big ones are RELATIONS. A river or lake too large to be one closed
    // way is a multipolygon, and its member ways carry no water tag of their own
    // — so every clause above misses it and the largest water on earth was
    // invisible to this app. Behind detail>=1 because a relation costs more to
    // assemble and the last-resort level exists to keep roads coming at all.
    if (detail >= 1) {
      parts.push('relation["natural"="water"](' + bb + ');');
      parts.push('relation["waterway"="riverbank"](' + bb + ');');
    }
    return '[out:json][timeout:25];(' + parts.join('') + ');out geom;';
  }

  // ---- parse ---------------------------------------------------------------
  // Overpass `out geom` inlines each way's coordinates, so no node table to
  // resolve. Coordinates are rounded to 6 decimals (~0.1 m) — beyond that we
  // would be storing noise at real cost.
  function r6(v) { return Math.round(v * 1e6) / 1e6; }

  // Every AREA form of water, in one place, because the answer was spread across
  // four tags and the parser only knew one of them.
  function isWater(tags) {
    return tags.natural === 'water' || tags.waterway === 'riverbank'
        || tags.landuse === 'reservoir' || tags.landuse === 'basin';
  }

  // What a carriageway is CARRIED ON, which the drape has to stop ignoring.
  // 0 none · 1 bridge · 2 tunnel · 3 embankment · 4 cutting
  var CARRY = { NONE: 0, BRIDGE: 1, TUNNEL: 2, EMBANK: 3, CUTTING: 4 };
  function carryOf(tags) {
    var no = function (v) { return !v || v === 'no'; };
    if (!no(tags.bridge) || tags.man_made === 'bridge') return CARRY.BRIDGE;
    if (!no(tags.tunnel)) return CARRY.TUNNEL;
    if (!no(tags.embankment)) return CARRY.EMBANK;
    if (!no(tags.cutting)) return CARRY.CUTTING;
    return CARRY.NONE;
  }

  // A MULTIPOLYGON MEMBER IS NOT A RING. The outer boundary of a big river or
  // lake is stitched together from many member ways, each one an open fragment,
  // and every consumer here treats a ring as CLOSED: triangulate() fills it, and
  // the point-in-polygon test in landAt() closes it implicitly with a straight
  // line from its last point back to its first. Hand it a fragment and that
  // phantom edge can run for kilometres, so a huge wedge of dry land reads as
  // "inside the water" — which is a car that drowns on a clifftop, and an
  // invisible wall with no water anywhere near it.
  //
  // So fragments are joined end to end into closed rings first, and anything that
  // will not close is DROPPED. Coordinates are rounded identically (r6) and
  // shared nodes are the same node, so endpoints match exactly.
  function assembleRings(frags) {
    var rings = [], pool = frags.slice();
    var head = function (f) { return f[0] + ',' + f[1]; };
    var tail = function (f) { return f[f.length - 2] + ',' + f[f.length - 1]; };
    var reverse = function (f) {
      var out = [];
      for (var i = f.length - 2; i >= 0; i -= 2) out.push(f[i], f[i + 1]);
      return out;
    };
    while (pool.length) {
      var cur = pool.shift();
      // Bounded: a malformed relation must not spin here.
      for (var guard = 0; guard < 400 && head(cur) !== tail(cur) && pool.length; guard++) {
        var hit = -1, joined = null;
        for (var i = 0; i < pool.length; i++) {
          var p = pool[i];
          if (tail(cur) === head(p)) { joined = cur.concat(p.slice(2)); hit = i; break; }
          if (tail(cur) === tail(p)) { joined = cur.concat(reverse(p).slice(2)); hit = i; break; }
          if (head(cur) === tail(p)) { joined = p.concat(cur.slice(2)); hit = i; break; }
          if (head(cur) === head(p)) { joined = reverse(p).concat(cur.slice(2)); hit = i; break; }
        }
        if (hit < 0) break;                 // nothing else connects to this chain
        pool.splice(hit, 1);
        cur = joined;
      }
      if (head(cur) === tail(cur) && cur.length >= 8) rings.push(cur);
    }
    return rings;
  }

  function parse(json, detail) {
    var ways = [], bld = [], wat = [], land = [], pool = [];
    var els = (json && json.elements) || [];
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      var rtags = e.tags || {};
      // A MULTIPOLYGON RELATION. `out geom` hands back each member's coordinates,
      // so the rings are already here — they just have to be taken off the
      // members instead of off the element. Outer rings only: an island in a lake
      // is a hole, and this mesher has no holes, so filling it would be a worse
      // lie than leaving the island wet. An empty role is treated as outer, which
      // is what a sloppily-tagged multipolygon means in practice.
      if (e.type === 'relation' && e.members && isWater(rtags)) {
        var frags = [];
        for (var mi = 0; mi < e.members.length; mi++) {
          var mem = e.members[mi];
          if (!mem || !mem.geometry || mem.geometry.length < 2) continue;
          if (mem.role && mem.role !== 'outer') continue;   // an island is a hole; this mesher has none
          var mflat = [], gap = false;
          for (var mg = 0; mg < mem.geometry.length; mg++) {
            var mp = mem.geometry[mg];
            // A member the bbox cut through comes back with holes in it. Its
            // endpoints are then meaningless for stitching, so it is not a
            // fragment we can trust — drop it rather than join across the gap.
            if (!mp) { gap = true; break; }
            mflat.push(r6(mp.lat), r6(mp.lon));
          }
          if (!gap && mflat.length >= 4) frags.push(mflat);
        }
        var built = assembleRings(frags);
        for (var bi = 0; bi < built.length; bi++) wat.push(built[bi]);
        continue;
      }
      if (!e.geometry || e.geometry.length < 2) continue;
      var flat = [];
      for (var g = 0; g < e.geometry.length; g++) { flat.push(r6(e.geometry[g].lat), r6(e.geometry[g].lon)); }
      var tags = rtags;
      if (tags.highway && ROAD_CLASS[tags.highway]) {
        // [4] is the NAME, and it has been in every response we have ever
        // made — `out geom` returns the way's whole tag set and the parser
        // took three of them. A road you are driving down that cannot tell
        // you what it is called is a map with the labels torn off.
        // [5] is what CARRIES it — bridge, tunnel, embankment, cutting. Another
        // tag that has been in every response we ever made and was thrown away,
        // which is why a bridge followed the river bed it crosses. A cache written
        // before this has no sixth element; undefined packs to 0 ("on the
        // ground"), so old caches keep working and upgrade as tiles re-fetch.
        ways.push([tags.highway, flat, surfaceOf(tags), laneCount(tags), tags.name || '', carryOf(tags)]);
      } else if (tags.building && detail >= 1) {
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
      } else if (tags.leisure === 'swimming_pool' || tags.amenity === 'swimming_pool') {
        // Their OWN list: a pool is drawn turquoise rather than lake-blue, and
        // it is ALWAYS deep. That is the one water on the map you can be sure
        // about, and everything else is the gamble.
        pool.push(flat);
      } else if (isWater(tags)) {
        wat.push(flat);
      } else if (detail >= 2) {
        // [0] class id, [1] ring, [2] species. Kept as three small numbers and
        // an array rather than the tag soup, because this is cached per tile.
        var lk = LAND[tags.natural] || LAND[tags.landuse]
              || (tags.leisure === 'park' || tags.leisure === 'garden' ? LAND.park : null)
              || (tags.leisure === 'golf_course' ? LAND.grassland : null);
        if (lk && land.length < MAX_LAND) land.push([lk.id, flat, leafOf(tags, lk.leaf)]);
      }
    }
    return { ways: ways, bld: bld, wat: wat, land: land, pool: pool, detail: detail };
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
  // Brand colours as HEX, because that is how a company publishes the one it
  // paints its building. Parsed to floats once at load.
  //
  // Keys are NORMALISED names (lowercase, punctuation stripped, a leading "the"
  // dropped), plus brand:wikidata Q-ids where I could verify them. A guessed
  // Q-id is worse than none: it silently paints one company's colour on
  // another's corner and nothing ever complains.
  //
  // Roughly the top ~120 signs a driver passes, weighted to North America and
  // then western Europe. This list is the whole feature — the shader just reads
  // it — so adding a brand is one line and needs no rebuild of anything else.
  var BRAND_HEX = {
    // ---- fast food & coffee: North America ----
    mcdonalds: 'DA291C', q38076: 'DA291C',
    burgerking: 'D62300', q177054: 'D62300',
    kfc: 'A8171C', q524757: 'A8171C',
    subway: '008C15', q244457: '008C15',
    starbucks: '00704A', q37158: '00704A',
    innout: 'E4002B', innoutburger: 'E4002B',
    chickfila: 'DD0031', tacobell: '702082', wendys: 'E2203D',
    dunkin: 'FF671F', dunkindonuts: 'FF671F',
    chipotle: 'A81612', fiveguys: 'ED174F', whataburger: 'FF5A00',
    jackinthebox: 'E1251B', sonic: '1D57A5', sonicdrivein: '1D57A5',
    popeyes: 'FF7900', arbys: 'C8102E', dairyqueen: 'D6001C',
    pandaexpress: 'D4212D', shakeshack: '4BAE55',
    pizzahut: 'EE3124', papajohns: 'C8102E', littlecaesars: 'FF6000',
    dominos: '006491', q1141226: '006491',
    wingstop: '00543D', raisingcanes: 'B01E24', culvers: '003DA5',
    deltaco: 'D8232A', carlsjr: 'E4002B', hardees: 'E4002B',
    bojangles: 'E4002B', zaxbys: 'EE3124', churchschicken: 'C8102E',
    elpolloloco: 'FFC72C', qdoba: 'A6192E', panera: '6D9B4A',
    panerabread: '6D9B4A', sweetgreen: '00543D', jimmyjohns: 'E4002B',
    jerseymikes: '005596', firehousesubs: 'E4002B', potbelly: 'C8102E',
    dutchbros: '003DA5', peets: '6D2077', peetscoffee: '6D2077',
    caribou: '003DA5', cariboucoffee: '003DA5', timhortons: 'C8102E',
    krispykreme: '009639', cinnabon: 'B25C25', auntieannes: '002F6C',
    baskinrobbins: 'E5257A', coldstonecreamery: 'A6192E',
    jamba: '6A2C91', jambajuice: '6A2C91', smoothieking: 'E4002B',
    // ---- sit-down chains ----
    dennys: 'FFC72C', ihop: '0033A0', wafflehouse: 'FFC72C',
    crackerbarrel: '6E4C1E', applebees: 'E4002B', chilis: 'E4002B',
    olivegarden: '4C8B2B', redlobster: 'E4002B', outback: 'A6192E',
    texasroadhouse: 'A6192E', buffalowildwings: 'FFC72C',
    whitecastle: '005EB8', steaknshake: 'E4002B', longjohnsilvers: '003DA5',
    // ---- groceries: North America ----
    traderjoes: 'C8102E', safeway: 'D71E28', kroger: '004990',
    albertsons: '005DAA', publix: '227A3D', costco: 'E31837',
    wholefoods: '00674B', wholefoodsmarket: '00674B',
    walmart: '0071CE', target: 'CC0000', sprouts: '6CB33F',
    heb: 'E1251B', wegmans: 'C8102E', meijer: 'E1251B',
    giantfood: 'E4002B', stopandshop: 'E4002B', foodlion: '00A94F',
    winndixie: 'E4002B', harristeeter: '00843D', vons: 'E4002B',
    ralphs: 'E4002B', kingsoopers: 'E4002B', jewelosco: 'E4002B',
    shoprite: 'E4002B', groceryoutlet: 'FFC72C',
    // ---- pharmacy ----
    cvs: 'CC0000', cvspharmacy: 'CC0000', walgreens: 'E31837',
    riteaid: '004B87',
    // ---- fuel & convenience ----
    shell: 'F2B705', q154950: 'F2B705',
    bp: '007A33', q152057: '007A33',
    exxon: 'D82C20', mobil: 'D82C20', exxonmobil: 'D82C20',
    chevron: '0054A4', arco: '0057B8', valero: '0067B1',
    texaco: 'D82231', esso: 'D42121', total: 'E63312',
    circlek: 'E8781E', '7eleven': 'DA291C', sunoco: 'FFC72C',
    citgo: 'E4002B', phillips66: 'E4002B', conoco: 'E4002B',
    marathon: '003DA5', speedway: 'E4002B', wawa: 'C8102E',
    sheetz: 'E4002B', quiktrip: 'E4002B', racetrac: 'E4002B',
    caseys: 'E4002B', pilot: '003DA5', loves: 'FFC72C',
    bucees: 'FFC72C', kwiktrip: 'E4002B', maverik: '003DA5',
    gulf: 'FF6600', sinclair: '00843D', '76': '003DA5',
    // ---- big box, hardware, specialty ----
    homedepot: 'F96302', lowes: '004990', bestbuy: '0046BE',
    ikea: '0058A3', menards: '005DAA', acehardware: 'E4002B',
    harborfreight: 'E4002B', tractorsupply: 'C8102E',
    autozone: 'F6893C', oreillyautoparts: '007A33',
    advanceautoparts: 'E4002B', napaautoparts: '003DA5', pepboys: 'E4002B',
    dollargeneral: 'FFC72C', dollartree: '00853F', familydollar: 'E4002B',
    ross: '003DA5', tjmaxx: 'E4002B', marshalls: '003DA5',
    kohls: '8E2043', macys: 'E4002B', jcpenney: 'E4002B',
    petco: '003DA5', petsmart: '003DA5', staples: 'CC0000',
    officedepot: 'E4002B', michaels: 'E4002B', hobbylobby: '005DAA',
    barnesandnoble: '00704A', gamestop: 'E4002B',
    verizon: 'E4002B', tmobile: 'E20074', att: '009FDB',
    // ---- banks: a branch is a shopfront too ----
    chase: '117ACA', bankofamerica: 'E31837', wellsfargo: 'D71E28',
    citibank: '003B70', usbank: '0C2074', pnc: 'F58025',
    capitalone: '004977', tdbank: '00A651',
    // ---- hotels ----
    marriott: 'A6192E', hilton: '104C97', holidayinn: '0C7C3C',
    motel6: '003DA5', bestwestern: '003DA5',
    // ---- western Europe & UK ----
    tesco: '00539F', q487494: '00539F',
    aldi: '00549F', q125054: '00549F',
    lidl: '0050AA', q151954: '0050AA',
    sainsburys: 'F06C00', asda: '68A80D', morrisons: '007A3D',
    waitrose: '5A9E3C', marksandspencer: '00543D', mands: '00543D', marksspencer: '00543D',
    coop: '00B1E7', iceland: 'E4002B', poundland: 'E4002B',
    boots: '05054B', superdrug: 'E4002B', hollandandbarrett: '00543D',
    greggs: '00263E', q3403981: '00263E',
    costa: '6C1D45', costacoffee: '6C1D45', caffenero: '003D2B',
    pretamanger: '8C1D40', nandos: '2E2E2E', pizzaexpress: '003DA5',
    cafenero: '003D2B',
    wagamama: 'E4002B', wetherspoon: '00543D',
    argos: 'E4002B', currys: '003DA5', screwfix: '003DA5',
    wickes: '003DA5', bandq: 'FF6600', bq: 'FF6600', homebase: '007A3D',
    halfords: '003DA5', wilko: 'E4002B', johnlewis: '000000',
    next: '000000', tkmaxx: 'E4002B', primark: '00539F',
    carrefour: '004E9F', auchan: 'E4002B', leclerc: '0055A4',
    intermarche: 'E4002B', monoprix: '000000',
    rewe: 'CC071E', edeka: 'FFD100', kaufland: 'E10915',
    netto: 'FFE500', penny: 'CC0000', spar: 'EC1C24',
    dm: '003D7C', rossmann: 'E4002B', mediamarkt: 'E4002B',
    mercadona: '009640', migros: 'FF6600', billa: 'E4002B',
    decathlon: '0082C3', zara: '000000', handm: 'E4002B', hm: 'E4002B',
    uniqlo: 'FF0000', premierinn: '5C2D91', travelodge: '00539F',
  };

  // Hex to the [0..1] triple the packer wants. One pass at load, never again.
  var BRAND_COLOUR = (function () {
    var out = {};
    for (var k in BRAND_HEX) {
      var h = BRAND_HEX[k];
      out[k] = [parseInt(h.slice(0, 2), 16) / 255,
                parseInt(h.slice(2, 4), 16) / 255,
                parseInt(h.slice(4, 6), 16) / 255];
    }
    return out;
  })();

  // Lowercase, strip everything that is not a letter or digit, and drop a
  // leading "the" — OSM carries "The Home Depot" and "The Range" exactly as the
  // company writes them, and a table keyed on homedepot would miss every one.
  function normBrand(s) {
    // Strip DIACRITICS before stripping punctuation, or "Caffè Nero" loses the
    // è entirely and normalises to caffnero — a miss that looks exactly like an
    // unlisted brand. NFD splits the accent into a combining mark we can drop.
    var n = String(s).normalize ? String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '') : String(s);
    n = n.toLowerCase().replace(/[^a-z0-9]/g, '');
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

  // An index entry used to be a bare timestamp. It is now { at, bytes }, and a
  // cache written before that is read as a timestamp with an assumed size —
  // nobody has to clear anything.
  // `index` is NULL until loadIndex() has run, and backgroundFill asks these
  // on every frame from the first one — so each has to survive being called
  // before the cache index exists.
  function entryAt(k) { var e = index && index[k]; return typeof e === 'number' ? e : (e && e.at) || 0; }
  function entryBytes(k) { var e = index && index[k]; return typeof e === 'number' ? 120000 : (e && e.bytes) || 120000; }
  function cacheBytes() {
    var t = 0;
    if (!index) return 0;
    for (var k in index) t += entryBytes(k);
    return t;
  }
  function setCacheBudget(bytes) { CACHE_BUDGET = Math.max(2 * 1024 * 1024, bytes | 0); }
  function isCached(key) { return !!(index && index[key]) || !!memory[key]; }
  // Mark a tile as used WITHOUT forgetting how big it is — the whole point of
  // a byte budget is that the size survives a cache hit.
  function touch(key) {
    if (!index) index = {};
    var b = index[key] ? entryBytes(key) : 120000;
    index[key] = { at: Date.now(), bytes: b };
  }

  function evictIfNeeded() {
    if (!index) return Promise.resolve();
    var total = cacheBytes();
    if (total <= CACHE_BUDGET) return Promise.resolve();
    var keys = Object.keys(index);
    keys.sort(function (a, b) { return entryAt(a) - entryAt(b); });   // oldest first
    var drop = [];
    for (var i = 0; i < keys.length && total > CACHE_BUDGET; i++) {
      total -= entryBytes(keys[i]);
      drop.push(keys[i]);
    }
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
  // How long a DEGRADED tile is left degraded before we try for the full thing
  // again — graded by how much it is missing, because the two cases are not
  // remotely equally bad to look at.
  //
  //   roads only, NO BUILDINGS   ten minutes. A street of houses rendered as
  //                              bare tarmac is the most visible failure the
  //                              app has, and six hours of it is unacceptable
  //                              for what is usually one busy server.
  //   missing landcover only     six hours. Nobody can see the difference
  //                              between a guessed tree and a tagged one at
  //                              50 km/h, so it is not worth re-querying for.
  var DENSE_RETRY_MS = 6 * 60 * 60 * 1000;
  var NOBLD_RETRY_MS = 10 * 60 * 1000;

  // THE PARSER'S OWN VERSION, stamped into every cached record. Every feature
  // this file has grown — building classes, brands, surfaces, lane counts,
  // street names, landcover, swimming pools — has had the same quiet failure:
  // a tile cached by an OLDER build simply lacks the new field, and a cached
  // record that is not flagged dense was served forever, so the new feature
  // never appeared exactly where the player had already driven. "My pool
  // disappeared from my backyard. It used to be there a few versions back."
  // — cached before pools were parsed, kept indefinitely after. A record
  // whose stamp is not TODAY'S is re-fetched once (and kept as the fallback
  // if that fetch fails); bump this whenever parse() learns a new trick.
  var PARSE_V = 2;

  function loadTile(tile) {
    var key = root.Geo.tileKey(tile);
    if (memory[key]) return Promise.resolve(memory[key]);

    return loadIndex().then(function () {
      return db().get('t' + key).catch(function () { return null; });
    }).then(function (rec) {
      if (rec && rec.ways) {
        // Records saved before `at` existed have no timestamp — treated as
        // stale, so every player's dense tiles retry once and get stamped.
        var recDetail = rec.detail != null ? rec.detail
                      : (rec.dense ? 0 : ((rec.land && rec.land.length) ? 2 : 1));
        var ttl = recDetail < 1 ? NOBLD_RETRY_MS : DENSE_RETRY_MS;
        var staleDense = rec.dense && (Date.now() - (rec.at || 0) > ttl)
          && root.Sources.current.quality !== 'low';
        // A record parsed by an older build lacks whatever the parser has
        // learned since (see PARSE_V) — re-fetch it once, old bytes as the
        // fallback, exactly like a stale dense record.
        var outdated = rec.pv !== PARSE_V && root.Sources.current.quality !== 'low';
        if (!staleDense && !outdated) {
          // land and pool MUST be read back too. They were added to the write
          // and not to the read, so every cache HIT silently returned a tile
          // with no landcover and no swimming pools — which reads exactly like
          // "OSM has nothing tagged here", the one thing landcover was built to
          // distinguish from. Re-driving a street was quietly worse than
          // driving it the first time.
          var hit = { ways: rec.ways, bld: rec.bld || [], wat: rec.wat || [],
                      land: rec.land || [], pool: rec.pool || [], dense: !!rec.dense,
                      // A record written before levels existed: infer it from
                      // what is actually in the record rather than guessing.
                      detail: rec.detail != null ? rec.detail
                            : (rec.dense ? 0 : ((rec.land && rec.land.length) ? 2 : 1)) };
          memory[key] = hit;
          touch(key); saveIndex();
          return hit;
        }
        return fetchTile(tile, key).then(function (fresh) {
          // A REFETCH MAY NEVER MAKE A TILE POORER. The detail ladder sheds
          // buildings when a mirror is busy (504 / too-large), and until now a
          // shed answer was simply saved — so a tile that HAD buildings could
          // come back roads-only and stay that way. That was survivable while
          // only roads-only records were ever retried; the parser-version
          // refetch (pv) made every rich tile a candidate, which turns one
          // busy evening into "I teleported around and stopped getting
          // buildings anywhere". Keep the better record, and re-stamp it so
          // this does not re-ask on every visit.
          if ((fresh.detail || 0) >= recDetail) return fresh;
          var kept = { ways: rec.ways, bld: rec.bld || [], wat: rec.wat || [],
                       land: rec.land || [], pool: rec.pool || [],
                       dense: !!rec.dense, detail: recDetail };
          memory[key] = kept;
          db().put({ id: 't' + key, ways: kept.ways, bld: kept.bld, wat: kept.wat,
                     land: kept.land, pool: kept.pool, dense: kept.dense,
                     detail: kept.detail, pv: PARSE_V, at: Date.now() }).catch(function () {});
          touch(key); saveIndex();
          return kept;
        }).catch(function () {
          // The retry failed too — the stale roads are still a world to drive.
          var old = { ways: rec.ways, bld: rec.bld || [], wat: rec.wat || [],
                      land: rec.land || [], pool: rec.pool || [], dense: true,
                      detail: rec.detail != null ? rec.detail : 0 };
          memory[key] = old;
          touch(key); saveIndex();
          return old;
        });
      }
      return fetchTile(tile, key);
    });
  }

  // ---- which mirror should THIS tile go to? --------------------------------
  //
  // The registry has always listed several mirrors and then used exactly one of
  // them, chosen by hand, for an entire drive. That is one server carrying the
  // whole load while identical ones sit idle, and it means one server's bad day
  // is the app's bad day.
  //
  // So: DIFFERENT tiles to DIFFERENT mirrors, concurrently. Nine tiles at a
  // crossing become three each on three servers instead of nine queued behind
  // one, and net.js's per-host gap and concurrency cap still apply to each — so
  // every individual server sees a POLITER stream than before, not a busier one.
  //
  // What this deliberately does NOT do is race the same query on every mirror
  // and take the winner. That triples the load on donated infrastructure to
  // answer one question, and it is precisely the behaviour that got this
  // address 406'd out of overpass-api.de for minutes at a time on 2026-08-07.
  // Fast is not worth taking three servers' time to get one answer.
  //
  // Health is measured, not assumed: an exponential moving average of how long
  // each mirror took, plus whatever backoff net.js has already imposed on it.
  var mirrorStat = {};
  var inflightTile = {};
  var lastErr = {};        // tileKey -> the last refusal, for the status panel

  // What is happening to this tile RIGHT NOW, for the loading map. null once it
  // has landed (or before it was ever asked for).
  function tileState(key) {
    var f = inflightTile[key];
    if (!f) return null;
    var pos = root.Net.positionOf(f.url);
    return { mirror: f.mirror, host: f.host, queue: pos > 0 ? pos : 0,
             running: pos === 0, waited: Date.now() - f.since };
  }
  function statFor(url) {
    var h = root.Net.hostOf(url);
    if (!mirrorStat[h]) mirrorStat[h] = { host: h, lat: 1500, n: 0, fails: 0 };
    return mirrorStat[h];
  }
  function noteLatency(url, ms) {
    var st = statFor(url);
    st.lat = st.n ? st.lat * 0.7 + ms * 0.3 : ms;    // EMA, first sample wins outright
    st.n++; st.fails = 0;
  }
  function noteFail(url) { statFor(url).fails++; }

  // Lower is better. Backoff dominates everything — a server that has told us
  // to go away is not a candidate at any latency — then queue depth, then speed.
  function mirrorScore(src) {
    var st = statFor(src.url), q = root.Net.hostState(st.host);
    return q.busyMs * 10 + (q.pending + q.active) * 800 + st.lat + st.fails * 4000;
  }
  function rankMirrors(lat, lon) {
    var pool = root.Sources.roadsFor(lat, lon).filter(function (s) { return !!s.url; });
    return pool.slice().sort(function (a, b) { return mirrorScore(a) - mirrorScore(b); });
  }

  function fetchTile(tile, key) {
    var wantDetail = root.Sources.current.quality === 'low' ? 0 : 2;
    var b = root.Geo.tileBounds(tile.z, tile.x, tile.y);
    var cLat = (b.north + b.south) / 2, cLon = (b.west + b.east) / 2;
    var ranked = rankMirrors(cLat, cLon);
    if (!ranked.length) return Promise.reject(new Error('no roads mirror covers this place'));

    function ask(src, detail) {
      var t0 = Date.now();
      var url = src.url + '?data=' + encodeURIComponent(query(tile, detail));
      // Remembered so the HUD can say WHICH server this tile is waiting on and
      // WHERE in that server's queue it is sitting.
      inflightTile[key] = { url: url, host: root.Net.hostOf(url), mirror: src.name, since: t0 };
      function done() { if (inflightTile[key] && inflightTile[key].url === url) delete inflightTile[key]; }
      return root.Net.json(url)
        .then(function (json) { noteLatency(src.url, Date.now() - t0); done(); delete lastErr[key]; return parse(json, detail); },
              function (err) {
                noteFail(src.url); done();
                // REMEMBER WHY. "Waiting for tiles that never build" is a
                // question the app could always answer and never did — the
                // refusal was known here and thrown away one frame later.
                lastErr[key] = { status: err.status || 0, busy: !!err.busy, detail: detail,
                                 mirror: src.name, msg: String(err.message || err).slice(0, 90),
                                 at: Date.now() };
                throw err;
              });
    }

    // Walk the ranked mirrors. A busy or broken server hands the tile to the
    // next one INSTEAD OF FAILING THE TILE — which is the difference between
    // "the map server is busy" and "there are no roads here".
    function attempt(i, detail) {
      return ask(ranked[i], detail).catch(function (err) {
        // Two different ways a dense tile refuses to load, and both mean the
        // same thing — this query is too big for this tile:
        //   "response too large"  the GifOS bridge's own 8 MB response cap
        //   HTTP 504              Overpass gave up on the query's cost
        // Either way, drop the buildings and take the roads. A 504 is about the
        // QUERY, so retrying it on another mirror just costs somebody else the
        // same timeout; shed the detail on the spot instead.
        // A 504 IS NOT EVIDENCE ABOUT THE TILE. It is what an overloaded
        // mirror says, and mirrors are overloaded constantly — measured on one
        // Californian tile: detail 2 returned 366 buildings in 0.86 MB from one
        // server while another 504'd on the SMALLER query thirty seconds later.
        // The old code read that timeout as "this tile is too dense", threw the
        // buildings away and CACHED the verdict, so a street kept its roads and
        // lost its houses permanently because one volunteer's server was busy.
        // Ask somebody else the same question first; only shed detail once
        // every mirror has refused it.
        if (err.status === 504 && i + 1 < ranked.length) return attempt(i + 1, detail);
        // "Response too large" IS about the query — it is our own 8 MB bridge
        // cap, and no other server will answer it any smaller. Shed a level.
        if (detail > 0 && (/too large/i.test(err.message || '') || err.status === 504)) {
          return attempt(0, detail - 1);
        }
        // Anything else — 406, 429, a refused connection — is about the SERVER,
        // so the same query is worth asking somewhere else.
        if (i + 1 < ranked.length) return attempt(i + 1, detail);
        throw err;
      });
    }

    return attempt(0, wantDetail).then(function (geom) {
      geom.dense = (geom.detail || 0) < 2;
      memory[key] = geom;
      // Measured, not guessed: a city tile and a moor tile differ by more than
      // an order of magnitude, and a budget in MB has to mean MB.
      var approx = 0;
      try { approx = JSON.stringify({ w: geom.ways, b: geom.bld, t: geom.wat, l: geom.land, p: geom.pool }).length; }
      catch (e) { approx = 120000; }
      index[key] = { at: Date.now(), bytes: approx };
      return db().put({
        id: 't' + key, ways: geom.ways, bld: geom.bld, wat: geom.wat, land: geom.land, pool: geom.pool,
        dense: !!geom.dense, detail: geom.detail,
        pv: PARSE_V,      // which parser wrote this — an old stamp forces one re-fetch
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
  // A CARRIAGEWAY THAT IS NOT ON THE GROUND. Everything above drapes the tarmac
  // onto the heightfield, which is right for an ordinary road and wrong for every
  // road that was BUILT to ignore the ground — and OSM has always said which is
  // which, in tags this parser threw away. Draped, the Rainbow Bridge at Niagara
  // dives sixty metres down one wall of the gorge, along the river bed, and back
  // up the other side; an embankment across a valley ripples with every DEM post
  // instead of running level, which is the "strange slopes" you see everywhere.
  //
  // The profile is the straight line between the two ENDS, because the ends are
  // where the structure meets the ground and therefore the only honest samples on
  // it. That single rule is a level bridge, a constant-grade embankment and a
  // cutting that does not climb the hill it was dug through.
  // Metres a structure may deviate from the ground. A tunnel gets a lot, because
  // being a long way under a mountain is what a tunnel IS — clamped at 120 the
  // deck was dragged up to follow the summit profile, so "through the mountain"
  // came out as a climb over it 120 m down.
  var CARRY_MAX = { 1: 200, 2: 1500, 3: 30, 4: 30 };
  // The steepest end-to-end grade each kind is ever BUILT to, used to catch a
  // terrain sample that cannot be true (see carryEnds). Tunnels are in here too:
  // they are as engineered as bridges, and with a deep one the far portal is the
  // sample most likely to be wrong, so an implausible grade must not be believed.
  var MAX_GRADE = { 1: 0.08, 2: 0.08, 3: 0.12, 4: 0.12 };
  function endGround(frame, pts, from, dir) {
    // The abutment first, then a few steps inward: an endpoint can land just
    // outside the loaded terrain while the rest of the span is over it.
    for (var k = 0; k < 6 && k < pts.length; k++) {
      var p = pts[from + dir * k];
      if (!p) break;
      var h = root.Terrain.heightAt(frame, p.x, p.z);
      if (h !== null) return h;
    }
    return null;
  }
  // The profile as two end heights and a length — computed once and used by BOTH
  // the mesh and the collision index, so what you see and what you drive on
  // cannot disagree. (They did: the deck was drawn over the gorge while the car
  // went on taking its height from the terrain, so a bridge you could see was a
  // bridge you fell through.)
  function carryEnds(frame, pts, kind) {
    var n = pts.length;
    if (n < 2) return null;
    var total = 0;
    for (var i = 1; i < n; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (!(total > 1)) return null;
    var ha = endGround(frame, pts, 0, 1), hb = endGround(frame, pts, n - 1, -1);
    // ONE END IS ENOUGH. A long structure runs clean out of the loaded world — a
    // road tunnel can be ten kilometres of way against a 3 km terrain radius — and
    // demanding both portals meant every tunnel worth the name fell back to the
    // drape and became a mountain you drove over. With one end known, hold that
    // height: level is the right guess for a tunnel and close enough for a span,
    // and the tile rebuilds if the other portal ever loads.
    if (ha === null && hb !== null) ha = hb;
    else if (hb === null && ha !== null) hb = ha;
    if (ha === null || hb === null) { groundMisses++; return null; }
    var grade = MAX_GRADE[kind];
    if (grade && Math.abs(ha - hb) > total * grade) {
      // WHICH END TO BELIEVE depends on which way the bad sample errs, and that is
      // opposite for the two cases.
      //
      // Above ground (a bridge) the suspect end is the one reading LOW: the DEM
      // rounds a gorge rim downward, so the abutment samples part-way down the
      // cliff. Keep the higher end.
      //
      // Below ground (a tunnel) the suspect end reads HIGH, and for a mundane
      // reason: `out geom` CLIPS a long way at the query bbox, so the "endpoint"
      // of a 7.5 km tunnel is not a portal at all — it is a point under the
      // mountain, and the terrain there is the summit. Measured on the Tunnel du
      // Mont Blanc: portals reported as 1352 m and 3422 m, the second being the
      // roof of the Alps. Keeping the higher end there dragged the whole deck up
      // the mountain and the tunnel became the surface road again. Keep the lower.
      var deep = kind === 2;
      var keep = deep ? Math.min(ha, hb) : Math.max(ha, hb);
      var step = total * grade;
      if (deep) { if (ha > hb) ha = keep + step; else hb = keep + step; }
      else { if (ha < hb) ha = keep - step; else hb = keep - step; }
    }
    return { ha: ha, hb: hb, total: total, kind: kind };
  }

  // The deck height at arc length `s` along the structure, clamped so a bridge
  // never sinks into a hill and a tunnel never surfaces over one.
  function carryYAt(prof, frame, x, z, s, lift) {
    var y = prof.ha + (prof.hb - prof.ha) * (s / prof.total);
    var g = root.Terrain.heightAt(frame, x, z);
    var cap = CARRY_MAX[prof.kind] || 30;
    if (g !== null) {
      if (prof.kind === 1) y = Math.min(Math.max(y, g), g + cap);
      else if (prof.kind === 2) y = Math.max(Math.min(y, g), g - cap);
      else y = Math.min(Math.max(y, g - cap), g + cap);
    }
    return y + lift;
  }

  // The per-vertex deck for the MESH, from the same profile the index uses.
  function carryProfile(frame, pts, lift, kind) {
    var prof = carryEnds(frame, pts, kind);
    if (!prof) return null;                    // no ground under an abutment yet — drape it
    var deck = [], s = 0;
    for (var k = 0; k < pts.length; k++) {
      if (k > 0) s += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
      deck.push(carryYAt(prof, frame, pts[k].x, pts[k].z, s, lift));
    }
    return deck;
  }

  function ribbon(frame, pts, halfWidth, lift, out, tone, surface, lanes, deck) {
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
      // On a structure both kerbs take the SAME height — a deck is level across
      // its width, and sampling the ground under each kerb separately is what
      // gave a bridge a cross-fall following the valley wall beneath it.
      var yl = deck ? deck[k] : groundAt(frame, l.x, l.z, lift);
      var yr = deck ? deck[k] : groundAt(frame, r.x, r.z, lift);
      out.pos.push(l.x, yl, l.z);
      out.pos.push(r.x, yr, r.z);
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
  var MAX_LAND = 400;          // landcover rings per tile — a ceiling on cache bytes
  var TREE_STEP = 34;          // metres between candidate sites
  // 240 was tuned for guessed copses and it is why mapped WOODLAND came out as
  // parkland: a z15 tile has ~800 candidate sites, a tagged forest wants nearly
  // all of them plus infill, and the ceiling was hit a third of the way across
  // the tile. 1000 trees is ~0.9 MB of static mesh; nine resident tiles put the
  // worst case under 9 MB, all in one draw call per tile.
  var TREE_MAX = 1000;         // per tile — a hard ceiling on bytes AND on fill
  var TREE_CLEAR = 4.0;        // metres of clearance from a carriageway edge
  // How much of the satellite classifier's 3x3 neighbourhood must read as
  // canopy before untagged ground grows forest. Below this, the old guesses.
  var COVER_WOOD = 0.45;

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

  // Landcover in WORLD metres, with a bbox per ring so a point test is a
  // handful of comparisons before any ray casting. Rings are small and few
  // (capped at MAX_LAND) so a flat list beats a grid here.
  function buildLandIndex(frame, geom) {
    var list = [];
    var src = (geom && geom.land) || [];        // old cache: simply no landcover
    for (var i = 0; i < src.length; i++) {
      var rec = src[i], flat = rec[1];
      if (!flat || flat.length < 6) continue;
      var xs = [], zs = [], minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (var j = 0; j < flat.length; j += 2) {
        var w = frame.toWorld(flat[j], flat[j + 1]);
        xs.push(w.x); zs.push(w.z);
        if (w.x < minX) minX = w.x; if (w.x > maxX) maxX = w.x;
        if (w.z < minZ) minZ = w.z; if (w.z > maxZ) maxZ = w.z;
      }
      list.push({ id: rec[0], leaf: rec[2], xs: xs, zs: zs,
                  minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ,
                  area: (maxX - minX) * (maxZ - minZ) });
    }
    // Smallest first: a garden inside a park should win over the park.
    list.sort(function (a, b) { return a.area - b.area; });
    return list;
  }

  // Which landcover is this point standing on? Ray casting, smallest ring
  // first. Returns null where OSM says nothing at all — which is NOT the same
  // as bare rock, and the caller treats the two differently.
  function landAt(index, x, z) {
    for (var i = 0; i < index.length; i++) {
      var r = index[i];
      if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      var inside = false, xs = r.xs, zs = r.zs, n = xs.length;
      for (var a = 0, b = n - 1; a < n; b = a++) {
        if (((zs[a] > z) !== (zs[b] > z))
            && (x < (xs[b] - xs[a]) * (z - zs[a]) / ((zs[b] - zs[a]) || 1e-9) + xs[a])) inside = !inside;
      }
      if (inside) return r;
    }
    return null;
  }

  // id -> the LAND record, so scatter can read plant/bush/orchard back out.
  var LAND_BY_ID = (function () {
    var m = {};
    for (var k in LAND) if (!m[LAND[k].id]) m[LAND[k].id] = LAND[k];
    return m;
  })();

  // Water the CAR can ask about, as opposed to water it can only look at. Same
  // rings, same ray cast as landcover — a pool is a polygon either way.
  // Deep enough to drown in, or shallow enough to splash through?
  //
  // A POOL IS ALWAYS DEEP: walled, three metres down, and no way out but the
  // steps. Open water goes by SIZE — a farm pond you can blast across, a lake
  // you cannot — and the threshold is deliberately a number you cannot eyeball.
  // That is the point: driving into water should be a gamble you take, not a
  // lookup you perform. Rivers and streams come in as small polygons or not at
  // all (we never ask for waterway lines), so they land on the driveable side.
  var DROWN_AREA = 2000;        // m² of open water past which it swallows you
  function buildWaterIndex(frame, geom) {
    var rings = [];
    var open = (geom && geom.wat) || [];
    for (var i = 0; i < open.length; i++) {
      rings.push([ringAreaM2(open[i]) > DROWN_AREA ? 1 : 0, open[i], '']);
    }
    var pools = (geom && geom.pool) || [];
    for (var j = 0; j < pools.length; j++) rings.push([1, pools[j], '']);
    return buildLandIndex(frame, { land: rings });
  }
  // null | { deep }. The caller needs the difference; a boolean cannot carry it.
  function waterAt(index, x, z) {
    var r = (index && index.length) ? landAt(index, x, z) : null;
    return r ? { deep: r.id === 1 } : null;
  }
  function inWater(index, x, z) { return !!waterAt(index, x, z); }

  // ROOFS, as polygons you can be above or below. The wall index answers "is
  // there a wall near me", which is the wrong question for something falling
  // out of the sky — a plane over the middle of a warehouse is nowhere near a
  // wall and very much over a roof. Same ray cast as landcover; the ring
  // carries the building's OSM height, and the caller adds the terrain under it
  // to get the actual height of the roof at that spot.
  function buildRoofIndex(frame, geom) {
    var rings = [], src = (geom && geom.bld) || [];
    for (var i = 0; i < src.length; i++) rings.push([src[i][0] || 8, src[i][1], '']);
    return buildLandIndex(frame, { land: rings });
  }
  // null, or { height } in metres above the building's own base.
  function roofAt(index, x, z) {
    var r = (index && index.length) ? landAt(index, x, z) : null;
    return r ? { height: r.id } : null;
  }

  function scatter(frame, tile, geom, roadIndex, wallIndex, landIndex, coverAt) {
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

    // One tree, all checks included: road clearance, building clearance,
    // ground, slope, species, mesh, trunk, shadow. Returns whether it grew.
    // `dense` marks a closed-canopy wood, where most trees skip the baked
    // shadow — under a real canopy the floor is one shade, and a thousand
    // overlapping shadow polygons per tile is fill-rate spent proving it.
    function plantAt(x, z, rA, rB, rC, species, bush, orchard, dense) {
      var road = nearestRoad(roadIndex, x, z);
      if (road && road.dist < road.halfWidth + TREE_CLEAR) return false;
      probe.length = 0;
      nearWalls(wallIndex, x, z, probe);
      for (var w = 0; w < probe.length; w += 4) {
        // Anything within a few metres of a footprint edge is a courtyard, a
        // pavement or the inside of the building itself.
        if (segDist(x, z, probe[w], probe[w + 1], probe[w + 2], probe[w + 3]) < 5) return false;
      }
      var y = root.Terrain.heightAt(frame, x, z);
      if (y === null) { groundMisses++; return false; }   // not loaded — the tile is a guess
      if (y < 0.6) return false;                          // in the sea
      // No trees on a cliff: sample the slope the same way the car does.
      var yn = root.Terrain.heightAt(frame, x + 6, z), ye = root.Terrain.heightAt(frame, x, z + 6);
      if (yn !== null && ye !== null && Math.max(Math.abs(yn - y), Math.abs(ye - y)) > 4.2) return false;

      var h = 5.5 + rA * 7.5, rad = 1.7 + rB * 2.1;
      // Conifer above the treeline-ish, broadleaf below, and a few dying back
      // to autumn either way — the guess, used only where nothing is tagged.
      var conifer = y > 900 || rC < 0.06;
      if (species === 'conifer') conifer = true;
      else if (species === 'broad') conifer = false;
      else if (species === 'mixed') conifer = rC < 0.45;   // a real mixed wood
      // Scrub and heath are waist-high and wide, not small trees. Getting
      // this wrong is what makes moorland look like a nursery.
      if (bush) { h = 1.1 + rA * 1.3; rad = 1.3 + rB * 1.4; conifer = false; }
      // An orchard is PLANTED, and the giveaway is that it is in rows.
      if (orchard) { h = bush ? h : 4.2 + rA * 1.6; rad = bush ? rad : 2.0 + rB * 0.7; }
      // Closed canopy: taller, broader crowns that actually meet. The gap
      // between neighbours is what read as "parkland" before.
      if (dense && !bush && !orchard) { h = 7.0 + rA * 9.0; rad = 2.2 + rB * 2.6; }
      var tint = conifer ? [0.16 + rA * 0.05, 0.30 + rB * 0.07, 0.20 + rA * 0.05]
                         : [0.22 + rB * 0.14, 0.38 + rA * 0.12, 0.16 + rB * 0.08];
      if (rB > 0.93) tint = [0.52, 0.40, 0.16];       // one in fifteen has turned
      var th = conifer ? h * 1.25 : h, tr = conifer ? rad * 0.62 : rad;
      if (bush) { th = h; tr = rad; }
      tree(x, y, z, th, tr, tint, out);
      // The trunk as a small square of wall segments. A single segment would
      // be a flat plank the car can slide along the edge of; four make a post
      // that pushes you out whichever way you hit it.
      // A BUSH IS NOT A BOLLARD. Scrub you cannot drive through turns open
      // moorland into a maze, and the point of a trunk is that leaving the
      // road costs something — a gorse bush does not.
      var tw = Math.max(0.22, tr * 0.14);
      if (!bush) {
        trunks.push(x - tw, z - tw, x + tw, z - tw,
                    x + tw, z - tw, x + tw, z + tw,
                    x + tw, z + tw, x - tw, z + tw,
                    x - tw, z + tw, x - tw, z - tw);
      }
      if (!dense || rC < 0.4) shade.push(x, y, z, tr, th);
      planted++;
      return true;
    }

    // Wood sites that took, remembered for the densifying pass below.
    var woodSites = [];

    for (var gx = Math.floor(x0 / TREE_STEP); gx * TREE_STEP < x1 && planted < TREE_MAX; gx++) {
      for (var gz = Math.floor(z0 / TREE_STEP); gz * TREE_STEP < z1 && planted < TREE_MAX; gz++) {
        var r1 = hash2(gx, gz), r2 = hash2(gx + 91.3, gz - 47.9), r3 = hash2(gx * 1.7, gz * 2.3 + 5.1);
        var x = (gx + r1) * TREE_STEP, z = (gz + r2) * TREE_STEP;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;

        // WHAT DOES OSM SAY IS HERE? A tagged ring decides both whether
        // anything grows and what it is. Where OSM is silent we keep the old
        // altitude guess, which is the honest fallback: most of the planet is
        // untagged and a world with trees only inside mapped woodland looks
        // stranger than one guessing.
        var lc = landIndex && landIndex.length ? landAt(landIndex, x, z) : null;
        var rule = lc ? LAND_BY_ID[lc.id] : null;
        var dense = false;
        if (rule) {
          if (!rule.plant) continue;                       // sand, rock, quarry
          // The tag's own density and NOTHING ELSE. The copse-clump filter
          // below used to run first and veto half of every mapped wood before
          // the tag was even consulted — which is why a tagged forest came out
          // at the density of a park with the density of a golf course.
          if (hash2(gx * 3.1 + 11.7, gz * 4.9 - 3.3) > rule.plant) continue;
          dense = rule.plant >= 0.8 && !rule.bush && !rule.orchard;
        } else if (coverAt && (coverAt(x, z) || 0) >= COVER_WOOD) {
          // OSM is silent but THE PHOTOGRAPH IS NOT: the drape's classifier
          // says closed canopy here (app.js treeCoverOf), so grow the same
          // forest a natural=wood tag would have grown. This is what turns
          // "clearly a forest on the satellite, bare grass in the game" into
          // a wood — most of the world's forest has no OSM polygon.
          dense = true;
        } else {
          // Clumping: trees come in copses, and a uniform scatter is the one
          // arrangement no landscape on Earth has. Guessed ground only.
          var clump = hash2(Math.floor(gx / 4) * 3.7, Math.floor(gz / 4) * 5.9);
          if (r3 > 0.20 + clump * 0.72) continue;
        }
        if (plantAt(x, z, r1, r2, r3, lc && lc.leaf, !!(rule && rule.bush),
                    !!(rule && rule.orchard), dense) && dense) {
          woodSites.push(x, z, (lc && lc.leaf) || '');
        }
      }
    }

    // THE DENSIFYING PASS. A candidate every 34 m is a tree every ~40 m, and
    // no amount of tagging makes that a forest — it is the spacing of a car
    // park. Each wood site now grows satellites around it, ROUND-ROBIN across
    // the whole tile rather than site-by-site, so when the tile cap bites the
    // entire wood thins evenly instead of the east half going bald. Offsets
    // hash off the WORLD position like everything else here, so a rebuilt tile
    // grows the same wood in the same place.
    var SATELLITES = 2;
    for (var pass = 0; pass < SATELLITES && planted < TREE_MAX; pass++) {
      for (var s = 0; s < woodSites.length && planted < TREE_MAX; s += 3) {
        var wx = woodSites[s], wz = woodSites[s + 1], wleaf = woodSites[s + 2] || null;
        var sa = hash2(wx * 0.371 + pass * 13.7, wz * 0.533 - pass * 7.1);
        var sb = hash2(wx * 0.713 - pass * 3.9, wz * 0.291 + pass * 11.3);
        var sc = hash2(wx * 0.157 + pass * 5.3, wz * 0.947 - pass * 2.7);
        var ang = sa * Math.PI * 2, dist = 8 + sb * 9;
        var px = wx + Math.cos(ang) * dist, pz = wz + Math.sin(ang) * dist;
        if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
        // The satellite must still be standing IN the wood — a ring edge is a
        // real edge, and trees marching out of it onto tagged meadow or sand
        // would erase the very boundary the mapper drew. Photographed forest
        // (no ring, mask says canopy) counts as being in the wood too.
        var plc = landAt(landIndex, px, pz);
        var prule = plc ? LAND_BY_ID[plc.id] : null;
        var inWood = prule ? (prule.plant >= 0.8 && !prule.bush && !prule.orchard)
                           : !!(coverAt && (coverAt(px, pz) || 0) >= COVER_WOOD);
        if (!inWood) continue;
        plantAt(px, pz, sb, sc, sa, (plc && plc.leaf) || wleaf, false, false, true);
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

  // Sutherland-Hodgman against the four edges of an axis-aligned rectangle. The
  // classic caveat — a concave polygon clipped this way can come back with edges
  // running along the clip boundary where two separate pieces get joined — is
  // harmless for what it is used for here: those edges lie exactly on a tile
  // border, and the neighbouring tile fills the other side with water at its own
  // level, so the join is under water either way.
  function clipToRect(poly, r) {
    var edges = [
      function (p) { return p.x >= r.minX; }, function (p) { return p.x <= r.maxX; },
      function (p) { return p.z >= r.minZ; }, function (p) { return p.z <= r.maxZ; },
    ];
    // Where the segment a->b crosses the boundary this edge tests.
    var cuts = [
      function (a, b) { return { t: (r.minX - a.x) / (b.x - a.x), axis: 'x', at: r.minX }; },
      function (a, b) { return { t: (r.maxX - a.x) / (b.x - a.x), axis: 'x', at: r.maxX }; },
      function (a, b) { return { t: (r.minZ - a.z) / (b.z - a.z), axis: 'z', at: r.minZ }; },
      function (a, b) { return { t: (r.maxZ - a.z) / (b.z - a.z), axis: 'z', at: r.maxZ }; },
    ];
    var out = poly;
    for (var e = 0; e < 4 && out.length; e++) {
      var inside = edges[e], cut = cuts[e], next = [];
      for (var i = 0; i < out.length; i++) {
        var a = out[i], b = out[(i + 1) % out.length];
        var ain = inside(a), bin = inside(b);
        if (ain) next.push(a);
        if (ain !== bin) {
          var c = cut(a, b);
          if (isFinite(c.t)) {
            next.push(c.axis === 'x'
              ? { x: c.at, z: a.z + (b.z - a.z) * c.t }
              : { x: a.x + (b.x - a.x) * c.t, z: c.at });
          }
        }
      }
      out = next;
    }
    return out;
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
  function build(frame, geom, tile, coverAt) {
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
      // [5] is what carries it. Absent on a tile cached before that was parsed,
      // which reads as 0 — on the ground — i.e. exactly the old behaviour.
      var carry = geom.ways[i][5] || 0;
      var dpts = densify(pts, ROAD_STEP);
      var liftFor = ROAD_LIFT + cls.rank * 0.012;
      var deck = carry ? carryProfile(frame, dpts, liftFor, carry) : null;
      ribbon(frame, dpts, width / 2, liftFor, roads,
             cls.tone, surf, lanes || Math.max(1, Math.round(cls.w / 3.4)), deck);
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

    // Lakes and pools are the same geometry with a different colour, so this
    // runs twice rather than existing twice.
    //
    // TWO BUGS LIVED HERE, and together they are why a drive at Niagara Falls had
    // no river in it.
    //
    // 1. The level was Math.min of the ground under EVERY vertex of the ring, and
    //    `out geom` returns whole ways — a river polygon is tens of kilometres
    //    long, so most of its vertices lie outside any terrain this app will ever
    //    load. groundAt() answers `lift` (zero) for those, Math.min took the zero,
    //    and the water was meshed at y=0.3 while the ground at Niagara is ~175 m.
    //    It was not missing; it was rendered a hundred and seventy-five metres
    //    underneath the terrain and depth-tested away.
    // 2. Even with every tile loaded, ONE flat level per polygon cannot describe
    //    a river that falls fifty metres down a waterfall. The minimum is the
    //    gorge floor, so the whole upper river would be buried under its own bank.
    //
    // So the ring is CLIPPED TO THIS TILE first and levelled from what is under
    // that piece. Clipping is what makes per-tile levels legal: without it every
    // tile meshes the whole river and the copies sit at different heights,
    // stacking sheets of water across the landscape. With it, the crest and the
    // gorge below it are different tiles and each gets its own honest surface.
    var tb = tile ? root.Geo.tileBounds(tile.z, tile.x, tile.y) : null;
    var tileRect = null;
    if (tb) {
      var c1 = frame.toWorld(tb.north, tb.west), c2 = frame.toWorld(tb.south, tb.east);
      // A margin, so neighbouring tiles' pieces overlap by a hair instead of
      // leaving a seam of dry ground along every tile border.
      var pad = 4;
      tileRect = { minX: Math.min(c1.x, c2.x) - pad, maxX: Math.max(c1.x, c2.x) + pad,
                   minZ: Math.min(c1.z, c2.z) - pad, maxZ: Math.max(c1.z, c2.z) + pad };
    }

    function waterMesh(rings) {
      var m = { pos: [], idx: [] };
      for (var w = 0; w < rings.length; w++) {
        var poly = toWorld(frame, rings[w]);
        if (poly.length > 2 && poly[0].x === poly[poly.length - 1].x && poly[0].z === poly[poly.length - 1].z) poly.pop();
        if (poly.length < 3) continue;
        if (tileRect) poly = clipToRect(poly, tileRect);
        if (poly.length < 3) continue;              // this tile holds none of it
        // Level it from the ground under THIS piece, ignoring vertices with no
        // terrain rather than reading them as sea level. A low percentile instead
        // of the strict minimum: one vertex that happens to sit on a steep bank
        // should not drag the whole surface down a cliff.
        var hs = [];
        for (var pi = 0; pi < poly.length; pi++) {
          var h = root.Terrain.heightAt(frame, poly[pi].x, poly[pi].z);
          if (h !== null) hs.push(h);
        }
        // Fewer than three real samples is not a water level, it is a guess. Skip
        // it and say so, so the tile is rebuilt when the ground arrives — drawing
        // it at zero is what buried Niagara.
        if (hs.length < 3) { groundMisses++; continue; }
        hs.sort(function (a, b) { return a - b; });
        var level = hs[Math.floor(hs.length * 0.2)];
        var tris = triangulate(poly);
        var base = m.pos.length / 3;
        for (var pj = 0; pj < poly.length; pj++) m.pos.push(poly[pj].x, level + 0.3, poly[pj].z);
        for (var ti = 0; ti < tris.length; ti++) m.idx.push(base + tris[ti]);
      }
      return m;
    }
    var water = waterMesh(geom.wat || []);
    var poolWater = waterMesh(geom.pool || []);

    // The road index and a buildings-only wall index come FIRST, because the
    // scatter asks both of them where it may not plant. The wall index is then
    // rebuilt WITH the trunks in it, so the car collides with trees through
    // exactly the same path it collides with buildings — one collision system,
    // not two. Bucketing a few hundred segments twice is microseconds at tile
    // build time and it keeps the ordering honest.
    var roadIndex = buildIndex(frame, geom);
    var wallIndex = buildWallIndex(frame, geom);
    var landIndex = buildLandIndex(frame, geom);
    var scenery = root.Sources.current.quality === 'normal'
      ? scatter(frame, tile, geom, roadIndex, wallIndex, landIndex, coverAt) : null;
    if (scenery && scenery.trunks.length) wallIndex = buildWallIndex(frame, geom, scenery.trunks);
    var shadows = buildShadows(frame, geom, scenery ? scenery.shade : []);

    return {
      roads: pack(roads, ['pos', 'uv', 'tone', 'rinfo']),
      buildings: pack(walls, ['pos', 'nrm', 'tone', 'binfo']),
      water: pack(water, ['pos']),
      pools: pack(poolWater, ['pos']),
      trees: scenery ? scenery.mesh : null,
      shadows: shadows.buildings,
      treeShadows: shadows.trees,
      // Where this tile sits, so the draw loop can drop DISTANT scenery without
      // rebuilding anything. Trees are the most numerous thing in the world and
      // the ones a kilometre away are a green haze the fog eats anyway.
      centre: tileCentre(frame, tile),
      paths: paths,
      index: roadIndex,
      wet: buildWaterIndex(frame, geom),
      roofs: buildRoofIndex(frame, geom),
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
  // x1,z1,x2,z2,halfWidth,cruise,surface,nameId,deckY1,deckY2
  // The last two are the height of the CARRIAGEWAY at each end of the segment
  // where the road is a structure, and NO_DECK where it is ordinary ground. That
  // is what lets the car ride a bridge it can see: without it the deck was drawn
  // over the gorge while the car went on asking the terrain how high it was, so
  // you drove through the bridge and down to the river.
  var STRIDE = 10;
  var NO_DECK = -1e9;   // a sentinel that always loses a Math.max against real ground
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
      // The deck, from the SAME profile the mesh is built from, so the surface you
      // drive on is the surface you see. ROAD_LIFT is deliberately not added here:
      // that millimetre exists to stop coplanar tarmac z-fighting, not to raise
      // the road the car sits on.
      var carry = geom.ways[w][5] || 0;
      var prof = carry ? carryEnds(frame, pts, carry) : null;
      var sAlong = 0;
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1];
        var idx = segs.length / STRIDE;
        var segLen = Math.hypot(b.x - a.x, b.z - a.z);
        var dy1 = NO_DECK, dy2 = NO_DECK;
        if (prof) {
          dy1 = carryYAt(prof, frame, a.x, a.z, sAlong, 0);
          dy2 = carryYAt(prof, frame, b.x, b.z, sAlong + segLen, 0);
        }
        sAlong += segLen;
        // The same half width the RIBBON was built with, or "am I on tarmac"
        // answers about a road of a different size from the one being drawn.
        segs.push(a.x, a.z, b.x, b.z, half, cls.cruise, surf, nameId, dy1, dy2);
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
  // The nearest CARRIAGEWAY DECK, if you are standing on one. Separate from
  // nearestRoad because the nearest road is usually not the structure: at the
  // mouth of a bridge the slip road alongside is closer, and answering with that
  // would report no deck at all. Only segments that actually carry one are
  // considered, and only while you are within the width of the thing.
  function nearestDeck(index, x, z) {
    if (!index) return null;
    var cx = Math.floor(x / index.cell), cz = Math.floor(z / index.cell);
    var best = Infinity, bestY = 0, bestHalf = 0;
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      var list = index.map[(cx + dx) + ',' + (cz + dz)];
      if (!list) continue;
      for (var i = 0; i < list.length; i++) {
        var o = list[i] * STRIDE;
        var y1 = index.segs[o + 8];
        if (y1 <= NO_DECK / 2) continue;              // ordinary ground
        var ax = index.segs[o], az = index.segs[o + 1];
        var bx = index.segs[o + 2], bz = index.segs[o + 3];
        var vx = bx - ax, vz = bz - az;
        var len2 = vx * vx + vz * vz;
        var t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
        var px = ax + vx * t, pz = az + vz * t;
        var d = Math.hypot(x - px, z - pz);
        var half = index.segs[o + 4];
        if (d > half + 1.0) continue;                 // beside it, not on it
        if (d < best) { best = d; bestHalf = half; bestY = y1 + (index.segs[o + 9] - y1) * t; }
      }
    }
    return best === Infinity ? null : { dist: best, halfWidth: bestHalf, deckY: bestY };
  }

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
  // A pitched roof, hipped or gabled, over an arbitrary footprint.
  //
  // The first version of this laid the ridge along the NORTH/EAST bounding box
  // and fanned every eave up to whichever of the ridge's two ENDPOINTS was
  // nearer. Both parts are wrong for real buildings and together they are what
  // made so many house roofs lopsided and spiky:
  //
  //   1. OSM buildings are not axis-aligned. A house rotated 30 degrees has an
  //      AABB far larger than itself, so spanX/spanZ describe the box and not
  //      the house — the "long axis" could come out perpendicular to the actual
  //      ridge, and the ridge could run outside the footprint entirely.
  //   2. With only two possible apexes, adjacent edges could pick DIFFERENT
  //      endpoints in a non-contiguous order. Neighbouring triangles then rise
  //      to points metres apart and the surface tears — visible as the sharp
  //      angular creases, and as triangles crossing straight through each other.
  //
  // Now: the ridge runs along the footprint's OWN principal axis (2x2 PCA of
  // the corners, which is exact for the rectangles most houses are), and each
  // eave rises to the nearest point ON the ridge segment rather than to an end
  // of it. That is what a hip roof actually is — two long slopes meeting a
  // ridge line, two ends folding in to its tips — and because the apex now
  // varies continuously along the ridge, adjacent triangles share an edge
  // instead of arguing about it.
  function roofOver(poly, base, top, ridge, seed, tone, out) {
    var cx = cxOf(poly), cz = czOf(poly);
    // Principal axis, from the second moments about the centroid. The closed
    // form for the dominant eigenvector of a symmetric 2x2 is one atan2.
    var sxx = 0, szz = 0, sxz = 0;
    for (var q = 0; q < poly.length; q++) {
      var dx = poly[q].x - cx, dz = poly[q].z - cz;
      sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
    }
    var theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    var ux = Math.cos(theta), uz = Math.sin(theta);      // along the ridge
    var vx = -uz, vz = ux;                                // across it
    // Extents in the building's own frame, not the world's.
    var uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (var w = 0; w < poly.length; w++) {
      var ex = poly[w].x - cx, ez = poly[w].z - cz;
      var pu = ex * ux + ez * uz, pv = ex * vx + ez * vz;
      if (pu < uMin) uMin = pu; if (pu > uMax) uMax = pu;
      if (pv < vMin) vMin = pv; if (pv > vMax) vMax = pv;
    }
    var long = uMax - uMin, short = vMax - vMin;
    // If PCA picked the SHORT side (it can, on a footprint that is nearly
    // square or strongly L-shaped), swap — a ridge should run the long way.
    if (short > long) {
      var t0 = ux; ux = vx; vx = -t0;
      var t1 = uz; uz = vz; vz = -t1;
      var t2 = long; long = short; short = t2;
      var t3 = uMin; uMin = vMin; vMin = t3;
      var t4 = uMax; uMax = vMax; vMax = t4;
    }
    // GABLE or HIP, by the building's own seed. Both are common, and a street
    // where every roof is hipped looks as manufactured as one where every roof
    // is a pyramid. The ridge is centred on the footprint's own extent rather
    // than on the centroid, which matters for an L: the centroid of an L is not
    // half way along it.
    // A RIDGE ONLY WORKS OVER A QUAD, and that is geometry rather than taste.
    // The two slopes meet along the ridge only if opposite sides project onto
    // the SAME span of it. For a four-cornered footprint they do. For an L or a
    // hexagon they do not — each side lands on its own stretch of ridge, the
    // two slopes never share an edge, and the roof comes apart into open flaps
    // with gaps along the top. Closing that properly needs a straight skeleton,
    // which is a real algorithm and not one to half-build.
    //
    // So anything that is not a quad gets a PYRAMID: half = 0 collapses both
    // ridge ends onto one point, every face becomes a triangle to that apex,
    // and a cone over a polygon is closed by construction whatever its shape.
    // A hipped L would be nicer; an L with holes in its roof is not.
    var gable = seed > 0.5 && poly.length === 4;
    var mid = (uMin + uMax) / 2;
    var half = poly.length === 4
      ? (gable ? long / 2 : Math.max(0, (long - short) / 2))
      : 0;
    var rax = cx + ux * (mid - half), raz = cz + uz * (mid - half);
    var rbx = cx + ux * (mid + half), rbz = cz + uz * (mid + half);

    // Project a footprint CORNER onto the ridge segment, clamped to its ends.
    // Corners, not edge midpoints — that distinction is the whole of whether
    // the roof is a closed surface. Projecting midpoints gives every edge its
    // OWN apex, so two neighbouring triangles meet at a single corner point
    // with a wedge-shaped hole between them, and the roof reads as a set of
    // loose flaps rather than a lid. Projecting corners means the face for
    // edge (p0,p1) and the face for (p1,p2) share BOTH the corner p1 and its
    // ridge point, which is a shared edge, which is a closed surface.
    function onRidge(px, pz) {
      var t = (px - rax) * (rbx - rax) + (pz - raz) * (rbz - raz);
      var len2 = (rbx - rax) * (rbx - rax) + (rbz - raz) * (rbz - raz);
      t = len2 > 1e-6 ? Math.max(0, Math.min(1, t / len2)) : 0;
      return { x: rax + (rbx - rax) * t, z: raz + (rbz - raz) * t };
    }

    for (var e = 0; e < poly.length; e++) {
      var p0 = poly[e], p1 = poly[(e + 1) % poly.length];
      var a0 = onRidge(p0.x, p0.z), a1 = onRidge(p1.x, p1.z);
      // A hip END collapses both corners onto the same ridge tip, so the quad
      // degenerates to the triangle a hip end actually is.
      var same = Math.abs(a0.x - a1.x) < 1e-4 && Math.abs(a0.z - a1.z) < 1e-4;
      // Face normal from the real geometry rather than from the eave direction:
      // with a sloping ridge line the two are not the same, and lighting that
      // disagrees with the surface is what makes a roof look faceted.
      var ux = p1.x - p0.x, uy = 0, uz2 = p1.z - p0.z;
      var vx2 = a0.x - p0.x, vy2 = ridge, vz2 = a0.z - p0.z;
      var nx2 = uy * vz2 - uz2 * vy2, ny2 = uz2 * vx2 - ux * vz2, nz2 = ux * vy2 - uy * vx2;
      var nl = Math.hypot(nx2, ny2, nz2) || 1;
      nx2 /= nl; ny2 /= nl; nz2 /= nl;
      if (ny2 < 0) { nx2 = -nx2; ny2 = -ny2; nz2 = -nz2; }   // roofs face up
      var r0 = out.pos.length / 3;
      out.pos.push(p0.x, top, p0.z, p1.x, top, p1.z, a1.x, top + ridge, a1.z);
      if (!same) out.pos.push(a0.x, top + ridge, a0.z);
      var vcount = same ? 3 : 4;
      for (var k = 0; k < vcount; k++) {
        out.nrm.push(nx2, ny2, nz2);
        out.tone.push(tone + 0.05);
        out.binfo.push(base, seed, 8);            // 8 = tile, never a wall
      }
      out.idx.push(r0, r0 + 2, r0 + 1);
      if (!same) out.idx.push(r0, r0 + 3, r0 + 2);
    }
  }

  // How far a roof oversails its walls. Not decoration — it is a CORRECTION.
  //
  // OSM building outlines are overwhelmingly traced from aerial imagery, and
  // what an aerial photograph shows is the ROOF, eaves included. So the mapped
  // polygon is the roof outline, not the wall line, and extruding walls
  // straight up it draws every building slightly too big — consistently, in
  // every town, in a way that shows up as streets feeling narrower than they
  // are and gaps between houses closing up.
  //
  // So the walls are INSET from the traced ring and the roof keeps it. That
  // gets both facts right at once: the building is the size the survey implies,
  // and the eave overhang (with its shadow line, which is most of what the eye
  // reads as "roof") comes out of the same number instead of being invented on
  // top of an already-too-large box.
  var OVERHANG = 0.4;
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
    // The traced ring is the ROOF. Keep it, and stand the walls inside it.
    // Tiny footprints (a bin store, a porch) would invert under an inset, so
    // they keep their outline and simply have no eaves.
    var roofRing = poly;
    if (Math.abs(signed) / 2 > 12) {
      var shrunk = outset(poly, -OVERHANG);
      var sa = 0;
      for (var si = 0; si < shrunk.length; si++) {
        var sb = shrunk[(si + 1) % shrunk.length];
        sa += shrunk[si].x * sb.z - sb.x * shrunk[si].z;
      }
      if (sa > 0) poly = shrunk;      // still wound the right way: it did not invert
    }
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
      roofOver(roofRing, base, top, ridge, seed, tone, out);
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

    // Flat roof — also drawn on the TRACED ring, so it oversails the walls by
    // the same overhang a pitched one does.
    var tris = triangulate(roofRing);
    var rbase = out.pos.length / 3;
    for (var r = 0; r < roofRing.length; r++) {
      out.pos.push(roofRing[r].x, top, roofRing[r].z);
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
    nearestDeck: nearestDeck,
    nearWalls: nearWalls, segDist: segDist, namesNear: namesNear, inWater: inWater, waterAt: waterAt, DROWN_AREA: DROWN_AREA, roofAt: roofAt,
    // The mirror pool, exported so a suite can watch it route.
    rankMirrors: rankMirrors, mirrorScore: mirrorScore, tileState: tileState,
    // Why a tile is not here yet, and how each mirror is behaving. The status
    // panel reads these; nothing else may need them, and that is fine — an
    // app that cannot explain itself is an app you argue with.
    tileError: function (key) { return lastErr[key] || null; },
    // The mirrors that would serve THIS spot, in the order the router would
    // pick them — the same rankMirrors the fetcher uses, so the panel cannot
    // describe a policy the app does not follow.
    mirrorHealth: function (lat, lon) {
      var pool = rankMirrors(lat, lon);
      var out = [];
      for (var i = 0; i < pool.length; i++) {
        var src = pool[i];
        var st = statFor(src.url), q = root.Net.hostState(st.host);
        out.push({ name: src.name, host: st.host, lat: Math.round(st.lat), fails: st.fails,
                   backoffMs: q.busyMs, pending: q.pending, active: q.active, strikes: q.strikes });
      }
      return out;
    },
    // The road index, buildable from any fetched geometry — the race flag needs
    // to ask "where is the nearest road" about a tile it has no mesh for and is
    // nowhere near.
    buildIndex: buildIndex,
    noteLatency: noteLatency, noteFail: noteFail,
    mirrorStats: function () { return mirrorStat; },
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
    cacheBytes: cacheBytes, setCacheBudget: setCacheBudget, isCached: isCached,
    // Pure decisions, exported so a suite can assert them directly. Guessing a
    // height and recognising a brand both have loud visual consequences and
    // neither is observable from the far end of build(), which only ever hands
    // back triangles — by then a two-storey house and a five-storey office are
    // the same array of numbers.
    heightOf: buildingHeight, brandOf: packBrand, areaOf: ringAreaM2,
    // roofOver too: a roof's SHAPE is geometry, and the only way to see whether
    // a ridge runs the length of a house is to read the vertices. From the far
    // end of build() it is an undifferentiated triangle soup.
    roofOver: roofOver,
    // Landcover: which ring is this point standing on, and what does the ring
    // say grows there. Both pure, and neither observable from the far end of
    // build() — by then a wood and a car park are the same triangles.
    landIndexOf: buildLandIndex, landAt: landAt, LAND: LAND,
    // Exported so a suite can drive the multipolygon stitcher directly: a ring
    // that does not close is a PHANTOM LAKE (landAt closes it with a straight
    // line across the map), and that is a car drowning on dry land.
    assembleRings: assembleRings, carryOf: carryOf,
  };
})(window);
