"""Verify the local normal0.90 test APK; never publishes or contacts the VPS."""
from pathlib import Path
from hashlib import file_digest
import concurrent.futures, json, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
RECORDS = ROOT/'release-records'
APK = ROOT/'app/build/outputs/apk/release/app-release.apk'
BASE = Path('C:/timerApp/Warzone-Towers-0.89.apk')
BASE_SOURCE = Path('C:/timerApp/candidates/normal-0.89-20261116')
SDK = Path('C:/Users/punke/AppData/Local/Android/Sdk/build-tools/36.1.0')
JAVA = Path('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')
SIGNER = '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
UI = {'warzone-campaign-hud.js','warzone-touch-controls.js','warzone-command-pages.js',
      'multiplayer/mobile-controls.js','multiplayer/session.js','multiplayer/native-ui-adapter.js',
      'warzone/ui/towers-game-controls.css'}
NATIVE = {'multiplayer/warzone2100.js','multiplayer/warzone2100.wasm',
          'warzone/warzone2100-towers-052.js','warzone/warzone2100-towers-052.wasm',
          'warzone/warzone2100.js','warzone/warzone2100.wasm',
          'warzone/warzone2100-campaign.js','warzone/warzone2100-ffa.js','warzone/warzone2100-duel.js'}
ALLOWED = UI | NATIVE

def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()

def zhash(archive, name):
    with archive.open(name) as stream:
        return file_digest(stream, 'sha256').hexdigest()

def run(item):
    name, command = item
    process = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace')
    output = process.stdout+process.stderr
    (RECORDS/(name+'.log')).write_text(output, encoding='utf-8')
    assert process.returncode == 0, (name, process.returncode, output[-1600:])
    return name, output

def main():
    assert digest(BASE) == 'dc1a273437f8393e66ebfbdb8886b06a4ddab82dec419553165bb07611efdf38'
    jobs = {
        'apk-signature': [str(JAVA),'--enable-native-access=ALL-UNNAMED','-jar',str(SDK/'lib/apksigner.jar'),'verify','--verbose','--print-certs',str(APK)],
        'apk-alignment': [str(SDK/'zipalign.exe'),'-c','-p','4',str(APK)],
        'apk-badging': [str(SDK/'aapt2.exe'),'dump','badging',str(APK)],
        'apk-manifest': [str(SDK/'aapt2.exe'),'dump','xmltree',str(APK),'--file','AndroidManifest.xml'],
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        outputs = dict(pool.map(run, jobs.items()))
    assert SIGNER in outputs['apk-signature'].lower()
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in outputs['apk-signature']
    badging, manifest = outputs['apk-badging'], outputs['apk-manifest']
    assert "package: name='com.rbabbit.warzonetowers.lab'" in badging
    assert "versionCode='90'" in badging and "versionName='0.90'" in badging
    assert "minSdkVersion:'26'" in badging and "targetSdkVersion:'36'" in badging
    assert 'application-debuggable' not in badging
    for permission in ['POST_NOTIFICATIONS','REQUEST_INSTALL_PACKAGES','FOREGROUND_SERVICE_SPECIAL_USE']:
        assert 'android.permission.'+permission in badging
    assert 'com.rbabbit.blocknight.warzone.AppUpdateProvider' in manifest
    assert not (ROOT/'app/build/outputs/bundle').exists(), 'Test APK only; no bundle build'
    assets = ROOT/'app/src/main/assets'
    changed, count = [], 0
    with zipfile.ZipFile(BASE) as before, zipfile.ZipFile(APK) as after:
        old = {p.filename for p in before.infolist() if p.filename.startswith('assets/') and not p.is_dir()}
        new = {p.filename for p in after.infolist() if p.filename.startswith('assets/') and not p.is_dir()}
        assert old == new, 'Unexpected bundled asset additions/removals'
        for name in sorted(new):
            relative = name.removeprefix('assets/')
            packed = zhash(after, name)
            assert packed == digest(assets/relative), 'Source/APK mismatch: '+relative
            if packed != zhash(before, name):
                changed.append(relative)
            count += 1
        assert set(changed) <= ALLOWED, 'Unexpected asset changes: '+str(set(changed)-ALLOWED)
        assert UI <= set(changed), 'Missing reviewed UI change'
        assert {n for n in NATIVE if n.endswith('.wasm')} <= set(changed)
        dex = b''.join(after.read(n) for n in after.namelist() if n.endswith('.dex'))
        assert b'AppUpdateTransfer;' in dex and b'Check for updates' in dex
    # App implementation outside the scoped embedded game/UI remains unchanged.
    for path in (ROOT/'app/src').rglob('*'):
        if not path.is_file() or 'assets' in path.relative_to(ROOT/'app/src').parts:
            continue
        previous = BASE_SOURCE/path.relative_to(ROOT)
        assert previous.is_file() and digest(path) == digest(previous), 'Unexpected Android source change: '+str(path)
    native_path = ROOT/'vendor/native-090/runtime-integration.json'
    native = json.loads(native_path.read_text())
    assert native['passed'] and len(native['variants']) == 3
    assert native['everySharedCoreLoaderPaired'] is True and len(native['sharedLoaderAliases']) == 3
    for variant in native['variants']:
        assert variant['passed']
        assert digest(assets/variant['baselineWASM']['path']) == variant['installedWASM_SHA256']
        assert digest(assets/variant['frozenData']['path']) == variant['frozenData']['sha256']
    for alias in native['sharedLoaderAliases']:
        assert alias['passed'] and alias['generatedProgramIncludingASM_CONSTSMatchesRawShared']
        assert digest(assets/alias['baselineJS']['path']) == alias['installedJS_SHA256']
        assert digest(assets/alias['sharedWASMPath']) == alias['sharedWASM_SHA256']
        assert digest(assets/alias['frozenData']['path']) == alias['frozenData']['sha256']
    ui_path = RECORDS/'all-combat-ui-090-checks.json'
    ui = json.loads(ui_path.read_text())
    assert ui['passed'] and {row['path'] for row in ui['sources']} == UI
    assert all(digest(assets/row['path']) == row['sha256'] for row in ui['sources'])
    assert len(ui['cameraFunctions']) == 35
    assert all(row['unchanged'] and row['sha256'] == row['currentSHA256'] for row in ui['cameraFunctions'])
    report = dict(passed=True, candidateAPK_SHA256=digest(APK), apk=str(APK), bytes=APK.stat().st_size,
                  applicationId='com.rbabbit.warzonetowers.lab', versionCode=90, versionName='0.90',
                  certificateSHA256=SIGNER, sameNormalSigningChain=True, playStoreBuild=False,
                  debuggable=False, aabBuilt=False, userTestBuild=True, publicationExecuted=False,
                  updaterPresent=True, notificationFixRetained=True, signatureAndAlignmentVerified=True,
                  allSourceAssetsMatchAPK=True, assetsCompared=count, changedAssets=changed,
                  allDataMapsMediaUnchanged=True, androidImplementationUnchanged=True,
                  camera088ExperimentExcluded=True, preservedCameraFunctions=35,
                  nativeSourceBuildAndFrozenDataIntegrationVerified=True,
                  nativeIntegrationReportSHA256=digest(native_path), uiSourceCheckSHA256=digest(ui_path),
                  runtimeVerification='Separate exact-APK focused-runtime.json is required before delivery; user approval is required before any publication.')
    (RECORDS/'apk-integrity.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
