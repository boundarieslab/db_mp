#!/usr/bin/env python3
"""A published number is a link to the document it was read from.

    python3 tools/patch_source_links.py [index.html] [tools/smoke_test.js] [tools/fixtures/facilities.csv]

The sheet says which document: the column FieldSources holds
"Field=URL ; Field=URL", for example
"AnnualCapacity=https://... ; StartYear=https://...".

Applies a fixed list of anchored replacements. Every anchor must be found
exactly once, or nothing is written. Running it twice is refused.
"""
import sys, os, csv, io

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
HTML = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
TEST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'tools', 'smoke_test.js')
FIXT = sys.argv[3] if len(sys.argv) > 3 else os.path.join(ROOT, 'tools', 'fixtures', 'facilities.csv')

HTML_EDITS = [
# 1. the look: the same blue hairline as the links at the foot of a record
(""".link-row a{border-bottom:.5px solid #00f}
""",
""".link-row a{border-bottom:.5px solid #00f}
a.src{border-bottom:.5px solid #00f}
#site-table td .nd a.src{color:#00f}
"""),
# 2. the words
("""        th_start: { en: "SINCE", no: "SIDEN" },
""",
"""        th_start: { en: "SINCE", no: "SIDEN" },
        opensrc: { en: "Open the source of this figure", no: "Åpne kilden til dette tallet" },
"""),
# 3. the record window: a row can name the sheet column it shows
("""        const row = (k, v) => {
            const val = String(v == null ? '' : v).trim();
            return val ? `<div class="column-set"><div class="col-0">${t(k)}</div><div class="col-1">${esc(val)}</div></div>` : '';
        };
""",
"""        const row = (k, v, f) => {
            const val = String(v == null ? '' : v).trim();
            return val ? `<div class="column-set"><div class="col-0">${t(k)}</div><div class="col-1">${srcLink(esc(val), f ? srcOf(site, f) : '')}</div></div>` : '';
        };
"""),
("""row('geom', geomText(site)) + row('wat', site.WaterRecipient))}""",
"""row('geom', geomText(site)) + row('wat', site.WaterRecipient, 'WaterRecipient'))}"""),
("""            ${section('cap', row('capyr', withUnit(site.AnnualCapacity, site.AnnualCapacityUnit || site.CapacityUnit)) + row('tot', withUnit(site.TotalCapacity, site.TotalCapacityUnit)) + row('extyr', withUnit(site.ExtractionAnnual, site.ExtractionAnnualUnit)) + row('exttot', withUnit(site.ExtractionTotal, site.ExtractionTotalUnit)) + row('mat', site.MassesAccepted) + row('prod', site.MassesProduced))}""",
"""            ${section('cap', row('capyr', withUnit(site.AnnualCapacity, site.AnnualCapacityUnit || site.CapacityUnit), 'AnnualCapacity') + row('tot', withUnit(site.TotalCapacity, site.TotalCapacityUnit), 'TotalCapacity') + row('extyr', withUnit(site.ExtractionAnnual, site.ExtractionAnnualUnit), 'ExtractionAnnual') + row('exttot', withUnit(site.ExtractionTotal, site.ExtractionTotalUnit), 'ExtractionTotal') + row('mat', site.MassesAccepted, 'MassesAccepted') + row('prod', site.MassesProduced, 'MassesProduced'))}"""),
("""            ${section('perm', row('ref', site.PermitRef) + row('start', site.StartYear) + row('auth', site.PermitAuthority || site.Authority))}""",
"""            ${section('perm', row('ref', site.PermitRef, 'PermitRef') + row('start', site.StartYear, 'StartYear') + row('auth', site.PermitAuthority || site.Authority))}"""),
# 4. where a figure comes from
("""    const extOf = s => quant(s.ExtractionTotal, s.ExtractionTotalUnit, s.ExtractionAnnual, s.ExtractionAnnualUnit);
""",
"""    const extOf = s => quant(s.ExtractionTotal, s.ExtractionTotalUnit, s.ExtractionAnnual, s.ExtractionAnnualUnit);
    // A number is shown as a link to the document it was read from. The sheet
    // says which document: FieldSources holds "Field=URL ; Field=URL". A field
    // that is not named there is shown as plain text.
    function fieldSources(s) {
        if (!s) return {};
        if (s.__fs) return s.__fs;
        const m = {};
        String(s.FieldSources || '').split(/\\s;\\s/).forEach(p => {
            const i = p.indexOf('=');
            if (i < 1) return;
            const u = safeUrl(p.slice(i + 1).trim());
            if (/^https?:/i.test(u)) m[p.slice(0, i).trim()] = u;
        });
        return (s.__fs = m);
    }
    function srcOf(s, field) { return fieldSources(s)[field] || ''; }
    function srcLink(html, url) {
        return url ? `<a class="src" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(t('opensrc'))}">${html}</a>` : html;
    }
"""),
# 5. the table: the figure in the m³ column, and the year
("""    const capNow = s => extScope() ? extOf(s) : capOf(s);
""",
"""    const capNow = s => extScope() ? extOf(s) : capOf(s);
    // The sheet column the figure in the table was taken from: the total when
    // there is one, the yearly figure otherwise (as quant() chooses).
    const qtyField = s => {
        const e = extScope();
        return Number.isFinite(qty(e ? s.ExtractionTotal : s.TotalCapacity))
            ? (e ? 'ExtractionTotal' : 'TotalCapacity') : (e ? 'ExtractionAnnual' : 'AnnualCapacity');
    };
"""),
("""                       return c.drawn ? fmt(c.v) : `<span class="nd">${fmt(c.v)} ${esc(c.unit)}</span>`; },""",
"""                       const u = srcOf(s, qtyField(s));
                       return c.drawn ? srcLink(fmt(c.v), u) : `<span class="nd">${srcLink(fmt(c.v) + ' ' + esc(c.unit), u)}</span>`; },"""),
("""          text: s => String(s.StartYear || '').replace(/\\.0$/, ''), sort: s => qty(s.StartYear) },""",
"""          text: s => String(s.StartYear || '').replace(/\\.0$/, ''), sort: s => qty(s.StartYear),
          html: s => srcLink(esc(String(s.StartYear || '').replace(/\\.0$/, '')), srcOf(s, 'StartYear')) },"""),
# 6. the CSV carries the sources of its figures
("""['WaterRecipient', s => s.WaterRecipient], ['StartYear', s => s.StartYear],
""",
"""['WaterRecipient', s => s.WaterRecipient], ['StartYear', s => s.StartYear],
               ['FieldSources', s => s.FieldSources],
"""),
]

