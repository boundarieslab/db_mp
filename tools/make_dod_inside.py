#!/usr/bin/env python3
"""The terrain inside the changes: contours of both surveys where the ground has changed.

    python tools/make_dod_inside.py --root <runs_folder> --out <folder> [--only slug,slug] [--budget seconds]

Outside a change the map draws terrain contours read live from Kartverket, in black
under the change colours. Inside a change they are drawn in white over the colours, and
those lines come from here: the two surveys the difference was made from, every whole
metre, cut to the change polygons of each run. Two files of newline-delimited GeoJSON:

    <out>/before/<slug>.geojsonl    the older survey   (old_aligned.tif)
    <out>/after/<slug>.geojsonl     the newer survey   (new_aligned.tif)

    e    the height of the line in metres above sea level
    m    1 on every fifth metre
    c    the cluster of the change polygon within the run
    r    the run

Lines run one cell past the edge of a polygon so that they meet the lines outside.
Simplified by 0.2 m. With --budget the work stops after that many seconds and the next
call goes on where it stopped (a shell that only lives a few minutes). Turned into vector tiles with tippecanoe; not read by the map as
they are. Run make_dod_sites.py first: it writes c. Needs the unigis_tesis environment.
"""
import json, math, os, re, sys, time

import contourpy
import geopandas as gpd
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.features import rasterize
from rasterio.windows import Window
from scipy import ndimage
from shapely.geometry import LineString, box
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REACH = 2.0        # metres round a block in which polygons are looked for
BLOCK = 1024       # cells
HALO = 16          # cells read round a block, so the taper and the lines are whole at its sides
SIMPLIFY_M = 0.2


