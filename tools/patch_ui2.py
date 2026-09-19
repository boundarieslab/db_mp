#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Follow-up to patch_ui.py.

 1. The fourth sheet made the table's head wider than a phone, which pushed
    the size control off the right edge. The sheet strip now scrolls, the
    way the colour chips beside it already do.
 2. The project's own smoke test is brought up to date with the new tab and
    with the scale bar having moved into the status line.

    python3 tools/patch_ui2.py
"""
import io, os, re, sys, shutil, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE) if os.path.basename(HERE) == 'tools' else HERE


def patch(path, edits):
    with io.open(path, encoding='utf-8') as f:
        src = f.read()
    bad = []
    for name, pat, repl in edits:
        hits = list(re.finditer(pat, src))
        if len(hits) != 1:
            bad.append('%-34s matched %d' % (name, len(hits)))
            continue
        src = re.sub(pat, lambda m, r=repl: r, src, count=1)
    if bad:
        sys.stderr.write('ABORTED on %s. Nothing written.\n' % os.path.basename(path))
        for b in bad:
            sys.stderr.write('  ' + b + '\n')
        sys.exit(1)
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
    shutil.copy2(path, path + '.' + stamp + '.bak')
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(src)
    print('%s: %d edits' % (os.path.basename(path), len(edits)))


patch(os.path.join(ROOT, 'index.html'), [
    ('tabstrip scrolls',
     r"#tabstrip\{display:flex;align-self:stretch;flex:0 0 auto;margin:0 12px 0 0;\n"
     r"  border-right:\.5px solid var\(--frame\)\}",
     "/* The sheet strip keeps its place at the left of the head and gives way\n"
     "   sideways when there is not room for every sheet, so the size control\n"
     "   on the right stays where it is on any screen. */\n"
     "#tabstrip{display:flex;align-self:stretch;flex:0 1 auto;min-width:0;margin:0 12px 0 0;\n"
     "  overflow-x:auto;scrollbar-width:none;border-right:.5px solid var(--frame)}\n"
     "#tabstrip::-webkit-scrollbar{display:none}"),
])

patch(os.path.join(ROOT, 'tools', 'smoke_test.js'), [
    ('tabs include flow',
     r"ok\(bar0\.tabs === 'all,facility,project,dod' && bar0\.tabsOnTable,",
     "ok(bar0.tabs === 'all,facility,project,dod,flow' && bar0.tabsOnTable,"),
    ('corner holds compass and zoom',
     r"ok\(nudge\.shut\.kids >= 3, 'the compass, zoom and scale are all there \(' \+ nudge\.shut\.kids \+ '\)'\);",
     "ok(nudge.shut.kids >= 2, 'the compass and zoom are in the corner (' + nudge.shut.kids + ')');\n"
     "  // The scale bar left the corner for the status line: a bar whose length\n"
     "  // changes with the zoom cannot share an edge with anything stacked.\n"
     "  ok(await p.evaluate(() => !!document.querySelector('.status-strip .maplibregl-ctrl-scale')),\n"
     "     'the scale bar reads on the status line');"),

    ('the module is one width',
     r"  ok\(drawer\.open > 150 && drawer\.shut <= 44,\n"
     r"     'the layers button drops the drawer and puts it back \(' \+ drawer\.shut \+ ' -> ' \+ drawer\.open \+ 'px\)'\);",
     "  ok(drawer.open > 150 && drawer.shut <= 44,\n"
     "     'the layers button drops the drawer and puts it back (' + drawer.shut + ' -> ' + drawer.open + 'px)');\n"
     "  // One module: whatever drops out of the tool bar is exactly as wide as\n"
     "  // the tool bar, and starts on the same pixel.\n"
     "  const mod = await p.evaluate(async () => {\n"
     "    window.__openPane('help-panel');\n"
     "    await new Promise(r => setTimeout(r, 420));\n"
     "    const tb = document.querySelector('#bar .toolbar').getBoundingClientRect();\n"
     "    const dr = document.querySelector('#bar .drawer').getBoundingClientRect();\n"
     "    window.__closePanes();\n"
     "    await new Promise(r => setTimeout(r, 300));\n"
     "    return { tw: +tb.width.toFixed(1), dw: +dr.width.toFixed(1),\n"
     "             tx: +tb.x.toFixed(1), dx: +dr.x.toFixed(1) };\n"
     "  });\n"
     "  ok(mod.tw === mod.dw && mod.tx === mod.dx,\n"
     "     'a pane is exactly as wide as the tool bar (' + mod.tw + ' vs ' + mod.dw + 'px)');"),

    ('flows sheet',
     r"  console\.log\('phone'\);",
     "  console.log('flows');\n"
     "  const fl = await p.evaluate(async () => {\n"
     "    document.getElementById('tab-flow').click();\n"
     "    await new Promise(r => setTimeout(r, 450));\n"
     "    return { title: document.getElementById('deck-title').textContent,\n"
     "             empty: !!document.querySelector('#deck .deck-empty'),\n"
     "             chips: [...document.querySelectorAll('#deck-chips .chip .ev')].map(e => e.className).join('|'),\n"
     "             cols: [...document.querySelectorAll('#site-table thead th')].length,\n"
     "             panel: !document.getElementById('tb-flow').hidden,\n"
     "             key: document.querySelectorAll('#filter-panel [data-flow-ct]').length };\n"
     "  });\n"
     "  ok(fl.panel && /FLOWS|STR/.test(fl.title), 'the FLOWS sheet opens with its own switches (' + fl.title + ')');\n"
     "  ok(fl.empty && fl.cols === 0, 'and says where its data comes from while there is none');\n"
     "  ok(fl.chips === 'ev evidenced|ev structural|ev modelled',\n"
     "     'evidence is three line treatments, not three colours (' + fl.chips + ')');\n"
     "  ok(fl.key === 3, 'and the key carries the same three lines (' + fl.key + ')');\n"
     "  await p.evaluate(() => document.getElementById('tab-facility').click());\n"
     "  await p.waitForTimeout(300);\n\n"
     "  console.log('phone');"),
])
