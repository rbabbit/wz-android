"""Package Test 02 only after exact-APK emulator evidence and source checks pass.

The frozen Lab 01 and v6.4 deliverables are never overwritten.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import file_digest, sha256
import argparse
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
QA = ROOT/'qa/test-02'
CHECKS = {
    'truckSelection', 'smoothConstruction', 'constructionQueues', 'movement', 'research',
    'production', 'saves', 'menuReturns', 'dustfallCamera', 'dustfallMinimapTouchPlacement',
    'branding', 'compactLayout',
}
FROZEN = {
    'Warzone-Towers-v6.4-Build-Blueprints.apk': '12532300d9ce2010b911fae879a6e197eb059a98bd672901bd65307cd9f3532a',
    'warzone-towers-v6.4-build-blueprints-source.zip': '46346399ae4df757b2e9f7178fb427b2ae5c66c0352fb1c8e99d63da3302b610',
    'Warzone-Towers-Lab-01.apk': '6dafb70bff1dfec5614de3403b5e169f8d720c9507c6f612d0000de9ecf5118c',
    'warzone-towers-lab-01-source.zip': '4d63f34d6fdc1c64b34a106c18c2e61bc2e8e4d59638aaae32fac8fe4ac197f7',
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def local(name):
    path = (ROOT/name).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing or external project file: '+name)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--output', type=Path, default=BASE)
    args = parser.parse_args()
    candidate = digest(args.apk)
    gate = read(QA/'DELIVERY.json')
    for field in ('passed', 'emulatorTesting', 'gameplayTesting'):
        require(gate.get(field) is True, 'Delivery gate requires '+field)
    require(gate.get('candidateAPK_SHA256') == candidate, 'Delivery gate is for a different APK')
    reports = gate.get('reports', [])
    names = {entry['path'] for entry in reports}
    required = {'qa/test-02/package-verification.json', 'qa/test-02/emulator-verification.json'}
    require(required <= names and len(names) == len(reports), 'Missing or duplicate required delivery reports')
    for entry in reports:
        report_path = local(entry['path'])
        require(digest(report_path) == entry['sha256'], 'Evidence changed: '+entry['path'])
        if report_path.suffix == '.json':
            report = read(report_path)
            require(report.get('passed') is True, 'Failed evidence: '+entry['path'])
            for value in (report.get('candidateAPK_SHA256'), report.get('installedAPK_SHA256'), report.get('identity', {}).get('candidateAPK_SHA256')):
                require(not value or value == candidate, 'Wrong APK in evidence: '+entry['path'])
    # Setup diagnostics and an interrupted all-phases log remain reviewable,
    # but cannot be counted among the required passing gameplay reports.
    for entry in gate.get('supportingReports', []):
        require(entry['path'] not in names, 'Supporting evidence also appears as a passing report')
        require(digest(local(entry['path'])) == entry['sha256'], 'Supporting evidence changed: '+entry['path'])
    emulator = read(QA/'emulator-verification.json')
    for field in ('passed', 'emulatorTesting', 'gameplayTesting'):
        require(emulator.get(field) is True, 'Emulator report requires '+field)
    require(emulator.get('candidateAPK_SHA256') == candidate and emulator.get('installedAPK_SHA256') == candidate, 'Installed emulator APK was not the delivery APK')
    for name in CHECKS:
        require(emulator.get('checks', {}).get(name) is True, 'Unverified emulator check: '+name)
    package = read(QA/'package-verification.json')
    require(package.get('passed') is True and package.get('candidateAPK_SHA256') == candidate, 'Package check is stale')
    for record in package['sourceFiles']+package['scenarioSourceFiles']:
        require(digest(local(record['path'])) == record['sha256'], 'Source changed after APK verification: '+record['path'])
    for name, expected in FROZEN.items():
        require(digest(BASE/name) == expected, 'Frozen fallback changed: '+name)
    fallback = BASE/'fallbacks/towers-test-before-fixes-20261107'
    for name in ('Warzone-Towers-Lab-01.apk', 'warzone-towers-lab-01-source.zip'):
        require(digest(fallback/name) == FROZEN[name], 'Initial test fallback changed: '+name)
    stable = BASE/'wz-tower-defense'
    require(subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=stable, text=True) == '', 'Stable project working tree changed')
    require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=stable, text=True).strip() == '9280cccad984320503240d9a39e7d766646c1dfe', 'Stable project commit changed')
    manifest_path = ROOT/'archive/repository-files.json'
    manifest = read(manifest_path)['files']
    for record in manifest:
        file = local(record['path'])
        require(file.stat().st_size == record['bytes'] and digest(file) == record['sha256'], 'Archive manifest is stale: '+record['path'])
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    files = []
    excluded = {'.git', '.gradle', '.kotlin', '.idea', 'build', 'node_modules', '__pycache__'}
    for name in sorted(set(filter(None, names))):
        relative = Path(name)
        if any(part in excluded for part in relative.parts):
            continue
        require(relative.suffix not in {'.jks', '.keystore', '.pyc'} and not relative.name.startswith('.env') and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local file in archive list: '+name)
        path = (ROOT/name).resolve()
        require(path.is_relative_to(ROOT), 'Archive path escapes project: '+name)
        if path.is_file():
            files.append((name, path))
    archive_names = {name for name, _ in files}
    require({record['path'] for record in manifest} <= archive_names, 'Manifest files missing from source archive')
    require(manifest_path.relative_to(ROOT).as_posix() in archive_names, 'Source archive lacks its manifest')
    apk = args.output/'Warzone-Towers-Test-02.apk'
    source = args.output/'warzone-towers-test-02-source.zip'
    hashes = args.output/'Warzone-Towers-Test-02-SHA256.txt'
    partial = source.with_suffix('.zip.partial')
    require(not any(path.exists() for path in (apk, source, hashes, partial)), 'Never overwrite an existing delivery; choose another output directory')
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=5) as zipped:
        for name, path in files:
            zipped.write(path, name)
    with ZipFile(partial) as zipped:
        require(zipped.testzip() is None, 'Source archive CRC verification failed')
        require(set(zipped.namelist()) == archive_names, 'Source archive file list differs')
        for name, path in files:
            require(sha256(zipped.read(name)).hexdigest() == digest(path), 'Source archive content differs: '+name)
        require(read(QA/'DELIVERY.json') == json.loads(zipped.read('qa/test-02/DELIVERY.json')), 'Delivery gate changed during packaging')
    # Copy the APK after archive verification, then publish the new source archive.
    shutil.copyfile(args.apk, apk)
    require(digest(apk) == candidate, 'APK changed during packaging')
    partial.rename(source)
    hashes.write_text(f'{candidate}  {apk.name}\n{digest(source)}  {source.name}\n', encoding='utf-8')
    print(json.dumps({'apk': str(apk), 'candidateAPK_SHA256': candidate, 'source': str(source), 'sourceZIP_SHA256': digest(source), 'sourceFiles': len(files), 'checksums': str(hashes)}, indent=2))


if __name__ == '__main__':
    main()
