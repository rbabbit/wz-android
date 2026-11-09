"""Author Greenhaven and append its data to the frozen 0.17 Towers package.

This is map generation and package integrity checking, not engine/emulator
testing. Original map assets and the compiled engine body remain unchanged.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
from collections import deque
import json
import argparse
import runpy
import struct

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
MAP = ROOT / 'map/greenhaven-beginner'
BASELINE = ROOT.parent / 'Warzone-Towers-0.17.apk'
BASELINE_SHA = 'bc093d1040cc7a8ec48d7f4c2cd1c41f87b888a4db3e98c6c034c6d10f29fb46'
LEVEL = 'Greenhaven-T1'
W, H = 64, 80
package_call = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='greenhaven_package')['package_call']


def digest(data):
    return sha256(data).hexdigest()


def require(value, message):
    if not value:
        raise RuntimeError(message)


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data if isinstance(data, bytes) else data.encode('utf-8'))


def dump(path, value):
    write(path, json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def author_map():
    # One connected, broad S approach from the north; a single flat southern
    # base. All other perimeter spawn tiles are native cliff-face terrain.
    areas = [(8,0,19,15), (8,9,53,20), (42,9,53,37),
             (17,26,53,37), (17,26,28,53), (17,43,37,56), (7,52,56,76)]
    floor = {(x,y) for x in range(W) for y in range(H)
             if any(a <= x <= c and b <= y <= d for a,b,c,d in areas)}
    ttp = (ROOT / 'vendor/maps/td1-v3/map/ttypes.ttp').read_bytes()
    count = struct.unpack_from('<I', ttp, 8)[0]
    types = struct.unpack_from('<' + 'H' * count, ttp, 12)
    require(types[18] == 8 and types[23] == 3 and types[24] == 3 and types[77] == 6,
            'Arizona native cliff/green-mud/road texture mappings changed')
    # Tile heights are vertices. Keep every corner of each traversable tile
    # flat; only the impassable rim rises to the surrounding rocky plateau.
    def height(x,y):
        return 128 if any((x+dx,y+dy) in floor for dx,dy in [(0,0),(-1,0),(0,-1),(-1,-1)]) else 384
    def road(x,y):
        return (12 <= x <= 15 and y <= 13 or 12 <= x <= 47 and 12 <= y <= 15
                or 46 <= x <= 49 and 13 <= y <= 32
                or 22 <= x <= 48 and 30 <= y <= 33
                or 21 <= x <= 24 and 31 <= y <= 56
                or 22 <= x <= 32 and 55 <= y <= 58 or 30 <= x <= 33 and 56 <= y <= 67)
    tiles = bytearray()
    for y in range(H):
        for x in range(W):
            if (x,y) not in floor:
                texture = 18
            elif road(x,y):
                texture = 77
            else:
                texture = 23 if (x * 17 + y * 11) % 9 else 24
            tiles.extend(struct.pack('<HH', texture, height(x,y)))
    gates = [(8,6,19,6), (34,9,34,20), (42,24,53,24),
             (34,26,34,37), (17,41,28,41), (17,51,37,51)]
    for a,b,c,d in gates:
        require(all((x,y) in floor for x in range(a,c+1) for y in range(b,d+1)), 'Gateway crosses cliff')
    write(MAP / 'game.map', b'map ' + struct.pack('<III', 40,W,H) + tiles
          + struct.pack('<II', 1,len(gates)) + bytes(v for gate in gates for v in gate))
    write(MAP / 'ttypes.ttp', ttp)
    catalog = json.loads((ASSETS / 'command-catalog.json').read_text(encoding='utf-8'))
    specs = {b['id']:b for b in catalog['buildings']}
    structures, occupied = [], set()
    next_id = 100
    def structure(name,x,y,player=0):
        nonlocal next_id
        spec = specs[name]; w,h = spec['width'],spec['breadth']
        cells = {(a,b) for a in range(x-w//2,x-w//2+w) for b in range(y-h//2,y-h//2+h)}
        require(cells <= floor and not cells & occupied, 'Invalid/overlapping starting structure: ' + name)
        require(all(height(a,b) == 128 for a,b in cells), 'Starting structure is not on flat ground')
        occupied.update(cells)
        structures.append({'name':name,'id':next_id,'position':[round((x+(w%2)*.5)*128),round((y+(h%2)*.5)*128)],'rotation':0,'startpos':player})
        next_id += 1
    for name,x,y in [('A0CommandCentre',32,70), ('A0PowerGenerator',15,61),
                     ('A0ResearchFacility',23,66), ('A0ResearchFacility',23,70),
                     ('A0LightFactory',42,65), ('A0LightFactory',48,65),
                     ('A0CyborgFactory',43,72), ('GuardTower1',19,55), ('GuardTower1',29,55)]:
        structure(name,x,y)
    oil = [(14,67),(17,67),(14,71),(17,71)]
    for x,y in oil:
        structure('A0ResourceExtractor',x,y)
    structure('A0CommandCentre',12,4,1)
    droids = []
    for player,points in [(0,[(28,64),(30,64),(32,64),(34,64)]),(1,[(12,7)])]:
        for x,y in points:
            require((x,y) in floor and (x,y) not in occupied, 'Truck footprint is blocked')
            droids.append({'template':'ConstructionDroid','id':next_id,'position':[x*128+64,y*128+64],'rotation':0,'startpos':player})
            next_id += 1
    features = []
    for x,y in oil:
        features.append({'name':'OilResource','id':next_id,'position':[x*128+64,y*128+64],'rotation':0});next_id += 1
    # Real stock scenery stays on the surrounding ridge, outside build space.
    for n,(x,y) in enumerate([(4,11),(27,5),(58,17),(33,23),(6,37),(38,43),(56,45),(4,61),(59,70)]):
        require((x,y) not in floor, 'Decorative boulder is in the approach')
        features.append({'name':'Boulder'+str(1+n%3),'id':next_id,'position':[x*128+64,y*128+64],'rotation':(n*8192)%65536});next_id += 1
    dump(MAP / 'struct.json', {'version':2,'structures':structures})
    dump(MAP / 'droid.json', {'version':2,'droids':droids})
    dump(MAP / 'feature.json', {'version':2,'features':features})
    dump(MAP / 'gam.json', {'version':7,'gameTime':0,'GameType':0,'ScrollMinX':0,'ScrollMinY':0,'ScrollMaxX':W,'ScrollMaxY':H,'levelName':''})
    dump(MAP / 'level.json', {'name':'greenhaven-beginner','type':'skirmish','players':2,'tileset':'arizona','author':{'name':'Warzone Towers'},'spdx-license-id':'CC0-1.0','generator':'tools/build-greenhaven.py'})
    write(MAP / 'level.lev', '// Greenhaven: original Towers Beginner layout, CC0-1.0\nlevel '+LEVEL+'\nplayers 2\ntype 14\ndataset MULTI_CAM_1\ngame "multiplay/maps/greenhaven-beginner.gam"\n')
    # Generation constraints only: connected terrain, one north entrance and
    # reachable starting trucks/facility perimeters, not native pathfinding QA.
    seen, pending = {(12,1)}, deque([(12,1)])
    while pending:
        x,y=pending.popleft()
        for p in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
            if p in floor and p not in seen:seen.add(p);pending.append(p)
    require(seen == floor, 'Authoring produced disconnected ground')
    free = floor - occupied
    connected, pending = {(12,1)}, deque([(12,1)])
    while pending:
        x,y=pending.popleft()
        for p in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
            if p in free and p not in connected:connected.add(p);pending.append(p)
    require(all((d['position'][0]//128,d['position'][1]//128) in connected for d in droids), 'Starting truck route blocked')
    for s in structures:
        x,y=[v//128 for v in s['position']];spec=specs[s['name']];w,h=spec['width'],spec['breadth']
        around={(a,b) for a in range(x-w//2-1,x-w//2+w+1) for b in range(y-h//2-1,y-h//2+h+1)}-occupied
        require(bool(around & connected), 'Facility has no reachable perimeter: '+s['name'])
    edges={(x,1) for x in range(1,W-1)}|{(x,H-2) for x in range(1,W-1)}|{(1,y) for y in range(2,H-1)}|{(W-2,y) for y in range(2,H-1)}
    entrances=sorted(edges & floor)
    require(len(entrances)==12 and all(y==1 for x,y in entrances), 'Unexpected perimeter entrance')
    proof={'dimensions':[W,H],'groundTiles':len(floor),'entranceTiles':entrances,'gateways':gates,'startingHumanTrucks':4,'startingHumanStructures':{name:sum(s['name']==name and s['startpos']==0 for s in structures) for name in sorted({s['name'] for s in structures})},'staticConnectedGround':True,'staticStartingFootprintsAndRoutes':True,'nativePathfindingOrGameplayTested':False}
    dump(MAP / 'AUTHORING.json', proof)
    return proof


def main():
    global BASELINE
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline-apk',type=Path,default=BASELINE)
    BASELINE=parser.parse_args().baseline_apk.resolve()
    require(digest(BASELINE.read_bytes())==BASELINE_SHA, 'Frozen benchmark APK changed')
    map_proof=author_map()
    challenge=json.loads((ROOT/'scenario/warzonetowers-td1.json').read_text(encoding='utf-8'))
    challenge['challenge'].update({'name':'Warzone Towers: Greenhaven Beginner','description':'A connected base, one winding approach and 15 gentler waves.','map':LEVEL,'maxPlayers':2})
    challenge={k:v for k,v in challenge.items() if k not in ['player_2','player_3']}
    challenge['player_1']['name']='Scavengers'
    dump(ROOT/'scenario/warzonetowers-beginner.json',challenge)
    with ZipFile(BASELINE) as apk:
        old_js=apk.read('assets/warzone/warzone2100.js').decode('utf-8');old_data=apk.read('assets/warzone/warzone2100.data')
        wasm=apk.read('assets/warzone/warzone2100.wasm')
    begin,end,_,metadata=package_call(old_js)
    rows={entry['filename']:dict(entry,start=int(entry['start']),end=int(entry['end'])) for entry in metadata['files']}
    require(len(rows)==len(metadata['files']), 'Baseline VFS has duplicate names')
    def old(path):
        e=rows[path];return old_data[e['start']:e['end']]
    original_config=old('/data/mp/config.js')
    require(original_config==(ROOT/'vendor/tower-defense/mod/config.js').read_bytes(), 'Resolved original schedule differs from supplied source')
    additions={
        '/data/mp/addon.lev':old('/data/mp/addon.lev')+b'\n'+(MAP/'level.lev').read_bytes(),
        '/data/mp/config.js':(ROOT/'scenario/beginner/config-router.js').read_bytes(),
        '/data/mp/tests/towers-original-config.js':original_config,
        '/data/mp/tests/towers-beginner-config.js':(ROOT/'scenario/beginner/config.js').read_bytes(),
        '/data/mp/tests/warzonetowers-beginner.json':(ROOT/'scenario/warzonetowers-beginner.json').read_bytes(),
        '/data/mp/multiplay/maps/greenhaven-beginner.gam':(MAP/'gam.json').read_bytes(),
    }
    for name in ['game.map','ttypes.ttp','struct.json','droid.json','feature.json','gam.json','level.json']:
        additions['/data/mp/multiplay/maps/greenhaven-beginner/'+name]=(MAP/name).read_bytes()
    data=bytearray(old_data)
    for path,content in additions.items():
        offset=len(data);data.extend(content);rows[path]={'filename':path,'start':offset,'end':len(data)}
    generated=old_js[:begin]+'loadPackage('+json.dumps(dict(metadata,files=list(rows.values()),remote_package_size=len(data),package_uuid='warzone-towers-4.7.0-v1-'+str(len(data))),separators=(',',':'))+')'+old_js[end:]
    a,b,_,_=package_call(generated)
    require(generated[:a]+'PACKAGE'+generated[b:]==old_js[:begin]+'PACKAGE'+old_js[end:], 'Compiled engine body changed')
    require((ASSETS/'warzone2100.wasm').read_bytes()==wasm, 'Frozen WASM changed')
    changed=[];preserved=[]
    for entry in metadata['files']:
        path=entry['filename'];current=rows[path];content=bytes(data[current['start']:current['end']]);before=old_data[int(entry['start']):int(entry['end'])]
        if content!=before:changed.append(path)
        else:preserved.append({'path':path,'sha256':digest(before),'bytes':len(before)})
    require(set(changed)=={'/data/mp/addon.lev','/data/mp/config.js'}, 'Unexpected existing VFS change')
    write(ASSETS/'warzone2100.js',generated);write(ASSETS/'warzone2100.data',bytes(data))
    index=(ASSETS/'index.html').read_text(encoding='utf-8')
    directory="        Module.FS_createPath('/data/mp/multiplay/maps', 'td1_v3', true, true);"
    if "Module.FS_createPath('/data/mp/multiplay/maps', 'greenhaven-beginner'" not in index:
        require(directory in index,'Original map directory hook missing');index=index.replace(directory,directory+"\n        Module.FS_createPath('/data/mp/multiplay/maps', 'greenhaven-beginner', true, true);",1)
    argument="      Module.arguments.push(towerMap === 'td1' ? '--skirmish=warzonetowers-td1.json' : '--skirmish=warzonetowers.json');"
    if "--skirmish=warzonetowers-beginner.json" not in index:
        require(argument in index,'Original map argument hook missing');index=index.replace(argument,argument+"\n      if (towerMap === 'beginner' && !window.__warzoneDuelConfig) Module.arguments[Module.arguments.length - 1] = '--skirmish=warzonetowers-beginner.json';",1)
    write(ASSETS/'index.html',index)
    proof={'passed':True,'method':'Native map authoring and frozen-0.17 VFS data append; compiled body unchanged outside package metadata. Static/integrity observations only.','baselineAPK':str(BASELINE),'baselineAPK_SHA256':BASELINE_SHA,'originalDataBytes':len(old_data),'originalDataSHA256':digest(old_data),'dataPrefixPreserved':bytes(data[:len(old_data)])==old_data,'normalizedEngineBodyUnchanged':True,'wasmUnchanged':True,'map':map_proof,'changedVFSFiles':changed,'addedVFSFiles':sorted(set(rows)-{e['filename'] for e in metadata['files']}),'preservedVFSFiles':preserved,'newVFSFiles':[{'path':path,'bytes':len(content),'sha256':digest(content)} for path,content in additions.items()],'outputs':[{'path':str(p.relative_to(ROOT)).replace('\\','/'),'sha256':digest(p.read_bytes()),'bytes':p.stat().st_size} for p in [ASSETS/'warzone2100.js',ASSETS/'warzone2100.data',ASSETS/'index.html']],'emulatorUsed':False,'runtimeVerified':False}
    dump(ROOT/'archive/greenhaven-0.18-package.json',proof)
    print(json.dumps({'generated':True,'map':map_proof,'dataBytes':len(data),'preservedVFS':len(preserved),'changedVFS':changed,'addedVFS':len(proof['addedVFSFiles'])}))


if __name__=='__main__':
    main()
