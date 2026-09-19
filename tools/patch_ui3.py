#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
The map runs full-bleed and the site header floats on top of it.

So the map's own chrome has to clear that header: the tool bar, the record
window and the share notice all start below it, and the drawer's ceiling
comes down with them. The map itself is not inset — it still runs edge to
edge, which is the point.

One token does it, --frame-top, and it can be overridden from the embed
without a push:  index.html?top=48

    python3 tools/patch_ui3.py
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

    # ---------------------------------------------------------------- token
    ('frame-top token',
     r"  --ctl:34px;        /\* compass and zoom: one width in the corner    \*/\n",
     "  --ctl:34px;        /* compass and zoom: one width in the corner    */\n"
     "  --frame-top:35px;  /* the site header the map runs underneath.     */\n"
     "                     /* The map is full-bleed; only the chrome is    */\n"
     "                     /* inset, so nothing of ours hides behind it.   */\n"
     "                     /* Override from the embed: index.html?top=48   */\n"),

    # ------------------------------------------------------- the tool bar
    ('bar below the header',
     r"#bar\{position:absolute;left:10px;top:10px;max-height:calc\(100% - 20px\);z-index:20;",
     "#bar{position:absolute;left:10px;top:calc(var(--frame-top) + 10px);\n"
     "  max-height:calc(100% - var(--frame-top) - 20px);z-index:20;"),

    # --------------------------------------------------- the record window
    ('sidebar below the header',
     r"#sidebar\{position:absolute;right:10px;top:10px;width:400px;background:#fff;\n"
     r"  border:\.5px solid var\(--frame\);z-index:24;display:flex;flex-direction:column;\n"
     r"  max-height:calc\(100% - 20px\);",
     "#sidebar{position:absolute;right:10px;top:calc(var(--frame-top) + 10px);width:400px;background:#fff;\n"
     "  border:.5px solid var(--frame);z-index:24;display:flex;flex-direction:column;\n"
     "  max-height:calc(100% - var(--frame-top) - 20px);"),

    # ------------------------------------------------------- the share toast
    ('share notice below the header',
     r"\.share-notification\{position:absolute;left:50%;top:14px;",
     ".share-notification{position:absolute;left:50%;top:calc(var(--frame-top) + 14px);"),

    # On a phone the record is a sheet from the bottom, so it owes the header
    # nothing; it only has to stop short of the top of the screen.
    ('narrow sidebar',
     r"  #sidebar\{right:0;left:0;top:auto;bottom:0;width:auto;max-height:62%;border-width:\.5px 0 0\}",
     "  #sidebar{right:0;left:0;top:auto;bottom:0;width:auto;max-height:62%;border-width:.5px 0 0}"),

    # ------------------------------------------------------------------ JS
    ('frame-top from the url',
     r"    const dur = ms => reduceMotion \? 0 : ms;",
     "    const dur = ms => reduceMotion ? 0 : ms;\n"
     "\n"
     "    // The map is embedded under a site header whose height is not ours\n"
     "    // to know. --frame-top is what the chrome keeps clear of it, and the\n"
     "    // embed can say what it is without a rebuild: index.html?top=48\n"
     "    (function frameTop() {\n"
     "        const v = new URLSearchParams(location.search).get('top');\n"
     "        if (v !== null && /^\\d{1,3}$/.test(v))\n"
     "            document.documentElement.style.setProperty('--frame-top', v + 'px');\n"
     "    })();"),

    # The drawer's ceiling is the map minus the tool bar. The tool bar has
    # moved down, so the ceiling comes down with it.
    ('drawer ceiling',
     r"        const h = Math\.max\(120, Math\.round\(stage\.height - \(tb \? tb\.offsetHeight : 32\) - 24\)\);",
     "        const top = parseFloat(getComputedStyle(document.documentElement)\n"
     "                     .getPropertyValue('--frame-top')) || 0;\n"
     "        const h = Math.max(120, Math.round(stage.height - top - (tb ? tb.offsetHeight : 32) - 24));"),
])

patch(os.path.join(ROOT, 'tools', 'smoke_test.js'), [
    ('chrome clears the header',
     r"  ok\(mod\.tw === mod\.dw && mod\.tx === mod\.dx,\n"
     r"     'a pane is exactly as wide as the tool bar \(' \+ mod\.tw \+ ' vs ' \+ mod\.dw \+ 'px\)'\);",
     "  ok(mod.tw === mod.dw && mod.tx === mod.dx,\n"
     "     'a pane is exactly as wide as the tool bar (' + mod.tw + ' vs ' + mod.dw + 'px)');\n"
     "  // The map runs full-bleed under the site's own header, so everything\n"
     "  // of ours starts below it — and the map itself still does not.\n"
     "  const inset = await p.evaluate(() => {\n"
     "    const ft = parseFloat(getComputedStyle(document.documentElement)\n"
     "                .getPropertyValue('--frame-top')) || 0;\n"
     "    return { ft,\n"
     "             bar: Math.round(document.getElementById('bar').getBoundingClientRect().top),\n"
     "             map: Math.round(document.getElementById('map').getBoundingClientRect().top) };\n"
     "  });\n"
     "  ok(inset.ft > 0 && inset.bar >= inset.ft && inset.map === 0,\n"
     "     'the chrome clears the site header, the map does not (bar ' + inset.bar\n"
     "     + ', map ' + inset.map + ', header ' + inset.ft + 'px)');\n"
     "  const tuned = await p.evaluate(async () => {\n"
     "    document.documentElement.style.setProperty('--frame-top', '60px');\n"
     "    await new Promise(r => setTimeout(r, 120));\n"
     "    const b = Math.round(document.getElementById('bar').getBoundingClientRect().top);\n"
     "    document.documentElement.style.removeProperty('--frame-top');\n"
     "    return b;\n"
     "  });\n"
     "  ok(tuned === 70, 'and follows --frame-top when the embed changes it (' + tuned + 'px)');"),

    ('sidebar corner check',
     r"  ok\(sb\.top <= 12 && sb\.right <= 12, 'the site window sits in the top right corner \(' \+ sb\.top \+ ',' \+ sb\.right \+ '\)'\);",
     "  // Ten in from the right edge, and ten below the site header the map\n"
     "  // runs under — not ten from the top of a map that starts behind it.\n"
     "  const ftop = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement)\n"
     "                 .getPropertyValue('--frame-top')) || 0);\n"
     "  ok(sb.top >= ftop && sb.top <= ftop + 12 && sb.right <= 12,\n"
     "     'the site window sits below the header, on the right (' + sb.top + ',' + sb.right + ')');"),
])
