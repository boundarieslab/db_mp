"""Teach the common graph frame a second kind of link: a documented mass flow.

A link is still [child, owner]. A third element marks a flow instead:
[from, to, "flow"]. Flow links are drawn dashed, take no part in the ownership
lineage (parent and child maps, hover highlight, the climb in focusGraph), and the
record window keeps both ends of a flow that touches the graph's own site.
A "Mass flow" legend item appears only in graphs that have one.

Idempotent; a graph without flow links draws exactly as before.
Run from db_mp/network:  python ../tools/flow_links_patch.py [files...]"""
import sys, glob

MARK = '/* flow links v1 */'
REPL = [
    ('parentMap[l[0]] = l[1];',
     'if (l[2]) return;  ' + MARK + '\n            parentMap[l[0]] = l[1];'),
    ('line.setAttribute("stroke", "#dddddd"); line.setAttribute("stroke-width", "1");',
     'line.setAttribute("stroke", "#dddddd"); line.setAttribute("stroke-width", "1");\n'
     '            if (l[2]) { line.setAttribute("stroke", "#999999"); line.setAttribute("stroke-dasharray", "3 2"); }'),
    ('var up = {}; LINKS.forEach(function (l) { (up[l[0]] = up[l[0]] || []).push(l[1]); });',
     'var up = {}; LINKS.forEach(function (l) { if (!l[2]) (up[l[0]] = up[l[0]] || []).push(l[1]); });'),
    ('LINKS.forEach(function (l) { if (l[1] === act.id) keep[l[0]] = keep[l[0]] || 1; });',
     'LINKS.forEach(function (l) { if (l[1] === act.id && !l[2]) keep[l[0]] = keep[l[0]] || 1; });\n'
     '        LINKS.forEach(function (l) { if (l[2] && (l[0] === act.id || l[1] === act.id)) climb(l[0] === act.id ? l[1] : l[0], 0); });'),
    ('> Facility</div>',
     '> Facility</div>\n    <div class="legend-item" id="lg-flow" style="display:none"><svg viewBox="0 0 14 14">'
     '<line x1="1" y1="7" x2="13" y2="7" stroke="#999999" stroke-width="1.5" stroke-dasharray="3 2"/></svg> Mass flow</div>'),
    ('function start() { if (_started) return; _started = true;',
     'function start() { if (_started) return; _started = true; '
     'if (LINKS.some(function (l) { return l[2]; })) { var lf = document.getElementById("lg-flow"); if (lf) lf.style.display = ""; }'),
]

def patch(fn):
    s = open(fn, encoding='utf-8').read()
    if MARK in s: return 'already'
    for a, b in REPL:
        if s.count(a) != 1: return 'skipped (frame differs: %r)' % a[:40]
    for a, b in REPL: s = s.replace(a, b)
    open(fn, 'w', encoding='utf-8').write(s)
    return 'patched'

if __name__ == '__main__':
    files = sys.argv[1:] or sorted(glob.glob('*_network.html') + glob.glob('*-network-visualization.html') + ['feiring_eidsvoll.html'])
    from collections import Counter
    res = Counter()
    for f in files:
        r = patch(f); res[r.split(' ')[0]] += 1
        if r.startswith('skipped'): print(f, r)
    print(dict(res))
