# Flows, after Paolo's second look (19.11.2026, evening):
#   - the hover was too touchy and the right flow hard to catch: the pointer now picks on
#     a 14 px invisible band along each flow's own route, takes the flow nearest to it,
#     keeps the flow it already has while the pointer stays on that flow (so a road shared
#     by several flows does not flip between them), and lets go only after a short pause;
#   - a flow picked by a click (map or table) stays selected: its line stays lifted and its
#     two end symbols stay enlarged until a click elsewhere on the map, another flow, a site
#     or another tab;
#   - the enlarged end symbols were too big: 1.35 times the map's symbol, not 1.9.
# Applied after patch_flows_harmonize.py, patch_flows_legs.py and patch_flows_hover.py.
# Usage: python tools/patch_flows_pick.py index.html
import sys
P = sys.argv[1]
s = open(P, encoding='utf-8').read()
def rep(a, b):
    global s
    if s.count(a) != 1: raise SystemExit('expected one match: ' + a[:90])
    s = s.replace(a, b)

# ---- selected flow, counted with the hovered ones ------------------------------------
rep("""    const hotIds = () => String(hotFlowId || '').split(',').filter(Boolean);""",
"""    let selFlowId = null;          // the flow picked by a click; stays until cleared
    const hotIds = () => [...new Set(String(hotFlowId || '').split(',')
                                     .concat(selFlowId ? [selFlowId] : []).filter(Boolean))];""")

# ---- smaller ends ---------------------------------------------------------------------
rep("""                      'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.76, 15, 1.25],""",
"""                      'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.54, 15, 0.89],""")
rep("""    // The ends of the hovered flows, drawn again at 1.9 times the size over the map's""",
"""    // The ends of the hovered or selected flows, drawn again at 1.35 times the size over the map's""")

# ---- picking: one invisible band per flow, nearest flow wins, sticky, slow to let go ---
a = s.index("        // Hover and click work on the network: a stretch carries the ids of its flows.")
b = s.index("        if (!flowBound) {", a)
s = s[:a] + r"""        // Picking works on an invisible 14 px band along each flow's own route.
        if (!map.getLayer('flow-hit')) map.addLayer({ id: 'flow-hit', type: 'line', source: 'flows',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 } }, before);
""" + s[b:]

rep("""        if (!flowBound) {
            flowBound = true;
            let t = null;""",
"""        if (!flowBound) {
            flowBound = true;
            bindFlowPicking();
            let t = null;""")

rep("""    function hotFlow(id) {""",
"""    // Distance in pixels from the pointer to a flow's line on screen.
    function pxToLine(pt, coords) {
        let best = Infinity, prev = null;
        coords.forEach(c => {
            const q = map.project(c);
            if (prev) {
                const dx = q.x - prev.x, dy = q.y - prev.y, l2 = dx * dx + dy * dy;
                let k = l2 ? ((pt.x - prev.x) * dx + (pt.y - prev.y) * dy) / l2 : 0;
                k = Math.max(0, Math.min(1, k));
                best = Math.min(best, Math.hypot(pt.x - (prev.x + k * dx), pt.y - (prev.y + k * dy)));
            }
            prev = q;
        });
        return best;
    }
    // The flow under the pointer: none if a site symbol is there (the site comes first);
    // the flow already hot if it is still under the pointer; otherwise the nearest.
    function flowAt(pt) {
        if (!map.getLayer('flow-hit') || map.getLayoutProperty('flow-hit', 'visibility') === 'none') return null;
        const box = [[pt.x - 7, pt.y - 7], [pt.x + 7, pt.y + 7]];
        const onSite = map.getLayer('site-sym') && map.queryRenderedFeatures(box, { layers: ['site-sym'] }).length;
        if (onSite) return null;
        const ids = [...new Set(map.queryRenderedFeatures(box, { layers: ['flow-hit'] }).map(f => f.properties.fid))]
            .filter(id => { const f = allFlows.find(x => x.FlowUID === id); return f && flowShown(f); });
        if (!ids.length) return null;
        if (hotFlowId && ids.includes(hotFlowId)) return hotFlowId;
        let best = null, bd = Infinity;
        ids.forEach(id => {
            const f = allFlows.find(x => x.FlowUID === id); if (!f) return;
            const d = pxToLine(pt, flowPath(f));
            if (d < bd) { bd = d; best = id; }
        });
        return best;
    }
    function bindFlowPicking() {
        let leaveT = null;
        map.on('mousemove', e => {
            if (!flowsReady || toolBusy()) return;
            const id = flowAt(e.point);
            if (id) {
                clearTimeout(leaveT); leaveT = null;
                map.getCanvas().style.cursor = 'pointer';
                if (id !== hotFlowId) {
                    hotFlow(id);
                    const f = allFlows.find(x => x.FlowUID === id);
                    if (f) updateStatus(f.__fromName + ' → ' + f.__toName);
                }
            } else if (hotFlowId && !leaveT) {
                // let go only after a short pause, so a pointer that slips off the line
                // for a moment does not drop the flow
                leaveT = setTimeout(() => {
                    leaveT = null;
                    map.getCanvas().style.cursor = '';
                    hotFlow(null);
                }, 180);
            }
        });
        map.on('click', e => {
            if (!flowsReady || toolBusy() || (e.originalEvent && e.originalEvent.__handled)) return;
            const id = flowAt(e.point);
            if (id) {
                if (e.originalEvent) e.originalEvent.__handled = true;
                const f = allFlows.find(x => x.FlowUID === id);
                if (!f) return;
                if (deckScope !== 'flow') selectTab('flow');
                if (deckSize === 'closed') setDeckSize('half');
                frameFlow(f);
            } else if (selFlowId) {
                selectFlow(null);
            }
        });
    }
    // A clicked flow stays selected: its line lifted, its two ends enlarged.
    function selectFlow(id) {
        if ((id || null) === selFlowId) return;
        selFlowId = id || null;
        if (deckScope === 'flow') {
            deckBody.querySelectorAll('tr.flow-sel').forEach(r => r.classList.remove('flow-sel'));
            if (selFlowId) {
                const r = deckBody.querySelector('tr[data-flow="' + CSS.escape(selFlowId) + '"]');
                if (r) r.classList.add('flow-sel');
            }
        }
        if (typeof hotFlowId !== 'undefined') paintFlows();
    }

    function hotFlow(id) {""")

# frameFlow: select instead of a passing hover
rep("""    function frameFlow(f, fromRow) {
        hotFlow(f.FlowUID);""",
"""    function frameFlow(f, fromRow) {
        selectFlow(f.FlowUID);""")

# a site picked, or another tab: the selected flow lets go
rep("""    function focusFlows(uid) {
        flowFocus = uid || null;""",
"""    function focusFlows(uid) {
        flowFocus = uid || null;
        if (uid) selFlowId = null;""")
rep("""            FLOW_LAYERS.concat(['flow-end-sym']).forEach(id => {""",
"""            if (!mine) selFlowId = null;
            FLOW_LAYERS.concat(['flow-end-sym', 'flow-hit']).forEach(id => {""")

# the selected row reads as selected in the table
rep("""#site-table tbody tr:hover td,#site-table tbody tr.hot td{background:#fafafa}""",
"""#site-table tbody tr:hover td,#site-table tbody tr.hot td{background:#fafafa}
#site-table tbody tr.flow-sel td{background:#f2f2f2}""")

open(P, 'w', encoding='utf-8').write(s)
print('patched')
