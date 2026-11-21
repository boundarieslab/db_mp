#!/usr/bin/env python3
"""Write data/facility_polygons.geojson, the outlines the map reads, from
data/facility_polygons_method2026.geojson, the working file of the 2026 method.

    python tools/make_published_polygons.py

Only rows marked publish = 1 go out. Worked ground becomes the footprint
(pcls "observed", firm 1); permitted, licence, register, plan, property and
expansion are carried with their areas (firm 0), for the record window.

The map draws two outlines per site, made here and carrying no area:
  allowed   the outer edge of everything permitted or licensed (reguleringsplan
            fields and mining licence joined, nothing drawn inside it). Where
            fields and licences are tagged use = "extraction", extraction needs
            both, so that part of the edge is where the plan's raw-material
            fields and the DMF licence overlap (rule agreed 2026-11-19); where a
            site has only one of the two, that one is used
            Fields given an "edge" name (plans that followed one another, e.g.
            Huken's quarry plans of 1962 and 1973) get one edge each, so the
            line between them stays; a "lab" / "lab_no" on them (how the legal
            area is labelled) is carried to the allowed outline
  planned   the outer edge of the planned expansion
"Worked outside permitted" is never published. Needs shapely and pyproj.
"""
import json, os, collections
from shapely.geometry import shape, mapping, Polygon, MultiPolygon
from shapely.ops import unary_union, transform
import pyproj
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "data", "facility_polygons_method2026.geojson")
DST = os.path.join(HERE, "..", "data", "facility_polygons.geojson")
KEEP = {"worked": "observed", "permitted": "permitted", "licence": "licence", "register": "register",
        "plan": "plan", "property": "property", "expansion": "expansion"}
TO_M = pyproj.Transformer.from_crs(4326, 25832, always_xy=True).transform
TO_DEG = pyproj.Transformer.from_crs(25832, 4326, always_xy=True).transform
CLOSE_M = 3.0      # fields that touch or lie this close are one area
MIN_M2 = 300.0     # a detached scrap smaller than this is not an outline

def rnd(c):
    return [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]

def polys(g):
    return [p for p in (g.geoms if hasattr(g, "geoms") else [g]) if p.geom_type == "Polygon" and not p.is_empty]

def outer(geoms):
    """One outline round a set of shapes: joined, gaps closed, nothing inside."""
    u = unary_union([transform(TO_M, g).buffer(0) for g in geoms])
    u = u.buffer(CLOSE_M, join_style=2).buffer(-CLOSE_M, join_style=2)
    u = unary_union([Polygon(p.exterior) for p in polys(u)])   # a part inside another's hole goes here
    parts = [Polygon(p.exterior).simplify(0.5) for p in polys(u) if p.area >= MIN_M2]
    return transform(TO_DEG, MultiPolygon(parts)) if parts else None

def both(a, b):
    """Where both sets of shapes lie, in degrees; None if they do not overlap."""
    i = unary_union([transform(TO_M, g).buffer(0) for g in a]).intersection(unary_union([transform(TO_M, g).buffer(0) for g in b]))
    i = unary_union([p for p in polys(i) if p.area >= MIN_M2]) if not i.is_empty else i
    return None if i.is_empty else transform(TO_DEG, i)

def allowed(uid, d):
    xp, xl = d.get("permitted_x", []), d.get("licence_x", [])
    core = xp + xl
    if xp and xl:
        g = both(xp, xl)
        if g is None:
            print("note:", uid, "plan fields and licence do not overlap; both kept")
        else:
            core = [g]
    return core + d.get("permitted", []) + d.get("licence", [])

def main():
    fs = json.load(open(SRC, encoding="utf-8"))["features"]
    out = []; by = collections.defaultdict(lambda: collections.defaultdict(list)); names = {}
    edges = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(list)))
    labs = collections.defaultdict(dict)
    for f in fs:
        p = f["properties"]
        if p.get("publish") != 1 or p["pcls"] not in KEEP:
            continue
        q = {"uid": p["uid"], "pid": p["pid"], "n": p["n"], "src": p["src"], "a": p["a"],
             "firm": 1 if p["pcls"] == "worked" else 0, "pcls": KEEP[p["pcls"]], "note": p.get("note", "")}
        if p.get("shared"): q["shared"] = p["shared"]
        for k in ("lab", "lab_no"):
            if p.get(k): q[k] = p[k]; labs[p["uid"]][k] = p[k]
        out.append({"type": "Feature", "properties": q, "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}})
        key = p["pcls"] + ("_x" if p.get("use") == "extraction" and p["pcls"] in ("permitted", "licence") else "")
        by[p["uid"]][key].append(shape(f["geometry"])); names[p["uid"]] = p["n"]
        if p.get("edge") and p["pcls"] in ("permitted", "licence"):
            edges[p["uid"]][p["edge"]][key].append(shape(f["geometry"]))
    for uid, d in by.items():
        for cls, src in (("allowed", allowed(uid, d)), ("planned", d.get("expansion", []))):
            if cls == "allowed" and uid in edges:
                # plans that followed one another keep the line between them:
                # one outer edge per plan ("edge"), drawn side by side
                parts = [outer(allowed(uid, e)) for e in edges[uid].values()]
                parts = [q for g in parts if g is not None for q in polys(g)]
                g = MultiPolygon(parts) if parts else None
            else:
                g = outer(src) if src else None
            if g is None: continue
            pr = {"uid": uid, "pid": uid + "_" + cls, "n": names[uid], "firm": 0, "pcls": cls}
            if cls == "allowed": pr.update(labs.get(uid, {}))
            out.append({"type": "Feature", "properties": pr,
                        "geometry": {"type": "MultiPolygon", "coordinates": rnd(mapping(g)["coordinates"])}})
    out.sort(key=lambda f: (f["properties"]["uid"], f["properties"]["pid"]))
    json.dump({"type": "FeatureCollection", "features": out}, open(DST, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    c = collections.Counter(f["properties"]["pcls"] for f in out)
    print(len(out), "features,", len({f["properties"]["uid"] for f in out}), "sites,", dict(c), os.path.getsize(DST), "bytes")

if __name__ == "__main__":
    main()
