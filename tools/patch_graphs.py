"""Correct the ownership graphs in db_mp/network against Brønnøysund (names, status,
branch parents) and the shareholder register as shown on proff.no (2025 data),
and build graphs for the facility rows that have none. Run from db_mp/network."""
import json, re, sys, glob, os


def parse(path):
    s = open(path).read()
    m = re.search(r'var\s+NODES\s*=\s*(\[.*?\]);', s, re.S) or re.search(r'nodes:\s*(\[.*?\])\s*,\s*links', s, re.S)
    nodes = [{k: json.loads(v) for k, v in re.findall(r'(\w+)\s*:\s*("(?:[^"\\]|\\.)*"|true|false)', x)}
             for x in re.findall(r'\{[^{}]*\}', m.group(1))]
    l = re.search(r'var\s+LINKS\s*=\s*(\[.*?\]);', s, re.S)
    if l:
        links = json.loads(l.group(1))
    else:
        l = re.search(r'links:\s*(\[.*?\])\s*\}', s, re.S)
        links = [[a, b] for a, b in re.findall(r's:"(.*?)",\s*t:"(.*?)"', l.group(1))]
    title = re.search('<title>(.*?) - Ownership Network</title>', s).group(1)
    return {'title': title, 'nodes': nodes, 'links': links, 'new': bool(re.search(r'var NODES', s))}

SHELL = None   # common frame, read from ak_ba_004_network.html at run time

def js_node(n):
    parts = ['id:' + json.dumps(n['id'], ensure_ascii=False), 'type:' + json.dumps(n['type'])]
    if n.get('l'): parts.append('l:' + json.dumps(n['l'], ensure_ascii=False))
    if n.get('active'): parts.append('active:true')
    return '        {' + ', '.join(parts) + '}'

def emit(path, g):
    global SHELL
    if SHELL is None: SHELL = open('ak_ba_004_network.html').read()   # the frame shared by 87 graphs
    body = SHELL
    body = re.sub(r'<title>.*?</title>', '<title>' + g['title'] + ' - Ownership Network</title>', body, count=1)
    nodes = 'var NODES = [\n' + ',\n'.join(js_node(n) for n in g['nodes']) + '\n    ];'
    links = 'var LINKS = [\n' + ',\n'.join('        ' + json.dumps(l, ensure_ascii=False) for l in g['links']) + '\n    ];'
    body = re.sub(r'var NODES = \[.*?\];', lambda m: nodes, body, count=1, flags=re.S)
    body = re.sub(r'var LINKS = \[.*?\];', lambda m: links, body, count=1, flags=re.S)
    open(path, 'w').write(body)

# ---------------------------------------------------------------- helpers
class G:
    def __init__(self, g): self.g = g
    def has(self, i): return any(n['id'] == i for n in self.g['nodes'])
    def node(self, i): return next(n for n in self.g['nodes'] if n['id'] == i)
    def add(self, i, t, l=None):
        if not self.has(i):
            n = {'id': i, 'type': t}
            if l: n['l'] = l
            self.g['nodes'].append(n)
        return self
    def label(self, i, l):
        if self.has(i):
            n = self.node(i)
            if l: n['l'] = l
            else: n.pop('l', None)
        return self
    def type(self, i, t):
        if self.has(i): self.node(i)['type'] = t
        return self
    def rename(self, a, b, t=None, l=None):
        if not self.has(a): return self
        if self.has(b):          # merge into existing node
            self.g['nodes'] = [n for n in self.g['nodes'] if n['id'] != a]
        else:
            self.node(a)['id'] = b
        self.g['links'] = [[b if x == a else x, b if y == a else y] for x, y in self.g['links']]
        self.g['links'] = [l_ for k, l_ in enumerate(self.g['links']) if l_[0] != l_[1] and l_ not in self.g['links'][:k]]
        if t: self.type(b, t)
        if l is not None: self.label(b, l)
        return self
    def drop(self, i):
        self.g['nodes'] = [n for n in self.g['nodes'] if n['id'] != i]
        self.g['links'] = [l for l in self.g['links'] if i not in l]
        return self
    def unlink(self, a, b=None):
        self.g['links'] = [l for l in self.g['links'] if not (l[0] == a and (b is None or l[1] == b))]
        return self
    def link(self, a, b):
        if self.has(a) and self.has(b) and [a, b] not in self.g['links']:
            self.g['links'].append([a, b])
        return self
    def reparent(self, a, *parents):
        """parents: (id, type, label) tuples; the majority owner goes LAST so the
        lineage highlight (which follows the last link) runs through it."""
        if not self.has(a): return self
        self.unlink(a)
        for p in parents:
            pid, pt, pl = (p + (None, None))[:3]
            self.add(pid, pt or 'div_ent', pl)
            self.link(a, pid)
        return self
    def fix_types(self):
        """The top of every chain is the 'p' shape; anything with a parent is not."""
        recv = {n['id'] for n in self.g['nodes'] if n['type'] == 'receiving'}
        has_parent = {a for a, b in self.g['links'] if b not in recv}
        for n in self.g['nodes']:
            if n.get('l') and 'family' in n['l']:      # family names point at private persons
                n['l'] = re.sub(r',?\s*\w+ family', '', n['l']).replace('()', '').strip() or None
                if not n['l']: n.pop('l')
            if n['type'] == 'receiving': continue
            if n['id'] in has_parent and n['type'] == 'p':
                n['type'] = 'div_ent'
            if n['id'] not in has_parent and n['type'] in ('div_ent',) and any(b == n['id'] for a, b in self.g['links']):
                n['type'] = 'p'
        return self

