#!/usr/bin/env python3
"""Add the future areas of the kommuneplaner (kommuneplan sweep of 19 Nov 2026) to
data/facility_polygons_method2026.geojson as "expansion" outlines, then rebuild
data/facility_polygons.geojson with tools/make_published_polygons.py.

    python tools/add_kpa_expansions.py            # fetch, add, rebuild
    python tools/add_kpa_expansions.py --dry-run  # fetch and report only

Each area is one feature of the national plan register (NAP, DiBK), layer
kparealformalomrade (kdparealformalomrade where marked), with arealbruksstatus 2
(framtidig). It is fetched by its objid: a GetMap with that objid as the only
filter finds a drawn pixel, and a GetFeatureInfo there returns the polygon.

An expansion is published (publish = 1) only when its facility is published in the
Facilities sheet; the others stay in the method file with publish = 0 and go out
when the facility does (flip publish and rerun make_published_polygons.py).
Safe to run twice: a pid already in the method file is left alone.
Needs network access to nap.ft.dibk.no and docs.google.com, shapely and pyproj.
"""
import csv, io, json, os, subprocess, sys, urllib.parse, urllib.request
import pyproj
from shapely.geometry import shape, mapping
from shapely.ops import transform

HERE = os.path.dirname(os.path.abspath(__file__))
METHOD = os.path.join(HERE, "..", "data", "facility_polygons_method2026.geojson")
BASE = "https://nap.ft.dibk.no/services/wms/kommuneplaner/"
SHEET = ("https://docs.google.com/spreadsheets/d/e/2PACX-1vS1KaVHKy2zLYGg4Urbhm2zjZkmuATNvIqJOxuECuU0wd"
         "ickEExV-8G0vL1F7xG1WKn_ADmwwfSARan/pub?output=csv")
TO_DEG = pyproj.Transformer.from_crs(25832, 4326, always_xy=True).transform

