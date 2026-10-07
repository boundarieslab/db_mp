#!/usr/bin/env python3
"""Mark the small polygons on steep ground, the small shallow ones and the small
ones under forest, in a run's click targets.

    python tools/make_slope_flags.py <slug> <run_dir>

<run_dir>/slope_flags.csv is written by unigis_tesis/lote_dod/marca_pendiente.py,
one row per change polygon in the order of the run's poligonos.gpkg. A polygon
with steep = 1 is small and lies on ground that is steep in both surveys, where a
sideways offset between them reads as a height change. This writes sl: 1 into
data/dod_<slug>.geojson for those, so the popup can say so. Nothing else in the
file changes, and no figure of the run changes. A polygon with shallow = 1 is
small and averages under 1 m of change, barely over the threshold; it gets sh: 1.
A polygon with forest = 1 is under 2,000 m2 and lies under forest on the N50 map,
where the two surveys see the ground differently through the trees; it gets fo: 1.

The two files are matched by position and then checked row by row on area and
volume; if they do not agree, nothing is written. Standard library only.
"""
import csv, json, os, sys

if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    slug, run = sys.argv[1:]
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(here, 'data', f'dod_{slug}.geojson')
    src = os.path.join(run, 'slope_flags.csv')
    if not os.path.exists(src):
        sys.exit(f'  no slope_flags.csv in {run}; run marca_pendiente.py first')
    rows = list(csv.DictReader(open(src, encoding='utf-8')))
    gj = json.load(open(path, encoding='utf-8'))
    feats = gj['features']
    if len(rows) != len(feats):
        sys.exit(f'  {slug}: {len(feats)} click targets but {len(rows)} flag rows; nothing written')
    for f, r in zip(feats, rows):
        p = f['properties']
        if abs(p['a'] - float(r['area_m2'])) > 1 or abs(p['v'] - float(r['volume_m3'])) > 1:
            sys.exit(f"  {slug}: row {r['row']} does not match its click target; nothing written")
    n = m = k = 0
    for f, r in zip(feats, rows):
        f['properties'].pop('sl', None)
        f['properties'].pop('sh', None)
        f['properties'].pop('fo', None)
        if r['steep'] == '1':
            f['properties']['sl'] = 1
            n += 1
        elif r.get('shallow') == '1':
            f['properties']['sh'] = 1
            m += 1
        elif r.get('forest') == '1':
            f['properties']['fo'] = 1
            k += 1
    open(path, 'w', encoding='utf-8').write(json.dumps(gj, separators=(',', ':'), ensure_ascii=False))
    print(f'  {slug}: of {len(feats)} polygons, {n} marked as small and on steep ground, {m} as small and shallow, {k} as small and under forest')
