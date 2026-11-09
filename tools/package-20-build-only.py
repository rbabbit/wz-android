"""Package 0.20 after source/map-art review and an Android build, without emulator tests.

These are archive/source/native-package integrity checks. They do not establish
gameplay, pathfinding, beauty in the engine, difficulty balance or UI operation.
The complete working source is archived; Git objects and caches are excluded.
"""
from pathlib import Path
from hashlib import file_digest, sha256
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from datetime import datetime, timezone
from collections import Counter
import argparse
import json
import math
import os
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASELINE_SHA = '5f658a22b3803498df72bd05fc33e458cd292ab973d06bc91e4a3355e117723c'
PAYLOAD = 'assets/warzone/'
MAP_FILES = ('droid.json', 'feature.json', 'gam.json', 'game.map', 'level.json', 'struct.json', 'ttypes.ttp')
STORED = {'.gz', '.xz', '.zst', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.ogg', '.mp3', '.wasm', '.data', '.woff2'}
SKIP = {'.git', '.gradle', '.kotlin', '.idea', 'build', 'node_modules', '__pycache__',
        '.pytest_cache', '.mypy_cache', '.ruff_cache', '.cache', '.venv', 'venv', 'dist'}
TRANSIENT = {'qa/0.19-home/latest-ui.xml'}
PRIVATE_SUFFIXES = {'.jks', '.keystore', '.pyc', '.pem', '.p12', '.pfx'}
NATIVE_SOURCE = 'archive/native-blueprint-4.7.0-source.tar.gz'
MANIFEST = 'archive/repository-files.json'
RECORD = 'archive/release-0.20-build-only.json'
package_call = runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'), run_name='release20_packaging')['package_call']


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def zip_digest(archive, name):
    with archive.open(name) as stream:
        return file_digest(stream, 'sha256').hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')


def repo_path(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT), 'Source/evidence path is outside the repository: '+str(path))
    return path.relative_to(ROOT).as_posix()


def levels():
    return [(f'{group}{number:02d}', group, f'wt-{letter}{number:02d}', f'WT-{letter.upper()}{number:02d}-T1')
            for group, letter, count in (('easy', 'e', 15), ('medium', 'm', 15), ('hard', 'h', 13))
            for number in range(1, count+1)]


def inventories():
    sources = {}
    for level, _, folder, _ in levels():
        for name in MAP_FILES:
            sources['/data/mp/multiplay/maps/'+folder+'/'+name] = 'map/levels/'+level+'/'+name
        sources['/data/mp/multiplay/maps/'+folder+'.gam'] = 'map/levels/'+level+'/gam.json'
    changed_assets = {PAYLOAD+'warzone2100.js', PAYLOAD+'warzone2100.data', PAYLOAD+'levels/catalog.json'}
    changed_assets.update(PAYLOAD+'levels/previews/'+level+'.png' for level,_,_,_ in levels())
    vfs_allowed = set(sources)|{'/data/mp/addon.lev'}
    required = set(sources.values()) | {NATIVE_SOURCE, 'tools/generate-levels-020.py',
        'tools/build-levels-020.py', 'tools/package-20-build-only.py', 'docs/releases/0.20-map-art.md',
        'README.md', 'AGENTS.md', 'map/levels/GENERATION.json', 'map/levels/README.md',
        'app/src/main/java/com/rbabbit/blocknight/warzone/MapPreviewPager.java'}
    required.update('map/levels/'+level+'/'+name for level,_,_,_ in levels() for name in ('AUTHORING.json','level.lev'))
    required.update('app/src/main/'+name for name in changed_assets)
    return sources, changed_assets, vfs_allowed, required


def verify_catalog(old, apk):
    old_catalog = json.loads(old.read(PAYLOAD+'levels/catalog.json'))
    current = json.loads(apk.read(PAYLOAD+'levels/catalog.json'))
    require(current.get('schemaVersion') == 1, 'Unsupported native map catalog')
    entries = current['levels']; by_id = {e['id']:e for e in entries}
    before = {e['id']:e for e in old_catalog['levels']}
    require(len(entries) == len(by_id) == 46 and set(by_id) == set(before), 'Catalog ID inventory differs')
    require(Counter(e['difficulty'] for e in entries) == {'easy':16,'medium':15,'hard':15}, 'Difficulty counts changed')
    for level in ('beginner','td1','td2'):
        require(by_id[level] == before[level], 'Original map catalog entry changed: '+level)
    for level, group, folder, native_name in levels():
        entry, previous = by_id[level], before[level]
        for key in ('id','name','difficulty','rounds','preparationSeconds','mapName','nativeFolder',
                    'humanPosition','northFacing','legacy','preview'):
            require(entry[key] == previous[key], 'Preserved level identity/launch field changed: '+level+'/'+key)
        require(entry['difficulty']==group and entry['nativeFolder']==folder and entry['mapName']==native_name,
                'Native routing changed: '+level)
        require(entry['tileset'] in ('arizona','urban','rockies'), 'Unsupported native tileset: '+level)
    return {'remadeLevels':43,'totalLevels':46,'newDifficultyCounts':{'easy':15,'medium':15,'hard':13},
            'catalogDifficultyCounts':{'easy':16,'medium':15,'hard':15},
            'nativeTilesets':dict(Counter(by_id[level]['tileset'] for level,_,_,_ in levels()))}


