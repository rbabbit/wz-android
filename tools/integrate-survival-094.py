"""Build isolated EMAG Survival data with frozen0.93 native programs.

Only Towers receives the additive MoreFortress stats/models. Survival has its
own package, bootstrap, two-slot map variants and persistent config namespace.
The supplied60-round schedule is preserved; this is not a native engine build.
"""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
from io import BytesIO
from collections import Counter
from hashlib import sha256
import argparse
import configparser
import json
import re
import runpy
import struct
import os

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
SOURCE = ROOT / 'scenario/survival'
VENDOR = ROOT / 'vendor/survival-094'
ORIGINAL = VENDOR / 'original'
helpers = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='survival_package_helpers')
package_call = helpers['package_call']
SURVIVAL_HASH = 'aa510333b961b84fdd14d709b625a3b994e112ef2a125223aa15809bb8936b0f'
FORTRESS_HASH = '19d58e8d729387e11d431247fb6d5c24965b4814b7018a4bad3be3cc51b6b73b'
MAPS = [dict(id='tdn2', name='EMAG TDN2', level='Survival-TDN2-T1', archive='5c-EMAG-TDN2-', folder='5c-EMAG-TDN2'),
        dict(id='wave', name='EMAG Wave', level='Survival-Wave-T1', archive='5c-EMAG-Wave-', folder='5c-Nussub')]


def digest(data): return sha256(data).hexdigest()
def require(condition, message):
    if not condition: raise RuntimeError(message)


def write(path, value):
    """Atomic replacement also breaks retained frozen-media hardlinks."""
    data = value.encode('utf8') if isinstance(value, str) else value
    if path.is_file() and path.read_bytes() == data: return
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp094')
    temp.write_bytes(data)
    os.replace(temp, path)


def dump(path, value): write(path, json.dumps(value, indent=2, ensure_ascii=False) + '\n')
def compact(value): return json.dumps(value, separators=(',', ':'), ensure_ascii=False)
def replace_once(text, before, after):
    require(text.count(before) == 1, 'Integration anchor changed: ' + before[:100])
    return text.replace(before, after, 1)


def retain(source, name, expected):
    target = ORIGINAL / name
    if source:
        raw = source.read_bytes()
        require(digest(raw) == expected, 'Supplied archive identity changed: ' + str(source))
        if target.exists(): require(target.read_bytes() == raw, 'Retained original differs')
        else: write(target, raw)
    require(target.is_file() and digest(target.read_bytes()) == expected, 'Import retained original ' + name)
    return target.read_bytes()


def baseline():
    """Retain the original index/hash; rebuilds read only its frozen prefix."""
    manifest = VENDOR / 'towers-093-input.json'
    data = (ASSETS / 'warzone2100.data').read_bytes()
    if manifest.exists():
        proof = json.loads(manifest.read_text())
        data = data[:proof['bytes']]
        require(digest(data) == proof['sha256'], 'Frozen0.93 Towers data prefix changed')
    else:
        _, _, _, metadata = package_call((ASSETS / 'warzone2100-towers-052.js').read_text(encoding='utf8'))
        require(metadata['remote_package_size'] == len(data), 'Baseline package length differs')
        proof = dict(bytes=len(data), sha256=digest(data), metadata=metadata,
                     wasm={name:digest((ASSETS/name).read_bytes()) for name in ('warzone2100.wasm', 'warzone2100-towers-052.wasm')})
        dump(manifest, proof)
    for name, expected in proof['wasm'].items(): require(digest((ASSETS/name).read_bytes()) == expected, 'Frozen native WASM changed')
    return data, proof


class Package:
    def __init__(self, data, metadata):
        self.data = bytearray(data)
        self.metadata = dict(metadata)
        self.entries = {entry['filename']:dict(entry) for entry in metadata['files']}
        self.changes = []
    def read(self, path):
        item = self.entries[path]
        return bytes(self.data[item['start']:item['end']])
    def add(self, path, data):
        require(path.startswith('/') and '..' not in PurePosixPath(path).parts and '\\' not in path, 'Unsafe VFS path')
        data = data.encode('utf8') if isinstance(data, str) else data
        start = len(self.data)
        self.data.extend(data)
        self.entries[path] = dict(filename=path, start=start, end=len(self.data))
        self.changes.append(dict(path=path, sha256=digest(data), bytes=len(data)))
    def file(self, path, source): self.add(path, source.read_bytes())
    def index(self, prefix):
        return dict(self.metadata, files=list(self.entries.values()), remote_package_size=len(self.data), package_uuid=prefix+digest(self.data))


