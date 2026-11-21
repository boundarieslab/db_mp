# Routes the published flows over the NVDB E/R/F truck network (nvdb_edges.csv,
# Desktop\lub\01_DIRTY_BUSINESS\ANALISIS\DRIVETIME) and bundles the routes into one
# network, so a stretch of road used by several flows is drawn once.
#
#   python tools/route_flows.py nvdb_edges.csv data/flows.csv tools/flow_points.json \
#                               data/flow_routes.geojson data/flow_net.geojson
#
# Route: quickest path for a truck, by travel time. NVDB gives no speed per link here,
# so each link gets a truck speed from its road class (below). Each end is joined to its
# nearest network node by a straight piece. Sea legs (barge) are straight.
# Bundle: every network link is tagged with the flows that use it; consecutive links with
# the same set of flows are merged into one stretch. The map draws the stretches at rest
# and a single flow's own route when it is picked.
# Every published row of data/flows.csv is routed; its Transport column says 'road', 'sea'
# (a barge leg) or 'road+sea' (truck to a quay, then barge; quay and fjord waypoints in _legs).
# The end points (tools/flow_points.json) are the points the map uses: sheet coordinates, or
# the point a project takes from data/project_geometries.geojson. A new end needs a line there.
import csv, json, math, sys, networkx as nx
from shapely.geometry import LineString

E_CSV, FLOWS_CSV, PTS_JSON, OUT, NET = sys.argv[1:6]

# Truck speed by road class, km/h. Motorways and dual carriageways fastest; ramps and
# roundabouts slow. Only the ratios matter for picking the route.
SPEED = {('Kanalisert veg', 'E'): 85, ('Kanalisert veg', 'R'): 75, ('Kanalisert veg', 'F'): 55,
         ('Enkel bilveg', 'E'): 70, ('Enkel bilveg', 'R'): 65, ('Enkel bilveg', 'F'): 50,
         ('Rampe', 'E'): 45, ('Rampe', 'R'): 40, ('Rampe', 'F'): 35,
         ('Rundkjøring', 'E'): 25, ('Rundkjøring', 'R'): 25, ('Rundkjøring', 'F'): 25}

def hav(a, b):
    R = 6371000; la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((la2-la1)/2)**2 + math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))

G = nx.Graph(); pos = {}
with open(E_CSV, encoding='utf-8') as f:
    next(f)
    for line in f:
        p = line.rstrip('\n').split(',')
        if len(p) < 8: continue
        a, b, L, typ, kat = p[0], p[1], float(p[2] or 0), p[3], p[4]
        if typ == 'Bilferje': continue
        pts = [tuple(map(float, q.split(','))) for q in ','.join(p[6:]).split(' ') if ',' in q]
        pts = [(lo, la) for la, lo in pts]
        if len(pts) < 2: continue
        if a in pos and hav(pos[a], pts[-1]) < hav(pos[a], pts[0]): pts = pts[::-1]
        pos.setdefault(a, pts[0]); pos.setdefault(b, pts[-1])
        L = L or hav(pts[0], pts[-1])
        t = L / (SPEED.get((typ, kat), 40) / 3.6)
        if G.has_edge(a, b) and G[a][b]['t'] <= t: continue
        G.add_edge(a, b, t=t, L=L, g=pts)
cc = max(nx.connected_components(G), key=len); G = G.subgraph(cc).copy()
nodes = list(G.nodes); P = [pos[n] for n in nodes]

def snap(pt):
    best = min(range(len(P)), key=lambda i: (P[i][0]-pt[0])**2*0.25 + (P[i][1]-pt[1])**2)
    return nodes[best], hav(P[best], pt)

PTS = json.load(open(PTS_JSON, encoding='utf-8'))
# '_legs': per flow, the quay a truck leg ends at ('via') and the waypoints of the barge leg
# ('sea'), so a sea leg follows the fjord instead of crossing land.
LEGS = PTS.pop('_legs', {})
FLOWS = [{'fid': r['FlowUID'], 'from': r['FromUID'].strip(), 'to': r['ToUID'].strip(),
          'mode': (r.get('Transport') or 'road').strip() or 'road', 'outcome': r['Outcome'].strip().lower()}
         for r in csv.DictReader(open(FLOWS_CSV, encoding='utf-8'))
         if r['Published'].strip().upper() == 'TRUE' and r['EvidenceClass'].strip() == 'evidenced']
missing = sorted({u for f in FLOWS for u in (f['from'], f['to']) if u not in PTS})
if missing: raise SystemExit('no point for: ' + ', '.join(missing) + ' (add them to ' + PTS_JSON + ')')