# ---------------------------------------------------------------- chains used in many graphs
def ollendorff(x):
    x.rename('Feiring AS (Ollendorff family)', 'Feiring AS', 'div_ent')
    if x.has('Feiring AS'):
        x.reparent('Feiring AS', ('Ollendorff Holding AS', 'p'))
    if x.has('Feiring Vestfold AS'):
        x.reparent('Feiring Vestfold AS', ('Feiring Bruk AS', 'div_ent'))
        if not any(l[0] == 'Feiring Bruk AS' for l in x.g['links']):
            x.reparent('Feiring Bruk AS', ('Feiring AS', 'div_ent'))
            x.reparent('Feiring AS', ('Ollendorff Holding AS', 'p'))
    if x.has('Lundhs Aggregates AS'):
        x.reparent('Lundhs Aggregates AS', ('Feiring Vestfold AS', 'div_ent'))
        x.label('Lundhs Aggregates AS', '(50 %, Larvik)')
    if x.has('Feiring Eiendomsinvest AS'):
        x.reparent('Feiring Eiendomsinvest AS', ('Ollendorff Holding AS', 'p'))
    x.drop('Morten Grefsrud AS')          # owned by a private person, not by Feiring

NG_TOP = [('NG Finco AS', 'div_ent'), ('NG Holdco AS', 'div_ent'), ('NG Midco AS', 'div_ent'),
          ('Summa Circular Holdco AS', 'p', '(Summa Equity funds)')]
def ng(x):
    if x.has('Norsk Gjenvinning AS'):
        x.reparent('Norsk Gjenvinning AS', ('NG Nordic AS', 'div_ent'))
    if x.has('Norsk Gjenvinning m3 AS'):
        x.reparent('Norsk Gjenvinning m3 AS', ('Mana Group AS', 'div_ent'))
        x.reparent('Mana Group AS', ('NG Nordic AS', 'div_ent'))
    if x.has('NG Nordic AS'):
        x.reparent('NG Nordic AS', ('Norsk Gjenvinning Norge AS', 'div_ent'))
        prev = 'Norsk Gjenvinning Norge AS'
        for p in NG_TOP:
            x.reparent(prev, p); prev = p[0]

def af(x):
    x.reparent('AF Energi og Miljø AS', ('AF Gruppen ASA', 'p'))
    x.reparent('AF Offshore AS', ('AF Gruppen ASA', 'p'))
    x.reparent('AF Miljøbase Vats AS', ('AF Offshore AS', 'div_ent'))
    x.reparent('AF Gruppen Norge AS', ('AF Gruppen ASA', 'p'))
    if x.has('Betonmast AS'):
        x.reparent('Betonmast AS', ('Betonmast Holding AS', 'div_ent'))
        x.reparent('Betonmast Holding AS', ('AF Gruppen ASA', 'p', '(67 %)'))
    for c in ('JR Anlegg AS', 'Strøm Gundersen AS'):
        if x.has(c): x.reparent(c, ('AF Gruppen Holding AS', 'div_ent'))
    if x.has('Haga & Berg Entreprenør AS'):
        x.reparent('Haga & Berg Entreprenør AS', ('Nye Haga & Berg Holding AS', 'div_ent'))
        x.reparent('Nye Haga & Berg Holding AS', ('AF Gruppen Holding AS', 'div_ent', '(80 %)'))
    if x.has('Lab Entreprenør AS'):
        x.reparent('Lab Entreprenør AS', ('LAB AS', 'div_ent'))
        x.reparent('LAB AS', ('AF Gruppen Holding AS', 'div_ent', '(71 %)'))
    if x.has('AF Gruppen Holding AS'):
        x.reparent('AF Gruppen Holding AS', ('AF Gruppen ASA', 'p'))
    if x.has('Nes Miljøpark AS'):
        x.reparent('Nes Miljøpark AS', ('Esval Miljøpark Nes KF', 'div_ent'),
                   ('Gunnar Holth Grusforretning AS', 'div_ent'), ('AF Energi og Miljø AS', 'div_ent'))