# uid: name, then (objid, x, y) in EPSG:25832; objid ending in "d" = kommunedelplan layer.
# Three Aurskog-Høland areas appear twice in the register with the same outline; one objid is kept.
AREAS = {
 "AK_BA_004": ("Franzefoss Pukk avd. Steinsholt", "228442 585771 6646120"),
 "AK_EN_001": ("Heier pukkverk", "245264 621441 6623389"),
 "OF_IO_002": ("Veidekke Elvestad", "223075 609933 6612485,224692 610021 6612846,223008 609997 6613145,223074 610129 6613031,237646 610003 6613159,237647 610137 6613012"),
 "OF_IO_007": ("Stikla pukkverk", "224148 631269 6624156"),
 "AK_UL_005": ("Barntjernmoen (gnr/bnr 202/1)", "238194 621312 6673720,238193 621063 6673177"),
 "AK_EI_002": ("Feiring Bruk AS avd. Dal Pukkverk", "255457 620276 6681947"),
 "OF_IO_003": ("Stegen avfallsanlegg - deponi", "225148 623105 6605060,223131 622918 6604994,223135 622875 6604957,223114 622807 6604906,223076 622954 6604611,225147 622802 6604501,223091 622482 6604656"),
 "AK_NA_003": ("Tangen pukkverk", "255203 614446 6686158"),
 "AK_NE_002": ("Esval Miljøpark", "248174 633286 6674577"),
 "AK_NE_004": ("Folbergåsen massetak - Nes Pukkverk", "248087 639993 6671257"),
 "VF_HM_002": ("Hanekleiva massemottak (planned)", "363380 566593 6603282"),
 "VF_HM_003": ("Haslestad deponi (planned)", "363406 561197 6597736"),
 "OF_RD_001": ("Råde pukkverk og massedeponi", "221893 611149 6581071,220901 611297 6581546"),
 "OF_SA_001": ("Gatedalen miljøanlegg", "211589 620718 6571209"),
 "OF_HA_001": ("Rokke avfallsanlegg - deponi", "207689 633759 6561811"),
 "OF_HA_003": ("Aasekjær miljøpark", "207690 632162 6558145"),
 "BU_LI_009": ("Lier Grustak", "262755 569241 6631774"),
 "BU_MO_001": ("Langsrudåsen pukkverk", "264464 555064 6652647"),
 "BU_RI_002": ("Heen Sand - Hensmoen", "262628 568063 6677438"),
 "OF_IO_008": ("Brennemoen grustak / Monaryggen", "224327 628751 6607149"),
 "AK_AH_003": ("Tørrmoen masseuttak", "247029 645713 6648833"),
 "BU_MO_003": ("Kløftefoss grustak (Slettmoen)", "265694 546292 6662219,264669 546223 6661373"),
 "BU_RI_003": ("Djupdalsmoen masseuttak", "261906 552182 6682005"),
 "VF_HM_006": ("Mossåsen grustak", "362772 559749 6595753"),
 "IN_SO_001": ("Korsfløyta", "307536 652620 6668991"),
 "BU_SI_001": ("Tukudalen pukkverk", "278702 537532 6658245"),
 "IN_SO_002": ("Gubbeskallen", "307537 654896 6668697"),
 "BU_KR_001": ("Redalen pukkverk", "265823 540888 6671852"),
 "OF_SA_002": ("Vister grustak", "211187 615743 6574940,211274 616066 6574764"),
 "VF_LA_005": ("Kviberg grustak", "381268 549854 6589682"),
 "VF_SA_002": ("Sønset pukkverk", "370727 564513 6579055"),
 "OF_RA_002": ("Stensrudåsen masseuttak", "226287 637852 6580139"),
 "BU_FL_004": ("Kippen steinbrudd", "279081 522215 6634121"),
 "IN_SL_001": ("Enger massetak", "343500 573608 6716389"),
 "OF_SA_003": ("Sarpsborg pukkverk", "210434 621576 6567821,210435 621166 6567967"),
 "OF_AR_001": ("Brekka masseuttak", "226716 651941 6578397"),
 "BU_FA_001": ("Gulsvik naturstein og massetak", "23632d 529536 6694572"),
 "OF_HA_004": ("Svingen pukkverk", "206762 630553 6556414"),
 "IN_EI_001": ("Svartdulpa masseuttak", "308087 683011 6652670"),
 "AK_VE_002": ("Helgemyren massemottak", "242707 599992 6601005"),
 "OF_RD_002": ("Solli Miljøpark", "220906 610796 6578117"),
 "OF_FR_005": ("Thorbjørnrød massedeponi", "212815 607967 6571424"),
 "AK_NA_004": ("Massemottak på Grani, Holter (planned)", "254981 612370 6667298"),
 "BU_LI_010": ("Lier RU6 råstoffutvinning (planned)", "263160 570849 6647405"),
 "AK_AS_007": ("Massemottak ved Bjønndalen (planned)", "231023 575565 6620676"),
 "AK_NA_005": ("Massemottak A2 (planned)", "255025 612138 6674279"),
 "AK_AH_004": ("Aurskog-Høland råstoffutvinning (planned)", "246250 637758 6633656"),
 "AK_VE_003": ("Renmassemottak M10 (planned)", "241705 596643 6598468"),
 "AK_AH_005": ("Aurskog-Høland massemottak (planned)", "247389 643088 6636915"),
 "VF_HM_007": ("Masseuttak, massedeponi og næring (planned)", "363218 568618 6602865"),
 "VF_HM_008": ("Knattåsen-Greaker massedeponi (planned)", "362786 571423 6593916"),
 "BU_KR_002": ("Slettemoen råstoffutvinning og industri (planned)", "266041 544857 6662631"),
 "OF_RA_003": ("Masseutfylling DEp1 (planned)", "225639 633190 6586258"),
 "OF_RA_004": ("Nakkimåsen blokksteinsuttak (planned)", "226067 639364 6580939"),
 "OF_FR_006": ("Viken Park - Tofteberg masseuttak og deponi (planned)", "212722 617512 6569177,215200 616892 6569251,214711 618237 6569147"),
 "BU_KO_001": ("Kongsberg BRU råstoffutvinning (planned)", "260945 528272 6610956"),
 "BU_RI_004": ("Masseuttak Gravlimoen (planned)", "262248 554908 6717468"),
}