def opt(name, cast, default):
    return cast(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def lines_of(run, slug, outs, row0=0, until=None):
    gj = json.load(open(os.path.join(HERE, 'data', f'dod_{slug}.geojson'), encoding='utf-8'))
    props = [f['properties'] for f in gj['features']]
    g = gpd.read_file(os.path.join(run, 'poligonos.gpkg'), layer='poligonos_cambio')
    if len(g) != len(props):
        sys.exit(f'{slug}: {len(g)} polygons in the run, {len(props)} click targets')
    geoms = list(g.geometry.values)
    cl = [int(p.get('c', -1)) for p in props]
    tree = STRtree(geoms)
    tf = Transformer.from_crs(g.crs, 'EPSG:4326', always_xy=True)
    n_lines = n_pts = 0
    with rasterio.open(os.path.join(run, 'old_aligned.tif')) as so, rasterio.open(os.path.join(run, 'new_aligned.tif')) as sn, \
         open(outs[0], 'a' if row0 else 'w', encoding='utf-8') as fo, open(outs[1], 'a' if row0 else 'w', encoding='utf-8') as fn_:
        if so.transform != sn.transform or so.shape != sn.shape:
            sys.exit(f'{slug}: the two surveys are not on one grid')
        T = sn.transform
        res = abs(T.a)
        for r0 in range(row0, sn.height, BLOCK):
            if until and time.time() > until and r0 > row0:
                return n_lines, n_pts, r0
            for c0 in range(0, sn.width, BLOCK):
                core = box(T.c + c0 * T.a, T.f + min(sn.height, r0 + BLOCK) * T.e, T.c + min(sn.width, c0 + BLOCK) * T.a, T.f + r0 * T.e)
                near = [int(i) for i in tree.query(core.buffer(REACH))]
                if not near:
                    continue
                ra, ca = max(0, r0 - HALO), max(0, c0 - HALO)
                rb, cb = min(sn.height, r0 + BLOCK + HALO), min(sn.width, c0 + BLOCK + HALO)
                w_ = Window(ca, ra, cb - ca, rb - ra)
                wt = sn.window_transform(w_)
                # every polygon near the halo too, so the taper is the same on both sides of a block's edge
                halo = box(wt.c, wt.f + (rb - ra) * wt.e, wt.c + (cb - ca) * wt.a, wt.f)
                idx = [int(i) for i in tree.query(halo.buffer(REACH))]
                lab = rasterize([(geoms[i], k + 1) for k, i in enumerate(idx)], out_shape=(rb - ra, cb - ca), transform=wt, fill=0, dtype='int32')
                if not lab.any():
                    continue
                # one cell past the polygons, and the nearest polygon of every cell there
                dist, (ir, ic) = ndimage.distance_transform_edt(lab == 0, sampling=res, return_indices=True)
                keep = dist <= res * 1.01
                near_lab = lab[ir, ic]
                new = sn.read(1, window=w_).astype('float32')
                old = so.read(1, window=w_).astype('float32')
                xs = wt.c + (np.arange(lab.shape[1]) + 0.5) * wt.a
                ys = wt.f + (np.arange(lab.shape[0]) + 0.5) * wt.e
                for z, s, fh in ((old, so, fo), (new, sn, fn_)):
                    bad = ~np.isfinite(z) | (z < -100) | (z > 3000)
                    if s.nodata is not None:
                        bad |= z == s.nodata
                    mask = bad | ~keep
                    if mask.all():
                        continue
                    zz = z[~mask]
                    levels = range(int(math.ceil(float(zz.min()))), int(math.floor(float(zz.max()))) + 1)
                    cg = contourpy.contour_generator(x=xs, y=ys, z=np.ma.array(z, mask=mask), name='serial', corner_mask=True,
                                                     line_type=contourpy.LineType.Separate)
                    for lv in levels:
                        for seg in cg.lines(float(lv)):
                            if len(seg) < 2:
                                continue
                            ls = LineString(seg).intersection(core)
                            for part in getattr(ls, 'geoms', [ls]):
                                if part.is_empty or part.geom_type != 'LineString':
                                    continue
                                part = part.simplify(SIMPLIFY_M, preserve_topology=False)
                                if part.is_empty or part.length < 1.5:
                                    continue
                                xy = np.asarray(part.coords)
                                mid = xy[len(xy) // 2]
                                jr = min(lab.shape[0] - 1, max(0, int((mid[1] - wt.f) / wt.e)))
                                jc = min(lab.shape[1] - 1, max(0, int((mid[0] - wt.c) / wt.a)))
                                k = int(near_lab[jr, jc])
                                lon, lat = tf.transform(xy[:, 0], xy[:, 1])
                                coords = [[round(float(a_), 6), round(float(b_), 6)] for a_, b_ in zip(lon, lat)]
                                p = {'e': int(lv), 'c': cl[idx[k - 1]] if k else -1, 'r': slug}
                                if lv % 5 == 0:
                                    p['m'] = 1
                                fh.write(json.dumps({'type': 'Feature', 'properties': p,
                                                     'geometry': {'type': 'LineString', 'coordinates': coords}}, separators=(',', ':')) + '\n')
                                n_lines += 1; n_pts += len(coords)
    return n_lines, n_pts, None


if __name__ == '__main__':
    if '--root' not in sys.argv or '--out' not in sys.argv:
        sys.exit(__doc__)
    root, outdir = opt('--root', str, ''), opt('--out', str, '')
    only = set(opt('--only', str, '').split(',')) - {''}
    budget = opt('--budget', float, 0)
    part = opt('--part', str, '')          # 'k/n': every n-th run, starting at k
    until = time.time() + budget if budget else None
    seen = 0
    for d in ('before', 'after'):
        os.makedirs(os.path.join(outdir, d), exist_ok=True)
    html = open(os.path.join(HERE, 'index.html'), encoding='utf-8').read()
    for dp, dn, fn in sorted(os.walk(root)):
        if '_validation' in dp or 'before_coregistration' in dp or not {'run_params.json', 'poligonos.gpkg', 'old_aligned.tif', 'new_aligned.tif'} <= set(fn):
            continue
        p = json.load(open(os.path.join(dp, 'run_params.json'), encoding='utf-8'))
        kom = {'Skipvet': 'Skiptvet'}.get(p['kommune'], p['kommune'])
        m = re.search(r"\{ id: '([a-z_]+_\d{4}_\d{4})', kommune: '" + re.escape(kom) + r"',", html)
        if not m or not os.path.exists(os.path.join(HERE, 'data', f'dod_{m.group(1)}.geojson')):
            continue
        slug = m.group(1)
        if only and slug not in only:
            continue
        seen += 1
        if part and (seen - 1) % int(part.split('/')[1]) != int(part.split('/')[0]):
            continue
        t = time.time()
        outs = [os.path.join(outdir, d, slug + '.geojsonl') for d in ('before', 'after')]
        state = os.path.join(outdir, slug + '.state')
        st = open(state).read().strip() if os.path.exists(state) else ''
        if budget and all(os.path.exists(o) for o in outs) and st in ('', 'done'):
            continue
        if until and time.time() > until:
            sys.exit('budget spent, more to do')
        row0 = int(st) if budget and st not in ('', 'done') else 0
        n, pts, nxt = lines_of(dp, slug, [o + '.part' for o in outs], row0, until)
        if nxt is not None:
            open(state, 'w').write(str(nxt))
            sys.exit(f'budget spent in {slug} at row {nxt}, more to do')
        for o in outs:
            os.replace(o + '.part', o)
        if os.path.exists(state):
            open(state, 'w').write('done')
        print(f'  {slug}: {n:,} lines, {pts:,} points, {sum(os.path.getsize(o) for o in outs) / 1e6:.1f} MB, {time.time() - t:.0f} s', flush=True)
    print('all done', flush=True)
