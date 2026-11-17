"""Verify the exact normal Players test APK and its frozen source proofs. No publication."""
from pathlib import Path, PurePosixPath
from hashlib import file_digest
from concurrent.futures import ThreadPoolExecutor
import json, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
RECORDS = ROOT/'release-records'
APK = ROOT/'app/build/outputs/apk/release/app-release.apk'
BASE = Path('C:/timerApp/Warzone-Towers-0.90-Test.apk')
BASE_SOURCE = Path('C:/timerApp/candidates/normal-test-0.90-20261116')
SDK = Path('C:/Users/punke/AppData/Local/Android/Sdk/build-tools/36.1.0')
JAVA = Path('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')
SIGNER = '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
NATIVE = {'warzone/warzone2100.js','warzone/warzone2100.wasm',
          'warzone/warzone2100-towers-052.js','warzone/warzone2100-towers-052.wasm',
          'warzone/warzone2100-campaign.js','warzone/warzone2100-ffa.js','warzone/warzone2100-duel.js',
          'multiplayer/warzone2100.js','multiplayer/warzone2100.wasm'}

def digest(path):
    with Path(path).open('rb') as stream:
        return file_digest(stream,'sha256').hexdigest()

def zhash(archive,name):
    with archive.open(name) as stream:
        return file_digest(stream,'sha256').hexdigest()

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def run(item):
    name,command=item
    result=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace')
    text=result.stdout+result.stderr
    (RECORDS/(name+'.log')).write_text(text,encoding='utf-8')
    assert result.returncode==0,(name,result.returncode,text[-1600:])
    return name,text