def ghg(x):
    if x.has('Gunnar Holth Grusforretning AS'):
        x.reparent('Gunnar Holth Grusforretning AS', ('Constructio AS', 'p'))

def mr_pukk(x):
    for gone in ('Mr. Pukk AS', 'Maur Tipp og Slep AS', 'Ramnes Næringseiendom AS'):
        x.drop(gone)
    x.label('Heffalompen Holding AS', '(konkurs 29.10.2026)')
    x.reparent('Mr. Pukk Eiendom AS', ('Heffalompen Holding AS', 'p'))
    for c in ('Mr. Pukk Gjenvinning AS', 'Mr. Pukk Furuset AS', 'Mr. Pukk Øst AS', 'Mysen Asfalt AS',
              'Bokerøya AS', 'Mr. Pukk Eiendom 10 AS', 'Mr. Pukk Høland AS'):
        if x.has(c): x.reparent(c, ('Mr. Pukk Eiendom AS', 'div_ent'))
    x.label('Mr. Pukk Øst AS', '(konkurs 15.10.2026)')
    if x.has('Torperåsen AS'): x.reparent('Torperåsen AS', ('Mr. Pukk Øst AS', 'div_ent'))

# ---------------------------------------------------------------- per-file corrections
FIX = {}
def fix(*files):
    def deco(f):
        for fn in files: FIX[fn] = f
        return f
    return deco

@fix('feiring_eidsvoll.html', 'feiring_bruK_enebakk_network.html', 'of_io_004_network.html', 'vf_la_002_network.html')
def _(x): ollendorff(x)

@fix('vf_to_002_network.html')
def _(x):
    # Re Pukkverk is the register branch FEIRING VESTFOLD (Taranrødveien, Sem) of Feiring Vestfold AS
    ollendorff(x)
    x.reparent('Re Pukkverk', ('Feiring Vestfold AS', 'div_ent', '(operator)'))
    x.label('Feiring Bruk AS', None)
    ollendorff(x)
    for b in ('Feiring Bruk AS avd. Dal Pukkverk', 'Feiring Bruk AS avd. Heier Pukkverk (Enebakk)', 'Hobøl Massemottak'):
        x.link(b, 'Feiring Bruk AS')

@fix('vf_to_001_network.html')
def _(x):
    x.rename('Feiring Bruk AS', 'Feiring Vestfold AS', 'div_ent', '(same site)')

@fix('royken_network.html')
def _(x):
    x.reparent('Røyken Grovfyllplass AS', ('Franzefoss Gjenvinning AS', 'div_ent'), ('FFF Hage og Miljø AS', 'div_ent'))
    x.rename('FFF Hage og Miljø AS', 'F F F Hage og Miljø AS', l='(62 %)')
    x.label('Røyken Grovfyllplass AS', '(operator; FFF 62 %, Franzefoss Gjenvinning 38 %)')

@fix('os_os_004_network.html')
def _(x):
    x.drop('Franzefoss / NOAH Environment (joint venture)')
    x.reparent('FRANO AS', ('Franzefoss AS', 'p', '(50 %)'), ('NOAH Environment AS', 'div_ent', '(50 %)'))
    x.reparent('NOAH Environment AS', ('NOAH AS', 'div_ent'))
    x.reparent('NOAH AS', ('Gjelsten Holding AS', 'p'))

