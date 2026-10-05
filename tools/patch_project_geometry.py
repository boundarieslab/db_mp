#!/usr/bin/env python3
"""Draw each construction project as its line or its perimeter.

    python3 tools/patch_project_geometry.py [index.html] [tools/smoke_test.js]

Applies a fixed list of anchored replacements. Every anchor must be found
exactly once, or nothing is written. Running it twice is refused.
"""
import sys, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
HTML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
TEST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'tools', 'smoke_test.js')

HTML_EDITS = [
# 1. the file
("""    const COVERAGE_GEOJSON = 'data/plan_coverage.geojson';
""",
"""    const COVERAGE_GEOJSON = 'data/plan_coverage.geojson';
    // The line (tunnel, road, railway) or the perimeter (site, building) of a
    // construction project. Built by tools/make_project_geometries.py.
    const PROJECT_GEOJSON = 'data/project_geometries.geojson';
"""),
# 2. line treatment: a project line is drawn heavier than a site contour
("""    const FILL_A   = byClass(""",
"""    const IS_LINE  = ['==', ['get', 'kind'], 'line'];
    const NOT_LINE = ['!=', ['get', 'kind'], 'line'];
    const FILL_A   = byClass("""),
("""    let fpData = null, fpState = 0, sitesReady = false;
""",
"""    let fpData = null, fpState = 0, sitesReady = false;
    let pgData = null;
    const LINE_W_ALL   = ['case', IS_LINE, 2.4, LINE_W];
    const LINE_W_H_ALL = ['case', IS_LINE, 3.8, LINE_W_H];
"""),
# 3. one source for both: footprints of sites, lines and perimeters of projects
("""        if (!fpData) return { type: 'FeatureCollection', features: [] };
        const byUid = new Map(allSites.map(s => [uidOf(s), s]));
        // A footprint is drawn only for a site that is itself on the map.
        return { type: 'FeatureCollection', features: fpData.features.filter(f => byUid.has(f.properties.uid)).map(f => {""",
"""        const shapes = (fpData ? fpData.features : []).concat(pgData ? pgData.features : []);
        const byUid = new Map(allSites.map(s => [uidOf(s), s]));
        // A footprint is drawn only for a site that is itself on the map.
        return { type: 'FeatureCollection', features: shapes.filter(f => byUid.has(f.properties.uid)).map(f => {"""),
("""            attribution: 'Footprints: Kartverket plan and cadastre · NGU · LUB' });""",
"""            attribution: 'Footprints: Kartverket plan and cadastre · NGU · LUB · Project lines and perimeters © OpenStreetMap contributors' });"""),
("""            filter: ['==', ['get', 'firm'], 1],
            paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['case', HOVER, FILL_A_H, FILL_A] } }, before);""",
"""            filter: ['all', ['==', ['get', 'firm'], 1], NOT_LINE],
            paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['case', HOVER, FILL_A_H, FILL_A] } }, before);"""),
("""            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, LINE_W_H, LINE_W] } }, before);""",
"""            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, LINE_W_H_ALL, LINE_W_ALL] } }, before);"""),
("""            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, LINE_W_H, LINE_W],
                     'line-dasharray': [3, 2], 'line-opacity': 0.95 } }, before);""",
"""            paint: { 'line-color': ['get', 'col'], 'line-width': ['case', HOVER, LINE_W_H_ALL, LINE_W_ALL],
                     'line-dasharray': [3, 2], 'line-opacity': 0.95 } }, before);"""),
("""            map.setFilter('fp-fill', ['all', ['==', ['get', 'firm'], 1], f]);""",
"""            map.setFilter('fp-fill', ['all', ['==', ['get', 'firm'], 1], NOT_LINE, f]);"""),
# 4. bounds and rings by uid, as for footprints; a line is remembered as open
("""    const fpRings = Object.create(null);
""",
"""    const fpRings = Object.create(null);
    const fpOpen = Object.create(null);      // uid -> true when the shape is a line, not an outline

    // Take a project's line or perimeter into the same lookups the footprints
    // use, and give a project that has no point in the sheet a point on its
    // own shape, so it gets a marker, a row that can be opened and a place in
    // the flows.
    function useProjectGeometries(gj) {
        if (!gj || !Array.isArray(gj.features)) return;
        const byUid = new Map(allSites.map(s => [uidOf(s), s]));
        gj.features.forEach(f => {
            const p = f.properties || {}, uid = p.uid;
            if (!uid || !f.geometry) return;
            let w = 180, so = 90, e = -180, n = -90;
            const rings = fpRings[uid] || (fpRings[uid] = []);
            const walk = c => {
                if (typeof c[0][0] === 'number') { rings.push(c); c.forEach(q => {
                    if (q[0] < w) w = q[0]; if (q[0] > e) e = q[0];
                    if (q[1] < so) so = q[1]; if (q[1] > n) n = q[1]; }); }
                else c.forEach(walk);
            };
            walk(f.geometry.coordinates);
            const b = fpBounds[uid];
            fpBounds[uid] = b ? [Math.min(b[0], w), Math.min(b[1], so), Math.max(b[2], e), Math.max(b[3], n)] : [w, so, e, n];
            if (p.kind === 'line') fpOpen[uid] = true;
            const s = byUid.get(uid);
            if (!s) return;
            s.__geom = p;
            if (!hasXY(s) && Array.isArray(p.pt) && Number.isFinite(+p.pt[0]) && Number.isFinite(+p.pt[1])) {
                s.Longitude = String(p.pt[0]); s.Latitude = String(p.pt[1]); s.__geoFromShape = true;
            }
        });
        pgData = gj;
    }
"""),
# 5. the aerial in the record: a line is stroked, not closed and filled
("""            const d = rings.map(r => 'M' + r.map(c => (lonX(c[0], z) - left).toFixed(1) + ' ' + (latY(c[1], z) - top).toFixed(1)).join('L') + 'Z').join('');
            svg += `<path d="${d}" fill="${col}" fill-opacity=".18" stroke="${col}" stroke-width="5" stroke-opacity=".35" fill-rule="evenodd"/>` +""",
"""            const open = !!fpOpen[uidOf(site)];
            const d = rings.map(r => 'M' + r.map(c => (lonX(c[0], z) - left).toFixed(1) + ' ' + (latY(c[1], z) - top).toFixed(1)).join('L') + (open ? '' : 'Z')).join('');
            svg += `<path d="${d}" fill="${open ? 'none' : col}" fill-opacity=".18" stroke="${col}" stroke-width="5" stroke-opacity=".35" fill-rule="evenodd"/>` +"""),
# 6. words
("""        area: { en: "Area", no: "Areal" },
""",
"""        area: { en: "Area", no: "Areal" },
        geom: { en: "Drawn as", no: "Tegnet som" },
        g_line: { en: "line", no: "linje" }, g_perimeter: { en: "perimeter", no: "omriss" },
        gb_alignment: { en: "alignment", no: "trasé" }, gb_building: { en: "building", no: "bygning" },
        gb_site: { en: "construction site", no: "byggeplass" }, gb_sites: { en: "construction sites", no: "byggeplasser" },
"""),
# 7. the record says what the shape is and where it comes from
("""        const section = (k, body) => `<b>${t(k)}</b>` + (body || `<div class="column-set no-data">${t('nodata')}</div>`);
""",
"""        const section = (k, body) => `<b>${t(k)}</b>` + (body || `<div class="column-set no-data">${t('nodata')}</div>`);
        const geomText = s => {
            const g = s.__geom;
            if (!g) return '';
            const w = { 'alignment': 'gb_alignment', 'building': 'gb_building', 'construction site': 'gb_site', 'construction sites': 'gb_sites' }[g.basis];
            return [t(g.kind === 'line' ? 'g_line' : 'g_perimeter'),
                    g.kind !== 'line' && Number.isFinite(+g.a) ? fmt(+g.a) + ' m²' : '',
                    w ? t(w) : (g.basis || ''), 'OpenStreetMap'].filter(Boolean).join(' · ');
        };
"""),
("""row('area', areaOf(site) ? fmt(areaOf(site).v) + ' m² · ' + pclsWord(areaOf(site).cls) : '') + row('wat', site.WaterRecipient))}""",
"""row('area', areaOf(site) ? fmt(areaOf(site).v) + ' m² · ' + pclsWord(areaOf(site).cls) : '') + row('geom', geomText(site)) + row('wat', site.WaterRecipient))}"""),
# 8. load: the shapes arrive with the two sheets, before anything is counted or drawn
("""    Promise.all([parseCsv(FACILITIES_CSV), parseCsv(PROJECTS_CSV)])
      .then(([fRes, pRes]) => {""",
"""    Promise.all([parseCsv(FACILITIES_CSV), parseCsv(PROJECTS_CSV),
                 fetch(PROJECT_GEOJSON).then(r => r.ok ? r.json() : null).catch(() => null)])
      .then(([fRes, pRes, pgRes]) => {"""),
("""        allSites = [...facilities, ...projects];
""",
"""        allSites = [...facilities, ...projects];
        useProjectGeometries(pgRes);
"""),
]

