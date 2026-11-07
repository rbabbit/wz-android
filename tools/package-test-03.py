"""Package the module-fix APK and complete source after scoped exact-APK gates."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from hashlib import sha256
import argparse
import json
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
QA = ROOT/'qa/test-03'
legacy = runpy.run_path(str(ROOT/'tools/package-test.py'), run_name='archive_helpers')
digest, read, require, local = (legacy[n] for n in ('digest', 'read', 'require', 'local'))
CHECKS = {'powerModuleSelection', 'powerModuleCompletion', 'ordinaryConstruction', 'truckSelection', 'inputReturns', 'branding'}
FROZEN = dict(legacy['FROZEN'], **{
    'Warzone-Towers-Test-02.apk': '64324e568fd21ac449958d3f0d6e0f289e1ef9a06befd1d05de550fee272822f',
    'warzone-towers-test-02-source.zip': 'df8f76b11810c3978f4e96bd0c5dc2c27546c3a2793475bfb7685d6e7adb7dff',
})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--output', type=Path, default=BASE)
    args = parser.parse_args()
    candidate = digest(args.apk)
    gate, emulator, package = (read(QA/name) for name in ('DELIVERY.json', 'emulator-verification.json', 'package-verification.json'))
    for report in (gate, emulator):
        require(all(report.get(k) is True for k in ('passed', 'emulatorTesting', 'gameplayTesting')), 'Scoped delivery/emulator gate did not pass')
        require(report.get('candidateAPK_SHA256') == candidate, 'Gate is for a different APK')
    require(emulator.get('installedAPK_SHA256') == candidate, 'Installed emulator APK differs')
    require(all(emulator.get('checks', {}).get(k) is True for k in CHECKS), 'Required scoped emulator check is missing')
    reports = gate['reports']
    require({'qa/test-03/package-verification.json', 'qa/test-03/emulator-verification.json', 'qa/test-03/code-checks.json', 'qa/test-03/final-integrity.json'} <= {e['path'] for e in reports}, 'Missing required Test 03 evidence')
    for entry in reports:
        path = local(entry['path']);require(digest(path) == entry['sha256'], 'Evidence changed: '+entry['path'])
        require(read(path).get('passed') is True, 'Failed required evidence: '+entry['path'])
    for entry in gate.get('supportingReports', []):
        require(digest(local(entry['path'])) == entry['sha256'], 'Supporting evidence changed')
    require(package['passed'] and package['candidateAPK_SHA256'] == candidate, 'Stale package report')
    for entry in package['sourceFiles']+package['scenarioSourceFiles']:
        require(digest(local(entry['path'])) == entry['sha256'], 'Source changed after APK verification: '+entry['path'])
    for name, expected in FROZEN.items():
        require(digest(BASE/name) == expected, 'Frozen older artifact changed: '+name)
    fallback = BASE/'fallbacks/towers-before-module-fix-20261107'
    for name in ('Warzone-Towers-Test-02.apk', 'warzone-towers-test-02-source.zip'):
        require(digest(fallback/name) == FROZEN[name], 'Initial module-fix fallback changed')
    stable = BASE/'wz-tower-defense'
    require(subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=stable, text=True) == '', 'Stable project changed')
    require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=stable, text=True).strip() == '9280cccad984320503240d9a39e7d766646c1dfe', 'Stable commit changed')
    manifest = read(ROOT/'archive/repository-files.json')['files']
    for entry in manifest:
        p = local(entry['path'])
        require(p.stat().st_size == entry['bytes'] and digest(p) == entry['sha256'], 'Source manifest stale: '+entry['path'])
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    files = []
    for name in sorted(set(filter(None, names))):
        relative = Path(name)
        if any(p in {'.git', '.gradle', '.kotlin', '.idea', 'build', 'node_modules', '__pycache__'} for p in relative.parts):
            continue
        require(relative.suffix not in {'.jks', '.keystore', '.pyc'} and not relative.name.startswith('.env') and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local file in source list')
        p = (ROOT/name).resolve();require(p.is_relative_to(ROOT), 'Archive path escapes project')
        if p.is_file():
            files.append((name, p))
    archive_names = {n for n, _ in files}
    require({e['path'] for e in manifest} <= archive_names and 'archive/repository-files.json' in archive_names, 'Incomplete source archive list')
    apk, source, checksums = (args.output/n for n in ('Warzone-Towers-0.3.apk', 'warzone-towers-0.3-source.zip', 'Warzone-Towers-0.3-SHA256.txt'))
    partial = source.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk, source, checksums, partial)), 'Do not overwrite older or existing deliveries')
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=5) as zipped:
        for name, path in files:
            zipped.write(path, name)
    with ZipFile(partial) as zipped:
        require(zipped.testzip() is None and set(zipped.namelist()) == archive_names, 'Source archive CRC/list mismatch')
        for name, path in files:
            require(sha256(zipped.read(name)).hexdigest() == digest(path), 'Source archive differs: '+name)
    shutil.copyfile(args.apk, apk);require(digest(apk) == candidate, 'APK changed during packaging')
    partial.rename(source)
    checksums.write_text(f'{candidate}  {apk.name}\n{digest(source)}  {source.name}\n', encoding='utf-8')
    print(json.dumps({'apk': str(apk), 'candidateAPK_SHA256': candidate, 'source': str(source), 'sourceZIP_SHA256': digest(source), 'sourceFiles': len(files), 'checksums': str(checksums)}, indent=2))


if __name__ == '__main__':
    main()
