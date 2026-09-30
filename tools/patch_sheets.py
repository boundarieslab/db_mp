#!/usr/bin/env python3
"""Turn the deck into spreadsheet sheets (design v7 + behaviour A-H).

A list of edits, each asserting how many times its anchor occurs. Nothing is
written unless every edit lands; the original is kept as a timestamped .bak.
Run from the repo root:  python3 tools/patch_sheets.py
"""
import re, sys, time, shutil, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / 'index.html'
HERE = pathlib.Path(__file__).resolve().parent
MODULE = (HERE / 'sheet_module.js').read_text(encoding='utf-8')
CSS = (HERE / 'sheet_css.css').read_text(encoding='utf-8')

s = HTML.read_text(encoding='utf-8')
edits = []

def rep(old, new, n=1):
    edits.append((old, new, n))

def span(start, end, new, keep_end=True):
    """Replace from `start` up to `end` (end kept unless keep_end=False)."""
    edits.append(('__SPAN__', (start, end, new, keep_end), 1))

# ── 1. palette: kept pure (HSL saturation 100), as decided ──────────────
rep('''  --terrain:#007FFF;   /* terrain change: the third tab */''',
    '''  --terrain:#007FFF;   /* terrain change: the third tab */
  --hl:.5px;           /* one device pixel; set exactly from script */''')

# ── 2. the deck's stylesheet ──────────────────────────────────────────────
span('/* ---------- deck: the database as a table, and the map\'s legend ---------- */',
     '/* hover preview */', CSS + '\n')

# ── 3. markup: find box, the key under the table, the filter list ────────
rep('''            <button type="button" id="deck-dir" data-en="all flows"''',
    '''            <input type="search" id="deck-find" class="find" autocomplete="off" spellcheck="false"
                   placeholder="find" data-ph-en="find" data-ph-no="finn" aria-label="Find in sheet">
            <button type="button" id="deck-dir" data-en="all flows"''')
rep('''        <table id="site-table"><thead><tr></tr></thead><tbody></tbody></table>
    </div>
</div>''',
    '''        <div class="sheet-bar" id="sheet-bar">
            <input type="search" id="sheet-find" class="find" autocomplete="off" spellcheck="false"
                   placeholder="find" data-ph-en="find" data-ph-no="finn" aria-label="Find in sheet">
            <div class="chips" id="sheet-chips" role="group" aria-label="Show on the map"></div>
            <button type="button" class="size" id="sheet-size" aria-label="Table size" title="Half screen, whole page, closed"><svg class="px" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M7 4h2v1h-2zM5 5h2v1h-2zM9 5h2v1h-2zM3 6h2v1h-2zM11 6h2v1h-2zM1 7h2v1h-2zM13 7h2v1h-2z"/></svg></button>
        </div>
        <table id="site-table"><thead><tr></tr></thead><tbody></tbody></table>
        <div class="sheet-key" id="sheet-key"></div>
    </div>
</div>
<div id="af-pop" hidden></div>''')