TEST_EDITS = [
# footprints of sites are counted apart from project shapes
("""    return { all: ['fp-fill', 'fp-line', 'fp-soft'].every(v), n: f.length,""",
"""    return { all: ['fp-fill', 'fp-line', 'fp-soft'].every(v), n: f.filter(x => !x.properties.kind).length,
             pg: f.filter(x => x.properties.kind).map(x => x.properties.uid + ':' + x.properties.kind + ':' + x.geometry.type + ':' + x.properties.col).join(' '),
             fillFilter: JSON.stringify(m.getFilter('fp-fill')), lineW: JSON.stringify(m.getPaintProperty('fp-line', 'line-width')),"""),
("""  ok(fp.all, 'footprints draw without being asked');
""",
"""  ok(fp.all, 'footprints draw without being asked');
  // A construction project is drawn as its line or its perimeter, from
  // data/project_geometries.geojson (stubbed above with one line for CP_001).
  ok(/^CP_001:line:MultiLineString:#00FF00$/.test(fp.pg), 'a project is drawn as its line, in its status colour (' + fp.pg + ')');
  ok(/"kind"\\],"line"/.test(fp.fillFilter) && /"!="/.test(fp.fillFilter), 'a line is never filled as if it were an area');
  ok(/"kind"\\],"line"\\],3\\.8/.test(fp.lineW) && /2\\.4/.test(fp.lineW), 'and is drawn heavier than a site contour');
  const pgUi = await p.evaluate(async () => {
    const m = window.__M;
    const was = { center: m.getCenter(), zoom: m.getZoom() };
    const idle = () => new Promise(r => { m.once('idle', r); setTimeout(r, 4000); });
    m.jumpTo({ center: [10.63, 59.90], zoom: 11.5 }); await idle();
    const hit = m.queryRenderedFeatures({ layers: ['fp-line'] }).filter(f => f.properties.uid === 'CP_001').length;
    const filled = m.queryRenderedFeatures({ layers: ['fp-fill'] }).filter(f => f.properties.uid === 'CP_001').length;
    m.jumpTo(was); await idle();
    return { hit, filled };
  });
  ok(pgUi.hit > 0 && pgUi.filled === 0, 'the line is actually painted, and only as a line (' + pgUi.hit + ', ' + pgUi.filled + ')');
"""),
("""  const p = await ctx.newPage();
""",
"""  // One invented line for the fixture project, so the test does not depend on
  // which real projects have a geometry.
  await ctx.route(/\\/data\\/project_geometries\\.geojson/, r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { uid: 'CP_001', n: 'Fornebubanen', kind: 'line', firm: 1, basis: 'alignment', pt: [10.62, 59.895] },
        geometry: { type: 'MultiLineString', coordinates: [[[10.60, 59.890], [10.62, 59.895], [10.66, 59.915]]] } },
      { type: 'Feature', properties: { uid: 'CP_404', n: 'Not in the sheet', kind: 'perimeter', firm: 1, basis: 'building', a: 100, pt: [10.7, 59.9] },
        geometry: { type: 'MultiPolygon', coordinates: [[[[10.7, 59.9], [10.701, 59.9], [10.701, 59.901], [10.7, 59.9]]]] } } ] }) }));
  const p = await ctx.newPage();
"""),
]

def apply(path, edits, marker):
    s = open(path, encoding='utf-8', newline='').read()
    if marker in s:
        sys.exit(path + ': already patched')
    for a, b in edits:
        n = s.count(a)
        if n != 1:
            sys.exit('%s: anchor found %d times, nothing written:\n%s' % (path, n, a[:160]))
        s = s.replace(a, b)
    return s

h = apply(HTML, HTML_EDITS, 'PROJECT_GEOJSON')
t = apply(TEST, TEST_EDITS, 'project_geometries')
open(HTML, 'w', encoding='utf-8', newline='').write(h)
open(TEST, 'w', encoding='utf-8', newline='').write(t)
print('patched', HTML, 'and', TEST)
