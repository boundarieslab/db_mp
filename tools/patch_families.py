#!/usr/bin/env python3
"""Reception, extraction, construction.

Run from the repo root:  python3 tools/patch_families.py

What it changes in index.html:
  - an EXTRACTION tab between RECEPTION and CONSTRUCTION; a site that both
    extracts and receives is one record and appears in both sheets
  - capacity means permitted intake; extraction volumes have their own
    columns (ExtractionAnnual, ExtractionTotal and their units)
  - one unit per figure: AnnualCapacityUnit, TotalCapacityUnit (the old
    CapacityUnit is still read when the new columns are empty)
  - a dash in a cell means "does not apply": it is drawn as a dash, never as
    n.d., and a column holding only dashes is not drawn
  - AREA comes from the site's polygon and says which kind of outline it is

Every anchor is asserted; nothing is written unless all edits land.
"""
import io, sys

P = 'index.html'
src = io.open(P, encoding='utf-8').read()
out = src
n = 0

def rep(old, new, count=1):
    global out, n
    assert out.count(old) == count, (out.count(old), old[:90])
    out = out.replace(old, new)
    n += 1

# 1 ── the tab
rep('''                <button type="button" class="tab" id="tab-project" role="tab" aria-selected="false" data-tab="project" aria-controls="tb-project">''',
'''                <button type="button" class="tab" id="tab-extract" role="tab" aria-selected="false" data-tab="extract" aria-controls="tb-facility">
                    <span class="tl" data-en="EXTRACTION" data-no="UTTAK">EXTRACTION</span><span class="tc" id="count-extract">–</span></button>
                <button type="button" class="tab" id="tab-project" role="tab" aria-selected="false" data-tab="project" aria-controls="tb-project">''')

# 2 ── words
rep('''        tot: { en: "Total capacity", no: "Total kapasitet" },''',
'''        tot: { en: "Total capacity", no: "Total kapasitet" },
        extyr: { en: "Extraction / year", no: "Uttak / år" },
        exttot: { en: "Total extraction", no: "Totalt uttak" },
        extract_t: { en: "EXTRACTION SITES", no: "UTTAK" },
        th_ext: { en: "EXTRACTION", no: "UTTAK" }, th_ext_s: { en: "EXT.", no: "UTT." },
        key_ext: { en: "planned extraction, total; yearly figures not drawn; n.d. = not disclosed",
                   no: "planlagt uttak, totalt; årlige tall tegnes ikke; n.d. = ikke oppgitt" },
        n_extract: { en: "extraction sites", no: "uttak" },
        pc_observed: { en: "worked", no: "drift" }, pc_permitted: { en: "permitted", no: "tillatt" },
        pc_plan: { en: "plan", no: "plan" }, pc_register: { en: "register", no: "register" },
        pc_property: { en: "property", no: "eiendom" }, pc_resource: { en: "resource", no: "ressurs" },''')

