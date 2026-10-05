#!/usr/bin/env python3
"""Build data/project_geometries.geojson: the line or the perimeter of each
construction project in the Projects tab.

    python3 tools/make_project_geometries.py <raw_dir>

<raw_dir> holds the Overpass answers saved on the day of the run
(osm_lines_raw.json, osm_sites_raw.json, osm_sites2_raw.json and, when the
query got through, osm_nasjonalmuseet_raw.json). Nothing is drawn by hand and
nothing is guessed: a project gets a geometry only when OpenStreetMap carries
an object that names it, or road and rail objects tagged as that project's
alignment. A project with no such object stays a point on the map.

Geometry: (c) OpenStreetMap contributors, ODbL.
"""
import json, math, os, sys

RAW = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'project_geometries.geojson')

def load(name):
    p = os.path.join(RAW, name)
    if not os.path.exists(p):
        return None
    return json.load(open(p, encoding='utf-8'))

def xy(p, lat0):
    return (p[0] * 111320 * math.cos(math.radians(lat0)), p[1] * 110540)

def dp(pts, tol):
    """Douglas-Peucker in metres; pts are [lon, lat]."""
    if len(pts) < 3:
        return pts
    lat0 = pts[0][1]
    P = [xy(p, lat0) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = P[a]; bx, by = P[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy)
        best, bi = 0, None
        for i in range(a + 1, b):
            px, py = P[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / L if L else math.hypot(px - ax, py - ay)
            if d > best:
                best, bi = d, i
        if bi is not None and best > tol:
            keep[bi] = True
            stack.append((a, bi)); stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]

def length(pts):
    s = 0
    for a, b in zip(pts, pts[1:]):
        ax, ay = xy(a, a[1]); bx, by = xy(b, a[1])
        s += math.hypot(bx - ax, by - ay)
    return s

def area(ring):
    lat0 = ring[0][1]
    P = [xy(p, lat0) for p in ring]
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(P, P[1:] + P[:1]))) / 2

def centroid(ring):
    lat0 = ring[0][1]
    P = [xy(p, lat0) for p in ring]
    A = cx = cy = 0
    for (x1, y1), (x2, y2) in zip(P, P[1:] + P[:1]):
        c = x1 * y2 - x2 * y1
        A += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
    if not A:
        return ring[0]
    cx /= 3 * A; cy /= 3 * A
    return [cx / (111320 * math.cos(math.radians(lat0))), cy / 110540]

def inside(pt, ring):
    x, y = pt; c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c

def chain(lines):
    """Join ways that share an end point, so a dashed line runs unbroken."""
    lines = [l[:] for l in lines if len(l) > 1]
    key = lambda p: (round(p[0], 7), round(p[1], 7))
    out = []
    while lines:
        cur = lines.pop(0)
        grown = True
        while grown:
            grown = False
            for i, l in enumerate(lines):
                if key(l[0]) == key(cur[-1]):
                    cur = cur + l[1:]
                elif key(l[-1]) == key(cur[-1]):
                    cur = cur + l[::-1][1:]
                elif key(l[-1]) == key(cur[0]):
                    cur = l + cur[1:]
                elif key(l[0]) == key(cur[0]):
                    cur = l[::-1] + cur[1:]
                else:
                    continue
                lines.pop(i); grown = True
                break
        out.append(cur)
    return out

def rnd(pts):
    return [[round(p[0], 6), round(p[1], 6)] for p in pts]

def way_pts(e):
    return [[p['lon'], p['lat']] for p in e.get('geometry', [])]

lines_raw = load('osm_lines_raw.json')
stamp = (lines_raw.get('osm3s') or {}).get('timestamp_osm_base', '')[:10]
ways = [e for e in lines_raw['elements'] if e['type'] == 'way']
T = lambda e, k: e['tags'].get(k, '')

def in_box(e, s, w, n, ea):
    return all(s <= p['lat'] <= n and w <= p['lon'] <= ea for p in e['geometry'])

LINES = [
    ('SRC_OS_001', 'Fornebubanen',
     lambda e: T(e, 'name') == 'Fornebubanen' and T(e, 'railway') == 'construction',
     'railway=construction, construction=subway, name=Fornebubanen',
     'Both tracks of the metro line as mapped while under construction.'),
    ('SRC_HIS_001', 'Follobanen (Prosjekt)',
     lambda e: T(e, 'name') == 'Follobanen' and T(e, 'railway') == 'rail',
     'railway=rail, name=Follobanen',
     'The line as built, both tunnel tubes (FB1, FB2) and the approaches at Oslo S and Ski.'),
    ('SRC_VI_001', 'E18 Vestkorridoren',
     lambda e: T(e, 'highway') == 'construction' and T(e, 'construction') == 'motorway'
               and in_box(e, 59.88, 10.52, 59.93, 10.65),
     'highway=construction, construction=motorway (E 18, Høviktunnelen, Stabekklokket)',
     'Main carriageways of the new E18 between Lysaker and Ramstadsletta as mapped under construction. '
     'Side roads, ramps and the bus road of the same project are not drawn.'),
    ('SRC_VI_003', 'E134 Oslofjordforbindelsen (Trinn 2)',
     lambda e: T(e, 'highway') == 'proposed' and T(e, 'proposed') == 'trunk'
               and in_box(e, 59.60, 10.50, 59.74, 10.72),
     'highway=proposed, proposed=trunk (incl. name=Oslofjordtunnelen)',
     'Planned second carriageway and tunnel tubes as mapped in OpenStreetMap from the plans; not yet built.'),
    ('SRC_VI_002', 'Ringeriksbanen / E16',
     lambda e: T(e, 'name') == 'Ringeriksbanen' and T(e, 'railway') == 'proposed',
     'railway=proposed, name=Ringeriksbanen',
     'Planned railway Sandvika-Hønefoss as mapped in OpenStreetMap from the plans; the E16 part is not drawn.'),
]

