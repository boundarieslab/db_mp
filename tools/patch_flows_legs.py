# Flows with a road leg and a barge leg (19.11.2026): e.g. Ring 1 -> truck to Grønlikaia ->
# boat to NOAH Langøya. data/flow_routes.geojson carries `sea_from`, the index of the first
# point of the sea leg; the flow is drawn as two pieces, solid/dashed then dotted.
# Applied after tools/patch_flows_harmonize.py.  Usage: python tools/patch_flows_legs.py index.html
import sys
P = sys.argv[1]
s = open(P, encoding='utf-8').read()
def rep(a, b):
    global s
    if s.count(a) != 1: raise SystemExit('expected one match: ' + a[:80])
    s = s.replace(a, b)

rep("""    const flowSea = f => { const r = flowRoute[f.FlowUID]; return !!(r && r.mode === 'sea'); };""",
"""    // A flow with any leg by barge says so in the table; a flow that is only a barge leg
    // is drawn dotted all through.
    const flowSea = f => { const r = flowRoute[f.FlowUID]; return !!(r && /sea/.test(r.mode || '')); };""")

rep("""    function flowFeatures() {
        return { type: 'FeatureCollection', features: allFlows.filter(f => f.__xy).map(f => ({
            type: 'Feature', id: f.FlowUID,
            geometry: { type: 'LineString', coordinates: flowPath(f) },
            properties: { fid: f.FlowUID, ev: f.__ev, sea: flowSea(f) ? 1 : 0,
                          from: f.FromUID, to: f.ToUID,
                          lbl: f.__fromName + ' → ' + f.__toName } })) };
    }""",
"""    function flowFeatures() {
        const out = [];
        allFlows.filter(f => f.__xy).forEach(f => {
            const r = flowRoute[f.FlowUID], path = flowPath(f);
            const props = sea => ({ fid: f.FlowUID, ev: f.__ev, sea: sea, from: f.FromUID, to: f.ToUID,
                                    lbl: f.__fromName + ' → ' + f.__toName });
            const k = r && r.seaFrom > 0 && r.seaFrom < path.length - 1 ? r.seaFrom : -1;
            if (k > 0) {
                out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: path.slice(0, k + 1) }, properties: props(0) });
                out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: path.slice(k) }, properties: props(1) });
            } else {
                out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: path },
                           properties: props(r && r.mode === 'sea' ? 1 : 0) });
            }
        });
        return { type: 'FeatureCollection', features: out };
    }""")

rep("""                if (p.fid && ft.geometry) flowRoute[p.fid] = { mode: p.mode, km: p.km, coords: ft.geometry.coordinates };""",
"""                if (p.fid && ft.geometry) flowRoute[p.fid] = { mode: p.mode, km: p.km, seaFrom: p.sea_from || 0, coords: ft.geometry.coordinates };""")
open(P, 'w', encoding='utf-8').write(s)
print('patched')
