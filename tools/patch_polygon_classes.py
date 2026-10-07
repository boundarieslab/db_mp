#!/usr/bin/env python3
"""Teach the map the outline classes of the 2026 polygon method.

    python tools/patch_polygon_classes.py [index.html]

Worked ground is the footprint (solid, thin fill). Permitted, register, plan and
proposed-plan outlines are dashed, a mining licence is dotted, property parcels
are a hairline. A site that has a worked outline is framed on it, and the aerial
in the record window draws only that. The record window lists the area of each
kind of outline. Idempotent: a file already patched is left alone.
"""
import sys, os, io
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "index.html")
raw = io.open(P, encoding="utf-8", newline="").read()
CRLF = "\r\n" in raw
s = raw.replace("\r\n", "\n")
if "fp-lic" in s:
    print("already patched"); sys.exit(0)
def sub(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:70])
    s = s.replace(a, b)

# legend
sub("""<span data-en="Footprint, operating extent" data-no="Omriss, driftsområde">Footprint, operating extent</span></div>""",
    """<span data-en="Worked ground" data-no="Driftsområde">Worked ground</span></div>""")
sub("""<div class="kr"><span class="swatch" style="background:#fff;border:1.5px dashed #FF0000"></span><span data-en="Footprint, NGU resource area only" data-no="Omriss, kun NGU-ressursområde">Footprint, NGU resource area only</span></div>""",
    """<div class="kr"><span class="swatch" style="background:#fff;border:1.5px dashed #FF0000"></span><span data-en="Permitted by reguleringsplan, or register outline" data-no="Tillatt i reguleringsplan, eller registeromriss">Permitted by reguleringsplan, or register outline</span></div>
                        <div class="kr"><span class="swatch" style="background:#fff;border:1.5px dotted #FF0000"></span><span data-en="Mining licence (driftskonsesjon)" data-no="Driftskonsesjon">Mining licence (driftskonsesjon)</span></div>
                        <div class="kr"><span class="swatch" style="background:#fff;border:.75px solid #FF0000"></span><span data-en="Property parcels under the site" data-no="Eiendommer under anlegget">Property parcels under the site</span></div>""")
sub("""<span data-en="Site with no footprint yet" data-no="Sted uten omriss ennå">Site with no footprint yet</span>""",
    """<span data-en="Site with no outline yet" data-no="Sted uten omriss ennå">Site with no outline yet</span>""")
sub("""data-en="plan, cadastre and traced ground" data-no="plan, matrikkel og tolket grunn">plan, cadastre and traced ground<""",
    """data-en="worked ground, plan, licence and property" data-no="driftsområde, plan, konsesjon og eiendom">worked ground, plan, licence and property<""")

# words
sub("""        pc_plan: { en: "plan", no: "plan" }, pc_register: { en: "register", no: "register" },""",
    """        pc_plan: { en: "plan", no: "plan" }, pc_register: { en: "register", no: "register" },
        pc_licence: { en: "mining licence", no: "driftskonsesjon" }, pc_expansion: { en: "proposed plan", no: "planforslag" },
        outl: { en: "Outlines", no: "Omriss" },""")
sub("""        fpfirm: { en: "trace an operating footprint", no: "følger et driftsområde" },""",
    """        fpfirm: { en: "sites with worked ground traced", no: "anlegg med tolket driftsområde" },""")
sub("""        fpngu: { en: "are plan or property boundaries", no: "er plan- eller eiendomsgrenser" },""",
    """        fpngu: { en: "plan, licence, register and property outlines", no: "plan-, konsesjons-, register- og eiendomsomriss" },""")

