"""Append/reindex the 43 landscape remakes against the exact 0.19 delivery.

Only native map payloads, their registrations, catalog and previews are
authorized. This does not run an emulator, gameplay or a difficulty test.
The compiled engine body, WASM, original maps and all wave/rule/command files
must remain identical to 0.19. Run generate-levels-020.py before this tool.
"""
from pathlib import Path
from hashlib import file_digest, sha256
from zipfile import ZipFile
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT/'app/src/main/assets/warzone'
BASELINE = ROOT.parent/'Warzone-Towers-0.19.apk'
BASELINE_SHA = '5f658a22b3803498df72bd05fc33e458cd292ab973d06bc91e4a3355e117723c'
SOURCE = ROOT.parent/'warzone-towers-0.19-source.zip'
SOURCE_SHA = '54cee092d2cb36c12713487017226a53b2a845549cd85dfa997d8c7fc30a25df'
FILES = ('game.map','ttypes.ttp','struct.json','droid.json','feature.json','gam.json','level.json')
RUNTIME = runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'),run_name='map_art_020')


def require(value,message):
    if not value:
        raise RuntimeError(message)


def digest(data):
    return sha256(data).hexdigest()


def path_digest(path):
    with path.open('rb') as stream:
        return file_digest(stream,'sha256').hexdigest()


def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(data if isinstance(data,(bytes,bytearray)) else data.encode('utf-8'))


def dump(path,value):
    write(path,json.dumps(value,indent=2,ensure_ascii=False)+'\n')


