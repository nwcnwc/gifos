#!/usr/bin/env python3
"""Prepare pack-desktop PNGs: correct mapping, edge flood transparency."""
from PIL import Image
import os, sys

# source jpg index → subject (generation order was non-deterministic on disk)
MAP = {
    'welcome': '1.jpg',
    'video': '3.jpg',
    'notes': '6.jpg',
    'folder': '4.jpg',
    'chess': '2.jpg',
    'paint': '5.jpg',
}

def dist(a, b):
    return sum((a[i] - b[i]) ** 2 for i in range(3)) ** 0.5

def flood_transparent(im, tol=38):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    bg = [px[s] for s in seeds]
    bg = tuple(sum(c[i] for c in bg) // 4 for i in range(3))
    seen = set()
    stack = list(seeds)
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        if (x, y) in seen:
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        if a < 8:
            px[x, y] = (r, g, b, 0)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                    stack.append((nx, ny))
            continue
        if dist((r, g, b), bg) <= tol:
            px[x, y] = (r, g, b, 0)
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen:
                    stack.append((nx, ny))
    return im

def main(src_dir, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    for subject, fname in MAP.items():
        path = os.path.join(src_dir, fname)
        im = Image.open(path)
        im = flood_transparent(im)
        out = os.path.join(out_dir, subject + '.png')
        im.save(out, 'PNG', optimize=True)
        print(subject, '←', fname, im.size)

if __name__ == '__main__':
    src = sys.argv[1] if len(sys.argv) > 1 else ''
    out = sys.argv[2] if len(sys.argv) > 2 else 'site/assets/pack-desktop'
    main(src, out)