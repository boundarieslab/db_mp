#!/usr/bin/env python3
"""Draw the outlines as lines only, in a clear order of weight.

    python tools/patch_outline_style.py [index.html]

1. The site (worked ground, or the registered outline of a closed site): one
   thin line in the status colour, the heaviest on the map. No fill.
2. Permitted or licensed ground (reguleringsplan fields and mining licence, one
   class to the reader): white, solid.
3. Planned expansion: short dashes in one fixed colour, the same on every site.
4. Property: white, short dashes, the lightest.
A register outline is not drawn on a site that has worked ground traced.
Run after tools/patch_polygon_classes.py. Idempotent, and it keeps the file's
own line endings.
"""
import sys, os, io
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "index.html")
raw = io.open(P, encoding="utf-8", newline="").read()
CRLF = "\r\n" in raw
s = raw.replace("\r\n", "\n")
if "fp-paper" in s:
    print("already patched"); sys.exit(0)
if "fp-lic" not in s:
    sys.exit("run tools/patch_polygon_classes.py first")
def sub(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:80])
    s = s.replace(a, b)

# key
sub("""<div class="kr"><span class="swatch" style="background:rgba(255,0,0,.18);border:2px solid #FF0000"></span><span data-en="Worked ground" data-no="Driftsområde">Worked ground</span></div>""",
    """<div class="kr"><span class="swatch" style="background:#fff;border:1.5px solid #FF0000"></span><span data-en="Site: worked ground, or the registered outline of a closed site" data-no="Anlegg: driftsområde, eller registrert omriss for et nedlagt anlegg">Site: worked ground, or the registered outline of a closed site</span></div>""")
sub("""<div class="kr"><span class="swatch" style="background:#fff;border:1.5px dashed #FF0000"></span><span data-en="Permitted by reguleringsplan, or register outline" data-no="Tillatt i reguleringsplan, eller registeromriss">Permitted by reguleringsplan, or register outline</span></div>""",
    """<div class="kr"><span class="swatch" style="background:#5a5a5a;border:1.5px solid #fff;box-shadow:0 0 0 .5px #999"></span><span data-en="Permitted or licensed (reguleringsplan, mining licence)" data-no="Tillatt eller konsesjon (reguleringsplan, driftskonsesjon)">Permitted or licensed (reguleringsplan, mining licence)</span></div>""")
sub("""<div class="kr"><span class="swatch" style="background:#fff;border:1.5px dotted #FF0000"></span><span data-en="Mining licence (driftskonsesjon)" data-no="Driftskonsesjon">Mining licence (driftskonsesjon)</span></div>""",
    """<div class="kr"><span class="swatch" style="background:#5a5a5a;border:1.5px dashed #00FFFF;box-shadow:0 0 0 .5px #999"></span><span data-en="Planned expansion" data-no="Planlagt utvidelse">Planned expansion</span></div>""")
sub("""<div class="kr"><span class="swatch" style="background:#fff;border:.75px solid #FF0000"></span><span data-en="Property parcels under the site" data-no="Eiendommer under anlegget">Property parcels under the site</span></div>""",
    """<div class="kr"><span class="swatch" style="background:#5a5a5a;border:1px dashed #fff;box-shadow:0 0 0 .5px #999"></span><span data-en="Property parcels under the site" data-no="Eiendommer under anlegget">Property parcels under the site</span></div>""")
sub("""pc_expansion: { en: "proposed plan", no: "planforslag" }""", """pc_expansion: { en: "planned expansion", no: "planlagt utvidelse" }""")

# the aerial in the record window: the site line only
sub("""svg += `<path d="${d}" fill="${open ? 'none' : col}" fill-opacity=".18" stroke="${col}" stroke-width="5" stroke-opacity=".35" fill-rule="evenodd"/>` +
                   `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6" fill-rule="evenodd"/>`;""",
    """svg += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.5" fill-rule="evenodd"/>`;""")

