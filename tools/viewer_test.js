// Checks the record window's photo viewer and the before/after pair.
//     python3 tools/serve.py 8901
//     node tools/viewer_test.js [outdir]
// The sheet is the smoke-test fixture plus one row, OS_OS_007, with photos and a
// pair in data/thennow.json. Photos are answered with generated images, so the
// test runs offline.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/viewer_test';
fs.mkdirSync(OUT, { recursive: true });
const HERE = __dirname + '/fixtures';
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };

const base = fs.readFileSync(HERE + '/facilities.csv', 'utf8').replace(/\s+$/, '');
const head = base.split('\n')[0].split(',');
const row = Object.fromEntries(head.map(h => [h, '']));
Object.assign(row, { UID: 'OS_OS_007', Name: 'Grønmo nedlagte deponi', Type: 'Deponi', Status: 'closed', Municipality: 'Oslo',
  County: 'Oslo', Latitude: '59.8406', Longitude: '10.8361', Published: 'TRUE',
  Images: 'https://ems.dimu.org/image/A?dimension=1200x1200, https://ems.dimu.org/image/B?dimension=1200x1200',
  ImageCredits: 'Photo A, 1975. Someone / Oslo Museum. CC BY-SA 4.0 https://digitaltmuseum.no/1 | Photo B, 1971. Someone else. CC BY-NC-ND 4.0 https://digitaltmuseum.no/2' });