@fix('noah_network.html')
def _(x):
    x.rename('NOAH Environment', 'NOAH Environment AS', 'div_ent')
    x.drop('Aas Gård')
    x.reparent('NOAH Engadalen AS', ('Fearnley Holding AS', 'p', '(12.5 %)'), ('Fearnley Invest AS', 'p', '(37.6 %)'),
               ('NOAH Environment AS', 'div_ent', '(49.9 %)'))
    x.rename('Fabritius Gruppen', 'Fabritius Gruppen AS', 'div_ent', '(Property)')
    x.reparent('Profier AS', ('Gjelsten Bolig AS', 'div_ent', '(89 %)'))
    x.reparent('Gjelsten Bolig AS', ('Gjelsten Holding AS', 'p'))
    x.label('FRANO AS', '(50 %, with Franzefoss AS)')
    x.label('Rekefjord Stone AS', '(50 %, quarry)')

@fix('vf_hm_001_network.html')
def _(x): pass

@fix('lindum_oredalen_network.html')
def _(x):
    x.reparent('Lindum Oredalen AS', ('Asker kommune', 'p', '(49 %)'), ('Lindum AS', 'div_ent'))
    x.label('Lindum Oredalen AS', '(operator; Lindum 51 %, Asker kommune 49 %)')
    x.rename('Lindum Sør AS', 'Libir Næring AS', 'div_ent', '(51 %, Lillesand)')
    x.drop('Grønt Skift AS')                 # owned by Fiskeri Hub AS, not Lindum
    x.reparent('Egge 1 AS', ('Nimeco AS', 'p', '(49 %)'), ('Lindum AS', 'div_ent'))
    x.label('Egge 1 AS', '(51 %, Lier)')
    x.reparent('Lindum AS', ('Drammen kommune', 'p'))
    x.reparent('Drammen Havn AS', ('Drammen kommune', 'p'))
    x.label('Drammen Havn AS', '(64 %)')

@fix('bu_li_001_network.html')
def _(x):
    x.reparent('Egge 1 AS', ('Nimeco AS', 'p', '(49 %)'), ('Lindum AS', 'div_ent', '(51 %)'))

@fix('bu_dr_002_network.html')
def _(x):
    x.rename('Lindum AS (Drammen kommune)', 'Drammen kommune', 'p')

@fix('bu_dr_001_network.html')
def _(x):
    x.type('Drammen Havn AS', 'div_ent')
    x.reparent('Drammen Havn AS', ('Lier kommune', 'p', '(18 %)'), ('Asker kommune', 'p', '(18 %)'),
               ('Drammen kommune', 'p', '(64 %)'))

@fix('bu_li_003_network.html')
def _(x):
    x.reparent('Gilhusbukta Eiendom AS', ('Skanrise AS', 'p', '(34 %)'), ('IAT Holding AS', 'p', '(66 %)'))

@fix('mr_pukk_network.html', 'holand_betong_network.html')
def _(x): mr_pukk(x)

@fix('elvestad_network.html')
def _(x):
    x.drop('Kystmiljø AS')                   # owned by Circulariaq AS, not Veidekke
    x.rename('Geomaterialer', 'Veidekke Geomaterialer')

@fix('in_ha_003_network.html', 'in_st_001_network.html')
def _(x):
    x.drop('Gunnar Holth Grusforretning (GHG) group')
    x.reparent('Hamar Pukk og Grus AS', ('Veidekke Industri AS', 'div_ent', '(50 %)'),
               ('Gunnar Holth Grusforretning AS', 'div_ent', '(50 %)'))
    x.reparent('Veidekke Industri AS', ('Veidekke ASA', 'p'))
    ghg(x)

@fix('nes-network-visualization.html', 'jolsen_network.html')
def _(x):
    af(x); ghg(x)


@fix('asak_network.html', 'vf_ho_001_network.html', 'in_ko_001_network.html', 'of_fr_002_network.html',
     'of_fr_003_network.html', 'of_fr_004_network.html', 'vf_la_001_network.html')
def _(x): ng(x)

@fix('in_el_001_network.html')
def _(x):
    x.type('Deponitomta AS', 'div_ent')
    x.reparent('Deponitomta AS', ('SMV Invest AS', 'p'))

@fix('of_fr_001_network.html')
def _(x):
    x.type('Borge Pukkverk AS', 'div_ent')
    x.reparent('Borge Pukkverk AS', ('Brødrene Ødegård Holding AS', 'p'))

@fix('helgerud_network.html')
def _(x): x.label('Helgerud Deponi AS', '(struck off 10.11.2026)')

