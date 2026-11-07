"""Package 0.5 only after exact delivery APK gameplay and scoped source-build gates.

qa/test-05/DELIVERY.json binds the candidate SHA256, reports and screenshots.
Required reports each have passed:true and candidateAPK_SHA256; source and
screenshots are rehashed before packaging. Passing this script is not a claim
of device compatibility or terrain visual verification beyond those reports.
"""
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
QA = ROOT/'qa/test-05'
helpers = runpy.run_path(str(ROOT/'tools/verify-test-05-package.py'), run_name='preview_release_helpers')
digest, read, require, local, frozen_artifacts, native_inputs = (helpers[n] for n in ('digest', 'read', 'require', 'local', 'frozen_artifacts', 'native_inputs'))
REQUIRED = {'package-verification.json', 'code-checks.json', 'emulator-verification.json',
            'visual-review.json', 'native-build-verification.json', 'final-integrity.json'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--output', type=Path, default=BASE)
    args = parser.parse_args()
    candidate = digest(args.apk)
    gate = read(QA/'DELIVERY.json')
    require(all(gate.get(k) is True for k in ('passed', 'emulatorTesting', 'gameplayTesting', 'visualReview')), 'Delivery gate incomplete')
    require(gate.get('candidateAPK_SHA256') == candidate and gate.get('version') == '0.5' and gate.get('package') == 'com.rbabbit.warzonetowers.lab', 'Delivery identity differs')
    reports = gate.get('reports', [])
    names = [e['path'] for e in reports]
    require(len(names) == len(set(names)) and {'qa/test-05/'+n for n in REQUIRED} <= set(names), 'Missing/duplicate required evidence')
    for entry in reports:
        file = local(entry['path'])
        value = read(file)
        require(digest(file) == entry['sha256'] and value.get('passed') is True, 'Required evidence changed/failed: '+entry['path'])
        require(value.get('candidateAPK_SHA256') == candidate, 'Required evidence belongs to another APK: '+entry['path'])
    for entry in gate.get('supportingReports', []):
        require(entry['path'] not in names and digest(local(entry['path'])) == entry['sha256'], 'Supporting evidence changed or counted as pass')
    emulator, code, visual, package, native, integrity = (read(QA/name) for name in ('emulator-verification.json', 'code-checks.json', 'visual-review.json', 'package-verification.json', 'native-build-verification.json', 'final-integrity.json'))
    require(all(emulator.get(k) is True for k in ('emulatorTesting', 'gameplayTesting')), 'Real emulator gameplay evidence required')
    require(emulator.get('installedAPK_SHA256') == candidate, 'Installed APK differs from candidate')
    require(all(emulator.get('checks', {}).get(k) is True for k in helpers['EMULATOR_CHECKS']), 'A relevant emulator check is missing')
    require(all(code.get('checks', {}).get(k) is True for k in helpers['CODE_CHECKS']), 'A relevant renderer/input source check is missing')
    screenshots = visual.get('screenshots', [])
    require(visual.get('reviewed') is True and screenshots, 'Actual screenshot review missing')
    for entry in screenshots:
        p = local(entry['path'])
        require(p.suffix.lower() == '.png' and p.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') and digest(p) == entry['sha256'], 'Reviewed screenshot missing/changed')
        require(entry.get('accepted') is True, 'Rejected/unreviewed screenshot in pass evidence')
    require(isinstance(gate.get('limitations'), list) and isinstance(visual.get('limitations'), list), 'Explicit verification limitations must be recorded')
    require(native.get('sourceBuild') is True and native.get('scopeVerified') is True, 'Scoped native source-build review missing')
    require(package.get('version') == '0.5' and package.get('sourceBuiltNativePreviewCorrection') is True, 'Stale package report')
    for entry in package['sourceFiles']+package['scenarioSourceFiles']+package['nativeSourceFiles']:
        require(digest(local(entry['path'])) == entry['sha256'], 'Source changed after package verification: '+entry['path'])
    native_inputs()
    frozen_artifacts()
    for entry in integrity.get('artifacts', []):
        require(digest(Path(entry['path'])) == entry['sha256'], 'Older/copy artifact changed: '+entry['path'])
    stable = BASE/'wz-tower-defense'
    require(subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=stable, text=True) == '', 'Stable project changed')
    require(subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=stable, text=True).strip() == '9280cccad984320503240d9a39e7d766646c1dfe', 'Stable commit changed')
    manifest = read(ROOT/'archive/repository-files.json')['files']
    for entry in manifest:
        p = local(entry['path'])
        require(p.stat().st_size == entry['bytes'] and digest(p) == entry['sha256'], 'Source manifest stale: '+entry['path'])
    listed = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    files = []
    for name in sorted(set(filter(None, listed))):
        relative = Path(name)
        if any(part in {'.git', '.gradle', '.kotlin', '.idea', 'build', 'node_modules', '__pycache__'} for part in relative.parts):
            continue
        require(relative.suffix.lower() not in {'.jks', '.keystore', '.pyc', '.pem', '.p12', '.pfx'} and not relative.name.startswith('.env') and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local file in source list: '+name)
        p = local(name)
        if p.is_file():
            files.append((name, p))
    archive_names = {n for n,_ in files}
    require({e['path'] for e in manifest} <= archive_names and 'archive/repository-files.json' in archive_names, 'Source archive list incomplete')
    require({e['path'] for e in package['nativeSourceFiles']} <= archive_names, 'Native source/provenance omitted from archive')
    apk, source, checksums = (args.output/n for n in ('Warzone-Towers-0.5.apk', 'warzone-towers-0.5-source.zip', 'Warzone-Towers-0.5-SHA256.txt'))
    partial = source.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk, source, checksums, partial)), 'Existing delivery or partial archive must not be overwritten')
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=5) as archive:
        for name,p in files:
            archive.write(p, name)
    with ZipFile(partial) as archive:
        require(archive.testzip() is None and len(archive.namelist()) == len(archive_names) and set(archive.namelist()) == archive_names, 'Source CRC/inventory mismatch')
        for name,p in files:
            require(sha256(archive.read(name)).hexdigest() == digest(p), 'Archived source differs: '+name)
    require(digest(args.apk) == candidate, 'APK changed during archive creation')
    shutil.copyfile(args.apk, apk)
    require(digest(apk) == candidate, 'Copied APK differs')
    partial.rename(source)
    checksums.write_text(f'{candidate}  {apk.name}\n{digest(source)}  {source.name}\n', encoding='utf-8')
    print(json.dumps({'apk':str(apk), 'candidateAPK_SHA256':candidate, 'source':str(source), 'sourceZIP_SHA256':digest(source), 'sourceFiles':len(files), 'checksums':str(checksums)}, indent=2))


if __name__ == '__main__':
    main()
