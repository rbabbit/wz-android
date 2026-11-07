"""Package 0.4 only after exact-APK module gameplay, visual and preservation gates."""
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
QA = ROOT/'qa/test-04'
previous = runpy.run_path(str(ROOT/'tools/package-test-03.py'), run_name='archive_helpers')
digest, read, require, local = (previous[n] for n in ('digest', 'read', 'require', 'local'))
CHECKS = {
    'moduleGuidance', 'moduleTargeting', 'modulePreviewCleanup', 'moduleRepeatFeedback',
    'continuousModulePlacement', 'researchModuleCompletion', 'powerModuleCompletion',
    'factoryModuleCompletion', 'factoryTwoLevelFIFO', 'ordinaryConstruction',
    'saveLoad', 'inputReturns', 'layout',
}
FROZEN = dict(previous['FROZEN'], **{
    'Warzone-Towers-0.3.apk': 'a623655e457bb8e397267b711a019b3787a22402b29cd182444f3a21bdae8ef4',
    'warzone-towers-0.3-source.zip': '6848f58e6e1340a2535ad67c1ac3f0afbce828b76893a92b1ff13a1a83fe92f6',
})
FALLBACK = BASE/'fallbacks/towers-before-module-ui-fix-20261107'
REQUIRED = {'package-verification.json', 'code-checks.json', 'emulator-verification.json',
            'final-integrity.json', 'visual-review.json'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--output', type=Path, default=BASE)
    args = parser.parse_args()
    candidate = digest(args.apk)
    gate, emulator, package = (read(QA/name) for name in ('DELIVERY.json', 'emulator-verification.json', 'package-verification.json'))
    for report in (gate, emulator):
        require(all(report.get(k) is True for k in ('passed', 'emulatorTesting', 'gameplayTesting')), 'Required delivery/emulator gate did not pass')
        require(report.get('candidateAPK_SHA256') == candidate, 'Gate is for a different APK')
    require(gate.get('visualReview') is True, 'Actual visual review did not pass')
    require(emulator.get('installedAPK_SHA256') == candidate, 'Installed emulator APK differs')
    require(all(emulator.get('checks', {}).get(k) is True for k in CHECKS), 'A required module/gameplay check is missing')
    reports = gate['reports']
    names = {e['path'] for e in reports}
    require({'qa/test-04/'+n for n in REQUIRED} <= names and len(names) == len(reports), 'Missing or duplicate Test04 evidence')
    for entry in reports:
        path = local(entry['path'])
        require(digest(path) == entry['sha256'] and read(path).get('passed') is True, 'Required evidence changed or failed: '+entry['path'])
    for entry in gate.get('supportingReports', []):
        require(entry['path'] not in names and digest(local(entry['path'])) == entry['sha256'], 'Supporting evidence changed or was counted as a pass')
    require(package.get('passed') is True and package.get('candidateAPK_SHA256') == candidate and package.get('version') == '0.4', 'Stale/wrong package report')
    for entry in package['sourceFiles']+package['scenarioSourceFiles']:
        require(digest(local(entry['path'])) == entry['sha256'], 'Source changed after APK verification: '+entry['path'])
    for name, expected in FROZEN.items():
        require(digest(BASE/name) == expected, 'Frozen older artifact changed: '+name)
    for name in ('Warzone-Towers-0.3.apk', 'warzone-towers-0.3-source.zip'):
        require(digest(FALLBACK/name) == FROZEN[name], 'Initial 0.3 fallback changed: '+name)
    integrity = read(QA/'final-integrity.json')
    for entry in integrity['artifacts']:
        require(digest(Path(entry['path'])) == entry['sha256'], 'Preserved older/copy artifact changed: '+entry['path'])
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
        if any(p in {'.git', '.gradle', '.kotlin', '.idea', 'build', 'node_modules', '__pycache__'} for p in relative.parts):
            continue
        require(relative.suffix not in {'.jks', '.keystore', '.pyc'} and not relative.name.startswith('.env') and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local file in source list')
        p = (ROOT/name).resolve()
        require(p.is_relative_to(ROOT), 'Archive path escapes project')
        if p.is_file():
            files.append((name, p))
    archive_names = {n for n, _ in files}
    require({e['path'] for e in manifest} <= archive_names and 'archive/repository-files.json' in archive_names, 'Incomplete source archive list')
    apk, source, checksums = (args.output/n for n in ('Warzone-Towers-0.4.apk', 'warzone-towers-0.4-source.zip', 'Warzone-Towers-0.4-SHA256.txt'))
    partial = source.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk, source, checksums, partial)), 'Do not overwrite an existing delivery or partial archive')
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=5) as zipped:
        for name, path in files:
            zipped.write(path, name)
    with ZipFile(partial) as zipped:
        require(zipped.testzip() is None and set(zipped.namelist()) == archive_names, 'Source archive CRC/list mismatch')
        for name, path in files:
            require(sha256(zipped.read(name)).hexdigest() == digest(path), 'Source archive differs: '+name)
    shutil.copyfile(args.apk, apk)
    require(digest(apk) == candidate, 'APK changed during packaging')
    partial.rename(source)
    checksums.write_text(f'{candidate}  {apk.name}\n{digest(source)}  {source.name}\n', encoding='utf-8')
    print(json.dumps({'apk': str(apk), 'candidateAPK_SHA256': candidate, 'source': str(source),
                      'sourceZIP_SHA256': digest(source), 'sourceFiles': len(files), 'checksums': str(checksums)}, indent=2))


if __name__ == '__main__':
    main()
