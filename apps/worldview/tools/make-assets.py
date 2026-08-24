#!/usr/bin/env python3
"""
make-assets.py — bake the OFFLINE half of Worldview into apps/worldview/assets/.

Everything this writes travels INSIDE the App GIF, because the platform law is
that an app loads nothing from the network at mount (apps/README.md, llms.txt).
That is also the product: NASA Worldview shows a grey void with no connection;
this one still shows the Earth, the coastlines, the borders and every place you
can search for. The live GIBS imagery lands on top of it when there IS a
connection.

Three assets, from three public-domain / permissive upstreams:

  base.jpg     NASA Blue Marble (equirectangular, EPSG:4326 — the SAME
               projection the map draws in, so it maps 1:1 onto the world).
               Source bytes: three.js's copy of the NASA Visible Earth texture,
               https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg
               NASA imagery is public domain (credit: NASA Visible Earth).

  world.bin    Coastlines + country borders, from world-atlas (Natural Earth
               50m, public domain), `npm pack world-atlas@2` -> countries-50m.json.
               Re-encoded here as zig-zag varint deltas over TopoJSON's own
               quantised integer grid: the JSON is 756 KB, this is ~130 KB, and
               the app decodes it in one pass at boot.

  places.json  An offline gazetteer, from Natural Earth populated places
               (public domain), ne_50m_populated_places_simple.geojson. Search
               works on a plane; the real Worldview's place search is a network
               geocoder call.

Run (from the repo root), with the three upstream files in a directory:

    python3 apps/worldview/tools/make-assets.py --src /tmp/wv-src

The generated assets are COMMITTED (same doctrine as the store catalog: Pages
serves static files and the GIF is built from the tree, so a generated asset
that is not in the tree does not exist).
"""
import argparse
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets'))

# ---------------------------------------------------------------- base.jpg ---
# 2048x1024 is the whole Earth at ~10 km/px: enough to look like a photograph
# down to about zoom 3, and 1/25th the bytes of the 8k texture. Above that zoom
# the live GIBS tiles are what you are looking at anyway, and the base is only
# the thing filling the swath gaps and the polar night.
BASE_W, BASE_H = 2048, 1024
BASE_Q = 82


def make_base(src):
    from PIL import Image
    im = Image.open(os.path.join(src, 'earth_atmos_2048.jpg')).convert('RGB')
    if im.size != (BASE_W, BASE_H):
        im = im.resize((BASE_W, BASE_H), Image.LANCZOS)
    p = os.path.join(OUT, 'base.jpg')
    im.save(p, 'JPEG', quality=BASE_Q, optimize=True, progressive=False)
    return p


# ---------------------------------------------------------------- world.bin --
# TopoJSON's arcs are ALREADY delta-encoded integers on a quantised grid, which
# is most of the work. What is left is (a) telling coastline from border, and
# (b) not shipping JSON.
#
# (a) is the classic topology trick: an arc used by exactly one polygon ring is
#     an outer edge — a coastline. An arc shared by two is an internal border.
#     Doing it here means the app never needs a topology library.
# (b) zig-zag varints. Deltas are tiny (a few grid units), so most points cost
#     two bytes instead of the ~12 they cost as JSON text.
#
# Wire format, little-endian:
#   "WVW1"                      magic
#   f64 scaleX, scaleY, transX, transY    (TopoJSON's own transform)
#   u32 nCoast, u32 nBorder     polyline counts, coast first then border
#   then nCoast + nBorder polylines, each:
#     varint nPoints
#     varint zigzag dx, dy      (first pair is absolute, on the grid)

def varint(v, out):
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def zig(v):
    return (v << 1) ^ (v >> 63) if v < 0 else (v << 1)


