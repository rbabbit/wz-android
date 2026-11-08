"""Verify Towers 0.13 Factory/navigation/guide scope; no gameplay verdict.

All Towers/Duel programs, data, maps, scenarios, Android code and other runtime
assets remain exact to the accepted 0.12 release. Actual final-APK UI/production
checks and manual screenshot acceptance are separate release requirements.
"""
from pathlib import Path
from zipfile import ZipFile
import argparse
import json
import os
import re
import runpy
import subprocess

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT.parent
QA=ROOT/'qa/test-13'
prior=runpy.run_path(str(ROOT/'tools/verify-test-12-package.py'),run_name='release13_helpers')
digest,read,require,local,zip_digest,signing_certificate,stable_integrity=(
    prior[n] for n in ('digest','read','require','local','zip_digest','signing_certificate','stable_integrity'))
FROZEN=dict(prior['FROZEN'],**{
    'Warzone-Towers-0.12.apk':'7a5f59363844eec86489f54b04ad776077d120631422ab1ebc59426544685673',
    'warzone-towers-0.12-source.zip':'6838daadf3a995017e2c7eed39a4a55e24846809b89650cd3565f0acd2fcdacf',
    'Warzone-Towers-0.12-SHA256.txt':'0c87610880023d6594f2aac2bcad4393b862525aa431868fea18f567ec5c2ab9',
})
FALLBACK=BASE/'fallbacks/towers-before-factory-0.13-20261108'
CHANGED_ASSETS={'assets/warzone-command-pages.js','assets/warzone-touch-controls.js','assets/warzone-html-session.js',
                'assets/warzone/ui/towers-commands.css'}
ALLOWED_SOURCE={'app/src/main/'+n for n in CHANGED_ASSETS}|{'app/build.gradle.kts'}
EMULATOR_CHECKS={'factoryOptionThree','nativeFactoryIdentity','tenFactories','compactFactoryLayout',
                 'catalogueDeduplicated','quantityAndSavedLibrary','nativeProductionFIFO',
                 'clearWaitingKeepsActive','fullQueueAndBack','towersNavigationBaseOnly',
                 'personalHowTo','statusAndWorldRetained','duelPreserved'}
REQUIRED_SOURCE_TESTS={'test-13-factory.cjs','test-13-help.cjs','test-12-status.cjs',
                       'test-12-world-routing.cjs','test-12-world-taps.cjs',
                       'test-android-back-routing.cjs','test-test-lifecycle.cjs','test-duel-ui.cjs'}


def record(path):return {'path':path.relative_to(ROOT).as_posix(),'sha256':digest(path)}


def frozen_artifacts():
    records=prior['frozen_artifacts']()
    for name in ('Warzone-Towers-0.12.apk','warzone-towers-0.12-source.zip','Warzone-Towers-0.12-SHA256.txt'):
        for path in (BASE/name,FALLBACK/name):
            require(digest(path)==FROZEN[name],'Accepted 0.12 fallback changed: '+str(path))
            records.append({'path':str(path),'sha256':FROZEN[name]})
    return records


