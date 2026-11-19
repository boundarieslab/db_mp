# One look for every flow (19.11.2026).
#   - Every flow follows its truck route (data/flow_routes.geojson); a road used by several
#     flows is one line (data/flow_net.geojson), a little heavier for each flow on it.
#   - One colour, white. Line treatment is the evidence: solid = received (or under way),
#     dashed = designated in a plan or a contract, dotted = by barge (sea legs drawn straight).
#   - A small head at every receiver, always drawn.
#   - Opening a site lifts its own flows along their own routes; everything else falls back.
#   - No arcs, no width from volume (the volumes mix tonnes, pfm3 and blanks), no colour ramp.
# Usage: python tools/patch_flows_harmonize.py index.html
import sys, re
P = sys.argv[1]
s = open(P, encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    c = s.count(a)
    if c != n: raise SystemExit(f'expected {n} match(es), found {c}: {a[:90]!r}')
    s = s.replace(a, b)

# ---- CSS: the line samples in the key and the table --------------------------------
rep('''/* ---------- flows: the fourth sheet ---------- */
/* Evidence is drawn, not coloured: a documented edge is a solid black
   line, a structural one is dotted, a modelled one a faint dash. A
   modelled arc must never be able to pass for a receipt. */
#tab-flow{--tabc:#111}
.ev{display:inline-block;width:22px;height:0;vertical-align:middle;margin-right:7px;
    border-top:1.5px solid #111}
.ev.structural{border-top-style:dotted}
.ev.modelled{border-top:1px dashed var(--sub)}''',
'''/* ---------- flows: the fourth sheet ---------- */
/* Evidence is drawn, not coloured, the same way on the map and here:
   solid = received, dashed = designated in a plan or a contract,
   dotted = carried by barge. */
#tab-flow{--tabc:#111}
.ev{display:inline-block;width:22px;height:0;vertical-align:middle;margin-right:7px;
    border-top:1.5px solid #111}
.ev.designated{border-top-style:dashed}
.ev.sea{border-top-style:dotted;border-top-width:2px}''')

# ---- the key ------------------------------------------------------------------------
rep('''<div class="kr"><span class="ev"></span><span data-en="Flow, documented" data-no="Strøm, dokumentert">Flow, documented</span><span class="ct" data-flow-ct="evidenced"></span></div>
                        <div class="kr"><span class="ev structural"></span><span data-en="Flow, shared ownership" data-no="Strøm, felles eierskap">Flow, shared ownership</span><span class="ct" data-flow-ct="structural"></span></div>''',
'''<div class="kr"><span class="ev"></span><span data-en="Flow, received" data-no="Strøm, mottatt">Flow, received</span><span class="ct" data-flow-ct="received"></span></div>
                        <div class="kr"><span class="ev designated"></span><span data-en="Flow, designated in a plan or contract" data-no="Strøm, angitt i plan eller kontrakt">Flow, designated in a plan or contract</span><span class="ct" data-flow-ct="designated"></span></div>
                        <div class="kr"><span class="ev sea"></span><span data-en="Leg by barge" data-no="Strekning med lekter">Leg by barge</span><span class="ct" data-flow-ct="sea"></span></div>''')

# ---- classes ------------------------------------------------------------------------
rep('''    const FLOW_CLASSES = [
        { k: 'evidenced',  en: 'documented',       no: 'dokumentert' },
        { k: 'structural', en: 'shared ownership', no: 'felles eierskap' },
        { k: 'modelled',   en: 'modelled',         no: 'modellert' }
    ];''',
'''    const FLOW_CLASSES = [
        { k: 'received',   en: 'received',                         no: 'mottatt' },
        { k: 'designated', en: 'designated in a plan or contract', no: 'angitt i plan eller kontrakt' }
    ];''')
rep("        flow:     { on: true, cls: new Set(['evidenced', 'structural', 'modelled']) },",
    "        flow:     { on: true, cls: new Set(['received', 'designated']) },")
rep('''        ev_evidenced: { en: "documented", no: "dokumentert" },
        ev_structural: { en: "shared ownership", no: "felles eierskap" },
        ev_modelled: { en: "modelled", no: "modellert" },''',
'''        ev_received: { en: "received", no: "mottatt" },
        ev_designated: { en: "designated in a plan or contract", no: "angitt i plan eller kontrakt" },
        ev_modelled: { en: "modelled", no: "modellert" },
        ev_sea: { en: "by barge", no: "med lekter" },''')

# ---- table column: the line sample and the class -----------------------------------
rep('''          text: f => t('ev_' + f.__ev),
          html: f => `<span class="ev ${f.__ev}"></span>${esc(t('ev_' + f.__ev))}`,
          sort: f => ['evidenced', 'structural', 'modelled'].indexOf(f.__ev) },''',
'''          text: f => outcomeWord(f) + (flowSea(f) ? ', ' + t('ev_sea') : ''),
          html: f => `<span class="ev ${flowSea(f) ? 'sea' : f.__ev}"></span>${esc(outcomeWord(f))}`
                     + (flowSea(f) ? ', ' + esc(t('ev_sea')) : ''),
          sort: f => ['received', 'designated', 'modelled'].indexOf(f.__ev) },''')
# The outcome is now said in the evidence column, with its line sample; the separate
# OUTCOME column went.
rep('''        { key: 'Outcome', nophone: true, th: 'th_outcome', w: 150, filter: true,
          text: f => { const o = String(f.Outcome || '').trim().toLowerCase(); return OUTCOME_W[o] ? t(OUTCOME_W[o]) : (f.Outcome || ''); } },
''', '')
rep('''    const OUTCOME_W = { 'received': 'oc_received', 'in progress': 'oc_progress', 'designated': 'oc_designated' };''',
'''    const OUTCOME_W = { 'received': 'oc_received', 'in progress': 'oc_progress', 'designated': 'oc_designated',
                        'contracted': 'oc_contracted' };
    const outcomeWord = f => { const o = String(f.Outcome || '').trim().toLowerCase(); return OUTCOME_W[o] ? t(OUTCOME_W[o]) : (f.Outcome || ''); };''')
rep('''        oc_designated: { en: "designated in a plan", no: "angitt i plan" },''',
'''        oc_designated: { en: "designated in a plan", no: "angitt i plan" },
        oc_contracted: { en: "contracted", no: "avtalt" },''')

# ---- the evidence class of a flow ----------------------------------------------------
rep('''    const FLOW_LAYERS = ['flow-modelled', 'flow-structural', 'flow-evidenced'];
    const EV_KEYS = ['evidenced', 'structural', 'modelled'];
    const evOf = f => {
        const v = String(f.EvidenceClass || '').trim().toLowerCase();
        return EV_KEYS.indexOf(v) >= 0 ? v : 'modelled';
    };''',
'''    // Line treatment follows what the source records. A delivery on record, or one
    // under way, is drawn solid; a receiver named in a plan, a permit application or a
    // contract is drawn dashed. A modelled edge is never drawn.
    const evOf = f => {
        if (String(f.EvidenceClass || '').trim().toLowerCase() !== 'evidenced') return 'modelled';
        const o = String(f.Outcome || '').trim().toLowerCase();
        return /receiv|progress|under way|pågår|mottatt/.test(o) ? 'received' : 'designated';
    };
    const flowSea = f => { const r = flowRoute[f.FlowUID]; return !!(r && r.mode === 'sea'); };''')

# ---- drawing: replace the arc field with routes, one network and heads ---------------
a = s.index('    // Every arc humps toward the top of the frame, whichever way the mass is')
b = s.index('    function frameFlow(f, fromRow) {')
s = s[:a] + r'''    // Every flow follows its truck route. A road used by several flows is drawn once
    // (data/flow_net.geojson, tools/route_flows.py), a little heavier for each flow on
    // it. One colour; line treatment carries the evidence. Opening a site lifts its own
    // flows along their own routes and lets the rest fall back.
    const DEG_LAT = 110540, DEG_LON = 111320;
    let flowFocus = null, flowBound = false, flowNet = null;

    function mPerPx(lat) {
        return 40075016.686 * Math.abs(Math.cos(lat * Math.PI / 180)) /
               (512 * Math.pow(2, map.getZoom()));
    }
    function frame(lat0) {
        const kx = DEG_LON * Math.cos(lat0 * Math.PI / 180) || DEG_LON;
        return { to: p => [p[0] * kx, p[1] * DEG_LAT],
                 back: p => [p[0] / kx, p[1] / DEG_LAT] };
    }
    const endsOf = f => [[num(f.__from.Longitude), num(f.__from.Latitude)],
                         [num(f.__to.Longitude),   num(f.__to.Latitude)]];
    // A flow with no computed route is drawn straight between its ends, never as an
    // arc: the route script has to be rerun for it (tools/route_flows.py).
    function flowPath(f) {
        const r = flowRoute[f.FlowUID];
        if (r && r.coords.length > 1) return r.coords;
        return endsOf(f);
    }
    const flowShown = f => f.__xy && flowPasses(f);

    // Every drawn flow, on its own route: the layer a pick or a hover lifts.
    function flowFeatures() {
        return { type: 'FeatureCollection', features: allFlows.filter(f => f.__xy).map(f => ({
            type: 'Feature', id: f.FlowUID,
            geometry: { type: 'LineString', coordinates: flowPath(f) },
            properties: { fid: f.FlowUID, ev: f.__ev, sea: flowSea(f) ? 1 : 0,
                          from: f.FromUID, to: f.ToUID,
                          lbl: f.__fromName + ' → ' + f.__toName } })) };
    }

    // The network at rest: each stretch counts only the flows switched on. A stretch
    // with a received flow on it is solid.
    function netFeatures() {
        const on = new Map(allFlows.filter(flowShown).map(f => [f.FlowUID, f]));
        const out = [], covered = new Set();
        ((flowNet && flowNet.features) || []).forEach(ft => {
            const ids = String(ft.properties.fids || '').split(',').filter(id => on.has(id));
            ids.forEach(id => covered.add(id));
            if (!ids.length) return;
            out.push({ type: 'Feature', geometry: ft.geometry,
                properties: { n: ids.length, fids: ids.join(','), sea: ft.properties.mode === 'sea' ? 1 : 0,
                              solid: ids.some(id => on.get(id).__ev === 'received') ? 1 : 0 } });
        });
        // Flows the network file does not carry yet: their own path, one stretch each.
        on.forEach((f, id) => {
            if (covered.has(id)) return;
            out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: flowPath(f) },
                properties: { n: 1, fids: id, sea: flowSea(f) ? 1 : 0, solid: f.__ev === 'received' ? 1 : 0 } });
        });
        return { type: 'FeatureCollection', features: out };
    }

    // A small head at every receiver, pointing along the last stretch. Drawn for every
    // flow shown: flows into one receiver share their last stretch, so the heads coincide.
    function headFeatures() {
        const seen = new Set();
        return { type: 'FeatureCollection', features: allFlows.filter(flowShown).map(f => {
            const path = flowPath(f), b = path[path.length - 1];
            const g = frame(b[1]), pts = path.map(g.to);
            const q = pts[pts.length - 1];
            let k = pts.length - 2;
            while (k > 0 && Math.hypot(q[0] - pts[k][0], q[1] - pts[k][1]) < 1) k--;
            const o = pts[k];
            let tx = q[0] - o[0], ty = q[1] - o[1];
            const t = Math.hypot(tx, ty) || 1; tx /= t; ty /= t;
            const mp = mPerPx(b[1]), sz = 9 * mp, hw = sz * 0.5;
            // The tip stops short of the site symbol so the two do not overlap.
            const tip = [q[0] - tx * 7 * mp, q[1] - ty * 7 * mp];
            const key = f.ToUID + ':' + Math.round(Math.atan2(ty, tx) * 20);
            if (seen.has(key)) return null;
            seen.add(key);
            const ring = [
                g.back([tip[0] - tx*sz - ty*hw, tip[1] - ty*sz + tx*hw]),
                g.back(tip),
                g.back([tip[0] - tx*sz + ty*hw, tip[1] - ty*sz - tx*hw])
            ];
            ring.push(ring[0]);
            return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] },
                     properties: { to: f.ToUID, fid: f.FlowUID } };
        }).filter(Boolean) };
    }

    // Width: 1.2 px for one flow, 0.8 px more for each further flow on the road.
    const NET_W = ['+', 0.4, ['*', 0.8, ['get', 'n']]];
    const PICK_W = 2.6;
    const FLOW_LAYERS = ['flow-net-cas', 'flow-net-solid', 'flow-net-dash', 'flow-net-sea',
                         'flow-pick-cas', 'flow-pick-solid', 'flow-pick-dash', 'flow-pick-sea', 'flow-head'];
    const NET_IDS = ['flow-net-solid', 'flow-net-dash', 'flow-net-sea'];
    const PICK_IDS = ['flow-pick-solid', 'flow-pick-dash', 'flow-pick-sea'];
    const pickedIds = () => {
        const ids = new Set();
        if (flowFocus) allFlows.forEach(f => { if (flowShown(f) && (f.FromUID === flowFocus || f.ToUID === flowFocus)) ids.add(f.FlowUID); });
        if (hotFlowId) ids.add(hotFlowId);
        return [...ids];
    };

    function paintFlows() {
        if (!flowsReady) return;
        const ids = pickedIds(), lifted = ids.length > 0;
        const inPick = ['in', ['get', 'fid'], ['literal', ids]];
        PICK_IDS.concat(['flow-pick-cas']).forEach(id => {
            if (!map.getLayer(id)) return;
            const base = id === 'flow-pick-solid' ? ['all', ['==', ['get', 'sea'], 0], ['==', ['get', 'ev'], 'received']]
                       : id === 'flow-pick-dash'  ? ['all', ['==', ['get', 'sea'], 0], ['!=', ['get', 'ev'], 'received']]
                       : id === 'flow-pick-sea'   ? ['==', ['get', 'sea'], 1] : true;
            map.setFilter(id, ['all', base, inPick]);
        });
        NET_IDS.forEach(id => { if (map.getLayer(id)) map.setPaintProperty(id, 'line-opacity', lifted ? 0.28 : 0.95); });
        if (map.getLayer('flow-net-cas')) map.setPaintProperty('flow-net-cas', 'line-opacity', lifted ? 0.10 : 0.45);
        if (map.getLayer('flow-head')) map.setPaintProperty('flow-head', 'fill-opacity', lifted ? 0.45 : 1);
    }

    function focusFlows(uid) {
        flowFocus = uid || null;
        paintFlows();
    }

    function refreshFlowSources() {
        const n = map.getSource('flownet'), h = map.getSource('flowheads');
        if (n) n.setData(netFeatures());
        if (h) h.setData(headFeatures());
    }

    function ensureFlowLayers() {
        if (!map.getSource('flows')) map.addSource('flows', { type: 'geojson', data: flowFeatures(), promoteId: 'fid' });
        else map.getSource('flows').setData(flowFeatures());
        if (!map.getSource('flownet')) map.addSource('flownet', { type: 'geojson', data: netFeatures() });
        if (!map.getSource('flowheads')) map.addSource('flowheads', { type: 'geojson', data: headFeatures() });
        const before = under(['site-hot', 'site-sym', 'prof-line']);
        const L = (id, src, filter, paint, layout) => { if (!map.getLayer(id))
            map.addLayer(Object.assign({ id: id, type: 'line', source: src, paint: paint,
                layout: Object.assign({ 'line-join': 'round', 'line-cap': 'butt' }, layout || {}) },
                filter ? { filter: filter } : {}), before); };
        // At rest: the network.
        L('flow-net-cas', 'flownet', ['==', ['get', 'sea'], 0],
          { 'line-color': '#0e0e0b', 'line-opacity': 0.45, 'line-width': ['+', NET_W, 1.6] });
        L('flow-net-solid', 'flownet', ['all', ['==', ['get', 'sea'], 0], ['==', ['get', 'solid'], 1]],
          { 'line-color': '#ffffff', 'line-opacity': 0.95, 'line-width': NET_W });
        L('flow-net-dash', 'flownet', ['all', ['==', ['get', 'sea'], 0], ['==', ['get', 'solid'], 0]],
          { 'line-color': '#ffffff', 'line-opacity': 0.95, 'line-width': NET_W, 'line-dasharray': [3, 2] });
        L('flow-net-sea', 'flownet', ['==', ['get', 'sea'], 1],
          { 'line-color': '#ffffff', 'line-opacity': 0.95, 'line-width': 1.8, 'line-dasharray': [0.1, 2.4] },
          { 'line-cap': 'round' });
        // Lifted: the picked site's flows (or the hovered one) on their own routes.
        L('flow-pick-cas', 'flows', ['==', ['get', 'fid'], ''],
          { 'line-color': '#0e0e0b', 'line-opacity': 0.55, 'line-width': PICK_W + 2 });
        L('flow-pick-solid', 'flows', ['==', ['get', 'fid'], ''],
          { 'line-color': '#ffffff', 'line-width': PICK_W });
        L('flow-pick-dash', 'flows', ['==', ['get', 'fid'], ''],
          { 'line-color': '#ffffff', 'line-width': PICK_W, 'line-dasharray': [3, 2] });
        L('flow-pick-sea', 'flows', ['==', ['get', 'fid'], ''],
          { 'line-color': '#ffffff', 'line-width': 2.4, 'line-dasharray': [0.1, 2.2] }, { 'line-cap': 'round' });
        if (!map.getLayer('flow-head')) {
            map.addLayer({ id: 'flow-head', type: 'fill', source: 'flowheads',
                paint: { 'fill-color': '#ffffff', 'fill-opacity': 1,
                         'fill-outline-color': 'rgba(14,14,11,0.7)' } }, before);
        }
        // Hover and click work on the network: a stretch carries the ids of its flows.
        const fidAt = e => { const ft = e.features && e.features[0]; if (!ft) return null;
            return ft.properties.fid || String(ft.properties.fids || '').split(',')[0] || null; };
        NET_IDS.concat(PICK_IDS).forEach(id => {
            map.on('mousemove', id, e => {
                if (toolBusy()) return;
                const fid = fidAt(e); if (!fid) return;
                map.getCanvas().style.cursor = 'pointer';
                hotFlow(fid);
                const f = allFlows.find(x => x.FlowUID === fid);
                if (f) updateStatus(f.__fromName + ' → ' + f.__toName);
            });
            map.on('mouseleave', id, () => {
                if (!toolBusy()) map.getCanvas().style.cursor = '';
                hotFlow(null);
            });
            map.on('click', id, e => {
                if (toolBusy()) return;
                const f = allFlows.find(x => x.FlowUID === fidAt(e));
                if (!f) return;
                if (deckScope !== 'flow') selectTab('flow');
                if (deckSize === 'closed') setDeckSize('half');
                frameFlow(f);
            });
        });
        if (!flowBound) {
            flowBound = true;
            let t = null;
            map.on('zoomend', () => {
                clearTimeout(t);
                t = setTimeout(() => {
                    const src = flowsReady && map.getSource('flowheads');
                    if (src) src.setData(headFeatures());
                }, 90);
            });
        }
        flowsReady = true;
        applyFlowFilter();
    }

    function hotFlow(id) {
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
    }

''' + s[b:]

# the old hotFlow (now duplicated after frameFlow? no: it sat before frameFlow and was cut)
# ---- applyFlowFilter: the network is rebuilt from what is switched on ----------------
rep('''        if (flowsReady) {
            FLOW_LAYERS.forEach(id => {
                const ev = id.replace('flow-', '');
                const on = show.flow.on && mine && show.flow.cls.has(ev);
                [id, id + '-cas'].forEach(k => {
                    if (map.getLayer(k)) map.setLayoutProperty(k, 'visibility', on ? 'visible' : 'none');
                });
            });
            if (map.getLayer('flow-head')) {
                map.setLayoutProperty('flow-head', 'visibility',
                                      show.flow.on && mine ? 'visible' : 'none');
            }
        }''',
'''        if (flowsReady) {
            FLOW_LAYERS.forEach(id => {
                if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', show.flow.on && mine ? 'visible' : 'none');
            });
            refreshFlowSources();
            paintFlows();
        }''')

rep('''        document.querySelectorAll('[data-flow-ct]').forEach(el => {
            const n = allFlows.filter(f => f.__ev === el.dataset.flowCt).length;
            el.textContent = n || '';
        });''',
'''        document.querySelectorAll('[data-flow-ct]').forEach(el => {
            const k = el.dataset.flowCt;
            const n = allFlows.filter(f => k === 'sea' ? flowSea(f) : f.__ev === k).length;
            el.textContent = n || '';
        });''')

# ---- loading: routes and the network ----------------------------------------------
rep('''    const FLOW_ROUTES = 'data/flow_routes.geojson';''',
'''    const FLOW_ROUTES = 'data/flow_routes.geojson';
    // The routes merged into one network: a road used by several flows is one line.
    const FLOW_NET = 'data/flow_net.geojson';''')
rep('''        Promise.all([parseCsv(FLOWS_CSV),
                     fetch(FLOW_ROUTES).then(x => x.ok ? x.json() : null).catch(() => null)]).then(([r, routes]) => {''',
'''        Promise.all([parseCsv(FLOWS_CSV),
                     fetch(FLOW_ROUTES).then(x => x.ok ? x.json() : null).catch(() => null),
                     fetch(FLOW_NET).then(x => x.ok ? x.json() : null).catch(() => null)]).then(([r, routes, net]) => {
            flowNet = net;''')
rep("// (tools/route_flows.py). A flow with no route, or a sea leg, is drawn as an arc.",
    "// (tools/route_flows.py). A sea leg is straight; a flow with no route yet is drawn straight too.")

open(P, 'w', encoding='utf-8').write(s)
print('patched')
