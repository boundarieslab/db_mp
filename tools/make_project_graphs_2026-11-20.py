"""Ownership-and-flow graphs for the four construction-project rows added on 20 Nov 2026
(SRC_VI_033-036). Same frame and helpers as make_project_graphs.py.
Names, status and the parent of Statens vegvesen read in Brønnøysund (data.brreg.no) on 20 Nov 2026;
owners from the shareholder register (Skatteetaten, 31.12.2025, as shown on proff.no) on the same day.
No shares are written on the drawing. A chain stops at the last company; private persons are never named.
Only documented flows of class E1/E2a are drawn (FLW_0621); E2b (FLW_0622) is not.
Run from db_mp/network:  python3 ../tools/make_project_graphs_2026-11-20.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_project_graphs import B, check
from patch_graphs import emit

HOLM_P, HOLM_F = 'Holmenga Nord: uttak av fjell for næringsareal', 'Holmenga Nord'
DAG, BENTS, SAGG = 'E134 Dagslett–E18', 'Holmestrand næringspark (Bentsrud)', 'E134 Saggrenda–Elgsjø'
SVV_PROJECTS = ['Ring 1: Hammersborgtunnelen and Vaterlandstunnelen', 'E16 Sandvika–Wøyen (Kjørbo–Wøyen)',
                'E16 Bjørum–Skaret', DAG, SAGG]
G = {}

def svv(x, here):
    x.own('Statens vegvesen', ('Samferdselsdepartementet', 'p'))
    for p in SVV_PROJECTS:
        if p != here: x.n(p, 'construction')
        x.own(p, ('Statens vegvesen',))

x = B(HOLM_P, '(Eidsvoll)')
x.n(HOLM_F, 's')
x.own(HOLM_P, ('Anlegg Øst Entreprenør AS',)); x.own(HOLM_F, ('Anlegg Øst Entreprenør AS',))
x.own('Anlegg Øst Entreprenør AS', ('Eleda Norge AS',)); x.own('Eleda Norge AS', ('Eleda International AB', 'p'))
G['src_vi_033_network.html'] = x.g()

x = B(DAG, '(Lier / Asker)'); svv(x, DAG); G['src_vi_034_network.html'] = x.g()
x = B(SAGG, '(Kongsberg / Notodden)'); svv(x, SAGG); G['src_vi_036_network.html'] = x.g()

x = B(BENTS, '(Tønsberg / Holmestrand)')
chain = ['Kaldnes Utvikling AS', 'WA Gruppen AS', 'Kaldnes AS', 'Glastad Eiendom AS', 'Glastad AS', 'Cap Neus AS']
x.own(BENTS, (chain[0],))
for a, b in zip(chain, chain[1:]): x.own(a, (b, 'p' if b == chain[-1] else None))
x.n('Solumåsen', 's'); x.own('Solumåsen', ('Solum Pukkverk AS',))
x.own('Solum Pukkverk AS', ('NCB Holding AS', 'p'), ('Haslestad Eiendom AS', 'p'), ('PN Holding AS', 'p'))
x.flow(BENTS, 'Solumåsen')
G['src_vi_035_network.html'] = x.g()

if __name__ == '__main__':
    os.chdir(sys.argv[1] if len(sys.argv) > 1 else '.')
    for fn, g in G.items():
        check(g); emit(fn, g)
        print(fn, len(g['nodes']), 'nodes', sum(1 for l in g['links'] if len(l) == 2), 'owner links', sum(1 for l in g['links'] if len(l) == 3), 'flows')
