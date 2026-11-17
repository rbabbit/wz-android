"""Verify the normal0.89 signing/update contract and exact reviewed asset changes."""
from pathlib import Path
from hashlib import sha256, file_digest
import concurrent.futures, json, subprocess, zipfile

ROOT=Path(__file__).resolve().parents[1]
RECORDS=ROOT/'release-records'
APK=ROOT/'app/build/outputs/apk/release/app-release.apk'
BASE=Path('C:/timerApp/Warzone-Towers-0.87-GooglePlay.apk')
SDK=Path('C:/Users/punke/AppData/Local/Android/Sdk/build-tools/36.1.0')
JAVA=Path('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')
SIGNER='4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
ALLOWED={
 'warzone-campaign-hud.js','warzone-touch-controls.js','multiplayer/session.js',
 'multiplayer/warzone2100.js','multiplayer/warzone2100.wasm',
 'warzone/warzone2100-towers-052.js','warzone/warzone2100-towers-052.wasm',
 'warzone/warzone2100.js','warzone/warzone2100.wasm','warzone/ui/towers-game-controls.css',
 'warzone/warzone2100-campaign.js','warzone/warzone2100-ffa.js','warzone/warzone2100-duel.js'}

def digest(path):
    with path.open('rb') as stream: return file_digest(stream,'sha256').hexdigest()
def zhash(archive,name):
    with archive.open(name) as stream: return file_digest(stream,'sha256').hexdigest()
def run(item):
    name,command=item
    p=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace')
    out=p.stdout+p.stderr
    (RECORDS/(name+'.log')).write_text(out,encoding='utf-8')
    assert p.returncode==0,(name,p.returncode,out[-1200:])
    return name,out
jobs={
 'apk-signature':[str(JAVA),'--enable-native-access=ALL-UNNAMED','-jar',str(SDK/'lib/apksigner.jar'),'verify','--verbose','--print-certs',str(APK)],
 'apk-alignment':[str(SDK/'zipalign.exe'),'-c','-p','4',str(APK)],
 'apk-badging':[str(SDK/'aapt2.exe'),'dump','badging',str(APK)],
 'apk-manifest':[str(SDK/'aapt2.exe'),'dump','xmltree',str(APK),'--file','AndroidManifest.xml'],
}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: out=dict(pool.map(run,jobs.items()))
assert SIGNER in out['apk-signature'].lower()
assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in out['apk-signature']
badging=out['apk-badging']; manifest=out['apk-manifest']
assert "package: name='com.rbabbit.warzonetowers.lab'" in badging
assert "versionCode='89'" in badging and "versionName='0.89'" in badging
assert "minSdkVersion:'26'" in badging and "targetSdkVersion:'36'" in badging
assert 'application-debuggable' not in badging
for permission in ['POST_NOTIFICATIONS','REQUEST_INSTALL_PACKAGES','FOREGROUND_SERVICE_SPECIAL_USE']:
    assert 'android.permission.'+permission in badging
assert 'com.rbabbit.blocknight.warzone.AppUpdateProvider' in manifest
assert not (ROOT/'app/build/outputs/bundle').exists(), 'This task builds APK only'
assets=ROOT/'app/src/main/assets'
changed=[]; count=0
with zipfile.ZipFile(BASE) as before,zipfile.ZipFile(APK) as after:
    old={p.filename for p in before.infolist() if p.filename.startswith('assets/') and not p.is_dir()}
    new={p.filename for p in after.infolist() if p.filename.startswith('assets/') and not p.is_dir()}
    assert old==new, 'Bundled asset set changed unexpectedly'
    for name in sorted(new):
        relative=name.removeprefix('assets/')
        packed=zhash(after,name)
        assert packed==digest(assets/relative),'Source/APK asset mismatch: '+relative
        if packed!=zhash(before,name):changed.append(relative)
        count+=1
    assert set(changed)==ALLOWED,changed
    assert after.read('assets/multiplayer/mobile-controls.js')==before.read('assets/multiplayer/mobile-controls.js'), 'Abandoned camera pilot leaked into normal APK'
    dex=b''.join(after.read(n) for n in after.namelist() if n.endswith('.dex'))
    assert b'AppUpdateTransfer;' in dex and b'Check for updates' in dex
native=json.loads((ROOT/'vendor/native-089/runtime-integration.json').read_text())
assert native['passed'] and len(native['variants'])==3
assert native['everySharedCoreLoaderPaired'] is True and len(native['sharedLoaderAliases'])==3
for variant in native['variants']:
    assert variant['passed'] and digest(assets/variant['baselineWASM']['path'])==variant['installedWASM_SHA256']
    assert digest(assets/variant['frozenData']['path'])==variant['frozenData']['sha256']
for alias in native['sharedLoaderAliases']:
    assert alias['passed'] and alias['generatedProgramIncludingASM_CONSTSMatchesRawShared']
    assert digest(assets/alias['baselineJS']['path'])==alias['installedJS_SHA256']
    assert digest(assets/alias['sharedWASMPath'])==alias['sharedWASM_SHA256']
    assert digest(assets/alias['frozenData']['path'])==alias['frozenData']['sha256']
ui=json.loads((RECORDS/'all-combat-ui-089-checks.json').read_text())
assert ui['passed']
assert all(digest(assets/r['path'])==r['sha256'] for r in ui['sources'])
report={
 'passed':True,'candidateAPK_SHA256':digest(APK),'apk':str(APK),'bytes':APK.stat().st_size,
 'applicationId':'com.rbabbit.warzonetowers.lab','versionCode':89,'versionName':'0.89',
 'certificateSHA256':SIGNER,'sameNormal086SigningChain':True,'playStoreBuild':False,
 'debuggable':False,'aabBuilt':False,'updaterPresent':True,'installPermissionPresent':True,
 'notificationFixRetained':True,'signatureAndAlignmentVerified':True,
 'allSourceAssetsMatchAPK':True,'assetsCompared':count,'changedAssets':changed,
 'allDataMapsMediaUnchanged':True,'camera088ExperimentExcluded':True,
 'nativeSourceBuildAndFrozenDataIntegrationVerified':True,
 'nativeIntegrationReportSHA256':digest(ROOT/'vendor/native-089/runtime-integration.json'),
 'runtimeVerification':'Separate focused-runtime.json records exact-APK native screens/orders/input evidence.'}
(RECORDS/'apk-integrity.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
