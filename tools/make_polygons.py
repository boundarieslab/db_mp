#!/usr/bin/env python3
"""Build the two polygon layers the map draws under its markers.

Inputs (produced elsewhere in the project, not by this script):

  FacilityPolygons_draft_v2.csv
      19 rows, one per facility whose footprint has been resolved by hand.
      The GeoJSON column is empty in the draft; the geometry lives in WKT.
      FacilityUID matches the UID column of the published facilities sheet,
      which is what ties a polygon to its marker and its sidebar entry.

  context_layer.geojson
      879 polygons from the national sweep: reguleringsplaner for masseuttak
      and massedeponi (in force and proposed) plus closed landfill localities
      from Grunnforurensning. Already simplified to 3 m and rounded to five
      decimals, so this script only strips properties and minifies.

Outputs land in ../data/ and are read by index.html at runtime.

Run:  python3 tools/make_polygons.py <input-dir>
"""

import csv, json, os, sys, re

SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/lub'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')

# --------------------------------------------------------------------------
# WKT.  Only POLYGON and MULTIPOLYGON appear in the draft, both in the plain
# "x y, x y" form with no Z, M or SRID prefix, so a full parser is not needed.
# --------------------------------------------------------------------------

def ring(text):
    pts = []
    for pair in text.split(','):
        x, y = pair.split()
        pts.append([round(float(x), 6), round(float(y), 6)])
    # GeoJSON wants the ring closed; several of the source rings are not.
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def split_top(text):
    """Split a parenthesised list at its top-level commas."""
    out, depth, start = [], 0, 0
    for i, ch in enumerate(text):
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        elif ch == ',' and depth == 0:
            out.append(text[start:i]); start = i + 1
    out.append(text[start:])
    return [s.strip() for s in out]


def wkt(text):
    text = text.strip()
    m = re.match(r'^(MULTIPOLYGON|POLYGON)\s*\((.*)\)$', text, re.I | re.S)
    if not m:
        raise ValueError('not a polygon: ' + text[:40])
    kind, body = m.group(1).upper(), m.group(2).strip()
    if kind == 'POLYGON':
        rings = [ring(r.strip().strip('()')) for r in split_top(body)]
        return {'type': 'Polygon', 'coordinates': rings}
    polys = []
    for part in split_top(body):
        part = part.strip()
        assert part.startswith('(') and part.endswith(')')
        polys.append([ring(r.strip().strip('()')) for r in split_top(part[1:-1])])
    return {'type': 'MultiPolygon', 'coordinates': polys}


# --------------------------------------------------------------------------
# facility footprints
# --------------------------------------------------------------------------

def facilities():
    rows = list(csv.DictReader(open(os.path.join(SRC, 'FacilityPolygons_draft_v2.csv'),
                                    encoding='utf-8-sig')))
    feats = []
    for r in rows:
        geom = json.loads(r['GeoJSON']) if r['GeoJSON'].strip() else wkt(r['WKT'])
        # "resource area (NGU)" polygons are explicitly flagged in the source as
        # NOT an operating footprint; they are kept but marked so the map can
        # draw them differently rather than claim a precision they do not have.
        ptype = r['PolygonType']
        feats.append({
            'type': 'Feature',
            'properties': {
                'uid':  r['FacilityUID'],
                'pid':  r['PolygonUID'],
                'n':    r['Name'],
                'src':  ptype,
                'a':    int(float(r['Area_m2'])) if r['Area_m2'].strip() else None,
                'firm': 0 if 'NOT an operating footprint' in ptype else 1,
                'note': r['Confidence'],
            },
            'geometry': geom,
        })
    return {'type': 'FeatureCollection', 'features': feats}


# --------------------------------------------------------------------------
# plan coverage
# --------------------------------------------------------------------------

KEEP = ('k', 'n', 'a', 'ikraft', 'kunngjort', 'planid', 'kommunenr',
        'Lokalitettype', 'Prosesstatus')

def coverage():
    d = json.load(open(os.path.join(SRC, 'context_layer.geojson'), encoding='utf-8'))
    for f in d['features']:
        p = f['properties']
        f['properties'] = {k: p[k] for k in KEEP if k in p and p[k] not in (None, '')}
    return d


def write(name, obj):
    path = os.path.join(OUT, name)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(',', ':'))
    n = len(obj['features'])
    print('%-28s %7d features  %9d bytes' % (name, n, os.path.getsize(path)))
    return obj


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    fac = write('facility_polygons.geojson', facilities())
    cov = write('plan_coverage.geojson', coverage())

    from collections import Counter
    print('  facility footprints firm:',
          Counter(f['properties']['firm'] for f in fac['features']))
    print('  coverage classes:',
          Counter(f['properties']['k'] for f in cov['features']))
