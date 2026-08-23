/* Mykonos island — palette, voxel helpers, and the starter village.
 * Palette + builders are from boona13/mykonos-island-voxels (MIT) at the
 * pin in vendor/UPSTREAM.txt. Classic script: no modules. */
(function (root) {
  'use strict';

  var VPT = 4;
  var GW = 14;
  var GH = 14;

  var P = {
    white: '#fafaf5', whiteShadow: '#e6e2d3', whiteDeep: '#cfc9b7',
    cobalt: '#1b5ba8', cobaltLight: '#2e6fbc', cobaltDeep: '#134680',
    grass: '#7eaa5f', grassDark: '#5c8a44', grassLight: '#9bc377',
    sand: '#e8d4a8', sandDark: '#c9b084',
    path: '#c4b49c', pathDark: '#a89878', pathLight: '#d6c8b0',
    sea: '#6ec8e0', seaDeep: '#4da8c4', seaShine: '#a8e0ee',
    cypress: '#3d7355', cypressDark: '#28533a',
    olive: '#7a9460', oliveDark: '#5a7448', oliveLight: '#9bb37e',
    leaf: '#4a7a3e', leafDark: '#2f5527',
    bougain: '#d85b8e', bougainDark: '#b03a6a', bougainLight: '#ee84ad',
    agave: '#a4b87a', agaveDark: '#7a8e54',
    wood: '#a07344', woodDark: '#704c27', woodLight: '#bd8e5b',
    terracotta: '#c4622e', terraLight: '#dc7d44', terraDark: '#9a4720',
    roof: '#bb6b3f', roofDark: '#8b4825',
    stone: '#b5b0a2', stoneDark: '#8d8878',
    iron: '#3a3833', flame: '#ffc24a',
    flower: '#e16ea6', flowerYellow: '#f4d168', flowerWhite: '#fff8e6',
    peach: '#f0c8a8'
  };

  function box(x, y, z, w, d, h, color) {
    var out = [];
    var ix, iy, iz;
    for (ix = 0; ix < w; ix++)
      for (iy = 0; iy < d; iy++)
        for (iz = 0; iz < h; iz++)
          out.push({ x: x + ix, y: y + iy, z: z + iz, c: color });
    return out;
  }
  function shell(x, y, z, w, d, h, color, opts) {
    var out = [];
    opts = opts || {};
    var floor = !!opts.floor, roof = !!opts.roof, sides = opts.sides !== false;
    var ix, iy, iz, onBottom, onTop, onSide;
    for (ix = 0; ix < w; ix++)
      for (iy = 0; iy < d; iy++)
        for (iz = 0; iz < h; iz++) {
          onBottom = iz === 0;
          onTop = iz === h - 1;
          onSide = ix === 0 || ix === w - 1 || iy === 0 || iy === d - 1;
          if ((sides && onSide) || (floor && onBottom) || (roof && onTop))
            out.push({ x: x + ix, y: y + iy, z: z + iz, c: color });
        }
    return out;
  }
  function cylinder(cx, cy, z, radius, h, color) {
    var out = [];
    var ix, iy, iz;
    for (ix = -radius; ix <= radius; ix++)
      for (iy = -radius; iy <= radius; iy++) {
        if (ix * ix + iy * iy > radius * radius + 0.5) continue;
        for (iz = 0; iz < h; iz++)
          out.push({ x: cx + ix, y: cy + iy, z: z + iz, c: color });
      }
    return out;
  }
  function dome(cx, cy, z, radius, color) {
    var out = [];
    var iz, ix, iy, layerR, lrCeil, dist;
    for (iz = 0; iz <= radius; iz++) {
      layerR = Math.sqrt(radius * radius - iz * iz);
      lrCeil = Math.round(Math.max(0, layerR));
      for (ix = -lrCeil; ix <= lrCeil; ix++)
        for (iy = -lrCeil; iy <= lrCeil; iy++) {
          dist = Math.sqrt(ix * ix + iy * iy);
          if (dist <= layerR + 0.4)
            out.push({ x: cx + ix, y: cy + iy, z: z + iz, c: color });
        }
    }
    return out;
  }
  function compose() {
    var out = [], a, i, k;
    for (k = 0; k < arguments.length; k++) {
      a = arguments[k];
      if (!a) continue;
      for (i = 0; i < a.length; i++) out.push(a[i]);
    }
    return out;
  }
  function addDoor(out, x, y, z, color) {
    color = color || P.cobalt;
    out.push({ x: x, y: y, z: z, c: color });
    out.push({ x: x, y: y, z: z + 1, c: color });
  }
  function addWindow(out, x, y, z, color) {
    out.push({ x: x, y: y, z: z, c: color || P.cobalt });
  }

  function flatTile(color, accent) {
    var voxels = [], ix, iy, c;
    for (ix = 0; ix < VPT; ix++)
      for (iy = 0; iy < VPT; iy++) {
        c = accent ? (accent(ix, iy) || color) : color;
        voxels.push({ x: ix, y: iy, z: 0, c: c });
      }
    return voxels;
  }
  function tileGrass() {
    return flatTile(P.grass, function (ix, iy) {
      if ((ix + iy) % 3 === 0) return P.grassDark;
      if ((ix * 7 + iy * 13) % 5 === 0) return P.grassLight;
      return null;
    });
  }
  function tileSand() {
    return flatTile(P.sand, function (ix, iy) {
      if ((ix * 5 + iy * 3) % 7 === 0) return P.sandDark;
      return null;
    });
  }
  function tilePath() {
    return flatTile(P.path, function (ix, iy) {
      var brick = (iy + (ix % 2 === 0 ? 0 : 1)) % 2;
      if (brick === 0) return P.pathDark;
      if ((ix === 1 && iy === 2) || (ix === 3 && iy === 0)) return P.pathLight;
      return null;
    });
  }
  function tileWater() {
    return flatTile(P.sea, function (ix, iy) {
      if ((ix * 13 + iy * 7) % 6 === 0) return P.seaShine;
      if ((ix + iy) % 3 === 0) return P.seaDeep;
      return null;
    });
  }

  function cypressCluster() {
    var out = [];
    function tree(cx, cy, hMax) {
      var z, dx, dy, ringR, c;
      out.push({ x: cx, y: cy, z: 0, c: P.woodDark });
      for (z = 1; z <= hMax; z++) {
        ringR = z >= hMax - 1 ? 0 : 1;
        for (dx = -ringR; dx <= ringR; dx++)
          for (dy = -ringR; dy <= ringR; dy++) {
            if (Math.abs(dx) + Math.abs(dy) > ringR) continue;
            c = (dx + dy + z) % 3 === 0 ? P.cypressDark : P.cypress;
            out.push({ x: cx + dx, y: cy + dy, z: z, c: c });
          }
      }
      out.push({ x: cx, y: cy, z: hMax + 1, c: P.cypressDark });
    }
    tree(1, 2, 6);
    tree(2, 1, 5);
    return out;
  }
  function bougainvilleaTree() {
    var out = box(1, 1, 0, 2, 2, 1, P.terracotta);
    out.push({ x: 1, y: 1, z: 1, c: P.woodDark });
    out.push({ x: 1, y: 1, z: 2, c: P.woodDark });
    var canopy = [
      [0, 0, 3], [1, 0, 3], [2, 0, 3], [0, 1, 3], [1, 1, 3], [2, 1, 3],
      [0, 2, 3], [1, 2, 3], [2, 2, 3],
      [1, 0, 4], [0, 1, 4], [1, 1, 4], [2, 1, 4], [1, 2, 4]
    ];
    var i, v, noise, c;
    for (i = 0; i < canopy.length; i++) {
      v = canopy[i];
      noise = (v[0] * 5 + v[1] * 7 + v[2] * 3) % 4;
      c = P.bougain;
      if (noise === 0) c = P.bougainDark;
      else if (noise === 1) c = P.bougainLight;
      else if (noise === 2) c = P.leafDark;
      out.push({ x: v[0], y: v[1], z: v[2], c: c });
    }
    return out;
  }
  function oliveTree() {
    var out = [
      { x: 1, y: 2, z: 0, c: P.woodDark },
      { x: 1, y: 2, z: 1, c: P.wood },
      { x: 1, y: 2, z: 2, c: P.wood }
    ];
    var blobs = [
      [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3]
    ];
    var i, v, dz, z, noise, c;
    for (i = 0; i < blobs.length; i++) {
      v = blobs[i];
      for (dz = 0; dz < 2; dz++) {
        z = 3 + dz;
        noise = (v[0] * 3 + v[1] * 5 + dz * 7) % 4;
        c = noise === 0 ? P.oliveDark : noise === 1 ? P.oliveLight : P.olive;
        out.push({ x: v[0], y: v[1], z: z, c: c });
      }
    }
    out.push({ x: 1, y: 2, z: 5, c: P.olive });
    return out;
  }
  function agavePlant() {
    var out = [], i, s, angle, dx, dy, z;
    for (i = 0; i < 8; i++) {
      angle = i * Math.PI / 4;
      for (s = 0; s <= 2; s++) {
        dx = Math.round(Math.cos(angle) * s);
        dy = Math.round(Math.sin(angle) * s);
        z = Math.floor(s / 2);
        out.push({ x: 1 + dx, y: 2 + dy, z: z, c: s === 2 ? P.agaveDark : P.agave });
      }
    }
    out.push({ x: 1, y: 2, z: 1, c: P.agave });
    return out;
  }
  function flowerPot() {
    return compose(
      box(1, 1, 0, 2, 2, 1, P.terracotta),
      box(1, 1, 1, 2, 2, 1, P.terraDark),
      box(1, 1, 2, 2, 2, 1, P.leaf),
      [
        { x: 1, y: 1, z: 3, c: P.flower },
        { x: 2, y: 1, z: 3, c: P.flowerWhite },
        { x: 1, y: 2, z: 3, c: P.flowerYellow },
        { x: 2, y: 2, z: 3, c: P.flower }
      ]
    );
  }
  function terracottaPot() {
    return compose(
      box(1, 1, 0, 2, 2, 1, P.terracotta),
      box(1, 1, 1, 2, 2, 1, P.terraDark),
      [
        { x: 1, y: 1, z: 2, c: P.flower },
        { x: 2, y: 1, z: 2, c: P.flowerWhite },
        { x: 1, y: 2, z: 2, c: P.flowerYellow },
        { x: 2, y: 2, z: 2, c: P.flower }
      ]
    );
  }
  function lanternPost() {
    var cx = 2, cy = 2;
    return compose(
      box(cx, cy, 0, 1, 1, 6, P.iron),
      box(cx - 1, cy - 1, 6, 3, 3, 1, P.iron),
      box(cx, cy, 7, 1, 1, 1, P.flame),
      box(cx - 1, cy - 1, 8, 3, 3, 1, P.iron)
    );
  }
  function smallBridge() {
    var out = [], ix, iy, arch;
    for (ix = 0; ix < VPT * 2; ix++) {
      arch = Math.floor(Math.sin((ix / (VPT * 2 - 1)) * Math.PI) * 2);
      for (iy = 0; iy < VPT; iy++)
        out.push({ x: ix, y: iy, z: arch, c: P.wood });
      if (arch > 0) {
        out.push({ x: ix, y: 0, z: arch + 1, c: P.cobalt });
        out.push({ x: ix, y: VPT - 1, z: arch + 1, c: P.cobalt });
      }
    }
    return out;
  }
  function smallMykonosHouse() {
    var W = VPT * 2, D = VPT * 2, out = [];
    out.push.apply(out, shell(0, 0, 0, W, D, 5, P.white, {}));
    out.push.apply(out, box(0, 0, 0, W, D, 1, P.whiteShadow));
    addDoor(out, 3, D - 1, 0);
    addWindow(out, 1, D - 1, 2);
    addWindow(out, 5, D - 1, 2);
    addWindow(out, 0, 3, 2);
    out.push.apply(out, box(0, 0, 5, W, D, 1, P.whiteShadow));
    out.push.apply(out, box(W - 2, 1, 6, 1, 1, 2, P.white));
    out.push.apply(out, box(2, D - 1, 0, 1, 1, 1, P.terracotta));
    out.push({ x: 2, y: D - 1, z: 1, c: P.flower });
    out.push.apply(out, box(4, D - 1, 0, 1, 1, 1, P.terracotta));
    out.push({ x: 4, y: D - 1, z: 1, c: P.bougain });
    out.push({ x: 0, y: 2, z: 5, c: P.bougain });
    out.push({ x: 0, y: 1, z: 4, c: P.bougainLight });
    out.push({ x: 0, y: 0, z: 5, c: P.bougainDark });
    return out;
  }
  function twoStoryHouse() {
    var W = VPT * 3, D = VPT * 3, out = [], i, ix;
    out.push.apply(out, box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push.apply(out, shell(0, 0, 0, W, D, 5, P.white, {}));
    out.push.apply(out, box(0, 0, 5, W, D, 1, P.whiteShadow));
    out.push.apply(out, shell(1, 1, 6, W - 2, D - 2, 4, P.white, {}));
    out.push.apply(out, box(1, 1, 10, W - 2, D - 2, 1, P.whiteShadow));
    addDoor(out, 5, D - 1, 0);
    addWindow(out, 2, D - 1, 2);
    addWindow(out, 8, D - 1, 2);
    addWindow(out, 0, 5, 2);
    addWindow(out, W - 1, 5, 2);
    addWindow(out, 4, D - 2, 8);
    addWindow(out, 7, D - 2, 8);
    for (i = 0; i < 5; i++)
      out.push.apply(out, box(W - 1, D - 1 - i, 0, 1, 1, i + 1, P.white));
    for (ix = 1; ix < W - 1; ix++)
      out.push({ x: ix, y: D - 1, z: 6, c: P.cobalt });
    out.push({ x: 0, y: 1, z: 5, c: P.bougain });
    out.push({ x: 0, y: 2, z: 4, c: P.bougainLight });
    out.push({ x: 0, y: 0, z: 4, c: P.bougainDark });
    return out;
  }
  function mainVilla() {
    var W = VPT * 4, D = VPT * 4, out = [], ix, i;
    out.push.apply(out, box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push.apply(out, shell(0, 0, 0, W, D, 5, P.white, {}));
    out.push.apply(out, box(0, 0, 5, W, D, 1, P.whiteShadow));
    out.push.apply(out, shell(0, 0, 6, Math.floor(W * 0.6), Math.floor(D * 0.6), 5, P.white, {}));
    out.push.apply(out, box(0, 0, 11, Math.floor(W * 0.6), Math.floor(D * 0.6), 1, P.whiteShadow));
    addDoor(out, 7, D - 1, 0);
    addWindow(out, 3, D - 1, 2);
    addWindow(out, 11, D - 1, 2);
    addWindow(out, 0, 8, 2);
    addWindow(out, W - 1, 8, 2);
    for (ix = 0; ix < Math.floor(W * 0.6); ix += 2)
      out.push.apply(out, box(ix, Math.floor(D * 0.6), 6, 1, 1, 4, P.cobalt));
    for (ix = 0; ix < Math.floor(W * 0.6); ix++)
      out.push({ x: ix, y: Math.floor(D * 0.6), z: 10, c: P.cobalt });
    for (i = 1; i < 4; i++) {
      out.push({ x: i * 3, y: D - 1, z: 0, c: P.terracotta });
      out.push({ x: i * 3, y: D - 1, z: 1, c: P.bougain });
    }
    for (i = 0; i < 4; i++)
      out.push({ x: 0, y: i, z: 5, c: i % 2 ? P.bougain : P.bougainLight });
    return out;
  }
  function windmillBuilding() {
    var cx = 4, cy = 4, out = [], iz, r, ix, iy;
    out.push.apply(out, cylinder(cx, cy, 0, 3, 7, P.white));
    out.push.apply(out, cylinder(cx, cy, 7, 3, 1, P.whiteShadow));
    for (iz = 0; iz < 3; iz++) {
      r = 3 - iz;
      for (ix = -r; ix <= r; ix++)
        for (iy = -r; iy <= r; iy++) {
          if (ix * ix + iy * iy <= r * r + 0.3)
            out.push({ x: cx + ix, y: cy + iy, z: 8 + iz, c: iz === 2 ? P.roofDark : P.roof });
        }
    }
    out.push({ x: cx, y: cy, z: 6, c: P.iron });
    out.push({ x: cx + 2, y: cy, z: 6, c: P.wood });
    out.push({ x: cx + 3, y: cy, z: 6, c: P.wood });
    out.push({ x: cx - 2, y: cy, z: 6, c: P.wood });
    out.push({ x: cx - 3, y: cy, z: 6, c: P.wood });
    out.push({ x: cx, y: cy, z: 4, c: P.wood });
    out.push({ x: cx, y: cy, z: 8, c: P.wood });
    addDoor(out, cx, cy + 3, 0);
    addWindow(out, cx, cy - 3, 3);
    return out;
  }
  function mainChapel() {
    var W = VPT * 3, D = VPT * 3, cx = Math.floor(W / 2), cy = Math.floor(D / 2);
    var out = [];
    out.push.apply(out, box(0, 0, 0, W, D, 1, P.whiteShadow));
    out.push.apply(out, shell(0, 0, 0, W, D, 6, P.white, {}));
    out.push.apply(out, box(0, 0, 6, W, D, 1, P.whiteShadow));
    out.push.apply(out, cylinder(cx, cy, 7, 3, 2, P.white));
    out.push.apply(out, cylinder(cx, cy, 9, 3, 1, P.whiteShadow));
    out.push.apply(out, dome(cx, cy, 10, 3, P.cobalt));
    out.push({ x: cx, y: cy, z: 14, c: P.white });
    out.push({ x: cx, y: cy, z: 15, c: P.white });
    out.push({ x: cx - 1, y: cy, z: 14, c: P.white });
    out.push({ x: cx + 1, y: cy, z: 14, c: P.white });
    addDoor(out, cx, D - 1, 0);
    addDoor(out, cx - 1, D - 1, 0);
    addWindow(out, 1, D - 1, 3);
    addWindow(out, W - 2, D - 1, 3);
    addWindow(out, 0, cy, 3);
    addWindow(out, W - 1, cy, 3);
    out.push({ x: 0, y: 0, z: 5, c: P.bougain });
    out.push({ x: 0, y: 1, z: 5, c: P.bougainLight });
    out.push({ x: 0, y: 2, z: 5, c: P.bougainDark });
    return out;
  }

  function stamp(dst, src, gx, gy) {
    var ox = gx * VPT, oy = gy * VPT, i, v;
    for (i = 0; i < src.length; i++) {
      v = src[i];
      dst.push({ x: ox + v.x, y: oy + v.y, z: v.z, c: v.c });
    }
  }
  function fillOcc(occ, gx, gy, w, d, val) {
    var x, y;
    for (y = gy; y < gy + d; y++)
      for (x = gx; x < gx + w; x++) {
        if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        occ[y * GW + x] = val;
      }
  }
  function parseHex(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function surface(list) {
    var map = Object.create(null), i, v, k, out = [], exposed, d;
    var dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (i = 0; i < list.length; i++) {
      v = list[i];
      map[v.x + ',' + v.y + ',' + v.z] = v;
    }
    for (k in map) {
      v = map[k];
      exposed = false;
      for (d = 0; d < 6; d++) {
        if (!map[(v.x + dirs[d][0]) + ',' + (v.y + dirs[d][1]) + ',' + (v.z + dirs[d][2])]) {
          exposed = true;
          break;
        }
      }
      if (exposed) {
        var rgb = parseHex(v.c);
        out.push({ x: v.x, y: v.y, z: v.z, r: rgb[0], g: rgb[1], b: rgb[2] });
      }
    }
    return out;
  }

  function seed() {
    var voxels = [], occ = [], gx, gy, i;
    for (i = 0; i < GW * GH; i++) occ[i] = 0;

    for (gy = 0; gy < GH; gy++)
      for (gx = 0; gx < GW; gx++)
        stamp(voxels, tileGrass(), gx, gy);

    var midX = Math.floor(GW / 2), midY = Math.floor(GH / 2);
    for (gx = 1; gx < GW - 1; gx++) stamp(voxels, tilePath(), gx, midY);
    for (gy = 1; gy < GH - 1; gy++) stamp(voxels, tilePath(), midX, gy);

    for (gx = 0; gx < GW; gx++) {
      stamp(voxels, tileWater(), gx, GH - 1);
      stamp(voxels, tileWater(), gx, GH - 2);
      occ[(GH - 1) * GW + gx] = 1;
      occ[(GH - 2) * GW + gx] = 1;
    }
    for (gx = 0; gx < GW; gx++) stamp(voxels, tileSand(), gx, GH - 3);

    var ring = 3, rx, ry;
    for (ry = -ring; ry < GH + ring; ry++)
      for (rx = -ring; rx < GW + ring; rx++) {
        if (rx >= 0 && rx < GW && ry >= 0 && ry < GH) continue;
        stamp(voxels, tileWater(), rx, ry);
      }

    stamp(voxels, smallMykonosHouse(), 2, 2); fillOcc(occ, 2, 2, 2, 2, 2);
    stamp(voxels, mainChapel(), 7, 1); fillOcc(occ, 7, 1, 3, 3, 2);
    stamp(voxels, windmillBuilding(), 11, 2); fillOcc(occ, 11, 2, 2, 2, 2);
    stamp(voxels, twoStoryHouse(), 2, 7); fillOcc(occ, 2, 7, 3, 3, 2);
    stamp(voxels, mainVilla(), 7, 7); fillOcc(occ, 7, 7, 4, 4, 2);

    stamp(voxels, cypressCluster(), 1, 5); fillOcc(occ, 1, 5, 1, 1, 2);
    stamp(voxels, cypressCluster(), 12, 5); fillOcc(occ, 12, 5, 1, 1, 2);
    stamp(voxels, bougainvilleaTree(), 5, 3); fillOcc(occ, 5, 3, 1, 1, 2);
    stamp(voxels, oliveTree(), 0, 9); fillOcc(occ, 0, 9, 1, 1, 2);
    stamp(voxels, flowerPot(), 6, 5);
    stamp(voxels, terracottaPot(), 11, 6);
    stamp(voxels, agavePlant(), 13, 8); fillOcc(occ, 13, 8, 1, 1, 2);
    stamp(voxels, lanternPost(), 4, 6);
    stamp(voxels, lanternPost(), 9, 6);
    stamp(voxels, smallBridge(), 5, GH - 2);
    fillOcc(occ, 5, GH - 2, 2, 1, 0);

    return {
      voxels: surface(voxels),
      occ: occ,
      spawn: { x: 5.5, y: 7.5 }
    };
  }

  function blocked(occ, x, y) {
    var gx = Math.floor(x), gy = Math.floor(y);
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return true;
    return occ[gy * GW + gx] !== 0;
  }

  function person(wx, wy, z0, tint, moving, t) {
    var bob = moving ? Math.abs(Math.sin(t * 10)) * 0.35 : 0;
    var z = z0 + bob;
    var col = tint || [27, 91, 168];
    return [
      { x: wx, y: wy, z: z, r: 112, g: 76, b: 39 },
      { x: wx, y: wy, z: z + 1, r: col[0], g: col[1], b: col[2] },
      { x: wx, y: wy, z: z + 2, r: 240, g: 200, b: 168 }
    ];
  }

  function tintFor(id) {
    var h = 0, i;
    id = String(id || '');
    for (i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var pal = [
      [27, 91, 168],
      [216, 91, 142],
      [196, 98, 46],
      [61, 115, 85],
      [46, 111, 188],
      [180, 58, 106]
    ];
    return pal[h % pal.length];
  }

  root.MykWorld = {
    VPT: VPT, GW: GW, GH: GH, P: P,
    seed: seed,
    blocked: blocked,
    person: person,
    tintFor: tintFor,
    parseHex: parseHex
  };
})(window);
