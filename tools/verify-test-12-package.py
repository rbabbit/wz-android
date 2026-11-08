"""Verify Towers 0.12 status/world-opening scope; no gameplay verdict.

The accepted 0.11 program and data prefix remain frozen. The existing embed
tool appends/reindexes source files; only the read-only Towers command observer
may differ in the indexed game contents. Actual input and gameplay need reports.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import argparse
import json
import math
import os
import re
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
QA = ROOT/'qa/test-12'
prior = runpy.run_path(str(ROOT/'tools/verify-test-11-package.py'), run_name='release12_helpers')
digest, read, require, local, zip_digest, signing_certificate, stable_integrity = (
    prior[n] for n in ('digest','read','require','local','zip_digest','signing_certificate','stable_integrity'))
package_call = runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'), run_name='release12_runtime')['package_call']
FROZEN = dict(prior['FROZEN'], **{
    'Warzone-Towers-0.11.apk':'09440e33070aabf0dacd22e8b495f6d696735bb45f9084bd2fca5e25d9b10471',
    'warzone-towers-0.11-source.zip':'25ad2105abd3bf38dec89d034ea2b147b2a41e036f49c8cabca0d9735b985db9',
    'Warzone-Towers-0.11-SHA256.txt':'d2a3a4e24a380978492f6ad26d57d7333641c6b7ecbd9c2ff026215391c2aca2',
})
FALLBACK = BASE/'fallbacks/towers-before-status-0.12-20261108'
NEW_ASSETS = {'assets/warzone/ui/towers-status.js','assets/warzone/ui/towers-status.css'}
UI_ASSETS = {'assets/'+n for n in (
    'warzone-command-pages.js','warzone-mobile-research.js','warzone-touch-controls.js',
    'warzone-html-session.js','warzone/ui/build-display.js','warzone/ui/lab-ui.js')}
PAYLOAD_ASSETS = {'assets/warzone/warzone2100.js','assets/warzone/warzone2100.data'}
CHANGED_ASSETS = UI_ASSETS | PAYLOAD_ASSETS
NEW_SOURCE = {'app/src/main/'+n for n in NEW_ASSETS}
ALLOWED_SOURCE = {'app/src/main/'+n for n in CHANGED_ASSETS} | {'app/build.gradle.kts'}
OBSERVER_SOURCE = 'scenario/warzone-towers-commands.js'
OBSERVER_VFS = '/data/mp/tests/warzone-towers-commands.js'
EMULATOR_CHECKS = {'footerStatus','worldFacilityOpeningBothMaps','nativeFacilityIdentity',
                   'fiveLabs','tenFactories','compactStatusLayout','ordinaryProduction',
                   'constructionQueuePreserved','savesAndInputRestored','androidBackAndMenus','duelPreserved'}
REQUIRED_SOURCE_TESTS = {'test-12-status.cjs','test-12-world-routing.cjs','test-12-world-taps.cjs',
                         'test-android-back-routing.cjs','test-test-lifecycle.cjs','test-duel-ui.cjs'}


def record(path):
    return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def frozen_artifacts():
    records = prior['frozen_artifacts']()
    for name in ('Warzone-Towers-0.11.apk','warzone-towers-0.11-source.zip','Warzone-Towers-0.11-SHA256.txt'):
        for path in (BASE/name,FALLBACK/name):
            require(digest(path)==FROZEN[name], 'Accepted 0.11 fallback changed: '+str(path))
            records.append({'path':str(path),'sha256':FROZEN[name]})
    return records


def embed_sources():
    """The ordered inputs of the unchanged embed-warzone-towers.ps1 refresh."""
    files=[]
    def add(virtual,relative):files.append((virtual,local(relative)))
    for name in ('warzonetowers.json','warzonetowers-td1.json','warzone-towers-rules.js'):
        add('/data/mp/tests/'+name,'scenario/'+name)
    add('/data/mp/multiplay/script/rules/init.js','scenario/warzone-towers-rules.js')
    for name in ('warzone-towers-waves.js','warzone-towers-objective.js','warzone-towers-wave-command.json',
                 'warzone-towers-bridge.js','warzone-towers-control-command.json','warzone-towers-commands.js',
                 'warzone-towers-command.json','warzone-towers-catalog.json'):
        add('/data/mp/tests/'+name,'scenario/'+name)
    for name in ('warzone-towers-command.json','warzone-towers-wave-command.json','warzone-towers-control-command.json',
                 'warzone-towers-catalog.json','blocknight-queue-command.json','blocknight-zoom-command.json'):
        add('/data/mp/multiplay/script/rules/'+name,'scenario/'+name)
    for folder in ('vendor/survival/map','vendor/tower-defense/mod'):
        directory=ROOT/folder
        for path in sorted(directory.rglob('*'),key=lambda p:str(p).lower()):
            if not path.is_file():continue
            name=path.relative_to(directory).as_posix()
            if folder.endswith('/map') and path.name.endswith('.addon.lev'):continue
            if folder.endswith('/mod') and name=='multiplay/script/rules/init.js':continue
            files.append(('/data/mp/'+name,path))
    for path in sorted((ROOT/'vendor/maps/td1-v3/map').iterdir(),key=lambda p:p.name.lower()):
        if path.is_file():files.append(('/data/mp/multiplay/maps/td1_v3/'+path.name,path))
    return files


def towers_payload(old,apk):
    name='assets/warzone/warzone2100.js'
    old_js=old.read(name).decode('utf-8');js=apk.read(name).decode('utf-8')
    a,b,_,old_meta=package_call(old_js);c,d,_,meta=package_call(js)
    normalized=old_js[:a]+'PACKAGE'+old_js[b:]
    require(js[:c]+'PACKAGE'+js[d:]==normalized,'Compiled Towers program changed outside package metadata')
    excluded={'files','remote_package_size','package_uuid'}
    require({k:v for k,v in meta.items() if k not in excluded}=={k:v for k,v in old_meta.items() if k not in excluded},'Unexpected non-index Towers package metadata')
    old_data=old.read('assets/warzone/warzone2100.data');data=apk.read('assets/warzone/warzone2100.data')
    prefix=len(old_data)
    require(len(data)>prefix and data[:prefix]==old_data,'Accepted Towers data prefix changed or observer append absent')
    require(meta.get('remote_package_size')==len(data) and meta.get('package_uuid')=='warzone-towers-4.7.0-v1-'+str(len(data)),'Towers package size/UUID mismatch')
    def index(value,length):
        entries=value['files'];result={e.get('filename'):e for e in entries}
        require(len(result)==len(entries),'Duplicate Towers VFS filename')
        for path,entry in result.items():
            integral=lambda n:type(n) in (int,float) and math.isfinite(n) and n==int(n)
            require(isinstance(path,str) and path.startswith('/') and integral(entry.get('start')) and integral(entry.get('end')) and 0<=entry['start']<=entry['end']<=length,'Invalid Towers VFS entry')
            entry['start']=int(entry['start']);entry['end']=int(entry['end'])
        return result
    before=index(old_meta,prefix);after=index(meta,len(data))
    require(before.keys()==after.keys(),'Towers VFS inventory changed')
    changed=[]
    for path,entry in after.items():
        previous=before[path]
        require({k:v for k,v in entry.items() if k not in {'start','end'}}=={k:v for k,v in previous.items() if k not in {'start','end'}},'Towers VFS flags changed: '+path)
        content=data[entry['start']:entry['end']]
        if content!=old_data[previous['start']:previous['end']]:changed.append(path)
        if path==OBSERVER_VFS:require(content==local(OBSERVER_SOURCE).read_bytes(),'Observer not embedded from exact scenario source')
    require(set(changed)=={OBSERVER_VFS},'Indexed Towers rules/maps/data changed outside observer: '+str(changed))
    # Recreate the supported append/reindex operation independently. This also
    # accounts for an input path appearing twice in the existing embed list.
    cursor=prefix;expected={};inputs=[]
    for path,source in embed_sources():
        content=source.read_bytes();end=cursor+len(content)
        require(data[cursor:end]==content,'Unexpected append or unsupported binary patch: '+path)
        expected[path]=(cursor,end);inputs.append(record(source));cursor=end
    require(cursor==len(data),'Hidden/unindexed bytes beyond supported embed refresh')
    for path,entry in after.items():
        offsets=expected.get(path,(before[path]['start'],before[path]['end']))
        require((entry['start'],entry['end'])==offsets,'Incorrect final embedded VFS offsets: '+path)
    return {'passed':True,'compiledProgramUnchangedOutsidePackageMetadata':True,
            'normalizedProgramSHA256':sha256(normalized.encode()).hexdigest(),
            'acceptedDataPrefixBytes':prefix,'acceptedDataPrefixSHA256':sha256(old_data).hexdigest(),
            'dataSHA256':sha256(data).hexdigest(),'VFSRecords':len(after),'changedVFSFiles':changed,
            'appendedBytes':len(data)-prefix,'appendSources':inputs,'appendReindexMatchesExistingTool':True}


def verify(apk_path):
    candidate=digest(apk_path);artifacts=frozen_artifacts();source_files=[]
    with ZipFile(BASE/'Warzone-Towers-0.11.apk') as old,ZipFile(apk_path) as apk,ZipFile(BASE/'warzone-towers-0.11-source.zip') as source:
        require(apk.testzip() is None,'APK CRC mismatch')
        old_names=set(old.namelist());names=set(apk.namelist())
        require(len(names)==len(apk.namelist()) and not any(n.endswith('/') for n in names),'Duplicate/directory APK entry')
        require(old_names<=names,'Accepted APK entry removed')
        extra=names-old_names
        require(NEW_ASSETS<=extra and all(n in NEW_ASSETS or re.fullmatch(r'classes\d*\.dex',n) or n.startswith('META-INF/') for n in extra),'Unexpected/missing status APK additions: '+str(extra))
        changed={n for n in old_names if zip_digest(old,n)!=zip_digest(apk,n)}
        allowed=CHANGED_ASSETS|{'AndroidManifest.xml'}|{n for n in names if re.fullmatch(r'classes\d*\.dex',n) or n.startswith('META-INF/')}
        require(PAYLOAD_ASSETS<=changed and changed<=allowed,'APK change outside status/world-opening scope: '+str(changed))
        assets={n for n in names if n.startswith('assets/')}
        current={'assets/'+p.relative_to(ROOT/'app/src/main/assets').as_posix():p for p in (ROOT/'app/src/main/assets').rglob('*') if p.is_file()}
        require(current.keys()==assets,'Source/APK asset inventory differs')
        for name,path in current.items():require(digest(path)==zip_digest(apk,name),'Stale packaged asset: '+name)
        source_names=set(source.namelist())
        runtime=sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[local('app/build.gradle.kts')]
        old_runtime={n for n in source_names if n.startswith('app/src/') and not n.endswith('/')}|{'app/build.gradle.kts'}
        require({p.relative_to(ROOT).as_posix() for p in runtime}==old_runtime|NEW_SOURCE,'Runtime source inventory changed outside status assets')
        changed_source=set()
        for path in runtime:
            name=path.relative_to(ROOT).as_posix();rec=record(path);source_files.append(rec)
            if name not in source_names or rec['sha256']!=zip_digest(source,name):changed_source.add(name)
        require(NEW_SOURCE|{'app/build.gradle.kts'}|{'app/src/main/'+n for n in PAYLOAD_ASSETS}<=changed_source and changed_source<=ALLOWED_SOURCE|NEW_SOURCE,'Unexpected/missing runtime source changes: '+str(changed_source))
        preserved={n for n in source_names if n.startswith(('vendor/','map/','scenario/')) and not n.endswith('/')}
        actual={p.relative_to(ROOT).as_posix() for folder in ('vendor','map','scenario') for p in (ROOT/folder).rglob('*') if p.is_file()}
        require(preserved==actual,'Map/scenario/vendor inventory changed')
        require(digest(local(OBSERVER_SOURCE))!=zip_digest(source,OBSERVER_SOURCE),'Read-only facility/production observer absent')
        for name in preserved-{OBSERVER_SOURCE}:require(digest(local(name))==zip_digest(source,name),'Map/rule/Duel source changed: '+name)
        for name in ('tools/embed-warzone-towers.ps1','tools/register-warzone-towers-map.ps1','tools/integrate-native-runtime.py'):
            require(digest(local(name))==zip_digest(source,name),'Supported native packaging tool changed: '+name)
        baseline=json.loads(source.read('qa/test-11/package-verification.json'))
        require(baseline['candidateAPK_SHA256']==FROZEN['Warzone-Towers-0.11.apk'],'Wrong accepted package baseline')
        native_files=[];duel_files=[]
        for key,records in (('nativeSourceFiles',native_files),('duelSourceFiles',duel_files)):
            for entry in baseline[key]:
                path=local(entry['path'])
                generated_package=key=='nativeSourceFiles' and entry['path'] in {'app/src/main/'+n for n in PAYLOAD_ASSETS}
                if not generated_package:require(digest(path)==entry['sha256'],'Native/Duel source or provenance changed: '+entry['path'])
                # The JS package literal and appended .data are verified below
                # against the accepted normalized program and entire data prefix.
                records.append(record(path))
        fixed=('warzone2100.wasm','index.html','mobile.html','warzone2100-duel.js','warzone2100-duel.data','index-duel.html','mobile-duel.html')
        native_hashes={n:zip_digest(apk,'assets/warzone/'+n) for n in fixed}
        for name,value in native_hashes.items():require(value==zip_digest(old,'assets/warzone/'+name),'Frozen engine/Duel/entry changed: '+name)
        # The immutable 0.11 archive carries the already validated complete
        # Duel build proof. Current Towers inputs intentionally have a new
        # observer; the Duel package and its source/provenance are all exact.
        accepted_duel=baseline['duelPayloadVerification']
        require(accepted_duel.get('passed') is True and accepted_duel.get('compiledProgramUnchangedOutsidePackageMetadata') is True,'Accepted complete Duel proof missing')
        duel_proof=dict(accepted_duel, candidatePayloadMatchesAccepted=True,
                        method='Complete 0.11 provenance plus exact candidate Duel assets and retained source bytes')
        towers_proof=towers_payload(old,apk)
    for name in NEW_ASSETS:
        value=local('app/src/main/'+name).read_text(encoding='utf-8')
        require('wt-towers' in value or '__warzoneDuelConfig' in value,'New status asset lacks explicit Towers scope: '+name)
    sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))
    aapt=sdk/'build-tools/36.1.0/aapt2.exe';require(aapt.is_file(),'Configure Android build-tools36.1.0')
    badging=subprocess.check_output([str(aapt),'dump','badging',str(apk_path)],text=True,encoding='utf-8')
    for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='12'","versionName='0.12'","application-label:'Warzone Towers'"):
        require(token in badging,'Wrong APK identity: '+token)
    certificate=signing_certificate(apk_path,sdk)
    require(certificate==signing_certificate(BASE/'Warzone-Towers-0.11.apk',sdk),'Update signing identity changed')
    return {'passed':True,'verification':'Source/package/preservation only; actual footer, world taps, input and gameplay are separate exact-APK checks',
            'candidateAPK_SHA256':candidate,'package':'com.rbabbit.warzonetowers.lab','label':'Warzone Towers','version':'0.12','versionCode':12,
            'baselineAPK_SHA256':FROZEN['Warzone-Towers-0.11.apk'],'sameSigningCertificateSHA256':certificate,
            'compiledEngineUnchanged':True,'duelPayloadUnchanged':True,'duelScenarioUnchanged':True,'nativeAndroidSourceUnchanged':True,
            'towersMapsRulesUnchanged':True,'towersObserverOnlyDataChange':True,'towersPayloadVerification':towers_proof,
            'nativePayloadSHA256':native_hashes,'duelPayloadVerification':duel_proof,'modifiedAssets':sorted(changed&assets),'addedAssets':sorted(NEW_ASSETS),
            'changedRuntimeFiles':sorted(changed_source),'sourceAssetsMatchAPK':len(current),'sourceFiles':source_files,
            'observerSource':record(local(OBSERVER_SOURCE)),'nativeSourceFiles':native_files,'duelSourceFiles':duel_files,
            'preservedArtifacts':artifacts,'stable':stable_integrity()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out',type=Path,default=QA/'package-verification.json')
    args=parser.parse_args();report=verify(args.apk);args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in {'sourceFiles','nativeSourceFiles','duelSourceFiles','preservedArtifacts','towersPayloadVerification'}},indent=2))


if __name__=='__main__':main()
