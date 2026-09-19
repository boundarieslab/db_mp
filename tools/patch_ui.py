#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dirtybusiness.no map — interface corrections, and the FLOWS sheet.

Applies a fixed list of edits to index.html. Every edit asserts its own
match count; if any one of them does not match exactly once the script
stops and writes nothing. A timestamped backup is kept beside the file.

    python3 tools/patch_ui.py
"""
import io, os, re, sys, shutil, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE) if os.path.basename(HERE) == 'tools' else HERE
SRC = os.path.join(ROOT, 'index.html')

with io.open(SRC, encoding='utf-8') as f:
    html = f.read()

EDITS = []


def edit(name, pattern, repl, count=1):
    """`repl` is a literal string. Use @@1@@ to stand for group 1."""
    EDITS.append((name, pattern, repl, count))


# =====================================================================
# 1. THE MODULE — one column width for the tool bar and every pane,
#    one left edge for everything on the page.
# =====================================================================
edit('tokens',
     r"  --row:25px;\n  --gut:12px;\n  --rail:34px;\n  --bar:300px;\n",
     "  --row:25px;\n"
     "  --gut:10px;        /* one gutter, and the page's left edge         */\n"
     "  --rail:34px;\n"
     "  --bar:342px;       /* THE MODULE: tool bar and every pane share it */\n"
     "  --ctl:34px;        /* compass and zoom: one width in the corner    */\n"
     "  --t-title:15px;    /* the one step above the instrument sizes      */\n")

edit('toolbar width',
     r"\.toolbar\{flex:0 0 auto;background:#fff;border:\.5px solid var\(--frame\);\n"
     r"  display:flex;flex-direction:row;gap:2px;padding:3px;align-items:center\}",
     ".toolbar{flex:0 0 auto;width:var(--bar);background:#fff;border:.5px solid var(--frame);\n"
     "  display:flex;flex-direction:row;gap:2px;padding:3px;align-items:center}")

edit('lang flush right',
     r"\.toolbar \.lang\{display:flex;flex-direction:row;gap:2px;margin-left:3px;",
     ".toolbar .lang{display:flex;flex-direction:row;gap:2px;margin-left:auto;")

edit('tab gutter',
     r"cursor:pointer;padding:0 12px;text-align:left;",
     "cursor:pointer;padding:0 var(--gut);text-align:left;")

edit('title step',
     r"h1\{font:500 13px/1\.2 Plex,sans-serif;margin:0 0 3px\}",
     "h1{font:500 var(--t-title)/1.25 Plex,sans-serif;margin:0 0 4px;letter-spacing:-.006em}")

# =====================================================================
# 2. SEARCH — the result list was absolutely positioned inside a pane
#    that clips, so a row and a half of it was all anyone ever saw.
# =====================================================================
edit('search results in flow',
     r"\.search-results\{position:absolute;left:0;top:24px;width:calc\(var\(--bar\) - 8px\);"
     r"background:#fff;border:\.5px solid var\(--frame\);\n"
     r"  max-height:300px;overflow-y:auto;display:none;z-index:40\}",
     ".search-results{width:100%;background:#fff;border:.5px solid var(--frame);border-top:0;\n"
     "  max-height:none;display:none;margin-top:-0.5px}")

# =====================================================================
# 3. THE CORNER — compass and zoom fuse into one block of one width.
#    The scale bar leaves for the status line, so a bar that changes
#    length as you zoom stops changing the corner's silhouette.
# =====================================================================
edit('corner block',
     r"\.maplibregl-ctrl-bottom-left \.maplibregl-ctrl\{margin:0 0 6px 0\}",
     ".maplibregl-ctrl-bottom-left .maplibregl-ctrl{margin:0}\n"
     ".maplibregl-ctrl-bottom-left .maplibregl-ctrl-group{border-top:0}")

edit('compass width',
     r"\.compass\{width:36px;height:60px;",
     ".compass{width:var(--ctl);height:56px;border-bottom:0;")

edit('zoom width',
     r"\.maplibregl-ctrl-group button\{width:24px;height:24px;background:#fff\}",
     ".maplibregl-ctrl-group button{width:var(--ctl);height:24px;background:#fff}")

edit('compass needle centred',
     r"\.compass svg\{position:absolute;left:8px;top:3px;",
     ".compass svg{position:absolute;left:calc((var(--ctl) - 20px) / 2);top:3px;")

edit('attribution square',
     r"\.maplibregl-ctrl-attrib\{background:rgba\(255,255,255,\.85\)!important;font:9px Plex,sans-serif\}",
     ".maplibregl-ctrl-attrib{background:rgba(255,255,255,.85)!important;font:9px Plex,sans-serif;\n"
     "  border-radius:0!important;padding:0 4px}\n"
     ".maplibregl-ctrl-attrib-button{border-radius:0!important;background:#fff!important;\n"
     "  border:.5px solid var(--frame);width:14px;height:14px;background-size:11px!important}\n"
     ".maplibregl-ctrl-attrib.maplibregl-compact-show{padding-right:18px}\n"
     "/* the scale bar, once it has moved into the status line */\n"
     ".status-strip .maplibregl-ctrl-scale{position:static;margin:0;flex:0 0 auto;\n"
     "  border:.5px solid var(--frame);height:15px;line-height:14px}")

# =====================================================================
# 4. THE TABLE — a whole number of rows, so none is cut in half.
# =====================================================================
edit('deck half height',
     r"#deck\.half\{flex-basis:260px\}",
     "#deck.half{flex-basis:280px}        /* 30 head + 25 header + 9 rows */")

edit('deck half height narrow',
     r"  #deck\.half\{flex-basis:200px\}",
     "  #deck.half{flex-basis:205px}")

edit('deck size button',
     r"\.deck-head \.actions button\{background:none;border:0;color:var\(--sub\);cursor:pointer;padding:0\}",
     ".deck-head .actions button{background:none;border:0;color:var(--sub);cursor:pointer;padding:0;\n"
     "  height:24px;display:flex;align-items:center}\n"
     ".deck-head .actions #deck-size{width:24px;justify-content:center}\n"
     ".deck-head .actions #deck-size .px{fill:var(--sub);transition:transform .2s var(--ease)}\n"
     ".deck-head .actions #deck-size[aria-expanded=\"true\"] .px{transform:rotate(180deg)}\n"
     ".deck-head .actions button:hover .px{fill:#000}")

# =====================================================================
# 5. FLOWS — the fourth sheet.
# =====================================================================
edit('flow css',
     r"/\* ---------- status line ---------- \*/",
     "/* ---------- flows: the fourth sheet ---------- */\n"
     "/* Evidence is drawn, not coloured: a documented edge is a solid black\n"
     "   line, a structural one is dotted, a modelled one a faint dash. A\n"
     "   modelled arc must never be able to pass for a receipt. */\n"
     "#tab-flow{--tabc:#111}\n"
     ".ev{display:inline-block;width:22px;height:0;vertical-align:middle;margin-right:7px;\n"
     "    border-top:1.5px solid #111}\n"
     ".ev.structural{border-top-style:dotted}\n"
     ".ev.modelled{border-top:1px dashed var(--sub)}\n"
     ".chip .ev{width:16px;margin-right:0}\n"
     "#site-table td.ev-cell .ev{margin-right:6px}\n"
     ".deck-empty{padding:12px var(--gut);color:var(--sub);max-width:74ch;line-height:1.55}\n"
     ".deck-empty b{font-weight:500;color:#000;display:block;margin-bottom:3px}\n\n"
     "/* ---------- status line ---------- */")

# ------------------------------------------------------------- markup
edit('flow tab',
     "(<span class=\"tl\" data-en=\"TERRAIN CHANGE\" data-no=\"TERRENG\">TERRAIN CHANGE</span>"
     "<span class=\"tc\" id=\"count-runs\">1</span></button>)",
     "@@1@@\n"
     "                <button type=\"button\" class=\"tab\" id=\"tab-flow\" role=\"tab\" aria-selected=\"false\" "
     "data-tab=\"flow\" aria-controls=\"tb-flow\">\n"
     "                    <span class=\"tl\" data-en=\"FLOWS\" data-no=\"STRØMMER\">FLOWS</span>"
     "<span class=\"tc\" id=\"count-flows\">–</span></button>")

edit('deck size glyph',
     r"title=\"Half screen, whole page, closed\" aria-label=\"Table size\">▲</button>",
     "title=\"Half screen, whole page, closed\" aria-label=\"Table size\">"
     "<svg class=\"px\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" aria-hidden=\"true\">"
     "<path d=\"M7 4h2v1h-2zM5 5h2v1h-2zM9 5h2v1h-2zM3 6h2v1h-2zM11 6h2v1h-2zM1 7h2v1h-2zM13 7h2v1h-2z\"/>"
     "</svg></button>")

edit('flow drawer panel',
     r"(<span>\+12\.1 m</span></div>\n"
     r"                      </div>\n"
     r"                  </div>\n)",
     "@@1@@\n"
     "                  <div class=\"tab-body\" id=\"tb-flow\" role=\"tabpanel\" hidden>\n"
     "                      <label class=\"row\" for=\"filter-flows\">\n"
     "                          <span class=\"nm\"><b data-en=\"Mass flows on the map\" "
     "data-no=\"Massestrømmer på kartet\">Mass flows on the map</b>\n"
     "                              <span class=\"src\" data-en=\"construction project → reception site\" "
     "data-no=\"byggeprosjekt → mottaksanlegg\">construction project → reception site</span></span>\n"
     "                          <span class=\"ct\" id=\"count-flow-drawn\">–</span>\n"
     "                          <input type=\"checkbox\" id=\"filter-flows\" checked></label>\n"
     "                      <div class=\"note\" data-en=\"An arc bows to the right of its direction of travel, "
     "so a pair of sites that trade both ways draws two lines rather than one.\" "
     "data-no=\"En bue krummer til høyre for reiseretningen, så to steder som utveksler begge veier tegner "
     "to linjer, ikke én.\">An arc bows to the right of its direction of travel, so a pair of sites that "
     "trade both ways draws two lines rather than one.</div>\n"
     "                      <div class=\"note\" data-en=\"A destination is on record only where a pollution "
     "permit was needed, so the documented set leans toward large infrastructure and contaminated mass. "
     "Everything else is modelled.\" data-no=\"En destinasjon er dokumentert bare der det trengtes "
     "utslippstillatelse, så det dokumenterte settet heller mot store infrastrukturprosjekter og forurensede "
     "masser. Resten er modellert.\">A destination is on record only where a pollution permit was needed, so "
     "the documented set leans toward large infrastructure and contaminated mass. Everything else is "
     "modelled.</div>\n"
     "                  </div>\n")

edit('flow key markup',
     "(<div class=\"key-sep\"></div>\n"
     "                        <div class=\"kr\"><span class=\"swatch\" "
     "style=\"background:#fff;border:1px dotted #555\"></span>)",
     "<div class=\"key-sep\"></div>\n"
     "                        <div class=\"kr\"><span class=\"ev\"></span>"
     "<span data-en=\"Flow, documented\" data-no=\"Strøm, dokumentert\">Flow, documented</span>"
     "<span class=\"ct\" data-flow-ct=\"evidenced\"></span></div>\n"
     "                        <div class=\"kr\"><span class=\"ev structural\"></span>"
     "<span data-en=\"Flow, shared ownership\" data-no=\"Strøm, felles eierskap\">Flow, shared ownership</span>"
     "<span class=\"ct\" data-flow-ct=\"structural\"></span></div>\n"
     "                        <div class=\"kr\"><span class=\"ev modelled\"></span>"
     "<span data-en=\"Flow, modelled\" data-no=\"Strøm, modellert\">Flow, modelled</span>"
     "<span class=\"ct\" data-flow-ct=\"modelled\"></span></div>\n"
     "                        @@1@@")

# --------------------------------------------------------------- help
edit('help tools complete',
     "(<h4 data-en=\"TOOLS\" data-no=\"VERKTØY\">TOOLS</h4>\n                    <dl>\n)",
     "@@1@@"
     "                        <dt><svg class=\"px\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" "
     "aria-hidden=\"true\"><path d=\"M1 3h14v1h-14zM1 4h14v1h-14zM1 7h14v1h-14zM1 8h14v1h-14zM1 11h14v1h-14z"
     "M1 12h14v1h-14z\"/></svg></dt><dd data-en=\"layers, and what is on the map\" "
     "data-no=\"lag, og hva som er på kartet\">layers, and what is on the map</dd>\n"
     "                        <dt><svg class=\"px\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" "
     "aria-hidden=\"true\"><path d=\"M4 1h5v1h-5zM3 2h1v1h-1zM9 2h1v1h-1zM2 3h1v1h-1zM10 3h1v1h-1z"
     "M2 4h1v1h-1zM10 4h1v1h-1zM2 5h1v1h-1zM10 5h1v1h-1zM2 6h1v1h-1zM10 6h1v1h-1zM3 7h1v1h-1z"
     "M9 7h1v1h-1zM4 8h5v1h-5zM10 8h1v1h-1zM11 9h1v1h-1zM12 10h1v1h-1zM13 11h1v1h-1zM14 12h1v1h-1z\"/>"
     "</svg></dt><dd data-en=\"search a site, an operator, a place or coordinates\" "
     "data-no=\"søk sted, operatør, stedsnavn eller koordinater\">search a site, an operator, a place or "
     "coordinates</dd>\n")

edit('help esc wording',
     r"<dt>Esc</dt><dd data-en=\"close what is open\" data-no=\"lukk det som er åpent\">close what is open</dd>",
     "<dt>Esc</dt><dd data-en=\"close the top thing that is open, one press at a time\" "
     "data-no=\"lukk det øverste som er åpent, ett trykk om gangen\">"
     "close the top thing that is open, one press at a time</dd>")

edit('help compass row',
     r"<dt>N</dt><dd data-en=\"click the compass: north up\. Double-click: look straight down\"",
     "<dt><svg class=\"px\" width=\"16\" height=\"16\" viewBox=\"0 0 16 16\" aria-hidden=\"true\">"
     "<path d=\"M7 1h2v1h-2zM6 2h1v1h-1zM9 2h1v1h-1zM6 3h1v1h-1zM9 3h1v1h-1zM5 4h1v1h-1zM10 4h1v1h-1z"
     "M5 5h1v1h-1zM10 5h1v1h-1zM7 6h2v1h-2zM7 7h2v1h-2zM7 8h2v1h-2zM7 9h2v1h-2zM7 10h2v1h-2zM7 11h2v1h-2z"
     "M7 12h2v1h-2zM7 13h2v1h-2z\"/></svg></dt>"
     "<dd data-en=\"click the compass: north up. Double-click: look straight down\"")

# =====================================================================
# 6. JAVASCRIPT
# =====================================================================
edit('flows csv const',
     r"(const PROJECTS_CSV = '[^']+';\n)",
     "@@1@@"
     "    // The fourth sheet. Publish the database's Flows tab to the web and\n"
     "    // paste its CSV address here: the table, the counts, the key and the\n"
     "    // arcs on the map all fill themselves. Left empty, the sheet says so.\n"
     "    // Columns read, in any order:\n"
     "    //   FlowUID  FromUID  ToUID  Volume_m3  VolumeUnit  MassType\n"
     "    //   PeriodStart  PeriodEnd  EvidenceClass  Confidence  SourceURL\n"
     "    // EvidenceClass: evidenced | structural | modelled  (default modelled)\n"
     "    // VolumeUnit:    pfm3 | pam3\n"
     "    const FLOWS_CSV = '';\n")

edit('flow show state',
     r"(    const show = \{\n"
     r"        facility: \{ on: true, cls: new Set\(CLASSES\.facility\.map\(c => c\.k\)\) \},\n"
     r"        project:  \{ on: true, cls: new Set\(CLASSES\.project\.map\(c => c\.k\)\) \},\n)",
     "@@1@@"
     "        flow:     { on: true, cls: new Set(['evidenced', 'structural', 'modelled']) },\n")

edit('flow classes',
     r"(            \{ k: 'unknown',      col: '#FFFFFF', en: 'no status',     no: 'ukjent' \}\n"
     r"        \]\n    \};\n)",
     "@@1@@"
     "    // Flows carry no colour. Evidence is a line treatment, so a modelled\n"
     "    // arc can never be mistaken for a documented one.\n"
     "    const FLOW_CLASSES = [\n"
     "        { k: 'evidenced',  en: 'documented',       no: 'dokumentert' },\n"
     "        { k: 'structural', en: 'shared ownership', no: 'felles eierskap' },\n"
     "        { k: 'modelled',   en: 'modelled',         no: 'modellert' }\n"
     "    ];\n")

edit('municipality header',
     r"th_kom: \{ en: \"KOMMUNE\", no: \"KOMMUNE\" \}",
     "th_kom: { en: \"MUNICIPALITY\", no: \"KOMMUNE\" }")

edit('i18n flows',
     r"        th_st: \{ en: \"STATUS\", no: \"STATUS\" \}\n    \};",
     "        th_st: { en: \"STATUS\", no: \"STATUS\" },\n"
     "        flows: { en: \"MASS FLOWS\", no: \"MASSESTRØMMER\" },\n"
     "        th_flow: { en: \"FLOW\", no: \"STRØM\" },\n"
     "        th_from: { en: \"FROM\", no: \"FRA\" },\n"
     "        th_to: { en: \"TO\", no: \"TIL\" },\n"
     "        th_vol: { en: \"VOLUME m³\", no: \"VOLUM m³\" },\n"
     "        th_unit: { en: \"UNIT\", no: \"ENHET\" },\n"
     "        th_period: { en: \"PERIOD\", no: \"PERIODE\" },\n"
     "        th_ev: { en: \"EVIDENCE\", no: \"GRUNNLAG\" },\n"
     "        th_conf: { en: \"CONF\", no: \"SIKKERHET\" },\n"
     "        th_src: { en: \"SOURCE\", no: \"KILDE\" },\n"
     "        ev_evidenced: { en: \"documented\", no: \"dokumentert\" },\n"
     "        ev_structural: { en: \"shared ownership\", no: \"felles eierskap\" },\n"
     "        ev_modelled: { en: \"modelled\", no: \"modellert\" },\n"
     "        flows_none_t: { en: \"No flows published yet.\",\n"
     "                        no: \"Ingen strømmer publisert ennå.\" },\n"
     "        flows_none_b: { en: \"This sheet draws the line between a construction project and the site "
     "that received its mass. It fills itself from the Flows tab of the database: publish that tab to the "
     "web and paste its CSV address into FLOWS_CSV in index.html.\",\n"
     "                        no: \"Dette arket tegner forbindelsen mellom et byggeprosjekt og stedet som "
     "tok imot massene. Det fyller seg selv fra Flows-fanen i databasen: publiser fanen til nettet og lim "
     "CSV-adressen inn i FLOWS_CSV i index.html.\" },\n"
     "        flows_empty: { en: \"No flows match what is switched on.\",\n"
     "                       no: \"Ingen strømmer passer det som er slått på.\" },\n"
     "        flows_nogeo: { en: \"both ends need coordinates before a flow can be drawn\",\n"
     "                       no: \"begge ender trenger koordinater før en strøm kan tegnes\" }\n"
     "    };")

edit('flow cols',
     r"(          sort: s => \['active', 'future', 'contaminated', 'old', 'unknown'\]\.indexOf\(s\.__cls\) \}\n    \];\n)",
     "@@1@@"
     "\n"
     "    // A flow is an edge, not a place, so the FLOWS sheet gets its own\n"
     "    // columns rather than empty cells in the site table.\n"
     "    const FLOW_COLS = [\n"
     "        { key:'FlowUID',     th:'th_flow',   w:'104px', cls:'uid c-uid', get: f => f.FlowUID || '' },\n"
     "        { key:'__from',      th:'th_from',   w:'',      get: f => f.__fromName },\n"
     "        { key:'__to',        th:'th_to',     w:'',      get: f => f.__toName },\n"
     "        { key:'MassType',    th:'th_mat',    w:'150px', cls:'c-mat', get: f => f.MassType || '' },\n"
     "        { key:'Volume_m3',   th:'th_vol',    w:'112px', num:true, cls:'c-cap', get: f => fmt(qty(f.Volume_m3)) },\n"
     "        { key:'VolumeUnit',  th:'th_unit',   w:'64px',  cls:'c-area', get: f => f.VolumeUnit || '' },\n"
     "        { key:'__period',    th:'th_period', w:'104px', cls:'c-kom',\n"
     "          get: f => [f.PeriodStart, f.PeriodEnd].filter(Boolean).join('\\u2013'),\n"
     "          sort: f => String(f.PeriodStart || '') },\n"
     "        { key:'__ev',        th:'th_ev',     w:'150px', cls:'ev-cell',\n"
     "          get: f => t('ev_' + f.__ev),\n"
     "          sort: f => ['evidenced', 'structural', 'modelled'].indexOf(f.__ev) },\n"
     "        { key:'Confidence',  th:'th_conf',   w:'72px',  num:true, cls:'c-plan', get: f => f.Confidence || '' },\n"
     "        { key:'SourceURL',   th:'th_src',    w:'150px', cls:'c-op', get: f => f.SourceURL || '' }\n"
     "    ];\n"
     "    const activeCols = () => deckScope === 'flow' ? FLOW_COLS : COLS;\n")

edit('deckRows flow branch',
     r"    function deckRows\(\)\{\n        const rows = allSites\.filter\(s =>",
     "    function deckRows(){\n"
     "        if (deckScope === 'flow') return flowRows();\n"
     "        const rows = allSites.filter(s =>")

edit('renderDeckHead cols',
     r"        const proj = deckScope === 'project';\n        COLS\.forEach\(c => \{",
     "        const proj = deckScope === 'project';\n        activeCols().forEach(c => {")

edit('renderDeck flow branch',
     r"    function renderDeck\(\)\{\n        renderDeckHead\(\);\n        const rows = deckRows\(\);",
     "    function renderDeck(){\n"
     "        if (deckScope === 'flow') { renderFlowDeck(); return; }\n"
     "        clearDeckEmpty();\n"
     "        renderDeckHead();\n"
     "        const rows = deckRows();")

edit('deck title key',
     r"        const key = deckSelection \? 'selection' : deckScope === 'project' \? 'projects' : "
     r"deckScope === 'all' \? 'selection' : 'recep';",
     "        const key = deckSelection ? 'selection' : deckScope === 'project' ? 'projects' :\n"
     "                    deckScope === 'flow' ? 'flows' : deckScope === 'all' ? 'selection' : 'recep';")

edit('csv export cols',
     r"        const head = COLS\.map\(c => t2\(c\.th, 'en'\)\)\.join\(','\);\n"
     r"        const body = rows\.map\(s => COLS\.map\(c => \{",
     "        const cols = activeCols();\n"
     "        const head = cols.map(c => t2(c.th, 'en')).join(',');\n"
     "        const body = rows.map(s => cols.map(c => {")

edit('selectTab flow',
     r"        \['facility', 'project', 'dod'\]\.forEach\(k => \{\n"
     r"            \$\('tb-' \+ k\)\.hidden = tab === 'all' \? k === 'dod' : k !== tab;\n"
     r"        \}\);",
     "        ['facility', 'project', 'dod', 'flow'].forEach(k => {\n"
     "            $('tb-' + k).hidden = tab === 'all' ? (k === 'dod' || k === 'flow') : k !== tab;\n"
     "        });")

edit('updateCounts flow',
     r"        \$\('count-runs'\)\.textContent = DOD_RUNS\.length;",
     "        $('count-runs').textContent = DOD_RUNS.length;\n"
     "        if (typeof updateFlowCounts === 'function') updateFlowCounts();")

edit('renderChips flow',
     r"    function renderChips\(\) \{\n        const box = \$\('deck-chips'\);\n        box\.innerHTML = '';",
     "    function renderChips() {\n"
     "        const box = $('deck-chips');\n"
     "        box.innerHTML = '';\n"
     "        if (deckScope === 'flow' && !deckSelection) { renderFlowChips(box); return; }")

edit('hide hover on open',
     r"    window\.openSidebar = function\(site, keepMedia\) \{\n        currentSite = site;",
     "    window.openSidebar = function(site, keepMedia) {\n"
     "        // Two pictures of the same place, one on top of the other, is the\n"
     "        // commonest way this window gets read wrong.\n"
     "        if (typeof hideHover === 'function') hideHover();\n"
     "        currentSite = site;")

edit('hover clear of record',
     r"        const deck = \$\('deck'\)\.getBoundingClientRect\(\);\n"
     r"        if \(py >= deck\.top - 1 && deck\.top > h \+ pad\) top = deck\.top - h - 8;",
     "        const deck = $('deck').getBoundingClientRect();\n"
     "        if (py >= deck.top - 1 && deck.top > h + pad) top = deck.top - h - 8;\n"
     "        // The record window owns its band of the screen; the card gives way.\n"
     "        const sbEl = $('sidebar');\n"
     "        if (sbEl && sbEl.classList.contains('active')) {\n"
     "            const sb = sbEl.getBoundingClientRect();\n"
     "            if (left + w > sb.left - 8 && top < sb.bottom && top + h > sb.top)\n"
     "                left = Math.max(pad, sb.left - w - 8);\n"
     "        }")

edit('frameSite ifneeded',
     r"    function frameSite\(site\) \{\n"
     r"        const b = siteBox\(site\);\n"
     r"        if \(!b\) \{ updateStatus\(t\('nocoords'\)\); return; \}",
     "    // mode 'auto' moves the camera only when the site is off screen or too\n"
     "    // small to read, so clicking a marker you are already looking at does\n"
     "    // not throw the view away — and clicking a six-pixel dot at national\n"
     "    // zoom does take you to it.\n"
     "    function frameSite(site, mode) {\n"
     "        const b = siteBox(site);\n"
     "        if (!b) { updateStatus(t('nocoords')); return; }\n"
     "        if (mode === 'auto' && !worthFraming(b)) return;")

edit('worthFraming',
     r"    // kept under its old name for anything that still calls it\n"
     r"    function smartZoom\(lat, lon, area, uid\) \{",
     "    function worthFraming(b) {\n"
     "        const c = map.getContainer();\n"
     "        const p = visiblePadding();\n"
     "        const sw = map.project([b[0], b[1]]), ne = map.project([b[2], b[3]]);\n"
     "        const x0 = Math.min(sw.x, ne.x), x1 = Math.max(sw.x, ne.x);\n"
     "        const y0 = Math.min(sw.y, ne.y), y1 = Math.max(sw.y, ne.y);\n"
     "        if (x0 < p.left || x1 > c.clientWidth - p.right) return true;    // off screen\n"
     "        if (y0 < p.top  || y1 > c.clientHeight - p.bottom) return true;\n"
     "        return Math.max(x1 - x0, y1 - y0) < 90;                          // too small to read\n"
     "    }\n"
     "    // kept under its old name for anything that still calls it\n"
     "    function smartZoom(lat, lon, area, uid) {")

edit('openSite auto',
     r"        openSidebar\(site\);\n"
     r"        if \(frame !== false\) frameSite\(site\);\n"
     r"        else if \(!hasXY\(site\)\) updateStatus\(t\('nocoords'\)\);",
     "        openSidebar(site);\n"
     "        if (frame === 'auto') frameSite(site, 'auto');\n"
     "        else if (frame !== false) frameSite(site);\n"
     "        if (!hasXY(site)) updateStatus(t('nocoords'));")

edit('marker click frames when needed',
     r"            if \(!site\) \{ updateStatus\(t\('notfound'\)\); return; \}\n"
     r"            openSite\(site, false\);",
     "            if (!site) { updateStatus(t('notfound')); return; }\n"
     "            openSite(site, 'auto');")

edit('opening view',
     r"        else if \(!viewed\) \{\n"
     r"            const b = new maplibregl\.LngLatBounds\(\);\n"
     r"            allSites\.filter\(hasXY\)\.forEach\(s => b\.extend\(\[num\(s\.Longitude\), num\(s\.Latitude\)\]\)\);\n"
     r"            if \(!b\.isEmpty\(\)\) map\.fitBounds\(b, \{ padding: visiblePadding\(\), maxZoom: 10, duration: 0 \}\);\n"
     r"        \}",
     "        else if (!viewed) fitAll(0);\n"
     "        // Embedded in a frame, the map is laid out before the frame has its\n"
     "        // final size, and a fit computed against a box of the wrong size\n"
     "        // opens on the whole world. Watch the container instead, and while\n"
     "        // nobody has touched the map, fit it again each time the box moves.\n"
     "        if (!viewed && !h.site && window.ResizeObserver) {\n"
     "            let touched = false;\n"
     "            const stop = () => { touched = true; };\n"
     "            ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach(ev => map.once(ev, stop));\n"
     "            const ro = new ResizeObserver(() => { map.resize(); if (!touched) fitAll(0); });\n"
     "            ro.observe(map.getContainer());\n"
     "            setTimeout(() => ro.disconnect(), 10000);\n"
     "        }")

edit('fitAll',
     r"    function openFromHash\(id, keepView\) \{",
     "    // One place that knows how the map opens: every located record, with\n"
     "    // room left for the chrome, and never so far out that the region\n"
     "    // stops being the subject.\n"
     "    function fitAll(duration) {\n"
     "        const b = new maplibregl.LngLatBounds();\n"
     "        allSites.filter(hasXY).forEach(s => b.extend([num(s.Longitude), num(s.Latitude)]));\n"
     "        if (b.isEmpty()) return;\n"
     "        map.fitBounds(b, { padding: visiblePadding(), maxZoom: 10, duration: duration || 0 });\n"
     "        if (map.getZoom() < 5.5) map.setZoom(5.5);\n"
     "    }\n"
     "    window.__fitAll = fitAll;\n"
     "\n"
     "    function openFromHash(id, keepView) {")

edit('3d zoom guard',
     r"            map\.easeTo\(\{ pitch: 62, bearing: map\.getBearing\(\) \|\| -18, duration: dur\(1000\), essential: true \}\);",
     "            // Tilting a whole country shows a flat slab under a white sky.\n"
     "            map.easeTo({ pitch: 62, zoom: Math.max(map.getZoom(), 11.5),\n"
     "                         bearing: map.getBearing() || -18, duration: dur(1000), essential: true });")

edit('scale into status line',
     r"    try \{\n        const savedLang = localStorage\.getItem\('db_lang'\);",
     "    // The corner keeps one width. A scale bar that changes length as you\n"
     "    // zoom belongs on a line that is already horizontal.\n"
     "    (function moveScale() {\n"
     "        const sc = document.querySelector('.maplibregl-ctrl-scale');\n"
     "        const strip = document.querySelector('.status-strip');\n"
     "        const crs = $('btn-crs');\n"
     "        if (sc && strip && crs) strip.insertBefore(sc, crs);\n"
     "    })();\n"
     "\n"
     "    try {\n        const savedLang = localStorage.getItem('db_lang');")

edit('flow key in renderKey',
     r"        box\.innerHTML = h;\n    \}\n\n    // ── panel folding and dragging ──",
     "        box.innerHTML = h;\n"
     "        if (typeof updateFlowCounts === 'function') updateFlowCounts();\n"
     "    }\n\n    // ── panel folding and dragging ──")

edit('flows load call',
     r"        whenStyleReady\(\(\) => \{ ensureSiteLayers\(\); refreshSiteData\(\); \}\);\n        updateStatus\(\);",
     "        whenStyleReady(() => { ensureSiteLayers(); refreshSiteData(); });\n"
     "        loadFlows();\n"
     "        updateStatus();")

# --------------------------------------------------------- the engine
FLOWS_JS = r"""    // ─────────────────────────────────────────────────────────────────────
    // FLOWS. An edge from a construction project to the site that received
    // its mass. Three classes of evidence, drawn apart: documented, shared
    // ownership, modelled. Nothing here carries colour — evidence is a line
    // treatment, so a modelled arc cannot pass for a receipt.
    // ─────────────────────────────────────────────────────────────────────
    let allFlows = [];
    let flowsReady = false;
    let hotFlowId = null;
    let flowSort = { key: 'Volume_m3', dir: -1 };
    const FLOW_LAYERS = ['flow-modelled', 'flow-structural', 'flow-evidenced'];
    const EV_KEYS = ['evidenced', 'structural', 'modelled'];
    const evOf = f => {
        const v = String(f.EvidenceClass || '').trim().toLowerCase();
        return EV_KEYS.indexOf(v) >= 0 ? v : 'modelled';
    };

    function tagFlows(rows) {
        const byUid = new Map(allSites.map(s => [uidOf(s), s]));
        return rows.filter(r => r.FlowUID || r.FromUID || r.ToUID).map((r, i) => {
            const from = byUid.get(String(r.FromUID || '').trim());
            const to   = byUid.get(String(r.ToUID   || '').trim());
            r.__cat = 'flow';
            r.__ev = evOf(r);
            r.__from = from || null;
            r.__to = to || null;
            r.__fromName = (from && from.Name) || r.FromName || r.FromUID || '';
            r.__toName   = (to && to.Name)     || r.ToName   || r.ToUID   || '';
            r.__xy = !!(from && to && hasXY(from) && hasXY(to));
            if (!r.FlowUID) r.FlowUID = 'F' + String(i + 1).padStart(4, '0');
            return r;
        });
    }

    const flowPasses = f => show.flow.on && show.flow.cls.has(f.__ev);

    function flowRows() {
        const col = FLOW_COLS.find(c => c.key === flowSort.key);
        const d = flowSort.dir;
        return allFlows.filter(flowPasses).sort((a, b) => {
            if (col && col.num) {
                const av = qty(a[flowSort.key]), bv = qty(b[flowSort.key]);
                const an = Number.isFinite(av), bn = Number.isFinite(bv);
                if (!an && !bn) return 0;
                if (!an) return 1;
                if (!bn) return -1;
                return (av - bv) * d;
            }
            if (col && col.sort) {
                const av = col.sort(a), bv = col.sort(b);
                return (av < bv ? -1 : av > bv ? 1 : 0) * d;
            }
            if (!col) return 0;
            return String(col.get(a) || '').localeCompare(String(col.get(b) || ''), 'nb') * d;
        });
    }

    function clearDeckEmpty() {
        const wrap = document.querySelector('#deck .deck-scroll');
        if (!wrap) return;
        const e = wrap.querySelector('.deck-empty');
        if (e) e.remove();
        $('site-table').hidden = false;
    }

    function sayInDeck(title, body) {
        const wrap = document.querySelector('#deck .deck-scroll');
        const d = document.createElement('div');
        d.className = 'deck-empty';
        d.innerHTML = '<b>' + esc(title) + '</b>' + esc(body);
        wrap.appendChild(d);
    }

    function renderFlowDeck() {
        clearDeckEmpty();
        deckHeadRow.innerHTML = '';
        deckBody.innerHTML = '';
        const table = $('site-table');
        const oldCg = table.querySelector('colgroup');
        if (oldCg) oldCg.remove();

        const title = $('deck-title');
        title.setAttribute('data-en', t2('flows', 'en'));
        title.setAttribute('data-no', t2('flows', 'no'));
        title.textContent = t('flows');

        if (!allFlows.length) {
            table.hidden = true;
            sayInDeck(t('flows_none_t'), t('flows_none_b'));
            deckCount.textContent = '0 ' + t('records');
            renderChips();
            return;
        }

        const cg = document.createElement('colgroup');
        FLOW_COLS.forEach(c => {
            const col = document.createElement('col');
            if (c.w) col.style.width = c.w;
            const cc = c.cls ? c.cls.split(' ').filter(x => x.startsWith('c-')).join(' ') : '';
            if (cc) col.className = cc;
            cg.appendChild(col);
            const th = document.createElement('th');
            th.textContent = t(c.th);
            th.className = [c.num ? 'num' : '', cc].join(' ').trim();
            if (flowSort.key === c.key) th.textContent += flowSort.dir < 0 ? ' \u2193' : ' \u2191';
            th.setAttribute('aria-sort', flowSort.key === c.key
                ? (flowSort.dir < 0 ? 'descending' : 'ascending') : 'none');
            th.onclick = () => {
                flowSort = flowSort.key === c.key
                    ? { key: c.key, dir: -flowSort.dir }
                    : { key: c.key, dir: c.num ? -1 : 1 };
                renderFlowDeck();
            };
            deckHeadRow.appendChild(th);
        });
        table.insertBefore(cg, table.firstChild);

        const rows = flowRows();
        const frag = document.createDocumentFragment();
        rows.forEach(f => {
            const tr = document.createElement('tr');
            tr.dataset.flow = f.FlowUID;
            if (!f.__xy) tr.classList.add('nogeo');
            FLOW_COLS.forEach(c => {
                const td = document.createElement('td');
                const v = c.get(f);
                if (c.key === '__ev') {
                    td.innerHTML = '<span class="ev ' + f.__ev + '"></span>' + esc(v);
                } else if (c.key === 'SourceURL' && safeUrl(v)) {
                    td.innerHTML = '<a href="' + esc(safeUrl(v)) + '" target="_blank" rel="noopener">'
                                 + esc(String(v).replace(/^https?:\/\//, '')) + '</a>';
                } else {
                    td.textContent = v;
                }
                td.title = String(v == null ? '' : v);
                td.className = [c.num ? 'num' : '', c.cls || ''].join(' ').trim();
                tr.appendChild(td);
            });
            tr.onclick = () => frameFlow(f, true);
            tr.onmouseenter = () => hotFlow(f.FlowUID);
            tr.onmouseleave = () => hotFlow(null);
            frag.appendChild(tr);
        });
        deckBody.appendChild(frag);
        if (!rows.length) sayInDeck(t('flows_empty'), '');
        deckCount.textContent = rows.length + ' ' + t('records');
        renderChips();
    }

    function renderFlowChips(box) {
        FLOW_CLASSES.forEach(ci => {
            const n = allFlows.filter(f => f.__ev === ci.k).length;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'chip';
            const on = show.flow.on && show.flow.cls.has(ci.k);
            b.setAttribute('aria-pressed', String(on));
            b.title = ci[currentLang];
            b.innerHTML = '<span class="ev ' + ci.k + '"></span>' + esc(ci[currentLang])
                        + ' <span class="ct">' + n + '</span>';
            b.onclick = e => {
                e.stopPropagation();
                const set = show.flow.cls;
                if (e.altKey) { set.clear(); set.add(ci.k); }
                else if (set.has(ci.k)) set.delete(ci.k); else set.add(ci.k);
                if (!show.flow.on) { show.flow.on = true; $('filter-flows').checked = true; }
                applyFlowFilter();
                renderFlowDeck();
            };
            box.appendChild(b);
        });
    }

    // A bowed line, always to the right of the direction of travel, so two
    // places that trade both ways draw two arcs rather than one line.
    function arc(a, b) {
        const N = 36, BOW = 0.13, pts = [];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const cx = (a[0] + b[0]) / 2 + dy * BOW;
        const cy = (a[1] + b[1]) / 2 - dx * BOW;
        for (let i = 0; i <= N; i++) {
            const s = i / N, u = 1 - s;
            pts.push([u * u * a[0] + 2 * u * s * cx + s * s * b[0],
                      u * u * a[1] + 2 * u * s * cy + s * s * b[1]]);
        }
        return pts;
    }

    function flowFeatures() {
        const drawn = allFlows.filter(f => f.__xy);
        const vols = drawn.map(f => qty(f.Volume_m3)).filter(v => Number.isFinite(v) && v > 0);
        const max = vols.length ? Math.max.apply(null, vols) : 0;
        return { type: 'FeatureCollection', features: drawn.map(f => {
            const v = qty(f.Volume_m3);
            const w = (max > 0 && Number.isFinite(v) && v > 0) ? Math.sqrt(v / max) : 0.22;
            return {
                type: 'Feature',
                id: f.FlowUID,
                geometry: { type: 'LineString', coordinates: arc(
                    [num(f.__from.Longitude), num(f.__from.Latitude)],
                    [num(f.__to.Longitude),   num(f.__to.Latitude)]) },
                properties: { fid: f.FlowUID, ev: f.__ev, w: w,
                              lbl: f.__fromName + ' \u2192 ' + f.__toName }
            };
        }) };
    }

    function ensureFlowLayers() {
        if (!map.getSource('flows')) {
            map.addSource('flows', { type: 'geojson', data: flowFeatures(), promoteId: 'fid' });
        } else {
            map.getSource('flows').setData(flowFeatures());
        }
        const before = under(['site-hot', 'site-sym', 'prof-line']);
        const HOT = ['boolean', ['feature-state', 'hot'], false];
        const W = base => ['*', ['case', HOT, 2.2, 1],
                           ['+', base, ['*', ['get', 'w'], 2.6]]];
        const SPEC = {
            'flow-modelled':   { ev: 'modelled',   col: '#7d7d7d', dash: [3.5, 3],  base: 0.5, op: 0.55 },
            'flow-structural': { ev: 'structural', col: '#111111', dash: [1, 2.2],  base: 0.6, op: 0.80 },
            'flow-evidenced':  { ev: 'evidenced',  col: '#111111', dash: null,      base: 0.7, op: 0.95 }
        };
        FLOW_LAYERS.forEach(id => {
            if (map.getLayer(id)) return;
            const s = SPEC[id];
            const paint = { 'line-color': s.col, 'line-width': W(s.base),
                            'line-opacity': ['case', HOT, 1, s.op] };
            if (s.dash) paint['line-dasharray'] = s.dash;
            map.addLayer({ id: id, type: 'line', source: 'flows',
                filter: ['==', ['get', 'ev'], s.ev],
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: paint }, before);
            map.on('mousemove', id, e => {
                if (toolBusy() || !e.features || !e.features.length) return;
                map.getCanvas().style.cursor = 'pointer';
                hotFlow(e.features[0].properties.fid);
                updateStatus(e.features[0].properties.lbl);
            });
            map.on('mouseleave', id, () => {
                if (!toolBusy()) map.getCanvas().style.cursor = '';
                hotFlow(null);
            });
            map.on('click', id, e => {
                if (toolBusy() || !e.features || !e.features.length) return;
                const f = allFlows.find(x => x.FlowUID === e.features[0].properties.fid);
                if (!f) return;
                if (deckScope !== 'flow') selectTab('flow');
                if (deckSize === 'closed') setDeckSize('half');
                frameFlow(f);
            });
        });
        flowsReady = true;
        applyFlowFilter();
    }

    function hotFlow(id) {
        if (id === hotFlowId) return;
        if (flowsReady && map.getSource('flows')) {
            if (hotFlowId) map.setFeatureState({ source: 'flows', id: hotFlowId }, { hot: false });
            if (id)        map.setFeatureState({ source: 'flows', id: id },        { hot: true });
        }
        if (deckScope === 'flow') {
            deckBody.querySelectorAll('tr.hot').forEach(r => r.classList.remove('hot'));
            if (id) {
                const r = deckBody.querySelector('tr[data-flow="' + CSS.escape(id) + '"]');
                if (r) r.classList.add('hot');
            }
        }
        hotFlowId = id;
    }

    function frameFlow(f, fromRow) {
        hotFlow(f.FlowUID);
        if (!f.__xy) { updateStatus(t('flows_nogeo')); return; }
        const b = new maplibregl.LngLatBounds();
        b.extend([num(f.__from.Longitude), num(f.__from.Latitude)]);
        b.extend([num(f.__to.Longitude),   num(f.__to.Latitude)]);
        map.fitBounds(b, { padding: visiblePadding(), maxZoom: 13,
                           duration: dur(900), essential: true });
        if (!fromRow) {
            const r = deckBody.querySelector('tr[data-flow="' + CSS.escape(f.FlowUID) + '"]');
            if (r && deckSize !== 'closed') {
                const sc = r.closest('.deck-scroll');
                sc.scrollTo({ top: Math.max(0, r.offsetTop - sc.clientHeight / 2 + r.offsetHeight),
                              behavior: reduceMotion ? 'auto' : 'smooth' });
            }
        }
    }

    function applyFlowFilter() {
        show.flow.on = $('filter-flows').checked;
        if (flowsReady) {
            FLOW_LAYERS.forEach(id => {
                if (!map.getLayer(id)) return;
                const ev = id.replace('flow-', '');
                const on = show.flow.on && show.flow.cls.has(ev);
                map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
            });
        }
        updateFlowCounts();
    }
    $('filter-flows').addEventListener('change', () => {
        applyFlowFilter();
        if (deckScope === 'flow') renderFlowDeck();
    });

    function updateFlowCounts() {
        const drawn = allFlows.filter(f => f.__xy).length;
        $('count-flows').textContent = allFlows.length;
        $('count-flow-drawn').textContent = allFlows.length
            ? drawn + ' / ' + allFlows.length : '\u2013';
        document.querySelectorAll('[data-flow-ct]').forEach(el => {
            const n = allFlows.filter(f => f.__ev === el.dataset.flowCt).length;
            el.textContent = n || '';
        });
    }

    function loadFlows() {
        if (!FLOWS_CSV) { updateFlowCounts(); return; }
        parseCsv(FLOWS_CSV).then(r => {
            allFlows = tagFlows(r.data || []);
            updateFlowCounts();
            whenStyleReady(ensureFlowLayers);
            if (deckScope === 'flow') renderFlowDeck();
        }).catch(err => {
            console.error('Flows load failed:', err);
            updateFlowCounts();
        });
    }

"""

edit('flows engine',
     r"    document\.addEventListener\('keydown', e => \{\n        if \(e\.key === 'Escape'\) \{",
     FLOWS_JS + "    document.addEventListener('keydown', e => {\n        if (e.key === 'Escape') {")


# =====================================================================
# apply
# =====================================================================
failed = []
for name, pattern, repl, count in EDITS:
    hits = list(re.finditer(pattern, html))
    if len(hits) != count:
        failed.append('%-30s expected %d, matched %d' % (name, count, len(hits)))
        continue
    def _sub(m, r=repl):
        out = r
        for gi in range(1, (m.re.groups or 0) + 1):
            out = out.replace('@@%d@@' % gi, m.group(gi) or '')
        return out
    html = re.sub(pattern, _sub, html)

if failed:
    sys.stderr.write('PATCH ABORTED. Nothing was written.\n')
    for f in failed:
        sys.stderr.write('  ' + f + '\n')
    sys.exit(1)

stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(SRC, SRC + '.' + stamp + '.bak')
with io.open(SRC, 'w', encoding='utf-8', newline='\n') as f:
    f.write(html)

print('%d edits applied' % len(EDITS))
print('backup: index.html.%s.bak' % stamp)
