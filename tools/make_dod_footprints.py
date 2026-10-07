#!/usr/bin/env python3
"""Collect the calculated-area outline of each DoD run into one map layer.

    python tools/make_dod_footprints.py <slug>=<run_dir> [<slug>=<run_dir> ...]

Each run folder written by unigis_tesis/lote_dod/run_lote.py holds
footprint.geojson: the ground where both surveys have data, inside the kommune.
That is the area a DoD was actually computed for. Outside it the map has no
measurement, which is not the same as no change.

Beside it, kommune.geojson (written by lote_dod/limite_kommune.py, read here when
it is there) holds the kommune's land. It goes into the same file as a second
feature with kind: 'kommune', so the map can show how much of the kommune a run
covers.

Runs are added to, or replaced in, data/dod_footprints.geojson by slug, so the
file can be built one kommune at a time. Standard library only.
"""
import json, os, sys

DEC = 5   # ~1 m

# The pipeline config carries five kommune numbers that belong to other kommuner
# (checked against Kartverket's kommuneinfo on 5 October 2026) and one misspelt
# name. The map gets the right ones whatever the run folder says.
NUMBER = {'Gjerdrum': '3230', 'Nannestad': '3238', 'Hurdal': '3242', 'Nittedal': '3232', 'Jevnaker': '3236'}
NAME = {'Skipvet': 'Skiptvet'}


def polygonal(geom):
    """The area part of a footprint. Clipping to a kommune with islands can leave
    stray points and lines in a GeometryCollection; the map wants polygons only."""
    if geom['type'] in ('Polygon', 'MultiPolygon'):
        return geom
    parts = []
    for g in geom.get('geometries', []):
        if g['type'] == 'Polygon':
            parts.append(g['coordinates'])
        elif g['type'] == 'MultiPolygon':
            parts.extend(g['coordinates'])
    return {'type': 'MultiPolygon', 'coordinates': parts}


def rnd(o):
    return [rnd(i) for i in o] if isinstance(o, (list, tuple)) else round(o, DEC)


def bbox(coords, b=None):
    b = b or [180, 90, -180, -90]
    if isinstance(coords[0], (int, float)):
        return [min(b[0], coords[0]), min(b[1], coords[1]), max(b[2], coords[0]), max(b[3], coords[1])]
    for c in coords:
        b = bbox(c, b)
    return b


if __name__ == '__main__':
    pairs = [a.split('=', 1) for a in sys.argv[1:] if '=' in a]
    if not pairs:
        sys.exit(__doc__)
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(here, 'data', 'dod_footprints.geojson')
    feats = {}
    if os.path.exists(out):
        for f in json.load(open(out, encoding='utf-8'))['features']:
            feats[f['properties']['id'] + ('/kommune' if f['properties'].get('kind') == 'kommune' else '')] = f
    for slug, run in pairs:
        f = json.load(open(os.path.join(run, 'footprint.geojson'), encoding='utf-8'))
        p = f['properties']
        p['kommune'] = NAME.get(p['kommune'], p['kommune'])
        p['code'] = NUMBER.get(p['kommune'], p['code'])
        geom = polygonal(f['geometry'])
        g = {'type': geom['type'], 'coordinates': rnd(geom['coordinates'])}
        feats[slug] = {'type': 'Feature', 'geometry': g,
                       'properties': {'id': slug, 'kommune': p['kommune'], 'code': p['code'],
                                      'years': f"{p['old']}–{p['new']}", 'ha': p['ha'], 'n': p['n']}}
        feats.pop(slug + '/kommune', None)
        kpath = os.path.join(run, 'kommune.geojson')
        if os.path.exists(kpath):
            k = json.load(open(kpath, encoding='utf-8'))
            kg = polygonal(k['geometry'])
            feats[slug + '/kommune'] = {
                'type': 'Feature', 'geometry': {'type': kg['type'], 'coordinates': rnd(kg['coordinates'])},
                'properties': {'id': slug, 'kind': 'kommune', 'kommune': p['kommune'], 'code': p['code'],
                               'ha_land': k['properties']['ha_land'], 'ha_kommune': k['properties']['ha_kommune']}}
        b = bbox(g['coordinates'])
        print(f"  {slug}: {p['ha']:,.0f} ha, {p['n']} polygons, "
              f"bounds [{b[0]:.5f}, {b[1]:.5f}, {b[2]:.5f}, {b[3]:.5f}]")
    txt = json.dumps({'type': 'FeatureCollection', 'features': [feats[k] for k in sorted(feats)]},
                     separators=(',', ':'), ensure_ascii=False)
    open(out, 'w', encoding='utf-8').write(txt)
    print(f'  {len(feats)} outlines, {len(txt) / 1024:.0f} KB -> data/dod_footprints.geojson')
