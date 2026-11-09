"""Package 0.22 after focused source checks and an Android build, without emulator tests.

Only the music loader asset may differ from the frozen 0.21 APK. Native
engine, map, scenario and Duel payloads remain byte-identical. Archive hashes
and source readback are packaging integrity checks, not playback evidence.
"""
from pathlib import Path
from hashlib import file_digest
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from datetime import datetime, timezone
import argparse
import json
import os
import re
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASELINE_SHA='16012cf201efea3faaf391872fcef0acf86117ebba0c9dd19e2b3494cb2a9ae2'
SOURCE_SHA='10183a0d04926d320827a0f86bb4e87b0a87e458f6b10d46cd2cbea25ae389ef'
PAYLOAD='assets/warzone/'
EXISTING_ASSET_SCOPE={PAYLOAD+'music-loader.js'}
NEW_ASSET_SCOPE=set()
NATIVE_SOURCE='archive/native-blueprint-4.7.0-source.tar.gz'
MANIFEST='archive/repository-files.json'
RECORD='archive/release-0.22-build-only.json'
STORED={'.gz','.xz','.zst','.zip','.png','.jpg','.jpeg','.webp','.ogg','.mp3','.opus','.wasm','.data','.woff2'}
SKIP={'.git','.gradle','.kotlin','.idea','build','node_modules','__pycache__',
      '.pytest_cache','.mypy_cache','.ruff_cache','.cache','.venv','venv','dist'}
TRANSIENT={'qa/0.19-home/latest-ui.xml'}
PRIVATE_SUFFIXES={'.jks','.keystore','.pyc','.pem','.p12','.pfx'}


def require(value,message):
    if not value:raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:return file_digest(stream,'sha256').hexdigest()


def zip_digest(archive,name):
    with archive.open(name) as stream:return file_digest(stream,'sha256').hexdigest()


def read_json(path):return json.loads(path.read_text(encoding='utf-8'))


def write_json(path,value):
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')


def repo_path(path):
    path=path.resolve()
    require(path.is_relative_to(ROOT),'Source/evidence path outside repository: '+str(path))
    return path.relative_to(ROOT).as_posix()


