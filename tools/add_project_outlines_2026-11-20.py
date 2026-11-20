"""Add plan-area outlines for the construction-project rows of 20 Nov 2026 (VI_033, VI_035, VI_036, VI_037, VI_038) to data/project_geometries.geojson.

Input, saved on the day in tools/project_outlines_2026-11-20.json: the plan area (RpOmråde) of each
project's regulation plan, read from the national plan register (Nasjonal arealplanbase, DiBK,
NAP WMS reguleringsplaner, GetFeatureInfo filtered on plannavn), simplified to 1 m.
A plan area is what the plan regulates, not a worked footprint. SRC_VI_034 E134 Dagslett–E18 has
only a kommunedelplan and gets no outline. Idempotent: features with these uids are replaced.
Run from db_mp:  python3 tools/add_project_outlines_2026-11-20.py"""
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = json.load(open(os.path.join(HERE, 'project_outlines_2026-11-20.json'), encoding='utf-8'))
OUT = os.path.join(HERE, '..', 'data', 'project_geometries.geojson')
_src = open(os.path.join(HERE, 'add_project_outlines.py'), encoding='utf-8').read()
exec(_src[_src.index('def dec('):_src.index('NAMES =')])   # the same decoding, area and inside-point helpers

NAMES = {'VI_033': 'Holmenga Nord: uttak av fjell for næringsareal', 'VI_035': 'Holmestrand næringspark (Bentsrud)',
         'VI_036': 'E134 Saggrenda–Elgsjø', 'VI_037': 'Vestfoldbanen: Nykirke–Barkåker (dobbeltspor)',
         'VI_038': 'E18 Retvet–Vinterbro'}
NOTES = {'VI_033': 'The plan Holmenga nord, del av gbnr. 97/1; the same ground as facility AK_EI_007.',
         'VI_035': 'The plan crosses the kommune border: the Holmestrand part and the Tønsberg part are drawn together.',
         'VI_036': 'Two plans for one road: Kongsberg 522R and Notodden 201904, drawn together.',
         'VI_037': 'Three plans for one railway and its deposits, drawn together: Horten 00401 (two parts), the former Re '
                   'kommune\'s 20160037 (now split between Horten and Tønsberg) and the former Tønsberg kommune\'s 20160146. '
                   'They include the permanent deposit areas D1, D7, D13 and D18.',
         'VI_038': 'Two plans for one road, drawn together: Ås 286 (two parts) and Nordre Follo 201402 (former Ski). '
                   'They include the massedeponi areas; the separate «Ny jord» farmland plans are not drawn.'}
NAP_SRC = 'Nasjonal arealplanbase (DiBK), NAP WMS reguleringsplaner, layer RpOmråde; read 2026-11-20'
feats = []
for k in ('VI_033', 'VI_035', 'VI_036', 'VI_037', 'VI_038'):
    mp, plans = [], []
    for x in SRC[k]:
        mp += polys(x['enc']); m = x['meta']
        pl = '%s/%s %s (in force %s)' % (m['kn'], m['pid'], m['plannavn'].strip(), m['ikrafttredelsesdato'][:10])
        if pl not in plans: plans.append(pl)   # a plan drawn in several parts is named once
    note = ('The plan area (RpOmråde) of the project\'s regulation plan in the national plan register, simplified to 1 m: '
            'what the plan regulates, not a worked footprint. ' + NOTES[k])
    feats.append({'type': 'Feature', 'properties': {'uid': 'SRC_' + k, 'n': NAMES[k], 'kind': 'perimeter', 'firm': 1, 'basis': 'plan area',
                  'src': NAP_SRC, 'srcname': 'Nasjonal arealplanbase', 'plan': '; '.join(plans), 'note': note,
                  'pt': point_in(mp), 'a': area(mp)}, 'geometry': {'type': 'MultiPolygon', 'coordinates': mp}})
gj = json.load(open(OUT, encoding='utf-8'))
new = {f['properties']['uid'] for f in feats}
keep = [f for f in gj['features'] if f['properties']['uid'] not in new]
gj['features'] = keep + feats
raw = open(OUT, 'rb').read(); end = raw[len(raw.rstrip()):].decode()
open(OUT, 'w', encoding='utf-8', newline='').write(json.dumps(gj, ensure_ascii=False, separators=(',', ':')) + end)
print(len(keep), 'kept +', len(feats), 'added')
for f in feats: p = f['properties']; print(p['uid'], p['a'], p['pt'], p['plan'])