def payload_integrity(old, apk, proof, source_paths, allowed, old_source):
    old_js, js = (archive.read(PAYLOAD+'warzone2100.js').decode('utf-8') for archive in (old,apk))
    a,b,_,before_meta = package_call(old_js); c,d,_,after_meta = package_call(js)
    normalized = old_js[:a]+'PACKAGE'+old_js[b:]
    require(js[:c]+'PACKAGE'+js[d:] == normalized, 'Compiled program changed outside package metadata')
    ignored = {'files','remote_package_size','package_uuid'}
    require({k:v for k,v in before_meta.items() if k not in ignored} == {k:v for k,v in after_meta.items() if k not in ignored}, 'Non-index package metadata changed')
    require(sha256(normalized.encode()).hexdigest() == proof['normalizedEngineBodySHA256'], 'Engine normalization proof differs')
    require(zip_digest(old,PAYLOAD+'warzone2100.wasm') == zip_digest(apk,PAYLOAD+'warzone2100.wasm'), 'Frozen WASM changed')
    old_data, data = old.read(PAYLOAD+'warzone2100.data'), apk.read(PAYLOAD+'warzone2100.data')
    require(len(data)>len(old_data) and data.startswith(old_data), 'Complete 0.19 data prefix changed or append absent')
    require(len(old_data)==proof['originalDataBytes'] and sha256(old_data).hexdigest()==proof['originalDataSHA256'], 'Baseline data proof differs')
    require(after_meta['remote_package_size']==len(data) and after_meta['package_uuid']=='warzone-towers-4.7.0-v1-'+str(len(data)), 'Package length/UUID differs')
    def index(metadata, length):
        result = {}
        for raw in metadata['files']:
            row = dict(raw); name,start,end = row['filename'],row['start'],row['end']
            integral = lambda value: type(value) in (int,float) and math.isfinite(value) and value==int(value)
            require(isinstance(name,str) and name.startswith('/') and name not in result
                    and integral(start) and integral(end) and 0<=start<=end<=length, 'Invalid/duplicate VFS entry: '+str(name))
            row['start'],row['end'] = int(start),int(end); result[name] = row
        return result
    before, after = index(before_meta,len(old_data)),index(after_meta,len(data))
    require(set(before)==set(after) and not proof['addedVFSFiles'], 'VFS inventory additions/removals are unauthorized')
    def content(rows,payload,name):
        row=rows[name]; return payload[row['start']:row['end']]
    changed=[]
    for name,row in before.items():
        current=after[name]
        require({k:v for k,v in row.items() if k not in {'start','end'}} == {k:v for k,v in current.items() if k not in {'start','end'}}, 'VFS flags changed: '+name)
        if content(before,old_data,name)!=content(after,data,name): changed.append(name)
    require(set(changed)==set(proof['changedVFSFiles']) and set(changed)<=allowed, 'Map-only VFS replacement scope differs')
    require({'/data/mp/multiplay/maps/'+folder+'/game.map' for _,_,folder,_ in levels()}<=set(changed), 'Not all43 native maps were remade')
    for name,path in source_paths.items():
        require(content(after,data,name)==(ROOT/path).read_bytes(), 'Native package differs from source: '+path)
    registration=content(after,data,'/data/mp/addon.lev')
    before_registration=content(before,old_data,'/data/mp/addon.lev')
    # Replace the exact43 old source stanzas; every other registration byte,
    # including all3 original maps, must remain unchanged.
    expected_registration=before_registration
    with ZipFile(old_source) as previous:
        for level,_,_,_ in levels():
            old_block=previous.read('map/levels/'+level+'/level.lev')
            new_block=(ROOT/'map/levels'/level/'level.lev').read_bytes()
            require(expected_registration.count(old_block)==1, 'Old registration is not unique: '+level)
            expected_registration=expected_registration.replace(old_block,new_block,1)
    require(registration==expected_registration,'Native map registrations changed outside43 source stanzas')
    return {'compiledProgramUnchangedOutsidePackageMetadata':True,'normalizedProgramSHA256':sha256(normalized.encode()).hexdigest(),
            'wasmUnchanged':True,'acceptedDataPrefixBytes':len(old_data),'acceptedDataPrefixSHA256':sha256(old_data).hexdigest(),
            'appendedBytes':len(data)-len(old_data),'changedVFSFiles':sorted(changed),'addedVFSFiles':[],
            'resolvedOriginalVFSFilesPreserved':len(before)-len(changed),'gameplayVerified':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--preservation-proof',type=Path,default=ROOT/'archive/levels-0.20-package.json')
    parser.add_argument('--expected-proof-sha256',required=True)
    parser.add_argument('--output',type=Path,default=ROOT.parent)
    args=parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT),'Delivery output must be outside the source tree')
    candidate=digest(args.apk)
    require(candidate==args.expected_sha256,'Candidate APK hash differs')
    require(digest(args.preservation_proof)==args.expected_proof_sha256,'Preservation proof hash differs')
    proof=read_json(args.preservation_proof)
    require(proof.get('baselineSHA256')==BASELINE_SHA and proof.get('remadeLevels',proof.get('newLevels'))==43
            and proof.get('totalLevels')==46,'Wrong baseline/map proof')
    require(all(proof.get(k) is True for k in ('dataPrefixPreserved','normalizedEngineBodyUnchanged','wasmUnchanged')),'Missing preservation assertions')
    require(all(proof.get(k) is False for k in ('emulatorUsed','gameplayVerified','difficultyPlaytested')),'Proof must not claim emulator/gameplay verification')
    proof_name=repo_path(args.preservation_proof)
    source_paths,changed_assets,vfs_allowed,required=inventories()
    required|={proof_name,RECORD,'archive/fallback-0.20.json'}
    for field in ('changedVFSFiles','addedVFSFiles'):
        require(isinstance(proof.get(field),list) and len(proof[field])==len(set(proof[field])),'Missing/duplicate proof inventory: '+field)
    require(not proof['addedVFSFiles'] and set(proof['changedVFSFiles'])<=vfs_allowed,'Proof exceeds map-only VFS scope')
    fallback=ROOT/'archive/fallback-0.20.json'; saved=read_json(fallback)
    for entry in saved['files']:
        path=Path(entry['path'])
        require(path.stat().st_size==entry['bytes'] and digest(path)==entry['sha256'],'Preserved fallback/old maps changed: '+str(path))
    baseline=next(Path(e['path']) for e in saved['files'] if Path(e['path']).name=='Warzone-Towers-0.19.apk')
    old_source=next(Path(e['path']) for e in saved['files'] if Path(e['path']).name=='warzone-towers-0.19-source.zip')
    require(digest(baseline)==BASELINE_SHA,'Wrong0.19 baseline')
    with ZipFile(args.apk) as apk,ZipFile(baseline) as old:
        require(apk.testzip() is None,'Built APK CRC failure')
        names,old_names=set(apk.namelist()),set(old.namelist())
        require(len(names)==len(apk.namelist()) and names==old_names,'APK member inventory changed')
        changed=[name for name in apk.namelist() if zip_digest(old,name)!=zip_digest(apk,name)]
        require({name for name in changed if name.startswith('assets/')}==changed_assets,'APK map asset inventory differs')
        require(all(name in changed_assets or name in {'AndroidManifest.xml','resources.arsc'}
                    or re.fullmatch(r'classes(?:\d+)?\.dex',name)
                    or re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))',name,re.I)
                    for name in changed),'Unexpected APK change outside maps/launcher/code/version metadata')
        for path in (ROOT/'app/src/main/assets').rglob('*'):
            if path.is_file():
                name='assets/'+path.relative_to(ROOT/'app/src/main/assets').as_posix()
                require(name in names and zip_digest(apk,name)==digest(path),'Stale/missing source asset in APK: '+name)
        for entry in proof['outputs']:
            path=ROOT/entry['path']; name=entry['path'].removeprefix('app/src/main/')
            require(repo_path(path)==entry['path'] and path.stat().st_size==entry['bytes']
                    and digest(path)==entry['sha256']==zip_digest(apk,name),'Builder output proof differs: '+entry['path'])
        catalog=verify_catalog(old,apk)
        payload=payload_integrity(old,apk,proof,source_paths,vfs_allowed,old_source)
    with ZipFile(old_source) as source:
        protected=[name for name in source.namelist() if (name.startswith(('vendor/','map/greenhaven-beginner/','scenario/'))
                   or name==NATIVE_SOURCE or name=='tools/generate-levels-019.py') and not name.endswith('/')]
        for name in protected:
            require((ROOT/name).is_file() and digest(ROOT/name)==zip_digest(source,name),'Benchmark/native/wave source changed: '+name)
    sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))
    badging=subprocess.check_output([str(sdk/'build-tools/36.1.0/aapt2.exe'),'dump','badging',str(args.apk)],text=True,encoding='utf-8')
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='20'","versionName='0.20'","application-label:'Warzone Towers'")),'Wrong package/version/label')
    paths=[args.output/name for name in ('Warzone-Towers-0.20.apk','warzone-towers-0.20-source.zip','Warzone-Towers-0.20-SHA256.txt')]
    apk_out,source,checksums=paths; partial=source.with_suffix('.zip.partial')
    require(not any(path.exists() for path in paths+[partial]),'Existing delivery/partial archive must not be overwritten')
    record={'version':'0.20','versionCode':20,'candidateAPK_SHA256':candidate,
            'scope':'Map-source/art review, static authoring constraints and clean Android build only; no emulator/runtime/gameplay test.',
            'emulatorUsed':False,'runtimeVerified':False,'gameplayVerified':False,'difficultyPlaytested':False,
            'catalog':catalog,'changedAPKAssets':sorted(changed_assets),'newAPKAssets':[],
            'changedAPKMembers':changed,'payloadPreservation':payload,'preservedOriginalSourceFiles':len(protected),
            'preservationProof':{'path':proof_name,'sha256':args.expected_proof_sha256},
            'fallbackRecord':{'path':'archive/fallback-0.20.json','sha256':digest(fallback)},
            'sourceInventory':'git ls-files --cached --others --exclude-standard; filtered caches/private/transient files',
            'gitMetadataIncluded':False,'recordedUTC':datetime.now(timezone.utc).isoformat().replace('+00:00','Z')}
    write_json(ROOT/RECORD,record)
    names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0')
    tracked=set(filter(None,subprocess.check_output(['git','ls-files','--cached','-z'],cwd=ROOT).decode('utf-8').split('\0')))
    files=[]
    for name in sorted(set(filter(None,names))|{RECORD,MANIFEST}):
        rel=Path(name)
        if any(part in SKIP for part in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial','.tmp'}: continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env')
                and name not in {'local.properties','tools/live-cdp-url.txt'},'Private/local source entry: '+name)
        path=ROOT/rel; repo_path(path)
        if path.is_file():
            require(name in tracked or path.stat().st_size<=128*1024*1024,'Unexpected large untracked source/cache: '+name)
            files.append((name,path))
    require(required<={name for name,_ in files},'Required complete source missing: '+str(sorted(required-{name for name,_ in files})))
    entries=[{'path':name,'bytes':path.stat().st_size,'sha256':digest(path)} for name,path in files if name!=MANIFEST]
    write_json(ROOT/MANIFEST,{'schemaVersion':1,'files':entries}); expected={e['path']:e for e in entries}
    args.output.mkdir(parents=True,exist_ok=True)
    with ZipFile(partial,'w',ZIP_DEFLATED,compresslevel=3) as archive:
        for name,path in files:
            archive.write(path,name,compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist())==len(files),'Source archive entry count differs')
        require(archive.getinfo(NATIVE_SOURCE).file_size>100*1024*1024,'Complete native source tar missing/LFS pointer')
        for name,path in files:
            archived=zip_digest(archive,name)
            require(archived==digest(path) and (name not in expected or archived==expected[name]['sha256']),'Source archive differs: '+name)
    require(digest(args.apk)==candidate and digest(args.preservation_proof)==args.expected_proof_sha256,'Candidate/proof changed during packaging')
    shutil.copyfile(args.apk,apk_out)
    require(digest(apk_out)==candidate,'Delivered APK differs from reviewed build')
    partial.rename(source); source_sha=digest(source)
    checksums.write_text(f'{candidate}  {apk_out.name}\n{source_sha}  {source.name}\n',encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed':True,'emulatorUsed':False,'runtimeVerified':False,
                      'apk':str(apk_out),'apkBytes':apk_out.stat().st_size,'candidateAPK_SHA256':candidate,
                      'source':str(source),'sourceBytes':source.stat().st_size,'sourceZIP_SHA256':source_sha,
                      'sourceFiles':len(files),'checksums':str(checksums),'streamedEverySourceEntryCRCAndSHA':True},indent=2))


if __name__=='__main__':
    main()