# ── 4. words ──────────────────────────────────────────────────────────────
rep('''        flows_none_t: { en: "No flows published yet.",''',
    '''        th_m3: { en: "m³", no: "m³" },
        th_cap_s: { en: "CAP.", no: "KAP." },
        th_vol_s: { en: "VOL.", no: "VOL." },
        rows: { en: "rows", no: "rader" },
        picked: { en: "picked", no: "markert" },
        stated: { en: "stated for {n} of {m}", no: "oppgitt for {n} av {m}" },
        nosum_mix: { en: "two kinds, not added", no: "to slag, ikke summert" },
        nosum_unit: { en: "mixed units, not added", no: "ulike enheter, ikke summert" },
        kdir_receiving: { en: "receives masses", no: "tar imot masser" },
        kdir_producing: { en: "produces masses", no: "produserer masser" },
        kdir_mixed: { en: "both", no: "begge" },
        key_cap: { en: "permit total; t/yr not drawn; n.d. = not disclosed",
                   no: "totalt i tillatelsen; t/år tegnes ikke; n.d. = ikke oppgitt" },
        key_vol: { en: "volume moved; n.d. = not disclosed",
                   no: "volum flyttet; n.d. = ikke oppgitt" },
        cov: { en: "{p} published", no: "{p} publisert" },
        cov_held: { en: "{h} held back", no: "{h} holdt tilbake" },
        cov_read: { en: "read from the database", no: "lest fra databasen" },
        n_facility: { en: "reception sites", no: "mottaksanlegg" },
        n_project: { en: "construction projects", no: "byggeprosjekter" },
        n_flow: { en: "flows", no: "strømmer" },
        held_t: { en: "{n} {what} in the database, none published yet.", no: "{n} {what} i databasen, ingen publisert ennå." },
        none_t: { en: "No {what} published yet.", no: "Ingen {what} publisert ennå." },
        held_b: { en: "A record goes live when every field in it has a source. Until then it stays in the database and off the map.",
                  no: "En post publiseres når hvert felt i den har en kilde. Til da blir den i databasen og utenfor kartet." },
        nomatch_t: { en: "Nothing in this sheet matches.", no: "Ingenting i arket passer." },
        nomatch_b: { en: "A column filter or the find box is narrowing it. Clear them to see every row.",
                     no: "Et kolonnefilter eller søkefeltet snevrer det inn. Fjern dem for å se alle radene." },
        af_title: { en: "Filter this column", no: "Filtrer denne kolonnen" },
        af_az: { en: "Sort A → Z", no: "Sorter A → Å" },
        af_za: { en: "Sort Z → A", no: "Sorter Å → A" },
        af_all: { en: "(all)", no: "(alle)" },
        af_blank: { en: "(blank)", no: "(tom)" },
        rows_copied: { en: "ROWS COPIED", no: "RADER KOPIERT" },
        cell_copied: { en: "CELL COPIED", no: "CELLE KOPIERT" },
        flows_none_t: { en: "No flows published yet.",''')

# ── 5. the sheet module replaces the old table code ───────────────────────
span("    let deckSort   = { key: 'TotalCapacity', dir: -1 };\n",
     '    function setDeckSize(next){', MODULE + '\n')
span('    function flowRows() {', '    function renderFlowChips(box) {', '')

# ── 6. wiring ─────────────────────────────────────────────────────────────
rep('''        if (deckSelection) s += ` · ${deckSelection.size} ${t('selected')}`;''',
    '''        if (deckSelection) s += ` · ${deckSelection.size} ${t('selected')}`;
        s += pickLine();''')
rep('''            if (hotUid) { map.setFeatureState({ source: 'fp', id: hotUid }, { hot: false });
                          map.setFeatureState({ source: 'sites', id: hotUid }, { hot: false }); }''',
    '''            if (hotUid && !isPicked(hotUid)) { map.setFeatureState({ source: 'fp', id: hotUid }, { hot: false });
                          map.setFeatureState({ source: 'sites', id: hotUid }, { hot: false }); }''')
rep('''        deckSelection = null;
        deckScope = scope;
        renderDeck();
        updateStatus();''',
    '''        deckSelection = null;
        deckScope = scope;
        cur = { id: null, key: null }; anchorIx = -1;
        if (picked.size) setPicked([]);
        renderDeck();
        saveSheetHash();
        updateStatus();''')
rep('''    document.querySelector('.deck-head').addEventListener('click', e => {
        if (e.target.closest('button')) return;''',
    '''    document.querySelector('.deck-head').addEventListener('click', e => {
        if (e.target.closest('button,input')) return;''')
rep('''        const projects   = pRes.data.filter(r => (uidOf(r) || r.Name) && isPublished(r)).map(tag('project'));''',
    '''        const projects   = pRes.data.filter(r => (uidOf(r) || r.Name) && isPublished(r)).map(tag('project'));
        rawCounts.facility = fRes.data.filter(r => uidOf(r) || r.Name).length;
        rawCounts.project  = pRes.data.filter(r => uidOf(r) || r.Name).length;''')