def main():
    assert digest(BASE)=='ee65c0cd433f5959ff9b2cbc40de6f3e98c79f4c080996e87b3eeaa983403de2'
    scope=read(RECORDS/'scoped-asset-changes.json')
    assert scope['reviewed'] is True and scope['baselineAPK_SHA256']==digest(BASE)
    allowed=set(scope['changedAssets']); additions=set(scope.get('addedAssets',[]))
    assert NATIVE<=allowed
    assert all(x and str(PurePosixPath(x))==x and not PurePosixPath(x).is_absolute()
               and '..' not in PurePosixPath(x).parts and ':' not in x and '\\' not in x for x in allowed)
    assert not any(Path(x).suffix.lower() in {'.data','.wz','.ogg','.mp3','.png','.jpg','.ttf','.woff','.woff2'} for x in allowed)
    jobs={
        'apk-signature':[str(JAVA),'--enable-native-access=ALL-UNNAMED','-jar',str(SDK/'lib/apksigner.jar'),'verify','--verbose','--print-certs',str(APK)],
        'apk-alignment':[str(SDK/'zipalign.exe'),'-c','-p','4',str(APK)],
        'apk-badging':[str(SDK/'aapt2.exe'),'dump','badging',str(APK)],
        'apk-manifest':[str(SDK/'aapt2.exe'),'dump','xmltree',str(APK),'--file','AndroidManifest.xml'],
    }
    with ThreadPoolExecutor(max_workers=4) as pool:
        output=dict(pool.map(run,jobs.items()))
    assert SIGNER in output['apk-signature'].lower()
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in output['apk-signature']
    badging=output['apk-badging']; manifest=output['apk-manifest']
    assert "package: name='com.rbabbit.warzonetowers.lab'" in badging
    assert "versionCode='91'" in badging and "versionName='0.91'" in badging
    assert "minSdkVersion:'26'" in badging and "targetSdkVersion:'36'" in badging
    assert 'application-debuggable' not in badging
    for permission in ['POST_NOTIFICATIONS','REQUEST_INSTALL_PACKAGES','FOREGROUND_SERVICE_SPECIAL_USE']:
        assert 'android.permission.'+permission in badging
    assert 'com.rbabbit.blocknight.warzone.AppUpdateProvider' in manifest
    assert not (ROOT/'app/build/outputs/bundle').exists(), 'Normal test APK only'
    assets=ROOT/'app/src/main/assets'; changed=[]
    with zipfile.ZipFile(BASE) as before,zipfile.ZipFile(APK) as after:
        old={x.filename for x in before.infolist() if x.filename.startswith('assets/') and not x.is_dir()}
        new={x.filename for x in after.infolist() if x.filename.startswith('assets/') and not x.is_dir()}
        assert not old-new,'Unexpected bundled asset removal'
        assert {x.removeprefix('assets/') for x in new-old}==additions,'Unexpected bundled addition'
        assert {p.relative_to(assets).as_posix() for p in assets.rglob('*') if p.is_file()}=={x.removeprefix('assets/') for x in new}
        for name in sorted(new):
            relative=name.removeprefix('assets/'); packed=zhash(after,name)
            assert packed==digest(assets/relative),'Source/APK mismatch: '+relative
            if name not in old or packed!=zhash(before,name): changed.append(relative)
        assert set(changed)==allowed,('Unreviewed or missing changes',set(changed)^allowed)
        dex=b''.join(after.read(n) for n in after.namelist() if n.endswith('.dex'))
        assert b'AppUpdateTransfer;' in dex and b'Check for updates' in dex
    for path in (ROOT/'app/src').rglob('*'):
        if not path.is_file() or 'assets' in path.relative_to(ROOT/'app/src').parts: continue
        previous=BASE_SOURCE/path.relative_to(ROOT)
        assert previous.is_file() and digest(path)==digest(previous),'Unexpected Android source change: '+str(path)
    native_path=ROOT/'vendor/native-091/runtime-integration.json'; native=read(native_path)
    assert native['passed'] and len(native['variants'])==3
    assert native['everySharedCoreLoaderPaired'] is True and len(native['sharedLoaderAliases'])==3
    for variant in native['variants']:
        assert variant['passed']
        assert digest(assets/variant['baselineWASM']['path'])==variant['installedWASM_SHA256']
        assert digest(assets/variant['frozenData']['path'])==variant['frozenData']['sha256']
    for alias in native['sharedLoaderAliases']:
        assert alias['passed'] and alias['generatedProgramIncludingASM_CONSTSMatchesRawShared']
        assert digest(assets/alias['baselineJS']['path'])==alias['installedJS_SHA256']
        assert digest(assets/alias['sharedWASMPath'])==alias['sharedWASM_SHA256']
        assert digest(assets/alias['frozenData']['path'])==alias['frozenData']['sha256']
    ui_path=RECORDS/'players-ui-091-checks.json'; ui=read(ui_path)
    assert ui['passed'] is True
    assert {r['path'] for r in ui['sources']}==allowed-NATIVE
    assert all(digest(assets/r['path'])==r['sha256'] for r in ui['sources'])
    assert len(ui['cameraFunctions'])==35 and all(r['unchanged'] for r in ui['cameraFunctions'])
    report=dict(passed=True,candidateAPK_SHA256=digest(APK),apk=str(APK),bytes=APK.stat().st_size,
                applicationId='com.rbabbit.warzonetowers.lab',versionCode=91,versionName='0.91',certificateSHA256=SIGNER,
                sameNormalSigningChain=True,playStoreBuild=False,debuggable=False,aabBuilt=False,userTestBuild=True,
                publicationExecuted=False,updaterPresent=True,notificationFixRetained=True,signatureAndAlignmentVerified=True,
                allSourceAssetsMatchAPK=True,assetsCompared=len(new),changedAssets=changed,addedAssets=sorted(additions),
                allDataMapsMediaUnchanged=True,androidImplementationUnchanged=True,camera088ExperimentExcluded=True,
                preservedCameraFunctions=35,nativeSourceBuildAndFrozenDataIntegrationVerified=True,
                nativeIntegrationReportSHA256=digest(native_path),uiSourceCheckSHA256=digest(ui_path),
                baselineAPK_SHA256=digest(BASE),scopeProofSHA256=digest(RECORDS/'scoped-asset-changes.json'),
                runtimeVerification='Separate exact-APK Players role/gameplay evidence is required. User tests and approves before publication.')
    (RECORDS/'apk-integrity.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