def add_fortress(package, raw):
    archive = ZipFile(BytesIO(raw))
    proof = {'source':'vendor/survival-094/original/MoreFortress-v0.6.wz', 'sha256':digest(raw), 'researchImported':False, 'stats':{}, 'files':[]}
    for kind in ('structure', 'weapons'):
        supplied = archive.read('diffs/MoreFort/stats/' + kind + '.json')
        additions = json.loads(supplied)
        original = json.loads(package.read('/data/mp/stats/' + kind + '.json'))
        require(not set(additions).intersection(original), 'MoreFortress IDs collide with baseline')
        original.update(additions)
        package.add('/data/mp/stats/' + kind + '.json', compact(original))
        write(SOURCE / 'morefortress' / (kind + '.json'), supplied)
        proof['stats'][kind] = sorted(additions)
    for name in sorted(archive.namelist()):
        if name.endswith('/') or name.startswith('diffs/'): continue
        require(name.endswith('.pie') and name.split('/')[0] in ('components','structs','effects'), 'Unexpected MoreFortress asset')
        content = archive.read(name)
        package.add('/data/mp/' + name, content)
        write(SOURCE / 'morefortress' / name, content)
        proof['files'].append(dict(path=name, sha256=digest(content)))
    # There is deliberately no stats/research.json override or diff directory.
    require(not any('research' in item['path'] for item in package.changes), 'Research must remain stock')
    return proof


def ini_rows(raw):
    parser = configparser.ConfigParser(interpolation=None)
    parser.read_string(raw.decode('utf8-sig'))
    return parser


def filtered_ini(raw):
    parser = ini_rows(raw)
    kept, removed = [], []
    # Preserve all selected section text/fields verbatim; only unused positions
    # 2..4 are removed. native_objects normalizes corner1→start0, center0→start1.
    blocks = re.findall(r'(?ms)^\[[^\]]+\].*?(?=^\[|\Z)', raw.decode('utf8-sig'))
    result = []
    for block in blocks:
        section = re.match(r'\[([^\]]+)\]', block)[1]
        player = parser[section].getint('startpos', fallback=-1)
        if player in (0, 1): result.append(block); kept.append(dict(parser[section]))
        else: removed.append(dict(parser[section]))
    require(len(result)+len(removed) == len(parser.sections()), 'Map INI section loss')
    return ''.join(result).encode('utf8'), kept, removed


def native_objects(raw, kind):
    """The retained engine accepts JSON/BJO, not legacy editor INI files."""
    parser=ini_rows(raw)
    values=[]
    for section in parser.sections():
        row=dict(parser[section])
        allowed={'id','name' if kind!='droid' else 'template','position','rotation','startpos','modules'}
        require(set(row)<=allowed,'Unexpected source map object fields')
        position=[int(x.strip()) for x in row['position'].split(',')]
        rotation=[int(x.strip()) for x in row['rotation'].split(',')]
        require(len(position)==3 and position[2]==0 and len(rotation)==3 and rotation[1:]==[0,0], 'Source object has unsupported nonplanar transform')
        item={('template' if kind=='droid' else 'name'):row['template' if kind=='droid' else 'name'],
              'id':int(row['id']),'position':position[:2],'rotation':rotation[0]}
        if 'startpos' in row:
            original_start=int(row['startpos'])
            require(original_start in (0,1),'Unexpected unfiltered start position')
            item['startpos']=1-original_start
        if 'modules' in row:item['modules']=int(row['modules'])
        values.append(item)
    return {'version':2,{'structure':'structures','droid':'droids','feature':'features'}[kind]:values}


