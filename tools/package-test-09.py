"""Package 0.9 Towers benchmark after exact-APK header/dialog checks and review.

The gate is authored only after actual checks; this tool rehashes its evidence,
all source files and the completed archive. Already compressed assets are stored
without recompression for speed. No native engine rebuild/probe is performed.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from hashlib import sha256
import argparse
import json
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
QA = ROOT/'qa/test-09'
h = runpy.run_path(str(ROOT/'tools/verify-test-09-package.py'), run_name='release09_packaging')
digest, read, require, local = (h[n] for n in ('digest', 'read', 'require', 'local'))
REQUIRED = {'package-verification.json', 'code-checks.json', 'emulator-verification.json', 'visual-review.json'}
STORED = {'.gz', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.ogg', '.mp3', '.wasm', '.data', '.woff2'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--output', type=Path, default=BASE)
    args = parser.parse_args()
    candidate = digest(args.apk)
    gate = read(QA/'DELIVERY.json')
    require(all(gate.get(k) is True for k in ('passed','emulatorTesting','gameplayTesting','visualReview')), 'Delivery evidence incomplete')
    require(gate.get('candidateAPK_SHA256') == candidate and gate.get('version') == '0.9' and gate.get('package') == 'com.rbabbit.warzonetowers.lab', 'Wrong delivery identity')
    reports = gate.get('reports', [])
    names = [e['path'] for e in reports]
    require(len(names) == len(set(names)) and {'qa/test-09/'+n for n in REQUIRED} <= set(names), 'Missing/duplicate required reports')
    for entry in reports:
        p = local(entry['path'])
        value = read(p)
        require(digest(p) == entry['sha256'] and value.get('passed') is True and value.get('candidateAPK_SHA256') == candidate, 'Evidence changed/failed/wrong APK: '+entry['path'])
        require(not value.get('failure') and not value.get('cleanupFailure'), 'Unresolved required report failure')
    for entry in gate.get('supportingReports', []):
        require(entry['path'] not in names and digest(local(entry['path'])) == entry['sha256'], 'Diagnostic evidence changed or counted as a pass')
    emulator, code, visual, package = (read(QA/n) for n in ('emulator-verification.json','code-checks.json','visual-review.json','package-verification.json'))
    require(all(emulator.get(k) is True for k in ('emulatorTesting','gameplayTesting')) and emulator.get('installedAPK_SHA256') == candidate, 'Exact installed-APK gameplay proof missing')
    require(all(emulator.get('checks', {}).get(k) is True for k in h['EMULATOR_CHECKS']), 'A scoped header/dialog check is missing')
    sources = emulator.get('sourceReports', [])
    require(len(sources) >= 2 and len({e['path'] for e in sources}) == len(sources), 'Two distinct scoped raw header/dialog reports required')
    for entry in sources:
        raw_path = local(entry['path'])
        require(raw_path.is_relative_to(QA) and digest(raw_path) == entry['sha256'], 'Raw evidence changed or outside scoped QA: '+entry['path'])
        raw = read(raw_path)
        actual = raw.get('candidateAPK_SHA256') or raw.get('identity', {}).get('candidateAPK_SHA256')
        require(raw.get('passed') is True and actual == candidate and not raw.get('failure') and not raw.get('cleanupFailure'), 'Raw evidence failed or belongs to another APK: '+entry['path'])
    tests = code.get('tests', [])
    require(tests and len({r.get('name') for r in tests}) == len(tests) and all(r.get('passed') is True and r.get('exitCode') == 0 for r in tests), 'Source checks incomplete/failed')
    require('test-android-back-routing.cjs' in {r['name'] for r in tests}, 'Actual Java Back routing sequence regression missing')
    require({'test-test-lifecycle.cjs', 'test-html-input-modes.cjs'} <= {r['name'] for r in tests}, 'Lifecycle/touch controls source regression missing')
    require(visual.get('reviewed') is True and visual.get('screenshots'), 'Actual manual screenshot review missing')
    require(isinstance(gate.get('limitations'), list) and isinstance(visual.get('limitations'), list), 'Explicit verification limitations missing')
    for entry in visual['screenshots']:
        p = local(entry['path'])
        require(p.is_relative_to(QA) and p.suffix.lower() == '.png' and p.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') and digest(p) == entry['sha256'] and entry.get('accepted') is True, 'Reviewed screenshot changed/missing/rejected')
    require(package.get('version') == '0.9' and package.get('compiledEngineUnchanged') is True, 'Wrong package scope')
    for entry in package['sourceFiles']+package['nativeSourceFiles']+code.get('sourceFiles', []):
        require(digest(local(entry['path'])) == entry['sha256'], 'Source changed after package verification: '+entry['path'])
    for entry in package['preservedArtifacts']:
        require(digest(Path(entry['path'])) == entry['sha256'], 'Frozen artifact changed: '+entry['path'])
    stable = h['stable_integrity'](full=False)
    require(stable['manifestSHA256'] == package['stable']['manifestSHA256'] and package['stable'].get('allManifestFilesVerified') is True, 'Stable preservation report changed/incomplete')
    manifest = read(ROOT/'archive/repository-files.json')['files']
    for entry in manifest:
        p = local(entry['path'])
        require(p.is_file() and p.stat().st_size == entry['bytes'] and digest(p) == entry['sha256'], 'Source manifest stale: '+entry['path'])
    listed = subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'], cwd=ROOT).decode('utf-8').split('\0')
    files = []
    for name in sorted(set(filter(None, listed))):
        rel = Path(name)
        if any(part in {'.git','.gradle','.kotlin','.idea','build','node_modules','__pycache__'} for part in rel.parts):
            continue
        require(rel.suffix.lower() not in {'.jks','.keystore','.pyc','.pem','.p12','.pfx'} and not rel.name.startswith('.env') and name not in {'local.properties','tools/live-cdp-url.txt'}, 'Private/local file in source inventory: '+name)
        p = local(name)
        if p.is_file():
            files.append((name,p))
    archive_names = {n for n,_ in files}
    require({e['path'] for e in manifest} <= archive_names and 'archive/repository-files.json' in archive_names, 'Source inventory incomplete')
    require({e['path'] for e in package['nativeSourceFiles']} <= archive_names, 'Preserved complete native source/provenance missing')
    apk, source, checksums = (args.output/n for n in ('Warzone-Towers-0.9.apk','warzone-towers-0.9-source.zip','Warzone-Towers-0.9-SHA256.txt'))
    partial = source.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk,source,checksums,partial)), 'Existing delivery/partial must not be overwritten')
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=3) as archive:
        for name,p in files:
            archive.write(p, name, compress_type=ZIP_STORED if p.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist()) == len(archive_names) and set(archive.namelist()) == archive_names, 'Source archive inventory mismatch')
        # Streaming reads check each entry's CRC and SHA together, without a
        # redundant second full archive.testzip pass over the large native tar.
        for name,p in files:
            require(h['zip_digest'](archive,name) == digest(p), 'Archived source differs: '+name)
    require(digest(args.apk) == candidate, 'Candidate changed during packaging')
    shutil.copyfile(args.apk, apk)
    require(digest(apk) == candidate, 'Delivered APK differs from tested candidate')
    partial.rename(source)
    source_digest = digest(source)
    checksums.write_text(f'{candidate}  {apk.name}\n{source_digest}  {source.name}\n', encoding='utf-8')
    print(json.dumps({'apk':str(apk),'candidateAPK_SHA256':candidate,'source':str(source),'sourceZIP_SHA256':source_digest,'sourceFiles':len(files),'checksums':str(checksums),'storedCompressedAssets':True}, indent=2))


if __name__ == '__main__':
    main()
