import io, sys
p = sys.argv[1]
s = io.open(p, encoding='utf-8', newline='').read()
crlf = '\r\n' in s
if crlf: s = s.replace('\r\n', '\n')

# ---- 1. constants -------------------------------------------------------
a0 = "    // Five classes, not a continuous ramp: 50k, 200k, 600k, 1.5M cubic metres."
a1 = "    let flowFocus = null;"
i = s.index(a0); j = s.index(a1, i) + len(a1)
NEW = '''    // Five classes, not a continuous ramp: 50k, 200k, 600k, 1.5M cubic metres.
    const FLOW_W = ['step', ['get', 'v'], 1.2, 50000, 2.0, 200000, 3.0, 600000, 4.6, 1500000, 7.0];
    const CASE_W = 2.4;

    // Over imagery a faded line has nothing left to read, so nothing here is
    // faded. Every flow is a solid core cut into a black casing, the way a road
    // is drawn over an aerial photograph, and the weight of a flow is carried by
    // width and value together rather than by opacity.
    const FLOW_VAL = ['step', ['get', 'v'],
                      '#9aa0a6', 50000, '#c3c8cc', 200000, '#e2e5e7',
                      600000, '#f4f6f7', 1500000, '#ffffff'];

    // Colour is spent on evidence, not on material. A modelled flow runs on the
    // grey ramp; a documented one carries the colour of what was moved. The one
    // exception is contamination, which is coloured wherever it appears, because
    // it is the distinction the permits are actually drawn on.
    const FLOW_MATCH = ['match', ['get', 'mat'],
                        'rock',   FLOW_MAT.rock,
                        'soil',   FLOW_MAT.soil,
                        'contam', FLOW_MAT.contam,
                        FLOW_MAT.other];
    const FLOW_GREY = ['case', ['==', ['get', 'mat'], 'contam'], FLOW_MAT.contam, FLOW_VAL];

    const FLOW_SPEC = {
        'flow-modelled':   { ev: 'modelled',   k: 0.85, col: FLOW_GREY,  cop: 0.52 },
        'flow-structural': { ev: 'structural', k: 1.00, col: FLOW_MATCH, cop: 0.58 },
        'flow-evidenced':  { ev: 'evidenced',  k: 1.25, col: FLOW_MATCH, cop: 0.66 }
    };
    let flowFocus = null;'''
s = s[:i] + NEW + s[j:]

# ---- 2. focusFlows ------------------------------------------------------
b0 = "    function focusFlows(uid) {"
b1 = "    function ensureFlowLayers() {"
i = s.index(b0); j = s.index(b1, i)
NEW = '''    function focusFlows(uid) {
        flowFocus = uid || null;
        if (!flowsReady) return;
        const on = flowFocus
            ? ['any', ['==', ['get', 'from'], flowFocus], ['==', ['get', 'to'], flowFocus]]
            : null;
        FLOW_LAYERS.forEach(id => {
            const s = FLOW_SPEC[id];
            const w = ['*', FLOW_W, s.k];
            const bw = on ? ['case', on, ['*', w, 2.2], w] : w;
            if (map.getLayer(id)) {
                map.setPaintProperty(id, 'line-width', bw);
                map.setPaintProperty(id, 'line-opacity', on ? ['case', on, 1, 0.10] : 1);
            }
            if (map.getLayer(id + '-cas')) {
                map.setPaintProperty(id + '-cas', 'line-width', ['+', bw, CASE_W]);
                map.setPaintProperty(id + '-cas', 'line-opacity',
                    on ? ['case', on, s.cop, 0.05] : s.cop);
            }
        });
    }

'''
s = s[:i] + NEW + s[j:]

# ---- 3. layer construction ---------------------------------------------
c0 = "        const before = under(['site-hot', 'site-sym', 'prof-line']);"
c1 = "            map.on('mousemove', id, e => {"
i = s.index(c0); j = s.index(c1, i)
NEW = '''        const before = under(['site-hot', 'site-sym', 'prof-line']);
        FLOW_LAYERS.forEach(id => {
            if (map.getLayer(id)) return;
            const s = FLOW_SPEC[id];
            const w = ['*', FLOW_W, s.k];
            const lay = () => ({ 'line-join': 'miter', 'line-cap': 'butt' });
            map.addLayer({ id: id + '-cas', type: 'line', source: 'flows',
                filter: ['==', ['get', 'ev'], s.ev], layout: lay(),
                paint: { 'line-color': '#000', 'line-opacity': s.cop,
                         'line-width': ['+', w, CASE_W] } }, before);
            map.addLayer({ id: id, type: 'line', source: 'flows',
                filter: ['==', ['get', 'ev'], s.ev], layout: lay(),
                paint: { 'line-color': s.col, 'line-opacity': 1,
                         'line-width': w } }, before);
'''
s = s[:i] + NEW + s[j:]

# ---- 4. the filter has to move the casing too ---------------------------
d0 = """            FLOW_LAYERS.forEach(id => {
                if (!map.getLayer(id)) return;
                const ev = id.replace('flow-', '');
                const on = show.flow.on && show.flow.cls.has(ev);
                map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
            });"""
assert s.count(d0) == 1
s = s.replace(d0, """            FLOW_LAYERS.forEach(id => {
                const ev = id.replace('flow-', '');
                const on = show.flow.on && show.flow.cls.has(ev);
                [id, id + '-cas'].forEach(k => {
                    if (map.getLayer(k)) map.setLayoutProperty(k, 'visibility', on ? 'visible' : 'none');
                });
            });""")

if crlf: s = s.replace('\n', '\r\n')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('patched')