def draw_preview(map_data, ttypes, structures, features, target):
    from PIL import Image, ImageDraw
    version, width, height = struct.unpack_from('<III', map_data, 4)
    require(version == 10 and (width,height) == (128,128), 'Unexpected Survival terrain format')
    count = struct.unpack_from('<I', ttypes, 8)[0]
    terrain = struct.unpack_from('<' + 'H'*count, ttypes, 12)
    textures = [struct.unpack_from('<H', map_data, 16+i*3)[0] & 0x1ff for i in range(width*height)]
    heights = [map_data[18+i*3]*2 for i in range(width*height)]
    palette = {0:(155,130,86),1:(132,117,81),2:(156,130,92),3:(117,107,73),4:(145,113,87),5:(153,113,95),6:(176,155,113),7:(47,104,129),8:(88,83,74),9:(122,112,100),10:(150,170,175),11:(104,138,145)}
    pixels=[]
    for y in range(height):
        for x in range(width):
            i=y*width+x
            light=max(.65,min(1.3,1+(heights[i]-heights[y*width+max(0,x-1)])*.002-(heights[i]-heights[max(0,y-1)*width+x])*.002))
            pixels.append(tuple(max(0,min(255,round(c*light))) for c in palette.get(terrain[textures[i]],(120,120,110))))
    image=Image.new('RGB',(width,height)); image.putdata(pixels)
    image=image.resize((512,512),Image.Resampling.NEAREST); draw=ImageDraw.Draw(image)
    def pos(row): return [int(x.strip())/128*4 for x in row['position'].split(',')[:2]]
    oils={tuple(pos(row)) for row in features if row['name']=='OilResource'}
    for row in structures:
        x,y=pos(row)
        if row['name']=='A0ResourceExtractor': oils.add((x,y))
        if row['startpos']=='1': draw.rectangle((x-2,y-2,x+2,y+2),fill=(140,187,179))
    for x,y in oils: draw.ellipse((x-1.4,y-1.4,x+1.4,y+1.4),fill=(218,181,82))
    hq=next(row for row in structures if row['startpos']=='1' and row['name']=='A0CommandCentre')
    x,y=pos(hq);draw.ellipse((x-9,y-9,x+9,y+9),fill=(74,165,112),outline=(245,245,235),width=2)
    output=BytesIO();image.save(output,format='PNG');write(target,output.getvalue())