rep('''        updateCounts();
        renderDeck();
        whenStyleReady(() => { ensureSiteLayers(); refreshSiteData(); });''',
    '''        updateCounts();
        const sheetInHash = applySheetHash(readHash());
        renderDeck();
        if (sheetInHash) setDeckSize('half');
        whenStyleReady(() => { ensureSiteLayers(); refreshSiteData(); });''')
rep('''            allFlows = tagFlows(r.data || []);''',
    '''            rawCounts.flow = (r.data || []).filter(x => x.FlowUID || x.FromUID || x.ToUID).length;
            allFlows = tagFlows(r.data || []);''')
rep('''            if (deckScope === 'flow') renderFlowDeck();
        }).catch(err => {''',
    '''            if (deckScope === 'flow') renderFlowDeck(); else renderSheetKey(baseRows());
        }).catch(err => {''')

# ── 7. CSV: the values, not the display ───────────────────────────────────
span("    $('deck-csv').onclick = () => {", '    // ─────────────────────────────────────────────────────────────────────\n    // TABS.', '''    // The CSV carries values, not what the cell shows: plain numbers, the
    // unit in its own column, field names as they are in the database. It
    // exports the rows in view, or only the picked ones.
    $('deck-csv').onclick = e => {
        if (e) e.stopPropagation();
        const rows = picked.size ? viewRows.filter(r => picked.has(rowId(r))) : viewRows;
        const flow = isFlowSheet();
        const F = flow
            ? [['FlowUID', f => f.FlowUID], ['FromUID', f => f.FromUID], ['FromName', f => f.__fromName],
               ['ToUID', f => f.ToUID], ['ToName', f => f.__toName], ['MassType', f => f.MassType],
               ['Volume', f => { const c = volOf(f); return c ? c.v : ''; }], ['VolumeUnit', f => (volOf(f) || {}).unit || ''],
               ['PeriodStart', f => f.PeriodStart], ['PeriodEnd', f => f.PeriodEnd],
               ['EvidenceClass', f => f.__ev], ['Confidence', f => f.Confidence], ['SourceURL', f => f.SourceURL]]
            : [['UID', s => uidOf(s)], ['Name', s => s.Name], ['Category', s => s.__cat],
               ['Municipality', s => s.Municipality], ['Operator', s => s.Operator || s.Company],
               ['Status', s => classInfo(s.__cat, s.__cls).en], ['Type', s => s.Type],
               ['Direction', s => getMarkerInfo(s).direction],
               ['Capacity', s => { const c = capOf(s); return c ? c.v : ''; }],
               ['CapacityUnit', s => (capOf(s) || {}).unit || ''],
               ['Latitude', s => hasXY(s) ? num(s.Latitude) : ''], ['Longitude', s => hasXY(s) ? num(s.Longitude) : '']];
        const cell = v => { v = String(v == null ? '' : v); return /[",\\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        const body = rows.map(r => F.map(([, g]) => cell(g(r))).join(',')).join('\\n');
        const blob = new Blob(['\\ufeff' + F.map(x => x[0]).join(',') + '\\n' + body], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'dirtybusiness_' + (deckSelection ? 'selection' : deckScope) + (picked.size ? '_picked' : '') + '_' + dateIso(new Date()) + '.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };

''', keep_end=True)

# ── apply ─────────────────────────────────────────────────────────────────
out = s
for old, new, n in edits:
    if old == '__SPAN__':
        start, end, body, keep_end = new
        i = out.find(start)
        if i < 0 or out.count(start) != 1:
            sys.exit('span start not unique/found: ' + start[:70])
        j = out.find(end, i + len(start))
        if j < 0:
            sys.exit('span end not found after start: ' + end[:70])
        out = out[:i] + body + (out[j:] if keep_end else out[j + len(end):])
        continue
    c = out.count(old)
    if c != n:
        sys.exit(f'anchor found {c}x, expected {n}: {old[:80]!r}')
    out = out.replace(old, new)

bak = HTML.with_name('index.html.' + time.strftime('%Y%m%d-%H%M%S') + '.bak')
shutil.copyfile(HTML, bak)
HTML.write_text(out, encoding='utf-8')
print('patched', HTML.name, '-', len(edits), 'edits; backup', bak.name)
