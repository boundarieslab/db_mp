#!/usr/bin/env python3
"""The lines of the terrain-change layer: the edge of every change and the contours of the change.

    python tools/make_dod_lines.py --root <runs_folder> --out <folder> [--only slug,slug]

For each run on the map, one newline-delimited GeoJSON file <out>/<slug>.geojsonl of lines,
read from DoD_raw.tif (the difference of the two surveys before the threshold) inside
each change polygon of poligonos.gpkg:

    l    the height change of the line in metres, signed: +0.7 and -0.7 are the edge of a
         change (the run's threshold), then every whole metre: +1, +2, ... and -1, -2, ...
    o    1 on the edge
    m    1 on every fifth metre
    c    the cluster of the polygon within the run (data/dod_<slug>.geojson), so the map
         can draw the edge of a chosen cluster
    r    the run

The edge is the 0.70 m isoline of the unthresholded difference, so it runs between the
cells and not along their sides; outside the polygon the surface is held under the
threshold, which closes the line exactly where the polygon ends (a hole, water that was
masked, a neighbour that was dropped). Lines are simplified by 0.15 m.

The files are turned into vector tiles with tippecanoe (see the handover note); they
are not read by the map as they are.

Run make_dod_sites.py first: it writes c. Needs the unigis_tesis environment.
"""
import json, math, os, re, sys, time

import contourpy
import geopandas as gpd
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.windows import Window
from shapely.geometry import LineString

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE = 0.70
PAD = 3
SIMPLIFY_M = 0.15


def opt(name, cast, default):
    return cast(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def lines_of(run, slug, out):
    gj = json.load(open(os.path.join(HERE, 'data', f'dod_{slug}.geojson'), encoding='utf-8'))
    props = [f['properties'] for f in gj['features']]
    g = gpd.read_file(os.path.join(run, 'poligonos.gpkg'), layer='poligonos_cambio')
    if len(g) != len(props):
        sys.exit(f'{slug}: {len(g)} polygons in the run, {len(props)} click targets')
    tf = Transformer.from_crs(g.crs, 'EPSG:4326', always_xy=True)
    n_lines = n_pts = 0
    with rasterio.open(os.path.join(run, 'DoD_raw.tif')) as src, open(out, 'w', encoding='utf-8') as fh:
        T = src.transform
        for i, (geom, vol) in enumerate(zip(g.geometry.values, g.volume_m3.values)):
            sign = 1.0 if vol > 0 else -1.0
            x0, y0, x1, y1 = geom.bounds
            c0 = max(0, int(math.floor((x0 - T.c) / T.a)) - PAD); c1 = min(src.width, int(math.ceil((x1 - T.c) / T.a)) + PAD)
            r0 = max(0, int(math.floor((y1 - T.f) / T.e)) - PAD); r1 = min(src.height, int(math.ceil((y0 - T.f) / T.e)) + PAD)
            if c1 - c0 < 2 or r1 - r0 < 2:
                continue
            w = Window(c0, r0, c1 - c0, r1 - r0)
            a = src.read(1, window=w).astype('float32')
            a[~np.isfinite(a)] = 0
            z = sign * a
            wt = src.window_transform(w)
            inside = rasterize([geom], out_shape=z.shape, transform=wt, fill=0, default_value=1, dtype='uint8').astype(bool)
            if not inside.any():
                continue
            z = np.where(inside, np.maximum(z, EDGE), np.minimum(z, EDGE - 0.01))
            top = float(z[inside].max())
            levels = [EDGE] + [float(k) for k in range(1, int(math.floor(top)) + 1)]
            xs = wt.c + (np.arange(z.shape[1]) + 0.5) * wt.a
            ys = wt.f + (np.arange(z.shape[0]) + 0.5) * wt.e
            cg = contourpy.contour_generator(x=xs, y=ys, z=z, name='serial', corner_mask=False,
                                             line_type=contourpy.LineType.Separate)
            c = int(props[i].get('c', -1))
            for lv in levels:
                for seg in cg.lines(lv):
                    if len(seg) < 3:
                        continue
                    ls = LineString(seg).simplify(SIMPLIFY_M, preserve_topology=False)
                    if ls.is_empty or ls.length < 2:
                        continue
                    xy = np.asarray(ls.coords)
                    lon, lat = tf.transform(xy[:, 0], xy[:, 1])
                    coords = [[round(float(a_), 7), round(float(b_), 7)] for a_, b_ in zip(lon, lat)]
                    p = {'l': round(sign * lv, 1), 'c': c, 'r': slug}
                    if lv == EDGE:
                        p['o'] = 1
                    elif lv % 5 == 0:
                        p['m'] = 1
                    fh.write(json.dumps({'type': 'Feature', 'properties': p,
                                         'geometry': {'type': 'LineString', 'coordinates': coords}}, separators=(',', ':')) + '\n')
                    n_lines += 1; n_pts += len(coords)
    return n_lines, n_pts


if __name__ == '__main__':
    if '--root' not in sys.argv or '--out' not in sys.argv:
        sys.exit(__doc__)
    root, outdir = opt('--root', str, ''), opt('--out', str, '')
    only = set(opt('--only', str, '').split(',')) - {''}
    os.makedirs(outdir, exist_ok=True)
    html = open(os.path.join(HERE, 'index.html'), encoding='utf-8').read()
    for dp, dn, fn in sorted(os.walk(root)):
        if '_validation' in dp or 'before_coregistration' in dp or not {'run_params.json', 'poligonos.gpkg', 'DoD_raw.tif'} <= set(fn):
            continue
        p = json.load(open(os.path.join(dp, 'run_params.json'), encoding='utf-8'))
        kom = {'Skipvet': 'Skiptvet'}.get(p['kommune'], p['kommune'])
        m = re.search(r"\{ id: '([a-z_]+_\d{4}_\d{4})', kommune: '" + re.escape(kom) + r"',", html)
        if not m or not os.path.exists(os.path.join(HERE, 'data', f'dod_{m.group(1)}.geojson')):
            continue
        slug = m.group(1)
        if only and slug not in only:
            continue
        t = time.time()
        out = os.path.join(outdir, slug + '.geojsonl')
        n, pts = lines_of(dp, slug, out + '.part')
        os.replace(out + '.part', out)
        print(f'  {slug}: {n:,} lines, {pts:,} points, {os.path.getsize(out) / 1e6:.1f} MB, {time.time() - t:.0f} s', flush=True)
