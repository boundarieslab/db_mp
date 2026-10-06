#!/usr/bin/env python3
"""Write data/facility_polygons.geojson, the outlines the map draws, from
data/facility_polygons_method2026.geojson, the working file of the 2026 method.

    python tools/make_published_polygons.py

Only rows marked publish = 1 go out. Worked ground becomes the footprint
(pcls "observed", firm 1); permitted, licence, register, plan, property and
expansion are carried as outlines (firm 0). Reserve is implied by permitted and
worked and is not drawn. "Worked outside permitted" is never published.
Standard library only.
"""
import json, os, collections
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "data", "facility_polygons_method2026.geojson")
DST = os.path.join(HERE, "..", "data", "facility_polygons.geojson")
KEEP = {"worked": "observed", "permitted": "permitted", "licence": "licence", "register": "register",
        "plan": "plan", "property": "property", "expansion": "expansion"}

def rnd(c):
    return [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]

def main():
    fs = json.load(open(SRC, encoding="utf-8"))["features"]
    out = []
    for f in fs:
        p = f["properties"]
        if p.get("publish") != 1 or p["pcls"] not in KEEP:
            continue
        q = {"uid": p["uid"], "pid": p["pid"], "n": p["n"], "src": p["src"], "a": p["a"],
             "firm": 1 if p["pcls"] == "worked" else 0, "pcls": KEEP[p["pcls"]], "note": p.get("note", "")}
        if p.get("shared"): q["shared"] = p["shared"]
        out.append({"type": "Feature", "properties": q, "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}})
    out.sort(key=lambda f: (f["properties"]["uid"], f["properties"]["pid"]))
    json.dump({"type": "FeatureCollection", "features": out}, open(DST, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    c = collections.Counter(f["properties"]["pcls"] for f in out)
    print(len(out), "features,", len({f["properties"]["uid"] for f in out}), "sites,", dict(c), os.path.getsize(DST), "bytes")

if __name__ == "__main__":
    main()
