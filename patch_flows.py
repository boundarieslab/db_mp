import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in s
if crlf: s = s.replace('\r\n', '\n')

a0 = "    // Straight, hard-ended, stepped: a flow is a statement that two places are"
a1 = "        flowsReady = true;"
i = s.index(a0); j = s.index(a1, i)
j = s.index("\n    }\n", j) + len("\n    }\n")

NEW = r'''    // Every arc humps toward the top of the frame, whichever way the mass is
    // travelling, so the hollow of every curve faces the same way and the field
    // reads as one web rather than a tangle of opposing bows.
    //
    // At rest the whole field is one weight: a white hairline says only that two
    // places are connected. Weight is what the click buys. Open a site and its
    // own flows take their width from the volume and grow a head, while
    // everything else falls back.
    const DEG_LAT = 110540, DEG_LON = 111320;
    let flowFocus = null, flowBound = false, flowMaxV = 1;

    const FLOW_MAT = { rock: '#2a6fd6', soil: '#a06a2c', contam: '#B300FF', other: '#8b8a84' };
    const matOf = f => {
        const m = String(f.MassType || '').toLowerCase();
        if (/contamin|forurens/.test(m))              return 'contam';
        if (/rock|stein|fjell|sprengt/.test(m))       return 'rock';
        if (/soil|clay|jord|leire|silt/.test(m))      return 'soil';
        return 'other';
    };

    function mPerPx(lat) {
        return 40075016.686 * Math.abs(Math.cos(lat * Math.PI / 180)) /
               (512 * Math.pow(2, map.getZoom()));
    }
    function frame(lat0) {
        const kx = DEG_LON * Math.cos(lat0 * Math.PI / 180) || DEG_LON;
        return { to: p => [p[0] * kx, p[1] * DEG_LAT],
                 back: p => [p[0] / kx, p[1] / DEG_LAT] };
    }
    function arcPts(a, b, N) {
        const f = frame((a[1] + b[1]) / 2), A = f.to(a), B = f.to(b);
        const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1;
        let nx = -dy / L, ny = dx / L;
        if (ny < 0) { nx = -nx; ny = -ny; }
        if (Math.abs(ny) < 0.15) nx = Math.abs(nx) || 1;
        const off = L * 0.20;
        const cx = (A[0] + B[0]) / 2 + nx * off, cy = (A[1] + B[1]) / 2 + ny * off;
        const pts = [];
        for (let i = 0; i <= N; i++) {
            const s = i / N, u = 1 - s;
            pts.push([u*u*A[0] + 2*u*s*cx + s*s*B[0], u*u*A[1] + 2*u*s*cy + s*s*B[1]]);
        }
        return { pts: pts, back: f.back };
    }
    function arc(a, b) { const g = arcPts(a, b, 34); return g.pts.map(g.back); }

    function flowFeatures() {
        const drawn = allFlows.filter(f => f.__xy);
        flowMaxV = drawn.reduce((m, f) => Math.max(m, qty(f.Volume_m3) || 0), 1);
        return { type: 'FeatureCollection', features: drawn.map(f => ({
            type: 'Feature', id: f.FlowUID,
            geometry: { type: 'LineString', coordinates: arc(
                [num(f.__from.Longitude), num(f.__from.Latitude)],
                [num(f.__to.Longitude),   num(f.__to.Latitude)]) },
            properties: { fid: f.FlowUID, ev: f.__ev, mat: matOf(f),
                          v: qty(f.Volume_m3) || 0, from: f.FromUID, to: f.ToUID,
                          lbl: f.__fromName + ' → ' + f.__toName } })) };
    }

    // Heads belong to the opened site alone. Drawn for the whole field they
    // collide into a smear at every busy receiver.
    function headFeatures() {
        if (!flowFocus) return { type: 'FeatureCollection', features: [] };
        const mine = allFlows.filter(f => f.__xy &&
            (f.FromUID === flowFocus || f.ToUID === flowFocus));
        return { type: 'FeatureCollection', features: mine.map(f => {
            const a = [num(f.__from.Longitude), num(f.__from.Latitude)];
            const b = [num(f.__to.Longitude),   num(f.__to.Latitude)];
            const g = arcPts(a, b, 34), pts = g.pts;
            const q = pts[pts.length - 1], o = pts[pts.length - 2];
            let tx = q[0] - o[0], ty = q[1] - o[1];
            const t = Math.hypot(tx, ty) || 1; tx /= t; ty /= t;
            const v = qty(f.Volume_m3) || 0;
            const px = Math.max(7, Math.min(22, 6 + 16 * Math.sqrt(v / (flowMaxV || 1))));
            const sz = px * mPerPx(b[1]), hw = sz * 0.55;
            const ring = [
                g.back([q[0] - tx*sz - ty*hw, q[1] - ty*sz + tx*hw]),
                g.back([q[0], q[1]]),
                g.back([q[0] - tx*sz + ty*hw, q[1] - ty*sz - tx*hw])
            ];
            ring.push(ring[0]);
            return { type: 'Feature', id: f.FlowUID,
                geometry: { type: 'Polygon', coordinates: [ring] },
                properties: { fid: f.FlowUID, ev: f.__ev, mat: matOf(f), v: v } };
        }) };
    }

    // Five classes: 50k, 200k, 600k, 1.5M cubic metres.
    const W_STEP = ['step', ['get', 'v'], 1.8, 50000, 3.2, 200000, 5.4, 600000, 8.4, 1500000, 13.0];
    const V_STEP = ['step', ['get', 'v'],
                    '#93a0ac', 50000, '#bcc8d2', 200000, '#dde5eb',
                    600000, '#f2f6f8', 1500000, '#ffffff'];
    const V_COL  = ['case', ['==', ['get', 'mat'], 'contam'], FLOW_MAT.contam, V_STEP];
    const REST_W = 0.9, REST_CASE = 2.2;
    const FLOW_SPEC = {
        'flow-modelled':   { ev: 'modelled'   },
        'flow-structural': { ev: 'structural' },
        'flow-evidenced':  { ev: 'evidenced'  }
    };
    const isMine = () => ['any', ['==', ['get', 'from'], flowFocus],
                                 ['==', ['get', 'to'], flowFocus]];

    function paintFlows() {
        const on = !!flowFocus;
        FLOW_LAYERS.forEach(id => {
            if (!map.getLayer(id)) return;
            const m = on ? isMine() : null;
            map.setPaintProperty(id, 'line-width',
                on ? ['case', m, W_STEP, 0.7] : REST_W);
            map.setPaintProperty(id, 'line-color',
                on ? ['case', m, V_COL, '#ffffff'] : '#ffffff');
            map.setPaintProperty(id, 'line-opacity',
                on ? ['case', m, 1, 0.12] : 0.62);
            const c = id + '-cas';
            if (!map.getLayer(c)) return;
            map.setPaintProperty(c, 'line-width',
                on ? ['case', m, ['+', W_STEP, 2.6], 0.7] : REST_CASE);
            map.setPaintProperty(c, 'line-opacity',
                on ? ['case', m, 0.55, 0.06] : 0.40);
        });
    }

    function focusFlows(uid) {
        flowFocus = uid || null;
        if (!flowsReady) return;
        paintFlows();
        const src = map.getSource('flowheads');
        if (src) src.setData(headFeatures());
    }

    function ensureFlowLayers() {
        if (!map.getSource('flows')) {
            map.addSource('flows', { type: 'geojson', data: flowFeatures(), promoteId: 'fid' });
        } else {
            map.getSource('flows').setData(flowFeatures());
        }
        if (!map.getSource('flowheads')) {
            map.addSource('flowheads', { type: 'geojson', data: headFeatures(), promoteId: 'fid' });
        }
        const before = under(['site-hot', 'site-sym', 'prof-line']);
        FLOW_LAYERS.forEach(id => {
            if (map.getLayer(id)) return;
            const s = FLOW_SPEC[id];
            const lay = () => ({ 'line-join': 'round', 'line-cap': 'butt' });
            map.addLayer({ id: id + '-cas', type: 'line', source: 'flows',
                filter: ['==', ['get', 'ev'], s.ev], layout: lay(),
                paint: { 'line-color': '#0e0e0b', 'line-opacity': 0.40,
                         'line-width': REST_CASE } }, before);
            map.addLayer({ id: id, type: 'line', source: 'flows',
                filter: ['==', ['get', 'ev'], s.ev], layout: lay(),
                paint: { 'line-color': '#ffffff', 'line-opacity': 0.62,
                         'line-width': REST_W } }, before);
            map.on('mousemove', id, e => {
                if (toolBusy() || !e.features || !e.features.length) return;
                map.getCanvas().style.cursor = 'pointer';
                hotFlow(e.features[0].properties.fid);
                updateStatus(e.features[0].properties.lbl);
            });
            map.on('mouseleave', id, () => {
                if (!toolBusy()) map.getCanvas().style.cursor = '';
                hotFlow(null);
            });
            map.on('click', id, e => {
                if (toolBusy() || !e.features || !e.features.length) return;
                const f = allFlows.find(x => x.FlowUID === e.features[0].properties.fid);
                if (!f) return;
                if (deckScope !== 'flow') selectTab('flow');
                if (deckSize === 'closed') setDeckSize('half');
                frameFlow(f);
            });
        });
        if (!map.getLayer('flow-head')) {
            map.addLayer({ id: 'flow-head', type: 'fill', source: 'flowheads',
                paint: { 'fill-color': V_COL, 'fill-opacity': 0.98,
                         'fill-outline-color': 'rgba(14,14,11,0.55)' } }, before);
        }
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
        paintFlows();
        applyFlowFilter();
    }
'''
s = s[:i] + NEW + s[j:]

old = """            FLOW_LAYERS.forEach(id => {
                if (!map.getLayer(id)) return;
                const ev = id.replace('flow-', '');
                const on = show.flow.on && show.flow.cls.has(ev);
                map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
            });"""
assert s.count(old) == 1
s = s.replace(old, """            FLOW_LAYERS.forEach(id => {
                const ev = id.replace('flow-', '');
                const on = show.flow.on && show.flow.cls.has(ev);
                [id, id + '-cas'].forEach(k => {
                    if (map.getLayer(k)) map.setLayoutProperty(k, 'visibility', on ? 'visible' : 'none');
                });
            });
            if (map.getLayer('flow-head')) {
                map.setLayoutProperty('flow-head', 'visibility',
                                      show.flow.on ? 'visible' : 'none');
            }""")

if crlf: s = s.replace('\n', '\r\n')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched')
