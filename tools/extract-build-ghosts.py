"""Read original PIE structure/component meshes for display-only build ghosts.

PIE coordinate/connector conventions: upstream Warzone 2100 4.7 doc/PIE.md.
No original assets, statistics or embedded engine data are modified.
"""
from pathlib import Path
from hashlib import sha256
import json,re,math

root=Path(__file__).resolve().parents[1]
assets=root/'app/src/main/assets/warzone'
index={n:(int(a),int(b)) for n,a,b in re.findall(r'\{filename:"([^"]+)",start:(\d+),end:(\d+)\}',(assets/'warzone2100.js').read_text())}
data=(assets/'warzone2100.data').read_bytes()
pie_paths={}
for p in sorted(index,key=lambda p:(p.startswith('/data/mp/'),'/diffs/' in p,p)):
    if p.lower().endswith('.pie'):pie_paths[Path(p).name.lower()]=p
def read(p):return data[slice(*index[p])]
def stats(name):
    rows={}
    for p in sorted((p for p in index if p.startswith('/data/mp/') and p.endswith('/stats/'+name+'.json')),key=lambda p:('/diffs/' in p,p)):
        rows.update(json.loads(read(p)))
    return rows
structures=stats('structure')
components={kind:stats(kind) for kind in ['weapons','sensor','ecm','repair','brain']}
sources={};cache={}
def mesh(name):
    if not name:return None
    name=name.lower()
    if name in cache:return cache[name]
    p=pie_paths.get(name)
    if not p:return None
    payload=read(p);sources[p]=sha256(payload).hexdigest()
    text=payload.decode().replace('\r','');text=re.sub(r'#.*','',text)
    levels=[]
    for block in re.split(r'(?m)^LEVEL\s+\d+\s*$',text)[1:]:
        def rows(label):
            m=re.search(r'(?m)^'+label+r'\s+(\d+)\s*\n',block)
            return [line.split() for line in block[m.end():].splitlines()[:int(m[1])]] if m else []
        pts=[[round(float(v),3) for v in row] for row in rows('POINTS')]
        faces=[]
        for row in rows('POLYGONS'):
            n=int(row[1]);ids=list(map(int,row[2:2+n]))
            for k in range(1,n-1):faces.append([ids[0],ids[k],ids[k+1]])
        connectors=[[float(row[0]),float(row[2]),float(row[1])] for row in rows('CONNECTORS')]
        if pts:levels.append({'points':pts,'faces':faces,'connectors':connectors})
    result={'levels':levels};cache[name]=result;return result
def assembled(s):
    points=[];faces=[]
    def add(m,offset=(0,0,0)):
        if not m:return
        for level in m['levels']:
            base=len(points);points.extend([[round(v[i]+offset[i],3) for i in range(3)] for v in level['points']]);faces.extend([[base+i for i in f] for f in level['faces']])
    model=mesh((s.get('structureModel') or [None])[0])
    if not model:return None
    add(mesh(s.get('baseModel')));add(model)
    connectors=model['levels'][0]['connectors']
    slots=[components['weapons'].get(w) for w in s.get('weapons',[]) if w]
    if not slots:
        for kind,key in [('sensor','sensorID'),('ecm','ecmID'),('repair','repairID'),('brain','brainID')]:
            c=components[kind].get(s.get(key))
            if c and c.get('model'):slots.append(c);break
    for i,c in enumerate(slots):
        if not c or not connectors:continue
        at=connectors[min(i,len(connectors)-1)]
        add(mesh(c.get('mountModel')),at);add(mesh(c.get('model')),at)
    # Preserve the original faces, but omit coplanar triangulation diagonals
    # from the outline so a small tower reads as a tower, not a dense grid.
    canonical={};keys=[]
    for p in points:
        key=tuple(p)
        if key not in canonical:canonical[key]=len(canonical)
        keys.append(canonical[key])
    normals=[];edges={}
    for fi,(a,b,c) in enumerate(faces):
        u=[points[b][i]-points[a][i] for i in range(3)];v=[points[c][i]-points[a][i] for i in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];length=math.sqrt(sum(x*x for x in n)) or 1
        normals.append([x/length for x in n])
        for x,y in [(a,b),(b,c),(c,a)]:edges.setdefault(tuple(sorted((keys[x],keys[y]))),[]).append((fi,x,y))
    outline=[]
    for group in edges.values():
        if len(group)==1 or any(abs(sum(normals[group[0][0]][i]*normals[g[0]][i] for i in range(3)))<.94 for g in group[1:]):outline.extend(group[0][1:])
    return {'p':[x for p in points for x in p],'f':[x for f in faces for x in f],'e':outline,'height':max(p[1] for p in points)}
models={key:m for key,s in structures.items() if (m:=assembled(s))}
out=assets/'build-ghost-models.json'
out.write_text(json.dumps({'version':1,'description':'Original PIE geometry, including structure mounts/weapons; translucent display only','models':models},separators=(',',':'))+'\n')
(root/'qa/v6.4-build-display/model-sources.json').write_text(json.dumps({'models':len(models),'generatedSHA256':sha256(out.read_bytes()).hexdigest(),'originalMeshes':sources},indent=2))
print(json.dumps({'models':len(models),'bytes':out.stat().st_size,'originalMeshes':len(sources),'miniRocketVertices':len(models['GuardTower6']['p'])//3}))
