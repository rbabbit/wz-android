"""Bind the experimental normal APK to its exact sources and preserved0.91 assets."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import file_digest, sha256
from pathlib import Path
import json
import re
import struct
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE = Path('C:/timerApp/candidates/normal-test-0.91-20261116')
APK = ROOT/'app/build/outputs/apk/release/app-release.apk'
BASE_APK = Path('C:/timerApp/Warzone-Towers-0.91-Test.apk')
RECORDS = ROOT/'release-records'
SDK = Path('C:/Users/punke/AppData/Local/Android/Sdk/build-tools/36.1.0')
JAVA = Path('C:/Program Files/Android/Android Studio/jbr/bin/java.exe')
SIGNER = '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
BASE_SHA = '22825e1ca4420659b81d228649e0564d205ccb3c832044f23da3befc3b22181e'
AAR_SHA = 'fa286aeebe66dcab4a64df017d566cb8ec563c3bb63af527997c3a4e056bf295'
ASSET_CHANGES = {'multiplayer/lobby-http.js', 'multiplayer/lobby-ui.js'}
JAVA_PREFIX = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
ANDROID_CHANGES = {JAVA_PREFIX+n for n in ['MultiplayerActivity.java', 'CronetLobbyHttp.java', 'LobbyHttpPolicy.java']}


def digest(path):
    with Path(path).open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def packed_hash(archive, name):
    with archive.open(name) as stream:
        return file_digest(stream, 'sha256').hexdigest()


def check_elf(data):
    assert data[:4] == b'\x7fELF' and data[5] == 1
    bits = 64 if data[4] == 2 else 32
    phoff = struct.unpack_from('<Q' if bits == 64 else '<I', data, 32 if bits == 64 else 28)[0]
    entsize, count = struct.unpack_from('<HH', data, 54 if bits == 64 else 42)
    alignments = []
    for i in range(count):
        offset = phoff + i*entsize
        if struct.unpack_from('<I', data, offset)[0] == 1:
            alignments.append(struct.unpack_from('<Q' if bits == 64 else '<I', data, offset+(48 if bits == 64 else 28))[0])
    assert alignments and min(alignments) >= (16384 if bits == 64 else 4096), (bits, alignments)
    return dict(bits=bits, loadSegmentAlignments=alignments)


def command(item):
    name, args = item
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    text = result.stdout+result.stderr
    (RECORDS/(name+'.log')).write_text(text, encoding='utf-8')
    assert result.returncode == 0, (name, text[-2000:])
    return name, text


def main():
    assert digest(BASE_APK) == BASE_SHA
    jobs = {
        'apk-signature': [str(JAVA), '--enable-native-access=ALL-UNNAMED', '-jar', str(SDK/'lib/apksigner.jar'), 'verify', '--verbose', '--print-certs', str(APK)],
        'apk-alignment': [str(SDK/'zipalign.exe'), '-c', '-P', '16', '4', str(APK)],
        'apk-badging': [str(SDK/'aapt2.exe'), 'dump', 'badging', str(APK)],
        'apk-manifest': [str(SDK/'aapt2.exe'), 'dump', 'xmltree', str(APK), '--file', 'AndroidManifest.xml'],
    }
    with ThreadPoolExecutor(max_workers=4) as pool:
        proof = dict(pool.map(command, jobs.items()))
    assert SIGNER in proof['apk-signature'].lower()
    assert 'Verified using v2 scheme (APK Signature Scheme v2): true' in proof['apk-signature']
    badging = proof['apk-badging']
    assert "package: name='com.rbabbit.warzonetowers.lab'" in badging
    assert "versionCode='91'" in badging and "versionName='0.91-network.1'" in badging
    assert "minSdkVersion:'26'" in badging and "targetSdkVersion:'36'" in badging
    assert 'application-debuggable' not in badging
    assert 'com.rbabbit.blocknight.warzone.AppUpdateProvider' in proof['apk-manifest']
    assert not (ROOT/'app/build/outputs/bundle').exists()
    assets = ROOT/'app/src/main/assets'
    with zipfile.ZipFile(BASE_APK) as before, zipfile.ZipFile(APK) as after:
        assert after.testzip() is None
        old = {n for n in before.namelist() if n.startswith('assets/') and not n.endswith('/')}
        new = {n for n in after.namelist() if n.startswith('assets/') and not n.endswith('/')}
        assert old == new
        assert new == {'assets/'+p.relative_to(assets).as_posix() for p in assets.rglob('*') if p.is_file()}
        changed = []
        for name in sorted(new):
            value = packed_hash(after, name)
            assert value == digest(assets/name.removeprefix('assets/')), name
            if value != packed_hash(before, name): changed.append(name.removeprefix('assets/'))
        assert set(changed) == ASSET_CHANGES, changed
        libraries = [n for n in after.namelist() if n.startswith('lib/') and n.endswith('.so')]
        aar_paths = list((Path('C:/Users/punke/.gradle/caches/modules-2/files-2.1/org.chromium.net/cronet-bundled/500.1.0')).glob('*/*.aar'))
        assert len(aar_paths) == 1 and digest(aar_paths[0]) == AAR_SHA
        jni = []
        with zipfile.ZipFile(aar_paths[0]) as provider:
            expected = {n.replace('jni/', 'lib/', 1): n for n in provider.namelist() if n.startswith('jni/') and n.endswith('.so')}
            assert set(libraries) == set(expected), libraries
            for name in libraries:
                data = after.read(name)
                assert sha256(data).digest() == sha256(provider.read(expected[name])).digest()
                jni.append(dict(path=name, sha256=sha256(data).hexdigest(), **check_elf(data)))
        dex = b''.join(after.read(n) for n in after.namelist() if n.endswith('.dex'))
        assert b'CronetLobbyHttp;' in dex and b'AppUpdateTransfer;' in dex and b'Check for updates' in dex
    changed_android = []
    originals = {p.relative_to(BASE).as_posix(): p for p in (BASE/'app/src').rglob('*') if p.is_file() and 'assets' not in p.relative_to(BASE/'app/src').parts}
    current = {p.relative_to(ROOT).as_posix(): p for p in (ROOT/'app/src').rglob('*') if p.is_file() and 'assets' not in p.relative_to(ROOT/'app/src').parts}
    assert originals.keys() <= current.keys()
    for name, path in current.items():
        if name not in originals or digest(path) != digest(originals[name]): changed_android.append(name)
    assert set(changed_android) == ANDROID_CHANGES, changed_android
    source_inputs = sorted(ANDROID_CHANGES | {'app/build.gradle.kts'} | {'app/src/main/assets/'+name for name in ASSET_CHANGES})
    source_hashes = {name: digest(ROOT/name) for name in source_inputs}
    java_checks = json.loads((RECORDS/'lobby-cronet-java-checks.json').read_text(encoding='utf-8'))
    assert java_checks['passed'] and java_checks['cronetCompilePassed']
    assert all(source_hashes[name] == value for name, value in java_checks['sourceSHA256'].items())
    report = dict(passed=True, apk=str(APK), sha256=digest(APK), bytes=APK.stat().st_size,
                  versionCode=91, versionName='0.91-network.1', applicationId='com.rbabbit.warzonetowers.lab',
                  certificateSHA256=SIGNER, normalBuild=True, debuggable=False, aabBuilt=False,
                  sourceAssetsCompared=len(new), sourceAssetsAllMatch=True, changedAssets=changed,
                  allNativeGameDataMapsMediaAndPlayersAssetsUnchanged=True, changedAndroidSources=changed_android,
                  sourceSHA256=source_hashes, javaPolicyAndAPICompileProofSHA256=digest(RECORDS/'lobby-cronet-java-checks.json'),
                  jsCancellationAndRecoveryProofSHA256=digest(ROOT/'tools/lobby-network-proof.json'),
                  cronet=dict(artifact='org.chromium.net:cronet-bundled:500.1.0', aarSHA256=AAR_SHA, jni=jni),
                  zipAndELFAlignmentVerified=True, baselineAPK_SHA256=BASE_SHA, publicationPerformed=False,
                  runtimeVerification='Separate exact APK emulator and physical cellular evidence is required.')
    (RECORDS/'apk-integrity.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__': main()
