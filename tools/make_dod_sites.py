#!/usr/bin/env python3
"""The largest terrain-change clusters of every run on the map, with what each could be.

    python tools/make_dod_sites.py --root <runs_folder> [--min-m3 N] [--top N] [--list]

Writes data/dod_sites.json, the table behind the TERRAIN CHANGE sheet.

Nearness is the base of a cluster and the reguleringsplan is its context. Four rules,
in this order:

1. A road or a railway is one work and is kept as whole as it can be: every polygon
   under its reguleringsplan, flagged or not, however far apart. The plans of its
   sections are one cluster when they lie within 50 m of each other and are of the same
   mode (road with road, rail with rail), or when their titles carry the same road
   number (E6, rv. 4, fv. 152) or the same line name (Follobanen). Road and rail
   clusters with half their changed area within 150 m of one construction project of
   the database are joined as well.
2. A landslide: the scar and the mass it laid down are one cluster, with the rest of
   the change under the reguleringsplan drawn up for the slide ground.
3. Everything else. The polygons of one reguleringsplan within 250 m of each other are
   one cluster (a plan that zones half a kommune is not one work, and is not gathered
   over kilometres). Neighbouring plans named alike are joined at 50 m. Ground under no
   reguleringsplan has nearness alone, 50 m (the distance the DoD run itself uses), and
   is never joined to planned ground (in Gjerdrum a road scheme's fills and the
   unplanned digging beside it once came out as one row, named after the plan); its row
   carries beside, the planned work within 50 m of it.
4. A small flagged polygon (under forest, steep, shallow) belongs to the cluster it lies
   in: the nearest unflagged polygon within 50 m with the same context. It never ties
   two clusters together. What is left over is grouped among its own kind.

There are three kinds, k in the file for the two that are listed:

    site     a cluster with at least one polygon that carries no flag (the flagged
             polygons lying in it are counted with it). Kept per run: the --top
             largest by volume moved (default 6) that move at least --min-m3 (default
             20,000 m3), and every cluster of 150,000 m3 or more.
    forest   a cluster made only of small polygons under forest (the forest flag).
             They are not dismissed: it may be erosion, a slope process, forestry, or
             the two surveys seeing the ground differently through the trees. Kept per
             run: the three largest that move 5,000 m3 or more.

Clusters made only of small steep or small shallow polygons are never listed.
Within a kommune no two rows carry the same name: the larger keeps the nearest place
name, the next takes the nearest one still free. Polygons set aside as shore or stream were never in
the run's layer. For each cluster the deposit and the excavation / erosion are summed
apart. Every polygon of the run's click targets (data/dod_<slug>.geojson) gets c, the
number of its group within the run, and a listed cluster carries the same c: that is
how the map marks a cluster's own polygons and finds the cluster from a click. No
outline is invented around them.

ty is the typology: the class of human intervention the evidence points to, after
Szabó, Dávid and Lóczy (2010), Anthropogenic Geomorphology: mining (montanogenic),
spoil (waste and spoil deposits, industrogenic), industry (industrogenic), urban
(urbanogenic), traffic, water (water management), agro (agrogenic), sport (tourism
and sports); and outside it slide (landslide), forest (forest ground, cause not
established) and other. It is read from the facility type, the names of the
project and the reguleringsplan, and the land cover, in that order. fm is the form:
acc (accumulation, 80 % or more of the volume is deposit), exc (excavation) or cf
(cut and fill).

What a site could be is never asserted. Four pieces of evidence are written, and
the map shows the first that exists:

    fac     a facility of the database within 150 m of the change, when half or more of
            the cluster's changed area lies within 750 m of it
    proj    a construction project of the database, when half or more of the cluster's
            changed area lies within 150 m of its line or perimeter
    plan    the reguleringsplan covering most of the site's changed area, by name,
            with its status (1 in force during the run's years, 2 only after) and
            the share of the changed area it covers; only for runs with a plan check
    cover   the N50 land cover under the largest polygon (quarry, industrial ground,
            built-up ground, farmland, forest, ...)

and place, the nearest N50 place name, so a row can be found on a map. A landslide
set aside by the plan check is kept as a site and marked ls.

Needs geopandas (the unigis_tesis environment) and, for the facility names, a
machine that can read the published database sheet.
"""
import csv, io, json, os, re, sys, urllib.request

