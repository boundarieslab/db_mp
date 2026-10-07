#!/usr/bin/env python3
"""Fewer lines on the map: what is allowed, what is planned, and closed sites.

    python tools/patch_outline_simple.py [index.html]

Drawn for a reception site:
  - one white outline round everything permitted or licensed, with nothing
    inside it (the "allowed" outline made by tools/make_published_polygons.py);
  - the planned expansion, in short dashes of one fixed colour;
  - the site's own line in the status colour only where the site is closed, or
    where there is no permitted or licensed outline to show instead.
Property parcels and the single plan fields are no longer drawn; their areas
stay in the record window. Run after tools/patch_outline_style.py. Idempotent,
and it keeps the file's own line endings.
"""
import sys, os, io
P = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "index.html")
raw = io.open(P, encoding="utf-8", newline="").read()
CRLF = "\r\n" in raw
s = raw.replace("\r\n", "\n")
if "IS_ALLOWED" in s:
    print("already patched"); sys.exit(0)
if "fp-paper" not in s:
    sys.exit("run tools/patch_outline_style.py first")
def sub(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:80])
    s = s.replace(a, b)

# key
sub("""<div class="kr"><span class="swatch" style="background:#fff;border:1.5px solid #FF0000"></span><span data-en="Site: worked ground, or the registered outline of a closed site" data-no="Anlegg: driftsområde, eller registrert omriss for et nedlagt anlegg">Site: worked ground, or the registered outline of a closed site</span></div>""",
    """<div class="kr"><span class="swatch" style="background:#fff;border:1.5px solid #FFD400"></span><span data-en="Closed site: its ground, or its registered outline" data-no="Nedlagt anlegg: området, eller registrert omriss">Closed site: its ground, or its registered outline</span></div>""")
sub("""
                        <div class="kr"><span class="swatch" style="background:#5a5a5a;border:1px dashed #fff;box-shadow:0 0 0 .5px #999"></span><span data-en="Property parcels under the site" data-no="Eiendommer under anlegget">Property parcels under the site</span></div>""", "")

# layers and filters
sub("""const FP_LAYERS = ['fp-fill', 'fp-line', 'fp-soft', 'fp-paper', 'fp-exp', 'fp-prop'];""",
    """const FP_LAYERS = ['fp-fill', 'fp-line', 'fp-soft', 'fp-paper', 'fp-exp'];""")
sub("""    const IS_PAPER = ['in', ['get', 'pcls'], ['literal', ['permitted', 'licence', 'plan']]];
    const IS_EXP   = ['==', ['get', 'pcls'], 'expansion'];
    const IS_PROP  = ['==', ['get', 'pcls'], 'property'];""",
    """    // Two outlines are drawn for a site: "allowed", the outer edge of everything
    // permitted or licensed, and "planned", the outer edge of the expansion. The
    // single plan fields, the licence and the parcels are kept for their areas only.
    const IS_ALLOWED = ['==', ['get', 'pcls'], 'allowed'];
    const IS_PLANNED = ['==', ['get', 'pcls'], 'planned'];
    const IS_KEPT    = ['in', ['get', 'pcls'], ['literal', ['permitted', 'licence', 'plan', 'expansion', 'property']]];
    // The site's own line: a closed site, or a site with nothing allowed to show.
    const SITE_LINE  = ['any', ['!', ['==', ['get', 'cat'], 'facility']], ['==', ['get', 'cls'], 'old'], ['==', ['get', 'solo'], 1]];""")
sub("""    const F_SOFT  = ['any', ['all', NOT_FIRM, ['!', IS_PAPER], ['!', IS_EXP], ['!', IS_PROP], ['!=', ['get', 'hid'], 1]],""",
    """    const F_SOFT  = ['any', ['all', NOT_FIRM, ['!', IS_ALLOWED], ['!', IS_PLANNED], ['!', IS_KEPT], ['!=', ['get', 'hid'], 1]],""")
sub("""    const F_PAPER = ['all', NOT_FIRM, IS_PAPER];
    const F_EXP   = ['all', NOT_FIRM, IS_EXP];
    const F_PROP  = ['all', NOT_FIRM, IS_PROP];""",
    """    const F_PAPER = ['all', NOT_FIRM, IS_ALLOWED];
    const F_EXP   = ['all', NOT_FIRM, IS_PLANNED];""")
sub("""            filter: ['all', ['==', ['get', 'firm'], 1], ['!=', ['get', 'cls'], 'future']],
            layout: { 'line-join': 'round' },""",
    """            filter: ['all', ['==', ['get', 'firm'], 1], ['!=', ['get', 'cls'], 'future'], SITE_LINE],
            layout: { 'line-join': 'round' },""")
sub("""        map.addLayer({ id: 'fp-prop', type: 'line', source: 'fp', minzoom: 12,
            layout: { 'line-join': 'round' },
            filter: F_PROP,
            paint: { 'line-color': PAPER_COL, 'line-width': ['case', HOVER, 0.9, 0.6], 'line-dasharray': [5, 4.3] } }, before);
""", "")
sub("""            map.setFilter('fp-line', ['all', ['==', ['get', 'firm'], 1], ['!=', ['get', 'cls'], 'future'], f]);""",
    """            map.setFilter('fp-line', ['all', ['==', ['get', 'firm'], 1], ['!=', ['get', 'cls'], 'future'], SITE_LINE, f]);""")
sub("""            map.setFilter('fp-prop', ['all', F_PROP, f]);
""", "")

# a site with nothing allowed to draw keeps its own line
sub("""        const traced = new Set((fpData ? fpData.features : []).filter(f => f.properties.firm === 1).map(f => f.properties.uid));""",
    """        const traced = new Set((fpData ? fpData.features : []).filter(f => f.properties.firm === 1).map(f => f.properties.uid));
        const allowed = new Set((fpData ? fpData.features : []).filter(f => f.properties.pcls === 'allowed').map(f => f.properties.uid));""")
sub("""                                                                    hid: f.properties.pcls === 'register' && traced.has(f.properties.uid) ? 1 : 0,""",
    """                                                                    hid: f.properties.pcls === 'register' && traced.has(f.properties.uid) ? 1 : 0,
                                                                    solo: allowed.has(f.properties.uid) ? 0 : 1,""")
# the two drawn outlines are not counted as outlines of their own
sub("""${gj.features.length - firm} ${t2('fpngu', 'en')}""", """${gj.features.filter(f => !/^(allowed|planned)$/.test(f.properties.pcls)).length - firm} ${t2('fpngu', 'en')}""")
sub("""${gj.features.length - firm} ${t2('fpngu', 'no')}""", """${gj.features.filter(f => !/^(allowed|planned)$/.test(f.properties.pcls)).length - firm} ${t2('fpngu', 'no')}""")
io.open(P, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n") if CRLF else s)
print("patched", P)
