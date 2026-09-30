import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in s
if crlf: s = s.replace('\r\n', '\n')

a0 = "    // Straight, hard-ended, stepped: a flow is a statement that two places are"
a1 = "        flowsReady = true;"
i = s.index(a0)
j = s.index(a1, i)
j = s.index("\n    }\n", j) + len("\n    }\n")

NEW = r'''    // A flow is drawn as a spindle: thin where the mass leaves, full at mid-haul,
    // thin again where it lands, on an arc that always humps toward the top of
    // the frame whichever way the mass travels, so the hollow of every curve
    // faces the same way. The band is ground geometry, so its weight on screen
    // is rebuilt each time the zoom settles.
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
    function arc(a, b) { const g = arcPts(a, b, 28); return g.pts.map(g.back); }

    const bandPx = v => 1.1 + 15.0 * Math.sqrt(Math.min(1, v / (flowMaxV || 1)));

    function spindle(g, wpx, mpp) {
        const pts = g.pts, n = pts.length, half = wpx * mpp / 2, L = [], R = [];
        for (let i = 0; i < n; i++) {
            const s = i / (n - 1), p = pts[i];
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
            let tx = b[0] - a[0], ty = b[1] - a[1];
            const t = Math.hypot(tx, ty) || 1; tx /= t; ty /= t;
            const h = half * (0.17 + 0.83 * Math.pow(Math.sin(Math.PI * s), 0.75));
            L.push(g.back([p[0] - ty * h, p[1] + tx * h]));
            R.push(g.back([p[0] + ty * h, p[1] - tx * h]));
        }
        R.reverse();
        return L.concat(R, [L[0]]);
    }
    function headRing(g, sizePx, mpp) {
        const pts = g.pts, b = pts[pts.length - 1], a = pts[pts.length - 2];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const t = Math.hypot(tx, ty) || 1; tx /= t; ty /= t;
        const sz = sizePx * mpp, hw = sz * 0.58;
        const p1 = g.back([b[0] - tx*sz - ty*hw, b[1] - ty*sz + tx*hw]);
        const p2 = g.back([b[0], b[1]]);
        const p3 = g.back([b[0] - tx*sz + ty*hw, b[1] - ty*sz - tx*hw]);
        return [p1, p2, p3, p1];
    }

    // Everything that has two ends is drawn, but only what can be read is given
    // a band. The rest stays as a hairline, present but not competing, and more
    // of them earn a band as the map is zoomed in.
    function bandCount() {
        return Math.max(25, Math.min(220, Math.round(18 + 16 * (map.getZoom() - 7))));
    }
    function bandSet() {
        const drawn = allFlows.filter(f => f.__xy);
        if (flowFocus) return drawn.filter(f => f.FromUID === flowFocus || f.ToUID === flowFocus);
        const doc  = drawn.filter(f => f.__ev === 'evidenced');
        const rest = drawn.filter(f => f.__ev !== 'evidenced')
                          .sort((a, b) => (qty(b.Volume_m3) || 0) - (qty(a.Volume_m3) || 0))
                          .slice(0, bandCount());
        return doc.concat(rest);
    }

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
    function bandFeatures() {
        return { type: 'FeatureCollection', features: bandSet().map(f => {
            const a = [num(f.__from.Longitude), num(f.__from.Latitude)];
            const b = [num(f.__to.Longitude),   num(f.__to.Latitude)];
            const g = arcPts(a, b, 44), mpp = mPerPx((a[1] + b[1]) / 2);
            const v = qty(f.Volume_m3) || 0;
            const w = bandPx(v) * (f.__ev === 'evidenced' ? 1.25 : 1) * 1.55;
            const hs = Math.min(Math.max(w * 0.75, 3.0), 6.5);
            return { type: 'Feature', id: f.FlowUID,
                geometry: { type: 'MultiPolygon',
                            coordinates: [[spindle(g, w, mpp)], [headRing(g, hs, mpp)]] },
                properties: { fid: f.FlowUID, ev: f.__ev, mat: matOf(f), v: v,
                              from: f.FromUID, to: f.ToUID,
                              lbl: f.__fromName + ' → ' + f.__toName } };
        }) };
    }

    // The band recedes into the imagery when the volume is small and comes up to
    // white when it is large. Contamination is the one hue the layer spends.
    const BAND_STEP = ['step', ['get', 'v'],
                       '#5d6871', 50000, '#8592a0', 200000, '#b4c2ce',
                       600000, '#e0e8ee', 1500000, '#ffffff'];
    const BAND_COL = ['case', ['==', ['get', 'mat'], 'contam'], FLOW_MAT.contam, BAND_STEP];
    const BAND_OP  = ['step', ['get', 'v'], 0.42, 50000, 0.58, 200000, 0.75,
                      600000, 0.90, 1500000, 1.0];
    const FLOW_SPEC = {
        'flow-modelled':   { ev: 'modelled'   },
        'flow-structural': { ev: 'structural' },
        'flow-evidenced':  { ev: 'evidenced'  }
    };

    function rebuildBands() {
        const src = map.getSource('flowbands');
        if (src) src.setData(bandFeatures());
    }

    // Opening a site is what brings its own flows forward: they become the whole
    // band set, and every other flow falls back to a hairline.
    function focusFlows(uid) {
        flowFocus = uid || null;
        if (flowsReady) rebuildBands();
    }

    function ensureFlowLayers() {
        if (!map.getSource('flows')) {
            map.addSource('flows', { type: 'geojson', data: flowFeatures(), promoteId: 'fid' });
        } else {
            map.getSource('flows').setData(flowFeatures());
        }
        if (!map.getSource('flowbands')) {
            map.addSource('flowbands', { type: 'geojson', data: bandFeatures(), promoteId: 'fid' });
        } else {
            rebuildBands();
        }
        const before = under(['site-hot', 'site-sym', 'prof-line']);
        if (!map.getLayer('flow-ghost')) {
            map.addLayer({ id: 'flow-ghost', type: 'line', source: 'flows',
                layout: { 'line-join': 'round', 'line-cap': 'butt' },
                paint: { 'line-color': '#e8edf1', 'line-opacity': 0.14,
                         'line-width': 0.9 } }, before);
        }
        FLOW_LAYERS.forEach(id => {
            if (map.getLayer(id)) return;
            const s = FLOW_SPEC[id];
            map.addLayer({ id: id + '-edge', type: 'line', source: 'flowbands',
                filter: ['==', ['get', 'ev'], s.ev],
                layout: { 'line-join': 'round' },
                paint: { 'line-color': '#0e0e0b', 'line-opacity': 0.42,
                         'line-width': 1.0 } }, before);
            map.addLayer({ id: id, type: 'fill', source: 'flowbands',
                filter: ['==', ['get', 'ev'], s.ev],
                paint: { 'fill-color': BAND_COL, 'fill-opacity': BAND_OP } }, before);
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
        if (!flowBound) {
            flowBound = true;
            let t = null;
            map.on('zoomend', () => {
                clearTimeout(t);
                t = setTimeout(() => { if (flowsReady) rebuildBands(); }, 90);
            });
        }
        flowsReady = true;
        applyFlowFilter();
    }
'''
s = s[:i] + NEW + s[j:]

old = """            FLOW_LAYERS.forEach(id => {
                const ev = id.replace('flow-', '');
                const on = show.flow.on && show.flow.cls.has(ev);
                [id, id + '-cas'].forEach(k => {
                    if (map.getLayer(k)) map.setLayoutProperty(k, 'visibility', on ? 'visible' : 'none');
                });
            });"""
assert s.count(old) == 1
s = s.replace(old, """            FLOW_LAYERS.forEach(id => {
                const ev = id.replace('flow-', '');
                const on = show.flow.on && show.flow.cls.has(ev);
                [id, id + '-edge'].forEach(k => {
                    if (map.getLayer(k)) map.setLayoutProperty(k, 'visibility', on ? 'visible' : 'none');
                });
            });
            if (map.getLayer('flow-ghost')) {
                map.setLayoutProperty('flow-ghost', 'visibility',
                                      show.flow.on ? 'visible' : 'none');
            }""")

if crlf: s = s.replace('\n', '\r\n')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched')
