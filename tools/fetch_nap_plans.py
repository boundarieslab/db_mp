#!/usr/bin/env python3
"""Fetch the reguleringsplan outlines that touch a DoD run, from the DiBK NAP WMS.

    python tools/fetch_nap_plans.py <run_dir> <out.geojson>

<run_dir> holds poligonos.gpkg (EPSG:25832). One GetFeatureInfo is sent at a
point inside every change polygon, and for polygons of 500 m2 or more also at
their four outermost vertices, so a plan that only clips a polygon is found too.
The answer carries the plan outline (RpOmråde) with its name, id, status and
in-force date. One feature per plan is kept and written as GeoJSON in EPSG:25832,
ready for make_plan_flags.py.

The service is public and answers a point query without an account; the bulk
dataset is not open. Lillestrøm and Oslo deliver nothing to it.
Needs a machine that can reach nap.ft.dibk.no. Standard library plus shapely.
"""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_dod_tiles import read_gpkg, gpkg_epsg          # noqa: E402

WMS = 'https://nap.ft.dibk.no/services/wms/reguleringsplaner/'
LAYERS = 'rpomrade_vn3,rpomrade_vn2,rpomrade_vn1'
BIG_M2 = 500


def ask(pt):
    x, y = pt
    b = 10
    url = (f'{WMS}?service=WMS&version=1.3.0&request=GetFeatureInfo&layers={LAYERS}&query_layers={LAYERS}'
           f'&styles=&crs=EPSG:25832&bbox={x - b:f},{y - b:f},{x + b:f},{y + b:f}&width=101&height=101'
           '&format=image/png&i=50&j=50&feature_count=25&info_format=application/json')
    err = ''
    for _ in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            return json.loads(urllib.request.urlopen(req, timeout=30).read()).get('features', [])
        except Exception as e:          # noqa: BLE001
            err = str(e)
            time.sleep(1.5)
    return ('ERR', err)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    run, out = sys.argv[1], sys.argv[2]
    gpkg = os.path.join(run, 'poligonos.gpkg')
    if gpkg_epsg(gpkg) != 25832:
        sys.exit('poligonos.gpkg is not in EPSG:25832')
    pts = []
    for g, _ in read_gpkg(gpkg):
        p = g.representative_point()
        pts.append((p.x, p.y))
        if g.area >= BIG_M2:
            ring = [c for poly in getattr(g, 'geoms', [g]) for c in poly.exterior.coords]
            for key in (lambda c: c[0], lambda c: -c[0], lambda c: c[1], lambda c: -c[1]):
                pts.append(min(ring, key=key)[:2])
    print(f'  {len(pts)} points to ask', flush=True)
    plans, errs = {}, 0
    with ThreadPoolExecutor(6) as ex:
        for n, res in enumerate(ex.map(ask, pts), 1):
            if isinstance(res, tuple):
                errs += 1
                continue
            for f in res:
                p = f['properties']
                key = f"{p.get('identifikasjon.lokalId') or p.get('objid')}|{p.get('vertikalnivå')}"
                plans.setdefault(key, f)
            if n % 1000 == 0:
                print(f'  {n}/{len(pts)}  plans {len(plans)}  errors {errs}', flush=True)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    json.dump({'type': 'FeatureCollection',
               'crs': {'type': 'name', 'properties': {'name': 'urn:ogc:def:crs:EPSG::25832'}},
               'source': f'DiBK NAP WMS GetFeatureInfo, {LAYERS}', 'fetched': time.strftime('%Y-%m-%d %H:%M'),
               'points': len(pts), 'errors': errs, 'features': list(plans.values())},
              open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'  {len(plans)} plans, {errs} failed requests -> {out}')
    if errs > len(pts) * 0.02:
        sys.exit('more than 2 % of the requests failed; run it again before using the result')