def verify_assignments(apk,path):
    """Validate reviewed map IDs against the unchanged native/music catalogs."""
    value=json.loads(apk.read('assets/'+path.removeprefix('app/src/main/assets/')))
    require(value.get('schemaVersion')==1,'Unsupported map music assignment schema')
    maps=json.loads(apk.read(PAYLOAD+'levels/catalog.json'))['levels']
    albums=json.loads(apk.read(PAYLOAD+'music-tracks.json'))['albums']
    allowed={track['id'] for album in albums for track in album['tracks']}
    # Schema is finalized with the common catalog used by native and web code.
    assignments=value.get('assignments',value.get('maps'))
    require(isinstance(assignments,dict),'Map music assignments must be an object')
    require(set(assignments)=={entry['id'] for entry in maps} and len(assignments)==46,'Every map must have one music assignment')
    ids=[]
    for level,entry in assignments.items():
        track=entry if isinstance(entry,str) else entry.get('trackId',entry.get('id'))
        require(track in allowed,'Unknown assigned music track: '+level)
        ids.append(track)
    require(set(ids)==allowed,'Reviewed music assignment coverage differs from all39 catalog tracks')
    return {'maps':46,'availableTracks':len(allowed),'assignedDistinctTracks':len(set(ids)),
            'repeatedAssignments':len(ids)-len(set(ids)),'musicBytesUnchanged':True,'playbackVerified':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--preservation-proof',type=Path,default=ROOT/'archive/music-0.22-package.json')
    parser.add_argument('--expected-proof-sha256',required=True)
    parser.add_argument('--output',type=Path,default=ROOT.parent)
    args=parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT),'Delivery output must be outside source tree')
    candidate=digest(args.apk)
    require(candidate==args.expected_sha256,'Candidate APK hash differs')
    require(digest(args.preservation_proof)==args.expected_proof_sha256,'Preservation proof hash differs')
    proof=read_json(args.preservation_proof)
    require(proof.get('baselineSHA256')==BASELINE_SHA,'Wrong frozen 0.21 baseline')
    require(all(proof.get(k) is True for k in ('enginePayloadUnchanged','mapsAndRulesUnchanged','duelPayloadUnchanged')),'Missing preservation assertions')
    require(all(proof.get(k) is False for k in ('emulatorUsed','runtimeVerified')),'Proof must not claim runtime/emulator verification')
    require(isinstance(proof.get('changedAPKAssets'),list) and isinstance(proof.get('newAPKAssets'),list),'Missing exact asset inventory')
    changed_assets=set(proof['changedAPKAssets']);new_assets=set(proof['newAPKAssets'])
    require(len(changed_assets)==len(proof['changedAPKAssets']) and len(new_assets)==len(proof['newAPKAssets']),'Duplicate asset inventory')
    require(changed_assets==EXISTING_ASSET_SCOPE and new_assets==NEW_ASSET_SCOPE,'Exact music UI asset inventory differs')
    require(changed_assets and not new_assets,'Expected loader-only fix inventory differs')
    proof_name=repo_path(args.preservation_proof)
    reports=proof.get('sourceCheckReports',[])
    require(isinstance(reports,list) and reports,'Focused non-emulator source check reports missing')
    for report in reports:
        path=ROOT/report['path'];repo_path(path)
        require(path.is_file() and digest(path)==report['sha256'],'Source check report changed: '+report['path'])
        observation=read_json(path)
        require(observation.get('emulatorUsed') is False,'Source report must explicitly exclude emulator use')
        for source in observation.get('sources',[]):
            item=ROOT/source['path'];repo_path(item)
            require(item.is_file() and digest(item)==source['sha256'],'Checked source changed after its fixture: '+source['path'])
    fallback=ROOT/'archive/fallback-0.22.json';saved=read_json(fallback)
    for entry in saved['files']:
        path=Path(entry['path'])
        require(path.stat().st_size==entry['bytes'] and digest(path)==entry['sha256'],'Frozen fallback changed: '+str(path))
    baseline=next(Path(e['path']) for e in saved['files'] if Path(e['path']).name=='Warzone-Towers-0.21.apk')
    old_source=next(Path(e['path']) for e in saved['files'] if Path(e['path']).name=='warzone-towers-0.21-source.zip')
    require(digest(baseline)==BASELINE_SHA and digest(old_source)==SOURCE_SHA,'Wrong 0.21 baseline source/APK')
    with ZipFile(args.apk) as apk,ZipFile(baseline) as old:
        require(apk.testzip() is None,'Built APK CRC failure')
        names,old_names=set(apk.namelist()),set(old.namelist())
        require(len(names)==len(apk.namelist()) and not old_names-names,'Duplicate/removed APK member')
        require({name for name in names-old_names if name.startswith('assets/')}==new_assets,'Unexpected APK asset addition')
        changed=[name for name in apk.namelist() if name not in old_names or zip_digest(old,name)!=zip_digest(apk,name)]
        require({name for name in changed if name.startswith('assets/') and name in old_names}==changed_assets,'Changed music asset inventory differs')
        allowed=changed_assets|new_assets
        require(all(name in allowed or name in {'AndroidManifest.xml','resources.arsc'}
                    or re.fullmatch(r'classes(?:\d+)?\.dex',name)
                    or re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))',name,re.I)
                    for name in changed),'APK changed outside music/launcher/code/version metadata')
        for path in (ROOT/'app/src/main/assets').rglob('*'):
            if path.is_file():
                name='assets/'+path.relative_to(ROOT/'app/src/main/assets').as_posix()
                require(name in names and zip_digest(apk,name)==digest(path),'Stale/missing APK source asset: '+name)
        outputs=proof.get('outputs',[])
        require({e['path'].removeprefix('app/src/main/') for e in outputs}==allowed,'Exact music output hash inventory missing')
        for entry in outputs:
            path=ROOT/entry['path'];name=entry['path'].removeprefix('app/src/main/')
            require(repo_path(path)==entry['path'] and path.stat().st_size==entry['bytes']
                    and digest(path)==entry['sha256']==zip_digest(apk,name),'Music output proof differs: '+entry['path'])
        music=verify_assignments(apk,proof.get('mapTrackAssignmentFile','app/src/main/assets/warzone/map-music.json'))
        frozen_assets={name:zip_digest(old,name) for name in old_names if name.startswith('assets/') and name not in changed_assets}
        require(all(zip_digest(apk,name)==sha for name,sha in frozen_assets.items()),'Frozen gameplay/map/Duel asset changed')
    with ZipFile(old_source) as source:
        java_prefix='app/src/main/java/'
        changed_java='app/src/main/java/com/rbabbit/blocknight/warzone/MusicTrackResponse.java'
        protected=[name for name in source.namelist() if (name.startswith(('vendor/','map/','scenario/'))
                   or name==NATIVE_SOURCE or (name.startswith(java_prefix) and name!=changed_java)) and not name.endswith('/')]
        for name in protected:
            require((ROOT/name).is_file() and digest(ROOT/name)==zip_digest(source,name),'Frozen engine/map/rule/Duel source changed: '+name)
    sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))
    badging=subprocess.check_output([str(sdk/'build-tools/36.1.0/aapt2.exe'),'dump','badging',str(args.apk)],text=True,encoding='utf-8')
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='22'","versionName='0.22'","application-label:'Warzone Towers'")),'Wrong package/version/label')
    paths=[args.output/name for name in ('Warzone-Towers-0.22.apk','warzone-towers-0.22-source.zip','Warzone-Towers-0.22-SHA256.txt')]
    apk_out,source,checksums=paths;partial=source.with_suffix('.zip.partial')
    require(not any(path.exists() for path in paths+[partial]),'Existing delivery/partial archive must not be overwritten')
    record={'version':'0.22','versionCode':22,'candidateAPK_SHA256':candidate,
            'scope':'Music transport/player source review, focused non-emulator checks and Android build; no device playback or gameplay test.',
            'emulatorUsed':False,'runtimeVerified':False,'gameplayVerified':False,'musicPlaybackVerified':False,
            'musicAssignments':music,'changedAPKAssets':sorted(changed_assets),'newAPKAssets':sorted(new_assets),
            'changedAPKMembers':changed,'unchangedGameplayAndMapAndDuelAPKAssets':True,
            'preservedOriginalSourceFiles':len(protected),'preservedAPKAssets':len(frozen_assets),
            'preservationProof':{'path':proof_name,'sha256':args.expected_proof_sha256},
            'sourceCheckReports':reports,
            'fallbackRecord':{'path':'archive/fallback-0.22.json','sha256':digest(fallback)},
            'sourceInventory':'git ls-files --cached --others --exclude-standard; filtered caches/private/transient files',
            'gitMetadataIncluded':False,'recordedUTC':datetime.now(timezone.utc).isoformat().replace('+00:00','Z')}
    write_json(ROOT/RECORD,record)
    required={NATIVE_SOURCE,'tools/package-22-build-only.py',proof_name,RECORD,'archive/fallback-0.22.json',
              'README.md','AGENTS.md','docs/releases/0.22-music-start.md'}
    required.update(report['path'] for report in reports)
    required.update('app/src/main/'+name for name in allowed)
    names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode('utf-8').split('\0')
    tracked=set(filter(None,subprocess.check_output(['git','ls-files','--cached','-z'],cwd=ROOT).decode('utf-8').split('\0')))
    files=[]
    for name in sorted(set(filter(None,names))|{RECORD,MANIFEST}):
        rel=Path(name)
        if any(part in SKIP for part in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial','.tmp'}:continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env')
                and name not in {'local.properties','tools/live-cdp-url.txt'},'Private/local source entry: '+name)
        path=ROOT/rel;repo_path(path)
        if path.is_file():
            require(name in tracked or path.stat().st_size<=128*1024*1024,'Unexpected large untracked source/cache: '+name)
            files.append((name,path))
    require(required<={name for name,_ in files},'Required complete source missing: '+str(sorted(required-{name for name,_ in files})))
    entries=[{'path':name,'bytes':path.stat().st_size,'sha256':digest(path)} for name,path in files if name!=MANIFEST]
    write_json(ROOT/MANIFEST,{'schemaVersion':1,'files':entries});expected={e['path']:e for e in entries}
    args.output.mkdir(parents=True,exist_ok=True)
    with ZipFile(partial,'w',ZIP_DEFLATED,compresslevel=3) as archive:
        for name,path in files:archive.write(path,name,compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist())==len(files),'Source archive entry count differs')
        require(archive.getinfo(NATIVE_SOURCE).file_size>100*1024*1024,'Complete native source tar missing/LFS pointer')
        for name,path in files:
            archived=zip_digest(archive,name)
            require(archived==digest(path) and (name not in expected or archived==expected[name]['sha256']),'Source archive differs: '+name)
    require(digest(args.apk)==candidate and digest(args.preservation_proof)==args.expected_proof_sha256,'Candidate/proof changed during packaging')
    for report in reports:
        require(digest(ROOT/report['path'])==report['sha256'],'Source check evidence changed during packaging')
    shutil.copyfile(args.apk,apk_out)
    require(digest(apk_out)==candidate,'Delivered APK differs from reviewed build')
    partial.rename(source);source_sha=digest(source)
    checksums.write_text(f'{candidate}  {apk_out.name}\n{source_sha}  {source.name}\n',encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed':True,'emulatorUsed':False,'runtimeVerified':False,
                      'apk':str(apk_out),'apkBytes':apk_out.stat().st_size,'candidateAPK_SHA256':candidate,
                      'source':str(source),'sourceBytes':source.stat().st_size,'sourceZIP_SHA256':source_sha,
                      'sourceFiles':len(files),'checksums':str(checksums),'streamedEverySourceEntryCRCAndSHA':True},indent=2))


if __name__=='__main__':main()
