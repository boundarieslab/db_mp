// Smoke test for index.html. Needs playwright and a static server on 8901:
//     python3 -m http.server 8901 --bind 127.0.0.1        (from the repo root)
//     node tools/smoke_test.js
// Sheet CSVs and every tile server are stubbed, so it runs offline and the
// result never depends on Kartverket or Esri being up.
const { chromium } = require('playwright');
const fs = require('fs');
const HERE = __dirname + '/fixtures';
const csv = u => fs.readFileSync(HERE + (u.includes('2PACX-1vS1KaV') ? '/facilities.csv' : '/projects.csv'), 'utf8');
const PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
let fail = 0;
const ok = (c,m) => { console.log((c?'  ok   ':'  FAIL ')+m); if(!c) fail++; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport:{width:1440,height:900} });
  await ctx.route('**/docs.google.com/**', r=>r.fulfill({status:200,contentType:'text/csv',body:csv(r.request().url())}));
  await ctx.route(/kartverket|arcgisonline|geonorge|wayback/, r=>r.fulfill({status:200,contentType:'image/png',body:PX}));
  // Leaflet and PapaParse come from a CDN. If a vendor/ copy is present, serve
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
  // doing the right thing. "Failed to load resource" console lines carry no URL,
  // so requests are judged from the request/response events instead.
  // A 404 on a DoD tile is the design: only tiles containing change are stored.
  const IGNORE = /favicon|freight\.cargo\.site|picto_grammar|data\/dod\//;
  p.on('console', m => { const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/.test(t)) errs.push('console: ' + t); });
  p.on('requestfailed', r => { const e = (r.failure() || {}).errorText || '';
    if (!IGNORE.test(r.url()) && !/ABORTED/.test(e)) errs.push('request failed: ' + r.url().slice(0, 90) + ' ' + e); });
  p.on('response', r => { if (r.status() >= 400 && !IGNORE.test(r.url()))
    errs.push('HTTP ' + r.status() + ' ' + r.url().slice(0, 90)); });

  await p.goto('http://127.0.0.1:8901/index.html'); await p.waitForTimeout(2000);
  await p.evaluate(()=>{const o=L.Map.prototype._move;
    L.Map.prototype._move=function(){if(this._container&&this._container.id==='map')window.__M=this;return o.apply(this,arguments);};
    document.querySelector('.leaflet-control-zoom-in').click();});
  await p.waitForTimeout(700);

  console.log('zoom limits');
  const z0 = await p.evaluate(()=>window.__M.getMaxZoom());
  ok(z0===20, 'map maxZoom is 20 without the DoD layer (got '+z0+')');
  await p.click('.filter-toggle'); await p.waitForTimeout(200);
  await p.click('#filter-dod'); await p.waitForTimeout(2500);
  const z1 = await p.evaluate(()=>window.__M.getMaxZoom());
  ok(z1===20, 'DoD layer does not raise it (got '+z1+')');
  await p.evaluate(()=>window.__M.setView([59.81372,11.52031],20)); await p.waitForTimeout(1200);
  const base = await p.evaluate(()=>document.querySelectorAll('.leaflet-tile-pane img').length);
  ok(base>0, 'basemap still draws at max zoom ('+base+' tiles)');
  await p.click('#filter-dod'); await p.waitForTimeout(400);

  console.log('sidebar');
  await p.evaluate(()=>{location.hash='site=AK_AH_00126';}); await p.waitForTimeout(3000);
  const sb = await p.evaluate(()=>{
    const el=document.querySelector('#sb-minimap');
    const r=el?el.getBoundingClientRect():null;
    const share=document.querySelector('.share-btn').getBoundingClientRect();
    const close=document.querySelector('.close-btn').getBoundingClientRect();
    return { mini: r&&[Math.round(r.width),Math.round(r.height)],
             miniTiles: el?el.querySelectorAll('img').length:0,
             overlap: share.right > close.left,
             rows: document.querySelectorAll('#sb-dynamic-content .sb-row, #sb-dynamic-content [class*=row]').length };
  });
  ok(sb.mini && sb.mini[1]>100, 'aerial view has height ('+(sb.mini||[])+')');
  ok(sb.miniTiles>0, 'aerial view loaded tiles ('+sb.miniTiles+')');
  ok(!sb.overlap, 'SHARE and the close button do not overlap');

  console.log('framing');
  const fr0 = await p.evaluate(() => {
    const m = window.__M;
    const site = [59.81372, 11.52031];
    const pt = m.latLngToContainerPoint(site);
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
  await p2.goto('http://127.0.0.1:8901/tools/fixtures/embed.html'); await p2.waitForTimeout(4000);
  const fr = p2.frames().find(f=>f.url().includes('index.html'));
  const cov = await fr.evaluate(()=>{
    const tp=document.querySelector('.leaflet-tile-pane');
    const box=document.querySelector('#map').getBoundingClientRect();
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    tp.querySelectorAll('img').forEach(i=>{const b=i.getBoundingClientRect();
      x0=Math.min(x0,b.left);x1=Math.max(x1,b.right);y0=Math.min(y0,b.top);y1=Math.max(y1,b.bottom);});
    return {c:[Math.round(box.width),Math.round(box.height)],t:[Math.round(x1-x0),Math.round(y1-y0)]};
  });
  ok(cov.t[0]>=cov.c[0] && cov.t[1]>=cov.c[1], 'tiles cover the whole map in the iframe ('+cov.t+' vs '+cov.c+')');

  console.log(errs.length? 'JS errors:\n'+errs.join('\n') : 'no JS errors');
  if (errs.length) fail++;
  console.log(fail? '\n'+fail+' FAILING' : '\nall green');
  await b.close(); process.exit(fail?1:0);
})();
