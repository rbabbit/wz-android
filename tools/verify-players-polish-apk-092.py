"""Verify the normal0.92 Players UI APK against accepted0.91-network.1."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import file_digest
from pathlib import Path
import json, re, subprocess, zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE = Path('C:/timerApp/candidates/mobile-network-test-20261117')
BASE_APK = BASE / 'app/build/outputs/apk/release/app-release.apk'
BASE_SHA = 'a19848c0ecfac6a4b20b1510f5889b771fd739de340da7e842916d59cfe020d3'
APK = ROOT / 'app/build/outputs/apk/release/app-release.apk'
RECORDS = ROOT / 'release-records'
SDK = Path('C:/Users/punke/AppData/Local/Android/Sdk/build-tools/36.1.0')
JAVA = Path('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')
SIGNER = '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
ASSET_CHANGES = {'warzone-command-pages.js', 'warzone/ui/towers-game-controls.css'}
NEW_ASSETS = {'warzone/ui/icons/eye.svg'}
EYE_SHA = '766b10b6ed7d8a899a76ba28f3f066ca49e8ce0a75ae68b65bfec0e615d8130d'

def digest(path):
    with Path(path).open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()

def packed_hash(archive, name):
    with archive.open(name) as stream:
        return file_digest(stream, 'sha256').hexdigest()

def command(item):
    name, args = item
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    text = result.stdout + result.stderr
    (RECORDS / (name + '.log')).write_text(text, encoding='utf-8')
    assert result.returncode == 0, (name, text[-2000:])
    return name, text

def without_version(text):
    return re.sub(r'(?m)^(\s*version(?:Code|Name)\s*=).+$', r'\1 VERSION', text.replace('\r\n', '\n'))

def main():
    RECORDS.mkdir(exist_ok=True)
    assert digest(BASE_APK) == BASE_SHA, 'Preserve the accepted exact baseline APK'
    jobs = {
        'apk-signature': [str(JAVA), '--enable-native-access=ALL-UNNAMED', '-jar', str(SDK / 'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', str(APK)],
        'apk-alignment': [str(SDK / 'zipalign.exe'), '-c', '-P', '16', '4', str(APK)],
        'apk-badging': [str(SDK / 'aapt2.exe'), 'dump', 'badging', str(APK)],
        'apk-manifest': [str(SDK / 'aapt2.exe'), 'dump', 'xmltree', str(APK), '--file', 'AndroidManifest.xml'],
    }
    with ThreadPoolExecutor(max_workers=4) as pool:
        proof = dict(pool.map(command, jobs.items()))
    assert SIGNER in proof['apk-signature'].lower()
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in proof['apk-signature']
    badging = proof['apk-badging']
    assert "package: name='com.rbabbit.warzonetowers.lab'" in badging
    assert "versionCode='92'" in badging and "versionName='0.92'" in badging
    assert "minSdkVersion:'26'" in badging and "targetSdkVersion:'36'" in badging
    assert 'application-debuggable' not in badging
    assert 'com.rbabbit.blocknight.warzone.AppUpdateProvider' in proof['apk-manifest']
    assert not (ROOT / 'app/build/outputs/bundle').exists(), 'No AAB is authorized'
    assert digest(ROOT / 'tools/build-normal-apk.py') == digest(BASE / 'tools/build-normal-apk.py')
    assert without_version((ROOT / 'app/build.gradle.kts').read_text()) == without_version((BASE / 'app/build.gradle.kts').read_text()), 'Only version metadata may change in Gradle'
    assets = ROOT / 'app/src/main/assets'
    changed = []
    with zipfile.ZipFile(BASE_APK) as before, zipfile.ZipFile(APK) as after:
        assert after.testzip() is None
        old = {name for name in before.namelist() if name.startswith('assets/') and not name.endswith('/')}
        new = {name for name in after.namelist() if name.startswith('assets/') and not name.endswith('/')}
        assert old == new - {'assets/' + name for name in NEW_ASSETS}
        assert new == {'assets/' + p.relative_to(assets).as_posix() for p in assets.rglob('*') if p.is_file()}
        for name in sorted(new):
            value = packed_hash(after, name)
            assert value == digest(assets / name.removeprefix('assets/')), name
            if name in old and value != packed_hash(before, name): changed.append(name.removeprefix('assets/'))
        assert set(changed) == ASSET_CHANGES, changed
        assert packed_hash(after, 'assets/warzone/ui/icons/eye.svg') == EYE_SHA
        old_libraries = {name for name in before.namelist() if name.startswith('lib/') and name.endswith('.so')}
        libraries = {name for name in after.namelist() if name.startswith('lib/') and name.endswith('.so')}
        assert old_libraries == libraries
        library_proof = []
        for name in sorted(libraries):
            value = packed_hash(after, name)
            assert value == packed_hash(before, name), 'Frozen Cronet library changed: ' + name
            library_proof.append(dict(path=name, sha256=value))
        dex = b''.join(after.read(name) for name in after.namelist() if name.endswith('.dex'))
        assert b'CronetLobbyHttp;' in dex and b'Check for updates' in dex
    def android_sources(base):
        return {p.relative_to(base).as_posix(): digest(p) for p in (base / 'app/src').rglob('*') if p.is_file() and 'assets' not in p.relative_to(base / 'app/src').parts}
    assert android_sources(ROOT) == android_sources(BASE), 'Java, manifest or Android resources changed outside UI scope'
    sources = {'app/build.gradle.kts': digest(ROOT / 'app/build.gradle.kts')}
    sources.update({'app/src/main/assets/' + name: digest(assets / name) for name in sorted(ASSET_CHANGES | NEW_ASSETS)})
    ui_path = RECORDS / 'players-ui-092-checks.json'
    ui = json.loads(ui_path.read_text(encoding='utf-8-sig'))
    assert ui.get('passed') is True
    assert {row['path'] for row in ui['sources']} == ASSET_CHANGES | NEW_ASSETS
    assert all(row['sha256'] == digest(assets / row['path']) for row in ui['sources'])
    report = dict(passed=True, apk=str(APK), candidateAPK_SHA256=digest(APK), bytes=APK.stat().st_size,
                  versionCode=92, versionName='0.92', applicationId='com.rbabbit.warzonetowers.lab', certificateSHA256=SIGNER,
                  normalBuild=True, debuggable=False, aabBuilt=False, sourceAssetsAllMatch=True,
                  sourceAssetsCompared=len(new), changedAssets=changed, newAssets=sorted(NEW_ASSETS), sourceSHA256=sources,
                  androidSourcesUnchanged=True, cronetLibrariesUnchanged=True, cronetLibraries=library_proof,
                  nativeEnginesDataMapsMediaAndNetworkingUnchanged=True, normalBuilderUnchanged=True,
                  gradleOnlyVersionMetadataChanged=True, playersUIProofSHA256=digest(ui_path), baselineAPK_SHA256=BASE_SHA,
                  publicationPerformed=False, runtimeVerification='Exact0.92 emulator UI evidence is a separate required gate.')
    (RECORDS / 'apk-integrity.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__': main()