import geopandas as gpd
import pandas as pd
from shapely.geometry import GeometryCollection, Point, shape
from shapely.ops import unary_union
from shapely.strtree import STRtree
import numpy as np
import shapely

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N50 = None
JOIN_M, NEAR_FAC_M, NEAR_PROJ_M, PLACE_M = 50.0, 150.0, 150.0, 2500.0
SAME_PLAN_M = 250.0                    # the polygons of one reguleringsplan this near each other are one cluster
ALWAYS_M3 = 150_000
FAC_REACH_M = 750.0                    # half of a cluster's changed area lies this near the facility that names it
PROJ_SHARE = 0.5                       # of a cluster's changed area, within NEAR_PROJ_M of the project
FOREST_TOP, FOREST_MIN_M3 = 3, 5_000  # clusters of small change under forest kept per run


def opt(name, cast, default):
    return cast(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default


def sheet_urls():
    html = open(os.path.join(HERE, 'index.html'), encoding='utf-8').read()
    return re.search(r"FACILITIES_CSV = '([^']+)'", html).group(1)


def facilities():
    """UID, name and position of the database's facilities, in EPSG:25832."""
    try:
        req = urllib.request.Request(sheet_urls(), headers={'User-Agent': 'Mozilla/5.0'})
        txt = urllib.request.urlopen(req, timeout=40).read().decode('utf-8')
    except Exception as e:                                  # noqa: BLE001
        print(f'  facilities not read ({e}); sites are named without them')
        return None
    rows = []
    for r in csv.DictReader(io.StringIO(txt)):
        try:
            lat = float(str(r.get('Latitude') or r.get('Lat') or '').replace(',', '.'))
            lon = float(str(r.get('Longitude') or r.get('Lon') or '').replace(',', '.'))
        except ValueError:
            continue
        uid = (r.get('UID') or r.get('Uid') or '').strip()
        name = (r.get('Name') or '').strip()
        if uid and name:
            rows.append({'uid': uid, 'name': name, 'type': (r.get('Type') or '').strip(), 'geometry': Point(lon, lat)})
    if not rows:
        return None
    return gpd.GeoDataFrame(rows, crs=4326).to_crs(25832)


def projects():
    p = os.path.join(HERE, 'data', 'project_geometries.geojson')
    if not os.path.exists(p):
        return None
    g = gpd.read_file(p)
    if not len(g):
        return None
    g = g.set_crs(4326, allow_override=True).to_crs(25832)
    name = next((c for c in ('n', 'name', 'Name', 'project', 'Project', 'ProjectName') if c in g.columns), None)
    uid = next((c for c in ('uid', 'UID', 'ProjectUID', 'id') if c in g.columns), None)
    if not name and not uid:
        return None
    g['pname'] = g[name].astype(str) if name else g[uid].astype(str)
    g['puid'] = g[uid].astype(str) if uid else ''
    return g[['pname', 'puid', 'geometry']]


def places(bounds):
    g = gpd.read_file(N50, layer='N50_Stedsnavn_tekstplassering', bbox=tuple(bounds))
    if not len(g):
        return None
    col = next(c for c in ('fulltekst', 'streng', 'TextString') if c in g.columns)
    g = g[g[col].astype(str).str.contains(r'[A-Za-zÆØÅæøå]{3}', regex=True)].copy()      # not heights or road numbers
    g['pl_name'] = g[col].astype(str)
    g['geometry'] = g.geometry.representative_point()
    return g[['pl_name', 'geometry']]


MINING = r"pukk|massetak|masseuttak|steinbrudd|grustak|sandtak|råstoff|\buttak\b|\bbruk\b|steinuttak|fjelluttak"
SPOIL = r"deponi|massemottak|massedeponi|avfall|fyllplass|\bfylling|miljøpark|gjenvinning|massesenter|massehåndtering|\btipp\b"
TRAFFIC = (r"(?<!felt )\be\s?\d{1,3}\b|\brv\.?\s?\d|\bfv\.?\s?\d|riksve[gi]|fylkesve[gi]|\bve[gi]\b|\bveg(en)?\b|banen\b|\bbane\b|jernbane|intercity"
           r"|metro|trasé|t-bane|sykkel|gang-|\bkryss|\bbru\b|tunnel|flyplass|\bstasjon|parkering|\bhavn\b|kollektiv|oslofjordforbindelsen")
SPORT = r"idrett|golf|alpin|\bski|motorsenter|skytebane|stadion|travbane|ridesenter|lysløype|hoppbakke"
WATER = r"\bdam\b|flomsikring|vassdrag|renseanlegg|vannverk|kraftverk|vannforsyning|overvann"
URBAN = (r"bolig|\bfelt\b|sentrum|\btun|skole|barnehage|sykehus|campus|brygge|landsby|fortetting|omsorg|kirke|hytte|helsepark"
         r"|byutvikling|områderegulering")
INDUSTRY = r"næring|industri|lager|logistikk|handel|gartneri|trelast|verksted|forretning"
FARM = r"landbruk|jordbruk|bakkeplanering|nydyrking|jordforbedring|oppfylling av jord"
MINING_TYPES = r"pukkverk|grustak|massetak|steinbrudd|uttak"
SPOIL_TYPES = r"deponi|massemottak|gjenvinning|avfall|sjøutfylling"


STOP = set("""detaljregulering detajregulering detaljreguleringsplan reguleringsplan reguleringsendring områderegulering områdeplan
regulering endring endret mindre mellom område området omr felt feltet gbnr gnr bnr nord nordre søndre sør syd vest vestre øst østre
del deler med for og av til ved plan mfl etappe trinn boligområde boligfelt boliger bolig næringsområde industriområde sentrum
gård vei veg veien vegen samt nye nytt utvidelse parsell parsellen strekning strekningen kommune""".split())


def plan_class(name):
    """What a reguleringsplan is for, read from its title."""
    t = (name or '').lower()
    # "Hans Haslums vei 2-10" is an address, not a road scheme.
    address = re.search(r"ve[gi](en)?\s+\d", t) and not re.search(r"\b(?:e|rv|fv)\.?\s?\d", t)
    for key, rx in (('mining', MINING), ('spoil', SPOIL), ('sport', SPORT), ('traffic', TRAFFIC), ('water', WATER),
                    ('agro', FARM), ('industry', INDUSTRY), ('urban', URBAN)):
        if key == 'traffic' and address:
            continue
        if re.search(rx, t):
            return key
    return 'other'


def plan_words(name, kom=''):
    t = (name or '').lower()
    roads = {re.sub(r'[\s.]', '', m) for m in re.findall(r'(?<!felt )\b(?:e|rv|fv)\.?\s?\d{1,4}\b', t)}
    words = {w for w in re.findall(r'[a-zæøå]{4,}', t) if w not in STOP and w != kom}
    return roads | words


def same_work(a, b, kom=''):
    """Two reguleringsplaner are the same work when they are the same plan, or of the same
    kind and named alike: both transport plans, or sharing a road number or a name."""
    if a == b:
        return True
    ca, cb = plan_class(a), plan_class(b)
    if ca != cb:
        return False
    if ca == 'traffic':
        return True
    return bool(plan_words(a, kom) & plan_words(b, kom))


def road_marks(name):
    """What tells two sections of one road or line: the road number, the name of the line."""
    t = (name or '').lower()
    roads = {re.sub(r'[\s.]', '', m) for m in re.findall(r'(?<!felt )\b(?:e|rv|fv)\.?\s?\d{1,4}\b', t)}
    lines = set(re.findall(r'[a-zæøå]{3,}banen', t)) - {'jernbanen'}
    return roads | lines


RAIL = r"banen\b|\bbane\b|jernbane|intercity|stasjon|metro|trasé|t-bane"


def road_modes(name):
    """Road, rail, or both: a motorway and the metro line that crosses it are two works."""
    t = (name or '').lower()
    rail = re.search(RAIL, t) is not None
    road = bool(re.search(r"(?<!felt )\b(?:e|rv|fv)\.?\s?\d|ve[gi]|kryss|\bbru\b|tunnel|sykkel|gang-", t)) or not rail
    return {m for m, on in (('road', road), ('rail', rail)) if on}


def typology(d, kind):
    """The class of human intervention (after Szabó 2010) the evidence points to, and the form."""
    moved = d['dep'] + d['exc']
    form = 'acc' if d['dep'] >= 0.8 * moved else 'exc' if d['exc'] >= 0.8 * moved else 'cf'
    if d.get('ls'):
        return 'slide', form
    if kind == 'forest' and d.get('planned', 0) < 0.5:        # under a reguleringsplan it is read like any other
        return 'forest', form
    ftype = (d.get('fac') or {}).get('type', '').lower()
    text = ' '.join(x.get('name', '') for x in (d.get('fac') or {}, d.get('proj') or {}, d.get('plan') or {})).lower()
    cover = d.get('cover', '')
    has = lambda rx: re.search(rx, text) is not None
    if d.get('proj') and not d.get('fac'):
        return 'traffic' if has(TRAFFIC) else 'urban', form
    # Names first: the facility type, then what the project and the reguleringsplan are called.
    if re.search(MINING_TYPES, ftype) or (has(MINING) and not (has(SPOIL) and d['dep'] > 1.5 * d['exc'])):
        return 'mining', form
    if re.search(SPOIL_TYPES, ftype) or has(SPOIL):
        return 'spoil', form
    for key, rx in (('sport', SPORT), ('traffic', TRAFFIC), ('water', WATER), ('agro', FARM), ('industry', INDUSTRY), ('urban', URBAN)):
        if has(rx):
            return key, form
    # Then the land cover on the map, which is weaker: it may predate the change.
    by_cover = {'Steinbrudd': 'mining', 'Golfbane': 'sport', 'Alpinbakke': 'sport', 'SportIdrettPlass': 'sport',
                'Industriområde': 'industry', 'Tettbebyggelse': 'urban', 'BymessigBebyggelse': 'urban',
                'Lufthavn': 'traffic', 'DyrketMark': 'agro'}
    if cover in by_cover:
        return by_cover[cover], form
    if cover == 'Skog' and not d.get('plan'):
        return 'forest', form
    return 'other', form


def sites_of(run, slug, entry, fac, proj, min_m3, top):
    gj = json.load(open(os.path.join(HERE, 'data', f'dod_{slug}.geojson'), encoding='utf-8'))
    props = [f['properties'] for f in gj['features']]
    g = gpd.read_file(os.path.join(run, 'poligonos.gpkg'), layer='poligonos_cambio')
    if len(g) != len(props):
        sys.exit(f'{slug}: {len(g)} polygons in the run, {len(props)} click targets; rebuild the map layer first')
    for i in (0, len(g) // 2, len(g) - 1):
        if abs(props[i]['a'] - g.area_m2.iloc[i]) > 1 or abs(props[i]['v'] - g.volume_m3.iloc[i]) > 1:
            sys.exit(f'{slug}: row {i} does not match its click target')
    cover = None
    lc = os.path.join(run, 'landcover.csv')
    if os.path.exists(lc):
        c = [r['cover'] for r in csv.DictReader(open(lc, encoding='utf-8'))]
        cover = c if len(c) == len(g) else None
    for k in ('pl', 'pn', 'pd', 'ls', 'sl', 'sh', 'fo'):
        g[k] = [p.get(k) for p in props]
    g['cover'] = cover if cover else ''
    flag = lambda k: g[k].fillna(0).astype(bool)
    checked = bool(entry.get('plan'))
    plc = places(g.total_bounds + (-PLACE_M, -PLACE_M, PLACE_M, PLACE_M))
    res = []
    g['c'] = -1
    kom_word = entry['kommune'].lower()
    n = len(g)
    geoms = np.array(g.geometry.values)
    vol = g.volume_m3.values.astype(float)
    area_all = g.area_m2.values.astype(float)
    pl_i = g.pl.fillna(0).astype(int).values
    key = [(pn if isinstance(pn, str) and p else '') for pn, p in zip(g.pn, pl_i)]
    cls = [plan_class(k) if k else '' for k in key]
    road = np.array([c == 'traffic' for c in cls])
    slide = flag('ls').values
    fo, weak = flag('fo').values, (flag('sl') | flag('sh')).values
    flagged = fo | weak
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i

    def join(a, b):
        a, b = find(a), find(b)
        if a != b:
            parent[b] = a

    tree = STRtree(geoms)
    def pairs(d):
        a, b = tree.query(geoms, predicate='dwithin', distance=d)
        m = a < b
        return a[m], b[m]
    near_a, near_b = pairs(JOIN_M)
    far_a, far_b = pairs(SAME_PLAN_M)

    # 1. A road or a railway is one work, kept as whole as it can be: every polygon
    # under its reguleringsplan, flagged or not, however far apart; the plans of its
    # sections are joined when they lie within 50 m of each other and are of the same
    # mode (road with road, rail with rail), or carry the same road number or line name.
    rplans = sorted({k for k, r in zip(key, road) if r})
    rp = {k: k for k in rplans}
    modes = {k: road_modes(k) for k in rplans}
    def rfind(k):
        while rp[k] != k:
            rp[k] = rp[rp[k]]; k = rp[k]
        return k
    for a, b in zip(near_a, near_b):
        if road[a] and road[b] and key[a] != key[b] and modes[key[a]] & modes[key[b]]:
            rp[rfind(key[b])] = rfind(key[a])
    marks = {k: road_marks(k) for k in rplans}
    for i, ka in enumerate(rplans):
        for kb in rplans[i + 1:]:
            if marks[ka] & marks[kb]:
                rp[rfind(kb)] = rfind(ka)
    first = {}
    for i in range(n):
        if road[i]:
            join(first.setdefault(rfind(key[i]), i), i)

    # 2. A landslide: the scar and the mass it laid down are one cluster, with the rest
    # of the change under the reguleringsplan drawn up for the slide ground (rule 3).
    sl_i = [i for i in range(n) if slide[i]]
    for i in sl_i[1:]:
        join(sl_i[0], i)

    # 3. Everything else. Nearness is the base and the reguleringsplan is the context:
    # the polygons of one reguleringsplan within 250 m of each other are one cluster
    # (a plan that zones half a kommune is not one work); neighbouring plans named alike
    # are joined at 50 m; ground under no reguleringsplan has nearness alone, 50 m, and
    # is never joined to planned ground.
    free = ~road
    solid = free & ~flagged
    def link(sel):
        for a, b in zip(far_a, far_b):
            if sel[a] and sel[b] and key[a] and key[a] == key[b]:
                join(a, b)
        for a, b in zip(near_a, near_b):
            if sel[a] and sel[b] and key[a] != key[b] and key[a] and key[b] and same_work(key[a], key[b], kom_word):
                join(a, b)
            elif sel[a] and sel[b] and not key[a] and not key[b]:
                join(a, b)
    link(solid)
    # A small flagged polygon (under forest, steep, shallow) belongs to the cluster it
    # lies in: the nearest unflagged polygon within 50 m with the same context. It never
    # ties two clusters together. What is left is grouped among its own kind.
    best = {}
    for a, b in zip(near_a, near_b):
        for i, j in ((a, b), (b, a)):
            if free[i] and flagged[i] and solid[j] and (key[i] == key[j] or (key[i] and key[j] and same_work(key[i], key[j], kom_word))):
                dist = geoms[i].distance(geoms[j])
                if i not in best or dist < best[i][0]:
                    best[i] = (dist, j)
    for i, (_, j) in best.items():
        join(j, i)
    loose = free & flagged & ~np.isin(np.arange(n), list(best))
    link(loose & fo)
    link(loose & ~fo)

    # 4. A construction project of the database gathers its own: road and rail clusters
    # with half or more of their changed area within 150 m of the same project line are
    # one cluster (the stretches of a line regulated under other names). Other plans
    # beside the line are not taken in: a police centre by a railway is not the railway.
    if proj is not None:
        groups = {}
        for i in range(n):
            groups.setdefault(find(i), []).append(i)
        head = {}
        for r, idx in groups.items():
            idx = np.array(idx)
            if not road[idx].all() or np.abs(vol[idx]).sum() < FOREST_MIN_M3:
                continue
            a_tot = area_all[idx].sum()
            best_p = None
            for _, pr in proj.iterrows():
                d_ = shapely.distance(geoms[idx], pr.geometry)
                share = float(area_all[idx][d_ <= NEAR_PROJ_M].sum()) / a_tot if a_tot else 0
                if share >= PROJ_SHARE and (best_p is None or share > best_p[0]):
                    best_p = (share, pr.puid or pr.pname)
            if best_p:
                join(head.setdefault(best_p[1], idx[0]), idx[0])

    roots = [find(i) for i in range(n)]
    order = {r: c for c, r in enumerate(sorted(set(roots)))}
    g['c'] = [order[r] for r in roots]
    g['key'] = key
    members = {}
    for i, c in enumerate(g.c.values):
        members.setdefault(int(c), []).append(i)
    # Which planned work each polygon touches, for the rows that have no reguleringsplan.
    touch = {}
    for a, b in zip(near_a, near_b):
        for i, j in ((a, b), (b, a)):
            if not key[i] and key[j]:
                t = touch.setdefault(int(g.c.values[i]), {})
                t[key[j]] = t.get(key[j], 0) + abs(vol[j])

    cand = []
    for c, idx in members.items():
        idx = np.array(idx)
        kind = 'site' if (~flagged[idx]).any() else 'forest' if fo[idx].all() else 'flag'
        dep = float(vol[idx][vol[idx] > 0].sum()); exc = float(-vol[idx][vol[idx] < 0].sum())
        cand.append((kind, dep + exc, c, idx, dep, exc))
    for kind, n_top, least, always in (('site', top, min_m3, ALWAYS_M3), ('forest', FOREST_TOP, FOREST_MIN_M3, float('inf'))):
        out = sorted((t for t in cand if t[0] == kind), key=lambda t: -t[1])
        for _, moved, c, idx, dep, exc in [t for k, t in enumerate(out) if t[1] >= always or (k < n_top and t[1] >= least)]:
            s = g.iloc[idx]
            big = s.loc[s.volume_m3.abs().idxmax()]
            whole = GeometryCollection(list(s.geometry.values))
            ll = gpd.GeoSeries([big.geometry.representative_point(), whole.envelope.buffer(JOIN_M)], crs=g.crs).to_crs(4326)
            b = ll.iloc[1].bounds
            area = float(s.area_m2.sum())
            d = {'k': kind, 'run': slug, 'kommune': entry['kommune'], 'years': entry['years'],
                 'lat': round(ll.iloc[0].y, 5), 'lon': round(ll.iloc[0].x, 5),
                 'bounds': [round(b[0] - 0.001, 5), round(b[1] - 0.0005, 5), round(b[2] + 0.001, 5), round(b[3] + 0.0005, 5)],
                 'c': int(c),
                 'n': int(len(s)), 'ha': round(area / 1e4, 2), 'dep': round(dep), 'exc': round(exc), 'cover': big.cover or ''}
            if s.ls.fillna(0).astype(bool).any():
                d['ls'] = 1
            if road[idx].any():
                d['road'] = 1
            if fac is not None and kind == 'site':
                # A facility names a cluster only when the cluster is about it: it lies
                # within 150 m of the change, and half or more of the changed area lies
                # within FAC_REACH_M of it. A road many kilometres long passes facilities
                # without being one.
                near = fac[fac.distance(whole) <= NEAR_FAC_M]
                best_f = None
                for _, f in near.iterrows():
                    share = float(s.area_m2[s.geometry.distance(f.geometry) <= FAC_REACH_M].sum()) / area if area else 0
                    if share >= 0.5 and (best_f is None or share > best_f[0]):
                        best_f = (share, f)
                if best_f:
                    f = best_f[1]
                    d['fac'] = {'uid': f.uid, 'name': f['name'], 'type': f['type']}
            if proj is not None and kind == 'site':
                # A project is named only when most of the cluster's change lies along it.
                best_p = None
                for _, pr in proj.iterrows():
                    share = float(s.area_m2[s.geometry.distance(pr.geometry) <= NEAR_PROJ_M].sum()) / area if area else 0
                    if share >= PROJ_SHARE and (best_p is None or share > best_p[0]):
                        best_p = (share, pr)
                if best_p:
                    d['proj'] = {'uid': best_p[1].puid, 'name': best_p[1].pname, 'share': round(best_p[0], 2)}
            if checked:
                w = s[s.pl.fillna(0).astype(int) > 0]
                d['planned'] = round(float(w.area_m2.sum()) / area, 2) if area else 0
                if len(w):
                    name = w.groupby('pn').area_m2.sum().idxmax()
                    ww = w[w.pn == name]
                    when = ww.pd.iloc[0]
                    d['plan'] = {'name': name, 'pl': int(ww.pl.astype(int).min()), 'date': when if isinstance(when, str) else '',
                                 'share': round(float(ww.area_m2.sum()) / area, 2)}
                    if w.pn.nunique() > 1:
                        d['plans'] = int(w.pn.nunique())
                elif touch.get(int(c)):
                    # No reguleringsplan: name the planned work it lies beside, if any.
                    d['beside'] = max(touch[int(c)].items(), key=lambda kv: kv[1])[0]
            if plc is not None and len(plc):
                dist = plc.distance(big.geometry.representative_point())
                if dist.min() <= PLACE_M:
                    by = np.argsort(dist.values)[:8]
                    d['place'] = plc.pl_name.iloc[by[0]]
                    d['_names'] = [plc.pl_name.iloc[k] for k in by if dist.values[k] <= PLACE_M]
            d['ty'], d['fm'] = typology(d, kind)
            res.append(d)
    # Every click target carries its group, so the map can select a cluster from a click.
    for p, c in zip(props, g.c):
        p['c'] = int(c)
    path = os.path.join(HERE, 'data', f'dod_{slug}.geojson')
    json.dump(gj, open(path + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    os.replace(path + '.tmp', path)
    return res


if __name__ == '__main__':
    if '--root' not in sys.argv:
        sys.exit(__doc__)
    root = sys.argv[sys.argv.index('--root') + 1]
    min_m3, top = opt('--min-m3', float, 20_000), opt('--top', int, 6)
    N50 = os.path.join(os.path.dirname(os.path.abspath(root)), 'n50', 'Basisdata_30_Viken_25832_N50Kartdata_FGDB.gdb')
    html = open(os.path.join(HERE, 'index.html'), encoding='utf-8').read()
    only = set(opt('--only', str, '').split(',')) - {''}      # a trial on some runs: written beside, not over, the table
    fac, proj = facilities(), projects()
    print(f'  facilities {0 if fac is None else len(fac)}, project geometries {0 if proj is None else len(proj)}')
    sites = []
    for dp, dn, fn in sorted(os.walk(root)):
        if '_validation' in dp or 'before_coregistration' in dp or not {'run_params.json', 'poligonos.gpkg'} <= set(fn):
            continue
        p = json.load(open(os.path.join(dp, 'run_params.json'), encoding='utf-8'))
        kom = {'Skipvet': 'Skiptvet'}.get(p['kommune'], p['kommune'])
        m = re.search(r"\{ id: '([a-z_]+_\d{4}_\d{4})', kommune: '" + re.escape(kom) + r"', years: '([^']+)',(.*?)src:", html, re.S)
        if not m or not os.path.exists(os.path.join(HERE, 'data', f'dod_{m.group(1)}.geojson')):
            continue
        if only and m.group(1) not in only:
            continue
        entry = {'kommune': kom, 'years': m.group(2), 'plan': 'plan: true' in m.group(3)}
        s = sites_of(dp, m.group(1), entry, fac, proj, min_m3, top)
        print(f"  {m.group(1)}: {sum(d['k'] == 'site' for d in s)} clusters, {sum(d['k'] == 'forest' for d in s)} under forest"
              + ('' if entry['plan'] else '   (no plan check)'), flush=True)
        sites += s
    # What is published is approximate: two significant figures.
    two = lambda v: 0 if not v else int(round(v, 2 - len(str(int(abs(v))))))
    for d in sites:
        d['dep'], d['exc'] = two(d['dep']), two(d['exc'])
        d['ha'] = round(d['ha']) if d['ha'] >= 10 else round(d['ha'], 1)
    sites.sort(key=lambda d: -(d['dep'] + d['exc']))
    # A row is found by its name: within a kommune no two rows carry the same one. The
    # larger row keeps the nearest place name, the next takes the nearest name still free.
    taken = set()
    for d in sites:
        names = d.pop('_names', None) or ([d['place']] if d.get('place') else [])
        free = [x for x in names if (d['kommune'], x) not in taken]
        if names:
            d['place'] = free[0] if free else names[0]
            k = 2
            while (d['kommune'], d['place']) in taken:
                d['place'] = f"{names[0]} {k}"; k += 1
            taken.add((d['kommune'], d['place']))
    for n, d in enumerate(sites, 1):
        d['id'] = f"T{n:03d}"
    if '--list' in sys.argv:
        for d in sites:
            what = (d.get('fac') or d.get('proj') or d.get('plan') or {}).get('name') or d['cover']
            print(f"  {d['id']} {d['kommune']:<13} +{d['dep']:>9,} -{d['exc']:>9,} {d['ha']:>6.1f} ha  {d['ty']:<8}{d['fm']:<4} {d.get('place', ''):<22} {what[:60]}")
    out = os.path.join(HERE, 'data', 'dod_sites_trial.json' if only else 'dod_sites.json')
    json.dump({'join_m': JOIN_M, 'min_m3': min_m3, 'top': top, 'always_m3': ALWAYS_M3, 'sites': sites},
              open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    print(f'  {len(sites)} clusters, {os.path.getsize(out) // 1024} KB -> data/dod_sites.json')
