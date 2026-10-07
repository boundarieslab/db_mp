#!/usr/bin/env python3
"""Write the plan finding into a DoD run's click targets.

    python tools/make_plan_flags.py <slug> <plans.geojson> <first_year> <last_year>
                                    [--slide TEXT] [--out FILE] [--in FILE]

<plans.geojson> holds the reguleringsplan outlines (RpOmråde) fetched from the DiBK
NAP WMS with GetFeatureInfo, in EPSG:25832, one feature per plan.

Each change polygon in data/dod_<slug>.geojson gets

    pl   0  no plan on record
         1  plan in force during the DoD window (in force by 31 Dec <last_year>)
         2  plan that came into force after the window
         3  plan with no date
    pn   the plan's name          (pl > 0)
    pd   its in-force date        (pl 1 or 2)
    ls   1 for a landslide, when --slide is given: a polygon of 5 ha or more lying
         in a plan whose name contains TEXT

A polygon counts as covered when at least 15 % of its area lies inside plan
outlines. That is the area version of the rule used for the first Gjerdrum check,
where one of up to seven sample points inside a plan was enough. A plan in force
during the window wins over a later one, because the question is whether the
change had a plan when it happened.

Only plans in force (planstatus 3) are used. A plan since replaced is not in the
service, so "no plan on record" is an upper bound.
"""
import json, os, sys
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform as shp_transform, unary_union
from shapely.strtree import STRtree
from shapely.validation import make_valid

MIN_FRAC = 0.15
SLIDE_MIN_M2 = 50_000


def main():
    args = sys.argv[1:]
    def opt(name):
        if name in args:
            i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
    slide, out, src = opt('--slide'), opt('--out'), opt('--in')
    if len(args) != 4:
        sys.exit(__doc__)
    slug, plans_path, y0, y1 = args[0], args[1], int(args[2]), int(args[3])
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = src or os.path.join(here, 'data', f'dod_{slug}.geojson')
    out = out or path
    gj = json.load(open(path, encoding='utf-8'))
    pj = json.load(open(plans_path, encoding='utf-8'))

    plans = []
    for f in pj['features']:
        p = f['properties']
        if str(p.get('planstatus')) != '3':
            continue
        g = make_valid(shape(f['geometry']))
        if g.is_empty:
            continue
        date = (p.get('ikrafttredelsesdato') or '').rstrip('Z')[:10]
        plans.append((g, p.get('plannavn') or '', date))
    tree = STRtree([g for g, _, _ in plans])
    to32 = Transformer.from_crs('EPSG:4326', 'EPSG:25832', always_xy=True).transform
    end = f'{y1}-12-31'

    tot = {k: [0, 0.0, 0.0] for k in (1, 2, 3, 0, 'ls')}
    for f in gj['features']:
        pr = f['properties']
        for k in ('pl', 'pn', 'pd', 'ls', 'np'):
            pr.pop(k, None)
        g = make_valid(shp_transform(to32, shape(f['geometry'])))
        hits = []
        for i in tree.query(g):
            a = g.intersection(plans[i][0]).area
            if a > 0:
                hits.append((a, i))
        frac = lambda idx: (g.intersection(unary_union([plans[i][0] for i in idx])).area / g.area) if idx else 0.0
        during = [i for a, i in hits if plans[i][2] and plans[i][2] <= end]
        pl, pick = 0, None
        if frac([i for _, i in hits]) >= MIN_FRAC:
            if frac(during) >= MIN_FRAC:
                pl = 1
                pick = max((a, i) for a, i in hits if i in during)[1]
            else:
                pick = max(hits)[1]
                pl = 2 if plans[pick][2] else 3
        pr['pl'] = pl
        if pl:
            pr['pn'] = plans[pick][1]
            if plans[pick][2]:
                pr['pd'] = plans[pick][2]
        if slide and g.area >= SLIDE_MIN_M2 and any(slide.lower() in plans[i][1].lower() for _, i in hits):
            pr['ls'] = 1
        k = 'ls' if pr.get('ls') else pl
        tot[k][0] += 1; tot[k][1] += pr['a']; tot[k][2] += pr['v']

    open(out, 'w', encoding='utf-8').write(json.dumps(gj, separators=(',', ':'), ensure_ascii=False))
    names = {1: f'plan in force during {y0}-{y1}', 2: f'plan in force only after {y1}', 3: 'plan of unknown date',
             0: 'no plan on record', 'ls': 'landslide (set aside)'}
    n = sum(v[0] for k, v in tot.items() if k != 'ls'); a = sum(v[1] for k, v in tot.items() if k != 'ls')
    print(f'  {len(plans)} plans in force used, {len(gj["features"])} polygons')
    for k in (1, 2, 3, 0, 'ls'):
        c, ar, vol = tot[k]
        share = f'{100 * c / n:5.1f} % of polygons, {100 * ar / a:5.1f} % of area' if k != 'ls' and n else ''
        print(f'  {names[k]:34s} {c:5d}  {ar / 1e4:7.1f} ha  {vol:+12,.0f} m3   {share}')
    return tot


if __name__ == '__main__':
    main()