def rnd(c):
    return [round(c[0], 6), round(c[1], 6)] if isinstance(c[0], (int, float)) else [rnd(x) for x in c]

def get(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()

def wms(params):
    return BASE + "?" + urllib.parse.urlencode(dict({"service": "WMS", "version": "1.3.0", "styles": "",
                                                     "crs": "EPSG:25832"}, **params))

def fetch(objid, x, y):
    layer = "kdparealformalomrade" if objid.endswith("d") else "kparealformalomrade"
    oid = objid.rstrip("d"); filt = '"objid" = %s' % oid; px = 300
    bbox = ",".join(str(v) for v in (x - 1500, y - 1500, x + 1500, y + 1500))
    png = get(wms({"request": "GetMap", "layers": layer, "bbox": bbox, "width": px, "height": px,
                   "format": "image/png", "transparent": "true", "cql_filter": filt}))
    from PIL import Image  # Pillow
    im = Image.open(io.BytesIO(png)).convert("RGBA"); a = im.getchannel("A")
    hits = [(i, j) for j in range(0, px, 3) for i in range(0, px, 3) if a.getpixel((i, j)) > 0]
    for i, j in hits[:: max(1, len(hits) // 5)] if hits else []:
        js = json.loads(get(wms({"request": "GetFeatureInfo", "layers": layer, "query_layers": layer, "bbox": bbox,
                                  "width": px, "height": px, "format": "image/png", "i": i, "j": j,
                                  "feature_count": 20, "info_format": "application/json", "cql_filter": filt})))
        for f in js.get("features", []):
            if str(f["properties"].get("objid")) == oid:
                return f, layer
    return None, layer

def published_uids():
    rows = list(csv.DictReader(io.StringIO(get(SHEET).decode("utf-8"))))
    return {r["UID"] for r in rows if r.get("Published", "").strip().upper() == "TRUE"}

def main():
    dry = "--dry-run" in sys.argv
    doc = json.load(open(METHOD, encoding="utf-8"))
    have = {f["properties"]["pid"] for f in doc["features"]}
    pub = published_uids()
    added, missing = [], []
    for uid, (name, spec) in AREAS.items():
        for n, item in enumerate(spec.split(","), 1):
            objid, x, y = item.split(); pid = "%s_expansion_kpa_%s" % (uid, objid.rstrip("d"))
            if pid in have:
                continue
            f, layer = fetch(objid, int(x), int(y))
            if f is None:
                missing.append(pid); continue
            p = f["properties"]
            g = transform(TO_DEG, shape(f["geometry"]))
            area = round(shape(f["geometry"]).area)
            what = " ".join(v for v in (p.get("områdenavn") or "", p.get("beskrivelse") or "") if v).strip()
            note = "KPA %s/%s %s (arealformål %s, arealbruksstatus %s; kommuneplan sweep 2026-11-19)" % (
                p.get("arealplanId.kommunenummer"), p.get("arealplanId.planidentifikasjon"), what, p.get("arealformål"),
                p.get("arealbruksstatus"))
            added.append({"type": "Feature", "properties": {
                "uid": uid, "pid": pid, "n": name, "src": "NAP kommuneplan (%s)" % layer, "a": area, "firm": 0,
                "pcls": "expansion", "note": " ".join(note.split()), "shared": "", "stage": "KPA", "conf": "",
                "publish": 1 if uid in pub else 0}, "geometry": {"type": g.geom_type, "coordinates": rnd(mapping(g)["coordinates"])}})
    print(len(added), "areas fetched;", sum(f["properties"]["publish"] for f in added), "on published sites;",
          len(missing), "not found:", ", ".join(missing))
    if dry or not added:
        return
    doc["features"].extend(added)
    json.dump(doc, open(METHOD, "w", encoding="utf-8"), ensure_ascii=False, separators=(", ", ": "))  # the file's own format
    subprocess.run([sys.executable, os.path.join(HERE, "make_published_polygons.py")], check=True)

if __name__ == "__main__":
    main()
