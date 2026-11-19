"""Add to a floating ownership graph: (1) in the record window, keep only what
matters for this site; (2) names that are sites on the map open them.
The map answers the graph's 'ready' with {dbLinkable: {name: UID}}. Opened
on its own (no map around it) the graph shows everything, as before."""
import sys
MARK = '/* focus+links v1 */'

def patch(s):
    if MARK in s: return s
    # 1. start only once we know whether a map is around, and what is on it
    s = s.replace("    setTimeout(init, 500);", """    """ + MARK + """
    var LINKABLE = null, _started = false;
    function focusGraph() {
        // Keep the site, everything above it, what sits on the same site, and
        // every company or site that is itself in the database, with its owners.
        var up = {}; LINKS.forEach(function (l) { (up[l[0]] = up[l[0]] || []).push(l[1]); });
        var keep = {};
        function climb(id, d) { if (keep[id] === 2 || d > 30) return; keep[id] = 2; (up[id] || []).forEach(function (p) { climb(p, d + 1); }); }
        var act = NODES.find(function (n) { return n.active; });
        if (!act) return;
        climb(act.id, 0);
        LINKS.forEach(function (l) { if (l[1] === act.id) keep[l[0]] = keep[l[0]] || 1; });
        NODES.forEach(function (n) { if (LINKABLE[n.id]) climb(n.id, 0); });
        NODES = NODES.filter(function (n) { return keep[n.id]; });
        LINKS = LINKS.filter(function (l) { return keep[l[0]] && keep[l[1]]; });
    }
    function start() { if (_started) return; _started = true; if (LINKABLE) focusGraph(); init(); markLinks(); }
    window.addEventListener("message", function (e) {
        if (e.data && e.data.dbLinkable && !_started) { LINKABLE = e.data.dbLinkable; start(); }
    });
    try { if (parent !== window) parent.postMessage({ dbGraphReady: 1 }, "*"); } catch (e) {}
    // on its own, or if the map does not answer, draw everything
    setTimeout(start, parent !== window ? 900 : 300);

    // a name that is a site on the map: underlined, and a click opens it there
    function markLinks() {
        if (!LINKABLE) return;
        nodes.forEach(function (n) {
            var uid = LINKABLE[n.id];
            if (!uid || n.active || !n.el) return;
            n.tEl.setAttribute("text-decoration", "underline");
            n.tEl.setAttribute("fill", "#000");
            n._link = uid; n.el.style.cursor = "pointer";
            var tip = n.tEl.querySelector("title"); if (tip) tip.textContent += " (open on the map)";
            n.el.addEventListener("mousedown", function (e) { n._down = [e.clientX, e.clientY]; });
            n.el.addEventListener("mouseup", function (e) {
                var d = n._down; n._down = null;
                if (d && Math.abs(e.clientX - d[0]) + Math.abs(e.clientY - d[1]) < 4)
                    try { parent.postMessage({ dbOpenSite: uid }, "*"); } catch (err) {}
            });
        });
    }""")
    # the hover reset gives labels back their grey; a link keeps its black
    s = s.replace("""                    node.tEl.setAttribute("fill", node.active ? "#000" : "#666");""",
                  """                    node.tEl.setAttribute("fill", node.active || node._link ? "#000" : "#666");""")
    # once it has come to rest, move apart any two labels that still touch
    s = s.replace("""        if (!_dragging && ((_moved < 0.05 && frame > 400) || frame >= 900)) {
""", """        if (!_dragging && ((_moved < 0.05 && frame > 400) || frame >= 900)) {
            separateLabels();
""")
    s = s.replace("""    function tick() {""", """    function separateLabels() {
        var bx = nodes.map(function (n) { try { var b = n.tEl.getBBox(); return { n: n, w: b.width, h: b.height, x0: b.x }; } catch (e) { return null; } });
        for (var it = 0; it < 300; it++) {
            var moved = 0;
            for (var i = 0; i < bx.length; i++) for (var j = i + 1; j < bx.length; j++) {
                var A = bx[i], C = bx[j]; if (!A || !C) continue;
                var ra = { l: A.n.x + Math.min(A.x0, -6), r: A.n.x + Math.max(A.x0 + A.w, 6), t: A.n.y - A.h / 2 - 2, b: A.n.y + A.h / 2 + 2 };
                var rc = { l: C.n.x + Math.min(C.x0, -6), r: C.n.x + Math.max(C.x0 + C.w, 6), t: C.n.y - C.h / 2 - 2, b: C.n.y + C.h / 2 + 2 };
                var ox = Math.min(ra.r, rc.r) - Math.max(ra.l, rc.l), oy = Math.min(ra.b, rc.b) - Math.max(ra.t, rc.t);
                if (ox <= 0 || oy <= 0) continue;
                moved++;
                var s = (A.n.y <= C.n.y ? -1 : 1) * (oy / 2 + 0.5);
                A.n.y += s; C.n.y -= s;
            }
            nodes.forEach(function (n) { n.y = Math.max(14, Math.min(H - 14, n.y)); });
            if (!moved) break;
        }
        nodes.forEach(function (n) { n.el.setAttribute("transform", "translate(" + n.x + "," + n.y + ")"); });
        links.forEach(function (l) { l.el.setAttribute("x1", l.s.x); l.el.setAttribute("y1", l.s.y); l.el.setAttribute("x2", l.t.x); l.el.setAttribute("y2", l.t.y); });
    }

    function tick() {""", 1)
    # a rebuild (window resize) re-marks the links
    # only a change of width starts the layout again; the record window
    # changing its height as it loads used to restart it before it settled
    s = s.replace("""        _rt = setTimeout(function(){ frame = 0; init(); }, 250);""",
                  """        _rt = setTimeout(function(){ if (Math.abs((el.offsetWidth || 0) - (W || 0)) < 2) return; frame = 0; init(); markLinks(); }, 250);""")
    return s

if __name__ == '__main__':
    for f in sys.argv[1:]:
        s = open(f).read(); t = patch(s)
        if t != s: open(f, 'w').write(t)
        print(f, 'patched' if t != s else 'unchanged', t.count('setTimeout(start'), t.count('markLinks(); }, 250'))
