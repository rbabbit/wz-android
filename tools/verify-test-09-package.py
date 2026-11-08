"""Verify 0.9 benchmark package/source scope and preservation; no gameplay verdict.

The native JS/WASM/data and source-built preview provenance must match tested
0.8 exactly. This release does not rebuild or re-audit the native engine.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import argparse
import json
import os
import re
import runpy
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
QA = ROOT/'qa/test-09'
prior = runpy.run_path(str(ROOT/'tools/verify-test-08-package.py'), run_name='release09_helpers')
digest, read, require, local = (prior[n] for n in ('digest', 'read', 'require', 'local'))
FROZEN = dict(prior['FROZEN'], **{
    'Warzone-Towers-0.8.apk': '751c90f6bb2ec1c1ec2286fabe1e499bc95234e2a2ce8198f763e1876098a3e0',
    'warzone-towers-0.8-source.zip': 'c1a7038d8cb1924399178eead25dfcb36054ba5013994047bb05b78e8496b15a',
    'Warzone-Towers-0.8-SHA256.txt': 'ce200a3ecc3ffe77880e2d0edc48fe782b4968265063022cde568a0d8d5021ec',
})
FALLBACK = BASE/'fallbacks/towers-before-benchmark-0.9-20261107'
STABLE_HEAD = '9280cccad984320503240d9a39e7d766646c1dfe'
REQUIRED_ASSETS = {'assets/warzone-touch-controls.js'}
ALLOWED_ASSETS = REQUIRED_ASSETS
ALLOWED_SOURCE = {'app/src/main/'+n for n in ALLOWED_ASSETS} | {
    'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',
    'app/build.gradle.kts',
}
REQUIRED_SOURCE = ALLOWED_SOURCE
EMULATOR_CHECKS = {
    'statsRemoved', 'compactHeaderAndOverlayInput', 'researchAndBuildReturns',
    'polishedNativeDialog', 'actualNavigationBack', 'cancelAndConfirmReturns',
}


def record(path):
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)}


def zip_digest(archive, name):
    result = sha256()
    with archive.open(name) as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            result.update(block)
    return result.hexdigest()


def dex_defines(data, descriptor):
    """Read actual class_defs, not references, in any standard multidex file."""
    require(len(data) >= 112 and data[:4] == b'dex\n' and data[7] == 0, 'Invalid DEX header')
    def word(offset):
        require(0 <= offset <= len(data)-4, 'Invalid DEX table offset')
        return struct.unpack_from('<I', data, offset)[0]
    strings, strings_at, types, types_at = (word(n) for n in (56, 60, 64, 68))
    count, classes_at = word(96), word(100)
    require(classes_at+count*32 <= len(data), 'Invalid DEX class table')
    for index in range(count):
        type_id = word(classes_at+index*32)
        require(type_id < types, 'Invalid DEX class type')
        string_id = word(types_at+type_id*4)
        require(string_id < strings, 'Invalid DEX type descriptor')
        offset = word(strings_at+string_id*4)
        # Skip the unsigned-LEB128 UTF-16 length preceding the MUTF-8 bytes.
        for _ in range(5):
            require(offset < len(data), 'Invalid DEX string offset')
            byte = data[offset]
            offset += 1
            if byte < 128:
                break
        else:
            raise AssertionError('Invalid DEX string length')
        end = data.find(b'\0', offset)
        require(end >= offset, 'Unterminated DEX descriptor')
        if data[offset:end] == descriptor:
            return True
    return False


def frozen_artifacts():
    # Verify each original/fallback once in the candidate package report.
    records = prior['frozen_artifacts']()
    for name in ('Warzone-Towers-0.8.apk', 'warzone-towers-0.8-source.zip', 'Warzone-Towers-0.8-SHA256.txt'):
        for p in (BASE/name, FALLBACK/name):
            require(digest(p) == FROZEN[name], 'Frozen accepted 0.8 artifact changed: '+str(p))
            records.append({'path': str(p), 'sha256': FROZEN[name]})
    return records


def stable_integrity(full=True):
    stable = BASE/'wz-tower-defense'
    require(subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=stable, text=True) == '', 'Stable project changed')
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=stable, text=True).strip()
    require(head == STABLE_HEAD, 'Stable commit changed')
    manifest = stable/'archive/repository-files.json'
    entries = read(manifest)['files']
    if full:
        for entry in entries:
            p = (stable/entry['path']).resolve()
            require(p.is_relative_to(stable) and p.is_file() and p.stat().st_size == entry['bytes'] and digest(p) == entry['sha256'], 'Stable source changed: '+entry['path'])
    return {'head': head, 'gitStatus': '', 'manifestSHA256': digest(manifest), 'manifestFiles': len(entries), 'allManifestFilesVerified': full}


def signing_certificate(apk, sdk):
    java = Path(os.environ.get('JAVA_HOME', r'C:\Program Files\Android\Android Studio\jbr'))/'bin/java.exe'
    jar = sdk/'build-tools/36.1.0/lib/apksigner.jar'
    require(java.is_file() and jar.is_file(), 'Configure JDK and Android build-tools 36.1.0')
    result = subprocess.check_output([str(java), '--enable-native-access=ALL-UNNAMED', '-jar', str(jar), 'verify', '--print-certs', str(apk)], text=True, encoding='utf-8')
    hashes = re.findall(r'^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})\s*$', result, re.M)
    require(len(hashes) == 1, 'Expected one verified APK signing certificate')
    return hashes[0].lower()


def verify(apk_path):
    candidate = digest(apk_path)
    artifacts = frozen_artifacts()
    source_files, native_files = [], []
    with ZipFile(BASE/'Warzone-Towers-0.8.apk') as old, ZipFile(apk_path) as apk, ZipFile(BASE/'warzone-towers-0.8-source.zip') as source:
        require(apk.testzip() is None, 'APK CRC mismatch')
        old_names = {n for n in old.namelist() if not n.endswith('/')}
        names = {n for n in apk.namelist() if not n.endswith('/')}
        require(len(names) == len(apk.namelist()), 'Duplicate APK entry or directory entry')
        require(names == old_names, 'APK inventory changed')
        changed = {n for n in names if zip_digest(old, n) != zip_digest(apk, n)}
        allowed_apk = ALLOWED_ASSETS | {'AndroidManifest.xml'} | {n for n in names if re.fullmatch(r'classes\d*\.dex', n) or n.startswith('META-INF/')}
        require(changed <= allowed_apk, 'APK change outside Stats/dialog benchmark scope: '+str(changed-allowed_apk))
        dex_files = {n for n in names if re.fullmatch(r'classes\d*\.dex', n)}
        activity_dex = {n for n in dex_files if dex_defines(apk.read(n), b'Lcom/rbabbit/blocknight/warzone/MainActivity;')}
        require(len(activity_dex) == 1 and activity_dex <= changed and REQUIRED_ASSETS <= changed, 'Expected Stats/dialog benchmark implementation missing')
        assets = {n for n in names if n.startswith('assets/')}
        current = {'assets/'+p.relative_to(ROOT/'app/src/main/assets').as_posix(): p for p in (ROOT/'app/src/main/assets').rglob('*') if p.is_file()}
        require(current.keys() == assets, 'Source/APK asset inventory differs')
        for name,p in current.items():
            require(digest(p) == zip_digest(apk, name), 'Stale source asset: '+name)
        source_names = set(source.namelist())
        runtime = sorted(p for p in (ROOT/'app/src').rglob('*') if p.is_file())+[ROOT/'app/build.gradle.kts']
        runtime_names = {p.relative_to(ROOT).as_posix() for p in runtime}
        old_runtime = {n for n in source_names if n.startswith('app/src/') and not n.endswith('/')} | {'app/build.gradle.kts'}
        require(runtime_names == old_runtime, 'Runtime source inventory changed')
        changed_source = set()
        for p in runtime:
            name = p.relative_to(ROOT).as_posix()
            rec = record(p)
            source_files.append(rec)
            if rec['sha256'] != zip_digest(source, name):
                changed_source.add(name)
        require(changed_source <= ALLOWED_SOURCE and REQUIRED_SOURCE <= changed_source, 'Unexpected/missing runtime source changes: '+str(changed_source))
        preserved = {n for n in source_names if n.startswith(('vendor/', 'map/', 'scenario/')) and not n.endswith('/')}
        actual_preserved = {p.relative_to(ROOT).as_posix() for folder in ('vendor', 'map', 'scenario') for p in (ROOT/folder).rglob('*') if p.is_file()}
        require(actual_preserved == preserved, 'Scenario/map/mod inventory changed')
        for name in sorted(preserved):
            p = local(name)
            require(digest(p) == zip_digest(source, name), 'Scenario/map/mod changed: '+name)
        baseline = json.loads(source.read('qa/test-08/package-verification.json'))
        require(baseline['candidateAPK_SHA256'] == FROZEN['Warzone-Towers-0.8.apk'], 'Wrong prior tested package report')
        for entry in baseline['nativeSourceFiles']:
            p = local(entry['path'])
            require(digest(p) == entry['sha256'], 'Existing native source/provenance changed: '+entry['path'])
            native_files.append(record(p))
        native_hashes = {n:zip_digest(apk, 'assets/warzone/'+n) for n in ('warzone2100.js', 'warzone2100.wasm', 'warzone2100.data')}
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home()/'AppData/Local/Android/Sdk')))
    aapt = sdk/'build-tools/36.1.0/aapt2.exe'
    require(aapt.is_file(), 'Configure Android build-tools 36.1.0')
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk_path)], text=True, encoding='utf-8')
    for token in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='9'", "versionName='0.9'", "application-label:'Warzone Towers'"):
        require(token in badging, 'Wrong APK identity: '+token)
    certificate = signing_certificate(apk_path, sdk)
    require(certificate == signing_certificate(BASE/'Warzone-Towers-0.8.apk', sdk), 'APK update signing certificate changed')
    return {'passed': True, 'verification': 'Package/source/preservation only; scoped real gameplay and manual screenshot review are separate',
            'candidateAPK_SHA256': candidate, 'package': 'com.rbabbit.warzonetowers.lab', 'label': 'Warzone Towers', 'version': '0.9', 'versionCode': 9,
            'baselineAPK_SHA256': FROZEN['Warzone-Towers-0.8.apk'], 'sameSigningCertificateSHA256': certificate,
            'compiledEngineUnchanged': True, 'nativePayloadSHA256': native_hashes, 'originalResourcesIconMapsModRulesAndOtherLayoutsPreserved': True,
            'modifiedAssets': sorted(changed & assets), 'changedRuntimeFiles': sorted(changed_source), 'sourceAssetsMatchAPK': len(current),
            'mainActivityDEX': next(iter(activity_dex)),
            'sourceFiles': source_files, 'nativeSourceFiles': native_files, 'preservedArtifacts': artifacts, 'stable': stable_integrity()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--out', type=Path, default=QA/'package-verification.json')
    args = parser.parse_args()
    report = verify(args.apk)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k not in {'sourceFiles','nativeSourceFiles','preservedArtifacts'}}, indent=2))


if __name__ == '__main__':
    main()
