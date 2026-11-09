"""Package 0.19 after a clean build and the hash-bound native home-screen check.

This performs packaging integrity operations only. It does not run gameplay,
pathfinding, balance, wave, construction or drag-gesture tests. Git is read only;
the source ZIP contains the complete working source, not Git objects/history.
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
BASELINE_SHA = '1e0af446e348b4800930fac8d541433a073e69463387d7e0cc3622288bf6a568'
PAYLOAD = 'assets/warzone/'
MAP_FILES = ('droid.json', 'feature.json', 'gam.json', 'game.map', 'level.json', 'struct.json', 'ttypes.ttp')
STORED = {'.gz', '.xz', '.zst', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.ogg', '.mp3', '.wasm', '.data', '.woff2'}
SKIP = {'.git', '.gradle', '.kotlin', '.idea', 'build', 'node_modules', '__pycache__',
        '.pytest_cache', '.mypy_cache', '.ruff_cache', '.cache', '.venv', 'venv', 'dist'}
TRANSIENT = {'qa/0.19-home/latest-ui.xml'}
PRIVATE_SUFFIXES = {'.jks', '.keystore', '.pyc', '.pem', '.p12', '.pfx'}
CHANGED_ASSETS = {
    'assets/warzone-command-pages.js', 'assets/warzone-touch-controls.js',
    PAYLOAD+'index.html', PAYLOAD+'ui/build-display.js',
    PAYLOAD+'warzone2100.js', PAYLOAD+'warzone2100.data',
}
VFS_CHANGES = {'/data/mp/addon.lev', '/data/mp/config.js',
               '/data/mp/multiplay/maps/greenhaven-beginner/struct.json'}
NATIVE_SOURCE = 'archive/native-blueprint-4.7.0-source.tar.gz'
MANIFEST = 'archive/repository-files.json'
RECORD = 'archive/release-0.19-home-only.json'
package_call = runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'), run_name='release19_packaging')['package_call']


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
    require(path.is_relative_to(ROOT), 'Evidence/source path is outside the repository: '+str(path))
    return path.relative_to(ROOT).as_posix()


def new_levels():
    return [(f'{group}{number:02d}', group, f'wt-{letter}{number:02d}', f'WT-{letter.upper()}{number:02d}-T1')
            for group, letter, count in (('easy', 'e', 15), ('medium', 'm', 15), ('hard', 'h', 13))
            for number in range(1, count+1)]


def inventories():
    levels = new_levels()
    ids = {row[0] for row in levels} | {'td1', 'td2', 'beginner'}
    assets = {PAYLOAD+'levels/catalog.json', PAYLOAD+'levels/runtime.js'}
    assets.update(PAYLOAD+'levels/previews/'+level+'.png' for level in ids)
    sources = {}
    required = {'app/src/main/'+name for name in assets}
    required |= {NATIVE_SOURCE, 'tools/generate-levels-019.py', 'tools/build-levels-019.py',
                 'tools/package-19-home-only.py', 'docs/releases/0.19-levels.md', 'README.md', 'AGENTS.md'}
    for level, _, folder, _ in levels:
        for name in MAP_FILES:
            sources['/data/mp/multiplay/maps/'+folder+'/'+name] = 'map/levels/'+level+'/'+name
        sources['/data/mp/multiplay/maps/'+folder+'.gam'] = 'map/levels/'+level+'/gam.json'
        sources['/data/mp/tests/levels/'+level+'.js'] = 'scenario/levels/'+level+'.js'
        sources['/data/mp/tests/towers-'+level+'.json'] = 'scenario/levels/'+level+'.json'
        required |= {'map/levels/'+level+'/'+name for name in MAP_FILES+('AUTHORING.json', 'level.lev')}
    required.update(sources.values())
    required |= {'map/levels/GENERATION.json', 'map/levels/README.md', 'scenario/levels/WAVES.json',
                 'scenario/levels/config-router.js', 'map/greenhaven-beginner/struct.json',
                 'app/src/main/java/com/rbabbit/blocknight/warzone/MapLevelCatalog.java',
                 'app/src/main/java/com/rbabbit/blocknight/warzone/MapPreviewPager.java',
                 'app/src/main/java/com/rbabbit/blocknight/warzone/GraphicsSetupView.java',
                 'app/src/main/java/com/rbabbit/blocknight/warzone/BattleLaunchSpec.java',
                 'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'}
    additions = set(sources) | {'/data/mp/tests/towers-config-router-018.js'}
    return levels, assets, sources, additions, required


def verify_catalog(apk, levels):
    catalog = json.loads(apk.read(PAYLOAD+'levels/catalog.json'))
    require(catalog.get('schemaVersion') == 1, 'Unsupported native map catalog')
    entries = catalog['levels']
    by_id = {entry['id']:entry for entry in entries}
    require(len(entries) == len(by_id) == 46 and set(by_id) == {row[0] for row in levels}|{'td1','td2','beginner'}, 'Catalog ID inventory differs')
    require(Counter(e['difficulty'] for e in entries) == {'easy':16, 'medium':15, 'hard':15}, 'Catalog difficulty counts differ')
    for level, group, folder, native_name in levels:
        entry = by_id[level]
        rounds, preparation = {'easy':(15,240), 'medium':(20,180), 'hard':(25,150)}[group]
        expected = dict(difficulty=group, nativeFolder=folder, mapName=native_name,
                        humanPosition=0, northFacing=True, legacy=False,
                        preview='warzone/levels/previews/'+level+'.png', rounds=rounds,
                        preparationSeconds=preparation)
        require(all(entry.get(k) == v for k,v in expected.items()), 'Catalog metadata differs: '+level)
    for level, group, rounds, human, north in (('beginner','easy',15,0,True), ('td1','hard',30,0,True), ('td2','hard',30,1,False)):
        entry = by_id[level]
        require(entry['difficulty']==group and entry['rounds']==rounds and entry['humanPosition']==human
                and entry['northFacing'] is north and entry['legacy'] is True, 'Legacy launch metadata differs: '+level)
    return {'newLevels':43, 'totalLevels':46, 'newDifficultyCounts':{'easy':15,'medium':15,'hard':13},
            'catalogDifficultyCounts':{'easy':16,'medium':15,'hard':15}}


def payload_integrity(old, apk, proof, source_paths, additions):
    old_js = old.read(PAYLOAD+'warzone2100.js').decode('utf-8')
    js = apk.read(PAYLOAD+'warzone2100.js').decode('utf-8')
    a,b,_,before_meta = package_call(old_js)
    c,d,_,after_meta = package_call(js)
    normalized = old_js[:a]+'PACKAGE'+old_js[b:]
    require(js[:c]+'PACKAGE'+js[d:] == normalized, 'Compiled program changed outside package metadata')
    excluded = {'files','remote_package_size','package_uuid'}
    require({k:v for k,v in before_meta.items() if k not in excluded} == {k:v for k,v in after_meta.items() if k not in excluded}, 'Non-index package metadata changed')
    require(sha256(normalized.encode()).hexdigest() == proof['normalizedEngineBodySHA256'], 'Engine normalization proof differs')
    require(zip_digest(old,PAYLOAD+'warzone2100.wasm') == zip_digest(apk,PAYLOAD+'warzone2100.wasm'), 'Frozen WASM changed')
    old_data, data = old.read(PAYLOAD+'warzone2100.data'), apk.read(PAYLOAD+'warzone2100.data')
    require(len(data)>len(old_data) and data.startswith(old_data), 'Complete 0.18 data prefix changed or append absent')
    require(len(old_data)==proof['originalDataBytes'] and sha256(old_data).hexdigest()==proof['originalDataSHA256'], 'Baseline data proof differs')
    require(after_meta['remote_package_size']==len(data) and after_meta['package_uuid']=='warzone-towers-4.7.0-v1-'+str(len(data)), 'Package length/UUID differs')

    def index(metadata, length):
        result = {}
        for raw in metadata['files']:
            row = dict(raw)
            name, start, end = row['filename'], row['start'], row['end']
            integral = lambda value: type(value) in (int,float) and math.isfinite(value) and value==int(value)
            require(name not in result and isinstance(name,str) and name.startswith('/')
                    and integral(start) and integral(end) and 0<=start<=end<=length, 'Invalid/duplicate VFS entry: '+str(name))
            row['start'],row['end'] = int(start),int(end)
            result[name] = row
        return result

    before, after = index(before_meta,len(old_data)), index(after_meta,len(data))
    require(before.keys() <= after.keys(), 'Existing VFS file removed')
    def content(rows, payload, name):
        row = rows[name]
        return payload[row['start']:row['end']]
    changed = []
    for name,row in before.items():
        current = after[name]
        require({k:v for k,v in row.items() if k not in {'start','end'}} == {k:v for k,v in current.items() if k not in {'start','end'}}, 'VFS flags changed: '+name)
        if content(before,old_data,name) != content(after,data,name): changed.append(name)
    require(set(changed)==VFS_CHANGES==set(proof['changedVFSFiles']), 'VFS override inventory differs')
    require(set(after)-set(before)==additions==set(proof['addedVFSFiles']), '43-map/scenario VFS additions differ')
    for name,path in source_paths.items():
        require(content(after,data,name)==(ROOT/path).read_bytes(), 'Appended native content differs from source: '+path)
    require(content(after,data,'/data/mp/tests/towers-config-router-018.js')==content(before,old_data,'/data/mp/config.js'), 'Original 0.18 config router not preserved')
    require(content(after,data,'/data/mp/config.js')==(ROOT/'scenario/levels/config-router.js').read_bytes(), 'New config router differs from source')
    registration = content(after,data,'/data/mp/addon.lev')
    require(registration.startswith(content(before,old_data,'/data/mp/addon.lev')), 'Original map registrations changed')
    for level,_,_,_ in new_levels():
        require((ROOT/'map/levels'/level/'level.lev').read_bytes() in registration, 'Native map registration missing: '+level)
    green = '/data/mp/multiplay/maps/greenhaven-beginner/struct.json'
    original, current = json.loads(content(before,old_data,green)), json.loads(content(after,data,green))
    require(content(after,data,green)==(ROOT/'map/greenhaven-beginner/struct.json').read_bytes(), 'Greenhaven source differs')
    require(len(current['structures'])==len(original['structures'])+1 and current['structures'][:-1]==original['structures']
            and {k:v for k,v in current.items() if k!='structures'}=={k:v for k,v in original.items() if k!='structures'}, 'Existing Greenhaven structures changed')
    uplink = current['structures'][-1]
    require(uplink['name']=='A0Sat-linkCentre' and uplink['startpos']==0, 'Greenhaven human uplink missing')
    return {'compiledProgramUnchangedOutsidePackageMetadata':True, 'normalizedProgramSHA256':sha256(normalized.encode()).hexdigest(),
            'wasmUnchanged':True, 'acceptedDataPrefixBytes':len(old_data), 'acceptedDataPrefixSHA256':sha256(old_data).hexdigest(),
            'appendedBytes':len(data)-len(old_data), 'changedVFSFiles':sorted(changed), 'addedVFSFiles':sorted(additions),
            'resolvedOriginalVFSFilesPreserved':len(before)-len(changed), 'gameplayVerified':False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--preservation-proof',type=Path,default=ROOT/'archive/levels-0.19-package.json')
    parser.add_argument('--expected-proof-sha256',required=True)
    parser.add_argument('--home-proof',type=Path,default=ROOT/'qa/0.19-home/report.json')
    parser.add_argument('--expected-home-proof-sha256',required=True)
    parser.add_argument('--output',type=Path,default=ROOT.parent)
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside the source tree')
    candidate = digest(args.apk)
    require(candidate==args.expected_sha256, 'Candidate APK differs from approved hash')
    require(digest(args.preservation_proof)==args.expected_proof_sha256, 'Preservation proof hash differs')
    require(digest(args.home_proof)==args.expected_home_proof_sha256, 'Home proof hash differs')
    proof, home = read_json(args.preservation_proof),read_json(args.home_proof)
    require(proof.get('baselineSHA256')==BASELINE_SHA and proof.get('newLevels')==43 and proof.get('totalLevels')==46, 'Wrong baseline or map proof')
    require(all(proof.get(k) is True for k in ('dataPrefixPreserved','normalizedEngineBodyUnchanged','wasmUnchanged')), 'Missing preservation assertions')
    require(all(proof.get(k) is False for k in ('gameplayVerified','difficultyPlaytested','dragGestureTested')), 'Asset proof must not claim gameplay verification')
    require(home.get('candidateAPK_SHA256')==candidate and all(home.get(k) is True for k in ('nativeHomeOnly','homeScreenObserved','emulatorUsed'))
            and all(home.get(k) is False for k in ('gameplayVerified','pathfindingVerified','difficultyPlaytested','dragGestureTested')),
            'Home proof must cover this APK and only the observed native home')
    screenshots = home.get('screenshots')
    require(isinstance(screenshots,list) and screenshots, 'Home screenshots inventory missing')
    require(len({entry['path'] for entry in screenshots})==len(screenshots), 'Duplicate home screenshot paths')
    for entry in screenshots:
        path = ROOT/entry['path']
        repo_path(path)
        require(path.is_file() and digest(path)==entry['sha256'], 'Home screenshot changed: '+entry['path'])
    proof_name, home_name = repo_path(args.preservation_proof),repo_path(args.home_proof)
    levels,new_assets,source_paths,additions,required_sources = inventories()
    required_sources |= {proof_name,home_name,RECORD} | {entry['path'] for entry in screenshots}
    for field in ('changedVFSFiles','addedVFSFiles'):
        require(isinstance(proof.get(field),list) and len(proof[field])==len(set(proof[field])), 'Duplicate/missing proof inventory: '+field)
    require(set(proof['changedVFSFiles'])==VFS_CHANGES and set(proof['addedVFSFiles'])==additions, 'Proof exceeds exact VFS scope')
    require({entry['path'] for entry in proof.get('outputs',[])}=={
        'app/src/main/assets/warzone/'+name for name in ('warzone2100.js','warzone2100.data','index.html','levels/catalog.json')
    }, 'Builder output proof inventory differs')
    fallback = ROOT/'archive/fallback-0.19.json'
    saved = read_json(fallback)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.stat().st_size==entry['bytes'] and digest(path)==entry['sha256'], 'Frozen 0.18 delivery changed: '+str(path))
    baseline = Path(saved['files'][0]['path'])
    require(digest(baseline)==BASELINE_SHA, 'Wrong 0.18 baseline')
    with ZipFile(args.apk) as apk,ZipFile(baseline) as old:
        require(apk.testzip() is None, 'Candidate APK CRC failure')
        new_names,old_names = set(apk.namelist()),set(old.namelist())
        require(len(new_names)==len(apk.namelist()) and not old_names-new_names, 'Duplicate/removed APK members')
        added = {name for name in new_names-old_names if name.startswith('assets/')}
        changed = [name for name in apk.namelist() if name not in old_names or zip_digest(old,name)!=zip_digest(apk,name)]
        changed_existing_assets = {name for name in changed if name.startswith('assets/') and name in old_names}
        require(added==new_assets and changed_existing_assets==CHANGED_ASSETS, 'APK changed/new asset inventory differs from reviewed 0.19 scope')
        allowed = CHANGED_ASSETS|new_assets
        require(all(name in allowed or name in {'AndroidManifest.xml','resources.arsc'}
                    or re.fullmatch(r'classes(?:\d+)?\.dex',name)
                    or re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))',name,re.I)
                    for name in changed), 'Unexpected non-asset APK change')
        for path in (ROOT/'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/'+path.relative_to(ROOT/'app/src/main/assets').as_posix()
                require(name in new_names and zip_digest(apk,name)==digest(path), 'Stale/missing APK source asset: '+name)
        for entry in proof['outputs']:
            path = ROOT/entry['path']
            name = entry['path'].removeprefix('app/src/main/')
            require(repo_path(path)==entry['path'] and path.stat().st_size==entry['bytes']
                    and digest(path)==entry['sha256']==zip_digest(apk,name), 'Builder output proof differs: '+entry['path'])
        catalog = verify_catalog(apk,levels)
        payload = payload_integrity(old,apk,proof,source_paths,additions)
    with ZipFile(Path(saved['files'][1]['path'])) as old_source:
        exceptions = {'map/greenhaven-beginner/struct.json','map/greenhaven-beginner/AUTHORING.json'}
        protected = [name for name in old_source.namelist() if name.startswith(('vendor/','map/')) and not name.endswith('/') and name not in exceptions]
        protected += ['scenario/warzone-towers-waves.js','scenario/warzonetowers.json','scenario/warzonetowers-td1.json',NATIVE_SOURCE]
        for name in protected:
            require((ROOT/name).is_file() and digest(ROOT/name)==zip_digest(old_source,name), 'Frozen native/map/mod source changed: '+name)
    sdk = Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))
    badging = subprocess.check_output([str(sdk/'build-tools/36.1.0/aapt2.exe'),'dump','badging',str(args.apk)],text=True,encoding='utf-8')
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='19'","versionName='0.19'","application-label:'Warzone Towers'")), 'Wrong package/version/label')
    paths = [args.output/name for name in ('Warzone-Towers-0.19.apk','warzone-towers-0.19-source.zip','Warzone-Towers-0.19-SHA256.txt')]
    apk_out,source,checksums = paths
    partial = source.with_suffix('.zip.partial')
    require(not any(path.exists() for path in paths+[partial]), 'Existing delivery/partial archive must not be overwritten')
    record = {'version':'0.19','versionCode':19,'candidateAPK_SHA256':candidate,
              'scope':'Source audit, clean Android build and brief native home screen only; gameplay/pathfinding/balance/drag unverified.',
              'emulatorUsed':True,'nativeHomeObserved':True,'gameplayVerified':False,'pathfindingVerified':False,
              'difficultyPlaytested':False,'dragGestureTested':False,'waveCompletionVerified':False,
              'catalog':catalog,'changedAPKAssets':sorted(CHANGED_ASSETS),'newAPKAssets':sorted(new_assets),
              'changedAPKMembers':changed,'payloadPreservation':payload,'preservedOriginalSourceFiles':len(protected),
              'homeProof':{'path':home_name,'sha256':args.expected_home_proof_sha256,'screenshots':screenshots},
              'preservationProof':{'path':proof_name,'sha256':args.expected_proof_sha256},
              'fallbackRecord':{'path':'archive/fallback-0.19.json','sha256':digest(fallback)},
              'sourceInventory':'git ls-files --cached --others --exclude-standard; filtered caches/private/transient files',
              'gitMetadataIncluded':False,'recordedUTC':datetime.now(timezone.utc).isoformat().replace('+00:00','Z')}
    write_json(ROOT/RECORD,record)
    names = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0')
    tracked = set(filter(None,subprocess.check_output(['git','ls-files','--cached','-z'],cwd=ROOT).decode('utf-8').split('\0')))
    files = []
    for name in sorted(set(filter(None,names))|{RECORD,MANIFEST}):
        rel = Path(name)
        if any(part in SKIP for part in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial','.tmp'}:
            continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env')
                and name not in {'local.properties','tools/live-cdp-url.txt'}, 'Private/local source entry: '+name)
        path = ROOT/rel
        repo_path(path)
        if path.is_file():
            require(name in tracked or path.stat().st_size<=128*1024*1024, 'Unexpected large untracked source/cache: '+name)
            files.append((name,path))
    require(required_sources <= {name for name,_ in files}, 'Complete source inventory missing: '+str(sorted(required_sources-{name for name,_ in files})))
    entries = [{'path':name,'bytes':path.stat().st_size,'sha256':digest(path)} for name,path in files if name!=MANIFEST]
    write_json(ROOT/MANIFEST,{'schemaVersion':1,'files':entries})
    expected = {entry['path']:entry for entry in entries}
    args.output.mkdir(parents=True,exist_ok=True)
    with ZipFile(partial,'w',ZIP_DEFLATED,compresslevel=3) as archive:
        for name,path in files:
            archive.write(path,name,compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist())==len(files), 'Source archive count differs')
        require(archive.getinfo(NATIVE_SOURCE).file_size>100*1024*1024, 'Complete native source tar is missing or an LFS pointer')
        for name,path in files:
            archived = zip_digest(archive,name)
            require(archived==digest(path) and (name not in expected or archived==expected[name]['sha256']), 'Source archive member differs: '+name)
    require(digest(args.apk)==candidate and digest(args.preservation_proof)==args.expected_proof_sha256
            and digest(args.home_proof)==args.expected_home_proof_sha256, 'Candidate/evidence changed during packaging')
    for entry in screenshots:
        require(digest(ROOT/entry['path'])==entry['sha256'], 'Home evidence changed during packaging')
    shutil.copyfile(args.apk,apk_out)
    require(digest(apk_out)==candidate, 'Delivered APK differs from observed APK')
    partial.rename(source)
    source_sha = digest(source)
    checksums.write_text(f'{candidate}  {apk_out.name}\n{source_sha}  {source.name}\n',encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed':True,'nativeHomeObserved':True,'gameplayVerified':False,
                      'difficultyPlaytested':False,'dragGestureTested':False,'apk':str(apk_out),
                      'apkBytes':apk_out.stat().st_size,'candidateAPK_SHA256':candidate,'source':str(source),
                      'sourceBytes':source.stat().st_size,'sourceZIP_SHA256':source_sha,'sourceFiles':len(files),
                      'checksums':str(checksums),'streamedEverySourceEntryCRCAndSHA':True},indent=2))


if __name__=='__main__':
    main()