def arc_usage(objs):
    """How many rings use each arc (by absolute index)."""
    use = {}

    def walk(g):
        t = g.get('type')
        if t == 'GeometryCollection':
            for sub in g['geometries']:
                walk(sub)
            return
        arcs = g.get('arcs')
        if arcs is None:
            return
        rings = [arcs] if t == 'Polygon' else (arcs if t == 'MultiPolygon' else [])
        if t == 'Polygon':
            rings = arcs
        elif t == 'MultiPolygon':
            rings = [r for poly in arcs for r in poly]
        else:
            return
        for ring in rings:
            for a in ring:
                i = ~a if a < 0 else a
                use[i] = use.get(i, 0) + 1

    walk(objs)
    return use


def make_world(src):
    topo = json.load(open(os.path.join(src, 'countries-50m.json')))
    tr = topo['transform']
    use = arc_usage(topo['objects']['countries'])
    coast, border = [], []
    for i, arc in enumerate(topo['arcs']):
        n = use.get(i, 0)
        # An arc nobody uses is not on the map; 2+ users is an inland border.
        if n == 0:
            continue
        (coast if n == 1 else border).append(arc)

    out = bytearray(b'WVW1')
    out += struct.pack('<4d', tr['scale'][0], tr['scale'][1], tr['translate'][0], tr['translate'][1])
    out += struct.pack('<2I', len(coast), len(border))
    for arc in coast + border:
        varint(len(arc), out)
        for dx, dy in arc:
            varint(zig(int(dx)), out)
            varint(zig(int(dy)), out)
    p = os.path.join(OUT, 'world.bin')
    open(p, 'wb').write(bytes(out))
    return p, len(coast), len(border)


# -------------------------------------------------------------- places.json --
# What earns a place a spot in a gazetteer that has to fit in an icon: it is a
# capital, a megacity, or Natural Earth's own scalerank says a world map at this
# size would label it. That lands around 1300 entries — every capital on Earth,
# every city most people could name, and the ones you would actually type.
#
# Shape is columnar (parallel arrays) rather than a list of objects: the same
# data, a third of the bytes, and the app builds its search index in one loop.
PLACE_RANK_MAX = 7


def make_places(src):
    gj = json.load(open(os.path.join(src, 'ne_50m_populated_places_simple.geojson')))
    rows = []
    for f in gj['features']:
        p = f['properties']
        cap = int(p.get('adm0cap') or 0)
        rank = int(p.get('scalerank') if p.get('scalerank') is not None else 20)
        pop = int(p.get('pop_max') or 0)
        if not (cap or rank <= PLACE_RANK_MAX or pop >= 2_000_000):
            continue
        name = p.get('name') or p.get('nameascii')
        if not name:
            continue
        lon, lat = f['geometry']['coordinates'][:2]
        rows.append((name, p.get('adm0name') or '', round(float(lat), 3),
                     round(float(lon), 3), pop, cap))
    # Biggest first: the search box should answer "Lo" with London, not Lobito,
    # and a prefix match ordered by population is the whole ranking algorithm.
    rows.sort(key=lambda r: (-r[5], -r[4]))
    data = {
        'v': 1,
        'source': 'Natural Earth 50m populated places (public domain)',
        'name': [r[0] for r in rows],
        'country': [r[1] for r in rows],
        'lat': [r[2] for r in rows],
        'lon': [r[3] for r in rows],
        'pop': [r[4] for r in rows],
        'cap': [r[5] for r in rows],
    }
    p = os.path.join(OUT, 'places.json')
    open(p, 'w').write(json.dumps(data, separators=(',', ':'), ensure_ascii=False))
    return p, len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='directory holding the three upstream files')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    b = make_base(a.src)
    w, nc, nb = make_world(a.src)
    pl, np_ = make_places(a.src)
    for p in (b, w, pl):
        print('%-42s %8.1f KB' % (os.path.relpath(p), os.path.getsize(p) / 1024))
    print('coastline polylines: %d, border polylines: %d, places: %d' % (nc, nb, np_))


if __name__ == '__main__':
    sys.exit(main())
