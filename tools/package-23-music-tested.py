"""Package 0.23 after focused music playback verification on the exact APK.

Only the reviewed music implementation may differ from the frozen 0.22 APK.
Native engine, map, scenario and Duel payloads remain byte-identical. Emulator
music evidence is hash-bound separately from archive/source integrity checks.
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
BASELINE_SHA='e7a7930a65dd053e19b5711421efe23adc6d7e7dabe68f751fbd97f95bf1714c'
SOURCE_SHA='18efd3ede0b7373623fc30db740439176ce34b1c63aaed33a6987f007716af20'
PAYLOAD='assets/warzone/'
EXISTING_ASSET_SCOPE={PAYLOAD+'music-loader.js'}
NEW_ASSET_SCOPE=set()
NATIVE_SOURCE='archive/native-blueprint-4.7.0-source.tar.gz'
MANIFEST='archive/repository-files.json'
RECORD='archive/release-0.23-music-tested.json'
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
            'repeatedAssignments':len(ids)-len(set(ids)),'musicBytesUnchanged':True,'allAssignedTracksPlaybackVerified':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256',required=True)
    parser.add_argument('--preservation-proof',type=Path,default=ROOT/'archive/music-0.23-package.json')
    parser.add_argument('--expected-proof-sha256',required=True)
    parser.add_argument('--emulator-proof',type=Path,required=True)
    parser.add_argument('--expected-emulator-proof-sha256',required=True)
    parser.add_argument('--output',type=Path,default=ROOT.parent)
    args=parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT),'Delivery output must be outside source tree')
    candidate=digest(args.apk)
    require(candidate==args.expected_sha256,'Candidate APK hash differs')
    require(digest(args.preservation_proof)==args.expected_proof_sha256,'Preservation proof hash differs')
    proof=read_json(args.preservation_proof)
    require(proof.get('baselineSHA256')==BASELINE_SHA,'Wrong frozen 0.22 baseline')
    require(all(proof.get(k) is True for k in ('enginePayloadUnchanged','mapsAndRulesUnchanged','duelPayloadUnchanged')),'Missing preservation assertions')
    require(proof.get('gameplayVerified') is False, 'Music-only delivery must not claim gameplay verification')
    require(digest(args.emulator_proof)==args.expected_emulator_proof_sha256, 'Emulator evidence hash differs')
    emulator=read_json(args.emulator_proof)
    require(emulator.get('candidateAPK_SHA256')==candidate and emulator.get('emulatorUsed') is True
            and emulator.get('musicPlaybackObserved') is True, 'Music evidence must cover the exact candidate APK')
    playback=emulator.get('playbackEvidence',{})
    require(playback.get('mediaTimeAdvanced') is True,
            'Music evidence requires actual advancing media time')
    audibility = emulator.get('audibleOutputVerified',playback.get('audibleOutputVerified'))
    audible_output = audibility is True
    decoded_pcm = playback.get('decodedPCMNonZero') is True
    require(audible_output or decoded_pcm,
            'Music evidence requires observed output or measured nonzero decoded PCM')
    output_limitation = emulator.get('audioOutputLimitation','')
    require(isinstance(output_limitation,str), 'Audio output limitation must be text')
    output_limitation = output_limitation.strip()
    if not audible_output:
        require(decoded_pcm and audibility is False and output_limitation,
                'Decoded-only evidence must explicitly exclude audible verification and disclose its limit')
    else:
        require(playback.get('audioOutputObserved') is True
                and playback.get('hostAudioSinkAvailable') is not False,
                'Audible verification requires actual observed output')
    require(emulator.get('gameplayVerified') is False, 'Focused music evidence must not claim complete gameplay verification')
    evidence_files=emulator.get('evidenceFiles',[])
    require(isinstance(evidence_files,list) and evidence_files, 'Emulator evidence inventory missing')
    for entry in evidence_files:
        item=ROOT/entry['path'];repo_path(item)
        require(item.is_file() and digest(item)==entry['sha256'], 'Emulator evidence file changed: '+entry['path'])
    emulator_name=repo_path(args.emulator_proof)
    require(isinstance(proof.get('changedAPKAssets'),list) and isinstance(proof.get('newAPKAssets'),list),'Missing exact asset inventory')
    changed_assets=set(proof['changedAPKAssets']);new_assets=set(proof['newAPKAssets'])
    require(len(changed_assets)==len(proof['changedAPKAssets']) and len(new_assets)==len(proof['newAPKAssets']),'Duplicate asset inventory')
    require(changed_assets==EXISTING_ASSET_SCOPE and new_assets==NEW_ASSET_SCOPE,'Exact music UI asset inventory differs')
    require(changed_assets and not new_assets,'Expected loader-only fix inventory differs')
    proof_name=repo_path(args.preservation_proof)
    reports=proof.get('sourceCheckReports',[])
    require(isinstance(reports,list),'Source report inventory must be a list')
    for report in reports:
        path=ROOT/report['path'];repo_path(path)
        require(path.is_file() and digest(path)==report['sha256'],'Source check report changed: '+report['path'])
        observation=read_json(path)
        require(observation.get('emulatorUsed') is False,'Source report must explicitly exclude emulator use')
        for source in observation.get('sources',[]):
            item=ROOT/source['path'];repo_path(item)
            require(item.is_file() and digest(item)==source['sha256'],'Checked source changed after its fixture: '+source['path'])
    fallback=ROOT/'archive/fallback-0.23.json';saved=read_json(fallback)
    for entry in saved['files']:
        path=Path(entry['path'])
        require(path.stat().st_size==entry['bytes'] and digest(path)==entry['sha256'],'Frozen fallback changed: '+str(path))
    baseline=next(Path(e['path']) for e in saved['files'] if Path(e['path']).name=='Warzone-Towers-0.22.apk')
    old_source=next(Path(e['path']) for e in saved['files'] if Path(e['path']).name=='warzone-towers-0.22-source.zip')
    require(digest(baseline)==BASELINE_SHA and digest(old_source)==SOURCE_SHA,'Wrong 0.22 baseline source/APK')
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
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='23'","versionName='0.23'","application-label:'Warzone Towers'")),'Wrong package/version/label')
    paths=[args.output/name for name in ('Warzone-Towers-0.23.apk','warzone-towers-0.23-source.zip','Warzone-Towers-0.23-SHA256.txt')]
    apk_out,source,checksums=paths;partial=source.with_suffix('.zip.partial')
    require(not any(path.exists() for path in paths+[partial]),'Existing delivery/partial archive must not be overwritten')
    record={'version':'0.23','versionCode':23,'candidateAPK_SHA256':candidate,
            'scope':'Focused music transport/decoder progression and controls observed on exact delivery APK in emulator; no complete gameplay verification.',
            'emulatorUsed':True,'gameplayVerified':False,'musicPlaybackObserved':True,'allAssignedTracksPlaybackVerified':False,
            'audibleOutputVerified':audible_output,'decodedPCMObserved':decoded_pcm,
            'hostAudioSinkAvailable':playback.get('hostAudioSinkAvailable'),
            'audioOutputLimitation':output_limitation,
            'emulatorProof':{'path':emulator_name,'sha256':args.expected_emulator_proof_sha256},
            'emulatorEvidenceFiles':evidence_files,
            'musicAssignments':music,'changedAPKAssets':sorted(changed_assets),'newAPKAssets':sorted(new_assets),
            'changedAPKMembers':changed,'unchangedGameplayAndMapAndDuelAPKAssets':True,
            'preservedOriginalSourceFiles':len(protected),'preservedAPKAssets':len(frozen_assets),
            'preservationProof':{'path':proof_name,'sha256':args.expected_proof_sha256},
            'sourceCheckReports':reports,
            'fallbackRecord':{'path':'archive/fallback-0.23.json','sha256':digest(fallback)},
            'sourceInventory':'git ls-files --cached --others --exclude-standard; filtered caches/private/transient files',
            'gitMetadataIncluded':False,'recordedUTC':datetime.now(timezone.utc).isoformat().replace('+00:00','Z')}
    write_json(ROOT/RECORD,record)
    required={NATIVE_SOURCE,'tools/package-23-music-tested.py',proof_name,RECORD,'archive/fallback-0.23.json',
              'README.md','AGENTS.md','docs/releases/0.23-music-playback.md'}
    required.add(emulator_name)
    required.update(entry['path'] for entry in evidence_files)
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
    require(digest(args.apk)==candidate and digest(args.preservation_proof)==args.expected_proof_sha256
            and digest(args.emulator_proof)==args.expected_emulator_proof_sha256,'Candidate/proof changed during packaging')
    for entry in evidence_files:
        require(digest(ROOT/entry['path'])==entry['sha256'], 'Emulator evidence changed during packaging')
    for report in reports:
        require(digest(ROOT/report['path'])==report['sha256'],'Source check evidence changed during packaging')
    shutil.copyfile(args.apk,apk_out)
    require(digest(apk_out)==candidate,'Delivered APK differs from reviewed build')
    partial.rename(source);source_sha=digest(source)
    checksums.write_text(f'{candidate}  {apk_out.name}\n{source_sha}  {source.name}\n',encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed':True,'emulatorUsed':True,'musicPlaybackObserved':True,'gameplayVerified':False,
                      'apk':str(apk_out),'apkBytes':apk_out.stat().st_size,'candidateAPK_SHA256':candidate,
                      'source':str(source),'sourceBytes':source.stat().st_size,'sourceZIP_SHA256':source_sha,
                      'sourceFiles':len(files),'checksums':str(checksums),'streamedEverySourceEntryCRCAndSHA':True},indent=2))


if __name__=='__main__':main()