@fix('in_nl_001_network.html')
def _(x): x.rename('Åse Gjefle', 'Private individual', 'p', '(operator)')

@fix('ak_li_006_network.html')
def _(x): x.rename('Lillestrøm kommune (tidl. Skedsmo kommune)', 'Lillestrøm kommune', 'p', '(formerly Skedsmo kommune)')

@fix('ragn_sells_network.html')
def _rs(x):
    x.label('Ragn-Sells AB', '(Sweden)')
    x.reparent('Aquapro AS', ('Ragn-Sells AS', 'div_ent'))
    x.label('Aquapro AS', '(85 %)')
    x.reparent('Ocean Cleaning AS', ('Aquapro AS', 'div_ent'))

@fix('roaf_skedsmo_network.html')
def _roaf(x):
    # the seven owner kommuner were drawn as ROAF's children; ROAF is owned by them
    R = 'Romerike Avfallsforedling IKS (ROAF)'
    kom = [n['id'] for n in x.g['nodes'] if n['id'].endswith(' kommune')]
    x.g['links'] = [[R, a] if (b == R and a in kom) else [a, b] for a, b in x.g['links']]
    x.type(R, 'div_ent')
    for k in kom: x.type(k, 'p')

@fix('dal_skog_network.html')
def _(x): x.rename('Øvre Romerike Avfallsselskap IKS', 'Øvre Romerike Avfallsselskap (ØRAS) IKS')

# ---------------------------------------------------------------- new graphs
def feiring_chain(x, op='Feiring Bruk AS'):
    x.add(op, 'div_ent', '(operator)')
    if op != 'Feiring Bruk AS':
        x.add('Feiring Bruk AS', 'div_ent'); x.link(op, 'Feiring Bruk AS') if op == 'Feiring Vestfold AS' else x.link(op, 'Feiring AS')
    x.add('Feiring AS', 'div_ent'); x.add('Ollendorff Holding AS', 'p')
    if op in ('Feiring Bruk AS', 'Feiring Vestfold AS'): x.link('Feiring Bruk AS', 'Feiring AS')
    x.link('Feiring AS', 'Ollendorff Holding AS')

def feiring_sites(x, here):
    """The other Feiring Bruk works on the map, as in the existing Feiring graphs."""
    for s, l in [('Feiring Bruk AS avd. Dal Pukkverk', '(Dal)'), ('Feiring Bruk AS avd. Lørenskog', '(Lørenskog)'),
                 ('Feiring Bruk AS avd. Bjønndalen Bruk', '(Nittedal)'), ('Feiring Bruk AS avd. Fet Pukkverk', '(Gansdalen)'),
                 ('Hobøl Massemottak', '(Hobøl)')]:
        if s != here:
            x.add(s, 'div_ind', l); x.link(s, 'Feiring Bruk AS')
    x.add('Feiring Miljø AS', 'div_ent'); x.link('Feiring Miljø AS', 'Feiring AS')

def new(title, site_label, build):
    g = {'title': title, 'nodes': [{'id': title, 'type': 'receiving', 'l': site_label, 'active': True}], 'links': []}
    x = G(g); build(x, title); return g

NEW = {}
def ak_lo_002(x, t):
    feiring_chain(x); x.link(t, 'Feiring Bruk AS'); feiring_sites(x, 'Feiring Bruk AS avd. Lørenskog')
NEW['ak_lo_002_network.html'] = ('Feiring Bruk AS avd. Lørenskog', '(Lørenskog)', ak_lo_002)
def ak_ni_003(x, t):
    feiring_chain(x); x.link(t, 'Feiring Bruk AS'); feiring_sites(x, 'Feiring Bruk AS avd. Bjønndalen Bruk')
NEW['ak_ni_003_network.html'] = ('Feiring Bruk AS avd. Bjønndalen Bruk', '(Nittedal)', ak_ni_003)
def ak_li_010(x, t):
    feiring_chain(x); x.link(t, 'Feiring Bruk AS'); feiring_sites(x, 'Feiring Bruk AS avd. Fet Pukkverk')
