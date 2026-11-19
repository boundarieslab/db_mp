"""Ownership-and-flow graphs for the construction-project rows added on 19 Nov 2026.

Same floating-network frame as every other graph (emit() from patch_graphs.py, frame
read from ak_ba_004_network.html, which must already carry flow_links_patch.py).
Owners as they stand on each project row (Brønnøysund + shareholder register 2025,
checked 19 Nov 2026); sites and projects that are in the database; and only
documented flows (data/flows.csv classes E1 and E2a: received, designated or
contracted). Considered or intended destinations (E2b) are not drawn.
A chain stops at the last company; private persons are never named.
Run from db_mp/network:  python ../tools/make_project_graphs.py"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
from patch_graphs import emit

# ------------------------------------------------------------ shared pieces
# names as in the sheet (Projects / Facilities Name), so the map can link them
FOLLO, DRK, SMS, ASL_FILL = 'Follobanen (Prosjekt)', 'Vestfoldbanen: Drammen–Kobbervikdalen', 'Østfoldbanen: Sandbukta–Moss–Såstad', 'Åsland: permanent fylling av tunnelboremasser (Follobanen)'
MOSS_NP, GILHUS_P, GARD, ASL_NP = 'Moss næringspark, Nore og Vanem felt 7–12', 'Fjordbyen Lier: utfylling av Gilhusbukta', 'Gardermoen Næringspark II B og C (Oslo Airport City)', 'Åsland Næringspark, Taraldrud'
KOPSTAD_P, VIKEN_P, LAKS, TAJE = 'Kopstad godsterminal (oppfylling)', 'Viken Park (Tofteberg)', 'Lakseberget (utfylling i Sandviksbukta)', 'Tåjeodden, Slemmestad: motfylling i sjø'
HURUM, TYTT, HOLT, FRILUFT = 'Hurum brygge: molo og utfylling i sjø', 'Tyttebærmoen miljøpark, Sokna', 'Holtskogen næringsområde, utvidelse', 'Friluftsøy i Lysakerfjorden (utfylling i sjø, Fornebu) — planarbeid avsluttet'
GILHUS_F, HOLMEN, RADE = 'Gilhusbukta - sjøutfylling', 'Drammen Havn Holmen - utfylling i sjø', 'Råde pukkverk og massedeponi'
KOPSTAD_F, VIKEN_F = 'Kopstad Massemottak AS', 'Viken Park - Tofteberg masseuttak og deponi (planned)'
FORNEBU, NVO, E18, LANGOYA = 'Fornebubanen', 'Ny vannforsyning Oslo (NVO)', 'E18 Vestkorridoren', 'Noah Solutions Langøya'

class B:
    def __init__(s, title, label, kind='construction'):
        s.title = title; s.nodes = []; s.links = []
        s.n(title, kind, label); s.nodes[0]['active'] = True
    def n(s, i, t, l=None):
        if not any(x['id'] == i for x in s.nodes):
            d = {'id': i, 'type': t}
            if l: d['l'] = l
            s.nodes.append(d)
        return s
    def own(s, child, *owners):
        """owners: (id, type, label); majority owner LAST (the lineage follows it)."""
        for o in owners:
            i, t, l = (tuple(o) + (None, None))[:3]
            s.n(i, t or 'div_ent', l)
            if [child, i] not in s.links: s.links.append([child, i])
        return s
    def flow(s, a, b):
        assert any(n['id'] == a for n in s.nodes) and any(n['id'] == b for n in s.nodes), (a, b)
        s.links.append([a, b, 'flow']); return s
    def g(s): return {'title': s.title, 'nodes': s.nodes, 'links': s.links}

def bane_nor(x, here):
    x.n('Bane NOR SF', 'p')
    for p in (FOLLO, DRK, SMS, ASL_FILL):
        if p != here: x.n(p, 'construction')
        x.own(p, ('Bane NOR SF', 'p'))
def skolt(x):
    x.n('Skolt Holding AS', 'p')
    x.own('Skolt Pukkverk AS', ('Skolt Holding AS', 'p'))
    for s_ in ('Moss Pukkverk', RADE, 'Sarpsborg pukkverk', 'Vestby pukkverk'):
        x.n(s_, 's'); x.own(s_, ('Skolt Pukkverk AS',))
    x.own('Skolt Miljøpark AS', ('Skolt Holding AS', 'p'))
    for s_ in ('Solli Miljøpark', 'Horgen miljøpark (planned)'):
        x.n(s_, 's'); x.own(s_, ('Skolt Miljøpark AS',))
def moss_np_owner(x):
    x.own(MOSS_NP, ('Skolt Næringspark Moss AS', 'div_ent', '(holder)'))
    x.own('Skolt Næringspark Moss AS', ('Skolt Holding AS', 'p'))
def drammen_havn(x):
    x.n(HOLMEN, 's')
    x.own(HOLMEN, ('Drammen Havn AS', 'div_ent', '(operator)'))
    x.own('Drammen Havn AS', ('Lier kommune', 'p', '(18 %)'), ('Asker kommune', 'p', '(18 %)'), ('Drammen kommune', 'p', '(64 %)'))
def gilhusbukta(x, with_project):
    x.n(GILHUS_F, 'receiving', '(same site)')
    x.own(GILHUS_F, ('Gilhusbukta Sjøgrunn AS', 'div_ent', '(operator)'))
    x.own('Gilhusbukta Sjøgrunn AS', ('Gilhusbukta Eiendom AS', 'div_ent', '(34 %)'), ('Eidos Eiendomsutvikling AS', 'div_ent', '(66 %)'))
    x.own('Gilhusbukta Eiendom AS', ('IAT Holding AS', 'p'), ('Skanrise AS', 'p', '(34 %)'))
    x.own('Eidos Eiendomsutvikling AS', ('Bane NOR Eiendom AS', 'p', '(22,5 %)'), ('Fabritius Gruppen AS', 'p', '(22,5 %)'), ('Lier kommune', 'p', '(55 %)'))
    if with_project:
        x.n(GILHUS_P, 'construction'); x.own(GILHUS_P, ('Gilhusbukta Sjøgrunn AS',), ('Eidos Eiendomsutvikling AS',))
def ng_m3(x):
    chain = ['Norsk Gjenvinning m3 AS', 'Mana Group AS', 'NG Nordic AS', 'Norsk Gjenvinning Norge AS', 'NG Finco AS', 'NG Holdco AS', 'NG Midco AS']
    for a, b in zip(chain, chain[1:]): x.own(a, (b,))
    x.own('NG Midco AS', ('Summa Circular Holdco AS', 'p', '(Summa Equity funds)'))
    for s_ in ('Asak Massemottak', 'Kongshavn Sør, mellomlager for masser og betong (planned)'):
        x.n(s_, 's'); x.own(s_, ('Norsk Gjenvinning m3 AS',))
def relog(x):
    x.own('NHP Eiendom AS', ('Relog AS',)); x.own('Relog AS', ('3Log ANS', 'p', '(74.9 %)'))
    x.n(ASL_NP, 'construction'); x.own(ASL_NP, ('Åsland Næringspark Eiendom AS', 'div_ent', '(holder)'))
    x.own('Åsland Næringspark Eiendom AS', ('Åsland Næringspark AS',)); x.own('Åsland Næringspark AS', ('NHP Eiendom AS',))
    x.n(HOLT, 'construction'); x.own(HOLT, ('Holtskogen Nord AS', 'div_ent', '(holder)'))
    x.own('Holtskogen Nord AS', ('Herde Eiendom AS', 'p', '(49 %)'), ('NHP Eiendom AS', 'div_ent', '(51 %)'))
def baerum(x, here):
    x.n('Bærum kommune', 'p')
    for p in (LAKS, FRILUFT):
        x.n(p, 'construction'); x.own(p, ('Bærum kommune', 'p'))
    for s_ in ('Isi avfallsanlegg - gjenvinningsstasjon', 'Isi I - deponi', 'Isi II - deponi'):
        x.n(s_, 's'); x.own(s_, ('Bærum kommune', 'p'))
def oslo_sources(x, *which):
    x.n('Oslo kommune', 'p')
    if FORNEBU in which:
        x.n(FORNEBU, 'construction'); x.own(FORNEBU, ('Akershus fylkeskommune', 'p'), ('Oslo kommune', 'p'))
    if NVO in which:
        x.n(NVO, 'construction'); x.own(NVO, ('Oslo kommune', 'p', '(Vann- og avløpsetaten)'))
    if E18 in which:
        x.n(E18, 'construction'); x.own(E18, ('Statens vegvesen', 'p'))

G = {}
def graph(fn, title, label):
    def deco(f):
        x = B(title, label); f(x); G[fn] = x.g(); return f
    return deco

@graph('src_vi_015_network.html', MOSS_NP, '(Moss)')
def _(x):
    moss_np_owner(x); skolt(x)
    x.n(SMS, 'construction'); x.own(SMS, ('Bane NOR SF', 'p'))
    x.flow(SMS, MOSS_NP); x.flow(SMS, RADE)

@graph('src_vi_016_network.html', GILHUS_P, '(Lier)')
def _(x):
    gilhusbukta(x, False)
    x.own(GILHUS_P, ('Gilhusbukta Sjøgrunn AS',), ('Eidos Eiendomsutvikling AS', 'div_ent', '(project owner)'))
    oslo_sources(x, FORNEBU, NVO, E18)
    x.n(LANGOYA, 's'); x.own(LANGOYA, ('NOAH Solutions AS', 'div_ent', '(operator)')); x.own('NOAH Solutions AS', ('NOAH AS',)); x.own('NOAH AS', ('Gjelsten Holding AS', 'p'))
    for s_ in (NVO, E18, FORNEBU, LANGOYA): x.flow(s_, GILHUS_F)
    drammen_havn(x); x.flow(GILHUS_F, HOLMEN)

@graph('src_vi_017_network.html', GARD, '(Ullensaker)')
def _(x):
    x.own(GARD, ('Oslo Airport City AS', 'div_ent', '(holder)')); x.own('Oslo Airport City AS', ('Kistefos Eiendom AS', 'p', '(30.9 %)'))

@graph('src_vi_018_network.html', ASL_NP, '(Nordre Follo)')
def _(x):
    relog(x)

@graph('src_his_006_network.html', DRK, '(Drammen)')
def _(x):
    bane_nor(x, DRK); drammen_havn(x); x.flow(DRK, HOLMEN)

@graph('src_vi_019_network.html', SMS, '(Moss)')
def _(x):
    bane_nor(x, SMS); moss_np_owner(x)
    x.n(RADE, 's'); x.own(RADE, ('Skolt Pukkverk AS', 'div_ent', '(operator)')); x.own('Skolt Pukkverk AS', ('Skolt Holding AS', 'p'))
    x.n(MOSS_NP, 'construction'); x.flow(SMS, MOSS_NP); x.flow(SMS, RADE)

@graph('src_vi_020_network.html', KOPSTAD_P, '(Horten)')
def _(x):
    x.own(KOPSTAD_P, ('Norsk Gjenvinning m3 AS', 'div_ent', '(fill)'))
    x.n(KOPSTAD_F, 'receiving', '(same site)'); x.own(KOPSTAD_F, ('Norsk Gjenvinning m3 AS',))
    ng_m3(x)

@graph('src_vi_021_network.html', VIKEN_P, '(Fredrikstad)')
def _(x):
    x.own(VIKEN_P, ('Viken Park AS', 'div_ent', '(holder)'))
    x.n(VIKEN_F, 'receiving', '(same site)'); x.own(VIKEN_F, ('Viken Park AS',))
    x.own('Viken Park AS', ('GG Næring AS',)); x.own('GG Næring AS', ('GG Gruppen AS',)); x.own('GG Gruppen AS', ('C-G Holding AS', 'p'))

@graph('src_vi_022_network.html', LAKS, '(Sandvika)')
def _(x):
    baerum(x, LAKS)

@graph('src_vi_023_network.html', TAJE, '(Asker)')
def _(x):
    x.own(TAJE, ('Asker kommune', 'p', '(holder)'))
    for s_ in ('Mortensrud avfallsdeponi', 'Nilsemarka avfallsdeponi'):
        x.n(s_, 's'); x.own(s_, ('Asker kommune', 'p'))
    x.n('Yggeset gjenvinningsstasjon', 's'); x.own('Yggeset gjenvinningsstasjon', ('Asker kommune Samfunnstjenester', 'div_ind'))
    x.own('Asker kommune Samfunnstjenester', ('Asker kommune', 'p'))
    x.n('Lindum Oredalen', 's'); x.own('Lindum Oredalen', ('Lindum Oredalen AS', 'div_ent', '(operator)'))
    drammen_havn(x)
    x.own('Lindum Oredalen AS', ('Asker kommune', 'p', '(49 %)'), ('Lindum AS', 'div_ent', '(51 %)'))
    x.own('Lindum AS', ('Drammen kommune', 'p'))

@graph('src_vi_024_network.html', HURUM, '(Hurum, Asker)')
def _(x):
    x.own(HURUM, ('Hurum Brygge AS', 'div_ent', '(holder)')); x.own('Hurum Brygge AS', ('Hurum Brygge Holding AS',))
    x.own('Hurum Brygge Holding AS', ('Anthon Eiendom AS',))
    x.own('Anthon Eiendom AS', ('Anthon B Nilsen AS', 'p', '(~40 %)'), ('Balder Fastigheter Norge AS', 'p', '(~60 %)'))

@graph('src_vi_025_network.html', TYTT, '(Ringerike)')
def _(x):
    x.own(TYTT, ('Tyttebærmoen Miljøpark AS', 'div_ent', '(holder)')); x.own('Tyttebærmoen Miljøpark AS', ('Lagmannskollen AS', 'p'))

@graph('src_vi_026_network.html', HOLT, '(Indre Østfold)')
def _(x):
    relog(x)

@graph('src_os_017_network.html', ASL_FILL, '(Oslo)')
def _(x):
    bane_nor(x, ASL_FILL); x.flow(FOLLO, ASL_FILL)

@graph('src_vi_027_network.html', FRILUFT, '(Fornebu)')
def _(x):
    baerum(x, FRILUFT)

def check(g):
    ids = [n['id'] for n in g['nodes']]; S = set(ids)
    assert len(ids) == len(S), 'dup'
    assert sum(1 for n in g['nodes'] if n.get('active')) == 1
    for l in g['links']: assert l[0] in S and l[1] in S, l
    linked = {v for l in g['links'] for v in l[:2]}
    assert all(i in linked for i in ids), [i for i in ids if i not in linked]
    par = {}
    for l in g['links']:
        if len(l) == 2: par.setdefault(l[0], []).append(l[1])
    def cyc(n, seen): return n in seen or any(cyc(p, seen | {n}) for p in par.get(n, []))
    assert not any(cyc(i, set()) for i in ids), 'cycle'

if __name__ == '__main__':
    os.chdir(sys.argv[1] if len(sys.argv) > 1 else '.')
    assert '/* flow links v1 */' in open('ak_ba_004_network.html', encoding='utf-8').read(), 'run flow_links_patch.py first'
    for fn, g in G.items():
        check(g); emit(fn, g)
        print(fn, len(g['nodes']), 'nodes', sum(1 for l in g['links'] if len(l) == 2), 'owner links', sum(1 for l in g['links'] if len(l) == 3), 'flows')
