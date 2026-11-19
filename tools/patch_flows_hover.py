# Flows, after Paolo's look at the live map (19.11.2026):
#   - hovering lifts the flow with more force: a heavier white line on a darker casing,
#     the rest of the network falls further back;
#   - hovering a road shared by several flows lifts all of them;
#   - the origin and destination symbols of the hovered flows are drawn larger, so one
#     sees where the mass comes from and where it goes;
#   - no arrowheads.
# Applied after tools/patch_flows_harmonize.py and tools/patch_flows_legs.py.
# Usage: python tools/patch_flows_hover.py index.html
import sys
P = sys.argv[1]
s = open(P, encoding='utf-8').read()
def rep(a, b):
    global s
    if s.count(a) != 1: raise SystemExit('expected one match: ' + a[:90])
    s = s.replace(a, b)

# ---- no heads ----------------------------------------------------------------------
rep("""        if (!map.getSource('flowheads')) map.addSource('flowheads', { type: 'geojson', data: headFeatures() });
""", "")
rep("""        if (!map.getLayer('flow-head')) {
            map.addLayer({ id: 'flow-head', type: 'fill', source: 'flowheads',
                paint: { 'fill-color': '#ffffff', 'fill-opacity': 1,
                         'fill-outline-color': 'rgba(14,14,11,0.7)' } }, before);
        }
""", """        // The two ends of a hovered flow: the same symbol, larger, over the map's own.
        ensureFlowEnds();
""")

# ---- hovered ids: a list, so a shared road lifts every flow on it --------------------
rep("""        if (hotFlowId) ids.add(hotFlowId);
        return [...ids];""",
"""        hotIds().forEach(id => ids.add(id));
        return [...ids];""")
rep("""    let hotFlowId = null;""",
"""    let hotFlowId = null;          // one id, or several joined by commas (a shared road)
    const hotIds = () => String(hotFlowId || '').split(',').filter(Boolean);""")

rep("""        const fidAt = e => { const ft = e.features && e.features[0]; if (!ft) return null;
            return ft.properties.fid || String(ft.properties.fids || '').split(',')[0] || null; };""",
"""        const fidAt = e => { const ft = e.features && e.features[0]; if (!ft) return null;
            return ft.properties.fid || String(ft.properties.fids || '').split(',')[0] || null; };
        // Hover: every flow on the stretch under the pointer.
        const fidsAt = e => { const ft = e.features && e.features[0]; if (!ft) return null;
            return ft.properties.fid || ft.properties.fids || null; };""")
rep("""                const fid = fidAt(e); if (!fid) return;
                map.getCanvas().style.cursor = 'pointer';
                hotFlow(fid);
                const f = allFlows.find(x => x.FlowUID === fid);
                if (f) updateStatus(f.__fromName + ' → ' + f.__toName);""",
"""                const fids = fidsAt(e); if (!fids) return;
                map.getCanvas().style.cursor = 'pointer';
                hotFlow(fids);
                const fs = fids.split(',').map(id => allFlows.find(x => x.FlowUID === id)).filter(Boolean);
                if (fs.length) updateStatus(fs.map(f => f.__fromName + ' → ' + f.__toName).join(' · '));""")

rep("""    function hotFlow(id) {
        if (id === hotFlowId) return;
        if (deckScope === 'flow') {
            deckBody.querySelectorAll('tr.hot').forEach(r => r.classList.remove('hot'));
            if (id) {
                const r = deckBody.querySelector('tr[data-flow="' + CSS.escape(id) + '"]');
                if (r) r.classList.add('hot');
            }
        }
        hotFlowId = id;
        paintFlows();
    }""",
"""    function hotFlow(id) {
        if ((id || null) === hotFlowId) return;
        hotFlowId = id || null;
        if (deckScope === 'flow') {
            deckBody.querySelectorAll('tr.hot').forEach(r => r.classList.remove('hot'));
            hotIds().forEach(fid => {
                const r = deckBody.querySelector('tr[data-flow="' + CSS.escape(fid) + '"]');
                if (r) r.classList.add('hot');
            });
        }
        paintFlows();
    }

    // The ends of the hovered flows, drawn again at 1.9 times the size over the map's
    // own symbols. A symbol layer cannot grow by feature state, so this is a second
    // layer filtered on the ends' ids.
    function ensureFlowEnds() {
        if (map.getLayer('flow-end-sym') || !map.getSource('sites')) return;
        map.addLayer({ id: 'flow-end-sym', type: 'symbol', source: 'sites',
            filter: ['in', ['get', 'uid'], ['literal', []]],
            layout: { 'icon-image': ['get', 'sym'],
                      'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.76, 15, 1.25],
                      'icon-allow-overlap': true, 'icon-ignore-placement': true,
                      'icon-anchor': 'center' } });
    }""")

# ---- paint: hovered flows heavier, the rest further back, ends enlarged --------------
rep("""        NET_IDS.forEach(id => { if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', lifted ? 0.28 : 0.95); });
        if (map.getLayer('flow-net-cas')) map.setPaintProperty('flow-net-cas', 'line-opacity', lifted ? 0.10 : 0.45);
        if (map.getLayer('flow-head')) map.setPaintProperty('flow-head', 'fill-opacity', lifted ? 0.45 : 1);""",
"""        const hot = hotIds(), isHot = ['in', ['get', 'fid'], ['literal', hot]];
        NET_IDS.forEach(id => { if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', hot.length ? 0.16 : lifted ? 0.28 : 0.95); });
        if (map.getLayer('flow-net-cas')) map.setPaintProperty('flow-net-cas', 'line-opacity', hot.length ? 0.06 : lifted ? 0.10 : 0.45);
        // A hovered flow: 4 px of white on 3 px of dark either side; a picked site's
        // other flows stay at 2.6 px.
        ['flow-pick-solid', 'flow-pick-dash'].forEach(id => {
            if (map.getLayer(id)) map.setPaintProperty(id, 'line-width', ['case', isHot, 4, PICK_W]); });
        if (map.getLayer('flow-pick-sea')) map.setPaintProperty('flow-pick-sea', 'line-width', ['case', isHot, 3.4, 2.4]);
        if (map.getLayer('flow-pick-cas')) {
            map.setPaintProperty('flow-pick-cas', 'line-width', ['case', isHot, 7, PICK_W + 2]);
            map.setPaintProperty('flow-pick-cas', 'line-opacity', ['case', isHot, 0.8, 0.55]);
        }
        ensureFlowEnds();
        if (map.getLayer('flow-end-sym')) {
            const ends = new Set();
            hot.forEach(fid => { const f = allFlows.find(x => x.FlowUID === fid);
                                 if (f) { ends.add(String(f.FromUID).trim()); ends.add(String(f.ToUID).trim()); } });
            map.setFilter('flow-end-sym', ['in', ['get', 'uid'], ['literal', [...ends]]]);
        }""")

# the ends layer follows the flows' visibility
rep("""            FLOW_LAYERS.forEach(id => {
                if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', show.flow.on && mine ? 'visible' : 'none');
            });""",
"""            FLOW_LAYERS.concat(['flow-end-sym']).forEach(id => {
                if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', show.flow.on && mine ? 'visible' : 'none');
            });""")

# ---- the key: no head, nothing to change there; the zoom handler for heads goes -------
rep("""                    const src = flowsReady && map.getSource('flowheads');
                    if (src) src.setData(headFeatures());""",
"""                    const src = flowsReady && map.getSource('flowheads');
                    if (src) src.setData(headFeatures());   // no heads any more; kept inert""")
open(P, 'w', encoding='utf-8').write(s)
print('patched')