feats = []
def add(uid, name, kind, geom, basis, tags, ids, note, pt, a=None, ln=None):
    p = {'uid': uid, 'n': name, 'kind': kind, 'firm': 1, 'basis': basis,
         'src': 'OpenStreetMap contributors (ODbL), data of ' + stamp,
         'osm_tags': tags, 'osm': ids, 'note': note, 'pt': [round(pt[0], 6), round(pt[1], 6)]}
    if a is not None: p['a'] = int(round(a))
    if ln is not None: p['len'] = int(round(ln))
    feats.append({'type': 'Feature', 'properties': p, 'geometry': geom})

for uid, name, pick, tags, note in LINES:
    sel = [e for e in ways if pick(e)]
    if not sel:
        print('!! no ways for', uid); continue
    parts = [rnd(dp(l, 1.5)) for l in chain([way_pts(e) for e in sel])]
    parts.sort(key=length, reverse=True)
    longest = parts[0]
    half, run, pt = length(longest) / 2, 0, longest[0]
    for a, b in zip(longest, longest[1:]):
        d = length([a, b])
        if run + d >= half:
            f = (half - run) / d if d else 0
            pt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; break
        run += d
    add(uid, name, 'line', {'type': 'MultiLineString', 'coordinates': parts}, 'alignment', tags,
        ','.join('w%d' % e['id'] for e in sel), note, pt, ln=sum(length(p) for p in parts))

def find(elements, wid):
    for e in elements or []:
        if e['type'] == 'way' and e['id'] == wid:
            return e
    return None

s1 = load('osm_sites_raw.json') or {}
s2 = load('osm_sites2_raw.json') or {}
s3 = (load('osm_nasjonalmuseet_raw.json') or {}).get('elements', [])
pool = [e for v in list(s1.values()) + list(s2.values()) if isinstance(v, list) for e in v] + s3 + lines_raw['elements']

# uid, sheet name, [(way id, name the object must carry in OSM)], basis, note
SITES = [
    ('SRC_OS_002', 'Ny vannforsyning Oslo (NVO)',
     # A third object, name='Ny vannforsyning' (w. of Makrellbekken), is left out:
     # the aerial shows woodland there, not a construction site.
     [(None, 'Ny vannforsyning Oslo'), (None, 'ny vannforsyning  oslo')],
     'construction sites',
     'Two surface construction sites of the project as mapped in OpenStreetMap and seen on the aerial. The tunnels themselves are not mapped and are not drawn.'),
    ('SRC_OS_012', 'Nye Aker Sykehus', [(1457275070, 'Nye Aker Sykehus')], 'construction site',
     'Construction site as mapped in OpenStreetMap (landuse=construction).'),
    ('SRC_OS_015', 'Construction City', [(1333507389, 'Construction City')], 'building', 'Building outline.'),
    ('SRC_HIS_004', 'Munchmuseet (Munch)', [(545260792, 'Munchmuseet')], 'building', 'Building outline.'),
    ('SRC_OS_003', 'Livsvitenskapsbygget', [(1055397248, 'UiO Livsvitenskapsbygget')], 'building', 'Building outline.'),
    ('SRC_OS_013', 'Bjørvika Skole', [(1561095447, 'Bjørvika skole')], 'building',
     'Building outline as mapped while under construction (building=construction).'),
    ('SRC_HIS_003', 'Nasjonalmuseet', [(None, 'Nasjonalmuseet')], 'building', 'Building outline.'),
]
for uid, name, wanted, basis, note in SITES:
    polys, ids, tg = [], [], set()
    for wid, oname in wanted:
        if wid is not None:
            cand = [find(pool, wid)]
        else:
            cand = [e for e in pool if e['type'] == 'way' and T(e, 'name') == oname
                    and (T(e, 'building') or T(e, 'landuse') == 'construction')]
        seen = set()
        for e in cand:
            if not e or e['id'] in seen: continue
            seen.add(e['id'])
            if T(e, 'name') != oname:
                print('!! name mismatch', uid, e['id'], T(e, 'name')); continue
            r = way_pts(e)
            if len(r) < 4 or r[0] != r[-1]:
                print('!! not a closed way', uid, e['id']); continue
            if e['id'] in ids: continue
            polys.append([rnd(dp(r, 0.5))]); ids.append(e['id'])
            tg.add('building=' + T(e, 'building') if T(e, 'building') else 'landuse=' + T(e, 'landuse'))
    if not polys:
        print('-- no outline for', uid, name); continue
    big = max(polys, key=lambda p: area(p[0]))[0]
    c = centroid(big)
    if not inside(c, big): c = big[0]
    add(uid, name, 'perimeter', {'type': 'MultiPolygon', 'coordinates': polys}, basis,
        ', '.join(sorted(tg)) + ', name as in OSM', ','.join('w%d' % i for i in ids), note, c,
        a=sum(area(p[0]) for p in polys))

json.dump({'type': 'FeatureCollection', 'features': feats}, open(OUT, 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
for f in feats:
    p = f['properties']
    n = sum(len(x) for x in f['geometry']['coordinates']) if p['kind'] == 'line' else sum(len(r) for x in f['geometry']['coordinates'] for r in x)
    print(p['uid'], p['kind'], len(f['geometry']['coordinates']), 'parts', n, 'pts', p.get('len', p.get('a')), p['pt'])
print(os.path.getsize(OUT), 'bytes')
