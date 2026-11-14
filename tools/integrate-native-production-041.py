"""Integrate the matched v0.41 native pair and one existing commands VFS file.

The v0.40 APK supplies the exact existing index, worker hook and authored data.
Generated program bytes are changed only by the established guarded integrator.
No WASM edits and no native/runtime/emulator execution are performed.
"""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import argparse
import json
import os
import runpy
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
ARCHIVE = ROOT / 'archive/native-production-0.41'
VIRTUAL = '/data/mp/tests/warzone-towers-commands.js'
RUNTIME = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='production_041_integrator')


def digest(value):
    return sha256(value).hexdigest()


def file_digest(path):
    value = sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def atomic(path, value):
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.production041-', suffix='.tmp', delete=False) as stream:
        stage = Path(stream.name)
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        assert stage.read_bytes() == value
        os.replace(stage, path)
    finally:
        if stage.exists():
            stage.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    assert ROOT not in args.out.resolve().parents, 'Large native outputs must stay outside repository'
    fallback = json.loads((ROOT / 'archive/fallback-0.41.json').read_text())
    entry = next(e for e in fallback['files'] if e['path'].endswith('.apk'))
    baseline = Path(entry['path'])
    assert baseline.stat().st_size == entry['bytes'] and file_digest(baseline) == entry['sha256']
    build = json.loads((ARCHIVE / 'native-build.json').read_text())
    previous_outputs = {}
    if (ARCHIVE / 'native-payload.json').is_file():
        previous = json.loads((ARCHIVE / 'native-payload.json').read_text())
        assert previous['version'] == '0.41' and previous['passed'] and previous['baselineSHA256'] == entry['sha256']
        previous_outputs = {r['file']: r for r in previous['outputs']}
    assert build['passed'] and build['compiledObjects'] == ['src/CMakeFiles/warzone2100.dir/quickjs_backend.cpp.o']
    for row in build['raw']:
        raw = args.raw / row['file']
        assert raw.stat().st_size == row['bytes'] and file_digest(raw) == row['sha256']
    subprocess.run([sys.executable, str(ROOT / 'tools/integrate-native-runtime.py'),
                    '--raw-js', str(args.raw / 'warzone2100.js'), '--raw-wasm', str(args.raw / 'warzone2100.wasm'),
                    '--baseline-apk', str(baseline), '--out', str(args.out)], check=True, stdout=subprocess.DEVNULL)
    integration = json.loads((args.out / 'native-runtime-integration.json').read_text())
    integration.update({'version': '0.41', 'emulatorUsed': False, 'androidRuntimeExecuted': False,
                        'scope': 'Source-built read-only QuickJS factory observation; exact v0.40 index/data/worker hook before the separately recorded one-file commands append',
                        'workerHookChanged': False, 'productionObservationVFSChanges': []})
    (ARCHIVE / 'native-runtime-integration.json').write_text(json.dumps(integration, indent=2) + '\n')
    script = (args.out / 'warzone2100.js').read_text(encoding='utf-8')
    data = (args.out / 'warzone2100.data').read_bytes()
    begin, end, _, metadata = RUNTIME['package_call'](script)
    names = RUNTIME['verify_index'](metadata, data)
    assert VIRTUAL in names
    source = (ROOT / 'scenario/warzone-towers-commands.js').read_bytes()
    appended = data + source
    rows = [dict(row, start=len(data), end=len(appended)) if row['filename'] == VIRTUAL else dict(row)
            for row in metadata['files']]
    updated_index = dict(metadata, files=rows, remote_package_size=len(appended),
                         package_uuid='warzone-towers-production-0.41-' + digest(appended)[:16])
    generated = script[:begin] + 'loadPackage(' + json.dumps(updated_index, separators=(',', ':')) + ')' + script[end:]
    start, stop, _, verified = RUNTIME['package_call'](generated)
    assert generated[:start] + 'PACKAGE_INDEX' + generated[stop:] == script[:begin] + 'PACKAGE_INDEX' + script[end:]
    assert RUNTIME['verify_index'](verified, appended) == names
    for old, current in zip(metadata['files'], verified['files']):
        expected = source if old['filename'] == VIRTUAL else data[old['start']:old['end']]
        assert appended[current['start']:current['end']] == expected, 'Unrelated VFS file changed: ' + old['filename']
    assert appended[:len(data)] == data
    (args.out / 'warzone2100.js').write_bytes(generated.encode())
    (args.out / 'warzone2100.data').write_bytes(appended)
    proof = {
        'version': '0.41', 'passed': True, 'emulatorUsed': False, 'androidRuntimeExecuted': False,
        'gameplayVerified': False, 'scope': 'Native byte lineage and one commands VFS replacement only',
        'nativeRuntimeProof': 'archive/native-production-0.41/native-runtime-integration.json',
        'nativeBuildProof': 'archive/native-production-0.41/native-build.json',
        'baselineAPK': str(baseline), 'baselineSHA256': entry['sha256'],
        'changedVFSFiles': [VIRTUAL], 'addedVFSFiles': [], 'removedVFSFiles': [],
        'unchangedVirtualFiles': len(names) - 1, 'frozenDataPrefixUnchanged': True,
        'nativeProgramUnchangedOutsidePackageIndex': True, 'matchedWASMUnchanged': True,
        'source': {'path': 'scenario/warzone-towers-commands.js', 'bytes': len(source), 'sha256': digest(source)},
        'outputs': [{'file': name, 'bytes': (args.out / name).stat().st_size, 'sha256': file_digest(args.out / name)}
                    for name in ['warzone2100.js', 'warzone2100.wasm', 'warzone2100.data']],
        'recordedUTC': datetime.now(timezone.utc).isoformat(),
    }
    (ARCHIVE / 'native-payload.json').write_text(json.dumps(proof, indent=2) + '\n')
    if args.install:
        with ZipFile(baseline) as old:
            for name in ['warzone2100.js', 'warzone2100.wasm', 'warzone2100.data']:
                current = (ASSETS / name).read_bytes()
                prior = previous_outputs.get(name, {})
                known_prior = len(current) == prior.get('bytes') and digest(current) == prior.get('sha256')
                assert known_prior or current in (old.read('assets/warzone/' + name), (args.out / name).read_bytes()), 'Current baseline changed before install: ' + name
        for name in ['warzone2100.data', 'warzone2100.wasm', 'warzone2100.js']:
            atomic(ASSETS / name, (args.out / name).read_bytes())
    print(json.dumps(proof))


if __name__ == '__main__':
    main()
