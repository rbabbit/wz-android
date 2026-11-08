"""Verify Towers 0.11 UI-only packaging and unchanged game/Duel contents.

This is a source/package/preservation check. Actual screens, five labs, ten
factories, ordinary production and input restoration need exact-APK evidence.
"""
from pathlib import Path
from zipfile import ZipFile
import argparse
import json
import os
import re
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
QA = ROOT/'qa/test-11'
prior = runpy.run_path(str(ROOT/'tools/verify-test-10-package.py'), run_name='release11_helpers')
digest, read, require, local, zip_digest, signing_certificate, stable_integrity = (
    prior[n] for n in ('digest','read','require','local','zip_digest','signing_certificate','stable_integrity'))
FROZEN = dict(prior['FROZEN'], **{
    'Warzone-Towers-0.10.apk':'d29a3e6e2e6da13a8eac6b2d6540b5c4070b39f0115de1dc44025822237a31b3',
    'warzone-towers-0.10-source.zip':'cf5c8be3614547ee708e12b6dd2e3ec158750f48ada125cf9691f264a9d77548',
    'Warzone-Towers-0.10-SHA256.txt':'ef98bab27efdd9baac0fa38d5ba39506e4c31974f6bb5d3c6e83efcf436a8382',
})
FALLBACK = BASE/'fallbacks/towers-before-ui-0.11-20261108'
NEW_ASSETS = {'assets/warzone/ui/'+n for n in ('towers-commands.css','towers-research.css','towers-shell.css')}
CHANGED_ASSETS = {'assets/'+n for n in ('warzone-command-pages.js','warzone-mobile-research.js','warzone-touch-controls.js')}
NEW_SOURCE = {'app/src/main/'+n for n in NEW_ASSETS}
REQUIRED_SOURCE = {'app/src/main/'+n for n in CHANGED_ASSETS} | {'app/build.gradle.kts'}
ALLOWED_SOURCE = REQUIRED_SOURCE | {'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'}
EMULATOR_CHECKS = {'approvedLayouts','fiveLabs','tenFactories','manualResearchQueues','ordinaryProduction',
                   'buildModulesSelectionFIFO','designPhonePersistence','keyboardAndMenuReturns','nativeSaveLoad','duelPreserved'}


def record(path):
    return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def frozen_artifacts():
    records = prior['frozen_artifacts']()
    for name in ('Warzone-Towers-0.10.apk','warzone-towers-0.10-source.zip','Warzone-Towers-0.10-SHA256.txt'):
        for path in (BASE/name,FALLBACK/name):
            require(digest(path)==FROZEN[name], 'Accepted 0.10 fallback changed: '+str(path))
            records.append({'path':str(path),'sha256':FROZEN[name]})
    return records


def native_return_method(source):
    value=source.replace('\r\n','\n')
    start=value.index('  private void showMainMenuDialog(')
    end=value.index('  private void returnToMainMenu()',start)
    return value[start:end]


