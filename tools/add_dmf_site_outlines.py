#!/usr/bin/env python3
"""Add the outlines of the sites taken from the DMF register on 2026-11-19 to
data/facility_polygons_method2026.geojson.

    python tools/add_dmf_site_outlines.py <folder> <facilities.csv>

<folder> holds what was read for each site:
  plans/<UID>.json    reguleringsplan raw-material fields (NAP plan service,
                      GetFeatureInfo; pbl2008 arealformaal 1200-1202, pbl1985
                      reguleringsformaal 670-679), with plan name, date and link
  licences.geojson    DMF operating licence areas (open register, Konsesjon)
  parts4/<UID>.json   bare ground traced automatically on Esri World Imagery
<facilities.csv> is the Facilities tab: a site's outlines publish only when its
row has Published TRUE.

Raw-material fields and licences are tagged use = "extraction". For those the
map's "allowed" edge is where both the plan and the licence allow extraction
(see make_published_polygons.py). The automatic trace goes in as "worked" with
publish 0 and conf "auto" until it has been checked by eye.
Run again and it replaces what it added before (same src text); nothing else
in the file is touched.
"""
import csv, json, os, sys, collections
from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union
import pyproj
HERE = os.path.dirname(os.path.abspath(__file__))
METHOD = os.path.join(HERE, "..", "data", "facility_polygons_method2026.geojson")
TO_M = pyproj.Transformer.from_crs(4326, 25832, always_xy=True).transform
TO_DEG = pyproj.Transformer.from_crs(25832, 4326, always_xy=True).transform
READ = "2026-11-19"
TAG = "_dmf20261119"


def rnd(c):
    return [round(c[0], 7), round(c[1], 7)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]


def clean(g, tol=0.5):
    """Valid, simplified to tol metres, as a MultiPolygon in degrees; also the area in m2."""
    m = transform(TO_M, g).buffer(0).simplify(tol).buffer(0)
    parts = [p for p in (m.geoms if hasattr(m, "geoms") else [m]) if p.geom_type == "Polygon" and p.area > 1]
    if not parts:
        return None, 0
    u = unary_union(parts)
    d = mapping(transform(TO_DEG, u))
    if d["type"] == "Polygon":
        d = {"type": "MultiPolygon", "coordinates": [d["coordinates"]]}
    d["coordinates"] = rnd(d["coordinates"])
    return d, int(round(u.area))


def kb(s):
    return s.replace(" ", "-")


def main(folder, csvpath):
    rows = list(csv.reader(open(csvpath, encoding="utf-8")))
    h = rows[0]; iu, ip = h.index("UID"), h.index("Published")
    pub = {r[iu]: r[ip].strip().upper() == "TRUE" for r in rows[1:] if r}
    sites = json.load(open(os.path.join(folder, "sites.json"), encoding="utf-8"))
    names = {s["UID"]: s["Name"] for s in sites}
    lic = collections.defaultdict(list)
    for f in json.load(open(os.path.join(folder, "licences.geojson"), encoding="utf-8"))["features"]:
        lic[f["properties"]["uid"]].append(f)
    fields = {}; owners = collections.defaultdict(set)
    for uid in names:
        p = os.path.join(folder, "plans", uid + ".json")
        fields[uid] = json.load(open(p, encoding="utf-8"))["fields"] if os.path.exists(p) else []
        for f in fields[uid]:
            owners[f["properties"]["objid"]].add(uid)
    new = []
    for uid in sorted(names):
        on = 1 if pub.get(uid) else 0; n = names[uid]
        for f in fields[uid]:
            q = f["properties"]
            g, a = clean(shape(f["geometry"]))
            if g is None:
                continue
            code = q["code"]
            what = ("arealformaal %s" % code) if q["layer"] == "pbl2008" else ("reguleringsformaal %s" % code)
            plan = "%s [%s/%s]" % ((q.get("plannavn") or "plan").strip(), q.get("kommune"), q.get("planid"))
            when = (", in force %s" % q["ikraft"]) if q.get("ikraft") else ""
            pp = {"uid": uid, "pid": "%s_permitted_%s" % (uid, q["objid"]), "n": n,
                  "src": "NAP reguleringsplan raw-material field (GetFeatureInfo), %s" % READ, "a": a, "firm": 0,
                  "pcls": "permitted", "note": "field %s (%s) in %s%s" % (q.get("felt") or "-", what, plan, when),
                  "shared": ",".join(sorted(owners[q["objid"]] - {uid})), "stage": q.get("felt") or "",
                  "conf": "verified", "publish": on, "use": "extraction"}
            if q.get("link"):
                pp["links"] = q["link"]
            new.append({"type": "Feature", "properties": pp, "geometry": g})
        for i, f in enumerate(lic.get(uid, [])):
            q = f["properties"]
            g, a = clean(shape(f["geometry"]))
            if g is None:
                continue
            new.append({"type": "Feature", "geometry": g, "properties": {
                "uid": uid, "pid": "%s_licence%s" % (uid, "" if i == 0 else "_%d" % (i + 1)), "n": n,
                "src": "DMF open register (Konsesjon), %s" % READ, "a": a, "firm": 0, "pcls": "licence",
                "note": "driftskonsesjon %s (uttak %s), holder %s" % (kb(q["kb"]), q.get("uttak"), q.get("holder")),
                "shared": "", "stage": "", "conf": "verified", "publish": on, "use": "extraction"}})
        p = os.path.join(folder, "parts4", uid + ".json")
        if os.path.exists(p):
            r = json.load(open(p))[0]
            if r.get("geom"):
                g, a = clean(shape(r["geom"]), 1.0)
                if g is not None:
                    new.append({"type": "Feature", "geometry": g, "properties": {
                        "uid": uid, "pid": uid + "_worked" + TAG, "n": n,
                        "src": "bare ground traced automatically on Esri World Imagery, %s" % READ, "a": a, "firm": 0,
                        "pcls": "worked", "note": "automatic trace, not yet checked by eye", "shared": "", "stage": "",
                        "conf": "auto", "publish": 0}})
    M = json.load(open(METHOD, encoding="utf-8"))
    mine = {f["properties"]["src"] for f in new}
    keep = [f for f in M["features"] if not (f["properties"]["uid"] in names and f["properties"]["src"] in mine)]
    clash = {f["properties"]["pid"] for f in keep} & {f["properties"]["pid"] for f in new}
    if clash:
        sys.exit("pid already used: %s" % sorted(clash)[:5])
    M["features"] = keep + new
    open(METHOD, "w", encoding="utf-8").write(json.dumps(M, ensure_ascii=False))
    c = collections.Counter((f["properties"]["pcls"], f["properties"]["publish"]) for f in new)
    print(len(keep), "kept,", len(new), "added", dict(c), len({f["properties"]["uid"] for f in new}), "sites")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