feats = []; use = {}       # edge key -> set of fids
legs = {}                  # fid -> list of (kind, payload)
for fl in FLOWS:
    fid, fr, to, mode = fl['fid'], fl['from'], fl['to'], fl['mode']
    A, B = tuple(PTS[fr]), tuple(PTS[to])
    leg = LEGS.get(fid, {})
    seaB = None
    if mode == 'road+sea':                      # truck to a quay, then barge
        seaB = [tuple(leg['via'])] + [tuple(q) for q in leg.get('sea', [])] + [B]
        B = tuple(leg['via'])
    if mode == 'sea':
        coords = [A] + [tuple(q) for q in leg.get('sea', [])] + [B]
        km = sum(hav(a, b) for a, b in zip(coords, coords[1:]))/1000; sa = sb = 0; path = []
    else:
        na, sa = snap(A); nb, sb = snap(B)
        # both ends join the same node (a move to the site next door): one straight join, no road
        path = nx.shortest_path(G, na, nb, weight='t') if na != nb or seaB else []
        coords = [A, pos[na]] if path else [A]
        for u, v in zip(path, path[1:]):
            g = G[u][v]['g']
            if hav(g[0], coords[-1]) > hav(g[-1], coords[-1]): g = g[::-1]
            coords += g[1:]
            use.setdefault(frozenset((u, v)), set()).add(fid)
        coords.append(B)
        km = ((sa + sb + nx.path_weight(G, path, weight='L')) if path else hav(A, B))/1000
        if not path: sa = sb = 0
    sea_from = 0
    if seaB:
        sea_from = len(coords) - 1
        coords += seaB[1:]
        km += sum(hav(a, b) for a, b in zip(seaB, seaB[1:]))/1000
    legs[fid] = dict(A=A, B=B, path=path, mode=mode, na=path[0] if path else None,
                     nb=path[-1] if path else None, seaB=seaB, sea=coords if mode == 'sea' else None)
    mins = (nx.path_weight(G, path, weight='t')/60) if path else None
    if sea_from:
        r1 = list(LineString(coords[:sea_from + 1]).simplify(0.00008).coords)
        out_coords = r1 + coords[sea_from + 1:]; sea_from = len(r1) - 1
    else:
        out_coords = list(LineString(coords).simplify(0.00008).coords) if mode != 'sea' else coords
    props = {'fid': fid, 'mode': mode, 'km': round(km, 1), 'min': round(mins) if mins else None,
             'snap_from_m': round(sa), 'snap_to_m': round(sb)}
    if sea_from: props['sea_from'] = sea_from
    feats.append({'type': 'Feature', 'properties': props,
                  'geometry': {'type': 'LineString', 'coordinates': [[round(x, 6), round(y, 6)] for x, y in out_coords]}})
    print(fid, mode, round(km, 1), 'km', (round(mins) if mins else '-'), 'min', 'snap', round(sa), round(sb), 'm')

json.dump({'type': 'FeatureCollection', 'name': 'flow_routes',
           'basis': 'Quickest truck path over the NVDB E, R and F road network (fetched 25.09.2026), speed by road class; each end joined to its nearest network node by a straight piece. Sea legs are drawn straight.',
           'features': feats}, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))

# ---- bundle: merge consecutive links that carry the same set of flows ----
H = nx.Graph()
for k, s in use.items():
    u, v = tuple(k); H.add_edge(u, v, fl=frozenset(s))
seen = set(); net = []
def chain_from(u, v):
    key = H[u][v]['fl']; line = [u, v]; seen.add(frozenset((u, v)))
    for end in (0, 1):
        while True:
            n = line[-1] if end == 0 else line[0]
            prev = line[-2] if end == 0 else line[1]
            nxt = [w for w in H[n] if w != prev and frozenset((n, w)) not in seen and H[n][w]['fl'] == key]
            if H.degree(n) != 2 or len(nxt) != 1: break
            seen.add(frozenset((n, nxt[0])))
            if end == 0: line.append(nxt[0])
            else: line.insert(0, nxt[0])
    return line, key
def geom(nodeline):
    c = [pos[nodeline[0]]]
    for u, v in zip(nodeline, nodeline[1:]):
        g = G[u][v]['g']
        if hav(g[0], c[-1]) > hav(g[-1], c[-1]): g = g[::-1]
        c += g[1:]
    return c
for u, v in H.edges:
    if frozenset((u, v)) in seen: continue
    nl, key = chain_from(u, v)
    net.append((geom(nl), key))
# the straight joins and sea legs, one per flow
for fid, L in legs.items():
    if L['mode'] == 'sea':
        net.append((L['sea'], frozenset([fid]), 'sea'))
    elif not L['path']:
        net.append(([L['A'], L['B']], frozenset([fid])))
    else:
        net.append(([L['A'], pos[L['na']]], frozenset([fid])))
        net.append(([pos[L['nb']], L['B']], frozenset([fid])))
        if L['seaB']: net.append((L['seaB'], frozenset([fid]), 'sea'))
out = []
for item in net:
    c, key = item[0], item[1]; mode = item[2] if len(item) > 2 else 'road'
    if len(c) < 2: continue
    ls = LineString(c).simplify(0.00008) if mode != 'sea' else LineString(c)
    outc = sorted({o for o in (next(x['outcome'] for x in FLOWS if x['fid'] == f) for f in key)})
    out.append({'type': 'Feature', 'properties': {'n': len(key), 'fids': ','.join(sorted(key)), 'mode': mode,
                'solid': any(o in ('received', 'in progress') for o in outc)},
                'geometry': {'type': 'LineString', 'coordinates': [[round(x, 6), round(y, 6)] for x, y in ls.coords]}})
json.dump({'type': 'FeatureCollection', 'name': 'flow_net',
           'basis': 'The flow routes merged: a stretch used by several flows is one line, tagged with the flows on it.',
           'features': out}, open(NET, 'w'), ensure_ascii=False, separators=(',', ':'))
print('stretches', len(out), 'max flows on a stretch', max(f['properties']['n'] for f in out))
