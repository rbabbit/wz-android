"""Append only the reviewed v0.34 Towers wave/objective scripts to frozen data.

The source-built matched runtime must already be installed by the native notice
build/integration step. No compiled program, WASM, maps or authored waves change
in this step. Repeated runs always start from the preserved v0.33 data bytes.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
from datetime import datetime, timezone
import json
import os
import runpy
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
BASELINE = ROOT.parent / 'Warzone-Towers-0.33-Test-Ads.apk'
BASELINE_SHA = '9988786994ef4ee9b3c426bd4af690a9e6f382a94bbeed0dfc351546c51cf0f7'
DATA_SHA = 'f2200f13b2197d0162a12737898c12be2545482a78529a6d7c83c54d8a34e16b'
NATIVE_BODY_SHA = '0e3613b6526c54cafaf959346aa4e2cda5ceb5ba70250cfd65a1d83ffacbbddd'
WASM_SHA = '20a3e83127f21d85105c91f43c8eb7144461a09cfc53ef34bbfc1d274fa7368f'
CHANGED = {
    '/data/mp/tests/warzone-towers-objective.js': 'scenario/warzone-towers-objective.js',
    '/data/mp/tests/warzone-towers-waves.js': 'scenario/warzone-towers-waves.js',
}
PROOF = ROOT / 'archive/notices-0.34-native-payload.json'
RUNTIME = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='notices_scenario_034')


def digest(value):
    return sha256(value).hexdigest()


def require(value, message):
    if not value:
        raise RuntimeError(message)


def atomic_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.read_bytes() == content:
        return
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.notices-034-', suffix='.tmp', delete=False) as stream:
        stage = Path(stream.name)
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        require(digest(stage.read_bytes()) == digest(content), 'Staged file changed')
        os.replace(stage, path)
    finally:
        if stage.exists():
            stage.unlink()


def main():
    require(digest(BASELINE.read_bytes()) == BASELINE_SHA, 'Frozen v0.33 APK changed')
    with ZipFile(BASELINE) as archive:
        baseline_js = archive.read('assets/warzone/warzone2100.js').decode('utf-8')
        baseline_data = archive.read('assets/warzone/warzone2100.data')
    require(digest(baseline_data) == DATA_SHA, 'Frozen authored data changed')
    _, _, _, metadata = RUNTIME['package_call'](baseline_js)
    old_names = RUNTIME['verify_index'](metadata, baseline_data)
    js = (ASSETS / 'warzone2100.js').read_text(encoding='utf-8')
    begin, end, _, current_metadata = RUNTIME['package_call'](js)
    body = js[:begin] + 'PACKAGE_INDEX' + js[end:]
    require(digest(body.encode('utf-8')) == NATIVE_BODY_SHA, 'Installed reviewed native program changed')
    wasm = (ASSETS / 'warzone2100.wasm').read_bytes()
    require(digest(wasm) == WASM_SHA, 'Installed matched native WASM changed')
    current_data = (ASSETS / 'warzone2100.data').read_bytes()
    require(set(RUNTIME['verify_index'](current_metadata, current_data)) == set(old_names), 'Current VFS inventory changed')
    current_rows = {row['filename']: row for row in current_metadata['files']}
    for row in metadata['files']:
        if row['filename'] in CHANGED:
            continue
        actual = current_rows[row['filename']]
        require(current_data[actual['start']:actual['end']] == baseline_data[row['start']:row['end']],
                'Unrelated current virtual file changed: ' + row['filename'])
    rows = {row['filename']: dict(row) for row in metadata['files']}
    require(set(CHANGED) <= set(rows), 'Expected native scenario entries missing')
    data = bytearray(baseline_data)
    source_records = []
    for virtual, relative in CHANGED.items():
        content = (ROOT / relative).read_bytes()
        start = len(data)
        data.extend(content)
        rows[virtual] = dict(rows[virtual], start=start, end=len(data))
        source_records.append({'path': relative, 'vfs': virtual, 'bytes': len(content), 'sha256': digest(content)})
    new_metadata = dict(metadata, files=list(rows.values()), remote_package_size=len(data),
                        package_uuid='warzone-towers-notices-0.34-' + digest(data)[:16])
    generated = js[:begin] + 'loadPackage(' + json.dumps(new_metadata, separators=(',', ':')) + ')' + js[end:]
    new_begin, new_end, _, verified = RUNTIME['package_call'](generated)
    require(generated[:new_begin] + 'PACKAGE_INDEX' + generated[new_end:] == body, 'Native program changed during indexing')
    require(set(RUNTIME['verify_index'](verified, data)) == set(old_names), 'VFS inventory changed')
    require(data[:len(baseline_data)] == baseline_data, 'Frozen data prefix changed')
    previous = json.loads(PROOF.read_text(encoding='utf-8')) if PROOF.is_file() else {}
    known_previous = next((row.get('sha256') for row in previous.get('outputs', []) if row.get('path', '').endswith('warzone2100.data')), '')
    require(current_data in (baseline_data, bytes(data)) or digest(current_data) == known_previous,
            'Current data is neither frozen data nor a previous verified v0.34 result')
    actual_changes = []
    for row in metadata['files']:
        actual = rows[row['filename']]
        if data[actual['start']:actual['end']] != baseline_data[row['start']:row['end']]:
            actual_changes.append(row['filename'])
    require(set(actual_changes) == set(CHANGED), 'VFS changes differ from authorized scope')
    atomic_write(ASSETS / 'warzone2100.data', bytes(data))
    atomic_write(ASSETS / 'warzone2100.js', generated.encode('utf-8'))
    require((ASSETS / 'warzone2100.wasm').read_bytes() == wasm, 'WASM changed during scenario indexing')
    outputs = [{'path': 'app/src/main/assets/warzone/' + name,
                'bytes': (ASSETS / name).stat().st_size, 'sha256': digest((ASSETS / name).read_bytes())}
               for name in ('warzone2100.js', 'warzone2100.data', 'warzone2100.wasm')]
    report = {'version': '0.34', 'passed': True, 'recordedUTC': datetime.now(timezone.utc).isoformat(),
              'scope': 'Append-only wave/objective native-script payload; no engine execution or emulator QA',
              'baselineAPK': str(BASELINE), 'baselineSHA256': BASELINE_SHA, 'baselineDataSHA256': DATA_SHA,
              'nativeRuntimeProof': 'qa/0.34-notices/native-runtime-integration.json',
              'nativeProgramBodySHA256': NATIVE_BODY_SHA, 'matchedWASMSHA256': WASM_SHA,
              'changedVFSFiles': actual_changes, 'addedVFSFiles': [], 'removedVFSFiles': [],
              'unchangedVirtualFiles': len(old_names)-len(actual_changes),
              'frozenDataPrefixUnchanged': True, 'nativeProgramUnchangedOutsidePackageIndex': True,
              'wasmUnchangedByScenarioIntegration': True, 'sources': source_records, 'outputs': outputs}
    atomic_write(PROOF, (json.dumps(report, indent=2) + '\n').encode('utf-8'))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
