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
  var ROADS = [
    { id: 'overpass-de', name: 'overpass-api.de', url: 'https://overpass-api.de/api/interpreter',
      attribution: 'Roads: © OpenStreetMap contributors (ODbL)' },
    { id: 'overpass-kumi', name: 'Kumi Systems', url: 'https://overpass.kumi.systems/api/interpreter',
      attribution: 'Roads: © OpenStreetMap contributors (ODbL)' },
    { id: 'overpass-ch', name: 'overpass.osm.ch', url: 'https://overpass.osm.ch/api/interpreter',
      attribution: 'Roads: © OpenStreetMap contributors (ODbL)' },
  ];

  // ---- imagery: the optional satellite drape -------------------------------
  // Routed through gifos.api, so the key lives in GifOS Settings and the app
  // never sees it. Off by default and never required: the stylised look is the
  // product, and this is the upgrade for anyone who wants photographs.
  var IMAGERY = [
    { id: 'none', name: 'Stylised (no imagery)', api: null,
      note: 'Flat-shaded terrain. No key, nothing to set up.', attribution: '' },
    { id: 'maptiler', name: 'MapTiler Satellite', api: 'maptiler',
      path: '/tiles/satellite-v2/{z}/{x}/{y}.jpg',
      note: 'Needs your own MapTiler key (free tier is generous). Settings → Third-party APIs.',
      hint: 'Create a free key at maptiler.com, then set the base URL to https://api.maptiler.com',
      attribution: 'Imagery: © MapTiler © OpenStreetMap contributors',
      maxZoom: 18 },
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
    terrain: 'aws-terrarium', roads: 'overpass-de', imagery: 'none', quality: 'normal',
    // 'auto' = cruise, no throttle control at all. The default, because a
    // throttle you must hold is the thumb that should be steering.
    throttle: 'auto',
    steering: 'touch',      // legacy; superseded by `scheme`
    scheme: 'wheel',        // 'wheel' | 'stick' | 'tilt'
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
        if (rec.quality) current.quality = rec.quality;
        if (rec.throttle === 'auto' || rec.throttle === 'manual') current.throttle = rec.throttle;
        if (rec.steering === 'touch' || rec.steering === 'tilt') current.steering = rec.steering;
        if (['wheel','stick','tilt'].indexOf(rec.scheme) >= 0) current.scheme = rec.scheme;
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
    onChange: function (cb) { listeners.push(cb); },
    get current() { return current; },
    get terrain() { return byId(TERRAIN, current.terrain); },
    get roads() { return byId(ROADS, current.roads); },
    get imagery() { return byId(IMAGERY, current.imagery); },
  };
})(window);