def verify(apk_path):
    candidate=digest(apk_path);artifacts=frozen_artifacts();source_files=[]
    with ZipFile(BASE/'Warzone-Towers-0.12.apk') as old,ZipFile(apk_path) as apk,ZipFile(BASE/'warzone-towers-0.12-source.zip') as source:
        require(apk.testzip() is None,'APK CRC mismatch')
        old_names=set(old.namelist());names=set(apk.namelist())
        require(len(names)==len(apk.namelist()) and not any(n.endswith('/') for n in names),'Duplicate/directory APK entry')
        require(old_names==names,'APK entry inventory changed during existing-asset UI work')
        changed={n for n in old_names if zip_digest(old,n)!=zip_digest(apk,n)}
        allowed=CHANGED_ASSETS|{'AndroidManifest.xml'}|{n for n in names if re.fullmatch(r'classes\d*\.dex',n) or n.startswith('META-INF/')}
        require(CHANGED_ASSETS<=changed and changed<=allowed,'APK change outside Factory/navigation/guide scope: '+str(changed))
        assets={n for n in names if n.startswith('assets/')}
        current={'assets/'+p.relative_to(ROOT/'app/src/main/assets').as_posix():p for p in (ROOT/'app/src/main/assets').rglob('*') if p.is_file()}
        require(current.keys()==assets,'Source/APK asset inventory differs')
        for name,path in current.items():require(digest(path)==zip_digest(apk,name),'Stale packaged asset: '+name)
        source_names=set(source.namelist())
        runtime=sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[local('app/build.gradle.kts')]
        old_runtime={n for n in source_names if n.startswith('app/src/') and not n.endswith('/')}|{'app/build.gradle.kts'}
        require({p.relative_to(ROOT).as_posix() for p in runtime}==old_runtime,'Runtime inventory changed outside existing UI assets')
        changed_source=set()
        for path in runtime:
            name=path.relative_to(ROOT).as_posix();rec=record(path);source_files.append(rec)
            if rec['sha256']!=zip_digest(source,name):changed_source.add(name)
        require(changed_source==ALLOWED_SOURCE,'Unexpected/missing runtime source change: '+str(changed_source))
        preserved={n for n in source_names if n.startswith(('vendor/','map/','scenario/')) and not n.endswith('/')}
        actual={p.relative_to(ROOT).as_posix() for folder in ('vendor','map','scenario') for p in (ROOT/folder).rglob('*') if p.is_file()}
        require(preserved==actual,'Map/scenario/vendor inventory changed')
        for name in preserved:require(digest(local(name))==zip_digest(source,name),'Game/map/scenario/Duel source changed: '+name)
        baseline=json.loads(source.read('qa/test-12/package-verification.json'))
        require(baseline['passed'] is True and baseline['candidateAPK_SHA256']==FROZEN['Warzone-Towers-0.12.apk'],'Wrong accepted package baseline')
        native_files=[];duel_files=[]
        for key,records in (('nativeSourceFiles',native_files),('duelSourceFiles',duel_files)):
            for entry in baseline[key]:
                path=local(entry['path']);require(digest(path)==entry['sha256'],'Native/Duel provenance changed: '+entry['path']);records.append(record(path))
        fixed=('warzone2100.js','warzone2100.wasm','warzone2100.data','index.html','mobile.html',
               'warzone2100-duel.js','warzone2100-duel.data','index-duel.html','mobile-duel.html')
        native_hashes={n:zip_digest(apk,'assets/warzone/'+n) for n in fixed}
        for name,value in native_hashes.items():require(value==zip_digest(old,'assets/warzone/'+name),'Frozen complete Towers/Duel payload changed: '+name)
        towers_proof=baseline['towersPayloadVerification'];duel_proof=baseline['duelPayloadVerification']
        require(towers_proof.get('passed') is True and duel_proof.get('passed') is True,'Accepted complete VFS/Duel preservation proof missing')
    sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'AppData/Local/Android/Sdk')))
    aapt=sdk/'build-tools/36.1.0/aapt2.exe';require(aapt.is_file(),'Configure Android build-tools36.1.0')
    badging=subprocess.check_output([str(aapt),'dump','badging',str(apk_path)],text=True,encoding='utf-8')
    for token in ("package: name='com.rbabbit.warzonetowers.lab'","versionCode='13'","versionName='0.13'","application-label:'Warzone Towers'"):
        require(token in badging,'Wrong APK identity: '+token)
    certificate=signing_certificate(apk_path,sdk)
    require(certificate==signing_certificate(BASE/'Warzone-Towers-0.12.apk',sdk),'Update signing identity changed')
    return {'passed':True,'verification':'Source/package/preservation only; exact-APK Factory, production, navigation, guide and manual screen review are separate',
            'candidateAPK_SHA256':candidate,'package':'com.rbabbit.warzonetowers.lab','label':'Warzone Towers','version':'0.13','versionCode':13,
            'baselineAPK_SHA256':FROZEN['Warzone-Towers-0.12.apk'],'sameSigningCertificateSHA256':certificate,
            'compiledEngineUnchanged':True,'towersAndDuelPayloadsUnchanged':True,'mapsAndScenariosUnchanged':True,
            'nativeAndroidSourceUnchanged':True,'researchAndStatusAssetsUnchanged':True,
            'nativePayloadSHA256':native_hashes,'acceptedTowersPayloadVerification':towers_proof,
            'acceptedDuelPayloadVerification':duel_proof,'modifiedAssets':sorted(changed&assets),'addedAssets':[],
            'changedRuntimeFiles':sorted(changed_source),'sourceAssetsMatchAPK':len(current),'sourceFiles':source_files,
            'nativeSourceFiles':native_files,'duelSourceFiles':duel_files,'preservedArtifacts':artifacts,'stable':stable_integrity()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk',type=Path,default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out',type=Path,default=QA/'package-verification.json')
    args=parser.parse_args();report=verify(args.apk);args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in {'sourceFiles','nativeSourceFiles','duelSourceFiles','preservedArtifacts','acceptedTowersPayloadVerification','acceptedDuelPayloadVerification'}},indent=2))


if __name__=='__main__':main()