# layer list and filters
sub("""const FP_LAYERS = ['fp-fill', 'fp-line', 'fp-soft', 'fp-lic', 'fp-prop'];
    // An outline that is not worked ground is one of three line kinds: dashed
    // (permitted, register, plan), dotted (mining licence), hairline (property).
    const IS_LIC  = ['==', ['get', 'pcls'], 'licence'];
    const IS_PROP = ['==', ['get', 'pcls'], 'property'];
    const F_SOFT  = ['any', ['all', ['==', ['get', 'firm'], 0], ['!', IS_LIC], ['!', IS_PROP]], ['==', ['get', 'cls'], 'future']];
    const F_LIC   = ['all', ['==', ['get', 'firm'], 0], IS_LIC];
    const F_PROP  = ['all', ['==', ['get', 'firm'], 0], IS_PROP];""",
    """const FP_LAYERS = ['fp-fill', 'fp-line', 'fp-soft', 'fp-paper', 'fp-exp', 'fp-prop'];
    // Lines only, in an order of weight. The site is the one line in the status
    // colour. What is permitted or licensed is white and solid, a planned
    // expansion is short dashes in one fixed colour, property is white dashes.
    const PAPER_COL = '#FFFFFF', EXP_COL = '#00FFFF';
    const NOT_FIRM = ['==', ['get', 'firm'], 0];
    const IS_PAPER = ['in', ['get', 'pcls'], ['literal', ['permitted', 'licence', 'plan']]];
    const IS_EXP   = ['==', ['get', 'pcls'], 'expansion'];
    const IS_PROP  = ['==', ['get', 'pcls'], 'property'];
    // Dashed in the status colour: a site still to come, and an outline that
    // stands in for the site (a register outline where nothing was traced).
    const F_SOFT  = ['any', ['all', NOT_FIRM, ['!', IS_PAPER], ['!', IS_EXP], ['!', IS_PROP], ['!=', ['get', 'hid'], 1]],
                            ['all', ['==', ['get', 'cls'], 'future'], ['!', NOT_FIRM]]];
    const F_PAPER = ['all', NOT_FIRM, IS_PAPER];
    const F_EXP   = ['all', NOT_FIRM, IS_EXP];
    const F_PROP  = ['all', NOT_FIRM, IS_PROP];
    const IS_FAC  = ['==', ['get', 'cat'], 'facility'];""")

# layers
sub("""paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['case', HOVER, FILL_A_H, FILL_A] } }, before);""",
    """paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['case', IS_FAC, 0, ['case', HOVER, FILL_A_H, FILL_A]] } }, before);""")
sub("""            layout: { 'line-join': 'round' },
            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, LINE_W_H_ALL, LINE_W_ALL] } }, before);""",
    """            layout: { 'line-join': 'round' },
            paint: { 'line-color': ['get', 'col'],
                     'line-width': ['case', IS_FAC, ['case', HOVER, 2.4, 1.5], ['case', HOVER, LINE_W_H_ALL, LINE_W_ALL]] } }, before);""")
sub("""        map.addLayer({ id: 'fp-lic', type: 'line', source: 'fp', minzoom: 10,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            filter: F_LIC,
            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, 2.2, 1.4],
                     'line-dasharray': [0.2, 2.2], 'line-opacity': 0.95 } }, before);
        map.addLayer({ id: 'fp-prop', type: 'line', source: 'fp', minzoom: 12,
            layout: { 'line-join': 'round' },
            filter: F_PROP,
            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, 1.2, 0.6], 'line-opacity': 0.6 } }, before);""",
    """        map.addLayer({ id: 'fp-prop', type: 'line', source: 'fp', minzoom: 12,
            layout: { 'line-join': 'round' },
            filter: F_PROP,
            paint: { 'line-color': PAPER_COL, 'line-width': ['case', HOVER, 0.9, 0.6], 'line-dasharray': [5, 4.3] } }, before);
        map.addLayer({ id: 'fp-exp', type: 'line', source: 'fp', minzoom: 10,
            layout: { 'line-join': 'round' },
            filter: F_EXP,
            paint: { 'line-color': EXP_COL, 'line-width': ['case', HOVER, 1.5, 1], 'line-dasharray': [3, 2.6] } }, before);
        map.addLayer({ id: 'fp-paper', type: 'line', source: 'fp', minzoom: 10,
            layout: { 'line-join': 'round' },
            filter: F_PAPER,
            paint: { 'line-color': PAPER_COL, 'line-width': ['case', HOVER, 1.5, 1] } }, before);""")
sub("""            map.setFilter('fp-lic', ['all', F_LIC, f]);
            map.setFilter('fp-prop', ['all', F_PROP, f]);""",
    """            map.setFilter('fp-paper', ['all', F_PAPER, f]);
            map.setFilter('fp-exp', ['all', F_EXP, f]);
            map.setFilter('fp-prop', ['all', F_PROP, f]);""")

# a register outline is left out where the site has worked ground
sub("""        const byUid = new Map(allSites.map(s => [uidOf(s), s]));
        // A footprint is drawn only for a site that is itself on the map.""",
    """        const byUid = new Map(allSites.map(s => [uidOf(s), s]));
        const traced = new Set((fpData ? fpData.features : []).filter(f => f.properties.firm === 1).map(f => f.properties.uid));
        // A footprint is drawn only for a site that is itself on the map.""")
sub("""properties: Object.assign({}, f.properties, { cat, cls, col: classInfo(cat, cls).col,""",
    """properties: Object.assign({}, f.properties, { cat, cls, col: classInfo(cat, cls).col,
                                                                    hid: f.properties.pcls === 'register' && traced.has(f.properties.uid) ? 1 : 0,""")
io.open(P, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n") if CRLF else s)
print("patched", P)