# 3 ── quantities, activities, area
rep('''    function capOf(s) {
        const unit = String(s.CapacityUnit || '').toLowerCase();
        const tonnes = /t(onn|onne)?s?\\b|tonn/.test(unit) && !/m3|m³/.test(unit);
        const yearly = /yr|year|år|\\/a\\b/.test(unit);
        const tot = qty(s.TotalCapacity), ann = qty(s.AnnualCapacity);
        if (Number.isFinite(tot) && !tonnes && !yearly) return { v: tot, unit: 'm³', drawn: true };
        if (Number.isFinite(tot)) return { v: tot, unit: tonnes ? (yearly ? 't/yr' : 't') : 'm³/yr', drawn: false };
        if (Number.isFinite(ann)) return { v: ann, unit: /m3|m³/.test(unit) ? 'm³/yr' : 't/yr', drawn: false };
        return null;
    }''',
'''    // A dash in a cell says the field does not apply to this site. An empty
    // cell says nobody has verified it yet. The two are never drawn alike.
    const isNA = v => /^[–—-]$/.test(String(v == null ? '' : v).trim());
    // Each figure carries its own unit: a yearly intake in tonnes and a total
    // in m³ are both true of the same site.
    function quant(tot, totU, ann, annU) {
        const lu = u => String(u || '').toLowerCase();
        const tonnes = u => /t(onn|onne)?s?\\b|tonn/.test(u) && !/m3|m³/.test(u);
        const yearly = u => /yr|year|år|\\/a\\b|season|sesong/.test(u);
        const T = qty(tot), A = qty(ann);
        if (Number.isFinite(T)) {
            const u = lu(totU);
            if (!tonnes(u) && !yearly(u)) return { v: T, unit: 'm³', drawn: true };
            return { v: T, unit: tonnes(u) ? (yearly(u) ? 't/yr' : 't') : 'm³/yr', drawn: false };
        }
        if (Number.isFinite(A)) { const u = lu(annU); return { v: A, unit: /m3|m³/.test(u) ? 'm³/yr' : 't/yr', drawn: false }; }
        return null;
    }
    // Capacity is what a permit lets a site take in. What a quarry takes out
    // is a different quantity and has its own columns and its own sheet.
    const capOf = s => quant(s.TotalCapacity, s.TotalCapacityUnit || s.CapacityUnit,
                             s.AnnualCapacity, s.AnnualCapacityUnit || s.CapacityUnit);
    const extOf = s => quant(s.ExtractionTotal, s.ExtractionTotalUnit, s.ExtractionAnnual, s.ExtractionAnnualUnit);
    // What a site does. The sheet says so in Activities; without that column a
    // facility receives, and extracts when its type or its figures say it does.
    function actsOf(s) {
        const a = String(s.Activities || '').toLowerCase();
        if (a.trim()) return { rec: /recep|mottak/.test(a), ext: /extract|uttak/.test(a) };
        const ty = (String(s.Type || '') + ' ' + String(s.Subtype || '')).toLowerCase();
        return { rec: true, ext: /pukkverk|grustak|massetak|steinbrudd/.test(ty) || !!extOf(s) };
    }
    const inScope = (s, scope) => scope === 'all' ? true
        : scope === 'extract' ? s.__cat === 'facility' && actsOf(s).ext
        : scope === 'facility' ? s.__cat === 'facility' && actsOf(s).rec
        : s.__cat === scope;
    const extScope = () => deckScope === 'extract' && !deckSelection;
    const capNow = s => extScope() ? extOf(s) : capOf(s);
    const capNA = s => {
        const cells = extScope() ? [s.ExtractionAnnual, s.ExtractionTotal] : [s.AnnualCapacity, s.TotalCapacity];
        return cells.some(isNA) && cells.every(v => isNA(v) || !String(v == null ? '' : v).trim());
    };
    // The area of a site is the area of its outline, and an outline is one of
    // six kinds. The table names the kind beside the number.
    const PCLS = ['observed', 'permitted', 'plan', 'register', 'property', 'resource'];
    function areaOf(s) {
        if (!fpData) return null;
        const uid = uidOf(s), by = {};
        fpData.features.forEach(f => {
            const p = f.properties || {};
            if (p.uid !== uid || !Number.isFinite(+p.a)) return;
            by[p.pcls || ''] = (by[p.pcls || ''] || 0) + (+p.a);
        });
        const cls = PCLS.find(c => c in by) || Object.keys(by)[0];
        return cls === undefined ? null : { v: by[cls], cls };
    }
    const pclsWord = c => PCLS.includes(c) ? t('pc_' + c) : (c || '');''')

# 4 ── the capacity columns follow the sheet in view
rep('''        { key: '__cap', th: 'th_cap', w: 280, pw: 72, sth: 'th_cap_s', bar: true,
          text: s => { const c = capOf(s); return c && c.drawn ? String(c.v) : ''; },
          html: s => { const c = capOf(s); return c && c.drawn ? strokes(Math.floor(c.v / strokeUnit), inkOf(s)) : ''; },
          sort: s => { const c = capOf(s); return c ? c.v : NaN; }, num: true, nosum: true },
        { key: '__qty', th: 'th_m3', w: 140, pw: 118, num: true,
          text: s => qtyText(capOf(s)),
          html: s => { const c = capOf(s); if (!c) return '<span class="nd">n.d.</span>';
                       return c.drawn ? fmt(c.v) : `<span class="nd">${fmt(c.v)} ${esc(c.unit)}</span>`; },
          sort: s => { const c = capOf(s); return c ? c.v : NaN; },
          sum: s => { const c = capOf(s); return c && c.drawn ? c.v : NaN; },
          present: s => !!capOf(s) },''',
'''        { key: '__cap', th: 'th_cap', eth: 'th_ext', w: 280, pw: 72, sth: 'th_cap_s', esth: 'th_ext_s', bar: true,
          text: s => { const c = capNow(s); return c && c.drawn ? String(c.v) : ''; },
          html: s => { const c = capNow(s); return c && c.drawn ? strokes(Math.floor(c.v / strokeUnit), inkOf(s)) : ''; },
          sort: s => { const c = capNow(s); return c ? c.v : NaN; }, num: true, nosum: true },
        { key: '__qty', th: 'th_m3', w: 140, pw: 118, num: true,
          text: s => qtyText(capNow(s)),
          html: s => { const c = capNow(s); if (!c) return capNA(s) ? '<span class="nd na">–</span>' : '<span class="nd">n.d.</span>';
                       return c.drawn ? fmt(c.v) : `<span class="nd">${fmt(c.v)} ${esc(c.unit)}</span>`; },
          sort: s => { const c = capNow(s); return c ? c.v : NaN; },
          sum: s => { const c = capNow(s); return c && c.drawn ? c.v : NaN; },
          present: s => !!capNow(s) },''')