# layers
sub("""    const FP_LAYERS = ['fp-fill', 'fp-line', 'fp-soft'];""",
    """    const FP_LAYERS = ['fp-fill', 'fp-line', 'fp-soft', 'fp-lic', 'fp-prop'];
    // An outline that is not worked ground is one of three line kinds: dashed
    // (permitted, register, plan), dotted (mining licence), hairline (property).
    const IS_LIC  = ['==', ['get', 'pcls'], 'licence'];
    const IS_PROP = ['==', ['get', 'pcls'], 'property'];
    const F_SOFT  = ['any', ['all', ['==', ['get', 'firm'], 0], ['!', IS_LIC], ['!', IS_PROP]], ['==', ['get', 'cls'], 'future']];
    const F_LIC   = ['all', ['==', ['get', 'firm'], 0], IS_LIC];
    const F_PROP  = ['all', ['==', ['get', 'firm'], 0], IS_PROP];""")
sub("""            filter: ['any', ['==', ['get', 'firm'], 0], ['==', ['get', 'cls'], 'future']],
            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, LINE_W_H_ALL, LINE_W_ALL],
                     'line-dasharray': [3, 2], 'line-opacity': 0.95 } }, before);""",
    """            filter: F_SOFT,
            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, LINE_W_H_ALL, LINE_W_ALL],
                     'line-dasharray': [3, 2], 'line-opacity': 0.95 } }, before);
        map.addLayer({ id: 'fp-lic', type: 'line', source: 'fp', minzoom: 10,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            filter: F_LIC,
            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, 2.2, 1.4],
                     'line-dasharray': [0.2, 2.2], 'line-opacity': 0.95 } }, before);
        map.addLayer({ id: 'fp-prop', type: 'line', source: 'fp', minzoom: 12,
            layout: { 'line-join': 'round' },
            filter: F_PROP,
            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, 1.2, 0.6], 'line-opacity': 0.6 } }, before);""")
sub("""            map.setFilter('fp-soft', ['all', ['any', ['==', ['get', 'firm'], 0], ['==', ['get', 'cls'], 'future']], f]);""",
    """            map.setFilter('fp-soft', ['all', F_SOFT, f]);
            map.setFilter('fp-lic', ['all', F_LIC, f]);
            map.setFilter('fp-prop', ['all', F_PROP, f]);""")

# framing and the aerial: the worked outline where there is one
sub("""            fpData = gj;
            gj.features.forEach(f => {
                const uid = f.properties.uid;
                let w = 180, so = 90, e = -180, n = -90;""",
    """            fpData = gj;
            const hasWorked = new Set(gj.features.filter(f => f.properties.firm === 1).map(f => f.properties.uid));
            gj.features.forEach(f => {
                const uid = f.properties.uid;
                if (hasWorked.has(uid) && f.properties.firm !== 1) return;
                let w = 180, so = 90, e = -180, n = -90;""")
sub("""            const firm = gj.features.filter(f => f.properties.firm === 1).length;
            $('count-footprints').textContent = gj.features.length;""",
    """            const firm = hasWorked.size;
            $('count-footprints').textContent = new Set(gj.features.map(f => f.properties.uid)).size;""")

# area and the record window
sub("""    const PCLS = ['observed', 'permitted', 'plan', 'register', 'property', 'resource'];""",
    """    const PCLS = ['observed', 'permitted', 'licence', 'plan', 'register', 'property', 'resource', 'expansion'];
    // Every kind of outline a site has, with its area, for the record window.
    function outlinesOf(s) {
        if (!fpData) return '';
        const uid = uidOf(s), by = {};
        fpData.features.forEach(f => {
            const p = f.properties || {};
            if (p.uid !== uid || !Number.isFinite(+p.a)) return;
            by[p.pcls || ''] = (by[p.pcls || ''] || 0) + (+p.a);
        });
        return PCLS.filter(c => c in by).map(c => pclsWord(c) + ' ' + fmt(by[c]) + ' m²').join(' · ');
    }""")
sub("""+ row('geom', geomText(site)) + row('wat',""", """+ row('outl', outlinesOf(site)) + row('geom', geomText(site)) + row('wat',""")
io.open(P, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n") if CRLF else s)
print("patched", P)
