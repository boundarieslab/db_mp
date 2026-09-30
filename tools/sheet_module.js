    // ─────────────────────────────────────────────────────────────────────
    // THE SHEETS. One grid for every tab, built like a spreadsheet: an active
    // cell the keyboard moves, rows picked with shift and ctrl, a totals line,
    // a filter on every column that has categories, find-in-sheet, a frozen
    // first column, columns that resize, and the whole view in the address.
    //
    // A column is { key, th, pth?, w, num?, filter?, text(r), html?(r),
    // sort?(r), raw?(r), keep? }. text() is what is copied, found, filtered
    // and exported; html() is what is drawn. A column that is empty for every
    // record of the sheet in view is not drawn, so a sort can never point at
    // a column with nothing in it.
    // ─────────────────────────────────────────────────────────────────────
    const rawCounts = { facility: 0, project: 0, flow: 0 };
    function isPicked(id) { try { return picked.has(id); } catch (err) { return false; } }
    function pickLine() { try { return pickSummary(); } catch (err) { return ''; } }
    const loadedAt = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    const dateNo = d => pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear();
    const dateIso = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

    // Capacity is only drawn when it is a volume in m³. Tonnes, and yearly
    // figures, are written in the number column and never drawn on the same
    // scale as a volume.
    function capOf(s) {
        const unit = String(s.CapacityUnit || '').toLowerCase();
        const tonnes = /t(onn|onne)?s?\b|tonn/.test(unit) && !/m3|m³/.test(unit);
        const yearly = /yr|year|år|\/a\b/.test(unit);
        const tot = qty(s.TotalCapacity), ann = qty(s.AnnualCapacity);
        if (Number.isFinite(tot) && !tonnes && !yearly) return { v: tot, unit: 'm³', drawn: true };
        if (Number.isFinite(tot)) return { v: tot, unit: tonnes ? (yearly ? 't/yr' : 't') : 'm³/yr', drawn: false };
        if (Number.isFinite(ann)) return { v: ann, unit: /m3|m³/.test(unit) ? 'm³/yr' : 't/yr', drawn: false };
        return null;
    }
    function volOf(f) {
        const v = qty(f.Volume_m3);
        if (!Number.isFinite(v)) return null;
        const u = String(f.VolumeUnit || 'm³').trim() || 'm³';
        return { v, unit: u, drawn: true };
    }
    const qtyText = c => c ? fmt(c.v) + (c.unit === 'm³' ? '' : ' ' + c.unit) : '';

    // One stroke is a round quantity chosen per sheet, so the longest bar
    // in the sheet stays under a hundred strokes.
    const STEPS = [100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000];
    let strokeUnit = 100000;
    // A phone gets the same sheet, cut down: the name (with its symbol), the
    // drawn capacity and the number. Everything else is one tap away in the record.
    const PHONE = window.matchMedia('(max-width: 760px)');
    const phone = () => PHONE.matches;
    function pickStroke(values) {
        const max = Math.max(0, ...values), most = phone() ? 24 : 100;
        strokeUnit = STEPS.find(s => max / s <= most) || STEPS[STEPS.length - 1];
    }
    function strokes(n, col) {
        const H = 13, W = 1.5, ADV = 2.5;
        if (n < 1) return '';
        let r = '';
        for (let i = 0; i < n; i++) r += `<rect x="${(i * ADV).toFixed(1)}" y="0" width="${W}" height="${H}"/>`;
        return `<svg class="strk" width="${(n * ADV).toFixed(1)}" height="${H}" fill="${col}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
    }
    const inkOf = s => { const c = colourOf(s); return c === '#FFFFFF' ? '#8a8a8a' : c; };
    const ring = col => `<svg class="ring" width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="#fff" stroke="${col === '#FFFFFF' ? '#4A4A4A' : col}" stroke-width="2.2"/></svg>`;

    const SITE_COLS = [
        { key: 'Name', th: 'th_name', pth: 'th_pname', w: 230, pw: 0, keep: true,
          text: s => s.Name || t('untitled'),
          html: s => phone() ? `<span class="nmc">${symbolFor(s)}<span class="nmw">${esc(s.Name || t('untitled'))}</span></span>` : esc(s.Name || t('untitled')) },
        { key: 'Municipality', nophone: true, th: 'th_kom', w: 130, filter: true,
          text: s => s.Municipality || '' },
        { key: 'Operator', nophone: true, th: 'th_op', pth: 'th_dev', w: 210, filter: true,
          text: s => s.Operator || s.Company || '' },
        { key: '__cls', nophone: true, th: 'th_st', w: 140, filter: true, keep: true,
          text: s => classInfo(s.__cat, s.__cls)[currentLang],
          // The colour is carried by the ring, at full strength; the word stays
          // black, so pure yellow never has to be read as text on white.
          html: s => `${ring(classInfo(s.__cat, s.__cls).col)}<span class="stw">${esc(classInfo(s.__cat, s.__cls)[currentLang])}</span>`,
          sort: s => ['active', 'future', 'contaminated', 'old', 'unknown'].indexOf(s.__cls) },
        { key: '__type', nophone: true, th: 'th_type', w: 170, filter: true, keep: true,
          text: s => s.Type || '',
          html: s => `${symbolFor(s)}<span class="tyw">${esc(s.Type || '')}</span>`,
          title: s => t('dir_' + getMarkerInfo(s).direction) },
        { key: '__cap', th: 'th_cap', w: 280, pw: 72, sth: 'th_cap_s', bar: true,
          text: s => { const c = capOf(s); return c && c.drawn ? String(c.v) : ''; },
          html: s => { const c = capOf(s); return c && c.drawn ? strokes(Math.floor(c.v / strokeUnit), inkOf(s)) : ''; },
          sort: s => { const c = capOf(s); return c ? c.v : NaN; }, num: true, nosum: true },
        { key: '__qty', th: 'th_m3', w: 140, pw: 118, num: true,
          text: s => qtyText(capOf(s)),
          html: s => { const c = capOf(s); if (!c) return '<span class="nd">n.d.</span>';
                       return c.drawn ? fmt(c.v) : `<span class="nd">${fmt(c.v)} ${esc(c.unit)}</span>`; },
          sort: s => { const c = capOf(s); return c ? c.v : NaN; },
          sum: s => { const c = capOf(s); return c && c.drawn ? c.v : NaN; },
          present: s => !!capOf(s) },
        { key: 'UID', nophone: true, th: 'th_uid', w: 110, cls: 'uid', keep: true, text: s => uidOf(s) }
    ];
    const FLOW_COLS = [
        { key: '__from', th: 'th_from', w: 230, pw: 0, keep: true, text: f => f.__fromName },
        { key: '__to', th: 'th_to', w: 230, nophone: true, keep: true, text: f => f.__toName },
        { key: 'MassType', nophone: true, th: 'th_mat', w: 150, filter: true, text: f => f.MassType || '' },
        { key: '__ev', nophone: true, th: 'th_ev', w: 170, filter: true, keep: true,
          text: f => t('ev_' + f.__ev),
          html: f => `<span class="ev ${f.__ev}"></span>${esc(t('ev_' + f.__ev))}`,
          sort: f => ['evidenced', 'structural', 'modelled'].indexOf(f.__ev) },
        { key: '__vbar', th: 'th_vol', w: 280, pw: 72, sth: 'th_vol_s', bar: true, num: true, nosum: true,
          text: f => { const c = volOf(f); return c ? String(c.v) : ''; },
          html: f => { const c = volOf(f); return c ? strokes(Math.floor(c.v / strokeUnit), '#111') : ''; },
          sort: f => { const c = volOf(f); return c ? c.v : NaN; } },
        { key: '__vol', th: 'th_m3', w: 150, pw: 110, num: true,
          text: f => { const c = volOf(f); return c ? fmt(c.v) + ' ' + c.unit : ''; },
          html: f => { const c = volOf(f); return c ? fmt(c.v) + ' <span class="nd">' + esc(c.unit) + '</span>' : '<span class="nd">n.d.</span>'; },
          sort: f => { const c = volOf(f); return c ? c.v : NaN; },
          sum: f => { const c = volOf(f); return c ? c.v : NaN; }, unitOf: f => (volOf(f) || {}).unit,
          present: f => !!volOf(f) },
        { key: '__period', nophone: true, th: 'th_period', w: 120, text: f => [f.PeriodStart, f.PeriodEnd].filter(Boolean).join('–'),
          sort: f => String(f.PeriodStart || '') },
        { key: 'SourceURL', nophone: true, th: 'th_src', w: 200,
          text: f => f.SourceURL || '',
          html: f => safeUrl(f.SourceURL) ? '<a href="' + esc(safeUrl(f.SourceURL)) + '" target="_blank" rel="noopener">'
                     + esc(String(f.SourceURL).replace(/^https?:\/\//, '')) + '</a>' : '' },
        { key: 'FlowUID', nophone: true, th: 'th_flow', w: 110, cls: 'uid', keep: true, text: f => f.FlowUID || '' }
    ];

    // Per-sheet state. The sheet key is the scope, or 'sel' for a box drawn on the map.
    const sheetKey = () => deckSelection ? 'sel' : deckScope;
    const SORT0 = { facility: { key: '__qty', dir: -1 }, project: { key: '__qty', dir: -1 },
                    all: { key: '__qty', dir: -1 }, sel: { key: '__qty', dir: -1 }, flow: { key: '__vol', dir: -1 } };
    const sheetSort = JSON.parse(JSON.stringify(SORT0));
    const colFilter = { facility: {}, project: {}, all: {}, sel: {}, flow: {} };   // key -> Set of values left out
    const findQ = { facility: '', project: '', all: '', sel: '', flow: '' };
    let colW = {};
    try { colW = JSON.parse(localStorage.getItem('db_colw') || '{}') || {}; } catch (err) { colW = {}; }
    let deckSort = sheetSort.facility;          // kept for anything that still reads it
    let flowSortKey = null;
    const picked = new Set();                   // rows picked with shift / ctrl
    let anchorIx = -1;                          // where a shift range starts
    let cur = { id: null, key: null };          // the active cell
    let viewRows = [], viewCols = [];

    const isFlowSheet = () => deckScope === 'flow' && !deckSelection;
    const rowId = r => r.__cat === 'flow' ? r.FlowUID : uidOf(r);
    const fold2 = v => String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a');

    function baseRows() {
        if (isFlowSheet()) return allFlows.filter(flowPasses);
        return allSites.filter(s =>
            (deckSelection ? deckSelection.has(uidOf(s)) : (deckScope === 'all' || s.__cat === deckScope)) && passes(s));
    }
    function visibleCols(rows) {
        const all = isFlowSheet() ? FLOW_COLS : SITE_COLS;
        return all.filter(c => !(phone() && c.nophone)).filter(c => c.keep || rows.some(r => c.present ? c.present(r) : String(c.text(r) || '').trim() !== ''));
    }
    function applyColFilters(rows, cols, skipKey) {
        const f = colFilter[sheetKey()];
        const q = fold2(findQ[sheetKey()]).trim();
        return rows.filter(r => {
            for (const k in f) {
                if (k === skipKey || !f[k] || !f[k].size) continue;
                const c = cols.find(x => x.key === k);
                if (c && f[k].has(String(c.text(r) || '').trim())) return false;
            }
            if (q) return cols.some(c => fold2(c.text(r)).includes(q));
            return true;
        });
    }
    function sortRows(rows, cols) {
        const sk = sheetKey();
        let s = sheetSort[sk];
        let col = cols.find(c => c.key === s.key);
        if (!col) { s = sheetSort[sk] = { key: cols[0].key, dir: 1 }; col = cols[0]; }
        deckSort = s;
        const d = s.dir;
        return rows.slice().sort((a, b) => {
            if (col.num || col.sort) {
                const av = col.sort ? col.sort(a) : qty(col.text(a)), bv = col.sort ? col.sort(b) : qty(col.text(b));
                if (typeof av === 'number' || typeof bv === 'number') {
                    const an = Number.isFinite(av), bn = Number.isFinite(bv);
                    if (!an && !bn) return 0;
                    if (!an) return 1;
                    if (!bn) return -1;
                    return (av - bv) * d;
                }
                return (av < bv ? -1 : av > bv ? 1 : 0) * d;
            }
            const at = String(col.text(a) || ''), bt = String(col.text(b) || '');
            if (!at && bt) return 1;
            if (at && !bt) return -1;
            return at.localeCompare(bt, 'nb') * d;
        });
    }
    function deckRows() {
        const base = baseRows();
        const cols = visibleCols(base);
        return sortRows(applyColFilters(base, cols), cols);
    }
    const activeCols = () => visibleCols(baseRows());

    // ── drawing the sheet ────────────────────────────────────────────────
    function clearDeckEmpty() {
        document.querySelectorAll('#deck .deck-empty').forEach(e => e.remove());
        $('site-table').hidden = false;
    }
    function sayInDeck(title, body) {
        const d = document.createElement('div');
        d.className = 'deck-empty';
        d.innerHTML = '<b>' + esc(title) + '</b>' + esc(body);
        $('site-table').after(d);
    }
    const FILTER_ICON = '<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path d="M0 1h9L5.5 5v4h-2V5z"/></svg>';

    function renderDeck() {
        clearDeckEmpty();
        const sk = sheetKey();
        const table = $('site-table');
        const base = baseRows();
        const cols = visibleCols(base);
        const rows = sortRows(applyColFilters(base, cols), cols);
        viewRows = rows; viewCols = cols;
        pickStroke(base.map(r => { const c = isFlowSheet() ? volOf(r) : capOf(r); return c && c.drawn ? c.v : 0; }));
        [...picked].forEach(id => { if (!rows.some(r => rowId(r) === id)) picked.delete(id); });

        // colgroup
        const oldCg = table.querySelector('colgroup'); if (oldCg) oldCg.remove();
        const cg = document.createElement('colgroup');
        const proj = deckScope === 'project' && !deckSelection;
        cols.forEach(c => {
            const col = document.createElement('col');
            if (phone()) { if (c.pw) col.style.width = c.pw + 'px'; }
            else col.style.width = ((colW[sk] && colW[sk][c.key]) || (colW._ && colW._[c.key]) || c.w) + 'px';
            col.dataset.key = c.key;
            cg.appendChild(col);
        });
        table.insertBefore(cg, table.firstChild);
        table.style.width = phone() ? '100%'
            : cols.reduce((a, c) => a + ((colW[sk] && colW[sk][c.key]) || (colW._ && colW._[c.key]) || c.w), 0) + 'px';

        // header
        deckHeadRow.innerHTML = '';
        cols.forEach((c, i) => {
            const th = document.createElement('th');
            th.dataset.key = c.key;
            th.className = [c.num ? 'num' : '', c.bar ? 'bar' : ''].join(' ').trim();
            const lab = document.createElement('span');
            lab.className = 'lab';
            lab.textContent = t(phone() && c.sth ? c.sth : proj && c.pth ? c.pth : c.th);
            th.appendChild(lab);
            if (c.bar) {
                const u = document.createElement('span');
                u.className = 'unit';
                u.innerHTML = strokes(1, '#000') + ' = ' + fmt(strokeUnit) + ' m³';
                th.appendChild(u);
            }
            const s = sheetSort[sk];
            const sorted = s.key === c.key;
            if (sorted) { const a = document.createElement('span'); a.className = 'ar'; a.textContent = s.dir < 0 ? ' ↓' : ' ↑'; lab.appendChild(a); }
            th.setAttribute('aria-sort', sorted ? (s.dir < 0 ? 'descending' : 'ascending') : 'none');
            if (c.filter) {
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'af';
                const on = colFilter[sk][c.key] && colFilter[sk][c.key].size;
                b.classList.toggle('on', !!on);
                b.title = t('af_title'); b.setAttribute('aria-label', t('af_title'));
                b.innerHTML = FILTER_ICON;
                b.onclick = e => { e.stopPropagation(); openAutoFilter(c, th); };
                th.appendChild(b);
            }
            const rz = document.createElement('span');
            rz.className = 'rz';
            rz.onpointerdown = e => startResize(e, c, i);
            rz.ondblclick = e => { e.stopPropagation(); autofit(c, i); };
            rz.onclick = e => e.stopPropagation();
            th.appendChild(rz);
            th.onclick = () => {
                const s0 = sheetSort[sk];
                sheetSort[sk] = s0.key === c.key ? { key: c.key, dir: -s0.dir } : { key: c.key, dir: c.num ? -1 : 1 };
                renderDeck(); saveSheetHash();
            };
            deckHeadRow.appendChild(th);
        });

        // body
        deckBody.innerHTML = '';
        const frag = document.createDocumentFragment();
        rows.forEach((r, ri) => {
            const tr = document.createElement('tr');
            const id = rowId(r);
            if (r.__cat === 'flow') { tr.dataset.flow = id; if (!r.__xy) tr.classList.add('nogeo'); }
            else { tr.dataset.uid = id; if (!hasXY(r)) tr.classList.add('nogeo'); if (currentSite === r) tr.classList.add('sel'); }
            if (picked.has(id)) tr.classList.add('pick');
            tr.dataset.ix = ri;
            cols.forEach(c => {
                const td = document.createElement('td');
                td.dataset.key = c.key;
                if (c.html) td.innerHTML = c.html(r); else td.textContent = c.text(r);
                const tip = c.title ? c.title(r) : c.text(r);
                if (tip && !c.bar) td.title = tip;
                td.className = [c.num ? 'num' : '', c.cls || '', c.bar ? 'bar' : ''].join(' ').trim();
                if (cur.id === id && cur.key === c.key) td.classList.add('cur');
                tr.appendChild(td);
            });
            if (r.__cat === 'flow') {
                tr.onmouseenter = () => hotFlow(r.FlowUID);
                tr.onmouseleave = () => hotFlow(null);
            } else {
                tr.onmouseenter = e => showHover(r, e);
                tr.onmousemove = e => { if (hoverUid === uidOf(r)) placeHover(e); };
                tr.onmouseleave = hideHover;
            }
            frag.appendChild(tr);
        });
        deckBody.appendChild(frag);
        renderTotals(base, rows, cols);

        // an empty sheet says why
        if (!base.length) {
            const cat = isFlowSheet() ? 'flow' : deckScope;
            if (!deckSelection && (cat === 'project' || cat === 'flow' || cat === 'facility')) {
                const held = rawCounts[cat] || 0;
                const noun = t('n_' + cat);
                if (cat === 'flow' && !allFlows.length) { table.hidden = true; }
                sayInDeck(held ? t('held_t').replace('{n}', held).replace('{what}', noun) : t('none_t').replace('{what}', noun),
                          t('held_b'));
            }
        } else if (!rows.length) {
            sayInDeck(t('nomatch_t'), t('nomatch_b'));
        }
        if (isFlowSheet() && !allFlows.length) {
            deckHeadRow.innerHTML = ''; deckBody.innerHTML = ''; $('site-table').tFoot && $('site-table').tFoot.remove();
            const cgx = table.querySelector('colgroup'); if (cgx) cgx.remove();
            table.hidden = true;
        }

        // count, title, chips, key, tabs
        const nf = rows.length, nb = base.length;
        deckCount.textContent = nf < nb ? nf + ' ' + t('of') + ' ' + nb : '';
        const title = $('deck-title');
        const key = deckSelection ? 'selection' : deckScope === 'project' ? 'projects' :
                    deckScope === 'flow' ? 'flows' : deckScope === 'all' ? 'selection' : 'recep';
        title.setAttribute('data-en', t2(key, 'en')); title.setAttribute('data-no', t2(key, 'no'));
        title.textContent = t(key);
        const fi = $('deck-find');
        if (fi && document.activeElement !== fi) fi.value = findQ[sk] || '';
        const sf = $('sheet-find');
        if (sf && document.activeElement !== sf) sf.value = findQ[sk] || '';
        renderChips();
        renderSheetKey(base);
        markDeckSelection(true);
        paintTabs();
        fitHead();
        updateStatus();
    }
    const renderDeckHead = () => renderDeck();
    const renderFlowDeck = () => renderDeck();

    // ── totals line: what a spreadsheet puts under the last row ─────────
    function renderTotals(base, rows, cols) {
        const table = $('site-table');
        if (table.tFoot) table.tFoot.remove();
        if (!rows.length) return;
        const tf = table.createTFoot();
        const tr = tf.insertRow();
        const mixed = !isFlowSheet() && new Set(rows.map(r => r.__cat)).size > 1;
        cols.forEach((c, i) => {
            const td = tr.insertCell();
            td.className = c.num ? 'num' : '';
            if (i === 0) td.textContent = rows.length + ' ' + t('rows') + (rows.length < base.length ? ' ' + t('of') + ' ' + base.length : '');
            else if (c.bar) {
                const q = cols.find(x => x.sum);
                const n = q ? rows.filter(r => q.present(r)).length : 0;
                if (phone()) {
                    tr.cells[0].innerHTML += ' <span class="nd">· ' + n + '/' + rows.length + '</span>';
                } else td.innerHTML = '<span class="nd">' + t('stated').replace('{n}', n).replace('{m}', rows.length) + '</span>';
            } else if (c.sum) {
                const vals = rows.map(c.sum).filter(Number.isFinite);
                const units = c.unitOf ? new Set(rows.filter(r => Number.isFinite(c.sum(r))).map(c.unitOf)) : new Set(['m³']);
                if (mixed) td.innerHTML = '<span class="nd">' + t('nosum_mix') + '</span>';
                else if (units.size > 1) td.innerHTML = '<span class="nd">' + t('nosum_unit') + '</span>';
                else if (vals.length) td.innerHTML = '<span class="sig">Σ</span> ' + fmt(vals.reduce((a, b) => a + b, 0)) + (units.size && [...units][0] !== 'm³' ? ' ' + esc([...units][0]) : '');
            }
        });
    }

    // ── the key inside the sheet, under the table ───────────────────────
    // The key is one quiet line under the table, as in the mockups: the
    // symbols in this sheet, the stroke, and what is held back.
    function renderSheetKey(base) {
        const box = $('sheet-key');
        if (!box) return;
        if (isFlowSheet() && !allFlows.length) { box.innerHTML = ''; return; }
        const flow = isFlowSheet();
        const parts = [];
        if (!flow) ['receiving', 'producing', 'mixed']
            .filter(d => base.some(s => getMarkerInfo(s).direction === d))
            .forEach(d => parts.push(`<span class="it dir">${facilitySymbol(d, '#555')}${esc(t('kdir_' + d))}</span>`));
        if (base.length) {
            parts.push(`<span class="it unit">${strokes(1, '#555')} = ${fmt(strokeUnit)} m³</span>`);
            parts.push(`<span class="it note">${esc(t(flow ? 'key_vol' : 'key_cap'))}</span>`);
        }
        const cat = flow ? 'flow' : deckSelection ? null : deckScope;
        if (cat && cat !== 'all') {
            const pub = flow ? allFlows.length : allSites.filter(s => s.__cat === cat).length;
            const held = Math.max(0, (rawCounts[cat] || 0) - pub);
            parts.push(`<span class="it">${esc(t('cov').replace('{p}', pub) + (held ? ' · ' + t('cov_held').replace('{h}', held) : ''))}</span>`);
        }
        parts.push(`<span class="it">${dateNo(loadedAt)}</span>`);
        // a separator takes the class of the item after it, so hiding an item hides its dot
        box.innerHTML = `<div class="kr">${parts.map((p, i) => i ? `<span class="sep ${(/class="it ?(\w*)/.exec(p) || [])[1] || ''}">·</span>${p}` : p).join('')}</div>`;
    }


    // ── the legend chips in the head: the map's ring, the word, the count ─
    // On a phone the head holds only the tabs; the legend moves into the top
    // of the open sheet as rings and counts, each still a switch.
    function mirrorChips() {
        const bar = $('sheet-chips'); if (!bar) return;
        bar.innerHTML = '';
        $('deck-chips').querySelectorAll('.chip').forEach(c => {
            const k = c.cloneNode(true);
            k.removeAttribute('id');
            k.setAttribute('aria-label', c.title || c.textContent.trim());
            k.onclick = e => { e.stopPropagation(); c.click(); };
            bar.appendChild(k);
        });
    }
    function renderChips() {
        const box = $('deck-chips');
        box.innerHTML = '';
        if (isFlowSheet()) { renderFlowChips(box); mirrorChips(); return; }
        const cats = (deckSelection || deckScope === 'all') ? ['facility', 'project']
                                                            : [deckScope === 'project' ? 'project' : 'facility'];
        cats.forEach(cat => {
            const pool = allSites.filter(s => s.__cat === cat && (!deckSelection || deckSelection.has(uidOf(s))));
            if (deckSelection && !pool.length) return;
            CLASSES[cat].forEach(ci => {
                const n = pool.filter(s => s.__cls === ci.k).length;
                if (!n && ci.k === 'unknown') return;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'chip';
                b.dataset.cat = cat; b.dataset.cls = ci.k;
                const on = show[cat].on && show[cat].cls.has(ci.k);
                b.setAttribute('aria-pressed', String(on));
                b.title = ci[currentLang];
                b.innerHTML = `${ring(ci.col)}<span class="w">${esc(ci[currentLang])}</span> <span class="ct">${n}</span>`;
                b.onclick = e => {
                    e.stopPropagation();
                    const set = show[cat].cls;
                    if (e.altKey) { set.clear(); set.add(ci.k); }
                    else if (set.has(ci.k)) set.delete(ci.k); else set.add(ci.k);
                    if (!show[cat].on) { show[cat].on = true; $(cat === 'project' ? 'filter-projects' : 'filter-facilities').checked = true; }
                    applyFilters();
                    renderDeck();
                };
                box.appendChild(b);
            });
        });
        if (deckSelection) {
            const c = document.createElement('button');
            c.type = 'button'; c.className = 'chip clear'; c.id = 'deck-clear';
            c.textContent = '✕ ' + t('clearsel');
            c.onclick = e => { e.stopPropagation(); clearSelection(); };
            box.appendChild(c);
        }
    }

    // ── sheet tabs at 45°: drawn, so the slant and the hairline are exact ─
    const SHORT = { en: { all: 'ALL', facility: 'RECEP.', project: 'CONSTR.', dod: 'TERRAIN', flow: 'FLOWS' },
                    no: { all: 'ALLE', facility: 'MOTTAK', project: 'BYGG', dod: 'TERRENG', flow: 'STRØM' } };
    function paintTabs() {
        const strip = $('tabstrip');
        if (!strip) return;
        strip.querySelectorAll('.tab').forEach(tb => {
            const l = tb.querySelector('.tl'); if (!l) return;
            l.textContent = l.getAttribute('data-' + currentLang);   // names are never shortened
        });
        const hl = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hl')) || 0.5;
        strip.querySelectorAll('.tab').forEach(tb => {
            let svg = tb.querySelector('svg.shape');
            if (phone() && tb.getAttribute('aria-selected') === 'true') {
                const l = tb.offsetLeft, r = l + tb.offsetWidth;
                if (l < strip.scrollLeft) strip.scrollLeft = Math.max(0, l - 8);
                else if (r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = r - strip.clientWidth + 8;
            }
            if (!svg) {
                svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('class', 'shape'); svg.setAttribute('aria-hidden', 'true');
                tb.insertBefore(svg, tb.firstChild);
            }
            const w = tb.offsetWidth, h = tb.offsetHeight;
            if (!w || !h) return;
            const on = tb.getAttribute('aria-selected') === 'true';
            // Every edge sits on the device-pixel grid and is drawn without
            // smoothing, so the slants, the top and the rule below are one
            // and the same line: one pixel, full black of the frame.
            // The label sits in the middle of the trapezoid: the tab's top padding
            // equals its top edge, so the letters never touch the line above them.
            const hh = hl / 2, top = (phone() ? h - 17 : 9) + hh, bot = h - hh;
            const s = bot - top;                        // 45°: the slant runs as far as it rises
            const pts = `${hh},${bot} ${hh + s},${top} ${w - hh - s},${top} ${w - hh},${bot}`;
            svg.setAttribute('width', w); svg.setAttribute('height', h + 1);
            svg.setAttribute('viewBox', `0 0 ${w} ${h + 1}`);
            svg.innerHTML = `<polygon points="${pts} ${w - hh},${h} ${hh},${h}" style="fill:${on ? '#fff' : 'var(--stack-tab)'}"/>` +
                `<polyline points="${pts}" shape-rendering="crispEdges" style="fill:none;stroke:var(--frame);stroke-width:${hl}px"/>` +
                (on ? `<rect x="${hl}" y="${h - hl}" width="${Math.max(0, w - 2 * hl)}" height="${1 + hl}" fill="#fff"/>` : '');
        });
        mirrorChips();
    }
    // When the legend does not fit beside the tabs, it closes up before it scrolls.
    function fitHead() {
        const head = document.querySelector('.deck-head'), chips = $('deck-chips');
        if (!head || !chips) return;
        head.classList.remove('tight');
        if (chips.scrollWidth > chips.clientWidth + 1) head.classList.add('tight');
    }
    PHONE.addEventListener('change', () => { if (allSites.length) renderDeck(); });
    if (window.ResizeObserver) {
        new ResizeObserver(() => paintTabs()).observe($('tabstrip'));
        new ResizeObserver(() => fitHead()).observe(document.querySelector('.deck-head'));
    }
    // The thinnest line a screen can draw is one device pixel.
    (function hairline() {
        const set = () => document.documentElement.style.setProperty('--hl', (1 / (window.devicePixelRatio || 1)) + 'px');
        set();
        try { matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { set(); paintTabs(); }); } catch (err) {}
    })();

    // ── picking rows, the active cell, the keyboard ──────────────────────
    const sheetEl = document.querySelector('#deck .deck-scroll');
    sheetEl.tabIndex = 0;
    function syncPickState(prev) {
        if (!sitesReady || isFlowSheet()) return;
        const now = new Set(picked);
        prev.forEach(id => { if (!now.has(id) && id !== hotUid) {
            map.setFeatureState({ source: 'sites', id }, { hot: false });
            map.setFeatureState({ source: 'fp', id }, { hot: false }); } });
        now.forEach(id => { map.setFeatureState({ source: 'sites', id }, { hot: true });
                            map.setFeatureState({ source: 'fp', id }, { hot: true }); });
    }
    function setPicked(ids) {
        const prev = new Set(picked);
        picked.clear(); ids.forEach(id => picked.add(id));
        deckBody.querySelectorAll('tr').forEach(tr => tr.classList.toggle('pick', picked.has(tr.dataset.uid || tr.dataset.flow)));
        syncPickState(prev);
        updateStatus();
    }
    function setCur(ix, key, scroll) {
        if (!viewRows.length || !viewCols.length) return;
        ix = Math.max(0, Math.min(viewRows.length - 1, ix));
        if (!viewCols.some(c => c.key === key)) key = viewCols[0].key;
        cur = { id: rowId(viewRows[ix]), key };
        deckBody.querySelectorAll('td.cur').forEach(td => td.classList.remove('cur'));
        const tr = deckBody.children[ix];
        const td = tr && tr.querySelector(`td[data-key="${CSS.escape(key)}"]`);
        if (td) {
            td.classList.add('cur');
            if (scroll) {
                const sc = sheetEl, first = tr.children[0];
                const fw = first && first !== td ? first.offsetWidth : 0;
                const top = tr.offsetTop - (sc.querySelector('thead').offsetHeight || 0);
                const bottom = tr.offsetTop + tr.offsetHeight + ((sc.querySelector('tfoot') || {}).offsetHeight || 0);
                if (top < sc.scrollTop) sc.scrollTop = top;
                else if (bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = bottom - sc.clientHeight;
                if (td.offsetLeft - fw < sc.scrollLeft) sc.scrollLeft = td.offsetLeft - fw;
                else if (td.offsetLeft + td.offsetWidth > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = td.offsetLeft + td.offsetWidth - sc.clientWidth;
            }
        }
    }
    const curIx = () => viewRows.findIndex(r => rowId(r) === cur.id);
    function openRow(r) {
        if (r.__cat === 'flow') frameFlow(r, true); else openSite(r, true);
    }
    deckBody.addEventListener('click', e => {
        const td = e.target.closest('td'); const tr = e.target.closest('tr');
        if (!tr || e.target.closest('a')) return;
        const ix = +tr.dataset.ix, r = viewRows[ix];
        if (!r) return;
        setCur(ix, td ? td.dataset.key : cur.key);
        const id = rowId(r);
        if (e.shiftKey && anchorIx >= 0) {
            const [a, b] = [Math.min(anchorIx, ix), Math.max(anchorIx, ix)];
            setPicked(viewRows.slice(a, b + 1).map(rowId));
            window.getSelection && window.getSelection().removeAllRanges();
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            const next = new Set(picked);
            if (next.has(id)) next.delete(id); else next.add(id);
            setPicked([...next]); anchorIx = ix;
            return;
        }
        anchorIx = ix;
        if (picked.size) setPicked([]);
        openRow(r);
    });
    deckBody.addEventListener('mousedown', e => { if (e.shiftKey) e.preventDefault(); });

    function copyText(s, note) {
        const done = () => updateStatus(note);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, fallback);
        else fallback();
        function fallback() {
            const ta = document.createElement('textarea');
            ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch (err) {}
            ta.remove(); done();
        }
    }
    const tsvCell = v => String(v == null ? '' : v).replace(/[\t\n\r]+/g, ' ');
    function copySheet() {
        if (picked.size) {
            const rows = viewRows.filter(r => picked.has(rowId(r)));
            const head = viewCols.filter(c => !c.bar).map(c => t(c.th)).join('\t');
            const body = rows.map(r => viewCols.filter(c => !c.bar).map(c => tsvCell(c.text(r))).join('\t')).join('\n');
            copyText(head + '\n' + body, rows.length + ' ' + t('rows_copied'));
            return;
        }
        const ix = curIx(); const c = viewCols.find(x => x.key === cur.key);
        if (ix < 0 || !c) return;
        copyText(tsvCell(c.text(viewRows[ix])), t('cell_copied'));
    }
    sheetEl.addEventListener('keydown', e => {
        if (e.target.closest('input,button,a')) return;
        const mod = e.ctrlKey || e.metaKey;
        let ix = curIx(); if (ix < 0) ix = 0;
        let ci = Math.max(0, viewCols.findIndex(c => c.key === cur.key));
        const page = Math.max(1, Math.floor(sheetEl.clientHeight / 30) - 2);
        const move = (nix, nci) => {
            nix = Math.max(0, Math.min(viewRows.length - 1, nix));
            nci = Math.max(0, Math.min(viewCols.length - 1, nci));
            if (e.shiftKey && nix !== ix) {
                if (anchorIx < 0) anchorIx = ix;
                const [a, b] = [Math.min(anchorIx, nix), Math.max(anchorIx, nix)];
                setPicked(viewRows.slice(a, b + 1).map(rowId));
            } else if (!e.shiftKey) anchorIx = nix;
            setCur(nix, viewCols[nci].key, true);
            const r = viewRows[nix];
            if (r && r.__cat !== 'flow') setHot(r);
            e.preventDefault();
        };
        switch (e.key) {
            case 'ArrowDown': return move(mod ? viewRows.length - 1 : ix + 1, ci);
            case 'ArrowUp': return move(mod ? 0 : ix - 1, ci);
            case 'ArrowRight': return move(ix, mod ? viewCols.length - 1 : ci + 1);
            case 'ArrowLeft': return move(ix, mod ? 0 : ci - 1);
            case 'PageDown': return move(ix + page, ci);
            case 'PageUp': return move(ix - page, ci);
            case 'Home': return move(mod ? 0 : ix, 0);
            case 'End': return move(mod ? viewRows.length - 1 : ix, viewCols.length - 1);
            case 'Enter': if (viewRows[ix]) { openRow(viewRows[ix]); e.preventDefault(); } return;
            case ' ': {
                const id = viewRows[ix] && rowId(viewRows[ix]); if (!id) return;
                const next = new Set(picked); if (next.has(id)) next.delete(id); else next.add(id);
                setPicked([...next]); anchorIx = ix; e.preventDefault(); return;
            }
            case 'Escape':
                if (picked.size) { setPicked([]); e.preventDefault(); e.stopPropagation(); }
                return;
        }
        if (mod && (e.key === 'c' || e.key === 'C')) { copySheet(); e.preventDefault(); }
        else if (mod && (e.key === 'a' || e.key === 'A')) { setPicked(viewRows.map(rowId)); e.preventDefault(); }
        else if (mod && (e.key === 'f' || e.key === 'F')) { const fi = $('deck-find'); if (fi) { fi.focus(); fi.select(); e.preventDefault(); } }
    });
    sheetEl.addEventListener('focus', () => { if (!cur.id && viewRows.length) setCur(0, viewCols[0].key); });

    // What the status line adds while rows are picked: count and, where it
    // is honest to add them up, the sum.
    function pickSummary() {
        if (!picked.size) return '';
        const rows = viewRows.filter(r => picked.has(rowId(r)));
        const c = viewCols.find(x => x.sum);
        let s = ' · ' + rows.length + ' ' + t('picked');
        if (!c) return s;
        const vals = rows.map(c.sum).filter(Number.isFinite);
        const mixed = new Set(rows.map(r => r.__cat)).size > 1;
        const units = c.unitOf ? new Set(rows.filter(r => Number.isFinite(c.sum(r))).map(c.unitOf)) : new Set(['m³']);
        if (!vals.length || mixed || units.size > 1) return s;
        return s + ' · Σ ' + fmt(vals.reduce((a, b) => a + b, 0)) + ' ' + [...units][0] +
               ' (' + t('stated').replace('{n}', vals.length).replace('{m}', rows.length) + ')';
    }

    // ── AutoFilter: the list of values under a column head ──────────────
    const afPop = $('af-pop');
    let afCol = null;
    function openAutoFilter(c, th) {
        if (afCol === c.key && !afPop.hidden) { closeAutoFilter(); return; }
        afCol = c.key;
        const sk = sheetKey();
        const base = baseRows();
        const cols = visibleCols(base);
        const pool = applyColFilters(base, cols, c.key);
        const counts = new Map();
        pool.forEach(r => { const v = String(c.text(r) || '').trim(); counts.set(v, (counts.get(v) || 0) + 1); });
        (colFilter[sk][c.key] || new Set()).forEach(v => { if (!counts.has(v)) counts.set(v, 0); });
        const vals = [...counts.keys()].sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b, 'nb'));
        const out = colFilter[sk][c.key] || new Set();
        let h = `<div class="af-sort"><button type="button" data-dir="1">${esc(t('af_az'))}</button><button type="button" data-dir="-1">${esc(t('af_za'))}</button></div>`;
        h += `<label class="af-all"><input type="checkbox" ${out.size ? '' : 'checked'}> ${esc(t('af_all'))}</label><div class="af-list">`;
        vals.forEach(v => {
            h += `<label><input type="checkbox" data-v="${esc(v)}" ${out.has(v) ? '' : 'checked'}> <span>${esc(v || t('af_blank'))}</span><i>${counts.get(v)}</i></label>`;
        });
        h += '</div>';
        afPop.innerHTML = h;
        afPop.hidden = false;
        const r = th.getBoundingClientRect();
        const w = afPop.offsetWidth, hh = afPop.offsetHeight;
        let left = Math.min(r.left, innerWidth - w - 8), top = r.bottom;
        if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh);
        afPop.style.left = Math.max(8, left) + 'px'; afPop.style.top = top + 'px';
        const apply = () => {
            const set = new Set();
            afPop.querySelectorAll('.af-list input').forEach(i => { if (!i.checked) set.add(i.dataset.v); });
            if (set.size) colFilter[sk][c.key] = set; else delete colFilter[sk][c.key];
            afPop.querySelector('.af-all input').checked = !set.size;
            renderDeck(); saveSheetHash();
        };
        afPop.querySelectorAll('.af-list input').forEach(i => i.onchange = apply);
        afPop.querySelector('.af-all input').onchange = e => {
            afPop.querySelectorAll('.af-list input').forEach(i => { i.checked = e.target.checked; });
            apply();
        };
        afPop.querySelectorAll('.af-sort button').forEach(b => b.onclick = () => {
            sheetSort[sk] = { key: c.key, dir: +b.dataset.dir }; renderDeck(); saveSheetHash(); closeAutoFilter();
        });
    }
    function closeAutoFilter() { afPop.hidden = true; afCol = null; }
    document.addEventListener('mousedown', e => {
        if (!afPop.hidden && !e.target.closest('#af-pop') && !e.target.closest('th .af')) closeAutoFilter();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !afPop.hidden) { closeAutoFilter(); e.stopImmediatePropagation(); }
    }, true);

    // ── find in sheet ────────────────────────────────────────────────────
    (function () {
        const fi = $('deck-find');
        if (!fi) return;
        fi.addEventListener('click', e => e.stopPropagation());
        fi.addEventListener('input', () => { findQ[sheetKey()] = fi.value; renderDeck(); saveSheetHash(); });
        fi.addEventListener('keydown', e => {
            if (e.key === 'Escape') { fi.value = ''; findQ[sheetKey()] = ''; renderDeck(); saveSheetHash(); sheetEl.focus(); e.stopPropagation(); }
            if (e.key === 'Enter' || e.key === 'ArrowDown') { sheetEl.focus(); if (viewRows.length) setCur(0, viewCols[0].key, true); e.preventDefault(); }
        });
    })();

    // On a phone the size control lives in the sheet's own bar, so the head
    // is all tabs. It is the same control: it presses the head's button.
    (function () {
        const b = $('sheet-size');
        if (b) b.onclick = e => { e.stopPropagation(); $('deck-size').click();
            b.querySelector('svg').style.transform = deckSize === 'full' ? 'rotate(180deg)' : ''; };
    })();

    // The phone's find box, in the sheet's own top bar. Same query as the head's.
    (function () {
        const fi = $('sheet-find');
        if (!fi) return;
        fi.addEventListener('click', e => e.stopPropagation());
        fi.addEventListener('input', () => { findQ[sheetKey()] = fi.value; const h = $('deck-find'); if (h) h.value = fi.value; renderDeck(); saveSheetHash(); });
    })();

    // ── column widths: drag the edge, double-click to fit ────────────────
    function setColW(key, w) {
        const sk = sheetKey();
        colW[sk] = colW[sk] || {};
        colW[sk][key] = Math.round(Math.max(40, Math.min(900, w)));
        try { localStorage.setItem('db_colw', JSON.stringify(colW)); } catch (err) {}
    }
    function startResize(e, c, i) {
        e.preventDefault(); e.stopPropagation();
        const table = $('site-table');
        const col = table.querySelector(`colgroup col[data-key="${CSS.escape(c.key)}"]`);
        const x0 = e.clientX, w0 = col ? col.getBoundingClientRect().width || parseFloat(col.style.width) : c.w;
        const tw0 = table.offsetWidth;
        document.body.classList.add('col-resizing');
        const mv = ev => {
            const w = Math.max(40, w0 + ev.clientX - x0);
            if (col) col.style.width = w + 'px';
            table.style.width = (tw0 + (w - w0)) + 'px';
        };
        const up = ev => {
            window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
            document.body.classList.remove('col-resizing');
            setColW(c.key, Math.max(40, w0 + ev.clientX - x0));
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    }
    function autofit(c, i) {
        let w = 0;
        const th = deckHeadRow.children[i];
        if (th) { const l = th.querySelector('.lab'); w = (l ? l.scrollWidth : 0) + 44; }
        deckBody.querySelectorAll(`td[data-key="${CSS.escape(c.key)}"]`).forEach(td => {
            const k = td.firstElementChild && td.children.length === 1 && td.firstChild === td.firstElementChild
                ? td.firstElementChild.getBoundingClientRect().width : 0;
            const range = document.createRange(); range.selectNodeContents(td);
            const rw = range.getBoundingClientRect().width;
            w = Math.max(w, Math.ceil(Math.max(rw, k)) + 24);
        });
        setColW(c.key, w);
        renderDeck();
    }

    // ── the view in the address: #sheet=, &sort=, &af=, &q= ─────────────
    function saveSheetHash() {
        if (deckSelection) return;
        const sk = deckScope, s = sheetSort[sk], d = SORT0[sk] || {};
        const f = colFilter[sk];
        const af = Object.keys(f).filter(k => f[k] && f[k].size)
            .map(k => k + ':' + [...f[k]].map(v => v.replace(/[|;:]/g, ' ')).join('|')).join(';');
        writeHash({
            sheet: sk === 'facility' ? null : sk,
            sort: s && (s.key !== d.key || s.dir !== d.dir) ? s.key + (s.dir < 0 ? '-' : '+') : null,
            af: af || null,
            q: findQ[sk] || null
        });
    }
    function applySheetHash(h) {
        const sk = ['facility', 'project', 'all', 'flow'].includes(h.sheet) ? h.sheet : 'facility';
        if (h.sort) { const m = /^(.+?)([+-])$/.exec(h.sort); if (m) sheetSort[sk] = { key: m[1], dir: m[2] === '-' ? -1 : 1 }; }
        if (h.af) h.af.split(';').forEach(p => {
            const i = p.indexOf(':'); if (i < 1) return;
            colFilter[sk][p.slice(0, i)] = new Set(p.slice(i + 1).split('|'));
        });
        if (h.q) findQ[sk] = h.q;
        if (sk !== 'facility') { deckScope = sk; selectTab(sk, true); }
        return !!(h.sheet || h.sort || h.af || h.q);
    }