rep('''        { key: 'Area_m2', nophone: true, th: 'th_area', w: 120, num: true,
          text: s => fmt(qty(s.Area_m2)), sort: s => qty(s.Area_m2), present: s => Number.isFinite(qty(s.Area_m2)), nosum: true },''',
'''        { key: 'Area_m2', nophone: true, th: 'th_area', w: 160, num: true,
          text: s => { const a = areaOf(s); return a ? fmt(a.v) : ''; },
          html: s => { const a = areaOf(s); return a ? fmt(a.v) + ' <span class="nd">' + esc(pclsWord(a.cls)) + '</span>' : ''; },
          title: s => { const a = areaOf(s); return a ? fmt(a.v) + ' m² · ' + pclsWord(a.cls) : ''; },
          sort: s => { const a = areaOf(s); return a ? a.v : NaN; }, present: s => !!areaOf(s), nosum: true },''')

# 5 ── per-sheet state
rep('''    const SORT0 = { facility: { key: '__qty', dir: -1 }, project: { key: '__qty', dir: -1 },''',
    '''    const SORT0 = { facility: { key: '__qty', dir: -1 }, extract: { key: '__qty', dir: -1 }, project: { key: '__qty', dir: -1 },''')
rep('''    const colFilter = { facility: {}, project: {}, all: {}, sel: {}, flow: {} };''',
    '''    const colFilter = { facility: {}, extract: {}, project: {}, all: {}, sel: {}, flow: {} };''')
rep('''    const findQ = { facility: '', project: '', all: '', sel: '', flow: '' };''',
    '''    const findQ = { facility: '', extract: '', project: '', all: '', sel: '', flow: '' };''')

# 6 ── which rows a sheet holds
rep('''            (deckSelection ? deckSelection.has(uidOf(s)) : (deckScope === 'all' || s.__cat === deckScope)) && passes(s));''',
    '''            (deckSelection ? deckSelection.has(uidOf(s)) : inScope(s, deckScope)) && passes(s));''')
rep('''.filter(c => c.keep || rows.some(r => c.present ? c.present(r) : String(c.text(r) || '').trim() !== ''));''',
    '''.filter(c => c.keep || rows.some(r => c.present ? c.present(r) : (String(c.text(r) || '').trim() !== '' && !isNA(c.text(r)))));''')
rep('''        pickStroke(base.map(r => { const c = isFlowSheet() ? volOf(r) : capOf(r); return c && c.drawn ? c.v : 0; }));''',
    '''        pickStroke(base.map(r => { const c = isFlowSheet() ? volOf(r) : capNow(r); return c && c.drawn ? c.v : 0; }));''')
rep('''            lab.textContent = t(phone() && c.sth ? c.sth : proj && c.pth ? c.pth : c.th);''',
    '''            lab.textContent = t(extScope() && c.eth ? (phone() && c.esth ? c.esth : c.eth)
                                : phone() && c.sth ? c.sth : proj && c.pth ? c.pth : c.th);''')
rep('''            if (!deckSelection && (cat === 'project' || cat === 'flow' || cat === 'facility')) {''',
    '''            if (!deckSelection && (cat === 'project' || cat === 'flow' || cat === 'facility' || cat === 'extract')) {''')
rep('''                    deckScope === 'flow' ? 'flows' : deckScope === 'all' ? 'selection' : 'recep';''',
    '''                    deckScope === 'flow' ? 'flows' : deckScope === 'all' ? 'selection' :
                    deckScope === 'extract' ? 'extract_t' : 'recep';''')
rep('''            parts.push(`<span class="it note">${esc(t(flow ? 'key_vol' : 'key_cap'))}</span>`);''',
    '''            parts.push(`<span class="it note">${esc(t(flow ? 'key_vol' : extScope() ? 'key_ext' : 'key_cap'))}</span>`);''')
rep('''            const pub = flow ? allFlows.length : allSites.filter(s => s.__cat === cat).length;
            const held = Math.max(0, (rawCounts[cat] || 0) - pub);''',
    '''            const fam = cat === 'extract' ? 'facility' : cat;
            const pub = flow ? allFlows.length : allSites.filter(s => inScope(s, cat)).length;
            const live = flow ? allFlows.length : allSites.filter(s => s.__cat === fam).length;
            const held = cat === 'extract' ? 0 : Math.max(0, (rawCounts[cat] || 0) - live);''')