TEST_EDITS = [
("""  console.log('phone');
""",
"""  console.log('a number is a link to its source');
  const sl = await p.evaluate(async () => {
    const a = (uid, key) => { const e = document.querySelector('#site-table tbody tr[data-uid="' + uid + '"] td[data-key="' + key + '"] a.src');
                              return e ? e.getAttribute('href') + '|' + e.target + '|' + e.textContent.replace(/\\s+/g, ' ').trim() : null; };
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
  ok(/^https:\\/\\/example\\.org\\/alnabru-permit\\.pdf\\|_blank\\|100.000 t\\/yr$/.test(sl.rec.cap || ''),
     'a figure with a source in the sheet is a link to it, in a new tab (' + sl.rec.cap + ')');
  ok(/langoya-permit/.test(sl.rec.tot || '') && /langoya-dmf/.test(sl.ext || ''),
     'the link follows the figure: capacity in one sheet, extraction in the other (' + sl.rec.tot + ' / ' + sl.ext + ')');
  ok(sl.rec.none === null, 'a figure with no source in the sheet stays plain text');
  ok(sl.stay, 'following the link does not open the record');
  ok(sl.side.length === 1 && /alnabru-permit\\.pdf\\|100000 tonnes\\/year/.test(sl.side[0]) && sl.plain > 3,
     'the record links the same figure and nothing else (' + sl.side.join(', ') + ')');

  console.log('phone');
"""),
]

FIXTURE = {
    'OS_OS_001': 'AnnualCapacity=https://example.org/alnabru-permit.pdf ; Website=javascript:alert(1)',
    'VF_HM_001': 'TotalCapacity=https://example.org/langoya-permit.pdf ; ExtractionTotal=https://example.org/langoya-dmf.pdf',
}


def apply(path, edits, marker):
    src = open(path, encoding='utf-8', newline='').read()
    if marker in src:
        sys.exit(f'{path}: already patched')
    for old, new in edits:
        n = src.count(old)
        if n != 1:
            sys.exit(f'{path}: anchor found {n} times, nothing written:\n{old[:120]}')
        src = src.replace(old, new)
    return src


html = apply(HTML, HTML_EDITS, 'function fieldSources(')
test = apply(TEST, TEST_EDITS, "a number is a link to its source")

rows = list(csv.reader(io.open(FIXT, encoding='utf-8', newline='')))
if 'FieldSources' in rows[0]:
    sys.exit(f'{FIXT}: already patched')
rows[0].append('FieldSources')
for r in rows[1:]:
    r.append(FIXTURE.get(r[0], ''))
buf = io.StringIO()
csv.writer(buf, lineterminator='\n').writerows(rows)

open(HTML, 'w', encoding='utf-8', newline='').write(html)
open(TEST, 'w', encoding='utf-8', newline='').write(test)
open(FIXT, 'w', encoding='utf-8', newline='').write(buf.getvalue())
print('patched', HTML, TEST, FIXT)
