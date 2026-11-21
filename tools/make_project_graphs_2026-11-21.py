"""Ownership graphs for the construction-project rows SRC_VI_037-040 (added 20 Nov 2026).
Same frame and helpers as make_project_graphs.py and make_project_graphs_2026-11-20.py.
Names and status of every company node read in Brønnøysund (data.brreg.no) on 21 Nov 2026, including
the parents of Statens vegvesen (Samferdselsdepartementet) and Kystverket (Nærings- og fiskeridepartementet).
Owners from the shareholder register (Skatteetaten, 2025 data, as shown on proff.no) on the same day.
No shares are written on the drawing. A chain stops at the last company; private persons are never named
(the Rema chain stops at Reitan AS, whose three owners are holding companies of named persons).
Hidden rows are not drawn (VF_HO_005 Deponi D7 stays off SRC_VI_037 until it is released).
No flow is drawn: none of the four has a documented E1/E2a flow.
Run from db_mp/network:  python3 ../tools/make_project_graphs_2026-11-21.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_project_graphs import B, check, bane_nor, relog
import importlib; svv = importlib.import_module("make_project_graphs_2026-11-20").svv
from patch_graphs import emit

NYK, RETVET = 'Vestfoldbanen: Nykirke–Barkåker (dobbeltspor)', 'E18 Retvet–Vinterbro'
BORG, REMA = 'Innseiling Borg havn (mudring av Røsvikrenna)', 'Rema Distribunal Østlandet'
G = {}

x = B(NYK, '(Horten / Tønsberg)'); bane_nor(x, NYK); x.own(NYK, ('Bane NOR SF', 'p'))
G['src_vi_037_network.html'] = x.g()

x = B(RETVET, '(Ås / Nordre Follo)'); svv(x, RETVET); x.own(RETVET, ('Statens vegvesen',))
G['src_vi_038_network.html'] = x.g()

x = B(BORG, '(Fredrikstad)'); x.own(BORG, ('Kystverket',)); x.own('Kystverket', ('Nærings- og fiskeridepartementet', 'p'))
G['src_vi_039_network.html'] = x.g()

x = B(REMA, '(Ås)')
x.own(REMA, ('Rema Distribusjon Norge AS', 'div_ent', '(operator)'), ('Login Vinterbro AS', 'div_ent', '(holder)'))
for a, b in zip(['Rema Distribusjon Norge AS', 'Rema 1000 Norge AS', 'Rema 1000 AS', 'Reitan Retail AS'],
                ['Rema 1000 Norge AS', 'Rema 1000 AS', 'Reitan Retail AS', 'Reitan AS']):
    x.own(a, (b, 'p' if b == 'Reitan AS' else None))
x.own('Login Vinterbro AS', ('Login Parinvest AS',)); x.own('Login Parinvest AS', ('Login Parinvest Holding AS',))
x.own('Oslo Pensjonsforsikring AS', ('Oslo kommune', 'p'))
x.own('Login Parinvest Holding AS', ('Oslo Pensjonsforsikring AS',), ('Relog AS',))
relog(x)   # Relog AS -> 3Log ANS, with Åsland Næringspark and Holtskogen (NHP Eiendom AS -> Relog AS)
G['src_vi_040_network.html'] = x.g()

if __name__ == '__main__':
    os.chdir(sys.argv[1] if len(sys.argv) > 1 else '.')
    for fn, g in G.items():
        check(g); emit(fn, g)
        print(fn, len(g['nodes']), 'nodes', sum(1 for l in g['links'] if len(l) == 2), 'owner links', sum(1 for l in g['links'] if len(l) == 3), 'flows')
