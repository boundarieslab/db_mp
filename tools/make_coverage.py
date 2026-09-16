#!/usr/bin/env python3
"""Build the full plan-coverage layer from the three sweep exports.

The layer that shipped first held 879 polygons - a filtered subset. This
builds all 1 736 that the sweep actually found, in three classes:

    current   333 reguleringsplaner in force        plans_inforce_clean.csv
    future     57 plans on public consultation      plans_proposed_clean.csv
    old      1346 closed landfill localities        grunnforurensning_deponier.csv

The CSVs carry WKT in EPSG:25832 (UTM32N) - checked against the first feature
of the old context layer, Masseuttak Hillestad, which lands at 8.155 E 58.812 N.
Geometry is simplified in metres BEFORE reprojection, because a tolerance in
degrees is not a tolerance in anything.

Run:  python3 tools/make_coverage.py <input-dir>
"""

import csv, json, os, re, sys
from pyproj import Transformer

csv.field_size_limit(10 ** 7)

SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/lub'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
TOL = 4.0          # metres; the sources are drawn to the decimetre
T = Transformer.from_crs('EPSG:25832', 'EPSG:4326', always_xy=True)


# ---------------------------------------------------------------- WKT
def split_top(text):
    out, depth, start = [], 0, 0
    for i, ch in enumerate(text):
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        elif ch == ',' and depth == 0:
            out.append(text[start:i]); start = i + 1
    out.append(text[start:])
    return [s.strip() for s in out]


def ring(text):
    pts = []
    for pair in text.split(','):
        x, y = pair.split()[:2]
        pts.append((float(x), float(y)))
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def wkt(text):
    m = re.match(r'^\s*(MULTIPOLYGON|POLYGON)\s*\((.*)\)\s*$', text, re.I | re.S)
    if not m:
        return None
    kind, body = m.group(1).upper(), m.group(2).strip()
    if kind == 'POLYGON':
        return [[ring(r.strip().strip('()')) for r in split_top(body)]]
    polys = []
    for part in split_top(body):
        part = part.strip()
        polys.append([ring(r.strip().strip('()')) for r in split_top(part[1:-1])])
    return polys


# ---------------------------------------------------------------- simplify
def rdp(pts, tol):
    """Ramer-Douglas-Peucker, iterative so a 5 000-vertex ring cannot blow
    the recursion limit."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        den = dx * dx + dy * dy
        worst, wi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if den == 0:
                d = ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / den
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                d = ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5
            if d > worst:
                worst, wi = d, i
        if worst > tol:
            keep[wi] = True
            stack.append((a, wi)); stack.append((wi, b))
    return [p for p, k in zip(pts, keep) if k]


def clean(polys, tol=None):
    """Simplify every ring, drop rings that collapse, drop empty polygons.
    A small locality can vanish entirely at 4 m, so anything that collapses is
    retried at a tolerance fine enough to keep it."""
    tol = TOL if tol is None else tol
    out = []
    for poly in polys:
        rings = []
        for i, r in enumerate(poly):
            s = rdp(r, tol)
            if s[0] != s[-1]:
                s.append(s[0])
            if len(s) >= 4:
                rings.append(s)
            elif i == 0:
                rings = []; break          # outer ring gone: drop the polygon
        if rings:
            out.append(rings)
    if not out and tol > 0.25:
        return clean(polys, tol / 8.0)
    return out


def to_wgs(polys):
    out = []
    for poly in polys:
        rings = []
        for r in poly:
            xs = [p[0] for p in r]; ys = [p[1] for p in r]
            lon, lat = T.transform(xs, ys)
            rings.append([[round(a, 5), round(b, 5)] for a, b in zip(lon, lat)])
        out.append(rings)
    return out


def feature(polys, props):
    polys = to_wgs(clean(polys))
    if not polys:
        return None
    geom = ({'type': 'Polygon', 'coordinates': polys[0]} if len(polys) == 1
            else {'type': 'MultiPolygon', 'coordinates': polys})
    return {'type': 'Feature', 'properties': props, 'geometry': geom}


# ---------------------------------------------------------------- sources
def rows(name):
    return list(csv.DictReader(open(os.path.join(SRC, name), encoding='utf-8-sig')))


def build():
    feats, dropped = [], 0

    for r in rows('plans_inforce_clean.csv'):
        g = wkt(r['wkt'])
        if not g: dropped += 1; continue
        p = {'k': 'current', 'n': r['name'], 'a': int(float(r['area_m2'] or 0))}
        if r.get('ikraft'): p['ikraft'] = r['ikraft'][:10]
        if r.get('planid'): p['planid'] = r['planid']
        if r.get('kommunenr'): p['kommunenr'] = r['kommunenr']
        f = feature(g, p)
        if f: feats.append(f)
        else: dropped += 1

    for r in rows('plans_proposed_clean.csv'):
        g = wkt(r['wkt'])
        if not g: dropped += 1; continue
        p = {'k': 'future', 'n': r['name'], 'a': int(float(r['area_m2'] or 0))}
        if r.get('kunngjort'): p['kunngjort'] = r['kunngjort'][:10]
        if r.get('planid'): p['planid'] = r['planid']
        if r.get('kommunenr'): p['kommunenr'] = r['kommunenr']
        f = feature(g, p)
        if f: feats.append(f)
        else: dropped += 1

    for r in rows('grunnforurensning_deponier.csv'):
        g = wkt(r['wkt'])
        if not g: dropped += 1; continue
        p = {'k': 'old', 'n': r['Lokalitetnavn'], 'a': int(float(r['area_m2'] or 0)),
             'type': r['Lokalitettype'], 'status': r['Prosesstatus']}
        f = feature(g, p)
        if f: feats.append(f)
        else: dropped += 1

    return {'type': 'FeatureCollection', 'features': feats}, dropped


if __name__ == '__main__':
    fc, dropped = build()
    path = os.path.join(OUT, 'plan_coverage.geojson')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(fc, fh, ensure_ascii=False, separators=(',', ':'))
    from collections import Counter
    print('%d features, %d dropped, %d bytes'
          % (len(fc['features']), dropped, os.path.getsize(path)))
    print(Counter(f['properties']['k'] for f in fc['features']))