def add_maps(package, raw):
    outer=ZipFile(BytesIO(raw)); maps=[]
    addon=package.read('/data/mp/addon.lev')
    for spec in MAPS:
        name=next(name for name in outer.namelist() if name.split('/')[-1].startswith(spec['archive']))
        map_raw=outer.read(name); archive=ZipFile(BytesIO(map_raw))
        prefix='multiplay/maps/'+spec['folder']; virtual='/data/mp/multiplay/maps/survival-'+spec['id']
        folder=SOURCE/'maps'/spec['id']; mapping=[]; rows={}
        for basename in ('game.map','ttypes.ttp','feature.ini','droid.ini','struct.ini'):
            content=archive.read(prefix+'/'+basename)
            if basename in ('droid.ini','struct.ini'):
                content, kept, removed=filtered_ini(content); rows[basename]=(kept,removed)
            write(folder/basename,content)
            if basename.endswith('.ini'):
                kind={'struct.ini':'structure','droid.ini':'droid','feature.ini':'feature'}[basename]
                native_name=basename.replace('.ini','.json')
                converted=compact(native_objects(content,kind))
                write(folder/native_name,converted);package.add(virtual+'/'+native_name,converted)
                mapping.append(dict(file=native_name,sha256=digest(converted.encode()),sourceINI=basename,sourceINISHA256=digest(content)))
            else:
                package.add(virtual+'/'+basename,content)
                mapping.append(dict(file=basename,sha256=digest(content)))
        gam=archive.read(prefix+'.gam');write(folder/'game.gam',gam);package.add(virtual+'.gam',gam)
        descriptor='// Isolated single-player EMAG Survival variant; original retained.\nlevel '+spec['level']+'\nplayers 2\ntype 14\ndataset MULTI_CAM_1\ngame "multiplay/maps/survival-'+spec['id']+'.gam"\n'
        write(folder/'level.lev',descriptor); addon+=b'\n'+descriptor.encode()
        challenge={'challenge':{'bases':3,'description':'Protect your command centre through 60 waves. Earn Power from destroyed attackers.',
            'difficulty':'Medium','map':spec['level'],'maxPlayers':2,'name':'Survival - '+spec['name'],'alliances':0,'powerLevel':1,'scavengers':0,'techLevel':1,'version':2},
            'locked':{key:True for key in ('ai','alliances','bases','difficulty','position','power','scavengers','teams')},
            'player_0':{'name':'Commander','position':0,'team':0},
            'player_1':{'ai':'multiplay/skirmish/survival-enemy.js','difficulty':'Medium','name':'Survival','position':1,'team':1}}
        for unused in (2,3,4): challenge['player_'+str(unused)]={'closed':True,'position':unused}
        dump(SOURCE/('survival-'+spec['id']+'.json'),challenge)
        package.add('/data/mp/tests/survival-'+spec['id']+'.json',compact(challenge))
        counts=Counter(row['name'] for row in rows['struct.ini'][0] if row['startpos']=='1')
        hq=next(row for row in rows['struct.ini'][0] if row['startpos']=='1' and row['name']=='A0CommandCentre')
        preview=ASSETS/'survival/previews'/(spec['id']+'.png')
        draw_preview(archive.read(prefix+'/game.map'),archive.read(prefix+'/ttypes.ttp'),rows['struct.ini'][0],list(ini_rows(archive.read(prefix+'/feature.ini')).values())[1:],preview)
        maps.append(dict(spec,sourceEntry=name,sourceSHA256=digest(map_raw),width=128,height=128,players=2,rounds=60,prepSeconds=240,
            nativeObjects='Version2 JSON converted from INI; startpos0/1 swapped, geometry/IDs/modules preserved; unused positions2–4 and binary duplicates omitted',humanNativePlayer=0,humanStartPosition=0,originalHumanStartPosition=1,enemyNativePlayer=1,enemyStartPosition=1,originalEnemyStartPosition=0,
            humanStructures=dict(counts),humanTrucks=sum(row['startpos']=='1' for row in rows['droid.ini'][0]),humanHQ=hq,
            removedStructures=len(rows['struct.ini'][1]),removedDroids=len(rows['droid.ini'][1]),terrainByteIdentical=True,mappings=mapping,
            preview=preview.relative_to(ASSETS).as_posix(),previewMethod='Actual tile types/heights, oil and human start; map overview, not gameplay screenshot'))
    package.add('/data/mp/addon.lev',addon)
    # The supplied Wave map has ten generators. Raise only its family profile's
    # authored initial-object ceiling, before native map objects are parsed.
    structures=json.loads(package.read('/data/mp/stats/structure.json'))
    raised={}
    for spec in maps:
        for key,count in spec['humanStructures'].items():
            limits=structures[key].get('userLimits')
            if limits and count>limits[1]:
                raised[key]=max(count,raised.get(key,0));limits[1]=count;limits[2]=max(limits[2],count)
    package.add('/data/mp/stats/structure.json',compact(structures))
    dump(SOURCE/'maps.json',dict(version=94,maps=maps,authoredStructureLimits=raised))
    return maps


