/*
 * THE WORLDVIEW CATALOG IS DATA, AND THE APP CANNOT TELL WHEN IT IS WRONG.
 *
 * apps/worldview/assets/catalog.json says, for 74 NASA layers, which WMTS tile
 * matrix set to ask for, which format, how often the data changes and when the
 * record starts. Every one of those is used to BUILD A URL — and GIBS answers a
 * wrong URL with 404, which is exactly what it answers for a day with no
 * imagery. A typo in this file therefore ships as a layer that is silently,
 * permanently empty: no error, no console, nothing to notice.
 *
 * So the shape is checked here, in the fast tier, where it costs nothing:
 *
 *   - ids unique, and every field the URL builder reads actually present
 *   - the tile matrix set is one GIBS defines, and the zoom depth matches it
 *   - JPEG for opaque base imagery, PNG for anything drawn over it
 *   - dates are real dates, in the past, in order
 *   - every layer sits in a measurement, and every measurement in a category —
 *     a layer in no category is a layer nobody can find in the browser
 *   - every tour points at layers that exist and a date the app can parse
 *   - every gifos.db collection the app opens is declared in the manifest
 *     (an undeclared collection does not sync and the user is never told it
 *     exists), and every declared one is actually used
 *   - the app loads nothing from the network at mount: no <script src="http">,
 *     no remote stylesheet, no url(http…) in the CSS. That is the platform's
 *     law and this is the cheapest place to enforce it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const APP = path.join(ROOT, 'apps', 'worldview');

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

const catalog = JSON.parse(fs.readFileSync(path.join(APP, 'assets', 'catalog.json'), 'utf8'));
const tours = JSON.parse(fs.readFileSync(path.join(APP, 'tours.json'), 'utf8')).tours;
const manifest = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.json'), 'utf8'));
const places = JSON.parse(fs.readFileSync(path.join(APP, 'assets', 'places.json'), 'utf8'));

// ---- the catalog ------------------------------------------------------------
check('the catalog carries a real set of layers', catalog.layers.length >= 70, catalog.layers.length + ' layers');

const ids = catalog.layers.map((l) => l.id);
check('every layer id is unique', new Set(ids).size === ids.length);

// GIBS names its EPSG:4326 matrix sets after the imagery resolution; these are
// the ones it defines, with the deepest level each one goes to.
const SETS = { '2km': 5, '1km': 6, '500m': 7, '250m': 8, '31.25m': 11, '15.625m': 12 };
const PERIODS = ['daily', 'monthly', 'yearly', 'static', '8day', '16day', '30min', '10min'];
const bad = [];
catalog.layers.forEach((l) => {
  const why = [];
  if (!l.title) why.push('no title');
  if (!l.m) why.push('no measurement');
  if (l.group !== 'base' && l.group !== 'overlay') why.push('group=' + l.group);
  if (l.fmt !== 'jpg' && l.fmt !== 'png') why.push('fmt=' + l.fmt);
  if (!(l.set in SETS)) why.push('set=' + l.set);
  else if (l.z !== SETS[l.set]) why.push('z=' + l.z + ' for ' + l.set);
  if (PERIODS.indexOf(l.period) < 0) why.push('period=' + l.period);
  if (l.period !== 'static' && !/^\d{4}-\d{2}-\d{2}$/.test(l.start || '')) why.push('start=' + l.start);
  if (why.length) bad.push(l.id + ': ' + why.join(', '));
});
check('every layer carries everything the URL builder reads', bad.length === 0, bad.slice(0, 3).join(' | '));

const wrongFmt = catalog.layers.filter((l) => (l.group === 'base') !== (l.fmt === 'jpg'));
check('base imagery is JPEG and everything drawn over it is PNG', wrongFmt.length === 0,
      wrongFmt.slice(0, 3).map((l) => l.id + '=' + l.fmt).join(' '));

const now = Date.now();
const badDates = catalog.layers.filter((l) => {
  if (l.period === 'static') return false;
  const s = Date.parse(l.start + 'T00:00:00Z');
  if (!(s < now)) return true;
  return l.end ? Date.parse(l.end + 'T00:00:00Z') < s : false;
});
check('every record starts in the past and ends after it starts', badDates.length === 0,
      badDates.map((l) => l.id).join(' '));

// ---- navigation: a layer nobody can find is a layer that does not exist ------
const measIds = new Set(catalog.measurements.map((m) => m.id));
const orphanLayers = catalog.layers.filter((l) => !measIds.has(l.m));
check('every layer sits in a measurement that exists', orphanLayers.length === 0,
      orphanLayers.map((l) => l.id + '->' + l.m).join(' '));

const inCategory = new Set();
catalog.categories.forEach((c) => c.measurements.forEach((m) => inCategory.add(m)));
const usedMeas = new Set(catalog.layers.map((l) => l.m));
const unreachable = Array.from(usedMeas).filter((m) => !inCategory.has(m));
check('every measurement with layers in it appears in a category', unreachable.length === 0, unreachable.join(' '));
const emptyMeas = catalog.measurements.filter((m) => !usedMeas.has(m.id));
check('no measurement is advertised with nothing in it', emptyMeas.length === 0,
      emptyMeas.map((m) => m.id).join(' '));

// ---- the gazetteer ----------------------------------------------------------
check('the gazetteer has enough places to be worth searching', places.name.length > 1000,
      places.name.length + ' places');
check('the gazetteer columns are the same length',
      places.name.length === places.lat.length && places.lat.length === places.lon.length);
const outOfRange = places.lat.filter((v, i) => Math.abs(v) > 90 || Math.abs(places.lon[i]) > 180);
check('every place is on the planet', outOfRange.length === 0, outOfRange.length + ' out of range');

// ---- the tours --------------------------------------------------------------
const known = new Set(ids.concat(['wv:base', 'wv:coast', 'wv:borders', 'wv:places', 'wv:grid']));
const tourProblems = [];
tours.forEach((t) => {
  const why = [];
  if (!t.title || !t.blurb) why.push('no words');
  t.layers.forEach((id) => { if (!known.has(id)) why.push('unknown layer ' + id); });
  if (t.date !== 'latest' && !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) why.push('date=' + t.date);
  if (Math.abs(t.lat) > 90 || Math.abs(t.lon) > 180) why.push('off the planet');
  if (!(t.span > 0)) why.push('no span');
  if (t.anim && t.anim.length < 2) why.push('bad anim range');
  // A tour that opens on a day its own layers do not cover shows an empty map.
  if (t.date !== 'latest') {
    t.layers.forEach((id) => {
      const l = catalog.layers.filter((x) => x.id === id)[0];
      if (l && l.start && Date.parse(t.date) < Date.parse(l.start)) {
        why.push(id + ' has no data on ' + t.date);
      }
    });
  }
  if (why.length) tourProblems.push(t.id + ': ' + why.join(', '));
});
check('every tour points at layers that exist, on a day they have', tourProblems.length === 0,
      tourProblems.slice(0, 3).join(' | '));
check('there are enough tours to fill the Explore sheet', tours.length >= 10, tours.length + ' tours');

// ---- the manifest matches the app -------------------------------------------
const srcFiles = fs.readdirSync(APP).filter((f) => f.endsWith('.js'));
const src = srcFiles.map((f) => fs.readFileSync(path.join(APP, f), 'utf8')).join('\n');
const opened = new Set();
const re = /gifos\.db\(\s*'([^']+)'\s*\)/g;
let m;
while ((m = re.exec(src))) opened.add(m[1]);
const declared = new Set(Object.keys(manifest.data || {}));
const undeclared = Array.from(opened).filter((c) => !declared.has(c));
check('every collection the app opens is declared in the manifest', undeclared.length === 0, undeclared.join(' '));
const unused = Array.from(declared).filter((c) => !opened.has(c));
check('every collection the manifest declares is actually used', unused.length === 0, unused.join(' '));

check('the manifest declares the one host the app talks to',
      (manifest.capabilities.network || []).length === 1 &&
      manifest.capabilities.network[0] === 'gibs.earthdata.nasa.gov',
      JSON.stringify(manifest.capabilities.network));
check('room pooling is a subset of the network list (the platform enforces it too)',
      (manifest.capabilities.pool || []).every((h) => manifest.capabilities.network.indexOf(h) >= 0));
check('the shared view is declared read-write, or an invite shares nothing',
      manifest.data.session && manifest.data.session.visibility === 'read-write');
check('the tile cache is private — imagery is not pushed at guests',
      manifest.data.tiles && manifest.data.tiles.visibility === 'private');

// ---- the platform's law: nothing loads from the network at mount ------------
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8');
check('no remote script or stylesheet in the app HTML',
      !/(src|href)\s*=\s*["']https?:/i.test(html));
check('no remote font, image or import in the CSS',
      !/url\(\s*['"]?https?:/i.test(css) && !/@import/i.test(css));
check('every script the HTML loads is a file in the app (or the one the build writes)',
      (html.match(/<script src="([^"]+)"/g) || []).every((tag) => {
        const f = /<script src="([^"]+)"/.exec(tag)[1];
        return f === 'assets.js' || fs.existsSync(path.join(APP, f));
      }));

// A store listing has to be true about the app it ships beside.
const listingPath = path.join(APP, 'listing.json');
if (fs.existsSync(listingPath)) {
  const listing = JSON.parse(fs.readFileSync(listingPath, 'utf8'));
  const words = (listing.tagline + ' ' + listing.description).toLowerCase();
  check('the listing does not promise cloud sync (there is no cloud)',
        !/sync(s|ed)? (across|to) (your )?(devices|the cloud)|backs? up to the cloud/.test(words));
  check('the listing credits NASA', /nasa/.test(words));
  check('a port names what it is a port of', !!(listing.basedOn && listing.basedOn.name && listing.porter));
  const claimed = (listing.description.match(/\b(\d{2,4}) layers\b/) || [])[1];
  check('a layer count in the listing matches the catalog',
        !claimed || +claimed === catalog.layers.length, claimed + ' vs ' + catalog.layers.length);
}

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
process.exit(failures === 0 ? 0 : 1);
