"""Package 43 authored Towers levels against the preserved 0.18 APK.

This is deterministic asset authoring and package integrity verification. It
does not execute native gameplay, pathfinding, wave balance, or gesture tests.
Run generate-levels-019.py first. Requires Pillow for legacy data previews.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
from collections import Counter
import configparser
import json
import math
import runpy
import struct

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
BASELINE = ROOT.parent / 'Warzone-Towers-0.18.apk'
BASELINE_SHA = '1e0af446e348b4800930fac8d541433a073e69463387d7e0cc3622288bf6a568'
RUNTIME = runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'), run_name='levels_package')
package_call = RUNTIME['package_call']


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(data):
    return sha256(data).hexdigest()


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data if isinstance(data, (bytes,bytearray)) else data.encode('utf-8'))


def dump(path, value):
    write(path, json.dumps(value, indent=2, ensure_ascii=False)+'\n')


def json_file(path):
    return json.loads(path.read_text(encoding='utf-8'))


def cells(spec, position):
    x,y = (v//128 for v in position[:2])
    w,h = spec['width'],spec['breadth']
    return {(a,b) for a in range(x-w//2,x-w//2+w) for b in range(y-h//2,y-h//2+h)}


def greenhaven_satellite(specs, baseline_bytes):
    directory = ROOT/'map/greenhaven-beginner'
    baseline = json.loads(baseline_bytes)
    value = json.loads(baseline_bytes)
    authored_objects=value['structures']+json_file(directory/'droid.json')['droids']+json_file(directory/'feature.json')['features']
    satellite = {'name':'A0Sat-linkCentre', 'id':max(s['id'] for s in authored_objects)+1,
                 'position':[52*128,73*128], 'rotation':0, 'startpos':0}
    occupied = set().union(*(cells(specs[s['name']],s['position']) for s in value['structures']))
    footprint = cells(specs[satellite['name']],satellite['position'])
    court = {(x+dx,y+dy) for x,y in footprint for dx in range(-3,4) for dy in range(-3,4)}
    data = (directory/'game.map').read_bytes()
    _,w,h = struct.unpack_from('<III',data,4)
    ttp = (directory/'ttypes.ttp').read_bytes()
    types = struct.unpack_from('<'+'H'*struct.unpack_from('<I',ttp,8)[0],ttp,12)
    floor = {(x,y) for y in range(h) for x in range(w)
             if types[struct.unpack_from('<H',data,16+4*(y*w+x))[0]&0x1ff] not in (7,8)}
    # Rear cliff is a protected border: only the footprint must be ground;
    # the three-tile clear court may terminate at the surrounding cliff.
    require(footprint<=floor and not court&occupied,'Greenhaven satellite conflicts with native base')
    value['structures'].append(satellite)
    require(value['structures'][:-1]==baseline['structures'],'Existing Greenhaven objects changed')
    dump(directory/'struct.json',value)
    authoring=json_file(directory/'AUTHORING.json')
    authoring['satellite019']={'name':satellite['name'],'tile':[52,73],'humanStartPosition':0,
                               'existingObjectsUnchanged':True,'clearanceFromOtherStructuresTiles':3,
                               'scope':'Source footprint/spacing only; no gameplay verification.'}
    dump(directory/'AUTHORING.json',authoring)
    return (directory/'struct.json').read_bytes()


def legacy_entries():
    return [
        dict(id='beginner',name='Greenhaven',difficulty='easy',description='A connected rear base and one broad winding approach. The original beginner level.',rounds=15,preparationSeconds=240,mapName='Greenhaven-T1',nativeFolder='greenhaven-beginner',tileset='arizona',humanPosition=0,northFacing=True,entryCount=1,sourceDirectory='map/greenhaven-beginner'),
        dict(id='td1',name='Dustfall',difficulty='hard',description='The original desert challenge: split starting facilities and demanding waves.',rounds=30,preparationSeconds=180,mapName='td1_v3-T1',nativeFolder='td1_v3',tileset='arizona',humanPosition=0,northFacing=True,entryCount=0,sourceDirectory='vendor/maps/td1-v3/map'),
        dict(id='td2',name='Iron Valley',difficulty='hard',description='The original industrial valley, with scattered facilities and several approaches.',rounds=30,preparationSeconds=180,mapName='TowerDefense2_m-T1',nativeFolder='2c-TowerDefense2_m',tileset='urban',humanPosition=1,northFacing=False,entryCount=0,sourceDirectory='vendor/survival/map/multiplay/maps/2c-TowerDefense2_m'),
    ]


def legacy_objects(directory, kind):
    path=directory/(kind+'.json')
    if path.is_file():
        return json_file(path)[{'struct':'structures','droid':'droids','feature':'features'}[kind]]
    ini=configparser.ConfigParser(interpolation=None)
    ini.read(directory/(kind+'.ini'),encoding='utf-8')
    objects=[]
    for section in ini.sections():
        item=dict(ini[section])
        item['position']=[int(v.strip()) for v in item['position'].split(',')][:2]
        item['startpos']=int(item.get('startpos',-1))
        objects.append(item)
    return objects


def render_legacy(entry,specs):
    directory=ROOT/entry['sourceDirectory']
    data=(directory/'game.map').read_bytes()
    version,w,h=struct.unpack_from('<III',data,4)
    require(version in (10,40),'Unsupported legacy preview native map format')
    ttp=(directory/'ttypes.ttp').read_bytes()
    types=struct.unpack_from('<'+'H'*struct.unpack_from('<I',ttp,8)[0],ttp,12)
    scale=4; margin=12; header=44; footer=48
    image=Image.new('RGB',(w*scale+margin*2,h*scale+header+footer),(13,25,27))
    draw=ImageDraw.Draw(image)
    draw.text((margin,8),entry['name']+' / '+entry['difficulty'].upper(),fill=(232,240,233))
    palette={8:(82,67,55),7:(42,73,87),6:(141,136,112),3:(106,124,80)}
    for y in range(h):
        for x in range(w):
            texture=struct.unpack_from('<H',data,16+(4 if version==40 else 3)*(y*w+x))[0]&0x1ff
            require(texture<len(types),'Legacy terrain texture exceeds TTP')
            color=palette.get(types[texture],(115,107,83))
            draw.rectangle((margin+x*scale,header+y*scale,margin+(x+1)*scale-1,header+(y+1)*scale-1),fill=color)
    human=entry['humanPosition']
    for item in legacy_objects(directory,'struct'):
        spec=specs.get(item['name'])
        if not spec:
            continue
        footprint=cells(spec,item['position']); xs,ys=zip(*footprint)
        mine=item['startpos']==human
        satellite=item['name']=='A0Sat-linkCentre' and mine
        color=(255,219,117) if satellite else (124,194,230) if mine else (225,106,85)
        draw.rectangle((margin+min(xs)*scale,header+min(ys)*scale,margin+(max(xs)+1)*scale-1,header+(max(ys)+1)*scale-1),fill=color)
    for item in legacy_objects(directory,'droid'):
        if item['startpos']!=human:
            continue
        x,y=(v//128 for v in item['position'])
        draw.ellipse((margin+x*scale,header+y*scale,margin+(x+1)*scale,header+(y+1)*scale),fill=(210,238,244))
    draw.text((margin,header+h*scale+8),'Blue: your base   Gold: uplink',fill=(205,222,219))
    draw.text((margin,header+h*scale+27),'Actual native map data preview',fill=(151,172,167))
    output=ASSETS/entry['preview'].removeprefix('warzone/')
    output.parent.mkdir(parents=True,exist_ok=True)
    image.save(output,optimize=True)
    entry['dimensions']=[w,h]


def profile(entry,number,template_prefix):
    difficulty=entry['difficulty']; rounds=entry['rounds']; variant=(number-8)/70
    if difficulty=='easy':
        totals=[10,15,18,20,22,24,26,28,30,32,34,36,39,42,45]
        pools=[['people'],['people','scavs'],['people','scavs','wheels'],['scavs','wheels','vipers'],['wheels','vipers','cobras']]
        delay,reward,wait_start,wait_end=900,1.25,180,140
    elif difficulty=='medium':
        totals=[22+round((i/(rounds-1))**1.15*70) for i in range(rounds)]
        pools=[['people','scavs'],['scavs','wheels','vipers'],['wheels','vipers','cobras'],['vipers','cobras','cybsT1'],['cobras','pythons','scorps','cybsT2']]
        delay,reward,wait_start,wait_end=600,1.15,150,120
    else:
        totals=[35+round((i/(rounds-1))**1.15*125) for i in range(rounds)]
        pools=[['scavs','wheels','vipers'],['vipers','cobras','cybsT1'],['cobras','pythons','scorps','cybsT2'],['pythons','panthers','tigers','cybsT3'],['nexus','seraph','wyvernH','dragonT','cybsT4']]
        delay,reward,wait_start,wait_end=360,1,130,100
    result=['// '+entry['name']+': isolated native Towers wave profile.',
            '// Authored difficulty; not gameplay/balance verified.',template_prefix,
            f'setResearchDelay({delay});',
            f'const wtBaseReward=defaultPowerRewardFunction();\nsetPowerRewardFunction(power => wtBaseReward(power)*{reward});']
    proof=[]
    for i,total in enumerate(totals):
        total=max(1,round(total*(1+variant)))
        stage=min(4,i*5//rounds); roster=list(pools[stage])
        # Rotate authored rosters by level: geometry, timing, composition and
        # volume differ while the selected difficulty remains bounded.
        shift=number%len(roster); roster=roster[shift:]+roster[:shift]
        count=[total//len(roster)+(1 if j<total%len(roster) else 0) for j in range(len(roster))]
        wait=entry['preparationSeconds'] if i==0 else round(wait_start+(wait_end-wait_start)*i/(rounds-1))+(number%3-1)*5
        commands=[f'wait({wait})',f'round({i+1})']+[f'spawn({n}, {pool})' for n,pool in zip(count,roster) if n]
        result.append(', '.join(commands)+';')
        proof.append({'wave':i+1,'waitSeconds':wait,'totalUnits':total,'pools':dict(zip(roster,count))})
    require(proof[0]['waitSeconds']==entry['preparationSeconds'] and len(proof)==entry['rounds'],'Wave metadata mismatch')
    return '\n'.join(result)+'\n',proof


def main():
    require(digest(BASELINE.read_bytes())==BASELINE_SHA,'Frozen 0.18 fallback APK changed')
    with ZipFile(BASELINE) as apk:
        old_js=apk.read('assets/warzone/warzone2100.js').decode('utf-8')
        old_data=apk.read('assets/warzone/warzone2100.data')
        wasm=apk.read('assets/warzone/warzone2100.wasm')
    begin,end,_,metadata=package_call(old_js)
    RUNTIME['verify_index'](metadata,old_data)
    rows={e['filename']:dict(e,start=int(e['start']),end=int(e['end'])) for e in metadata['files']}
    def old(path):
        item=rows[path]; return old_data[item['start']:item['end']]
    specs={b['id']:b for b in json_file(ASSETS/'command-catalog.json')['buildings']}
    additions={'/data/mp/tests/towers-config-router-018.js':old('/data/mp/config.js')}
    additions['/data/mp/multiplay/maps/greenhaven-beginner/struct.json']=greenhaven_satellite(specs,old('/data/mp/multiplay/maps/greenhaven-beginner/struct.json'))
    catalog=json_file(ASSETS/'levels/catalog.json')
    new=[e for e in catalog['levels'] if not e.get('legacy',False) and e['id'] not in ('td1','td2','beginner')]
    require(len(new)==43 and Counter(e['difficulty'] for e in new)=={'easy':15,'medium':15,'hard':13},'Expected 43 generated maps')
    legacy=legacy_entries()
    for entry in legacy:
        entry.update(legacy=True,preview='warzone/levels/previews/'+entry['id']+'.png',previewDescription='Actual native terrain and starting object data; not gameplay.')
        render_legacy(entry,specs)
    catalog['levels']=legacy+new
    dump(ASSETS/'levels/catalog.json',catalog)
    minimal={e['id']:{k:e[k] for k in ('rounds','preparationSeconds','northFacing')} for e in catalog['levels']}
    write(ASSETS/'levels/runtime.js','// Generated from levels/catalog.json.\nwindow.WarzoneLevelInfo = Object.freeze('+json.dumps(minimal,separators=(',',':'))+');\n')
    template_prefix=(ROOT/'vendor/tower-defense/mod/config.js').read_text(encoding='utf-8').split('setResearchDelay(360)',1)[0]
    router={}; registrations=[]; waves=[]
    for entry in new:
        number=int(entry['id'][-2:]); directory=ROOT/'map/levels'/entry['id']
        profile_js,wave_proof=profile(entry,number,template_prefix)
        config_path='tests/levels/'+entry['id']+'.js'; router[entry['mapName']]=config_path
        write(ROOT/'scenario/levels'/(entry['id']+'.js'),profile_js)
        additions['/data/mp/'+config_path]=profile_js.encode('utf-8')
        challenge=json_file(ROOT/'scenario/warzonetowers-beginner.json')
        challenge['challenge'].update(name='Warzone Towers: '+entry['name'],map=entry['mapName'],description=entry['description'])
        # Native AI difficulty remains Medium: the authored wave schedule,
        # routes and starting base set Towers difficulty, not skirmish AI.
        dump(ROOT/'scenario/levels'/(entry['id']+'.json'),challenge)
        additions['/data/mp/tests/towers-'+entry['id']+'.json']=(ROOT/'scenario/levels'/(entry['id']+'.json')).read_bytes()
        folder='/data/mp/multiplay/maps/'+entry['nativeFolder']
        for name in ('game.map','ttypes.ttp','struct.json','droid.json','feature.json','gam.json','level.json'):
            additions[folder+'/'+name]=(directory/name).read_bytes()
        additions[folder+'.gam']=(directory/'gam.json').read_bytes()
        registrations.append((directory/'level.lev').read_bytes())
        waves.append({'id':entry['id'],'difficulty':entry['difficulty'],'rounds':entry['rounds'],'waves':wave_proof})
    router_js='// Only the new native map names select new schedules. Original maps retain the exact 0.18 router.\nconst wtLevelConfigs='+json.dumps(router,separators=(',',':'))+';\nif (typeof mapName === "string" && Object.prototype.hasOwnProperty.call(wtLevelConfigs,mapName)) {\n  include(wtLevelConfigs[mapName]);\n} else {\n  include("tests/towers-config-router-018.js");\n}\n'
    write(ROOT/'scenario/levels/config-router.js',router_js)
    additions['/data/mp/config.js']=router_js.encode('utf-8')
    additions['/data/mp/addon.lev']=old('/data/mp/addon.lev')+b'\n'+b'\n'.join(registrations)
    dump(ROOT/'scenario/levels/WAVES.json',{'scope':'Authored native API schedule; no gameplay/balance test.','levels':waves})
    data=bytearray(old_data)
    for path,content in additions.items():
        offset=len(data);data.extend(content);rows[path]={'filename':path,'start':offset,'end':len(data)}
    generated=old_js[:begin]+'loadPackage('+json.dumps(dict(metadata,files=list(rows.values()),remote_package_size=len(data),package_uuid='warzone-towers-4.7.0-v1-'+str(len(data))),separators=(',',':'))+')'+old_js[end:]
    a,b,_,current_metadata=package_call(generated)
    normalized=old_js[:begin]+'PACKAGE'+old_js[end:]
    require(generated[:a]+'PACKAGE'+generated[b:]==normalized,'Compiled program body changed')
    require((ASSETS/'warzone2100.wasm').read_bytes()==wasm,'Compiled WASM changed')
    RUNTIME['verify_index'](current_metadata,data)
    changed=[]
    for row in metadata['files']:
        path=row['filename']; current=rows[path]
        if bytes(data[current['start']:current['end']])!=old_data[int(row['start']):int(row['end'])]: changed.append(path)
    expected={'/data/mp/config.js','/data/mp/addon.lev','/data/mp/multiplay/maps/greenhaven-beginner/struct.json'}
    require(set(changed)==expected,'Unexpected old VFS mutation: '+str(changed))
    write(ASSETS/'warzone2100.js',generated); write(ASSETS/'warzone2100.data',data)
    index=(ASSETS/'index.html').read_text(encoding='utf-8')
    directory_hook="        Module.FS_createPath('/data/mp/multiplay/maps', 'greenhaven-beginner', true, true);"
    directory_code="\n        // BEGIN TOWERS 0.19 LEVEL DIRECTORIES\n"+'\n'.join("        Module.FS_createPath('/data/mp/multiplay/maps', '"+e['nativeFolder']+"', true, true);" for e in new)+"\n        Module.FS_createPath('/data/mp', 'tests', true, true);\n        Module.FS_createPath('/data/mp/tests', 'levels', true, true);\n        // END TOWERS 0.19 LEVEL DIRECTORIES"
    import re
    index=re.sub(r'\n        // BEGIN TOWERS 0\.19 LEVEL DIRECTORIES.*?// END TOWERS 0\.19 LEVEL DIRECTORIES','',index,flags=re.S)
    require(directory_hook in index,'Native map directories hook missing')
    index=index.replace(directory_hook,directory_hook+directory_code,1)
    argument_hook="      if (towerMap === 'beginner' && !window.__warzoneDuelConfig) Module.arguments[Module.arguments.length - 1] = '--skirmish=warzonetowers-beginner.json';"
    argument_code="\n      // BEGIN TOWERS 0.19 LEVEL ARGUMENT\n      const newTowerLevels = "+json.dumps([e['id'] for e in new],separators=(',',':'))+";\n      if (!window.__warzoneDuelConfig && newTowerLevels.includes(towerMap)) Module.arguments[Module.arguments.length - 1] = '--skirmish=towers-' + towerMap + '.json';\n      // END TOWERS 0.19 LEVEL ARGUMENT"
    index=re.sub(r'\n      // BEGIN TOWERS 0\.19 LEVEL ARGUMENT.*?// END TOWERS 0\.19 LEVEL ARGUMENT','',index,flags=re.S)
    require(argument_hook in index,'Native map argument hook missing')
    index=index.replace(argument_hook,argument_hook+argument_code,1)
    runtime_tag='    <script src="levels/runtime.js"></script>\n'
    if runtime_tag not in index:
        index=index.replace('    <script src="graphics-loader.js"></script>',runtime_tag+'    <script src="graphics-loader.js"></script>',1)
    write(ASSETS/'index.html',index)
    proof={'scope':'Asset authoring and package integrity only; no native gameplay, pathfinding, balance, or gesture test.',
           'baselineAPK':str(BASELINE),'baselineSHA256':BASELINE_SHA,'newLevels':43,'totalLevels':46,
           'newDifficultyCounts':dict(Counter(e['difficulty'] for e in new)),
           'catalogDifficultyCounts':dict(Counter(e['difficulty'] for e in catalog['levels'])),
           'originalDataBytes':len(old_data),'originalDataSHA256':digest(old_data),
           'dataPrefixPreserved':bytes(data[:len(old_data)])==old_data,'normalizedEngineBodyUnchanged':True,
           'normalizedEngineBodySHA256':digest(normalized.encode('utf-8')),'wasmUnchanged':True,
           'changedVFSFiles':changed,'addedVFSFiles':sorted(set(rows)-{e['filename'] for e in metadata['files']}),
           'resolvedOriginalVFSFilesPreserved':len(metadata['files'])-len(changed),
           'outputs':[{'path':str(p.relative_to(ROOT)).replace('\\','/'),'sha256':digest(p.read_bytes()),'bytes':p.stat().st_size} for p in (ASSETS/'warzone2100.js',ASSETS/'warzone2100.data',ASSETS/'index.html',ASSETS/'levels/catalog.json')],
           'gameplayVerified':False,'difficultyPlaytested':False,'dragGestureTested':False}
    dump(ROOT/'archive/levels-0.19-package.json',proof)
    print(json.dumps({'packaged':True,'newLevels':43,'totalLevels':46,'dataBytes':len(data),'changedExistingVFS':changed,'newVFS':len(proof['addedVFSFiles']),'scope':proof['scope']}))


if __name__=='__main__':
    main()
