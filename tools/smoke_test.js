// Smoke test for index.html. Needs playwright and a static server on 8901 that answers
// byte ranges (the line tiles are read that way):
//     python3 tools/serve.py 8901
//     node tools/smoke_test.js
// Sheet CSVs and every tile server are stubbed, so it runs offline and the
// result never depends on Kartverket or Esri being up.
//
// MapLibre draws to a WebGL canvas, so "did the basemap draw" cannot be
// answered by counting <img> elements the way it could under Leaflet. The
// checks below ask the two questions that actually matter instead: which tile
// zoom was requested, and whether the canvas is the size of its container.
const { chromium } = require('playwright');
const fs = require('fs');
const HERE = __dirname + '/fixtures';
const csv = u => fs.readFileSync(HERE + (u.includes('gid=529338597') ? '/projects.csv' : '/facilities.csv'), 'utf8');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
let fail = 0;
const ok = (c,m) => { console.log((c?'  ok   ':'  FAIL ')+m); if(!c) fail++; };

(async () => {
  // SwiftShader: there is no GPU in CI, and MapLibre needs a WebGL context.
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport:{width:1440,height:900} });
  const hits = [];
  await ctx.route('**/docs.google.com/**', r=>r.fulfill({status:200,contentType:'text/csv',body:csv(r.request().url())}));
  await ctx.route(/kartverket|arcgisonline|geonorge|wayback|elevation-tiles-prod/, r=>{
    hits.push(r.request().url());
    r.fulfill({status:200,contentType:'image/png',body:PX});
  });
  // Kartverket's 1 m model, asked for by the terrain contours: one real tile of it
  // (Ask, Gjerdrum, 128 px) answers every request. The other høydedata layers get a pixel.
  const NHM = fs.readFileSync(HERE + '/nhm_dtm_128.lerc');
  await ctx.route(/hoydedata\.no/, r => /NHM_DTM/.test(r.request().url())
    ? r.fulfill({ status: 200, contentType: 'application/octet-stream', body: NHM })
    : r.fulfill({ status: 200, contentType: 'image/png', body: PX }));
  // The ownership graphs live on Pages. Serve the repo's own copy when it is
  // there, so the graph box is exercised offline too.
  await ctx.route(/boundarieslab\.github\.io\/db_mp\/network\//, r => {
    const f = __dirname + '/../network/' + r.request().url().split('/').pop();
    if (!fs.existsSync(f)) return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' });
    r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(f, 'utf8') });
  });
  // The metre-LiDAR Terrarium tiles are ~22 MB. When a checkout does not carry
  // them, answer with a synthetic ramp so the 3D and section checks still run.
  const RAMP = fs.readFileSync(HERE + '/terrain_ramp.png');
  await ctx.route(/\/data\/terrain\//, r => {
    const f = __dirname + '/..' + new URL(r.request().url()).pathname;
    if (fs.existsSync(f)) return r.fallback();
    r.fulfill({ status: 200, contentType: 'image/png', body: RAMP });
  });
  // MapLibre and PapaParse come from a CDN. If a vendor/ copy is present, serve
  // that instead, so the test also runs with no network at all.
  const VENDOR = __dirname + '/../vendor';
  if (fs.existsSync(VENDOR)) await ctx.route(/unpkg\.com|cdn\.jsdelivr\.net/, r => {
    const f = VENDOR + '/' + r.request().url().split('/').pop();
    if (!fs.existsSync(f)) return r.continue();
    r.fulfill({ status:200, contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript',
                body: fs.readFileSync(f,'utf8') });
  });
  // One invented line for the fixture project, so the test does not depend on
  // which real projects have a geometry.
  await ctx.route(/\/data\/project_geometries\.geojson/, r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { uid: 'CP_001', n: 'Fornebubanen', kind: 'line', firm: 1, basis: 'alignment', pt: [10.62, 59.895] },
        geometry: { type: 'MultiLineString', coordinates: [[[10.60, 59.890], [10.62, 59.895], [10.66, 59.915]]] } },
      { type: 'Feature', properties: { uid: 'CP_404', n: 'Not in the sheet', kind: 'perimeter', firm: 1, basis: 'building', a: 100, pt: [10.7, 59.9] },
        geometry: { type: 'MultiPolygon', coordinates: [[[[10.7, 59.9], [10.701, 59.9], [10.701, 59.901], [10.7, 59.9]]]] } } ] }) }));
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  // Ignored: the site's typeface comes from Cargo, which a sandbox need not
  // reach; pictograms are missing for the fixtures' invented types; and a
  // request aborted because a layer was switched off mid-flight is the browser
  // doing the right thing. A 404 on a DoD tile is the design: only tiles
  // containing change are stored, in the far view too.
  const IGNORE = /favicon|freight\.cargo\.site|picto_grammar|data\/dod(_far)?\//;
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/.test(t)) errs.push('console: ' + t); });
  p.on('requestfailed', r => { const e = (r.failure() || {}).errorText || '';
    if (!IGNORE.test(r.url()) && !/ABORTED/.test(e)) errs.push('request failed: ' + r.url().slice(0, 90) + ' ' + e); });
  p.on('response', r => { if (r.status() >= 400 && !IGNORE.test(r.url()))
    errs.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 90)); });

  const hook = () => p.evaluate(() => {
    const o = maplibregl.Map.prototype._render;
    maplibregl.Map.prototype._render = function(){
      if (this.getContainer() && this.getContainer().id === 'map') window.__M = this;
      return o.apply(this, arguments);
    };
  });
  // The layer tree lives in the drawer now, so it has to be out before the
  // checks can reach a control inside it. Everything is shut first, so this is
  // the same move whatever the step before left open.
  const openTree = async () => {
    await p.evaluate(async () => {
      window.__closePanes();
      window.__openPane('data-panel');
      await new Promise(r => setTimeout(r, 400));
      document.querySelectorAll('#bar .grp').forEach(g => g.classList.remove('closed'));
    });
    await p.waitForTimeout(140);
  };
  const vis = id => p.evaluate(i => { const m = window.__M; return !!m.getLayer(i) && m.getLayoutProperty(i, 'visibility') !== 'none'; }, id);

  await p.goto('http://127.0.0.1:8901/index.html'); await p.waitForTimeout(2500);
  // _render runs on every painted frame, so one repaint after the hook is
  // installed is enough to capture the map.
  await hook();
  await p.click('.maplibregl-ctrl-zoom-in'); await p.waitForTimeout(900);
  ok(await p.evaluate(()=>!!window.__M), 'map instance reachable');

  console.log('the bar');
  const bar0 = await p.evaluate(() => ({
    groups: document.querySelectorAll('#bar .grp.top').length,
    closed: [...document.querySelectorAll('#bar .grp.top')].every(g => g.classList.contains('closed')),
    tabs: [...document.querySelectorAll('#tabstrip .tab')].map(t => t.dataset.tab).join(','),
    tabsOnTable: !!document.querySelector('#deck .deck-head #tabstrip'),
    tools: document.querySelectorAll('#bar .toolbar .btn').length,
    railH: Math.round(document.querySelector('#bar .toolbar').getBoundingClientRect().height),
    railW: Math.round(document.querySelector('#bar .toolbar').getBoundingClientRect().width),
    barH: Math.round(document.getElementById('bar').getBoundingClientRect().height),
    right: !!document.getElementById('tools-win'),
    open: document.getElementById('bar').classList.contains('open'),
    icons: [...document.querySelectorAll('#bar .toolbar .btn:not(.txt)')].every(b => b.querySelector('svg.px') && !b.textContent.trim())
  }));
  ok(bar0.tabs === 'all,facility,extract,project,dod,flow' && bar0.tabsOnTable,
     'the sheets of the table sit on top of it, ALL first (' + bar0.tabs + ')');
  ok(bar0.tools >= 10 && !bar0.right, 'every tool is on one bar, and there is no second window on the right (' + bar0.tools + ')');
  ok(bar0.icons, 'every tool is a pixel icon with no text on it');
  ok(bar0.groups === 3 && bar0.closed, 'the layer groups start folded (' + bar0.groups + ')');
  ok(!bar0.open && bar0.railH <= 40 && bar0.barH <= 44 && bar0.railW > 200,
     'the tool bar is horizontal and opens shut (' + bar0.railW + 'x' + bar0.railH + 'px)');
  const drawer = await p.evaluate(async () => {
    const w = document.getElementById('bar');
    document.getElementById('btn-menu').click();
    await new Promise(r => setTimeout(r, 420));
    const open = Math.round(w.getBoundingClientRect().height);
    document.getElementById('btn-menu').click();
    await new Promise(r => setTimeout(r, 420));
    return { open, shut: Math.round(w.getBoundingClientRect().height) };
  });
  ok(drawer.open > 150 && drawer.shut <= 44,
     'the layers button drops the drawer and puts it back (' + drawer.shut + ' -> ' + drawer.open + 'px)');
  // One module: whatever drops out of the tool bar is exactly as wide as
  // the tool bar, and starts on the same pixel.
  const mod = await p.evaluate(async () => {
    window.__openPane('help-panel');
    await new Promise(r => setTimeout(r, 420));
    const tb = document.querySelector('#bar .toolbar').getBoundingClientRect();
    const dr = document.querySelector('#bar .drawer').getBoundingClientRect();
    window.__closePanes();
    await new Promise(r => setTimeout(r, 300));
    return { tw: +tb.width.toFixed(1), dw: +dr.width.toFixed(1),
             tx: +tb.x.toFixed(1), dx: +dr.x.toFixed(1) };
  });
  ok(mod.tw === mod.dw && mod.tx === mod.dx,
     'a pane is exactly as wide as the tool bar (' + mod.tw + ' vs ' + mod.dw + 'px)');
  // The map runs full-bleed under the site's own header, so everything
  // of ours starts below it — and the map itself still does not.
  const inset = await p.evaluate(() => {
    const ft = parseFloat(getComputedStyle(document.documentElement)
                .getPropertyValue('--frame-top')) || 0;
    return { ft,
             bar: Math.round(document.getElementById('bar').getBoundingClientRect().top),
             map: Math.round(document.getElementById('map').getBoundingClientRect().top) };
  });
  ok(inset.ft > 0 && inset.bar >= inset.ft && inset.map === 0,
     'the chrome clears the site header, the map does not (bar ' + inset.bar
     + ', map ' + inset.map + ', header ' + inset.ft + 'px)');
  const tuned = await p.evaluate(async () => {
    document.documentElement.style.setProperty('--frame-top', '60px');
    await new Promise(r => setTimeout(r, 120));
    const b = Math.round(document.getElementById('bar').getBoundingClientRect().top);
    document.documentElement.style.removeProperty('--frame-top');
    return b;
  });
  ok(tuned === 70, 'and follows --frame-top when the embed changes it (' + tuned + 'px)');
  // They used to be pushed sideways by the bar's width. Now the offset is the
  // rail and nothing else, so opening the drawer must not move them a pixel.
  const nudge = await p.evaluate(async () => {
    const box = () => { const r = document.querySelector('.maplibregl-ctrl-bottom-left');
                        const b = r.getBoundingClientRect(); return { l: Math.round(b.left), kids: r.children.length }; };
    const shut = box();
    window.__openPane('data-panel');
    await new Promise(r => setTimeout(r, 420));
    const open = box();
    window.__closePanes();
    await new Promise(r => setTimeout(r, 420));
    return { shut, open, rail: 0 };
  });
  ok(nudge.shut.kids >= 2, 'the compass and zoom are in the corner (' + nudge.shut.kids + ')');
  // The scale bar left the corner for the status line: a bar whose length
  // changes with the zoom cannot share an edge with anything stacked.
  ok(await p.evaluate(() => !!document.querySelector('.status-strip .maplibregl-ctrl-scale')),
     'the scale bar reads on the status line');
  ok(nudge.shut.l === nudge.open.l,
     'and opening the drawer does not move them (' + nudge.shut.l + ' -> ' + nudge.open.l + 'px)');
  const base0 = await p.evaluate(() => ({ sat: document.getElementById('base-sat').checked }));
  ok(base0.sat && await vis('satellite') && !(await vis('graytone')), 'the map opens on satellite imagery');
  ok(await p.evaluate(() => window.__M.dragRotate.isEnabled()), 'right-drag turns and tilts the map');
  await p.evaluate(() => window.__openPane('data-panel'));
  await p.waitForTimeout(350);
  await openTree();
  await p.waitForTimeout(300);

  console.log('zoom limits');
  const z0 = await p.evaluate(()=>window.__M.getMaxZoom());
  ok(z0===19, 'map maxZoom is 19 without the DoD layer (got '+z0+')');
  await p.evaluate(() => window.__closePanes()); await p.waitForTimeout(300);
  // Every far tile asked for from here on is counted: with all runs on the map the
  // first view of the tab already draws them.
  const farReq = [];
  p.on('request', r => { if (/\/data\/dod_far\//.test(r.url())) farReq.push(r.url()); });
  await p.click('#tab-dod'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => document.getElementById('filter-dod').checked), 'the terrain tab switches terrain change on');
  const z1 = await p.evaluate(()=>window.__M.getMaxZoom());
  ok(z1===19, 'DoD layer does not raise it (got '+z1+')');
  const rel = await p.evaluate(() => { const m = window.__M; return { radio: document.getElementById('base-relief').checked,
    sat: m.getPaintProperty('satellite', 'raster-saturation'), op: m.getPaintProperty('satellite', 'raster-opacity') }; });
  ok(rel.radio && await vis('relief') && await vis('relief-shade') && await vis('relief-ground') && await vis('satellite') && rel.sat === -1 && rel.op < 0.5,
     'and brings the shaded relief, with the photograph faint and in grey over it (opacity ' + rel.op + ')');
  // The click targets of a run load when the map is over it.
  await p.evaluate(() => window.__M.jumpTo({ center: [11.04, 60.075], zoom: 12 }));
  for (let i = 0; i < 30 && !(await p.evaluate(() => !!window.__M.getSource('dod-hit'))); i++) await p.waitForTimeout(300);
  const dodData = await p.evaluate(() => {
    const s = window.__M.getSource('dod-hit'); const f = s ? s._data.features : [];
    return { n: f.length, ls: f.filter(x => x.properties.ls).length,
             none: f.filter(x => x.properties.pl === 0).length, np: f.filter(x => 'np' in x.properties).length,
             sl: f.filter(x => x.properties.sl === 1).length,
             sh: f.filter(x => x.properties.sh === 1).length,
             shBad: f.filter(x => x.properties.sh === 1 && (x.properties.sl === 1 || x.properties.a >= 500 || Math.abs(x.properties.dh) > 1)).length,
             slBig: f.filter(x => x.properties.sl === 1 && x.properties.a >= 500).length,
             fo: f.filter(x => x.properties.fo === 1).length,
             foBad: f.filter(x => x.properties.fo === 1 && (x.properties.sl === 1 || x.properties.sh === 1 || x.properties.a >= 2000)).length,
             grouped: f.filter(x => Number.isInteger(x.properties.c) && x.properties.c >= 0).length,
             // a group never holds ground under a reguleringsplan together with ground under none
             mixed: (() => { const g = {}; f.forEach(x => { const k = x.properties.c; (g[k] = g[k] || new Set()).add(x.properties.pl ? 1 : 0); });
                             return Object.values(g).filter(v => v.size > 1).length; })() };
  });
  ok(dodData.n === 1121 && dodData.np === 0, 'Gjerdrum is the protocol run, with the plan flag (' + dodData.n + ' polygons, ' + dodData.np + ' old flags)');
  ok(dodData.none === 797 && dodData.ls === 2, 'with 797 unplanned and the landslide pair marked (' + dodData.none + ', ' + dodData.ls + ')');
  ok(dodData.sl === 98 && dodData.slBig === 0, 'and 98 small polygons on steep ground flagged, none of 500 m² or more (' + dodData.sl + ', ' + dodData.slBig + ')');
  ok(dodData.sh === 195 && dodData.shBad === 0, 'and 195 small shallow ones, none of them steep, large or 1 m deep (' + dodData.sh + ', ' + dodData.shBad + ')');
  ok(dodData.fo === 327 && dodData.foBad === 0, 'and 327 small ones under forest, none of them steep, shallow or 2,000 m² or more (' + dodData.fo + ', ' + dodData.foBad + ')');
  ok(dodData.grouped === dodData.n && dodData.mixed === 0, 'every polygon belongs to a group, and no group mixes planned ground with unplanned (' + dodData.grouped + ', ' + dodData.mixed + ' mixed)');
  // The studied ground: one outline per run, white and dashed, over the change
  // raster. The kommune is not drawn, and the legend is one switch.
  const dfp = await p.evaluate(() => {
    const m = window.__M, s = m.getSource('dodfp'), ids = m.getStyle().layers.map(l => l.id), mk = m.getSource('dodfar');
    return { n: s ? s._data.features.length : 0, runs: +document.getElementById('count-runs').textContent,
             rows: document.querySelectorAll('#run-list label.row').length, boxes: document.querySelectorAll('#run-list input[type=checkbox]').length,
             ha: ((s ? s._data.features : []).find(f => f.properties.id === 'gjerdrum_2007_2020') || { properties: {} }).properties.ha || 0,
             over: ids.indexOf('dodfp-line') > ids.indexOf('dod') && ids.indexOf('dod') > -1,
             white: m.getPaintProperty('dodfp-line', 'line-color') === '#fff' && Array.isArray(m.getPaintProperty('dodfp-line', 'line-dasharray')),
             kom: ids.includes('dodkom-line') || (s ? s._data.features.some(f => f.properties.kind === 'kommune') : false),
             src: (document.querySelector('#run-list label.row .src') || {}).textContent || '',
             far: !!mk && mk.type === 'raster',
             sliders: document.querySelectorAll('#dod-opacity').length };
  });
  ok(dfp.n === dfp.runs && dfp.n >= 1, 'every run has the outline of the ground that was studied (' + dfp.n + ' of ' + dfp.runs + ')');
  ok(await vis('dodfp-line') && dfp.over && dfp.white, 'drawn as a white dashed line over the change raster');
  ok(dfp.ha > 5000 && dfp.ha < 6000, 'Gjerdrum covers ' + dfp.ha + ' ha, not the whole kommune');
  ok(!dfp.kom, 'the kommune itself is not drawn');
  ok(dfp.rows === 1 && dfp.boxes === 1 && /studied area/.test(dfp.src), 'the legend is one switch for every run, not a list of kommuner (' + dfp.src.trim() + ')');
  ok(dfp.sliders === 1, 'one opacity slider serves every run');
  // The layers of the terrain view are handled from a panel on the map.
  const pan = await p.evaluate(() => { const m = window.__M, el = document.getElementById('dod-panel'), O = 'dodold-gjerdrum_2007_2020';
    document.getElementById('dod-dtm-old').click();
    const old = !!m.getLayer(O) && m.getLayoutProperty(O, 'visibility') !== 'none';
    const src = m.getSource(O), url = src ? decodeURIComponent(src.tiles[0]) : '';
    document.getElementById('dod-dtm-new').click();
    const back = !!m.getLayer(O) && m.getLayoutProperty(O, 'visibility') === 'none';
    document.getElementById('dod-zones').click(); const zoff = m.getLayoutProperty('dodfp-line', 'visibility') === 'none';
    document.getElementById('dod-zones').click();
    const ph = document.getElementById('dod-photo'); ph.value = 55; ph.dispatchEvent(new Event('input', { bubbles: true }));
    const photo = m.getPaintProperty('satellite', 'raster-opacity');
    ph.value = 30; ph.dispatchEvent(new Event('input', { bubbles: true }));
    return { shown: !el.hidden, old, url, back, zoff, zon: m.getLayoutProperty('dodfp-line', 'visibility') !== 'none', photo,
             selW: m.getPaintProperty('dodsel-line', 'line-width'), cased: !!m.getLayer('dodsel-case') || !!m.getLayer('dodfp-case') }; });
  ok(pan.shown && pan.old && /Romerike 07pkt 2007/.test(pan.url) && pan.back, 'a panel on the map handles the terrain layers: the older survey can be put under the change, and taken off again');
  ok(pan.zoff && pan.zon && pan.photo === 0.55, 'the studied areas and the strength of the photograph are set from it (' + pan.photo + ')');
  ok(pan.selW < 1 && !pan.cased, 'a chosen cluster is outlined by one hairline, the studied area by one white line');
  // Far out a change is smaller than a pixel: the far view keeps it on the map, as
  // the layer itself drawn for that zoom and not as a symbol standing for it.
  await p.evaluate(() => window.__M.jumpTo({ center: [11.04, 60.075], zoom: 8 })); await p.waitForTimeout(1500);
  const far = await p.evaluate(() => { const m = window.__M, L = m.getLayer('dodfar'); return { upto: L ? L.maxzoom : 0, from: m.getSource('dod').minzoom,
    on: !!L && m.getLayoutProperty('dodfar', 'visibility') !== 'none',
    symbols: m.getStyle().layers.filter(l => /^dod/.test(l.id) && (l.type === 'circle' || l.type === 'symbol')).length }; });
  const farTiles = fs.existsSync(__dirname + '/../data/dod_far/8') ? fs.readdirSync(__dirname + '/../data/dod_far/8').length : 0;
  ok(dfp.far && far.on && far.upto >= far.from && farReq.length > 0 && farTiles > 0,
     'zoomed out, the change stays on the map as the far view of the layer (' + farReq.length + ' far tiles asked for)');
  ok(far.symbols === 0, 'and no point stands for a change');
  // The lines of the layer: the edge of every change and the contours of the change,
  // every metre, from one file of vector tiles.
  await p.evaluate(() => window.__M.jumpTo({ center: [11.047, 60.057], zoom: 15 }));
  for (let i = 0; i < 40 && !(await p.evaluate(() => !!window.__M.getLayer('dodsel-edge'))); i++) await p.waitForTimeout(300);
  await p.waitForTimeout(2500);
  const ln = await p.evaluate(() => { const m = window.__M, q = id => m.getLayer(id) ? m.queryRenderedFeatures({ layers: [id] }) : [];
    const iso = q('dod-iso'), edge = q('dod-edge');
    const box = document.getElementById('dod-iso'); box.click();
    const off = m.getLayoutProperty('dod-iso', 'visibility') === 'none' && m.getLayoutProperty('dod-edge', 'visibility') === 'none';
    box.click();
    return { iso: iso.length, edge: edge.length, off, back: m.getLayoutProperty('dod-iso', 'visibility') !== 'none',
             whole: iso.length > 0 && iso.every(f => Number.isInteger(f.properties.l) && f.properties.l !== 0),
             edges: [...new Set(edge.map(f => f.properties.l))].sort().join(' '),
             grouped: edge.length > 0 && edge.every(f => f.properties.c >= 0 && typeof f.properties.r === 'string') && edge.some(f => f.properties.r === 'gjerdrum_2007_2020'),
             hidden: m.getPaintProperty('dodsel-line', 'line-opacity') };
  });
  ok(ln.edge > 0 && ln.edges === '-0.7 0.7' && ln.grouped, 'every change has its edge, the 0.70 m line of the difference, and each edge knows its cluster (' + ln.edge + ' in view)');
  ok(ln.iso > 0 && ln.whole, 'and the contours of the change are drawn at every whole metre (' + ln.iso + ' in view)');
  ok(ln.off && ln.back, 'the panel takes them off and puts them back');
  // Terrain contours: every metre from zoom 14, from the 1 m model.
  const ct = await p.evaluate(async () => { const m = window.__M;
    document.getElementById('dod-contours').click();
    for (let i = 0; i < 50 && !m.getLayer('dod-contours'); i++) await new Promise(r => setTimeout(r, 200));
    const src = m.getSource('dod-contours'), url = src && src.tiles ? decodeURIComponent(src.tiles[0]) : '';
    await new Promise(r => setTimeout(r, 3500));
    const fs_ = m.getLayer('dod-contours') ? m.queryRenderedFeatures({ layers: ['dod-contours'] }) : [];
    const ele = [...new Set(fs_.map(f => f.properties.ele))].sort((a, b) => a - b);
    const out = { url, n: fs_.length, step: ele.length > 1 ? Math.min(...ele.slice(1).map((v, i) => v - ele[i])) : 0,
                  far: !!m.getLayer('dod-contours-far'), white: m.getPaintProperty('dod-contours', 'line-color') };
    document.getElementById('dod-contours').click();
    return out; });
  ok(/thresholds=.*14\*1\*5/.test(ct.url) && /nhm/.test(ct.url) && ct.far && ct.white === '#fff', 'terrain contours are asked for every metre from zoom 14, from the 1 m model, in white');
  ok(ct.n > 0 && ct.step === 1, 'and are drawn one metre apart (' + ct.n + ' lines in view, step ' + ct.step + ' m)');

  await openTree();
  await p.click('#base-gray'); await p.waitForTimeout(200);
  hits.length = 0;
  await p.evaluate(()=>window.__M.jumpTo({center:[11.52031,59.81372], zoom:19}));
  await p.waitForTimeout(1500);
  const kv = hits.filter(u=>u.includes('kartverket'));
  const deepest = Math.max(...kv.map(u=>{ const m = u.match(/webmercator\/(\d+)\//); return m ? +m[1] : -1; }), -1);
  ok(kv.length>0, 'the grey map still requests tiles at max zoom ('+kv.length+' requests)');
  ok(deepest<=18, 'and never past Kartverket\'s tile zoom 18 (deepest '+deepest+')');
  ok(await p.evaluate(()=>window.__M.areTilesLoaded()), 'all requested tiles resolved');
  await openTree();
  await p.click('#filter-dod'); await p.waitForTimeout(300);
  await p.click('#base-sat'); await p.evaluate(() => window.__closePanes()); await p.waitForTimeout(300);
  await p.click('#tab-facility'); await p.waitForTimeout(300);
  ok(!(await vis('dodfp-line')) && !(await vis('dodfar')) && !(await vis('dod')) && await p.evaluate(() => document.getElementById('dod-panel').hidden), 'leaving the terrain tab takes terrain change and its panel off the map');

  console.log('key');
  const seenH = () => p.evaluate(() => document.getElementById('filter-panel').offsetHeight);
  const lg0 = await seenH();
  await p.click('#btn-key'); await p.waitForTimeout(350);
  const lg1 = await seenH();
  ok(lg0 === 0 && lg1 > 40, 'the key stays shut until its button is pressed (' + lg0 + ' -> ' + lg1 + ')');
  const cov = await p.evaluate(() => document.querySelector('[data-cov-ct="current"]').textContent);
  ok(cov === '333', 'plan counts are read from the file, not typed in (' + cov + ')');
  await p.click('#btn-help'); await p.waitForTimeout(350);
  const hp = await p.evaluate(() => ({ help: document.getElementById('help-panel').offsetHeight,
                                       key: document.getElementById('filter-panel').offsetHeight }));
  ok(hp.help > 100 && hp.key === 0, 'help opens and puts the key away (' + hp.help + ')');
  await p.click('#btn-help'); await p.waitForTimeout(300);

  console.log('status and colour');
  const cls = await p.evaluate(() => {
    const s = window.__M.getSource('sites'); const f = s ? s._data.features : [];
    const by = {}; f.forEach(x => by[x.properties.uid] = x.properties.cls + ' ' + x.properties.col);
    return by;
  });
  ok(/^active #FF0000/.test(cls.AK_AH_001 || ''), 'an active reception site is pure red (' + cls.AK_AH_001 + ')');
  ok(/^old #FFD400/.test(cls.AK_LI_002 || ''), '"closed (i etterdrift)" is pure yellow (' + cls.AK_LI_002 + ')');
  ok(/^contaminated #B300FF/.test(cls.VF_HM_001 || ''), 'a hazardous-waste landfill is pure violet (' + cls.VF_HM_001 + ')');
  ok(/^active #00FF00/.test(cls.CP_001 || ''), 'an active construction project is pure green (' + cls.CP_001 + ')');
  ok(!cls.AK_XX_001, 'a record with no coordinates is not drawn');
  const sat = await p.evaluate(() => {
    const hsl = h => { h = h.slice(1);
      const v = [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255);
      const mx = Math.max(...v), mn = Math.min(...v), l = (mx+mn)/2;
      if (mx === mn) return { s: 0, l };
      return { s: (mx-mn)/(1-Math.abs(2*l-1)), l };
    };
    const out = [];
    [...document.querySelectorAll('#key-list .swatch')].forEach(() => {});
    window.__CLASSES && 0;
    const s = window.__M.getSource('sites'); const f = s ? s._data.features : [];
    f.forEach(x => { const c = x.properties.col; if (c !== '#FFFFFF') out.push([c, hsl(c).s]); });
    return out;
  });
  ok(sat.length > 0 && sat.every(([c, v]) => v > 0.99),
     'every status colour is fully saturated (' + sat.filter(([c,v]) => v <= 0.99).map(x=>x[0]).join(',') + 'none below)');

  const all = await p.evaluate(async () => {
    document.getElementById('tab-all').click();
    await new Promise(r => setTimeout(r, 600));
    const cats = [...document.querySelectorAll('#deck-chips .chip')].map(c => c.dataset.cat);
    const rows = document.querySelectorAll('#site-table tbody tr').length;
    const uids = [...document.querySelectorAll('#site-table tbody tr')].map(r => r.dataset.uid);
    document.getElementById('tab-facility').click();
    await new Promise(r => setTimeout(r, 400));
    return { cats: [...new Set(cats)].sort().join(','), rows,
             hasProject: uids.some(u => /^CP_/.test(u)),
             back: document.querySelectorAll('#site-table tbody tr').length };
  });
  ok(all.cats === 'facility,project', 'ALL puts both families in the key (' + all.cats + ')');
  ok(all.hasProject && all.rows > all.back,
     'and lists reception and construction together (' + all.rows + ' vs ' + all.back + ')');

  console.log('the markers');
  const marks = await p.evaluate(() => {
    const m = window.__M;
    const f = m.getSource('sites') ? m.getSource('sites')._data.features : [];
    return { total: f.length,
             withSym: f.filter(x => /^sym-(facility|project)-\w+-\w+$/.test(x.properties.sym || '')).length,
             drawn: m.queryRenderedFeatures({ layers: ['site-sym'] }).length,
             images: f.map(x => x.properties.sym).filter(i => m.hasImage(i)).length,
             noGlow: !m.getLayer('site-glow') && !m.getLayer('fp-glow'),
             hot: !!m.getLayer('site-hot'),
             stale: ['site-plate', 'site-mark', 'site-dot'].filter(i => m.getLayer(i)) };
  });
  ok(marks.withSym === marks.total && marks.total > 0,
     'every site carries the table\'s own symbol (' + marks.withSym + '/' + marks.total + ')');
  ok(marks.images >= 1, 'the symbols are rasterised and registered (' + marks.images + ')');
  ok(marks.drawn > 0, 'and drawn on the map (' + marks.drawn + ')');
  ok(marks.noGlow && !marks.stale.length,
     'nothing glows: no glow layer on the sites or the footprints');
  ok(marks.hot, 'hover is a ring under the marker instead');

  console.log('sidebar');
  await p.evaluate(()=>{location.hash='site=AK_AH_001';}); await p.waitForTimeout(3000);
  const sb = await p.evaluate(()=>{
    const el=document.querySelector('#sb-minimap');
    const r=el?el.getBoundingClientRect():null;
    const side=document.getElementById('sidebar').getBoundingClientRect();
    const share=document.querySelector('.share-btn').getBoundingClientRect();
    const close=document.querySelector('.close-btn').getBoundingClientRect();
    return { mini: r&&[Math.round(r.width),Math.round(r.height)],
             tiles: el ? el.querySelectorAll('.aerial .tl').length : 0,
             outline: el ? el.querySelectorAll('.aerial svg path').length : 0,
             top: Math.round(side.top), right: Math.round(window.innerWidth - side.right),
             overlap: share.right > close.left };
  });
  ok(sb.mini && sb.mini[1] > 150 && sb.mini[0] > 380, 'the picture band spans the window (' + (sb.mini||[]) + ')');
  ok(sb.tiles > 0 && sb.outline > 0, 'it shows the aerial with the footprint drawn on it (' + sb.tiles + ' tiles)');
  // Ten in from the right edge, and ten below the site header the map
  // runs under — not ten from the top of a map that starts behind it.
  const ftop = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement)
                 .getPropertyValue('--frame-top')) || 0);
  ok(sb.top >= ftop && sb.top <= ftop + 12 && sb.right <= 12,
     'the site window sits below the header, on the right (' + sb.top + ',' + sb.right + ')');
  ok(!sb.overlap, 'SHARE and the close button do not overlap');
  const zoomed = await p.evaluate(() => {
    const m = window.__M, b = m.getBounds();
    const s = m.getSource('fp')._data.features.find(x => x.properties.uid === 'AK_AH_001');
    let w = 180, so = 90, e = -180, n = -90;
    (function walk(c){ if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); so = Math.min(so, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); })(s.geometry.coordinates);
    const fpW = e - w, viewW = b.getEast() - b.getWest();
    return { ratio: +(fpW / viewW).toFixed(2) };
  });
  ok(zoomed.ratio < 0.8 && zoomed.ratio > 0.1, 'the site is framed whole, with ground around it (' + zoomed.ratio + ' of the view)');

  console.log('framing');
  const fr0 = await p.evaluate(() => {
    const m = window.__M;
    const pt = m.project([11.52031, 59.81372]);
    const box = document.getElementById('map').getBoundingClientRect();
    const lw  = document.getElementById('bar').getBoundingClientRect();
    const sbb = document.getElementById('sidebar').getBoundingClientRect();
    const left = lw.right - box.left, right = sbb.left - box.left;
    // A site with worked ground is framed on that outline, not on its plan or parcels.
    const own = m.getSource('fp')._data.features.filter(x => x.properties.uid === 'AK_AH_001');
    const f = own.find(x => x.properties.pcls === 'observed') || own[0];
    let w = 180, so = 90, e = -180, n = -90;
    if (f) (function walk(c) {
      if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); so = Math.min(so, c[1]); n = Math.max(n, c[1]); }
      else c.forEach(walk);
    })(f.geometry.coordinates);
    const ctr = f ? m.project([(w + e) / 2, (so + n) / 2]) : pt;
    return { x: Math.round(pt.x), y: Math.round(pt.y), cx: Math.round(ctr.x), cy: Math.round(ctr.y),
             band: [Math.round(left), Math.round(right)], mid: Math.round((left + right) / 2), h: box.height };
  });
  ok(fr0.x > fr0.band[0] && fr0.x < fr0.band[1], 'site is inside the visible strip (x=' + fr0.x + ' in ' + fr0.band + ')');
  ok(Math.abs(fr0.cx - fr0.mid) < 60, 'its footprint is centred in it (off by ' + Math.abs(fr0.cx - fr0.mid) + 'px)');
  ok(Math.abs(fr0.cy - fr0.h / 2) < 60, 'and vertically centred (off by ' + Math.round(Math.abs(fr0.cy - fr0.h/2)) + 'px)');
  const lit = await p.evaluate(() => window.__M.getFeatureState({ source: 'fp', id: 'AK_AH_001' }).hot);
  ok(lit === true, 'the open site\'s outline is lit');

  console.log('deck');
  // A tab click opens the sheet it names, so the table may well be open by
  // now. Shut it first: what is being checked is the closed state itself.
  await p.evaluate(() => { const d = document.getElementById('deck');
    if (!d.classList.contains('half') && !d.classList.contains('full')) return;
    document.querySelector('.deck-head').click(); });
  await p.waitForTimeout(800);
  const shut = await p.evaluate(() => {
    const d = document.getElementById('deck');
    return { closed: !d.classList.contains('half') && !d.classList.contains('full'),
             h: Math.round(d.getBoundingClientRect().height),
             chips: document.querySelectorAll('#deck-chips .chip').length };
  });
  ok(shut.closed && shut.h < 46, 'the table starts closed (' + shut.h + 'px)');
  // Opened to the whole page it must still clear the site header, or the
  // control that shuts it is behind one and the table is a trap.
  const deckFull = await p.evaluate(async () => {
    const d = document.getElementById('deck');
    const size = document.getElementById('deck-size');
    size.click(); await new Promise(r => setTimeout(r, 350));   // half
    size.click(); await new Promise(r => setTimeout(r, 400));   // full
    const ft = parseFloat(getComputedStyle(document.documentElement)
                .getPropertyValue('--frame-top')) || 0;
    return { isFull: d.classList.contains('full'), ft,
             top: Math.round(d.getBoundingClientRect().top),
             head: Math.round(document.querySelector('.deck-head').getBoundingClientRect().top),
             btn: Math.round(size.getBoundingClientRect().top) };
  });
  ok(deckFull.isFull && deckFull.top >= deckFull.ft && deckFull.head >= deckFull.ft && deckFull.btn >= deckFull.ft,
     'the whole-page table clears the header (top ' + deckFull.top + ', its button '
     + deckFull.btn + ', header ' + deckFull.ft + 'px)');
  const esc = await p.evaluate(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    const d = document.getElementById('deck');
    const half = d.classList.contains('half');
    if (half) { document.querySelector('.deck-head').click(); await new Promise(r => setTimeout(r, 350)); }
    return half;
  });
  ok(esc, 'and Esc brings it back down');
  ok(shut.chips >= 3, 'with the colour key in its header even when closed (' + shut.chips + ' chips)');
  const headToggle = await p.evaluate(async () => {
    const d = document.getElementById('deck'), head = document.querySelector('.deck-head');
    const h = () => Math.round(d.getBoundingClientRect().height);
    head.click(); await new Promise(r => setTimeout(r, 400)); const open = h();
    head.click(); await new Promise(r => setTimeout(r, 400)); const shut = h();
    return { open, shut };
  });
  ok(headToggle.open > 150 && headToggle.shut < 46,
     'a click on the bar opens the table and a second one shuts it (' + headToggle.shut + ' -> ' + headToggle.open + 'px)');
  await openTree();
  await p.click('label[for="filter-facilities"]'); await p.waitForTimeout(400);
  await p.click('label[for="filter-facilities"]'); await p.waitForTimeout(600);   // the click toggled it; put it back
  const opened = await p.evaluate(() => {
    const d = document.getElementById('deck');
    return { half: d.classList.contains('half'), title: document.getElementById('deck-title').textContent.trim(),
             on: document.getElementById('filter-facilities').checked };
  });
  ok(opened.half && opened.on, 'touching the reception row opens the table');
  ok(/RECEPTION|MOTTAK/i.test(opened.title), 'showing reception sites (' + opened.title + ')');

  // The chips are the legend and the switch.
  const rows0 = await p.evaluate(() => document.querySelectorAll('#site-table tbody tr').length);
  const drawn0 = await p.evaluate(() => window.__M.querySourceFeatures('sites', { filter: window.__M.getFilter('site-sym') }).length);
  await p.click('#deck-chips .chip[data-cls="active"]'); await p.waitForTimeout(500);
  const chip = await p.evaluate(() => ({
    rows: document.querySelectorAll('#site-table tbody tr').length,
    pressed: document.querySelector('#deck-chips .chip[data-cls="active"]').getAttribute('aria-pressed'),
    filter: JSON.stringify(window.__M.getFilter('site-sym')),
    drawn: window.__M.queryRenderedFeatures({ layers: ['site-sym'] }).map(f => f.properties.uid)
  }));
  ok(chip.pressed === 'false' && chip.rows < rows0, 'a colour box takes that status out of the table (' + rows0 + ' -> ' + chip.rows + ')');
  ok(!/facility:active/.test(chip.filter) && /facility:old/.test(chip.filter), 'and off the map');
  await p.click('#deck-chips .chip[data-cls="active"]'); await p.waitForTimeout(400);
  const rows1 = await p.evaluate(() => document.querySelectorAll('#site-table tbody tr').length);
  ok(rows1 === rows0, 'pressing it again brings them back (' + rows1 + ')');

  await p.click('#deck-size'); await p.waitForTimeout(500);         // half -> full
  const full = await p.evaluate(() => {
    const d = document.getElementById('deck');
    return { full: d.classList.contains('full'), h: Math.round(d.getBoundingClientRect().height) };
  });
  ok(full.full && full.h > 400, 'it can take the whole page (' + full.h + 'px)');
  await p.click('#deck-size'); await p.waitForTimeout(400);         // full -> closed
  await p.evaluate(() => document.querySelector('.deck-head').click()); await p.waitForTimeout(500);  // and back open

  const dk = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#site-table tbody tr')];
    const head = [...document.querySelectorAll('#site-table thead th')].map(t => t.textContent.trim());
    const ths = [...document.querySelectorAll('#site-table thead th')];
    const si = ths.findIndex(t => /[↓↑]/.test(t.textContent));
    const ti = ths.findIndex(t => /^TYPE/.test(t.textContent.trim()));
    return { n: rows.length, head, sorted: rows.map(r => r.children[si].textContent.trim().replace(/^n\.d\.$/, '')),
             sym: ti >= 0 && rows.every(r => r.children[ti].querySelector('svg')),
             nogeo: rows.filter(r => r.classList.contains('nogeo')).length,
             sel: rows.filter(r => r.classList.contains('sel')).length };
  });
  ok(dk.n === 5, 'the deck lists every reception record, located or not (' + dk.n + ')');
  ok(/FACILITY/.test(dk.head[0]) && dk.head.some(h => /^TYPE/.test(h)) && /UID/.test(dk.head[dk.head.length - 1]),
     'the sheet leads with the facility and ends with its ID (' + dk.head.join('|') + ')');
  ok(dk.sym, 'and carries the symbol');
  ok(dk.nogeo === 1, 'a record with no coordinates is marked (' + dk.nogeo + ')');
  ok(dk.sel === 1, 'the open site is the selected row (' + dk.sel + ')');
  const blanksLast = (() => { let seenBlank = false;
    for (const a of dk.sorted) { if (!a) seenBlank = true; else if (seenBlank) return false; } return true; })();
  ok(blanksLast, 'blank cells sort last in the sorted column (' + dk.sorted.join(',') + ')');

  await p.hover('#site-table tbody tr[data-uid="OS_OS_001"]');
  await p.waitForTimeout(400);
  const hv = await p.evaluate(() => {
    const c = document.getElementById('hover-card');
    const r = c.getBoundingClientRect();
    const stage = document.getElementById('stage').getBoundingClientRect();
    return { on: c.classList.contains('on'), img: c.dataset.img === '1',
             big: r.width >= 240, tiles: c.querySelectorAll('.aerial .tl').length,
             inside: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1,
             nearPointer: true,
             lit: window.__M.getFeatureState({ source: 'sites', id: 'OS_OS_001' }).hot };
  });
  ok(hv.on && hv.big, 'hovering a row opens a large preview');
  // It used to be pinned to the bottom left of the map, which put it on top of
  // the table it was describing.
  const follow = await p.evaluate(async () => {
    const row = document.querySelector('#site-table tbody tr[data-uid="OS_OS_001"]');
    const card = document.getElementById('hover-card');
    const at = (x, y) => { row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y })); };
    const r = row.getBoundingClientRect();
    at(r.left + 60, r.top + 4); await new Promise(z => setTimeout(z, 60));
    const a = card.getBoundingClientRect();
    at(r.left + 520, r.top + 4); await new Promise(z => setTimeout(z, 60));
    const b = card.getBoundingClientRect();
    return { moved: Math.round(b.left - a.left), gapA: Math.round(a.left - (r.left + 60)),
             deckTop: Math.round(document.getElementById('deck').getBoundingClientRect().top),
             cardBottom: Math.round(b.bottom) };
  });
  ok(follow.moved > 300, 'and the preview follows the pointer along the row (' + follow.moved + 'px)');
  ok(follow.cardBottom <= follow.deckTop + 2,
     'sitting above the table rather than on top of it (' + follow.cardBottom + ' vs ' + follow.deckTop + ')');
  ok(hv.img && hv.tiles > 0, 'with the aerial of that site (' + hv.tiles + ' tiles)');
  ok(hv.inside, 'the preview stays inside the window');
  ok(hv.lit === true, 'and the site lights up on the map');

  await p.click('#site-table tbody tr[data-uid="AK_XX_001"]');
  await p.waitForTimeout(700);
  const ng = await p.evaluate(() => ({ status: document.getElementById('status-strip').textContent,
                                       title: (document.getElementById('sb-title') || {}).textContent || '' }));
  ok(/Planned site/.test(ng.title) && /COORDINATES/.test(ng.status), 'a record with no coordinates opens and says why the map did not move');
  await p.click('#site-table tbody tr[data-uid="AK_AH_001"]');
  await p.waitForTimeout(1200);
  const cl = await p.evaluate(() => ({
    open: document.getElementById('sidebar').classList.contains('active'),
    sel: document.querySelectorAll('#site-table tbody tr.sel').length,
    title: (document.getElementById('sb-title') || {}).textContent || ''
  }));
  ok(cl.open && cl.sel === 1 && /Helgerud/.test(cl.title), 'clicking a row opens that site (' + cl.title + ')');
  await p.click('#tab-project'); await p.waitForTimeout(400);
  const pj = await p.evaluate(() => ({ title: document.getElementById('deck-title').textContent,
    head: document.querySelector('#site-table thead th:nth-child(1)').textContent,
    rows: document.querySelectorAll('#site-table tbody tr').length }));
  ok(/CONSTRUCTION/.test(pj.title) && /PROJECT/.test(pj.head) && pj.rows === 1, 'the construction tab turns the table to projects (' + pj.head + ')');
  await p.click('#tab-facility'); await p.waitForTimeout(300);

  await p.evaluate(() => {
    const d = document.getElementById('deck');
    if (d.classList.contains('full')) document.getElementById('deck-size').click();
  });

  console.log('3D terrain');
  // The defect this guards: clicking 3D before the style has loaded used to
  // throw "cannot load terrain, because there exists no source with ID".
  await p.reload();
  await hook();
  await p.evaluate(() => window.__openPane('data-panel'));
  await p.waitForTimeout(350);
  await openTree();
  await p.click('#terrain-3d', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(6000);
  const early = await p.evaluate(() => {
    const m = window.__M;
    return { t: m && !!m.getTerrain(), checked: document.getElementById('terrain-3d').checked };
  });
  ok(!early.checked || early.t, 'switching 3D on immediately still attaches terrain');
  if (early.checked) { await p.click('#terrain-3d'); await p.waitForTimeout(900); }
  // Outside the run, 3D must stay where you are.
  await p.evaluate(() => window.__M.jumpTo({ center: [11.40, 60.19], zoom: 12, pitch: 0 }));
  await p.waitForTimeout(600);
  await p.click('#btn-3d'); await p.waitForTimeout(2500);
  const stay = await p.evaluate(() => { const c = window.__M.getCenter(); return [+c.lng.toFixed(2), +c.lat.toFixed(2)]; });
  ok(stay[0] === 11.40 && stay[1] === 60.19, '3D never flies you somewhere else (' + stay + ')');
  const nat = await p.evaluate(() => {
    const m = window.__M, t = m.getTerrain();
    return { src: t && t.source, res: document.getElementById('terrain-res').textContent };
  });
  ok(nat.src === 'terrain-dem-no', 'outside the run it uses the national DEM (' + nat.src + ')');
  ok(/10 m/.test(nat.res), 'and says which resolution is under you (' + nat.res + ')');
  const ctl = await p.evaluate(() => ({ tilt: document.querySelector('#compass .tilt').textContent,
                                        rot: document.querySelector('#compass svg').style.transform }));
  ok(/\d+°/.test(ctl.tilt), 'the compass shows the tilt (' + ctl.tilt + ')');
  await p.click('#btn-3d'); await p.waitForTimeout(900);

  await p.evaluate(() => window.__M.jumpTo({ center: [11.038, 60.063], zoom: 13 }));
  await p.waitForTimeout(800);
  const demHits = [];
  await p.route('**/data/terrain/**', r => { demHits.push(r.request().url()); r.fallback(); });
  await p.click('#terrain-3d');
  await p.waitForTimeout(3500);
  const t3d = await p.evaluate(() => {
    const m = window.__M, t = m.getTerrain();
    return { on: !!t, src: t && t.source, pitch: Math.round(m.getPitch()), bearing: Math.round(m.getBearing()),
             wrap: !document.getElementById('terrain-exag-wrap').hidden };
  });
  ok(t3d.on && t3d.src === 'terrain-dem', 'inside the run the metre LiDAR is attached (' + t3d.src + ')');
  ok(t3d.pitch > 30, 'the map tilts so the terrain is visible (' + t3d.pitch + ' deg)');
  ok(t3d.wrap, 'the height slider appears with it');
  ok(demHits.length > 0, 'DEM tiles are requested (' + demHits.length + ')');
  ok(demHits.every(u => !/\/1[6-9]\//.test(u.replace(/.*terrain\/[a-z]+/, ''))), 'and never past the deepest DEM zoom that exists');
  // Right-drag turns the camera.
  const mb = await p.evaluate(() => { const r = document.getElementById('map').getBoundingClientRect(); return [r.left + r.width * 0.6, r.top + r.height * 0.5]; });
  const b0 = await p.evaluate(() => window.__M.getBearing());
  await p.mouse.move(mb[0], mb[1]); await p.mouse.down({ button: 'right' });
  await p.mouse.move(mb[0] + 120, mb[1], { steps: 10 }); await p.mouse.up({ button: 'right' });
  await p.waitForTimeout(600);
  const b1 = await p.evaluate(() => window.__M.getBearing());
  ok(Math.abs(b1 - b0) > 5, 'right-drag turns the camera (' + Math.round(b0) + ' -> ' + Math.round(b1) + ' deg)');
  await p.waitForTimeout(600);
  // With every group of the layer tree open the drawer reaches down over the compass,
  // so the button is pressed directly.
  await p.evaluate(() => document.getElementById('compass').click());
  // The turn is eased; under software GL a frame can take long, so wait for it
  // to land rather than for a fixed time.
  await p.waitForFunction(() => Math.abs(window.__M.getBearing()) < 1, null, { timeout: 6000 }).catch(() => {});
  ok(Math.abs(await p.evaluate(() => window.__M.getBearing())) < 1, 'a click on the compass sets north up');
  await p.click('#terrain-3d'); await p.waitForTimeout(1200);
  const off = await p.evaluate(() => ({ t: !!window.__M.getTerrain(), pitch: Math.round(window.__M.getPitch()) }));
  ok(!off.t && off.pitch < 5, 'switching it off returns the map to flat (' + off.pitch + ' deg)');

  console.log('tools');
  await p.click('#btn-key'); await p.waitForTimeout(300);
  await p.click('#btn-light'); await p.waitForTimeout(600);
  const panes = await p.evaluate(() => ({
    legend: document.getElementById('filter-panel').offsetHeight,
    light: document.getElementById('light-panel').offsetHeight,
    hs: !!window.__M.getLayer('hillshade'),
    az: window.__M.getLayer('hillshade') ? window.__M.getPaintProperty('hillshade', 'hillshade-illumination-direction') : null
  }));
  ok(panes.light > 0 && panes.legend === 0, 'opening LIGHT closes the key');
  ok(panes.hs, 'and puts a hillshade on the DEM');
  ok(panes.az === 315, 'lit from the northwest to begin with (' + panes.az + ')');
  await p.evaluate(() => { const a = document.getElementById('light-az'); a.value = 90; a.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => window.__M.getPaintProperty('hillshade', 'hillshade-illumination-direction')) === 90, 'turning the light moves it');
  await p.evaluate(() => window.__M.setBearing(90));
  await p.click('#light-view'); await p.waitForTimeout(300);
  const fromView = await p.evaluate(() => +document.getElementById('light-az').value);
  ok(fromView === 45, 'light from this view follows the map\'s turn (' + fromView + ')');
  await p.evaluate(() => window.__M.setBearing(0));
  await p.click('#btn-light'); await p.waitForTimeout(400);
  ok(!(await p.evaluate(() => !!window.__M.getLayer('hillshade'))), 'switching it off removes it');

  await p.click('#btn-profile'); await p.waitForTimeout(400);
  await p.evaluate(() => window.__M.jumpTo({ center: [11.035, 60.075], zoom: 13 }));
  await p.waitForTimeout(800);
  const at = async (lng, lat) => p.evaluate(([a, b]) => {
    const pt = window.__M.project([a, b]);
    const r = document.getElementById('map').getBoundingClientRect();
    return [Math.round(r.left + pt.x), Math.round(r.top + pt.y)];
  }, [lng, lat]);
  const c1 = await at(11.02, 60.07), c2 = await at(11.05, 60.08);
  await p.mouse.click(c1[0], c1[1]); await p.waitForTimeout(250);
  await p.mouse.click(c2[0], c2[1]); await p.waitForTimeout(250);
  await p.mouse.dblclick(c2[0], c2[1]);
  await p.waitForTimeout(4500);
  const prof = await p.evaluate(() => ({
    read: (document.getElementById('prof-read').textContent || '').replace(/\s+/g, ' ').trim(),
    path: document.querySelector('#prof-svg path') ? document.querySelector('#prof-svg path').getAttribute('d').length : 0,
    line: !!window.__M.getLayer('prof-line'),
    svg: /SVG/.test(document.getElementById('prof-read').textContent),
    pin: !!document.querySelector('.pin')
  }));
  ok(prof.line, 'the drawn line is on the map');
  ok(prof.path > 200, 'the section is plotted (' + prof.path + ' chars of path)');
  ok(/1 m LiDAR/.test(prof.read), 'and read from the metre LiDAR');
  const mm = prof.read.match(/([0-9.]+) m/g) || [];
  ok(mm.length >= 3, 'with length, low, high and delta (' + prof.read.slice(0, 90) + ')');
  ok(prof.svg, 'and can be saved as SVG as well as CSV');
  ok(!prof.pin, 'drawing a section does not drop coordinate pins');
  await p.click('#btn-profile'); await p.waitForTimeout(300);

  // A click on bare ground reads it.
  const g = await at(11.03, 60.07);
  await p.mouse.click(g[0], g[1]); await p.waitForTimeout(1500);
  const pin = await p.evaluate(() => document.getElementById('coord-readout').textContent);
  ok(/60\.0\d+ N/.test(pin) && /m$/.test(pin.trim()), 'a click on the ground gives coordinates and height (' + pin + ')');
  await p.click('#btn-crs'); await p.waitForTimeout(200);
  const utm = await p.evaluate(() => document.getElementById('coord-readout').textContent);
  ok(/UTM33 E 2\d{5}\s+N 66\d{5}/.test(utm), 'and switches to UTM 33 (' + utm + ')');
  await p.click('#btn-crs');
  await p.mouse.click(g[0], g[1]); await p.waitForTimeout(300);

  // Box selection narrows the table without hiding anything on the map.
  await p.evaluate(() => { location.hash = ''; });
  await p.evaluate(() => window.__M.jumpTo({ center: [11.52031, 59.81372], zoom: 12, bearing: 0, pitch: 0 }));
  await p.waitForTimeout(900);
  const src0 = await p.evaluate(() => window.__M.getSource('sites')._data.features.length);
  await p.click('#btn-select'); await p.waitForTimeout(200);
  const pc = await at(11.52031, 59.81372);
  await p.mouse.move(pc[0] - 80, pc[1] - 80); await p.mouse.down();
  await p.mouse.move(pc[0] + 80, pc[1] + 80, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(900);
  const sel = await p.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('#site-table tbody tr')).map(r => r.dataset.uid),
    src: window.__M.getSource('sites')._data.features.length,
    title: document.getElementById('deck-title').textContent,
    strip: document.getElementById('status-strip').textContent,
    clear: !!document.getElementById('deck-clear')
  }));
  ok(sel.rows.length === 1 && sel.rows[0] === 'AK_AH_001', 'a box selects the records inside it (' + sel.rows.join(',') + ')');
  ok(sel.src === src0, 'and leaves every site on the map (' + sel.src + ')');
  ok(/SELECTION/.test(sel.title) && /SELECTED/.test(sel.strip) && sel.clear, 'the table and the status line say it is a selection');
  await p.click('#deck-clear'); await p.waitForTimeout(500);
  const after = await p.evaluate(() => ({ title: document.getElementById('deck-title').textContent,
                                          rows: document.querySelectorAll('#site-table tbody tr').length }));
  ok(/RECEPTION/.test(after.title) && after.rows === 5, 'clearing it returns the table to what it was (' + after.title + ', ' + after.rows + ')');

  console.log('polygons');
  const fp = await p.evaluate(() => {
    const m = window.__M;
    const v = id => m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none';
    const src = m.getSource('fp');
    const f = src ? src._data.features : [];
    return { all: ['fp-fill', 'fp-line', 'fp-soft'].every(v), n: f.filter(x => !x.properties.kind).length,
             pg: f.filter(x => x.properties.kind).map(x => x.properties.uid + ':' + x.properties.kind + ':' + x.geometry.type + ':' + x.properties.col).join(' '),
             fillFilter: JSON.stringify(m.getFilter('fp-fill')), lineW: JSON.stringify(m.getPaintProperty('fp-line', 'line-width')),
             col: (f.find(x => x.properties.uid === 'AK_AH_001') || { properties: {} }).properties.col,
             lineCol: JSON.stringify(m.getPaintProperty('fp-line', 'line-color')),
             fill: JSON.stringify(m.getPaintProperty('fp-fill', 'fill-opacity')) };
  });
  ok(fp.all, 'footprints draw without being asked');
  // A construction project is drawn as its line or its perimeter, from
  // data/project_geometries.geojson (stubbed above with one line for CP_001).
  ok(/^CP_001:line:MultiLineString:#00FF00$/.test(fp.pg), 'a project is drawn as its line, in its status colour (' + fp.pg + ')');
  ok(/"kind"\],"line"/.test(fp.fillFilter) && /"!="/.test(fp.fillFilter), 'a line is never filled as if it were an area');
  ok(/"kind"\],"line"\],3\.8/.test(fp.lineW) && /2\.4/.test(fp.lineW), 'and is drawn heavier than a site contour');
  // The projects are on the map with their own tab (or with ALL).
  const tabWas = await p.evaluate(() => document.querySelector('.tab[aria-selected="true"]').dataset.tab);
  await p.click('#tab-project'); await p.waitForTimeout(500);
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
  await p.click('#tab-' + tabWas); await p.waitForTimeout(500);
  ok(pgUi.hit > 0 && pgUi.filled === 0, 'the line is actually painted, and only as a line (' + pgUi.hit + ', ' + pgUi.filled + ')');
  // Only footprints of published sites are drawn: the fixtures publish four
  // facilities, three of which have a footprint in data/facility_polygons.geojson.
  const fpWant = JSON.parse(fs.readFileSync(__dirname + '/../data/facility_polygons.geojson', 'utf8')).features
    .filter(f => ['AK_AH_001', 'OS_OS_001', 'AK_LI_002', 'VF_HM_001', 'AK_XX_001'].includes(f.properties.uid)).length;
  ok(fp.n === fpWant, 'only published sites\' footprints are in the source (' + fp.n + ' of ' + fpWant + ')');
  const unpub = await p.evaluate(() => ({ site: (window.__M.getSource('sites')._data.features || []).some(f => f.properties.uid === 'AK_ZZ_999')
                                            || document.body.innerText.includes('Unconfirmed test site'),
    fp: (window.__M.getSource('fp')._data.features || []).some(f => f.properties.uid === 'AK_ZZ_999') }));
  ok(!unpub.site && !unpub.fp, 'a row not marked Published stays off the map');
  ok(fp.col === '#FF0000' && /col/.test(fp.lineCol), 'they are coloured by status, not black (' + fp.col + ')');
  // The 2026 method draws more than the footprint: a mining licence is dotted,
  // property parcels are a hairline, and both stay out of the fill.
  const kinds = await p.evaluate(() => { const m = window.__M;
    return { lic: !!m.getLayer('fp-lic'), prop: !!m.getLayer('fp-prop'),
             licDash: m.getLayer('fp-lic') ? JSON.stringify(m.getPaintProperty('fp-lic', 'line-dasharray')) : '',
             classes: [...new Set(m.getSource('fp')._data.features.map(f => f.properties.pcls).filter(Boolean))].sort().join(',') }; });
  ok(kinds.lic && kinds.prop && /0\.2/.test(kinds.licDash), 'a mining licence and property parcels have their own line (' + kinds.licDash + ')');
  ok(/observed/.test(kinds.classes) && /permitted/.test(kinds.classes), 'the outline file carries worked ground and the permitted outline (' + kinds.classes + ')');
  ok(/0\.14/.test(fp.fill) && /match/.test(fp.fill),
     'with a see-through fill whose weight follows the status, and no glow');

  await p.evaluate(() => { location.hash = 'site=AK_AH_001'; });
  await p.waitForTimeout(3000);
  const frame = await p.evaluate(() => {
    const m = window.__M, b = m.getBounds();
    // A site with worked ground is framed on that outline, not on its plan or parcels.
    const own = m.getSource('fp')._data.features.filter(x => x.properties.uid === 'AK_AH_001');
    const f = own.find(x => x.properties.pcls === 'observed') || own[0];
    let w = 180, so = 90, e = -180, n = -90;
    (function walk(c) { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); so = Math.min(so, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); })(f.geometry.coordinates);
    return { inside: b.getWest() <= w && b.getEast() >= e && b.getSouth() <= so && b.getNorth() >= n,
             hit: m.queryRenderedFeatures({ layers: ['fp-fill', 'fp-line', 'fp-soft'].filter(id => m.getLayer(id)) }).length };
  });
  ok(frame.inside, 'opening a site frames its whole footprint');
  ok(frame.hit > 0, 'and the footprint is actually painted (' + frame.hit + ')');

  const covOff = await p.evaluate(() => !!window.__M.getSource('cov'));
  ok(!covOff, 'the plan sweep stays off until a box is ticked');
  await p.evaluate(() => window.__openPane('data-panel'));
  await p.waitForTimeout(350);
  await openTree();
  await p.click('#filter-plan-current'); await p.waitForTimeout(2500);
  const cov1 = await p.evaluate(() => {
    const m = window.__M;
    const v = id => m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none';
    const src = m.getSource('cov');
    const L = m.getStyle().layers.map(l => l.id);
    return { n: src ? src._data.features.length : 0, inforce: v('cov-current-line'), closed: v('cov-old-line'),
             below: L.indexOf('cov-current-line') < L.indexOf('fp-fill') };
  });
  ok(cov1.n === 1736, 'all 1 736 sweep polygons load (got ' + cov1.n + ')');
  ok(cov1.inforce && !cov1.closed, 'only the class that was ticked is shown');
  ok(cov1.below, 'and the sweep is drawn under the database footprints');

  console.log('table flow filter, map hover, share');
  await p.evaluate(() => { document.getElementById('deck').className = 'half'; });
  await p.waitForTimeout(400);
  const dirs = await p.evaluate(async () => {
    const b = document.getElementById('deck-dir');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push({ label: b.textContent.trim(), rows: document.querySelectorAll('#site-table tbody tr').length });
      b.click();
      await new Promise(r => setTimeout(r, 150));
    }
    return seen;
  });
  ok(dirs[0].label === 'all flows', 'the table carries the flow filter (' + dirs[0].label + ')');
  ok(dirs.some(d => d.rows < dirs[0].rows), 'and it narrows the table (' + dirs.map(d => d.label + ':' + d.rows).join(' ') + ')');

  await p.evaluate(() => { location.hash = ''; });
  await p.evaluate(() => document.getElementById('sb-close').click());
  await p.evaluate(() => window.__M.jumpTo({ center: [10.83, 59.928], zoom: 11 }));
  await p.waitForTimeout(1200);
  const dot = await at(10.83, 59.928);
  await p.mouse.move(dot[0] + 30, dot[1] + 30); await p.mouse.move(dot[0], dot[1], { steps: 4 });
  await p.waitForTimeout(500);
  const hov = await p.evaluate(() => {
    const c = document.getElementById('hover-card');
    return { on: c.classList.contains('on'), name: c.querySelector('.cp').textContent };
  });
  ok(hov.on && /Alnabru/.test(hov.name), 'hovering a site on the map raises its preview (' + hov.name.slice(0, 30) + ')');
  await p.mouse.click(dot[0], dot[1]); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => /Alnabru/.test((document.getElementById('sb-title') || {}).textContent || '')), 'and clicking it opens the site');

  await p.evaluate(() => { location.hash = 'site=AK_AH_001'; });
  await p.waitForTimeout(2500);
  const gr = await p.evaluate(() => {
    const c = document.getElementById('graph-container');
    const f = c && c.querySelector('iframe');
    return { h: c ? c.offsetHeight : 0, src: f ? f.getAttribute('src') : '' };
  });
  ok(/fc=FF0000/.test(gr.src), 'the ownership graph is told the site\'s colour');
  ok(gr.h >= 240, 'with room to be read (' + gr.h + 'px)');
  const url = await p.evaluate(() => { window.__M.jumpTo({ center: [11.5, 59.8], zoom: 13.2, bearing: 30, pitch: 20 });
    return new Promise(res => setTimeout(() => { shareLink(); setTimeout(() => res(document.getElementById('share-notification').textContent), 300); }, 300)); });
  ok(/LINK COPIED|#site=AK_AH_001&v=13\.20\/59\.8/.test(url), 'SHARE copies the whole view (' + url.slice(0, 80) + ')');

  // Search: coordinates and the database.
  await p.fill('#search-input', '59.81372, 11.52031'); await p.waitForTimeout(300);
  const sr = await p.evaluate(() => [...document.querySelectorAll('#search-results .search-group')].map(g => g.textContent));
  ok(sr.some(s => /COORDINATES/.test(s)), 'search understands coordinates (' + sr.join('|') + ')');
  await p.fill('#search-input', 'qqqzzz'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => /No match/.test(document.getElementById('search-results').textContent)), 'and says so when nothing matches');
  await p.fill('#search-input', 'langoya'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => /Langøya/.test(document.getElementById('search-results').textContent)), 'and finds Langøya typed without ø');
  await p.fill('#search-input', '');

  console.log('norwegian');
  await p.click('#btn-no'); await p.waitForTimeout(500);
  const no = await p.evaluate(() => ({
    tab: document.querySelector('#tabstrip #tab-facility .tl').textContent,
    dir: document.getElementById('deck-dir').textContent,
    sel: document.getElementById('btn-select').title,
    chips: document.getElementById('deck-chips').textContent,
    icons: document.querySelectorAll('#bar .toolbar .btn svg.px').length
  }));
  ok(no.tab === 'MOTTAK' && no.dir === 'alle strømmer' && /mottar nå/.test(no.chips), 'Norwegian reaches the tabs, the table and its key (' + no.chips.trim().slice(0, 40) + ')');
  ok(/å velge/.test(no.sel) && !/\\u/.test(no.sel), 'tooltips are real Norwegian, not escape codes (' + no.sel + ')');
  ok(no.icons >= 8, 'and switching language leaves the icons drawn');
  await p.click('#btn-en'); await p.waitForTimeout(300);

  console.log('sheets');
  // The table behaves as a spreadsheet: tabs cut at 45°, one-pixel rules,
  // an active cell, picked rows with a sum, a totals line, column filters,
  // find, a frozen first column, resizable columns, the view in the address
  // and a CSV of values.
  await p.evaluate(async () => {
    const d = document.getElementById('deck');
    if (!d.classList.contains('half')) { d.className = ''; document.querySelector('.deck-head').click(); }
    await new Promise(r => setTimeout(r, 500));
  });
  const shp = await p.evaluate(() => {
    const tabs = [...document.querySelectorAll('#tabstrip .tab')];
    const slopes = tabs.map(tb => {
      const pl = tb.querySelector('svg.shape polyline');
      if (!pl) return null;
      const pts = pl.getAttribute('points').trim().split(/\s+/).map(q => q.split(',').map(Number));
      return Math.abs((pts[0][1] - pts[1][1]) / (pts[1][0] - pts[0][0]));
    });
    const hl = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hl'));
    return { n: tabs.length, slopes, hl, dpr: devicePixelRatio,
             on: tabs.filter(tb => tb.getAttribute('aria-selected') === 'true').map(tb => tb.querySelector('svg.shape polygon').style.fill) };
  });
  ok(shp.slopes.length === shp.n && shp.slopes.every(v => v !== null && Math.abs(v - 1) < 0.01),
     'every sheet tab is cut at 45° (' + shp.slopes.map(v => v && v.toFixed(2)).join(',') + ')');
  ok(/255, 255, 255|#fff/.test(shp.on[0] || ''), 'and the one in front is white, joined to its sheet');
  ok(Math.abs(shp.hl - 1 / shp.dpr) < 0.001, 'rules are one device pixel (' + shp.hl + 'px at ' + shp.dpr + 'x)');

  const tot = await p.evaluate(() => ({
    foot: [...document.querySelectorAll('#site-table tfoot td')].map(td => td.textContent.trim()),
    key: document.getElementById('sheet-key').textContent,
    frozen: getComputedStyle(document.querySelector('#site-table tbody td:first-child')).position,
    frozenHead: getComputedStyle(document.querySelector('#site-table thead th:first-child')).position
  }));
  ok(/^5 rows/.test(tot.foot[0]) && tot.foot.some(t => /^Σ 9 470 000$/.test(t)),
     'a totals line counts the rows and sums the stated m³ (' + tot.foot.filter(Boolean).join(' | ') + ')');
  ok(tot.foot.some(t => /stated for 4 of 5/.test(t)), 'and says how many rows state a capacity');
  ok(/receives masses/.test(tot.key) && /100 000 m³/.test(tot.key) && /5 published · 1 held back/.test(tot.key),
     'the key sits in the sheet and says what is held back (' + tot.key.replace(/\s+/g, ' ').slice(0, 90) + ')');
  ok(tot.frozen === 'sticky' && tot.frozenHead === 'sticky', 'the first column stays put when the sheet scrolls sideways');

  // keyboard: the active cell
  await p.focus('#deck .deck-scroll');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowRight');
  const kc = await p.evaluate(() => { const c = document.querySelector('#site-table td.cur');
    return c ? { key: c.dataset.key, row: c.parentElement.dataset.ix } : null; });
  ok(kc && kc.row === '1' && kc.key === 'Municipality', 'arrow keys move the active cell (' + JSON.stringify(kc) + ')');
  await p.evaluate(() => { navigator.clipboard.writeText = s => { window.__clip = s; return Promise.resolve(); }; });
  await p.keyboard.press('Control+c'); await p.waitForTimeout(200);
  const clip1 = await p.evaluate(() => window.__clip);
  ok(clip1 && !/\t/.test(clip1) && clip1.length > 1, 'Ctrl+C copies the cell (' + clip1 + ')');
  await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  const kent = await p.evaluate(() => ({ open: document.getElementById('sidebar').classList.contains('active'),
    title: (document.getElementById('sb-title') || {}).textContent || '',
    row: (document.querySelector('#site-table tbody tr[data-ix="1"] td:first-child') || {}).textContent }));
  ok(kent.open && kent.row && kent.title.indexOf(kent.row.replace(' ·', '')) >= 0, 'Enter opens the record in the active row (' + kent.title + ')');

  // picking rows
  await p.click('#site-table tbody tr[data-ix="0"] td:nth-child(2)', { modifiers: ['Control'] });
  await p.click('#site-table tbody tr[data-ix="2"] td:nth-child(2)', { modifiers: ['Control'] });
  const pk = await p.evaluate(() => ({ n: document.querySelectorAll('#site-table tbody tr.pick').length,
    status: document.getElementById('status-strip').textContent }));
  ok(pk.n === 2 && /2 picked/.test(pk.status), 'ctrl-click picks rows (' + pk.status + ')');
  ok(/Σ [\d ]+ m³ \(stated for \d of 2\)/.test(pk.status), 'and the status line adds them up, saying how many state a value');
  await p.focus('#deck .deck-scroll'); await p.keyboard.press('Control+c'); await p.waitForTimeout(200);
  const clipSh = await p.evaluate(() => window.__clip);
  ok(clipSh && clipSh.split('\n').length === 3 && /\t/.test(clipSh), 'Ctrl+C on picked rows copies them as a sheet (' + (clipSh || '').split('\n')[0] + ')');
  await p.click('#site-table tbody tr[data-ix="4"] td:nth-child(2)', { modifiers: ['Shift'] });
  const sh = await p.evaluate(() => document.querySelectorAll('#site-table tbody tr.pick').length);
  ok(sh >= 3, 'shift-click picks a run of rows (' + sh + ')');
  await p.keyboard.press('Escape');
  const esc2 = await p.evaluate(() => document.querySelectorAll('#site-table tbody tr.pick').length);
  ok(esc2 === 0, 'Esc lets them go');

  // csv of values
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#deck-csv')]);
  const csvText = fs.readFileSync(await dl.path(), 'utf8');
  ok(/^﻿?UID,Name,Category,Municipality,Operator,Status,Type,Direction,Capacity,CapacityUnit/.test(csvText) && /,9300000,m³,/.test(csvText),
     'the CSV carries values and units, not what the cell shows (' + dl.suggestedFilename() + ')');
  ok(/_\d{4}-\d\d-\d\d\.csv$/.test(dl.suggestedFilename()), 'and is named with the date');

  // AutoFilter and find
  await p.click('#site-table th[data-key="Municipality"] .af');
  await p.waitForTimeout(200);
  const afOpen = await p.evaluate(() => !document.getElementById('af-pop').hidden && document.querySelectorAll('#af-pop .af-list input').length);
  ok(afOpen >= 4, 'a column head opens a list of its values (' + afOpen + ')');
  await p.click('#af-pop .af-list label:has-text("Oslo") input');
  await p.waitForTimeout(300);
  const af = await p.evaluate(() => ({ rows: document.querySelectorAll('#site-table tbody tr').length,
    on: !!document.querySelector('#site-table th[data-key="Municipality"] .af.on'), hash: location.hash }));
  ok(af.rows === 4 && af.on, 'unticking a value takes its rows out (' + af.rows + ')');
  ok(/af=Municipality%3AOslo/.test(af.hash), 'and the filter is in the address (' + af.hash + ')');
  await p.mouse.click(5, 5); await p.waitForTimeout(200);
  await p.click('#site-table th[data-key="Municipality"] .af'); await p.waitForTimeout(150);
  await p.click('#af-pop .af-all input'); await p.waitForTimeout(250);
  await p.keyboard.press('Escape');
  await p.fill('#deck-find', 'langoya'); await p.waitForTimeout(300);
  const fd = await p.evaluate(() => ({ rows: [...document.querySelectorAll('#site-table tbody tr')].map(r => r.dataset.uid), hash: location.hash }));
  ok(fd.rows.length === 1 && fd.rows[0] === 'VF_HM_001', 'find narrows the sheet, ø or not (' + fd.rows.join(',') + ')');
  ok(/q=langoya/.test(fd.hash), 'and is in the address too');
  await p.fill('#deck-find', ''); await p.waitForTimeout(250);

  // COLUMNS: switch a field of the record on, then off again
  await p.click('#deck-cols'); await p.waitForTimeout(250);
  const colList = await p.evaluate(() => [...document.querySelectorAll('#af-pop .af-list input')].map(i => i.dataset.k));
  ok(colList.includes('County') && colList.includes('PermitRef') && colList.includes('MassesAccepted'),
     'the COLUMNS list offers every field of the record (' + colList.length + ')');
  await p.click('#af-pop input[data-k="County"]'); await p.waitForTimeout(300);
  const withCounty = await p.evaluate(() => !!document.querySelector('#site-table th[data-key="County"]'));
  await p.click('#af-pop input[data-k="County"]'); await p.waitForTimeout(300);
  const without = await p.evaluate(() => !document.querySelector('#site-table th[data-key="County"]'));
  ok(withCounty && without, 'and ticking one adds its column to the sheet, unticking takes it away');
  await p.keyboard.press('Escape');
  await p.evaluate(() => localStorage.removeItem('db_cols'));

  // resize a column
  const rz = await p.evaluate(() => {
    const th = document.querySelector('#site-table th[data-key="Operator"]');
    const r = th.querySelector('.rz').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: th.getBoundingClientRect().width };
  });
  await p.mouse.move(rz.x, rz.y); await p.mouse.down(); await p.mouse.move(rz.x + 60, rz.y, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(200);
  const rz2 = await p.evaluate(() => ({ w: document.querySelector('#site-table th[data-key="Operator"]').getBoundingClientRect().width,
    saved: (JSON.parse(localStorage.getItem('db_colw') || '{}').facility || {}).Operator }));
  ok(rz2.w > rz.w + 40 && rz2.saved > 0, 'dragging a column edge widens it, and it is kept (' + Math.round(rz.w) + ' -> ' + Math.round(rz2.w) + 'px)');

  // sort by a header, and the view comes back from the address
  await p.click('#site-table th[data-key="Name"]'); await p.waitForTimeout(300);
  const sortHash = await p.evaluate(() => location.hash);
  ok(/sort=Name(%2B|\+|-)/.test(sortHash), 'a sort is written to the address (' + sortHash + ')');
  const pSh = await ctx.newPage();
  await pSh.goto('http://127.0.0.1:8901/index.html#sheet=project&sort=Name-');
  await pSh.waitForTimeout(2500);
  const back = await pSh.evaluate(() => ({ tab: document.querySelector('#tabstrip .tab[aria-selected="true"]').dataset.tab,
    open: document.getElementById('deck').classList.contains('half'),
    arrow: (document.querySelector('#site-table th[data-key="Name"]') || {}).textContent }));
  ok(back.tab === 'project' && back.open && /↓/.test(back.arrow || ''), 'a link opens the same sheet, sorted the same way (' + back.tab + ')');
  await pSh.close();
  await p.evaluate(() => { history.replaceState(null, '', location.pathname); localStorage.removeItem('db_colw'); });

  console.log('flows');
  const fl = await p.evaluate(async () => {
    document.getElementById('tab-flow').click();
    await new Promise(r => setTimeout(r, 450));
    return { title: document.getElementById('deck-title').textContent,
             empty: !!document.querySelector('#deck .deck-empty'),
             chips: [...document.querySelectorAll('#deck-chips .chip .ev')].map(e => e.className).join('|'),
             cols: [...document.querySelectorAll('#site-table thead th')].length,
             panel: !document.getElementById('tb-flow').hidden,
             key: document.querySelectorAll('#filter-panel [data-flow-ct]').length };
  });
  ok(fl.panel && /FLOWS|STR/.test(fl.title), 'the FLOWS sheet opens with its own switches (' + fl.title + ')');
  ok(fl.empty && fl.cols === 0, 'and says where its data comes from while there is none');
  ok(fl.chips === 'ev evidenced|ev structural|ev modelled',
     'evidence is three line treatments, not three colours (' + fl.chips + ')');
  ok(fl.key === 3, 'and the key carries the same three lines (' + fl.key + ')');
  await p.evaluate(() => document.getElementById('tab-facility').click());
  await p.waitForTimeout(300);

  console.log('reception, extraction, construction');
  const fam = await p.evaluate(async () => {
    const cell = (uid, key) => { const td = document.querySelector('#site-table tbody tr[data-uid="' + uid + '"] td[data-key="' + key + '"]'); return td ? td.textContent.replace(/\s+/g, ' ').trim() : null; };
    const rec = { n: document.getElementById('count-facilities').textContent, x: document.getElementById('count-extract').textContent,
                  tonnes: cell('OS_OS_001', '__qty'), na: cell('AK_XX_001', '__qty'), area: cell('AK_AH_001', 'Area_m2'),
                  head: [...document.querySelectorAll('#site-table thead th .lab')].map(l => l.textContent.trim().split(' ')[0]).join('|') };
    document.getElementById('tab-extract').click();
    await new Promise(r => setTimeout(r, 450));
    const ext = { title: document.getElementById('deck-title').textContent,
                  rows: [...document.querySelectorAll('#site-table tbody tr')].map(r => r.dataset.uid).join(','),
                  qty: cell('VF_HM_001', '__qty'), hash: location.hash,
                  head: [...document.querySelectorAll('#site-table thead th .lab')].map(l => l.textContent.trim().split(' ')[0]).join('|'),
                  drawer: !document.getElementById('tb-facility').hidden };
    document.getElementById('tab-facility').click();
    await new Promise(r => setTimeout(r, 300));
    return { rec, ext, back: cell('VF_HM_001', '__qty') };
  });
  ok(fam.rec.x === '1' && fam.ext.rows === 'VF_HM_001' && /EXTRACTION|UTTAK/.test(fam.ext.title),
     'EXTRACTION is its own sheet and holds the sites that take rock out (' + fam.ext.rows + ', ' + fam.ext.title + ')');
  ok(/EXTRACTION/.test(fam.ext.head) && !/EXTRACTION/.test(fam.rec.head) && /CAPACITY/.test(fam.rec.head),
     'its bar is headed EXTRACTION, the reception sheet\'s CAPACITY');
  ok(/500.000/.test(fam.ext.qty) && /9.300.000/.test(fam.back),
     'one site shows what it takes out in one sheet and what it may take in in the other (' + fam.ext.qty + ' / ' + fam.back + ')');
  ok(/sheet=extract/.test(fam.ext.hash) && fam.ext.drawer, 'the sheet is in the address and keeps the reception switches');
  ok(/100.000 t\/yr/.test(fam.rec.tonnes), 'a yearly intake carries its own unit (' + fam.rec.tonnes + ')');
  ok(fam.rec.na === '–', 'a dash in the sheet is drawn as a dash, not as n.d. (' + fam.rec.na + ')');
  ok(/31.301 worked/.test(fam.rec.area), 'area is read from the outline and says which kind it is (' + fam.rec.area + ')');

  console.log('a number is a link to its source');
  const sl = await p.evaluate(async () => {
    const a = (uid, key) => { const e = document.querySelector('#site-table tbody tr[data-uid="' + uid + '"] td[data-key="' + key + '"] a.src');
                              return e ? e.getAttribute('href') + '|' + e.target + '|' + e.textContent.replace(/\s+/g, ' ').trim() : null; };
    const rec = { cap: a('OS_OS_001', '__qty'), tot: a('VF_HM_001', '__qty'), none: a('AK_AH_001', '__qty') };
    document.getElementById('tab-extract').click();
    await new Promise(r => setTimeout(r, 450));
    const ext = a('VF_HM_001', '__qty');
    document.getElementById('tab-facility').click();
    await new Promise(r => setTimeout(r, 300));
    if (document.getElementById('sidebar').classList.contains('active')) closeSidebar();
    await new Promise(r => setTimeout(r, 300));
    const link = document.querySelector('#site-table tbody tr[data-uid="OS_OS_001"] td[data-key="__qty"] a.src');
    if (link) { link.addEventListener('click', e => e.preventDefault(), { once: true }); link.click(); }
    await new Promise(r => setTimeout(r, 300));
    const stay = !document.getElementById('sidebar').classList.contains('active');
    document.querySelector('#site-table tbody tr[data-uid="OS_OS_001"] td[data-key="Name"]').click();
    await new Promise(r => setTimeout(r, 600));
    const side = [...document.querySelectorAll('#sb-dynamic-content .col-1 a.src')].map(x => x.getAttribute('href') + '|' + x.textContent.trim());
    const plain = [...document.querySelectorAll('#sb-dynamic-content .col-1')].filter(x => !x.querySelector('a.src')).length;
    closeSidebar();
    await new Promise(r => setTimeout(r, 300));
    return { rec, ext, stay, side, plain };
  });
  ok(/^https:\/\/example\.org\/alnabru-permit\.pdf\|_blank\|100.000 t\/yr$/.test(sl.rec.cap || ''),
     'a figure with a source in the sheet is a link to it, in a new tab (' + sl.rec.cap + ')');
  ok(/langoya-permit/.test(sl.rec.tot || '') && /langoya-dmf/.test(sl.ext || ''),
     'the link follows the figure: capacity in one sheet, extraction in the other (' + sl.rec.tot + ' / ' + sl.ext + ')');
  ok(sl.rec.none === null, 'a figure with no source in the sheet stays plain text');
  ok(sl.stay, 'following the link does not open the record');
  ok(sl.side.length === 1 && /alnabru-permit\.pdf\|100000 tonnes\/year/.test(sl.side[0]) && sl.plain > 3,
     'the record links the same figure and nothing else (' + sl.side.join(', ') + ')');

  console.log('phone');
  const ph = await ctx.newPage();
  await ph.setViewportSize({ width: 390, height: 844 });
  await ph.goto('http://127.0.0.1:8901/index.html#site=AK_AH_001'); await ph.waitForTimeout(3500);
  const pr = await ph.evaluate(() => {
    const vw = window.innerWidth;
    const sb = document.getElementById('sidebar').getBoundingClientRect();
    const size = document.getElementById('deck-size').getBoundingClientRect();
    return { folded: !document.getElementById('bar').classList.contains('open')
                     && Math.round(document.querySelector('#bar .toolbar').getBoundingClientRect().height) <= 40,
             sheet: Math.round(sb.left) === 0 && Math.round(sb.right) === vw && sb.bottom >= document.getElementById('stage').getBoundingClientRect().bottom - 2,
             sizeOn: size.right <= vw && size.left >= 0,
             wide: document.documentElement.scrollWidth > vw };
  });
  ok(pr.folded, 'on a phone the bar is one strip with the drawer shut');
  ok(pr.sheet, 'the site opens as a sheet from the bottom');
  ok(pr.sizeOn && !pr.wide, 'the table button stays on screen and nothing scrolls sideways');
  // The phone's sheet: tabs that fit, the legend inside the sheet, three columns.
  await ph.goto('http://127.0.0.1:8901/index.html'); await ph.waitForTimeout(3000);
  await ph.evaluate(() => document.getElementById('deck-size').click()); await ph.waitForTimeout(700);
  const psh = await ph.evaluate(() => {
    const vw = window.innerWidth;
    const tabs = [...document.querySelectorAll('#tabstrip .tab')].map(t => t.getBoundingClientRect());
    return { tabsIn: tabs.every(r => r.right <= vw && r.left >= 0),
             labels: [...document.querySelectorAll('#tabstrip .tl')].map(l => l.textContent).join(' '),
             cols: [...document.querySelectorAll('#site-table thead th')].map(t => t.textContent.trim().split(' ')[0]),
             headChips: getComputedStyle(document.getElementById('deck-chips')).display,
             barChips: document.querySelectorAll('#sheet-chips .chip').length,
             sym: !!document.querySelector('#site-table tbody td:first-child svg'),
             tableW: Math.round(document.getElementById('site-table').getBoundingClientRect().width),
             sheetW: Math.round(document.querySelector('#deck .deck-scroll').clientWidth),
             wide: document.documentElement.scrollWidth > vw };
  });
  ok(psh.tabsIn, 'on a phone every sheet tab fits across the screen (' + psh.labels + ')');
  const psz = await ph.evaluate(async () => {
    const b = document.getElementById('sheet-size').getBoundingClientRect();
    document.getElementById('sheet-size').click(); await new Promise(r => setTimeout(r, 500));
    const full = document.getElementById('deck').classList.contains('full');
    document.getElementById('sheet-size').click(); await new Promise(r => setTimeout(r, 500));   // full -> closed
    document.querySelector('.deck-head').click(); await new Promise(r => setTimeout(r, 500));      // and open again
    return { on: b.width > 0 && b.right <= innerWidth, full,
             names: [...document.querySelectorAll('#tabstrip .tl')].every(l => l.textContent === l.getAttribute('data-en')) };
  });
  ok(psz.on && psz.full, 'the size control sits in the sheet\'s own bar and still takes the whole page');
  ok(psz.names, 'tab names are written in full, not shortened');
  ok(psh.cols.length === 3 && /FACILITY/.test(psh.cols[0]), 'the sheet keeps three columns: name, capacity, m³ (' + psh.cols.join('|') + ')');
  ok(psh.sym, 'and the name carries the site\'s symbol');
  ok(psh.headChips === 'none' && psh.barChips >= 3, 'the legend moves into the sheet (' + psh.barChips + ' switches)');
  ok(psh.tableW <= psh.sheetW + 1 && !psh.wide, 'the table is as wide as the screen, no wider (' + psh.tableW + ' of ' + psh.sheetW + 'px)');
  await ph.click('#sheet-chips .chip[data-cls="active"]'); await ph.waitForTimeout(400);
  const pchip = await ph.evaluate(() => document.querySelector('#deck-chips .chip[data-cls="active"]').getAttribute('aria-pressed'));
  ok(pchip === 'false', 'and its rings still switch a status off');
  // Terrain change on a phone: the panel folded, the table out of the way, the label
  // docked under the toolbar as wide as the screen.
  await ph.goto('http://127.0.0.1:8901/index.html?review&debug#sheet=dod'); await ph.waitForTimeout(6000);
  const pfold = await ph.evaluate(() => document.getElementById('dod-panel').classList.contains('folded'));
  await ph.evaluate(() => document.querySelector('#site-table tbody tr[data-dod] td').click()); await ph.waitForTimeout(5000);
  const pt = await ph.evaluate(() => { const vw = innerWidth, q = s => document.querySelector(s), b = q('.tag-txt') && q('.tag-txt').getBoundingClientRect(),
      bar = q('#bar').getBoundingClientRect(), m = q('#map').getBoundingClientRect(), pn = q('#dod-panel').getBoundingClientRect();
    return { tag: !!b, inside: !!b && b.left >= 0 && b.right <= vw && b.top >= bar.bottom && b.bottom < m.bottom, wideTag: !!b && b.width >= vw - 24,
             clear: !!b && (pn.top >= b.bottom || pn.bottom <= b.top), mapH: Math.round(m.height), wide: document.documentElement.scrollWidth > vw,
             lead: q('.tag-lead polyline') ? q('.tag-lead polyline').getAttribute('points') : '' }; });
  ok(pfold, 'on a phone the terrain panel opens folded');
  ok(pt.tag && pt.inside && pt.wideTag && pt.clear, 'a chosen cluster\'s label is docked under the toolbar, as wide as the screen, clear of the panel');
  ok(pt.mapH > 600 && !pt.wide, 'the table gives the map its room and nothing scrolls sideways (map ' + pt.mapH + ' px, leader ' + (pt.lead || 'none') + ')');
  await ph.close();

  console.log('iframe embed (dirtybusiness.no)');
  const p2 = await ctx.newPage();
  await p2.setViewportSize({width:1600,height:900});
  await p2.goto('http://127.0.0.1:8901/tools/fixtures/embed.html'); await p2.waitForTimeout(4500);
  const fr = p2.frames().find(f=>f.url().includes('index.html'));
  const cv = await fr.evaluate(()=>{
    const c=document.querySelector('#map canvas');
    const box=document.querySelector('#map').getBoundingClientRect();
    return {c:[Math.round(box.width),Math.round(box.height)], t:[c?c.clientWidth:0, c?c.clientHeight:0]};
  });
  ok(cv.t[0]>=cv.c[0]-2 && cv.t[1]>=cv.c[1]-2, 'canvas fills the map in the iframe ('+cv.t+' vs '+cv.c+')');

  // Runs still in review: off the public map, on with ?review, and never
  // carrying the "no plan on record" finding they have not earned.
  console.log('terrain runs in review');
  const pub = await p.evaluate(() => ({ src: (document.querySelector('#run-list label.row .src') || {}).textContent || '', runs: +document.getElementById('count-runs').textContent }));
  ok(pub.runs >= 1 && !/in review/.test(pub.src), 'the public map draws only reviewed runs (' + pub.runs + ')');
  const p3 = await ctx.newPage();
  await p3.goto('http://127.0.0.1:8901/index.html?review'); await p3.waitForTimeout(2500);
  await p3.evaluate(() => {
    const o = maplibregl.Map.prototype._render;
    maplibregl.Map.prototype._render = function(){ if (this.getContainer() && this.getContainer().id === 'map') window.__M = this; return o.apply(this, arguments); };
  });
  await p3.click('#tab-dod'); await p3.waitForTimeout(3000);
  const rev = await p3.evaluate(() => { const m = window.__M, s = m.getSource('dodfp'), fp = s ? s._data.features : [];
    return { src: (document.querySelector('#run-list label.row .src') || {}).textContent || '', runs: +document.getElementById('count-runs').textContent,
             boxes: document.querySelectorAll('#run-list input[type=checkbox]').length, fp: fp.length,
             rasters: m.getStyle().layers.filter(l => l.type === 'raster' && /^dod(-|$)/.test(l.id)).length,
             second: (fp.find(f => f.properties.id !== 'gjerdrum_2007_2020') || { properties: {} }).properties.id || null }; });
  ok(rev.runs >= pub.runs && rev.fp === rev.runs && rev.rasters <= rev.runs && rev.boxes === 1,
     '?review adds the drafts: one switch draws every run, each with its outline (' + rev.runs + ' runs, ' + rev.fp + ' outlines)');
  ok(rev.runs === pub.runs || /in review/.test(rev.src), 'and the legend says how many are in review');
  if (rev.second) {
    const id = rev.second;
    await p3.evaluate(k => { const m = window.__M, f = m.getSource('dodfp')._data.features.find(x => x.properties.id === k);
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
      const walk = c => { if (typeof c[0] === 'number') { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); } else c.forEach(walk); };
      walk(f.geometry.coordinates); m.jumpTo({ center: [(x0 + x1) / 2, (y0 + y1) / 2], zoom: 11 }); }, id);
    for (let i = 0; i < 40 && !(await p3.evaluate(k => !!window.__M.getSource('dod-hit-' + k), id)); i++) await p3.waitForTimeout(300);
    const d = await p3.evaluate(k => { const m = window.__M;
      const s = m.getSource('dod-hit-' + k), f = s ? s._data.features : [];
      return { raster: !!m.getLayer('dod-' + k), n: f.length, flags: f.filter(x => 'np' in x.properties || 'pl' in x.properties).length,
               first: m.getLayoutProperty('dodfar', 'visibility') !== 'none' && (!m.getLayer('dod') || m.getLayoutProperty('dod', 'visibility') !== 'none'),
               at: (() => { const big = f.slice().sort((x, y) => y.properties.a - x.properties.a)[0]; if (!big) return null;
                     const ring = big.geometry.type === 'Polygon' ? big.geometry.coordinates[0] : big.geometry.coordinates[0][0];
                     const c = ring.reduce((q, v) => [q[0] + v[0] / ring.length, q[1] + v[1] / ring.length], [0, 0]);
                     m.jumpTo({ center: c, zoom: 15.5 }); return c; })() }; }, id);
    // A large kommune's click targets take a while to be cut into tiles, and the
    // mean of a ragged outline's vertices can sit a pixel from its edge. Wait for
    // the polygon, then click a point that has it on every side.
    let box3 = null;
    for (let i = 0; i < 20 && !box3; i++) {
      await p3.waitForTimeout(500);
      box3 = await p3.evaluate(k => { const m = window.__M, H = 'dod-hit-' + k, c = m.project(m.getCenter());
        const r = document.getElementById('map').getBoundingClientRect();
        const hit = (x, y) => m.queryRenderedFeatures([x, y], { layers: [H] }).length > 0;
        for (let dy = -60; dy <= 60; dy += 6) for (let dx = -60; dx <= 60; dx += 6) {
          const x = Math.round(c.x + dx), y = Math.round(c.y + dy);
          if (hit(x, y) && hit(x - 4, y) && hit(x + 4, y) && hit(x, y - 4) && hit(x, y + 4)) return [r.left + x, r.top + y];
        }
        return null; }, id);
    }
    box3 = box3 || [720, 272];
    await p3.waitForTimeout(400);
    await p3.mouse.click(box3[0], box3[1]); await p3.waitForTimeout(2500);
    d.text = await p3.evaluate(() => { const e = document.querySelector('.tag .tag-txt'); return e ? e.textContent : ''; });
    const pick = await p3.evaluate(() => { const m = window.__M, s = m.getSource('dodsel'), fs = s ? s._data.features : [];
      return { n: fs.length, one: new Set(fs.map(f => f.properties.c)).size, veil: !!m.getSource('dodmask'),
               row: document.querySelectorAll('#site-table tbody tr[data-dod].sel').length }; });
    ok(d.raster && d.n > 0, 'a second run draws beside the first (' + d.n + ' polygons)');
    ok(d.flags === 0 ? /not checked/.test(d.text) && !/no reguleringsplan/.test(d.text) : d.flags === d.n && !/not checked/.test(d.text),
       d.flags === 0 ? 'an unchecked run says its plan coverage is not checked' : 'a checked run carries a plan finding on every polygon and says so (' + d.flags + ')');
    ok(d.first, 'and the first run stays on');
    ok(pick.n >= 1 && pick.one === 1 && !pick.veil && /changes/.test(d.text),
       'a click on a change goes to its group and outlines it, with nothing veiled (' + pick.n + ' polygons, row marked: ' + pick.row + ')');
    await p3.evaluate(() => document.querySelectorAll('.maplibregl-popup').forEach(e => e.remove()));
  }
  // The TERRAIN CHANGE sheet: the largest sites of the runs on the map, each
  // with its probable origin. A row goes to its cluster and outlines it.
  console.log('terrain change sheet');
  await p3.click('#tab-facility'); await p3.waitForTimeout(500);
  await p3.click('#tab-dod'); await p3.waitForTimeout(1500);
  const ts = await p3.evaluate(() => {
    const rows = [...document.querySelectorAll('#site-table tbody tr[data-dod]')];
    const key = k => [...document.querySelectorAll('#site-table thead th')].findIndex(th => th.dataset.key === k);
    const num = s => +String(s).replace(/[^0-9]/g, '');
    const plan = r => r.cells[key('__plan')].textContent.trim();
    return { title: document.getElementById('deck-title').textContent,
             head: [...document.querySelectorAll('#site-table thead th .lab')].map(e => e.textContent.replace(/[ ↓↑]+$/, '')),
             n: rows.length, runs: new Set(rows.map(r => r.dataset.run)).size,
             forest: rows.filter(r => r.dataset.kind === 'forest').length,
             type: rows.filter(r => r.cells[key('__type')].textContent.trim().length > 4).length,
             signs: rows.every(r => /^(\+[\d ]+|0)$/.test(r.cells[key('dep')].textContent.trim()) && /^(−[\d ]+|0)$/.test(r.cells[key('exc')].textContent.trim())),
             plan: [...new Set(rows.map(r => plan(r).replace(/ · ≈ \d+ %$/, '').replace(/ · \d+ reguleringsplaner$/, '').replace(/\d{4}(–\d{4})?/, 'Y')))],
             split: rows.filter(r => / · ≈ \d+ %$/.test(plan(r))).length,
             joined: rows.filter(r => / · \d+ reguleringsplaner/.test(plan(r))).length,
             what: rows.filter(r => r.cells[key('__what')].textContent.trim().length > 2).length,
             moved: rows.slice(0, 12).map(r => num(r.cells[key('__moved')].textContent)),
             foot: document.querySelector('#site-table tfoot') ? document.querySelector('#site-table tfoot').textContent : '',
             key: document.getElementById('sheet-key').textContent, hash: location.hash,
             off: ((rows.find(r => r.dataset.run !== 'gjerdrum_2007_2020') || rows[0] || {dataset: {}}).dataset.dod) || null };
  });
  ok(/LARGEST CLUSTERS/.test(ts.title) && ts.head[0] === 'NEAREST PLACE NAME' && ts.head[2] === 'PROBABLE ORIGIN' && ts.head[3] === 'TYPOLOGY', 'the TERRAIN CHANGE tab opens its own sheet of clusters (' + ts.head.slice(0, 5).join(', ') + ')');
  ok(ts.n >= 20 && ts.runs >= 2 && ts.forest >= 1, 'with the largest clusters of every run in view, the ones under forest too (' + ts.n + ' clusters, ' + ts.forest + ' under forest, ' + ts.runs + ' runs)');
  ok(ts.what === ts.n && ts.type === ts.n, 'every cluster names a probable origin and carries a typology');
  ok(ts.signs && /≈/.test(ts.head.join(' ')), 'figures are approximate and signed: + for deposit, − for excavation / erosion');
  ok(ts.split === 0, 'no cluster mixes ground under a reguleringsplan with ground under none (' + ts.split + ' mixed)');
  ok(ts.joined >= 1, 'and a work regulated in sections is one cluster, with the number of its reguleringsplaner (' + ts.joined + ' such clusters)');
  ok(ts.plan.every(s => /reguleringsplan/.test(s)) && ts.plan.includes('no reguleringsplan'), 'the plan is called a reguleringsplan, and its absence is said plainly (' + ts.plan.join(' | ') + ')');
  ok(ts.moved.every((v, i) => !i || v <= ts.moved[i - 1]), 'largest volume moved first (' + ts.moved.slice(0, 3).join(', ') + ')');
  ok(/Σ/.test(ts.foot) && /not a finding/.test(ts.key) && /sheet=dod/.test(ts.hash), 'with a totals line, a key that calls the names leads, and its own address');
  // The clusters themselves, as written by tools/make_dod_sites.py.
  { const sites = JSON.parse(fs.readFileSync(__dirname + '/../data/dod_sites.json', 'utf8')).sites;
    const names = {}; sites.forEach(d => { const k = d.kommune + '|' + d.place; names[k] = (names[k] || 0) + 1; });
    const twice = Object.keys(names).filter(k => names[k] > 1);
    const roads = sites.filter(d => d.road), far = sites.filter(d => !d.road && !d.ls && (d.bounds[3] - d.bounds[1]) * 111 > 6);
    ok(twice.length === 0, 'within a kommune no two clusters carry the same name (' + twice.slice(0, 3).join(', ') + ')');
    ok(roads.length >= 5 && roads.some(d => d.plans >= 3), 'a road or a railway is one cluster over the reguleringsplaner of its sections (' + roads.length + ' such clusters)');
    ok(far.length === 0, 'and nothing else is gathered over kilometres: nearness is the base (' + far.map(d => d.id).join(' ') + ')'); }
  if (ts.off) {
    await p3.click('#site-table tbody tr[data-dod="' + ts.off + '"] td:nth-child(2)'); await p3.waitForTimeout(2500);
    const go = await p3.evaluate(id => { const tr = document.querySelector('#site-table tbody tr[data-dod="' + id + '"]');
      const m = window.__M, c = m.getCenter(), k = tr.dataset.run;
      return { on: document.getElementById('filter-dod').checked, layer: !!m.getLayer('dod-' + k) || !!m.getSource('dod-' + k), zoom: m.getZoom(), c: [c.lng, c.lat] }; }, ts.off);
    ok(go.on && go.layer && go.zoom > 8, 'a row goes to its cluster (zoom ' + go.zoom.toFixed(1) + ')');
    const mark = () => p3.evaluate(id => { const m = window.__M, s = m.getSource('dodsel'), fs = s ? s._data.features : [];
      const L = m.getStyle().layers.map(l => l.id), tr = document.querySelector('#site-table tbody tr[data-dod="' + id + '"]');
      const shapes = (m.getSource(tr.dataset.run === 'gjerdrum_2007_2020' ? 'dod-hit' : 'dod-hit-' + tr.dataset.run) || {})._data;
      const mine = new Set(); if (fs.length && shapes) shapes.features.forEach(x => mine.add(JSON.stringify(x.geometry.coordinates[0][0])));
      return { n: fs.length, one: new Set(fs.map(f => f.properties.c)).size, sel: tr.classList.contains('sel'),
               own: fs.length && shapes ? fs.every(f => mine.has(JSON.stringify(f.geometry.coordinates[0][0]))) : null,
               veil: !!m.getSource('dodmask') || L.includes('dodmask'),
               above: L.indexOf('dodsel-line') > L.indexOf(tr.dataset.run === 'gjerdrum_2007_2020' ? 'dod' : 'dod-' + tr.dataset.run) }; }, ts.off);
    let v1 = await mark();
    for (let i = 0; i < 24 && (!v1.n || v1.own === null); i++) { await p3.waitForTimeout(500); v1 = await mark(); }   // the line waits for the run to load
    ok(v1.n >= 1 && v1.one === 1 && v1.sel && v1.above, 'and a line is drawn round that cluster, above the change raster (' + v1.n + ' polygons)');
    ok(v1.own === true && !v1.veil, 'the line follows the run\'s own change polygons, and nothing else is veiled');
    const tag = await p3.evaluate(() => { const e = document.querySelector('.tag .tag-txt'), w = document.querySelector('.tag');
      if (!e) return { text: '' };
      const m = window.__M, at = w.getBoundingClientRect(), b = e.getBoundingClientRect();
      const edge = m.getLayer('dodsel-edge') ? JSON.stringify(m.getFilter('dodsel-edge')) : '';
      return { text: e.textContent, font: getComputedStyle(e).fontFamily, lead: (() => { const q = (w.querySelector('svg.tag-lead polyline').getAttribute('points') || '').trim().split(' ').map(t => t.split(',').map(Number)); return q.length === 3 ? { len: Math.hypot(q[1][0], q[1][1]), flat: q[1][1] === q[2][1], oblique: Math.round(Math.atan2(Math.abs(q[1][1]), Math.abs(q[1][0])) * 180 / Math.PI) } : null; })(), dots: w.querySelectorAll('circle').length, boxed: ['Left', 'Right', 'Bottom'].some(k => getComputedStyle(e)['border' + k + 'Width'] !== '0px'),
               off: !(at.left >= b.left && at.left <= b.right && at.top >= b.top && at.top <= b.bottom), inMap: b.left >= 0 && b.right <= innerWidth, close: !!e.querySelector('.tag-x'), edge,
               clear: ['bar', 'dod-panel'].every(id => { const o = document.getElementById(id).getBoundingClientRect(); return !o.width || o.right < b.left || o.left > b.right || o.bottom < b.top || o.top > b.bottom; }) }; });
    ok(/changes/.test(tag.text) && tag.lead && tag.lead.flat && [30, 45, 60].includes(tag.lead.oblique) && tag.dots === 0,
       'and its label hangs from a shelf at the end of one oblique leader that starts on the perimeter (' + (tag.lead ? tag.lead.oblique + '°, ' + Math.round(tag.lead.len) + ' px' : 'no leader') + ')');
    ok(tag.lead && tag.lead.len >= 100 && tag.off && tag.inMap, 'well out from the cluster, and inside the map');
    ok(tag.clear, 'clear of the toolbar and of the panel');
    ok(/Cutive Mono/.test(tag.font) && /≈ [+−]/.test(tag.text), 'set in the face of the table, the figures signed after the ≈');
    ok(new RegExp('"r"\\],"' + (await p3.evaluate(id => document.querySelector('#site-table tbody tr[data-dod="' + id + '"]').dataset.run, ts.off)) + '"').test(tag.edge),
       'the chosen cluster is outlined along the exact edge of its changes');
    await p3.keyboard.press('Escape'); await p3.waitForTimeout(500);
    const esc = await mark();
    ok(esc.n === 0 && !esc.sel && !(await p3.evaluate(() => !!document.querySelector('.tag'))), 'Esc lets go of it, and so does the mark on the label (' + tag.close + ')');
    await p3.click('#site-table tbody tr[data-dod="' + ts.off + '"] td:nth-child(2)'); await p3.waitForTimeout(1500);
    await p3.click('#site-table tbody tr[data-dod="' + ts.off + '"] td:nth-child(2)'); await p3.waitForTimeout(1500);
    const v2 = await mark();
    ok(v2.n === 0 && !v2.sel, 'the same row again lets go of it');
    await p3.click('#site-table tbody tr[data-dod="' + ts.off + '"] td:nth-child(2)'); await p3.waitForTimeout(1500);
  }
  await p3.click('#tab-facility'); await p3.waitForTimeout(1500);
  const backT = await p3.evaluate(() => ({ uid: document.querySelectorAll('#site-table tbody tr[data-uid]').length, dod: document.querySelectorAll('#site-table tbody tr[data-dod]').length }));
  const v3 = await p3.evaluate(() => { const m = window.__M, s = m.getSource('dodsel');
    return { n: s ? s._data.features.length : 0, dod: m.getLayoutProperty('dodfar', 'visibility') !== 'none',
             base: (document.querySelector('input[name="basemap"]:checked') || {}).value }; });
  ok(backT.uid > 0 && backT.dod === 0 && v3.n === 0 && !v3.dod, "and RECEPTION brings the sites back and takes terrain change off the map (" + backT.uid + ")");
  ok(v3.base === 'satellite', 'with the background that was there before the relief (' + v3.base + ')');
  // Each tab draws its own family on the map; ALL draws them all.
  console.log('tabs and families');
  const fam2 = {};
  for (const tab of ['facility', 'project', 'dod', 'all']) {
    await p3.click('#tab-' + tab); await p3.waitForTimeout(700);
    fam2[tab] = await p3.evaluate(() => { const m = window.__M, f = JSON.stringify(m.getFilter('site-sym'));
      return { rec: /AK_AH_001/.test(f), proj: /CP_001/.test(f), none: /\["==",\["get","uid"\],""\]/.test(f), scoped: /"uid"/.test(f),
               dod: !!m.getLayer('dodfar') && m.getLayoutProperty('dodfar', 'visibility') !== 'none' }; });
  }
  ok(fam2.facility.rec && !fam2.facility.proj && !fam2.facility.dod, 'RECEPTION draws the reception sites only');
  ok(fam2.project.proj && !fam2.project.rec && !fam2.project.dod, 'CONSTRUCTION draws the projects only');
  ok(fam2.dod.none && fam2.dod.dod, 'TERRAIN CHANGE draws the terrain change and no site');
  ok(!fam2.all.scoped && fam2.all.dod, 'and ALL draws every family together');
  await p3.close();
  const p4 = await ctx.newPage();
  await p4.goto('http://127.0.0.1:8901/index.html#sheet=dod'); await p4.waitForTimeout(3000);
  const pubT = await p4.evaluate(() => ({ on: document.getElementById('filter-dod').checked,
    rows: [...document.querySelectorAll('#site-table tbody tr[data-dod]')].map(r => r.dataset.run),
    tab: document.getElementById('tab-dod').getAttribute('aria-selected'), runs: +document.getElementById('count-runs').textContent }));
  ok(pubT.tab === 'true' && pubT.on && pubT.rows.length > 0 && pubT.rows.includes('gjerdrum_2007_2020') && new Set(pubT.rows).size === pubT.runs,
     'the public map opens the sheet from its address, terrain change on, with the clusters of every published run (' + pubT.rows.length + ' rows, ' + pubT.runs + ' runs)');
  await p4.close();

  console.log(errs.length? 'JS errors:\n'+errs.join('\n') : 'no JS errors');
  if (errs.length) fail++;
  console.log(fail? '\n'+fail+' FAILING' : '\nall green');
  await b.close(); process.exit(fail?1:0);
})();
