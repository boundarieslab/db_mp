"""Add outlines for the construction-project rows of 19 Nov 2026 to data/project_geometries.geojson.

Inputs, saved on the day in tools/project_outlines_2026-11-19.json:
- the plan area (RpOmråde) of each project's regulation plan, read from the national plan
  register (Nasjonal arealplanbase, DiBK, NAP WMS reguleringsplaner, GetFeatureInfo at the
  project's point), simplified to 1 m;
- three OpenStreetMap ways named for the works (ODbL).
A plan area is what the plan regulates, not a worked footprint; the note says so. Projects
whose plan is not in the register (Friluftsøya, ended) or whose only plan is a much larger
area plan (Tåjeodden, Åsland Næringspark, Tyttebærmoen) get no outline.
Idempotent: features with these uids are replaced. Run from db_mp:
    python3 tools/add_project_outlines.py"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = json.load(open(os.path.join(HERE, 'project_outlines_2026-11-19.json'), encoding='utf-8'))
OUT = os.path.join(HERE, '..', 'data', 'project_geometries.geojson')

def dec(r):
    x = y = 0; pts = []
    for c in r.split(','):
        dx, dy = map(int, c.split()); x += dx; y += dy; pts.append([x / 1e6, y / 1e6])
    return pts
def polys(enc):
    out = []
    for pl in enc.split('|'):
        rings = [dec(r) for r in pl.split(';')]
        for r in rings:
            if r[0] != r[-1]: r.append(r[0])
        out.append(rings)
    return out
def xy(p, lat0): return (p[0] * 111320 * math.cos(math.radians(lat0)), p[1] * 110540)
def ring_area(r):
    lat0 = r[0][1]; P = [xy(p, lat0) for p in r]
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(P, P[1:]))) / 2
def area(mp): return round(sum(ring_area(pl[0]) - sum(ring_area(h) for h in pl[1:]) for pl in mp))
def length(lines):
    s = 0
    for l in lines:
        for a, b in zip(l, l[1:]):
            ax, ay = xy(a, a[1]); bx, by = xy(b, a[1]); s += math.hypot(bx - ax, by - ay)
    return round(s)
def inside(pt, ring):
    x, y = pt; c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def point_in(mp):
    """A point inside the largest polygon: the middle of the longest horizontal chord through its centre line."""
    pl = max(mp, key=lambda p: ring_area(p[0])); r = pl[0]
    ys = sorted(p[1] for p in r); y = (ys[0] + ys[-1]) / 2
    xs = sorted(x1 + (y - y1) * (x2 - x1) / (y2 - y1) for (x1, y1), (x2, y2) in zip(r, r[1:]) if (y1 > y) != (y2 > y))
    best = max(((xs[i + 1] - xs[i], (xs[i] + xs[i + 1]) / 2) for i in range(0, len(xs) - 1, 2)))
    p = [round(best[1], 6), round(y, 6)]; assert inside(p, r); return p

NAMES = {'VI_015': 'Moss næringspark, Nore og Vanem felt 7–12', 'VI_016': 'Fjordbyen Lier: utfylling av Gilhusbukta',
         'VI_017': 'Gardermoen Næringspark II B og C (Oslo Airport City)', 'VI_020': 'Kopstad godsterminal (oppfylling)',
         'VI_021': 'Viken Park (Tofteberg)', 'VI_022': 'Lakseberget (utfylling i Sandviksbukta)',
         'VI_024': 'Hurum brygge: molo og utfylling i sjø', 'VI_026': 'Holtskogen næringsområde, utvidelse'}
NAP_SRC = 'Nasjonal arealplanbase (DiBK), NAP WMS reguleringsplaner, layer RpOmråde; read 2026-11-19'
feats = []
nap = SRC['nap_reguleringsplaner_rpomrade']
for k, v in nap.items():
    mp = polys(v['enc']); plans = ['%s/%s %s (in force %s)' % (v['kn'], v['pid'], v['name'], v['date'])]
    if k == 'VI_017':   # the three plans named for Gardermoen Næringspark II B og C
        for pk in ('p377', 'p445'):
            w = SRC['nap_gardermoen_more'][pk]; mp += polys(w['enc'])
            plans.append('%s/%s %s (in force %s)' % (w['kn'], pk[1:], w['name'], w['date']))
    note = ('The plan area (RpOmråde) of the project\'s regulation plan in the national plan register, simplified to 1 m: '
            'what the plan regulates, not a worked footprint.')
    if k == 'VI_017': note += ' Three plans carry the name of Gardermoen Næringspark II B og C; their areas are drawn together (some overlap).'
    if k == 'VI_024': note += ' The marina plan (Småbåthavn Tofte strand), which holds the breakwater; the housing plan around it is not drawn.'
    if k == 'VI_016': note += ' The fill plan for Gilhusbukta, the same ground as facility BU_LI_003.'
    feats.append({'type': 'Feature', 'geometry': {'type': 'MultiPolygon', 'coordinates': mp},
                  'properties': {'uid': 'SRC_' + k, 'n': NAMES[k], 'kind': 'perimeter', 'firm': 1, 'basis': 'plan area',
                                 'src': NAP_SRC, 'srcname': 'Nasjonal arealplanbase', 'plan': '; '.join(plans), 'note': note,
                                 'pt': point_in(mp), 'a': area(mp)}})
OSM_SRC = 'OpenStreetMap contributors (ODbL), read 2026-11-19 (API 0.6)'
ow = SRC['osm_ways']
fill = polys(ow['w26685865']['enc'])
feats.append({'type': 'Feature', 'geometry': {'type': 'MultiPolygon', 'coordinates': fill},
              'properties': {'uid': 'SRC_OS_017', 'n': 'Åsland: permanent fylling av tunnelboremasser (Follobanen)', 'kind': 'perimeter', 'firm': 1,
                             'basis': 'construction site', 'src': OSM_SRC, 'osm': 'w26685865', 'osm_tags': 'landuse=construction, name=Anleggsområde Follobanen',
                             'note': 'The former Follobanen rig and deposit area as mapped in OpenStreetMap.', 'pt': point_in(fill), 'a': area(fill)}})
moss = polys(ow['w961392018']['enc'])
feats.append({'type': 'Feature', 'geometry': {'type': 'MultiPolygon', 'coordinates': moss},
              'properties': {'uid': 'SRC_VI_019', 'n': 'Østfoldbanen: Sandbukta–Moss–Såstad', 'kind': 'perimeter', 'firm': 1,
                             'basis': 'construction site', 'src': OSM_SRC, 'osm': 'w961392018', 'osm_tags': 'landuse=construction, construction=railway, name=Mossetunnelen',
                             'note': 'The Mossetunnelen construction area only; the rest of the double track is not mapped as such.', 'pt': point_in(moss), 'a': area(moss)}})
ids = ['w601739955', 'w1420736567', 'w1420736565', 'w1420414367']
lines = [dec(ow[i]['enc']) for i in ids]
mid = lines[0][len(lines[0]) // 2]
feats.append({'type': 'Feature', 'geometry': {'type': 'MultiLineString', 'coordinates': lines},
              'properties': {'uid': 'SRC_HIS_006', 'n': 'Vestfoldbanen: Drammen–Kobbervikdalen', 'kind': 'line', 'firm': 1, 'basis': 'alignment',
                             'src': OSM_SRC, 'osm': ','.join(i[1:] for i in ids), 'osm_tags': 'railway (Vestfoldbanen, new double track), tunnel sections',
                             'note': 'The new double track Drammen–Kobbervikdalen as mapped in four OpenStreetMap ways.', 'pt': [round(mid[0], 6), round(mid[1], 6)], 'len': length(lines)}})

feats = [{'type': 'Feature', 'properties': f['properties'], 'geometry': f['geometry']} for f in feats]   # key order as in the file
gj = json.load(open(OUT, encoding='utf-8'))
new = {f['properties']['uid'] for f in feats}
keep = [f for f in gj['features'] if f['properties']['uid'] not in new]
gj['features'] = keep + feats
raw = open(OUT, 'rb').read(); end = raw[len(raw.rstrip()):].decode()   # keep the file's own ending (none)
txt = json.dumps(gj, ensure_ascii=False, separators=(',', ':'))
open(OUT, 'w', encoding='utf-8', newline='').write(txt + end)
print(len(keep), 'kept +', len(feats), 'added')
for f in feats: p = f['properties']; print(p['uid'], p['kind'], p['basis'], p.get('a') or p.get('len'), p['pt'])
