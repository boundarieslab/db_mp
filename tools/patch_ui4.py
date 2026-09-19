#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
The whole-page table went to the top of the viewport, which is behind the
site header now that the map runs full-bleed under it. Its own head — the
sheet tabs, the colour chips and the control that shuts it again — was
under there with it, so the table could be opened and not closed.

Two fixes, and they are the same fix twice:

 1. The full table starts below the header, like everything else of ours.
 2. Esc shuts it. A thing that covers the screen must have a way out that
    does not depend on being able to see it.

    python3 tools/patch_ui4.py
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

    # The full table is positioned against the viewport, not the shell, so
    # top:0 put its head behind the site header — including the control that
    # shuts it again.
    ('full table below the header',
     r"#deck\.full\{position:absolute;left:0;right:0;top:0;bottom:24px;z-index:60;flex-basis:auto\}",
     "#deck.full{position:absolute;left:0;right:0;top:var(--frame-top);bottom:24px;z-index:60;flex-basis:auto}"),

    # Esc already walks down the things that are open. The full table belongs
    # in that walk, above the record, because it covers the record.
    ('esc shuts the full table',
     r"            if \(open\) \{ openPane\(open\); if \(open === 'light-panel' && hsOn\) "
     r"\{ setLightOn\(false\); syncToolButtons\(\); \} return; \}\n"
     r"            if \(\$\('sidebar'\)\.classList\.contains\('active'\)\) \{ closeSidebar\(\); return; \}",
     "            if (open) { openPane(open); if (open === 'light-panel' && hsOn) "
     "{ setLightOn(false); syncToolButtons(); } return; }\n"
     "            // The whole-page table covers everything, including the record\n"
     "            // under it, so it is the next thing to give way.\n"
     "            if (deckSize === 'full') { setDeckSize('half'); return; }\n"
     "            if ($('sidebar').classList.contains('active')) { closeSidebar(); return; }"),
])

patch(os.path.join(ROOT, 'tools', 'smoke_test.js'), [
    ('full table is reachable',
     r"  ok\(shut\.closed && shut\.h < 40, 'the table starts closed \(' \+ shut\.h \+ 'px\)'\);",
     "  ok(shut.closed && shut.h < 40, 'the table starts closed (' + shut.h + 'px)');\n"
     "  // Opened to the whole page it must still clear the site header, or the\n"
     "  // control that shuts it is behind one and the table is a trap.\n"
     "  const deckFull = await p.evaluate(async () => {\n"
     "    const d = document.getElementById('deck');\n"
     "    const size = document.getElementById('deck-size');\n"
     "    size.click(); await new Promise(r => setTimeout(r, 350));   // half\n"
     "    size.click(); await new Promise(r => setTimeout(r, 400));   // full\n"
     "    const ft = parseFloat(getComputedStyle(document.documentElement)\n"
     "                .getPropertyValue('--frame-top')) || 0;\n"
     "    return { isFull: d.classList.contains('full'), ft,\n"
     "             top: Math.round(d.getBoundingClientRect().top),\n"
     "             head: Math.round(document.querySelector('.deck-head').getBoundingClientRect().top),\n"
     "             btn: Math.round(size.getBoundingClientRect().top) };\n"
     "  });\n"
     "  ok(deckFull.isFull && deckFull.top >= deckFull.ft && deckFull.head >= deckFull.ft && deckFull.btn >= deckFull.ft,\n"
     "     'the whole-page table clears the header (top ' + deckFull.top + ', its button '\n"
     "     + deckFull.btn + ', header ' + deckFull.ft + 'px)');\n"
     "  const esc = await p.evaluate(async () => {\n"
     "    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));\n"
     "    await new Promise(r => setTimeout(r, 400));\n"
     "    const d = document.getElementById('deck');\n"
     "    const half = d.classList.contains('half');\n"
     "    if (half) { document.querySelector('.deck-head').click(); await new Promise(r => setTimeout(r, 350)); }\n"
     "    return half;\n"
     "  });\n"
     "  ok(esc, 'and Esc brings it back down');"),
])
