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
  await ctx.route(/kartverket|arcgisonline|geonorge|wayback/, r=>{
    hits.push(r.request().url());
    r.fulfill({status:200,contentType:'image/png',body:PX});
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

  console.log('zoom limits');
  const z0 = await p.evaluate(()=>window.__M.getMaxZoom());
  ok(z0===19, 'map maxZoom is 19 / Leaflet 20 without the DoD layer (got '+z0+')');
  await p.click('.filter-toggle'); await p.waitForTimeout(200);
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
    const pt = m.project([11.52031, 59.81372]);
    const search = document.querySelector('.search-box').getBoundingClientRect();
    const sbw = document.getElementById('sidebar').getBoundingClientRect().width;
    const left = search.right, right = innerWidth - sbw;
    return { x: Math.round(pt.x), y: Math.round(pt.y),
             band: [Math.round(left), Math.round(right)],
             mid: Math.round((left + right) / 2), h: innerHeight, zoom: m.getZoom() };
  });
  // the site should sit near the middle of the strip you can actually see,
  // not under the panel and not behind the controls
  ok(fr0.x > fr0.band[0] && fr0.x < fr0.band[1],
     'site is inside the visible strip (x=' + fr0.x + ' in ' + fr0.band + ')');
  ok(Math.abs(fr0.x - fr0.mid) < 60,
     'site is centred in it (off by ' + Math.abs(fr0.x - fr0.mid) + 'px)');
  ok(Math.abs(fr0.y - fr0.h / 2) < 60,
     'site is vertically centred (off by ' + Math.round(Math.abs(fr0.y - fr0.h/2)) + 'px)');

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