# 7 ── tabs, address, counts
rep('''    const SHORT = { en: { all: 'ALL', facility: 'RECEP.', project: 'CONSTR.', dod: 'TERRAIN', flow: 'FLOWS' },
                    no: { all: 'ALLE', facility: 'MOTTAK', project: 'BYGG', dod: 'TERRENG', flow: 'STRØM' } };''',
    '''    const SHORT = { en: { all: 'ALL', facility: 'RECEP.', extract: 'EXTR.', project: 'CONSTR.', dod: 'TERRAIN', flow: 'FLOWS' },
                    no: { all: 'ALLE', facility: 'MOTTAK', extract: 'UTTAK', project: 'BYGG', dod: 'TERRENG', flow: 'STRØM' } };''')
rep('''        const sk = ['facility', 'project', 'all', 'flow'].includes(h.sheet) ? h.sheet : 'facility';''',
    '''        const sk = ['facility', 'extract', 'project', 'all', 'flow'].includes(h.sheet) ? h.sheet : 'facility';''')
rep('''        if (site.__cat !== deckScope && !deckSelection && site.__cat) { selectTab(site.__cat, true); }''',
    '''        if (!deckSelection && site.__cat && !inScope(site, deckScope)) {
            selectTab(site.__cat === 'facility' && !actsOf(site).rec ? 'extract' : site.__cat, true);
        }''')
rep('''            $('tb-' + k).hidden = tab === 'all' ? (k === 'dod' || k === 'flow') : k !== tab;''',
    '''            $('tb-' + k).hidden = tab === 'all' ? (k === 'dod' || k === 'flow') : k !== (tab === 'extract' ? 'facility' : tab);''')
rep('''        $('count-facilities').textContent = f.length;''',
    '''        $('count-facilities').textContent = f.filter(s => actsOf(s).rec).length;
        $('count-extract').textContent = f.filter(s => actsOf(s).ext).length;''')

# 8 ── the record window
rep('''row('area', Number.isFinite(area) ? fmt(area) + ' m²' : '')''',
    '''row('area', areaOf(site) ? fmt(areaOf(site).v) + ' m² · ' + pclsWord(areaOf(site).cls) : '')''')
rep('''row('capyr', site.AnnualCapacity ? site.AnnualCapacity + (site.CapacityUnit ? ' ' + site.CapacityUnit : '') : '') + row('tot', site.TotalCapacity)''',
    '''row('capyr', withUnit(site.AnnualCapacity, site.AnnualCapacityUnit || site.CapacityUnit)) + row('tot', withUnit(site.TotalCapacity, site.TotalCapacityUnit)) + row('extyr', withUnit(site.ExtractionAnnual, site.ExtractionAnnualUnit)) + row('exttot', withUnit(site.ExtractionTotal, site.ExtractionTotalUnit))''')
rep('''        const section = (k, body) => `<b>${t(k)}</b>` + (body || `<div class="column-set no-data">${t('nodata')}</div>`);''',
    '''        const section = (k, body) => `<b>${t(k)}</b>` + (body || `<div class="column-set no-data">${t('nodata')}</div>`);
        const withUnit = (v, u) => { v = String(v == null ? '' : v).trim(); u = String(u || '').trim(); return v && u && !isNA(v) ? v + ' ' + u : v; };''')

# 9 ── the download carries both quantities and the kind of area
rep('''               ['Capacity', s => { const c = capOf(s); return c ? c.v : ''; }],
               ['CapacityUnit', s => (capOf(s) || {}).unit || ''],
               ['MassesAccepted', s => s.MassesAccepted], ['Area_m2', s => { const v = qty(s.Area_m2); return Number.isFinite(v) ? v : ''; }],''',
    '''               ['Capacity', s => { const c = capOf(s); return c ? c.v : ''; }],
               ['CapacityUnit', s => (capOf(s) || {}).unit || ''],
               ['Extraction', s => { const c = extOf(s); return c ? c.v : ''; }],
               ['ExtractionUnit', s => (extOf(s) || {}).unit || ''],
               ['MassesAccepted', s => s.MassesAccepted], ['Area_m2', s => { const a = areaOf(s); return a ? a.v : ''; }],
               ['AreaOf', s => (areaOf(s) || {}).cls || ''],''')

# 10 ── six tabs across a phone
rep('''  #tabstrip .tab{padding:17px 14px 0;margin-right:-11px;font-size:9.5px;gap:4px}''',
    '''  #tabstrip .tab{padding:17px 12px 0;margin-right:-10px;font-size:8.5px;gap:4px}''')

if out == src:
    sys.exit('nothing changed')
io.open(P, 'w', encoding='utf-8', newline='').write(out)
print('ok,', n, 'edits')