const cols = head.includes('Images') ? head : head.concat(['Images']);
if (!cols.includes('ImageCredits')) cols.push('ImageCredits');
const q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
const csv = [cols.join(','), ...base.split('\n').slice(1).map(l => l + ','.repeat(cols.length - head.length)),
  cols.map(c => q(row[c] || '')).join(',')].join('\n');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const vp of [{ width: 1440, height: 900, name: 'desktop' }, { width: 390, height: 844, name: 'phone' }]) {
    console.log(vp.name);
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.name === 'phone' });
    await ctx.route('**/docs.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/csv',
      body: /gid=/.test(r.request().url()) ? fs.readFileSync(HERE + '/projects.csv', 'utf8') : csv }));
    await ctx.route(/unpkg\.com|cdn\.jsdelivr\.net/, r => {
      const f = __dirname + '/../vendor/' + r.request().url().split('/').pop();
      if (!fs.existsSync(f)) return r.fulfill({ status: 200, body: '' });
      r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(f, 'utf8') });
    });
    // Photos: two plain test cards, one per letter, 1200 or 2400 px wide.
    const card = (w, h, hue) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="hsl(${hue},40%,70%)"/><text x="50%" y="50%" font-size="${h / 6}" text-anchor="middle">${w}</text></svg>`;
    let hiResAsked = 0;
    await ctx.route(/ems\.dimu\.org/, r => { const u = r.request().url(); if (/2400/.test(u)) hiResAsked++;
      const w = /2400/.test(u) ? 2400 : 1200; r.fulfill({ status: 200, contentType: 'image/svg+xml', body: card(w, w * 2 / 3, /image\/A/.test(u) ? 30 : 200) }); });
    await ctx.route(/kartverket|arcgisonline|geonorge|wayback|elevation-tiles-prod|hoydedata|cargo/, r => r.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://127.0.0.1:8901/index.html#site=OS_OS_007', { waitUntil: 'load' });
    await p.waitForSelector('#sidebar.active .sb-media', { timeout: 30000 });
    await p.waitForTimeout(800);
    ok(await p.locator('.slideshow-slide').count() === 2, 'the record opens on the photos (2 slides)');
    ok(await p.locator('.media-toggle[data-media="thennow"]').count() === 1, 'with a 1937 / 2026 button');
    ok((await p.locator('.media-toggle[data-media="thennow"]').innerText()).trim() === '1937 / 2026', 'which names the two years');
    await p.screenshot({ path: `${OUT}/${vp.name}_1_photos.png` });

    await p.locator('.slideshow-slide.active').click({ position: { x: 60, y: 60 } });
    await p.waitForSelector('#viewer.on');
    await p.waitForFunction(() => { const i = document.querySelector('#viewer img'); return i && i.naturalWidth > 0; });
    ok(hiResAsked > 0, 'the viewer asks the source for the larger copy');
    const cap = await p.locator('#viewer .v-cap').innerText();
    ok(/Photo A, 1975/.test(cap), 'and carries the credit line (' + cap.slice(0, 40) + ')');
    const fitT = await p.locator('#viewer img').evaluate(i => i.style.transform);
    const box = await p.locator('#viewer .v-stage').boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    if (vp.name === 'desktop') { for (let i = 0; i < 5; i++) await p.mouse.wheel(0, -200); }
    else await p.locator('#viewer .v-in').click();
    await p.waitForTimeout(200);
    const zT = await p.locator('#viewer img').evaluate(i => i.style.transform);
    const sc = t => +(/scale\(([\d.]+)\)/.exec(t) || [0, 0])[1];
    ok(sc(zT) > sc(fitT) * 1.3, `zooming makes it larger (${sc(fitT).toFixed(3)} → ${sc(zT).toFixed(3)})`);
    const tr = t => (/translate\(([-\d.]+)px, ?([-\d.]+)px\)/.exec(t) || []).slice(1).map(Number);
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 }); await p.mouse.up();
    const pT = await p.locator('#viewer img').evaluate(i => i.style.transform);
    ok(tr(pT)[0] !== tr(zT)[0], 'dragging moves it');
    await p.screenshot({ path: `${OUT}/${vp.name}_2_viewer_zoomed.png` });
    await p.locator('#viewer .v-next').click();
    await p.waitForTimeout(300);
    ok(/Photo B/.test(await p.locator('#viewer .v-cap').innerText()), 'the arrow goes to the next photo, with its own credit');
    await p.keyboard.press('Escape');
    ok(!(await p.locator('#viewer').evaluate(e => e.classList.contains('on'))), 'Escape closes the viewer');
    ok(await p.locator('#sidebar').evaluate(e => e.classList.contains('active')), 'and leaves the record open');

    await p.locator('.media-toggle[data-media="thennow"]').click();
    await p.waitForSelector('.ba');
    await p.waitForFunction(() => [...document.querySelectorAll('.ba img')].every(i => i.naturalWidth > 0));
    ok(/1937 Oslo 1937, Widerøes/.test(await p.locator('#sb-credit').innerText()), 'the pair shows both credits under it');
    const ba = await p.locator('.ba-fr').boundingBox();
    const mb = await p.locator('.sb-media').boundingBox();
    ok(Math.abs(ba.height - mb.height) < 3 && ba.width < mb.width * .8, `the frame takes the photos' shape (${Math.round(ba.width)} × ${Math.round(ba.height)} in ${Math.round(mb.width)} × ${Math.round(mb.height)})`);
    await p.mouse.move(ba.x + ba.width * .5, ba.y + ba.height * .5);
    await p.mouse.down(); await p.mouse.move(ba.x + ba.width * .2, ba.y + ba.height * .5, { steps: 6 }); await p.mouse.up();
    const x = await p.locator('.ba-fr').evaluate(e => parseFloat(e.style.getPropertyValue('--x')));
    ok(x > 15 && x < 25, `dragging across it moves the line (${x.toFixed(1)} %)`);
    ok(!(await p.locator('#viewer').evaluate(e => e.classList.contains('on'))), 'and does not open the viewer');
    await p.screenshot({ path: `${OUT}/${vp.name}_3_pair.png` });
    await p.locator('.ba-fr').click({ position: { x: ba.width * .7, y: ba.height * .3 } });
    await p.waitForSelector('#viewer.on');
    await p.waitForTimeout(600);
    ok(await p.locator('#viewer img').count() === 2, 'a click opens the pair over the whole page');
    const vb = await p.locator('#viewer .v-stage').boundingBox();
    const ib = await p.locator('#viewer img').first().boundingBox();
    await p.mouse.move(ib.x + ib.width / 2, vb.y + vb.height / 2);
    await p.mouse.down(); await p.mouse.move(ib.x + ib.width * .75, vb.y + vb.height / 2, { steps: 6 }); await p.mouse.up();
    const clip = await p.locator('#viewer .v-after').evaluate(e => e.style.clipPath);
    const cx = +(/inset\(0px 0px 0px (\d+)px\)/.exec(clip) || [0, -1])[1];
    ok(Math.abs(cx - (ib.x - vb.x + ib.width * .75)) < 4, 'its line moves there too, measured on the photo (' + clip + ')');
    const t0 = await p.locator('#viewer img').first().evaluate(i => i.style.transform);
    await p.locator('#viewer .v-in').click(); await p.waitForTimeout(150);
    const ts = await p.locator('#viewer img').evaluateAll(a => a.map(i => i.style.transform));
    ok(ts[0] === ts[1] && sc(ts[0]) > sc(t0), 'and both years zoom together');
    await p.screenshot({ path: `${OUT}/${vp.name}_4_pair_viewer.png` });
    await p.keyboard.press('Escape');
    ok(!errs.length, 'no JS errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
  console.log(fail ? `\n${fail} FAILING` : '\nall passing');
  process.exit(fail ? 1 : 0);
})();
