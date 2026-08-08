// Anyroad — where the world comes from.
//
// Nothing in the app hardcodes a URL. Every layer names a SOURCE, and a source
// is a small record: a URL template, how to read what comes back, and who to
// credit. Two reasons this is a registry and not three constants:
//
//  1. A GifOS app's requests all leave from the gifos.app origin, so every
//     player carries the same Referer. Distributed IPs do not help there: one
//     rule at a provider blocks every player at once. Being able to switch
//     source in-app means that is an inconvenience, not a dead app.
//  2. Imagery worth looking at is licensed. Rather than route everyone through
//     one endpoint under terms that do not cover it, the satellite drape runs
//     on the player's OWN key — their account, their quota, their terms.
//
// Adding a source whose host is not in manifest.json's capabilities.network
// will be refused by the runtime. That is the sandbox working as intended; the
// GifOS answer is to mod the GIF (its manifest travels with it) rather than to
// widen the allowlist for everyone.
(function (root) {
  'use strict';

  // ---- terrain: height, as pixels -----------------------------------------
  // "terrarium" packs metres into RGB: height = R*256 + G + B/256 - 32768.
  var TERRAIN = [
    {
      id: 'aws-terrarium',
      name: 'AWS Open Data',
      note: 'Global bare-earth elevation. No account, no key.',
      url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      encoding: 'terrarium',
      minZoom: 0, maxZoom: 15,
      attribution: 'Elevation: Tilezen / AWS Open Data (SRTM, ASTER, others)',
    },
    {
      id: 'flat',
      name: 'Flat (no elevation)',
      note: 'Skip elevation entirely — fastest, and useful on a slow link.',
      url: null,
      encoding: 'flat',
      minZoom: 0, maxZoom: 15,
      attribution: '',
    },
  ];

  // ---- roads: OpenStreetMap vector geometry via Overpass -------------------
  // Public instances are rate-limited per client IP, which in our case means
  // per player — the one place the distributed-origin argument genuinely helps.
  // Several mirrors so load spreads and one bad day is not fatal.
  //
  // `bounds` ([W,S,E,N]) is the one piece of metadata a mirror list cannot do
  // without, because NOT EVERY OVERPASS INSTANCE CARRIES THE WHOLE PLANET, and
  // a regional one does not say so — it answers 200 with an empty element list,
  // which is exactly what a genuine stretch of empty countryside looks like.
  // Measured 2026-08-07: overpass.osm.ch returns 0 ways for London, Paris,
  // Milan and New York, and full data for Zurich, Geneva and a German town 5 km
  // over the border. It was listed here as a general mirror, so switching to it
  // — the entire point of having a registry — silently produced a world with no
  // roads in it. A source that cannot serve where you are standing must be
  // knowable BEFORE it is asked, not inferred from a plausible-looking nothing.
  var ROADS = [
    // THE DEFAULT, and the only one most people should ever touch. Picking a
    // single mirror by hand means one server carries a player's whole drive
    // while two identical ones sit idle, and when that one has a bad day the
    // app has a bad day. `pool` spreads DIFFERENT tiles across every mirror
    // that covers where you are, and routes around the sick ones.
    { id: 'auto', name: 'Automatic — spread across mirrors', url: null, pool: true,
      note: 'Uses every worldwide mirror at once, one tile each, and routes around whichever is busy. Leave this alone unless you have a reason.',
      attribution: 'Roads: © OpenStreetMap contributors (ODbL)' },
    { id: 'overpass-de', name: 'overpass-api.de', url: 'https://overpass-api.de/api/interpreter',
      note: 'The main instance. Busiest, and the first to refuse a burst.',
      attribution: 'Roads: © OpenStreetMap contributors (ODbL)' },
    { id: 'overpass-kumi', name: 'Kumi Systems', url: 'https://overpass.kumi.systems/api/interpreter',
      note: 'Worldwide mirror.',
      attribution: 'Roads: © OpenStreetMap contributors (ODbL)' },
    { id: 'overpass-coffee', name: 'private.coffee', url: 'https://overpass.private.coffee/api/interpreter',
      note: 'Worldwide mirror.',
      attribution: 'Roads: © OpenStreetMap contributors (ODbL)' },
    { id: 'overpass-ch', name: 'overpass.osm.ch', url: 'https://overpass.osm.ch/api/interpreter',
      note: 'Switzerland and its border regions ONLY — fast there, empty everywhere else.',
      bounds: [5.5, 45.6, 11.0, 48.0],
      attribution: 'Roads: © OpenStreetMap contributors (ODbL)' },
  ];

  // Can the chosen roads source serve this point at all? A source with no
  // `bounds` claims the planet and is taken at its word. The pool always can,
  // because it only ever picks mirrors that cover the point.
  function roadsCover(lat, lon) {
    var src = byId(ROADS, current.roads);
    if (src.pool) return roadsPool(lat, lon).length > 0;
    var b = src.bounds;
    if (!b) return true;
    return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
  }

  // Every mirror that can actually serve this point. `bounds` earns its keep
  // twice here: it keeps a Switzerland-only extract out of a London drive, and
  // it puts that same fast local extract INTO a Zurich one.
  function roadsPool(lat, lon) {
    var out = [];
    for (var i = 0; i < ROADS.length; i++) {
      var s = ROADS[i];
      if (s.pool || !s.url) continue;
      var b = s.bounds;
      if (b && !(lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3])) continue;
      out.push(s);
    }
    return out;
  }

  // What a tile fetch should actually use: the pool when 'auto', otherwise the
  // single mirror the player pinned.
  function roadsFor(lat, lon) {
    var src = byId(ROADS, current.roads);
    return src.pool ? roadsPool(lat, lon) : [src];
  }

  // ---- imagery: the optional satellite drape -------------------------------
  // Routed through gifos.api, so the key lives in GifOS Settings and the app
  // never sees it. Off by default and never required: the stylised look is the
  // product, and this is the upgrade for anyone who wants photographs.
  var IMAGERY = [
    { id: 'none', name: 'Stylised (no imagery)', api: null,
      note: 'Flat-shaded terrain. No key, nothing to set up.', attribution: '' },
    // The path is the TILES api, not the MAPS api, and that distinction is the
    // whole bug this line used to carry. `@2x` is a Maps-API feature
    // (/maps/{id}/{size}/{z}/{x}/{y}@2x.png); on /tiles/ it is a 404 for every
    // tileset that exists. So a player with a perfectly good key got 404 on
    // every tile and a HUD note reading "check the key in GifOS Settings" —
    // sent to inspect the one thing that was fine. Verified against the live
    // API: `.jpg` answers 200, `@2x.jpg` answers 404, and satellite-v2's own
    // tiles.json advertises exactly this template. It needs no @2x because the
    // tileset is ALREADY retina — tiles.json says scale 2, and the bytes are
    // 512x512.
    //
    // Two further traps, both settled by measurement rather than by the docs:
    // MapTiler's current documentation shows `satellite-v4`, which does not
    // exist on a live account ("Tileset with this identifier does not exist");
    // and tiles.json declares "schema":"tms", which would flip Y — it does not
    // apply to the served URL. The TMS-flipped tile for Baker Street comes back
    // as 2.8 KB of empty ocean, the XYZ one as 73 KB of Marylebone.
    { id: 'maptiler', name: 'MapTiler Satellite', api: 'maptiler',
      path: '/tiles/satellite-v2/{z}/{x}/{y}.jpg',
      note: 'Needs your own MapTiler key (free tier is generous). Add it in GifOS Settings → Third-party APIs, then pick it HERE — the key alone changes nothing until this layer is selected.',
      hint: 'Create a free key at maptiler.com, then set the base URL to https://api.maptiler.com',
      attribution: 'Imagery: © MapTiler © OpenStreetMap contributors',
      maxZoom: 22 },
  ];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  // Fill {z}/{x}/{y} in a template. Kept dumb on purpose — a source is data.
  function expand(tmpl, t) {
    return tmpl.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
  }

  // ---- the player's choice -------------------------------------------------
  // Persisted in the 'prefs' collection, which is PRIVATE: a guest joining a
  // race gets their own sources (and their own key), never the host's.
  var DEFAULTS = {
    terrain: 'aws-terrarium', roads: 'auto', imagery: 'none', quality: 'normal',
    // 'auto' = cruise, no throttle control at all. The default, because a
    // throttle you must hold is the thumb that should be steering.
    throttle: 'auto',
    steering: 'touch',      // legacy; superseded by `scheme`
    scheme: 'wheel',        // 'wheel' | 'stick' | 'tilt'
    wildlife: 'on',         // deer, sheep, geese — and the damage they cost
    traffic: 'normal',      // 'none' | 'light' | 'normal' | 'heavy'
    sound: 'on',            // engine, tyres, traffic, animals. No music.
    blaster: 'on',          // the gun on the roof, and space/tap to fire it
  };
  var current = Object.assign({}, DEFAULTS);
  var listeners = [];

  function load() {
    return root.Host.db('prefs').get('sources').then(function (rec) {
      if (rec) {
        // Only adopt keys we still recognise — a stale pref naming a removed
        // source must not strand the app on a dead layer.
        if (byId(TERRAIN, rec.terrain).id === rec.terrain) current.terrain = rec.terrain;
        if (byId(ROADS, rec.roads).id === rec.roads) current.roads = rec.roads;
        if (byId(IMAGERY, rec.imagery).id === rec.imagery) current.imagery = rec.imagery;
        if (['low', 'medium', 'normal'].indexOf(rec.quality) >= 0) current.quality = rec.quality;
        if (rec.throttle === 'auto' || rec.throttle === 'manual') current.throttle = rec.throttle;
        if (rec.steering === 'touch' || rec.steering === 'tilt') current.steering = rec.steering;
        if (['wheel','stick','tilt'].indexOf(rec.scheme) >= 0) current.scheme = rec.scheme;
        if (rec.wildlife === 'on' || rec.wildlife === 'off') current.wildlife = rec.wildlife;
        if (['none', 'light', 'normal', 'heavy'].indexOf(rec.traffic) >= 0) current.traffic = rec.traffic;
        if (rec.sound === 'on' || rec.sound === 'off') current.sound = rec.sound;
        if (rec.blaster === 'on' || rec.blaster === 'off') current.blaster = rec.blaster;
      }
      return current;
    }).catch(function () { return current; });
  }

  function set(patch) {
    Object.assign(current, patch);
    listeners.forEach(function (cb) { try { cb(current); } catch (e) {} });
    return root.Host.db('prefs').put(Object.assign({ id: 'sources' }, current)).catch(function () {});
  }

  function attribution() {
    var out = [];
    [byId(TERRAIN, current.terrain), byId(ROADS, current.roads), byId(IMAGERY, current.imagery)]
      .forEach(function (s) { if (s && s.attribution) out.push(s.attribution); });
    return out;
  }

  root.Sources = {
    TERRAIN: TERRAIN, ROADS: ROADS, IMAGERY: IMAGERY,
    load: load, set: set, expand: expand, attribution: attribution,
    roadsCover: roadsCover, roadsPool: roadsPool, roadsFor: roadsFor,
    onChange: function (cb) { listeners.push(cb); },
    get current() { return current; },
    get terrain() { return byId(TERRAIN, current.terrain); },
    get roads() { return byId(ROADS, current.roads); },
    get imagery() { return byId(IMAGERY, current.imagery); },
  };
})(window);