def add_scripts(package, raw):
    outer=ZipFile(BytesIO(raw)); mod=ZipFile(BytesIO(outer.read(next(name for name in outer.namelist() if name.endswith('emag td.zip')))))
    for name in mod.namelist():
        if name.endswith('/'):continue
        content=mod.read(name)
        write(SOURCE/'supplied'/name,content)
        # Mod research.json is never present; incoming scripts contain the
        # original time-based enemy research policy, not MoreFortress unlocks.
        virtual='/data/mp/'+name
        package.add(virtual,content)
    config=mod.read('config.js')
    # includeJSON/config.js resolution can be relative to the calling rules
    # directory or mp root. Supply the same authored config in both locations.
    package.add('/data/mp/multiplay/script/rules/config.js',config)
    package.add('/data/mp/multiplay/script/mods/config.js',config)
    # The accepted phone adapter replaces only the round console line with its
    # existing native notice packet; action/RNG/timing semantics stay supplied.
    package.file('/data/mp/multiplay/script/mods/configReader.js',ROOT/'scenario/warzone-towers-config-reader.js')
    # Existing mobile UI adapters observe the supplied scheduler; there is one
    # next()/processRound()/processSpawn() chain, never a second wave timer.
    for name in ('warzone-towers-waves.js','warzone-towers-objective.js','warzone-towers-bridge.js','warzone-towers-commands.js','warzone-towers-rewards.js'):
        content=(ROOT/'scenario'/name).read_text(encoding='utf8')
        if name=='warzone-towers-waves.js':
            content=replace_once(content,'version:4, mode:"tower-defense", gameTime:gameTime,',
                'version:4, mode:"survival", profile:"survival", map:survivalConfig.map, mapName:survivalConfig.mapName, nativeLevel:survivalConfig.level, gameTime:gameTime,')
            write(SOURCE/'waves.js',content)
        if name=='warzone-towers-bridge.js':
            content=replace_once(content,'version:2, mode:"tower-defense", gameTime:gameTime,',
                'version:2, mode:"survival", map:survivalConfig.map, nativeLevel:survivalConfig.level, gameTime:gameTime,')
            write(SOURCE/'research-bridge.js',content)
        package.add('/data/mp/tests/'+name,content)
    for name in ('warzone-towers-catalog.json','warzone-towers-command.json','warzone-towers-control-command.json','warzone-towers-wave-command.json','blocknight-queue-command.json','blocknight-zoom-command.json'):
        for folder in ('/data/mp/tests/','/data/mp/multiplay/script/rules/'):
            package.file(folder+name,ROOT/'scenario'/name)
    for folder in ('/data/mp/tests/','/data/mp/multiplay/script/','/data/mp/multiplay/script/rules/'):
        package.add(folder+'survival-config.json',compact(dict(mode='survival',map='tdn2',mapName='EMAG TDN2',level='Survival-TDN2-T1',player=0,enemyPlayer=1,players=2)))
    package.file('/data/mp/multiplay/script/rules/init.js',SOURCE/'rules.js')
    package.file('/data/mp/tests/survival-policy.js',SOURCE/'policy.js')
    package.file('/data/mp/multiplay/skirmish/survival-enemy.js',SOURCE/'enemy.js')
    package.file('/data/mp/multiplay/skirmish/survival-enemy.json',SOURCE/'enemy.json')
    # Keep startup briefings in the native setup page, not a stock console wall.
    package.add('/data/mp/multiplay/script/rules/printsettings.js','function printGameSettings() {}\n')


def reward_context(package, survival=False):
    levels=json.loads((ASSETS/'levels/catalog.json').read_text(encoding='utf8'))['levels']
    contexts={row['mapName']:{'profile':'towers','map':row['id']} for row in levels}
    contexts.update({row['level']:{'profile':'survival','map':row['id']} for row in MAPS})
    content=(SOURCE/'reward-context.js').read_bytes()
    for folder in ('/data/mp/tests/','/data/mp/multiplay/script/rules/'):
        package.add(folder+'reward-context-094.json',compact(contexts))
    package.add('/data/mp/tests/reward-context-094.js',content)
    if not survival:
        rules=package.read('/data/mp/multiplay/script/rules/init.js').decode('utf8')
        rules=replace_once(rules,'include("tests/warzone-towers-rewards.js");',
            'include("tests/reward-context-094.js");\ninclude("tests/warzone-towers-rewards.js");')
        write(SOURCE/'towers-rules-094.js',rules)
        package.add('/data/mp/multiplay/script/rules/init.js',rules)
        package.add('/data/mp/tests/warzone-towers-rules.js',rules)


