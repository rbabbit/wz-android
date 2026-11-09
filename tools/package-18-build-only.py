"""Package 0.18 after source audit/build; no tests, emulator or runtime checks.

The hash-bound preservation proof supplies the reviewed exact change inventory.
APK metadata, frozen-byte comparison and source ZIP CRC/SHA readback are only
packaging integrity operations. No older QA gates are imported or rerun.
"""
from pathlib import Path
from hashlib import file_digest, sha256
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from datetime import datetime, timezone
import argparse
import json
import math
import os
import re
import runpy
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent
STORED = {'.gz', '.xz', '.zst', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.ogg', '.mp3', '.wasm', '.data', '.woff2'}
SKIP = {'.git', '.gradle', '.kotlin', '.idea', 'build', 'node_modules', '__pycache__'}
PAYLOAD = 'assets/warzone/'
EXPECTED_ASSETS = {'assets/warzone/index.html', 'assets/warzone/warzone2100.js', 'assets/warzone/warzone2100.data', 'assets/warzone-touch-controls.js'}
EXPECTED_VFS_CHANGES = {'/data/mp/addon.lev', '/data/mp/config.js'}
EXPECTED_VFS_ADDITIONS = {
    '/data/mp/multiplay/maps/greenhaven-beginner.gam',
    *('/data/mp/multiplay/maps/greenhaven-beginner/'+name for name in ('droid.json', 'feature.json', 'gam.json', 'game.map', 'level.json', 'struct.json', 'ttypes.ttp')),
    '/data/mp/tests/towers-beginner-config.js',
    '/data/mp/tests/towers-original-config.js',
    '/data/mp/tests/warzonetowers-beginner.json',
}
package_call = runpy.run_path(str(ROOT/'tools/integrate-native-runtime.py'), run_name='release18_packaging')['package_call']


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def zip_digest(archive, name):
    with archive.open(name) as stream:
        return file_digest(stream, 'sha256').hexdigest()


def payload_integrity(old, apk, proof):
    old_js = old.read(PAYLOAD+'warzone2100.js').decode('utf-8')
    js = apk.read(PAYLOAD+'warzone2100.js').decode('utf-8')
    a, b, _, old_meta = package_call(old_js)
    c, d, _, meta = package_call(js)
    normalized = old_js[:a]+'PACKAGE'+old_js[b:]
    require(js[:c]+'PACKAGE'+js[d:] == normalized, 'Compiled engine changed outside literal package metadata')
    excluded = {'files', 'remote_package_size', 'package_uuid'}
    require({k:v for k,v in old_meta.items() if k not in excluded} == {k:v for k,v in meta.items() if k not in excluded}, 'Unexpected non-index package metadata change')
    require(zip_digest(old, PAYLOAD+'warzone2100.wasm') == zip_digest(apk, PAYLOAD+'warzone2100.wasm'), 'Frozen WASM changed')
    old_data = old.read(PAYLOAD+'warzone2100.data')
    data = apk.read(PAYLOAD+'warzone2100.data')
    require(len(data) > len(old_data) and data.startswith(old_data), 'Complete accepted 0.17 data prefix changed or append absent')
    require(meta['remote_package_size'] == len(data) and meta['package_uuid'] == 'warzone-towers-4.7.0-v1-'+str(len(data)), 'Generated data length/UUID mismatch')

    def index(metadata, length):
        entries = metadata['files']
        result = {entry['filename']:entry for entry in entries}
        require(len(result) == len(entries), 'Duplicate VFS filename')
        for name, entry in result.items():
            start, end = entry.get('start'), entry.get('end')
            integral = lambda value: type(value) in (int, float) and math.isfinite(value) and value == int(value)
            require(isinstance(name, str) and name.startswith('/') and integral(start) and integral(end) and 0 <= start <= end <= length, 'Invalid VFS entry: '+str(name))
            entry['start'], entry['end'] = int(start), int(end)
        return result

    before, after = index(old_meta, len(old_data)), index(meta, len(data))
    require(before.keys() <= after.keys(), 'Existing VFS member removed')
    changed = []
    for name, entry in before.items():
        current = after[name]
        require({k:v for k,v in entry.items() if k not in {'start', 'end'}} == {k:v for k,v in current.items() if k not in {'start', 'end'}}, 'Existing VFS flags changed: '+name)
        if old_data[entry['start']:entry['end']] != data[current['start']:current['end']]:
            changed.append(name)
    require(set(changed) == set(proof['changedVFSFiles']), 'VFS changes differ from the reviewed proof')
    require(set(after)-set(before) == set(proof['addedVFSFiles']), 'VFS additions differ from the reviewed proof')
    protected_prefixes = ('/data/mp/multiplay/maps/td1_v3/', '/data/mp/multiplay/maps/2c-TowerDefense2_m/')
    protected_names = {'/data/mp/tests/warzonetowers.json', '/data/mp/tests/warzonetowers-td1.json', '/data/mp/tests/warzone-towers-waves.js'}
    require(not any(name in protected_names or name.startswith(protected_prefixes) for name in changed), 'An original map/scenario/wave schedule changed')
    with ZipFile(ROOT/'vendor/tower-defense/original/WZmodTowerDefense-v4.7.0-a.zip') as mod:
        protected_mod = {'/data/mp/'+entry.filename for entry in mod.infolist() if not entry.is_dir()}-{'/data/mp/multiplay/script/rules/init.js'}
    original_config = '/data/mp/config.js'
    original_copy = '/data/mp/tests/towers-original-config.js'
    require(not (protected_mod-{original_config}).intersection(changed), 'Supplied mod payload changed outside the reviewed map router')
    require(original_config in before and original_copy in after, 'Original mod config preservation copy is missing')
    old_config, preserved_config = before[original_config], after[original_copy]
    require(old_data[old_config['start']:old_config['end']] == data[preserved_config['start']:preserved_config['end']], 'Original mod config bytes were not preserved in the map router copy')
    return {'compiledProgramUnchangedOutsidePackageMetadata':True, 'normalizedProgramSHA256':sha256(normalized.encode()).hexdigest(), 'wasmUnchanged':True, 'acceptedDataPrefixBytes':len(old_data), 'acceptedDataPrefixSHA256':sha256(old_data).hexdigest(), 'appendedBytes':len(data)-len(old_data), 'changedVFSFiles':sorted(changed), 'addedVFSFiles':sorted(set(after)-set(before)), 'originalMapsAndWaveScheduleAndModPreserved':True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--preservation-proof', type=Path, required=True)
    parser.add_argument('--expected-proof-sha256', required=True)
    parser.add_argument('--output', type=Path, default=BASE)
    args = parser.parse_args()
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Built APK differs from the supplied candidate hash')
    require(digest(args.preservation_proof) == args.expected_proof_sha256, 'Preservation proof differs from the reviewed hash')
    proof = json.loads(args.preservation_proof.read_text(encoding='utf-8'))
    require(proof.get('passed') is True and proof.get('candidateAPK_SHA256') == candidate, 'Preservation proof does not cover this candidate APK')
    for field in ('changedAPKAssets', 'newAPKAssets', 'changedVFSFiles', 'addedVFSFiles'):
        require(isinstance(proof.get(field), list) and len(proof[field]) == len(set(proof[field])), 'Missing/duplicate reviewed inventory: '+field)
    require(set(proof['changedAPKAssets']) == EXPECTED_ASSETS and not proof['newAPKAssets'], 'Proof exceeds the authorized exact APK asset scope')
    require(set(proof['changedVFSFiles']) == EXPECTED_VFS_CHANGES, 'Proof exceeds the authorized exact VFS override scope')
    require(set(proof['addedVFSFiles']) == EXPECTED_VFS_ADDITIONS, 'Proof exceeds the authorized exact Greenhaven VFS additions')
    fallback = ROOT/'archive/fallback-0.18.json'
    saved = json.loads(fallback.read_text(encoding='utf-8'))
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'], '0.17 fallback changed: '+str(path))
    baseline = Path(saved['files'][0]['path'])
    with ZipFile(args.apk) as apk, ZipFile(baseline) as old:
        require(apk.testzip() is None, 'Built APK archive CRC mismatch')
        new_names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(new_names) == len(apk.namelist()) and not old_names-new_names, 'APK has duplicate or removed members')
        require({name for name in new_names-old_names if name.startswith('assets/')} == set(proof['newAPKAssets']), 'APK asset additions differ from the reviewed inventory')
        changed = [name for name in apk.namelist() if name not in old_names or zip_digest(old, name) != zip_digest(apk, name)]
        expected_assets = set(proof['changedAPKAssets'])
        require({name for name in changed if name.startswith('assets/')} == expected_assets, 'Changed APK assets differ from the reviewed inventory')
        require(all(name in expected_assets or name in {'AndroidManifest.xml', 'resources.arsc'} or re.fullmatch(r'classes(?:\d+)?\.dex', name) or re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))', name, re.I) for name in changed), 'APK changes exceed reviewed assets/version/signing metadata')
        payload = payload_integrity(old, apk, proof)
        for path in (ROOT/'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/'+path.relative_to(ROOT/'app/src/main/assets').as_posix()
                require(name in new_names and zip_digest(apk, name) == digest(path), 'Built APK has a stale/missing source asset: '+name)
    with ZipFile(Path(saved['files'][1]['path'])) as source:
        protected = [name for name in source.namelist() if name.startswith(('vendor/', 'map/')) and not name.endswith('/')]
        protected += ['scenario/warzone-towers-waves.js', 'scenario/warzonetowers.json', 'scenario/warzonetowers-td1.json']
        for name in protected:
            path = ROOT/name
            require(path.is_file() and digest(path) == zip_digest(source, name), 'Original map/mod/wave source changed: '+name)
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home()/'AppData/Local/Android/Sdk')))
    badging = subprocess.check_output([str(sdk/'build-tools/36.1.0/aapt2.exe'), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='18'", "versionName='0.18'", "application-label:'Warzone Towers'")), 'Built APK has the wrong package/version/label')
    paths = [args.output/name for name in ('Warzone-Towers-0.18.apk', 'warzone-towers-0.18-source.zip', 'Warzone-Towers-0.18-SHA256.txt')]
    apk_out, source, checksums = paths
    partial = source.with_suffix('.zip.partial')
    require(not any(path.exists() for path in paths+[partial]), 'Existing delivery or partial archive must not be overwritten')
    record = {'version':'0.18', 'versionCode':18, 'candidateAPK_SHA256':candidate, 'scope':'Source audit and Android build only; proposed Beginner difficulty and gameplay are unverified.', 'testingPerformed':False, 'emulatorUsed':False, 'runtimeVerified':False, 'packagingIntegrityOnly':True, 'changedAPKMembers':changed, 'unchangedOtherAPKAssets':True, 'payloadPreservation':payload, 'preservedOriginalMapModSourceFiles':len(protected), 'preservationProof':{'path':args.preservation_proof.resolve().relative_to(ROOT).as_posix(), 'sha256':args.expected_proof_sha256}, 'fallbackRecord':{'path':'archive/fallback-0.18.json', 'sha256':digest(fallback)}, 'recordedUTC':datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}
    (ROOT/'archive/release-0.18-build-only.json').write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
    subprocess.run([sys.executable, str(ROOT/'tools/verify-project.py'), '--refresh'], cwd=ROOT, check=True)
    manifest = json.loads((ROOT/'archive/repository-files.json').read_text(encoding='utf-8'))['files']
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    files = []
    for name in sorted(set(filter(None, names))):
        rel = Path(name)
        if any(part in SKIP for part in rel.parts):
            continue
        require(rel.suffix.lower() not in {'.jks', '.keystore', '.pyc', '.pem', '.p12', '.pfx'} and not rel.name.startswith('.env') and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local file in source inventory: '+name)
        path = ROOT/rel
        if path.is_file():
            files.append((name, path))
    expected = {entry['path']:entry for entry in manifest}
    require(set(expected)|{'archive/repository-files.json'} == {name for name,_ in files}, 'Complete source inventory differs from the refreshed manifest')
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=3) as archive:
        for name, path in files:
            archive.write(path, name, compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist()) == len(files), 'Source archive entry count mismatch')
        for name, path in files:
            archived = zip_digest(archive, name)
            require(archived == digest(path) and (name not in expected or archived == expected[name]['sha256']), 'Archived source differs: '+name)
    require(digest(args.apk) == candidate and digest(args.preservation_proof) == args.expected_proof_sha256, 'Built APK/preservation proof changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == candidate, 'Delivered APK differs from built APK')
    partial.rename(source)
    source_sha = digest(source)
    checksums.write_text(f'{candidate}  {apk_out.name}\n{source_sha}  {source.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed':True, 'testingPerformed':False, 'emulatorUsed':False, 'runtimeVerified':False, 'apk':str(apk_out), 'apkBytes':apk_out.stat().st_size, 'candidateAPK_SHA256':candidate, 'source':str(source), 'sourceBytes':source.stat().st_size, 'sourceZIP_SHA256':source_sha, 'sourceFiles':len(files), 'checksums':str(checksums), 'streamedEverySourceEntryCRCAndSHA':True}, indent=2))


if __name__ == '__main__':
    main()
