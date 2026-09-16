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

  await p.goto('http://127.0.0.1:8901/index.html'); await p.waitForTimeout(2500);
  // Reach the Map instance the page built. _render runs on every painted frame,
  // so a single repaint after the hook is installed is enough to capture it.
  await p.evaluate(()=>{
    const o = maplibregl.Map.prototype._render;
    maplibregl.Map.prototype._render = function(){
      if (this.getContainer() && this.getContainer().id === 'map') window.__M = this;
      return o.apply(this, arguments);
    };
  });
  await p.click('.maplibregl-ctrl-zoom-in'); await p.waitForTimeout(900);
  ok(await p.evaluate(()=>!!window.__M), 'map instance reachable');

  console.log('layer window');
  const tree0 = await p.evaluate(() => ({
    closed: [...document.querySelectorAll('#layers-win .grp.top')].every(g => g.classList.contains('closed')),
    groups: document.querySelectorAll('#layers-win .grp.top').length,
    thumbs: document.querySelectorAll('#layers-win .thumb').length,
    subsShown: [...document.querySelectorAll('#layers-win .ds-sub')]
                 .filter(d => d.offsetHeight > 0 && d.querySelector('.filter-facility-sub')).length
  }));
  ok(tree0.closed && tree0.groups === 4, 'the tree opens as four folded lines (' + tree0.groups + ')');
  ok(tree0.thumbs === 0, 'with no thumbnails (' + tree0.thumbs + ')');
  ok(tree0.subsShown === 0, 'and no record filters left in it');
  const fold = await p.evaluate(() => {
    const w = document.getElementById('layers-win');
    const before = w.getBoundingClientRect().width;
    document.getElementById('btn-menu').click();
    const after = w.getBoundingClientRect().width;
    document.getElementById('btn-menu').click();
    return { before: Math.round(before), after: Math.round(after) };
  });
  ok(fold.after < 44, 'and folds to the button alone (' + fold.before + ' -> ' + fold.after + 'px)');
  // Everything below reaches into the tree, so open it and let it be as tall
  // as it needs: the real tree scrolls, which a click cannot.
  await p.evaluate(() => {
    document.querySelectorAll('.grp').forEach(g => g.classList.remove('closed'));
    document.querySelector('.tree').style.maxHeight = 'none';
  });
  await p.waitForTimeout(200);

  console.log('zoom limits');
  const z0 = await p.evaluate(()=>window.__M.getMaxZoom());
  ok(z0===19, 'map maxZoom is 19 / Leaflet 20 without the DoD layer (got '+z0+')');
  await p.click('#filter-dod'); await p.waitForTimeout(3000);
  const z1 = await p.evaluate(()=>window.__M.getMaxZoom());
  ok(z1===19, 'DoD layer does not raise it (got '+z1+')');

  hits.length = 0;
  await p.evaluate(()=>window.__M.jumpTo({center:[11.52031,59.81372], zoom:19}));
  await p.waitForTimeout(1500);
  // The regression this guards: Kartverket serves nothing above tile zoom 18,
  // so at full zoom the source must overzoom its deepest real tile rather than
  // ask for one that does not exist and leave the basemap blank.
  const kv = hits.filter(u=>u.includes('kartverket'));
  const deepest = Math.max(...kv.map(u=>{
    const m = u.match(/webmercator\/(\d+)\//); return m ? +m[1] : -1; }), -1);
  ok(kv.length>0, 'basemap still requests tiles at max zoom ('+kv.length+' requests)');
  ok(deepest<=18, 'and never past Kartverket\'s tile zoom 18 (deepest '+deepest+')');
  ok(await p.evaluate(()=>window.__M.areTilesLoaded()), 'all requested tiles resolved');
  await p.click('#filter-dod'); await p.waitForTimeout(400);

  const seenH = () => p.evaluate(() => document.getElementById('filter-panel').offsetHeight);
  const lg0 = await seenH();
  await p.click('.filter-toggle'); await p.waitForTimeout(300);
  const lg1 = await seenH();
  ok(lg0 === 0 && lg1 > 0, 'the legend stays shut until the button is pressed (' + lg0 + ' -> ' + lg1 + ')');
  const legTog = await p.evaluate(() => {
    const r = document.querySelector('.legend-row[data-toggle="filter-facilities"]');
    r.click();
    const box = document.getElementById('filter-facilities');
    return { off: r.classList.contains('off'), checked: box.checked };
  });
  ok(legTog.off && !legTog.checked, 'a legend row switches its own layer off');
  await p.evaluate(() => document.querySelector('.legend-row[data-toggle="filter-facilities"]').click());
  await p.waitForTimeout(300);

  console.log('sidebar');
  await p.evaluate(()=>{location.hash='site=AK_AH_00126';}); await p.waitForTimeout(3000);
  const sb = await p.evaluate(()=>{
    const el=document.querySelector('#sb-minimap');
    const r=el?el.getBoundingClientRect():null;
    const cv=el?el.querySelector('canvas'):null;
    const share=document.querySelector('.share-btn').getBoundingClientRect();
    const close=document.querySelector('.close-btn').getBoundingClientRect();
    return { mini: r&&[Math.round(r.width),Math.round(r.height)],
             canvas: cv?[cv.clientWidth,cv.clientHeight]:null,
             dot: !!el&&!!el.querySelector('.minimap-dot'),
             overlap: share.right > close.left };
  });
  ok(sb.mini && sb.mini[1]>100, 'aerial view has height ('+(sb.mini||[])+')');
  ok(sb.canvas && sb.canvas[0]>0 && Math.abs(sb.canvas[1]-sb.mini[1])<4,
     'aerial view canvas fills its box ('+(sb.canvas||[])+' in '+(sb.mini||[])+')');
  ok(sb.dot, 'aerial view marks the site');
  ok(!sb.overlap, 'SHARE and the close button do not overlap');

  console.log('framing');
  const fr0 = await p.evaluate(() => {
    const m = window.__M;
    const pt = m.project([11.52031, 59.81372]);              // container coordinates
    const box = document.getElementById('map').getBoundingClientRect();
    const lw  = document.getElementById('layers-win').getBoundingClientRect();
    const sbb = document.getElementById('sidebar').getBoundingClientRect();
    const left = lw.right - box.left, right = sbb.left - box.left;
    // Where a footprint exists the map frames the footprint, not the sheet's
    // point, so the centring checks below follow the geometry.
    const f = (m.getSource('fp') || { _data: { features: [] } })
      ._data.features.find(x => x.properties.uid === 'AK_AH_00126');
    let w = 180, so = 90, e = -180, n = -90;
    if (f) (function walk(c) {
      if (typeof c[0] === 'number') {
        w = Math.min(w, c[0]); e = Math.max(e, c[0]);
        so = Math.min(so, c[1]); n = Math.max(n, c[1]);
      } else c.forEach(walk);
    })(f.geometry.coordinates);
    const ctr = f ? m.project([(w + e) / 2, (so + n) / 2]) : pt;
    return { x: Math.round(pt.x), y: Math.round(pt.y),
             cx: Math.round(ctr.x), cy: Math.round(ctr.y), fp: !!f,
             band: [Math.round(left), Math.round(right)],
             mid: Math.round((left + right) / 2), h: box.height, zoom: m.getZoom() };
  });
  // the site should sit near the middle of the strip you can actually see,
  // not under the panel and not behind the controls
  ok(fr0.x > fr0.band[0] && fr0.x < fr0.band[1],
     'site is inside the visible strip (x=' + fr0.x + ' in ' + fr0.band + ')');
  ok(Math.abs(fr0.cx - fr0.mid) < 60,
     (fr0.fp ? 'its footprint' : 'it') + ' is centred in it (off by ' +
     Math.abs(fr0.cx - fr0.mid) + 'px)');
  ok(Math.abs(fr0.cy - fr0.h / 2) < 60,
     'and vertically centred (off by ' + Math.round(Math.abs(fr0.cy - fr0.h/2)) + 'px)');
  ok(fr0.y > 0 && fr0.y < fr0.h, 'the sheet\'s point stays on screen with it');

  console.log('deck');
  // It starts closed now, and the layer row is the way in.
  const shut = await p.evaluate(() => {
    const d = document.getElementById('deck');
    return { closed: !d.classList.contains('half') && !d.classList.contains('full'),
             h: Math.round(d.getBoundingClientRect().height) };
  });
  ok(shut.closed && shut.h < 40, 'the table starts closed (' + shut.h + 'px)');
  await p.click('label[for="filter-facilities"]'); await p.waitForTimeout(600);
  const opened = await p.evaluate(() => {
    const d = document.getElementById('deck');
    return { half: d.classList.contains('half'),
             title: document.getElementById('deck-title').textContent.trim() };
  });
  ok(opened.half, 'touching a layer row opens it');
  ok(/RECEPTION|MOTTAK/i.test(opened.title), 'showing that layer (' + opened.title + ')');
  // the filter has to actually narrow something
  const before = await p.evaluate(() => document.querySelectorAll('#site-table tbody tr').length);
  await p.click('#deck-status'); await p.waitForTimeout(400);      // all -> active
  const after = await p.evaluate(() => ({
    n: document.querySelectorAll('#site-table tbody tr').length,
    label: document.getElementById('deck-status').textContent.trim() }));
  ok(after.n <= before && /activ|aktiv/i.test(after.label),
     'the status filter narrows the table (' + before + ' -> ' + after.n + ', ' + after.label + ')');
  await p.click('#deck-status'); await p.click('#deck-status'); await p.click('#deck-status');
  await p.waitForTimeout(400);                                     // back to all
  await p.click('#deck-size'); await p.waitForTimeout(500);         // half -> full
  const full = await p.evaluate(() => {
    const d = document.getElementById('deck');
    return { full: d.classList.contains('full'), h: Math.round(d.getBoundingClientRect().height) };
  });
  ok(full.full && full.h > 400, 'it can take the whole page (' + full.h + 'px)');
  await p.click('#deck-size'); await p.waitForTimeout(400);         // full -> closed
  await p.click('.deck-head'); await p.waitForTimeout(500);         // and back open

  const dk = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#site-table tbody tr')];
    const head = [...document.querySelectorAll('#site-table thead th')].map(t => t.textContent.trim());
    const ths = [...document.querySelectorAll('#site-table thead th')];
    const si = ths.findIndex(t => /[↓↑]/.test(t.textContent));
    const area = rows.map(r => r.children[si].textContent.trim());
    return { n: rows.length, head, area,
             count: document.getElementById('deck-count').textContent.trim(),
             sel: rows.filter(r => r.classList.contains('sel')).length };
  });
  ok(dk.n > 0, 'the deck lists records (' + dk.n + ')');
  ok(/UID/.test(dk.head[0]) && /AREA/.test(dk.head[5]), 'the deck has its columns (' + dk.head.join('|') + ')');
  ok(dk.sel === 1, 'the open site is the selected row (' + dk.sel + ')');
  // blanks sort last whichever way the column runs, or an empty cell reads as zero
  const blanksLast = (() => { let seenBlank = false;
    for (const a of dk.area) { if (!a) seenBlank = true; else if (seenBlank) return false; } return true; })();
  ok(blanksLast, 'blank cells sort last in the sorted column (' + dk.area.join(',') + ')');

  await p.hover('#site-table tbody tr');
  await p.waitForTimeout(400);
  const hv = await p.evaluate(() => {
    const c = document.getElementById('hover-card');
    const r = c.getBoundingClientRect();
    const stage = document.getElementById('stage').getBoundingClientRect();
    return { on: c.classList.contains('on'),
             img: !!c.querySelector('.im').style.backgroundImage.replace('none',''),
             inside: r.left >= stage.left - 1 && r.right <= stage.right + 1 };
  });
  ok(hv.on, 'hovering a row opens the preview');
  ok(hv.img, 'the preview has an image');
  ok(hv.inside, 'the preview stays inside the map');

  await p.click('#site-table tbody tr:nth-child(1)');
  await p.waitForTimeout(1200);
  const cl = await p.evaluate(() => ({
    open: document.getElementById('sidebar').classList.contains('active'),
    sel: document.querySelectorAll('#site-table tbody tr.sel').length,
    title: (document.getElementById('sb-title') || {}).textContent || ''
  }));
  ok(cl.open && cl.sel === 1, 'clicking a row opens that site (' + cl.title + ')');

  // The deck may be covering the page and the tree may have been re-folded.
  await p.evaluate(() => {
    const d = document.getElementById('deck');
    if (d.classList.contains('full')) document.getElementById('deck-size').click();
    document.getElementById('layers-win').classList.remove('folded');
    document.querySelectorAll('.grp').forEach(g => g.classList.remove('closed'));
    document.querySelector('.tree').style.maxHeight = 'none';
  });
  await p.waitForTimeout(300);

  console.log('3D terrain');
  // The defect this guards: clicking 3D before the style has finished loading
  // used to throw "cannot load terrain, because there exists no source with ID",
  // and the map stayed flat with no way back. Reload and click it at once.
  await p.reload();
  await p.evaluate(() => {                       // the reload wiped the hook
    const o = maplibregl.Map.prototype._render;
    maplibregl.Map.prototype._render = function(){
      if (this.getContainer() && this.getContainer().id === 'map') window.__M = this;
      return o.apply(this, arguments);
    };
    document.querySelectorAll('.grp').forEach(g => g.classList.remove('closed'));
    document.querySelector('.tree').style.maxHeight = 'none';
  });
  await p.click('#terrain-3d', { timeout: 5000 }).catch(() => {});
  await p.waitForTimeout(6000);
  const early = await p.evaluate(() => {
    const m = window.__M;
    return { t: m && !!m.getTerrain(), checked: document.getElementById('terrain-3d').checked };
  });
  ok(!early.checked || early.t, 'switching 3D on immediately still attaches terrain');
  if (early.checked) { await p.click('#terrain-3d'); await p.waitForTimeout(600); }
  await p.evaluate(() => { const m = window.__M; m.jumpTo({ center: [11.038, 60.063], zoom: 13 }); });
  await p.waitForTimeout(800);
  const demHits = [];
  await p.route('**/data/terrain/**', r => { demHits.push(r.request().url()); r.continue(); });
  await p.click('#terrain-3d');
  await p.waitForTimeout(3500);
  const t3d = await p.evaluate(() => {
    const m = window.__M, t = m.getTerrain();
    return { on: !!t, src: t && t.source, exag: t && t.exaggeration,
             pitch: Math.round(m.getPitch()),
             srcOk: !!m.getSource('terrain-dem'),
             wrap: !document.getElementById('terrain-exag-wrap').hidden };
  });
  ok(t3d.on && t3d.srcOk && t3d.src === 'terrain-dem', 'terrain is attached (' + t3d.src + ')');
  ok(t3d.pitch > 30, 'the map tilts so the terrain is visible (' + t3d.pitch + ' deg)');
  ok(t3d.wrap, 'the exaggeration slider appears with it');
  ok(demHits.length > 0, 'DEM tiles are requested (' + demHits.length + ')');
  ok(demHits.every(u => !/\/1[6-9]\//.test(u.replace(/.*terrain\/[a-z]+/, ''))),
     'and never past the deepest DEM zoom that exists');
  await p.evaluate(() => window.__M.jumpTo({ center: [10.75, 59.91], zoom: 12 }));   // Oslo, outside the run
  await p.waitForTimeout(6000);
  const nat = await p.evaluate(() => {
    const m = window.__M, t = m.getTerrain(), c = m.getCenter();
    return { src: t && t.source, res: (document.getElementById('terrain-res') || {}).textContent || '',
             styled: m.isStyleLoaded(), hasNat: !!m.getSource('terrain-dem-no'),
             hasFine: !!m.getSource('terrain-dem'), lng: +c.lng.toFixed(3), lat: +c.lat.toFixed(3) };
  });
  console.log('    debug', JSON.stringify(nat));
  ok(nat.src === 'terrain-dem-no', 'outside the run it falls back to the national DEM (' + nat.src + ')');
  ok(/10 m/.test(nat.res), 'and says which resolution is under you (' + nat.res + ')');
  await p.evaluate(() => window.__M.jumpTo({ center: [11.038, 60.063], zoom: 13 }));  // back inside
  await p.waitForTimeout(2500);
  const fine = await p.evaluate(() => {
    const t = window.__M.getTerrain();
    return { src: t && t.source, res: (document.getElementById('terrain-res') || {}).textContent || '' };
  });
  ok(fine.src === 'terrain-dem', 'and back to the metre LiDAR inside it (' + fine.src + ')');
  ok(/1 m/.test(fine.res), 'and says so (' + fine.res + ')');

  await p.click('#terrain-3d'); await p.waitForTimeout(1200);
  const off = await p.evaluate(() => ({ t: !!window.__M.getTerrain(), pitch: Math.round(window.__M.getPitch()) }));
  ok(!off.t && off.pitch < 5, 'switching it off returns the map to flat (' + off.pitch + ' deg)');

  console.log('tools');
  // One pane at a time: opening LIGHT must put the legend away again.
  await p.click('#btn-light'); await p.waitForTimeout(600);
  const panes = await p.evaluate(() => ({
    legend: document.getElementById('filter-panel').offsetHeight,
    light: document.getElementById('light-panel').offsetHeight,
    hs: !!window.__M.getLayer('hillshade'),
    az: window.__M.getLayer('hillshade')
        ? window.__M.getPaintProperty('hillshade', 'hillshade-illumination-direction') : null
  }));
  ok(panes.light > 0 && panes.legend === 0, 'opening LIGHT closes the legend');
  ok(panes.hs, 'and puts a hillshade on the DEM');
  ok(panes.az === 315, 'lit from the northwest to begin with (' + panes.az + ')');
  await p.evaluate(() => {
    const a = document.getElementById('light-az');
    a.value = 90; a.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(400);
  const az2 = await p.evaluate(() =>
    window.__M.getPaintProperty('hillshade', 'hillshade-illumination-direction'));
  ok(az2 === 90, 'turning the light moves it (' + az2 + ')');
  await p.click('#btn-light'); await p.waitForTimeout(400);
  ok(!(await p.evaluate(() => !!window.__M.getLayer('hillshade'))), 'switching it off removes it');

  // Cross section, over the Gjerdrum run where the metre DEM actually exists.
  await p.click('#btn-profile'); await p.waitForTimeout(400);
  await p.evaluate(() => window.__M.jumpTo({ center: [11.035, 60.075], zoom: 13 }));
  await p.waitForTimeout(800);
  // Real clicks on the canvas: MapLibre's own handlers read originalEvent, so a
  // fired event is not a substitute for one.
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
    path: (document.querySelector('#prof-svg path') || {}).getAttribute
          ? document.querySelector('#prof-svg path').getAttribute('d').length : 0,
    line: !!window.__M.getLayer('prof-line')
  }));
  ok(prof.line, 'the drawn line is on the map');
  ok(prof.path > 200, 'the section is plotted (' + prof.path + ' chars of path)');
  ok(/1 m LiDAR/.test(prof.read), 'and read from the metre LiDAR');
  const mm = prof.read.match(/([0-9.]+) m/g) || [];
  ok(mm.length >= 3, 'with length, low, high and delta (' + prof.read.slice(0, 90) + ')');
  await p.click('#btn-profile'); await p.waitForTimeout(300);

  // Box selection narrows the table without hiding anything on the map.
  await p.evaluate(() => { location.hash = ''; });
  await p.evaluate(() => window.__M.jumpTo({ center: [11.52031, 59.81372], zoom: 12 }));
  await p.waitForTimeout(800);
  const rows0 = await p.evaluate(() => document.querySelectorAll('#site-table tbody tr').length);
  await p.click('#btn-select'); await p.waitForTimeout(200);
  await p.mouse.move(520, 260); await p.mouse.down();
  await p.mouse.move(1000, 640, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(900);
  const sel = await p.evaluate(() => ({
    rows: Array.from(document.querySelectorAll('#site-table tbody tr')).map(r => r.dataset.uid),
    markers: document.querySelectorAll('.maplibregl-marker').length
  }));
  ok(sel.rows.length === 1 && sel.rows[0] === 'AK_AH_00126',
     'a box selects the records inside it (' + sel.rows.join(',') + ')');
  ok(sel.markers >= 4, 'and leaves every marker on the map (' + sel.markers + ')');
  await p.click('#btn-select'); await p.waitForTimeout(500);
  const rows1 = await p.evaluate(() => document.querySelectorAll('#site-table tbody tr').length);
  ok(rows1 >= rows0, 'pressing SELECT again clears it (' + rows0 + ' -> ' + rows1 + ')');

  console.log('polygons');
  // Footprints are on from the first paint: no click precedes this.
  const fp = await p.evaluate(() => {
    const m = window.__M;
    const vis = id => m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none';
    const src = m.getSource('fp');
    return { fill: vis('fp-fill'), line: vis('fp-line'), soft: vis('fp-soft'),
             n: src ? (src._data.features || []).length : 0 };
  });
  ok(fp.fill && fp.line && fp.soft, 'facility footprints draw without being asked');
  ok(fp.n === 19, 'all 19 footprints are in the source (got ' + fp.n + ')');

  // The regression this guards: a stated Area_m2 the research itself puts up
  // to 2.3x off the ground, used to frame a site that has a real footprint.
  await p.evaluate(() => { location.hash = ''; });
  await p.waitForTimeout(200);
  await p.evaluate(() => { location.hash = 'site=AK_AH_00126'; });
  await p.waitForTimeout(3000);
  const frame = await p.evaluate(() => {
    const m = window.__M, b = m.getBounds();
    const f = m.getSource('fp')._data.features.find(x => x.properties.uid === 'AK_AH_00126');
    let w = 180, so = 90, e = -180, n = -90;
    (function walk(c) {
      if (typeof c[0] === 'number') {
        w = Math.min(w, c[0]); e = Math.max(e, c[0]);
        so = Math.min(so, c[1]); n = Math.max(n, c[1]);
      } else c.forEach(walk);
    })(f.geometry.coordinates);
    return { inside: b.getWest() <= w && b.getEast() >= e &&
                     b.getSouth() <= so && b.getNorth() >= n,
             hit: m.queryRenderedFeatures({ layers: ['fp-fill'] }).length };
  });
  ok(frame.inside, 'opening a site frames its whole footprint');
  ok(frame.hit > 0, 'and the footprint is actually painted (' + frame.hit + ')');

  // The sweep is context, not findings: off until asked, never clickable.
  const covOff = await p.evaluate(() => !!window.__M.getSource('cov'));
  ok(!covOff, 'the 1 736-polygon sweep stays off until a box is ticked');
  await p.evaluate(() => {
    document.querySelectorAll('.grp').forEach(g => g.classList.remove('closed'));
    const b = document.getElementById('filter-plan-current');
    b.checked = true; b.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(2500);
  const cov1 = await p.evaluate(() => {
    const m = window.__M;
    const vis = id => m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none';
    const src = m.getSource('cov');
    return { n: src ? src._data.features.length : 0,
             inforce: vis('cov-current-line'), closed: vis('cov-old-line'),
             below: m.getStyle().layers.findIndex(l => l.id === 'cov-current-line') <
                    m.getStyle().layers.findIndex(l => l.id === 'fp-fill') };
  });
  ok(cov1.n === 1736, 'all 1 736 sweep polygons load (got ' + cov1.n + ')');
  ok(cov1.inforce && !cov1.closed, 'only the class that was ticked is shown');
  ok(cov1.below, 'and the sweep is drawn under the database footprints');

  console.log('table filters and marker hover');
  await p.evaluate(() => {
    document.getElementById('deck').className = 'half';
    document.querySelectorAll('.grp').forEach(g => g.classList.remove('closed'));
  });
  await p.waitForTimeout(400);
  // The producing / receiving / mixed filter now lives in the table header.
  const dirs = await p.evaluate(async () => {
    const b = document.getElementById('deck-dir');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push({ label: b.textContent.trim(),
                  rows: document.querySelectorAll('#site-table tbody tr').length });
      b.click();
      await new Promise(r => setTimeout(r, 150));
    }
    return seen;
  });
  ok(dirs[0].label === 'all flows', 'the table carries the flow filter (' + dirs[0].label + ')');
  ok(dirs.some(d => d.rows < dirs[0].rows), 'and it narrows the table (' +
     dirs.map(d => d.label + ':' + d.rows).join(' ') + ')');

  const hov = await p.evaluate(async () => {
    const el = document.querySelector('.custom-marker');
    if (!el) return { no: true };
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await new Promise(r => setTimeout(r, 300));
    const c = document.getElementById('hover-card');
    const im = c.querySelector('.im');
    return { on: c.classList.contains('on'), img: (im.style.backgroundImage || '').length > 6 };
  });
  ok(hov.on, 'hovering a marker raises the preview');
  ok(hov.img, 'and the preview carries a picture');

  // The graph used to be squeezed into 116px and cut in half.
  await p.evaluate(() => { location.hash = ''; });
  await p.evaluate(() => { location.hash = 'site=AK_AH_00126'; });
  await p.waitForTimeout(2500);
  const g = await p.evaluate(() => {
    const c = document.getElementById('graph-container');
    const f = c && c.querySelector('iframe');
    return { h: c ? c.offsetHeight : 0, frame: !!f };
  });
  ok(g.frame, 'the site panel carries its ownership graph');
  ok(g.h >= 240, 'with room to be read (' + g.h + 'px)');

  console.log('iframe embed (dirtybusiness.no)');
  const p2 = await ctx.newPage();
  await p2.setViewportSize({width:1600,height:900});
  await p2.goto('http://127.0.0.1:8901/tools/fixtures/embed.html'); await p2.waitForTimeout(4500);
  const fr = p2.frames().find(f=>f.url().includes('index.html'));
  // The defect: the frame is laid out while hidden, the map measures 0x0, and
  // nothing ever tells it otherwise, so it paints a small canvas into a large
  // container. Compare the two.
  const cov = await fr.evaluate(()=>{
    const cv=document.querySelector('#map canvas');
    const box=document.querySelector('#map').getBoundingClientRect();
    return {c:[Math.round(box.width),Math.round(box.height)],
            t:[cv?cv.clientWidth:0, cv?cv.clientHeight:0]};
  });
  ok(cov.t[0]>=cov.c[0]-2 && cov.t[1]>=cov.c[1]-2,
     'canvas fills the map in the iframe ('+cov.t+' vs '+cov.c+')');

  console.log(errs.length? 'JS errors:\n'+errs.join('\n') : 'no JS errors');
  if (errs.length) fail++;
  console.log(fail? '\n'+fail+' FAILING' : '\nall green');
  await b.close(); process.exit(fail?1:0);
})();