def loader(script, package, name):
    begin,end,_,_=package_call(script)
    generated=script[:begin]+'loadPackage('+compact(package.index(name+'-'))+')'+script[end:]
    if name=='survival':
        generated=replace_once(generated,'var REMOTE_PACKAGE_BASE="warzone2100.data";','var REMOTE_PACKAGE_BASE="warzone2100-survival.data";')
    # Add only missing VFS directory declarations inside the generated preloader,
    # immediately before its existing original directory declarations.
    dirs={str(PurePosixPath(entry).parent) for entry in package.entries}
    all_dirs=set()
    for directory in dirs:
        all_dirs.update(str(p) for p in [PurePosixPath(directory),*PurePosixPath(directory).parents] if str(p)!='/')
    calls=[]
    for directory in sorted(all_dirs,key=lambda p:(p.count('/'),p)):
        parent,leaf=str(PurePosixPath(directory).parent),PurePosixPath(directory).name
        call='Module["FS_createPath"]('+compact(parent)+','+compact(leaf)+',true,true);'
        if call not in script:calls.append(call)
    anchor='function runWithFS(Module){function assert(check,msg){if(!check)throw msg+(new Error).stack}'
    generated=replace_once(generated,anchor,anchor+''.join(calls))
    # Prove no compiled program mutation: index, isolated data filename and
    # directory creation are the only transformations.
    a,b,_,metadata=package_call(generated)
    normalized=generated[:a]+'PACKAGE'+generated[b:]
    if calls: normalized=normalized.replace(anchor+''.join(calls),anchor,1)
    if name=='survival':normalized=normalized.replace('var REMOTE_PACKAGE_BASE="warzone2100-survival.data";','var REMOTE_PACKAGE_BASE="warzone2100.data";',1)
    require(normalized==script[:begin]+'PACKAGE'+script[end:],'Compiled runtime changed outside package adapters')
    require(metadata['remote_package_size']==len(package.data),'Generated metadata length differs')
    return generated