def verify(apk_path):
    candidate=digest(apk_path)
    artifacts=frozen_artifacts()
    source_files=[]
    with ZipFile(BASE/'Warzone-Towers-0.10.apk') as old, ZipFile(apk_path) as apk, ZipFile(BASE/'warzone-towers-0.10-source.zip') as source:
        require(apk.testzip() is None,'APK CRC mismatch')
        old_names=set(old.namelist());names=set(apk.namelist())
        require(len(names)==len(apk.namelist()) and not any(n.endswith('/') for n in names),'Duplicate/directory APK entry')
        require(old_names<=names,'Accepted APK entry removed')
        extra=names-old_names
        require(NEW_ASSETS<=extra and all(n in NEW_ASSETS or re.fullmatch(r'classes\d*\.dex',n) or n.startswith('META-INF/') for n in extra),'Unexpected/missing Towers UI APK additions: '+str(extra))
        changed={n for n in old_names if zip_digest(old,n)!=zip_digest(apk,n)}
        allowed=CHANGED_ASSETS|{'AndroidManifest.xml'}|{n for n in names if re.fullmatch(r'classes\d*\.dex',n) or n.startswith('META-INF/')}
        require(CHANGED_ASSETS<=changed and changed<=allowed,'APK change outside Towers UI scope: '+str(changed))
        assets={n for n in names if n.startswith('assets/')}
        current={'assets/'+p.relative_to(ROOT/'app/src/main/assets').as_posix():p for p in (ROOT/'app/src/main/assets').rglob('*') if p.is_file()}
        require(current.keys()==assets,'Source/APK asset inventory differs')
        for name,path in current.items():require(digest(path)==zip_digest(apk,name),'Stale packaged asset: '+name)
        source_names=set(source.namelist())
        runtime=sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[ROOT/'app/build.gradle.kts']
        runtime_names={p.relative_to(ROOT).as_posix() for p in runtime}
        old_runtime={n for n in source_names if n.startswith('app/src/') and not n.endswith('/')}|{'app/build.gradle.kts'}
        require(runtime_names==old_runtime|NEW_SOURCE,'Runtime source inventory changed outside three Towers stylesheets')
        changed_source=set()
        for path in runtime:
            name=path.relative_to(ROOT).as_posix();rec=record(path);source_files.append(rec)
            if name not in source_names or rec['sha256']!=zip_digest(source,name):changed_source.add(name)
        require(REQUIRED_SOURCE|NEW_SOURCE<=changed_source and changed_source<=ALLOWED_SOURCE|NEW_SOURCE,'Unexpected/missing runtime source change: '+str(changed_source))
        activity='app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'
        require(native_return_method(local(activity).read_text(encoding='utf-8'))==native_return_method(source.read(activity).decode('utf-8')),'Polished Android Return dialog or routing changed')
        preserved={n for n in source_names if n.startswith(('vendor/','map/','scenario/')) and not n.endswith('/')}
        actual={p.relative_to(ROOT).as_posix() for folder in ('vendor','map','scenario') for p in (ROOT/folder).rglob('*') if p.is_file()}
        require(preserved==actual,'Map/scenario/vendor inventory changed during UI work')
        for name in preserved:require(digest(local(name))==zip_digest(source,name),'Game/Duel source changed: '+name)
        baseline=json.loads(source.read('qa/test-10/package-verification.json'))
        require(baseline['candidateAPK_SHA256']==FROZEN['Warzone-Towers-0.10.apk'],'Wrong accepted package baseline')
        native_files=[]
        for entry in baseline['nativeSourceFiles']:
            path=local(entry['path']);require(digest(path)==entry['sha256'],'Native source/provenance changed: '+entry['path']);native_files.append(record(path))
        duel_files=[]
        for entry in baseline['duelSourceFiles']:
            path=local(entry['path']);require(digest(path)==entry['sha256'],'Duel source/provenance changed: '+entry['path']);duel_files.append(record(path))
        names_native=('warzone2100.js','warzone2100.wasm','warzone2100.data','index.html','mobile.html','warzone2100-duel.js','warzone2100-duel.data','index-duel.html','mobile-duel.html')
        native_hashes={n:zip_digest(apk,'assets/warzone/'+n) for n in names_native}
        for name,value in native_hashes.items():require(value==zip_digest(old,'assets/warzone/'+name),'Frozen Towers/Duel program, data or entry changed: '+name)
        duel_proof=prior['verify_duel_payload'](apk)
    for name in NEW_ASSETS:
        css=local('app/src/main/'+name).read_text(encoding='utf-8')
        scope='wt-towers-research' if name.endswith('towers-research.css') else 'wt-towers-polished'
        require(scope in css,'Towers stylesheet lacks its mode scope: '+name)
    for name in CHANGED_ASSETS:
        js=local('app/src/main/'+name).read_text(encoding='utf-8')
        require('__warzoneDuelConfig' in js or 'wt-towers-polished' in js,'Shared UI change has no explicit Towers/Duel boundary: '+name)
    sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))
    aapt=sdk/'build-tools/36.1.0/aapt2.exe';require(aapt.is_file(),'Configure Android build-tools36.1.0')
    badging=subprocess.check_output([str(aapt),'dump','badging',str(apk_path)],text=True,encoding='utf-8')
    for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='11'","versionName='0.11'","application-label:'Warzone Towers'"):
        require(token in badging,'Wrong APK identity: '+token)
    certificate=signing_certificate(apk_path,sdk)
    require(certificate==signing_certificate(BASE/'Warzone-Towers-0.10.apk',sdk),'Update signing identity changed')
    return {'passed':True,'verification':'UI source/package/preservation only; exact-APK screens, gameplay, 5/5/5 native facilities and input restoration are separate',
            'candidateAPK_SHA256':candidate,'package':'com.rbabbit.warzonetowers.lab','label':'Warzone Towers','version':'0.11','versionCode':11,
            'baselineAPK_SHA256':FROZEN['Warzone-Towers-0.10.apk'],'sameSigningCertificateSHA256':certificate,'compiledEngineUnchanged':True,
            'towersAndDuelPayloadsUnchanged':True,'duelScenarioUnchanged':True,'nativeReturnDialogUnchanged':True,
            'nativePayloadSHA256':native_hashes,'duelPayloadVerification':duel_proof,'modifiedAssets':sorted(changed&assets),'addedAssets':sorted(NEW_ASSETS),
            'changedRuntimeFiles':sorted(changed_source),'sourceAssetsMatchAPK':len(current),'sourceFiles':source_files,
            'nativeSourceFiles':native_files,'duelSourceFiles':duel_files,'preservedArtifacts':artifacts,'stable':stable_integrity()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out',type=Path,default=QA/'package-verification.json')
    args=parser.parse_args();report=verify(args.apk);args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in {'sourceFiles','nativeSourceFiles','duelSourceFiles','preservedArtifacts'}},indent=2))


if __name__=='__main__':main()