NEW['ak_li_010_network.html'] = ('Fet pukkverk (Gansdalen)', '(Gansdalen)', ak_li_010)
def ak_ul_008(x, t):
    x.add('Feiring Miljø AS', 'div_ent', '(plan proposer)'); x.link(t, 'Feiring Miljø AS')
    x.add('Feiring Bruk AS', 'div_ent'); x.add('Feiring AS', 'div_ent'); x.add('Ollendorff Holding AS', 'p')
    x.link('Feiring Miljø AS', 'Feiring AS'); x.link('Feiring Bruk AS', 'Feiring AS'); x.link('Feiring AS', 'Ollendorff Holding AS')
    x.add('Feiring Bruk AS avd. Dal Pukkverk', 'div_ind', '(Dal)'); x.link('Feiring Bruk AS avd. Dal Pukkverk', 'Feiring Bruk AS')
NEW['ak_ul_008_network.html'] = ('Fløgstad massemottak (planned)', '(Ullensaker)', ak_ul_008)

def franzefoss(x, t, here):
    x.add('Franzefoss Pukk AS', 'div_ent', '(operator)'); x.add('Franzefoss AS', 'p')
    x.link(t, 'Franzefoss Pukk AS'); x.link('Franzefoss Pukk AS', 'Franzefoss AS')
    for s, l in [('Franzefoss Pukk avd. Bondkall', '(Bondkall)'), ('Franzefoss Pukk avd. Steinskogen', '(Bærums Verk)'),
                 ('Franzefoss Pukk avd. Vinterbro', '(Vinterbro)'), ('Franzefoss Pukk avd. Nesodden', None)]:
        x.add(s, 'div_ind', l); x.link(s, 'Franzefoss Pukk AS')
    x.add('Franzefoss Gjenvinning AS', 'div_ent'); x.link('Franzefoss Gjenvinning AS', 'Franzefoss AS')
NEW['bu_li_005_network.html'] = ('Lierskogen Pukkverk', '(Lierskogen)', lambda x, t: franzefoss(x, t, t))

def yggeset(x, t):
    x.add('Asker kommune Samfunnstjenester', 'div_ind', '(operator)'); x.add('Asker kommune', 'p')
    x.link(t, 'Asker kommune Samfunnstjenester'); x.link('Asker kommune Samfunnstjenester', 'Asker kommune')
    for s in ('Mortensrud avfallsdeponi', 'Nilsemarka avfallsdeponi'):
        x.add(s, 's'); x.link(s, 'Asker kommune')
NEW['ak_as_005_network.html'] = ('Yggeset gjenvinningsstasjon', '(Yggeset)', yggeset)

def asland(x, t, others):
    x.add('Åsland Pukk AS', 'div_ent', '(operator)'); x.link(t, 'Åsland Pukk AS')
    x.add('Dekar Tomteutvikling AS', 'div_ent', '(50 %)'); x.add('Gunnar Holth Grusforretning AS', 'div_ent', '(50 %)')
    x.link('Åsland Pukk AS', 'Dekar Tomteutvikling AS'); x.link('Åsland Pukk AS', 'Gunnar Holth Grusforretning AS')
    x.add('AKH Gruppen AS', 'p'); x.link('Dekar Tomteutvikling AS', 'AKH Gruppen AS')
    x.add('Constructio AS', 'p'); x.link('Gunnar Holth Grusforretning AS', 'Constructio AS')
    for s, l in others:
        x.add(s, 's', l); x.link(s, 'Åsland Pukk AS')
    x.add('Hamar Pukk og Grus AS', 'div_ent', '(50 %)'); x.link('Hamar Pukk og Grus AS', 'Gunnar Holth Grusforretning AS')
    x.add('Nes Miljøpark AS', 'div_ent', '(34 %)'); x.link('Nes Miljøpark AS', 'Gunnar Holth Grusforretning AS')
HUKEN, ASL, TOV = ('Huken pukk- og asfaltverk (historical)', '(Grorud)'), ('Åsland pukkverk', '(Åsland)'), ('Toverud pukk og deponi (closed)', '(Lier)')
NEW['os_os_009_network.html'] = (HUKEN[0], HUKEN[1], lambda x, t: asland(x, t, [ASL, TOV]))
NEW['os_os_010_network.html'] = (ASL[0], ASL[1], lambda x, t: asland(x, t, [HUKEN, TOV]))
NEW['bu_li_006_network.html'] = (TOV[0], TOV[1], lambda x, t: asland(x, t, [HUKEN, ASL]))