def generate_html(maps):
    public=[{key:row[key] for key in ('id','name','level','rounds','prepSeconds','preview','width','height')} for row in maps]
    config='''\n<script>
const survivalMaps=SURVIVAL_MAPS;
const survivalRequestedMap=new URLSearchParams(location.search).get('map');
const survivalMap=survivalMaps.find(value=>value.id===survivalRequestedMap);
if(!survivalMap)throw Error('Unknown Survival map.');
window.__warzoneSurvivalConfig=Object.freeze({mode:'survival',profile:'survival',map:survivalMap.id,mapName:survivalMap.name,level:survivalMap.level,player:0,enemyPlayer:1,players:2});
window.__warzoneSurvivalMaps=survivalMaps;
</script>\n'''.replace('SURVIVAL_MAPS',compact(public))
    index=(ASSETS/'index.html').read_text(encoding='utf8')
    index=replace_once(index,'  <head>','  <head>'+config)
    index=replace_once(index,"return '/warzone2100' + WZ_CONFIG_DIR_SUFFIX;","return '/warzone2100-survival-' + survivalMap.id + WZ_CONFIG_DIR_SUFFIX;")
    start=index.index("      const towerMap = new URLSearchParams(location.search).get('map');")
    end=index.index('      // END TOWERS 0.19 LEVEL ARGUMENT',start)+len('      // END TOWERS 0.19 LEVEL ARGUMENT')
    index=index[:start]+"      Module.arguments.push('--skirmish=survival-' + survivalMap.id + '.json');"+index[end:]
    index=replace_once(index,'src="warzone2100-towers-052.js"','src="warzone2100-survival.js"')
    prepare=(SOURCE/'runtime-prepare.js').read_text(encoding='utf8')
    index=replace_once(index,'    function constructWZModuleConfig(additional_command_line_args) {',prepare+'\n    function constructWZModuleConfig(additional_command_line_args) {')
    index=replace_once(index,'      return Module;','      prepareSurvivalModule(Module, window.__warzoneSurvivalConfig);\n      return Module;')
    write(ASSETS/'index-survival.html',index)
    mobile=(ASSETS/'mobile.html').read_text(encoding='utf8')
    mobile=replace_once(mobile,'<head>','<head>'+config)
    mobile=replace_once(mobile,'"index.html" + location.search','"index-survival.html" + location.search')
    write(ASSETS/'mobile-survival.html',mobile)
    dump(ASSETS/'survival/maps.json',dict(version=94,maps=public))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--import-survival',type=Path)
    parser.add_argument('--import-fortress',type=Path)
    args=parser.parse_args()
    supplied=retain(args.import_survival,'emag-survival.zip',SURVIVAL_HASH)
    fortress=retain(args.import_fortress,'MoreFortress-v0.6.wz',FORTRESS_HASH)
    data,proof=baseline()
    protected={path.relative_to(ROOT).as_posix():digest(path.read_bytes()) for path in ASSETS.glob('warzone2100*') if path.suffix=='.wasm' or any(mode in path.name for mode in ('campaign','ffa','duel'))}
    towers=Package(data,proof['metadata']);fortress_proof=add_fortress(towers,fortress)
    # Reward agent owns these current sources; package their latest bytes without
    # rewriting them. Other Waves scripts/data entries remain byte-identical.
    for name in ('warzone-towers-rewards.js','warzone-towers-catalog.json'):
        for folder in ('/data/mp/tests/','/data/mp/multiplay/script/rules/'):
            if folder+name in towers.entries:towers.file(folder+name,ROOT/'scenario'/name)
    # Latest reward gate hooks in shared commands are owned by the reward agent.
    towers.file('/data/mp/tests/warzone-towers-commands.js',ROOT/'scenario/warzone-towers-commands.js')
    towers.file('/data/mp/tests/warzone-towers-bridge.js',ROOT/'scenario/warzone-towers-bridge.js')
    reward_context(towers)
    for name in ('warzone2100.js','warzone2100-towers-052.js'):
        # Strip our prior generated extra dirs on a rebuild by deriving the
        # original loader from its first-build retained text.
        original=VENDOR/'loader-inputs'/name
        if not original.exists():write(original,(ASSETS/name).read_bytes())
        write(ASSETS/name,loader(original.read_text(encoding='utf8'),towers,'towers'))
    write(ASSETS/'warzone2100.data',bytes(towers.data))
    survival=Package(bytes(towers.data),towers.index('towers-'))
    add_scripts(survival,supplied);maps=add_maps(survival,supplied);reward_context(survival,True)
    original=(VENDOR/'loader-inputs/warzone2100-towers-052.js').read_text(encoding='utf8')
    write(ASSETS/'warzone2100-survival.js',loader(original,survival,'survival'))
    write(ASSETS/'warzone2100-survival.data',bytes(survival.data))
    generate_html(maps)
    for relative,expected in protected.items(): require(digest((ROOT/relative).read_bytes())==expected,'Unrelated mode/native WASM changed: '+relative)
    native_research='/data/mp/stats/research.json'
    original_package=Package(data,proof['metadata'])
    require(towers.read(native_research)==survival.read(native_research)==original_package.read(native_research),'MoreFortress research leaked')
    report=dict(version=94,noNativeBuild=True,frozenWASM=proof['wasm'],preservedOtherModeNativeFiles=protected,
        suppliedSurvival=dict(source='vendor/survival-094/original/emag-survival.zip',sha256=SURVIVAL_HASH),moreFortress=fortress_proof,
        mapProfiles=maps,oneSuppliedScheduler=True,firstWaitSeconds=240,rounds=60,verificationScope='Static package/syntax/early configuration; gameplay early-game checks are separate, later waves deliberately untested',
        towersOverrides=towers.changes,survivalOverrides=survival.changes,
        outputs=[dict(path=p.relative_to(ROOT).as_posix(),bytes=p.stat().st_size,sha256=digest(p.read_bytes())) for p in
            [ASSETS/name for name in ('warzone2100.data','warzone2100.js','warzone2100-towers-052.js','warzone2100-survival.js','warzone2100-survival.data','index-survival.html','mobile-survival.html')]])
    dump(SOURCE/'PACKAGE.json',report)
    print(json.dumps(dict(passed=True,rounds=60,firstWaitSeconds=240,outputs=report['outputs'],frozenWASM=proof['wasm']),indent=2))


if __name__=='__main__':main()
