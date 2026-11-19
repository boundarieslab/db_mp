"""Ownership diagrams: short names on the drawing (full name on hover) and
links to other sites in plain blue, no underline. Run after focus_patch.py."""
import sys
MARK = '/* compact v1 */'

def patch(s):
    if MARK in s: return s
    # 1. what is written next to a node: the name without its bracketed parts
    #    or the part after " - ", and a share if the note has one ("50 %").
    s = s.replace("    function init() {", """    """ + MARK + """
    function shortName(n) {
        var t = String(n.id).replace(/\\s*\\([^)]*\\)/g, "").replace(/\\s+/g, " ").trim();
        // "Øra avfallsplass - deponi" -> "Øra avfallsplass", but not when the
        // part before the dash is a company ("Sirkula IKS - Heggvin ...")
        var d = t.split(" - ");
        if (d.length > 1 && !/\\b(AS|ASA|IKS|KF|ANS)$/.test(d[0])) t = d[0];
        // a share only when the note is one: "(51 %)", "(50 %, with ...)"
        var m = (n.l || "").match(/^\\(\\s*(\\d[\\d.,]*)\\s?%/);
        if (m && !n.active) t += " " + m[1] + " %";
        return t || n.id;
    }
    function init() {""", 1)
    s = s.replace("""            var _full = n.id + (n.l ? " " + n.l : "");""",
                  """            var _full = n.id + (n.l ? " " + n.l : ""), _show = shortName(n);""")
    s = s.replace("""            _full.split(" ").forEach(function (w) {""", """            _show.split(" ").forEach(function (w) {""")
    # 2. links: blue, no underline, and they stay blue on hover
    s = s.replace("""            n.tEl.setAttribute("text-decoration", "underline");
            n.tEl.setAttribute("fill", "#000");""", """            n.tEl.setAttribute("fill", "#00f");""")
    s = s.replace("""node.tEl.setAttribute("fill", node.active || node._link ? "#000" : "#666");""",
                  """node.tEl.setAttribute("fill", node._link ? "#00f" : (node.active ? "#000" : "#666"));""")
    s = s.replace("""                        node.tEl.style.fontWeight = "bold";
                        node.tEl.setAttribute("fill", "#000");""", """                        node.tEl.style.fontWeight = "bold";
                        node.tEl.setAttribute("fill", node._link ? "#00f" : "#000");""")
    return s

if __name__ == '__main__':
    for f in sys.argv[1:]:
        s = open(f).read(); t = patch(s)
        if t != s: open(f, 'w').write(t)
        print(f, 'patched' if t != s else 'unchanged')
