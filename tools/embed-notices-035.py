"""Append only the reviewed v0.35 Towers round/startup notice scripts to frozen data.

The source-built matched runtime must already be installed by the native notice
build/integration step. No compiled program, WASM, maps or authored waves change
in this step. Repeated runs always start from the preserved v0.34 data bytes.
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
BASELINE = ROOT.parent / 'Warzone-Towers-0.34-Test-Ads.apk'
BASELINE_SHA = '4c5c5b6937ea756aea0f46697b0ea6c4f0192d918d88e4caa663a00a149fda7a'
DATA_SHA = '4f1fe71399e58eba80406162602e286207d773ce4636ac3193f13b982f3d4c8c'
NATIVE_BODY_SHA = '35bf2bd67a4ebc0ee6172a10d5b006f20164ea4271d8ffd287c61a7679fa15f0'
WASM_SHA = '120457e5db655d819436f3c5315991cb013f771e01ace7a872469e0844796380'
CHANGED = {
    '/data/mp/multiplay/script/mods/configReader.js': 'scenario/warzone-towers-config-reader.js',
    '/data/mp/multiplay/script/rules/printsettings.js': 'scenario/warzone-towers-printsettings.js',
}
PROOF = ROOT / 'archive/notices-0.35-native-payload.json'
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
    require(digest(BASELINE.read_bytes()) == BASELINE_SHA, 'Frozen v0.34 APK changed')
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
                        package_uuid='warzone-towers-notices-0.35-' + digest(data)[:16])
    generated = js[:begin] + 'loadPackage(' + json.dumps(new_metadata, separators=(',', ':')) + ')' + js[end:]
    new_begin, new_end, _, verified = RUNTIME['package_call'](generated)
    require(generated[:new_begin] + 'PACKAGE_INDEX' + generated[new_end:] == body, 'Native program changed during indexing')
    require(set(RUNTIME['verify_index'](verified, data)) == set(old_names), 'VFS inventory changed')
    require(data[:len(baseline_data)] == baseline_data, 'Frozen data prefix changed')
    previous = json.loads(PROOF.read_text(encoding='utf-8')) if PROOF.is_file() else {}
    known_previous = next((row.get('sha256') for row in previous.get('outputs', []) if row.get('path', '').endswith('warzone2100.data')), '')
    require(current_data in (baseline_data, bytes(data)) or digest(current_data) == known_previous,
            'Current data is neither frozen data nor a previous verified v0.35 result')
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
    report = {'version': '0.35', 'passed': True, 'recordedUTC': datetime.now(timezone.utc).isoformat(),
              'scope': 'Append-only round/startup native-script payload; no engine execution or emulator QA',
              'baselineAPK': str(BASELINE), 'baselineSHA256': BASELINE_SHA, 'baselineDataSHA256': DATA_SHA,
              'nativeRuntimeProof': 'qa/0.35-notices/native-runtime-integration.json',
              'nativeProgramBodySHA256': NATIVE_BODY_SHA, 'matchedWASMSHA256': WASM_SHA,
              'changedVFSFiles': actual_changes, 'addedVFSFiles': [], 'removedVFSFiles': [],
              'unchangedVirtualFiles': len(old_names)-len(actual_changes),
              'frozenDataPrefixUnchanged': True, 'nativeProgramUnchangedOutsidePackageIndex': True,
              'wasmUnchangedByScenarioIntegration': True, 'sources': source_records, 'outputs': outputs}
    atomic_write(PROOF, (json.dumps(report, indent=2) + '\n').encode('utf-8'))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
