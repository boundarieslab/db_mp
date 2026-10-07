#!/usr/bin/env python3
"""The far view of terrain change: every change kept visible when the map is zoomed out.

    python tools/make_dod_far.py [--zmin 6] [--zmax 12]

Writes data/dod_far/{z}/{x}/{y}.png from the click targets of every run on the map
(data/dod_<slug>.geojson). From far away a change is smaller than a pixel and the 1 m
picture has nothing to show. Here each change polygon is drawn on the tile grid of each
zoom, never smaller than one pixel, in one of two colours: raised ground
(deposit) and lowered ground (excavation / erosion). Where two meet in a pixel the one
that moved more is on top. It is the same layer as the close view, seen from far: no
symbol stands for a change.

Needs numpy, rasterio and Pillow (the unigis_tesis environment).
"""
import glob, json, math, os, shutil, sys

import numpy as np
from PIL import Image
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import shape
from shapely.ops import transform as shp_transform

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 20037508.342789244
UP = (0xF3, 0x63, 0x15)      # raised: the warm end of the map's scale
DOWN = (0x41, 0x45, 0xAB)    # lowered: the cool end
TILE = 256


def opt(name, cast, default):
    return cast(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def merc(x, y, z=None):
    x, y = np.asarray(x, dtype='float64'), np.asarray(y, dtype='float64')
    return x * R / 180.0, np.log(np.tan((90 + y) * np.pi / 360.0)) * R / np.pi


if __name__ == '__main__':
    zmin, zmax = opt('--zmin', int, 6), opt('--zmax', int, 12)
    feats = []
    for path in sorted(glob.glob(os.path.join(HERE, 'data', 'dod_*_20??_20??.geojson'))):
        for f in json.load(open(path, encoding='utf-8'))['features']:
            v = f['properties'].get('v', 0)
            feats.append((abs(v), 1 if v > 0 else 2, shp_transform(merc, shape(f['geometry']))))
    feats.sort(key=lambda t: t[0])                       # the larger is drawn last, on top
    xs0 = min(g.bounds[0] for _, _, g in feats); ys0 = min(g.bounds[1] for _, _, g in feats)
    xs1 = max(g.bounds[2] for _, _, g in feats); ys1 = max(g.bounds[3] for _, _, g in feats)
    out = os.path.join(HERE, 'data', 'dod_far')
    tmp = out + '.part'
    shutil.rmtree(tmp, ignore_errors=True)
    total = 0
    for z in range(zmin, zmax + 1):
        span = 2 * R / 2 ** z
        px = span / TILE
        tx0, tx1 = int((xs0 + R) // span), int((xs1 + R) // span)
        ty0, ty1 = int((R - ys1) // span), int((R - ys0) // span)
        w, h = (tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE
        tf = from_origin(-R + tx0 * span, R - ty0 * span, px, px)
        a = rasterize(((g, k) for _, k, g in feats), out_shape=(h, w), transform=tf, fill=0, all_touched=True, dtype='uint8')
        n = 0
        for ty in range(ty0, ty1 + 1):
            for tx in range(tx0, tx1 + 1):
                t = a[(ty - ty0) * TILE:(ty - ty0 + 1) * TILE, (tx - tx0) * TILE:(tx - tx0 + 1) * TILE]
                if not t.any():
                    continue
                rgba = np.zeros((TILE, TILE, 4), np.uint8)
                rgba[t == 1] = UP + (255,)
                rgba[t == 2] = DOWN + (255,)
                d = os.path.join(tmp, str(z), str(tx))
                os.makedirs(d, exist_ok=True)
                Image.fromarray(rgba, 'RGBA').save(os.path.join(d, f'{ty}.png'), optimize=True)
                n += 1
        total += n
        print(f'  z{z}: {n} tiles ({w}x{h} px)', flush=True)
    old = out + '.old'
    shutil.rmtree(old, ignore_errors=True)
    if os.path.exists(out):
        os.replace(out, old)
    os.replace(tmp, out)
    shutil.rmtree(old, ignore_errors=True)
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fn in os.walk(out) for f in fn)
    print(f'  {total} tiles, {size / 1e6:.1f} MB -> data/dod_far', flush=True)
