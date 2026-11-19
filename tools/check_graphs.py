import sys, glob, json, os
sys.argv=[sys.argv[0]]+sys.argv[1:]
from patch_graphs import parse
d=sys.argv[1] if len(sys.argv)>1 else '.'
bad=0
for f in sorted(glob.glob(d+'/*.html')):
    g=parse(f); ids=[n['id'] for n in g['nodes']]; S=set(ids)
    errs=[]
    if len(ids)!=len(S): errs.append('dup ids')
    for a,b in g['links']:
        if a not in S or b not in S: errs.append(f'dangling {a}>{b}')
    if sum(1 for n in g['nodes'] if n.get('active'))!=1: errs.append('active!=1')
    linked={x for l in g['links'] for x in l}
    iso=[i for i in ids if i not in linked and len(ids)>1]
    if iso: errs.append('isolated '+str(iso))
    # cycles
    par={}
    for a,b in g['links']: par.setdefault(a,[]).append(b)
    def cyc(n,seen):
        if n in seen: return True
        return any(cyc(p,seen|{n}) for p in par.get(n,[]))
    if any(cyc(i,set()) for i in ids): errs.append('cycle')
    if 'Åse' in json.dumps(g,ensure_ascii=False) or 'family' in json.dumps(g): errs.append('person name?')
    if errs: bad+=1; print(os.path.basename(f), errs)
print('graphs', len(glob.glob(d+'/*.html')), 'with problems', bad)