def skolt(x, t, here):
    x.add('Skolt Holding AS', 'p')
    if here == 'vestby':
        x.add('Skolt Pukkverk AS', 'div_ent', '(operator)'); x.link(t, 'Skolt Pukkverk AS')
        x.add('Skolt Miljøpark AS', 'div_ent'); x.add('Horgen miljøpark (planned)', 's', '(Frogn, 60 %)')
        x.link('Horgen miljøpark (planned)', 'Skolt Miljøpark AS')
    else:
        x.add('Horgen Miljøpark AS', 'div_ent', '(plan proposer)'); x.link(t, 'Horgen Miljøpark AS')
        x.add('Skolt Miljøpark AS', 'div_ent', '(60 %)'); x.add('Wetlesen Eiendom AS', 'p', '(40 %)')
        x.link('Horgen Miljøpark AS', 'Wetlesen Eiendom AS'); x.link('Horgen Miljøpark AS', 'Skolt Miljøpark AS')
        x.add('Skolt Pukkverk AS', 'div_ent'); x.add('Vestby pukkverk', 's', '(Vestby)'); x.link('Vestby pukkverk', 'Skolt Pukkverk AS')
    x.link('Skolt Pukkverk AS', 'Skolt Holding AS'); x.link('Skolt Miljøpark AS', 'Skolt Holding AS')
    for s in ('Moss pukkverk', 'Råde pukkverk', 'Sarpsborg pukkverk'):
        x.add(s, 's'); x.link(s, 'Skolt Pukkverk AS')
NEW['ak_ve_001_network.html'] = ('Vestby pukkverk', '(Grønnlund)', lambda x, t: skolt(x, t, 'vestby'))
NEW['ak_fr_001_network.html'] = ('Horgen miljøpark (planned)', '(Horgen, Frogn)', lambda x, t: skolt(x, t, 'horgen'))

def hakanes(x, t):
    x.add('Håkanes Maskin A/S', 'div_ent', '(DMF holder)'); x.add('Håkanes AS', 'p')
    x.link(t, 'Håkanes Maskin A/S'); x.link('Håkanes Maskin A/S', 'Håkanes AS')
NEW['bu_li_008_network.html'] = ('Enger Østre', '(Lier)', hakanes)

def jessheim(x, t):
    x.add('Jessheim Asfalt AS', 'div_ent', '(operator)'); x.add('Arctic Gruppen Holding AS', 'p')
    x.link(t, 'Jessheim Asfalt AS'); x.link('Jessheim Asfalt AS', 'Arctic Gruppen Holding AS')
NEW['ak_ul_005_network.html'] = ('Barntjernmoen (gnr/bnr 202/1)', '(Ullensaker)', jessheim)

def private(x, t):
    x.add('Private individual', 'p', '(plan proposer)'); x.link(t, 'Private individual')
NEW['ak_ul_006_network.html'] = ('Haug massemottak (planned)', '(Ullensaker)', private)

def furulund(x, t):
    x.add('Sigurd Furulund Maskin AS', 'div_ent', '(plan proposer)'); x.add('Sigurd Furulund Holding AS', 'p')
    x.link(t, 'Sigurd Furulund Maskin AS'); x.link('Sigurd Furulund Maskin AS', 'Sigurd Furulund Holding AS')
NEW['ak_ul_007_network.html'] = ('Dal gård massemottak (planned)', '(Dal, Ullensaker)', furulund)

# ---------------------------------------------------------------- run
if __name__ == '__main__':
    os.chdir(sys.argv[1] if len(sys.argv) > 1 else '.')
    changed = []
    for fn in sorted(glob.glob('*.html')):
        g = parse(fn); before = json.dumps(g, ensure_ascii=False, sort_keys=True)
        x = G(g)
        if fn in FIX: FIX[fn](x)
        x.fix_types()
        out_fn = fn
        drifted = fn in ('helgerud_network.html', 'jolsen_network.html', 'feiring_eidsvoll.html', 'dal_skog_network.html',
                         'esval-network-visualization.html', 'feiring_bruK_enebakk_network.html',
                         'holand_betong_network.html', 'elvestad_network.html')
        if drifted or not g['new'] or json.dumps(g, ensure_ascii=False, sort_keys=True) != before:
            emit(out_fn, g); changed.append(fn)
    for fn, (title, lab, build) in NEW.items():
        g = new(title, lab, build); G(g).fix_types(); emit(fn, g); changed.append(fn + ' (new)')
    print(len(changed), 'files written'); print('\n'.join(changed))
