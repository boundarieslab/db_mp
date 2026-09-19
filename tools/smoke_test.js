// Smoke test for index.html. Needs playwright and a static server on 8901:
//     python3 -m http.server 8901 --bind 127.0.0.1        (from the repo root)
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
const csv = u => fs.readFileSync(HERE + (u.includes('2PACX-1vS1KaV') ? '/facilities.csv' : '/projects.csv'), 'utf8');
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
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  // Ignored: the site's typeface comes from Cargo, which a sandbox need not
  // reach; pictograms are missing for the fixtures' invented types; and a
  // request aborted because a layer was switched off mid-flight is the browser
  // doing the right thing. A 404 on a DoD tile is the design: only tiles
  // containing change are stored.
  const IGNORE = /favicon|freight\.cargo\.site|picto_grammar|data\/dod\//;
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
  ok(bar0.tabs === 'all,facility,project,dod,flow' && bar0.tabsOnTable,
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
  await p.click('#tab-dod'); await p.waitForTimeout(3000);
  ok(await p.evaluate(() => document.getElementById('filter-dod').checked), 'the terrain tab switches its run on');
  const z1 = await p.evaluate(()=>window.__M.getMaxZoom());
  ok(z1===19, 'DoD layer does not raise it (got '+z1+')');
  const dodData = await p.evaluate(() => {
    const s = window.__M.getSource('dod-hit'); const f = s ? s._data.features : [];
    return { n: f.length, ls: f.filter(x => x.properties.ls).length,
             none: f.filter(x => x.properties.pl === 0).length, np: f.filter(x => 'np' in x.properties).length };
  });
  ok(dodData.n === 1320 && dodData.np === 0, 'the plan flag is the new one (' + dodData.n + ' polygons, ' + dodData.np + ' old flags)');
  ok(dodData.none === 1045 && dodData.ls === 2, 'with 1 045 unplanned and the landslide pair marked (' + dodData.none + ', ' + dodData.ls + ')');

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
    const f = m.getSource('fp')._data.features.find(x => x.properties.uid === 'AK_AH_001');
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
  await p.waitForTimeout(400);
  const shut = await p.evaluate(() => {
    const d = document.getElementById('deck');
    return { closed: !d.classList.contains('half') && !d.classList.contains('full'),
             h: Math.round(d.getBoundingClientRect().height),
             chips: document.querySelectorAll('#deck-chips .chip').length };
  });
  ok(shut.closed && shut.h < 40, 'the table starts closed (' + shut.h + 'px)');
  ok(shut.chips >= 3, 'with the colour key in its header even when closed (' + shut.chips + ' chips)');
  const headToggle = await p.evaluate(async () => {
    const d = document.getElementById('deck'), head = document.querySelector('.deck-head');
    const h = () => Math.round(d.getBoundingClientRect().height);
    head.click(); await new Promise(r => setTimeout(r, 400)); const open = h();
    head.click(); await new Promise(r => setTimeout(r, 400)); const shut = h();
    return { open, shut };
  });
  ok(headToggle.open > 150 && headToggle.shut < 40,
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
  await p.click('.deck-head .count'); await p.waitForTimeout(500);  // and back open

  const dk = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#site-table tbody tr')];
    const head = [...document.querySelectorAll('#site-table thead th')].map(t => t.textContent.trim());
    const ths = [...document.querySelectorAll('#site-table thead th')];
    const si = ths.findIndex(t => /[↓↑]/.test(t.textContent));
    return { n: rows.length, head, sorted: rows.map(r => r.children[si].textContent.trim()),
             sym: rows.every(r => r.children[5].querySelector('svg')),
             nogeo: rows.filter(r => r.classList.contains('nogeo')).length,
             sel: rows.filter(r => r.classList.contains('sel')).length };
  });
  ok(dk.n === 5, 'the deck lists every reception record, located or not (' + dk.n + ')');
  ok(/UID/.test(dk.head[0]) && /MATERIAL/.test(dk.head[4]) && /TYPE/.test(dk.head[5]) && /AREA/.test(dk.head[6]),
     'TYPE follows MATERIAL (' + dk.head.join('|') + ')');
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
    head: document.querySelector('#site-table thead th:nth-child(2)').textContent,
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
  await p.click('#compass'); await p.waitForTimeout(1300);
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
    return { all: ['fp-fill', 'fp-line', 'fp-soft'].every(v), n: f.length,
             col: (f.find(x => x.properties.uid === 'AK_AH_001') || { properties: {} }).properties.col,
             lineCol: JSON.stringify(m.getPaintProperty('fp-line', 'line-color')),
             fill: JSON.stringify(m.getPaintProperty('fp-fill', 'fill-opacity')) };
  });
  ok(fp.all, 'footprints draw without being asked');
  ok(fp.n === 19, 'all 19 footprints are in the source (got ' + fp.n + ')');
  ok(fp.col === '#FF0000' && /col/.test(fp.lineCol), 'they are coloured by status, not black (' + fp.col + ')');
  ok(/0\.14/.test(fp.fill) && /match/.test(fp.fill),
     'with a see-through fill whose weight follows the status, and no glow');

  await p.evaluate(() => { location.hash = 'site=AK_AH_001'; });
  await p.waitForTimeout(3000);
  const frame = await p.evaluate(() => {
    const m = window.__M, b = m.getBounds();
    const f = m.getSource('fp')._data.features.find(x => x.properties.uid === 'AK_AH_001');
    let w = 180, so = 90, e = -180, n = -90;
    (function walk(c) { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); so = Math.min(so, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); })(f.geometry.coordinates);
    return { inside: b.getWest() <= w && b.getEast() >= e && b.getSouth() <= so && b.getNorth() >= n,
             hit: m.queryRenderedFeatures({ layers: ['fp-fill'] }).length };
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

  console.log(errs.length? 'JS errors:\n'+errs.join('\n') : 'no JS errors');
  if (errs.length) fail++;
  console.log(fail? '\n'+fail+' FAILING' : '\nall green');
  await b.close(); process.exit(fail?1:0);
})();