def main():
    require(path_digest(BASELINE)==BASELINE_SHA,'Frozen 0.19 APK changed')
    require(path_digest(SOURCE)==SOURCE_SHA,'Frozen 0.19 source changed')
    with ZipFile(BASELINE) as old:
        old_js=old.read('assets/warzone/warzone2100.js').decode('utf-8')
        old_data=old.read('assets/warzone/warzone2100.data')
        old_catalog=json.loads(old.read('assets/warzone/levels/catalog.json'))
        wasm=old.read('assets/warzone/warzone2100.wasm')
    begin,end,_,metadata=RUNTIME['package_call'](old_js)
    RUNTIME['verify_index'](metadata,old_data)
    rows={row['filename']:dict(row,start=int(row['start']),end=int(row['end'])) for row in metadata['files']}
    def old(path):
        row=rows[path]
        return old_data[row['start']:row['end']]
    catalog=json.loads((ASSETS/'levels/catalog.json').read_text(encoding='utf-8'))
    before={entry['id']:entry for entry in old_catalog['levels']}
    after={entry['id']:entry for entry in catalog['levels']}
    require(len(catalog['levels'])==len(after)==46 and set(after)==set(before),'Catalog map IDs changed or duplicate')
    legacy={'td1','td2','beginner'}
    for key in legacy:
        require(after[key]==before[key],'Original catalog entry changed: '+key)
    new=[entry for entry in catalog['levels'] if entry['id'] not in legacy]
    require(len(new)==43,'Expected 43 map remakes')
    invariant=('name','difficulty','rounds','preparationSeconds','mapName','nativeFolder','humanPosition','northFacing','legacy','preview')
    additions={}; registrations=old('/data/mp/addon.lev'); details=[]
    with ZipFile(SOURCE) as source:
        for entry in new:
            level=entry['id']; directory=ROOT/'map/levels'/level
            require(all(entry.get(k)==before[level].get(k) for k in invariant),'Map launch/schedule contract changed: '+level)
            folder='/data/mp/multiplay/maps/'+entry['nativeFolder']
            source_hashes=[]
            for name in FILES:
                path=folder+'/'+name; content=(directory/name).read_bytes()
                require(path in rows,'Unexpected new VFS path: '+path)
                additions[path]=content
                source_hashes.append({'path':str((directory/name).relative_to(ROOT)).replace('\\','/'),'sha256':digest(content),'bytes':len(content)})
            require(additions[folder+'/game.map']!=old(folder+'/game.map'),'Map terrain was not remade: '+level)
            additions[folder+'.gam']=(directory/'gam.json').read_bytes()
            previous=source.read('map/levels/'+level+'/level.lev')
            replacement=(directory/'level.lev').read_bytes()
            require(registrations.count(previous)==1,'Native map registration not unique: '+level)
            registrations=registrations.replace(previous,replacement,1)
            preview=ROOT/'app/src/main/assets'/entry['preview']
            require(preview.is_file(),'Missing actual map preview: '+level)
            details.append({'id':level,'tileset':entry['tileset'],'nativeFolder':entry['nativeFolder'],'sources':source_hashes,'previewSHA256':path_digest(preview)})
    additions['/data/mp/addon.lev']=registrations
    data=bytearray(old_data)
    for path,content in additions.items():
        offset=len(data); data.extend(content)
        # Preserve any Emscripten row flags, replacing offsets only.
        rows[path]=dict(rows[path],start=offset,end=len(data))
    generated=old_js[:begin]+'loadPackage('+json.dumps(dict(metadata,files=list(rows.values()),remote_package_size=len(data),package_uuid='warzone-towers-4.7.0-v1-'+str(len(data))),separators=(',',':'))+')'+old_js[end:]
    a,b,_,current=RUNTIME['package_call'](generated)
    normalized=old_js[:begin]+'PACKAGE'+old_js[end:]
    require(generated[:a]+'PACKAGE'+generated[b:]==normalized,'Compiled engine body changed')
    require((ASSETS/'warzone2100.wasm').read_bytes()==wasm,'Compiled WASM changed')
    RUNTIME['verify_index'](current,data)
    changed=[]
    for entry in metadata['files']:
        path=entry['filename']; row=rows[path]
        if bytes(data[row['start']:row['end']])!=old_data[int(entry['start']):int(entry['end'])]:
            changed.append(path)
    allowed=set(additions)
    require(set(changed)<=allowed,'Unexpected native VFS replacement')
    require(all('/data/mp/multiplay/maps/'+e['nativeFolder']+'/game.map' in changed for e in new),'Terrain replacement absent')
    require(set(rows)=={e['filename'] for e in metadata['files']},'Native VFS file set changed')
    write(ASSETS/'warzone2100.js',generated); write(ASSETS/'warzone2100.data',data)
    proof={'scope':'43 native map landscape remakes and preview/catalog assets only. Source/integrity observations; no emulator or native gameplay tests.',
           'baselineAPK':str(BASELINE),'baselineSHA256':BASELINE_SHA,'baselineSourceZIP':str(SOURCE),'baselineSourceSHA256':SOURCE_SHA,
           'newLevels':0,'remadeLevels':43,'totalLevels':46,'addedVFSFiles':[],'changedVFSFiles':sorted(changed),'allowedVFSReplacements':sorted(allowed),
           'originalDataBytes':len(old_data),'originalDataSHA256':digest(old_data),'dataPrefixPreserved':data[:len(old_data)]==old_data,
           'normalizedEngineBodyUnchanged':True,'normalizedEngineBodySHA256':digest(normalized.encode('utf-8')),'wasmUnchanged':True,
           'unchangedResolvedVFSFiles':len(metadata['files'])-len(changed),'waveProfilesRulesAndCommandsUnchanged':True,
           'originalThreeNativeMapsUnchanged':True,'maps':details,'emulatorUsed':False,'gameplayVerified':False,'difficultyPlaytested':False,
           'outputs':[{'path':str(p.relative_to(ROOT)).replace('\\','/'),'sha256':path_digest(p),'bytes':p.stat().st_size} for p in (ASSETS/'warzone2100.js',ASSETS/'warzone2100.data',ASSETS/'levels/catalog.json')]}
    dump(ROOT/'archive/levels-0.20-package.json',proof)
    print(json.dumps({'remadeLevels':43,'catalogLevels':46,'dataBytes':len(data),'replacedVFSFiles':len(changed),'addedVFS':0,'compiledEngineUnchanged':True,'emulatorUsed':False}))


if __name__=='__main__':
    main()
