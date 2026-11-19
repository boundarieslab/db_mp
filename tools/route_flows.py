# Routes the published flows over the NVDB E/R/F truck network (nvdb_edges.csv,
# Desktop\lub\01_DIRTY_BUSINESS\ANALISIS\DRIVETIME). Shortest path by length; each end is
# joined to its nearest network node by a straight piece; sea legs are straight.
# Usage: python tools/route_flows.py nvdb_edges.csv data/flow_routes.geojson
# The end points below are the points the map uses (sheet coordinates, or the point a
# project takes from data/project_geometries.geojson). Add a line per new published flow.
import json, math, sys, networkx as nx
from shapely.geometry import LineString
E_CSV=sys.argv[1]; OUT=sys.argv[2]
def hav(a,b):
    R=6371000; la1,lo1,la2,lo2=map(math.radians,(a[1],a[0],b[1],b[0]))
    h=math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))
G=nx.Graph(); pos={}
with open(E_CSV,encoding='utf-8') as f:
    next(f)
    for line in f:
        p=line.rstrip('\n').split(',')
        if len(p)<8: continue
        a,b,L=p[0],p[1],float(p[2] or 0)
        pts=[tuple(map(float,q.split(','))) for q in ','.join(p[6:]).split(' ') if ',' in q]
        pts=[(lo,la) for la,lo in pts]
        if len(pts)<2: continue
        # orient geometry from a to b using nearest end
        if a in pos and hav(pos[a],pts[-1])<hav(pos[a],pts[0]): pts=pts[::-1]
        pos.setdefault(a,pts[0]); pos.setdefault(b,pts[-1])
        if G.has_edge(a,b) and G[a][b]['w']<=L: continue
        G.add_edge(a,b,w=L or hav(pts[0],pts[-1]),g=pts,a=a)
# largest connected component only
cc=max(nx.connected_components(G),key=len); G=G.subgraph(cc).copy()
nodes=list(G.nodes); P=[pos[n] for n in nodes]
def snap(pt):
    best=min(range(len(P)),key=lambda i:(P[i][0]-pt[0])**2*0.25+(P[i][1]-pt[1])**2)
    return nodes[best], hav(P[best],pt)
pts={'SRC_OS_002':(10.652403,59.944633),'BU_LI_003':(10.26102,59.748872),'BU_DR_001':(10.225415,59.735281),
 'SRC_VI_001':(10.592188,59.90299),'AK_AS_001':(10.519787,59.553775),'SRC_OS_001':(10.653472,59.917002),'AK_NI_001':(10.82711,60.13147)}
flows=[('FLW_0003','SRC_OS_002','BU_LI_003','road'),('FLW_0004','BU_LI_003','BU_DR_001','sea'),
 ('FLW_0007','SRC_VI_001','BU_LI_003','road'),('FLW_0008','SRC_VI_001','BU_DR_001','road'),
 ('FLW_0009','SRC_VI_001','AK_AS_001','road'),('FLW_0021','SRC_OS_002','AK_NI_001','road'),('FLW_0022','SRC_OS_001','AK_NI_001','road')]
feats=[]
for fid,fr,to,mode in flows:
    A,B=pts[fr],pts[to]
    if mode=='sea':
        coords=[A,B]; km=hav(A,B)/1000; sa=sb=0
    else:
        na,sa=snap(A); nb,sb=snap(B)
        path=nx.shortest_path(G,na,nb,weight='w')
        coords=[A,pos[na]]
        for u,v in zip(path,path[1:]):
            g=G[u][v]['g']
            if hav(g[0],coords[-1])>hav(g[-1],coords[-1]): g=g[::-1]
            coords+=g[1:]
        coords.append(B)
        km=(sa+sb+nx.path_weight(G,path,weight='w'))/1000
    ls=LineString(coords).simplify(0.00012)
    feats.append({'type':'Feature','properties':{'fid':fid,'mode':mode,'km':round(km,1),'snap_from_m':round(sa),'snap_to_m':round(sb)},
                  'geometry':{'type':'LineString','coordinates':[[round(x,6),round(y,6)] for x,y in ls.coords]}})
    print(fid,mode,round(km,1),'km','snap',round(sa),round(sb),'m',len(ls.coords),'pts')
json.dump({'type':'FeatureCollection','name':'flow_routes','basis':'Shortest path by length over the NVDB E, R and F road network (fetched 25.09.2026); each end joined to its nearest network node by a straight piece. Sea legs are drawn straight.','features':feats},open(OUT,'w'),ensure_ascii=False,separators=(',',':'))
print('nodes',G.number_of_nodes(),'edges',G.number_of_edges())
