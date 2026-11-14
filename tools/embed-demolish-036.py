"""Index the reviewed Demolish command adapter into the matched v0.36 runtime.

Append one existing virtual file only. Preserve the Intelligence native pair,
all maps, data, music and the exact worker-output hook. No native execution QA.
"""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json
import os
import runpy
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
BASE = ROOT.parent / '_release-records/native-intelligence036/integrated'
PROOF = ROOT / 'qa/0.36-demolish/native-payload.json'
RUNTIME = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='demolish_036')
VIRTUAL = '/data/mp/tests/warzone-towers-commands.js'
EXPECTED = {
    'warzone2100.js': 'd4767e1d787fff261aec1146bad477f0847391ee5086e7c7cf6f6648055ef2f6',
    'warzone2100.data': 'a92471614e4319895dfc4d7d739f973e68c4cb5d0ab88dfb22d8977b240dee7e',
    'warzone2100.wasm': 'b7d117295d901abf96cafdf8a4c780a56007b4e2310267897395419d455a3503',
}


def digest(value):
    return sha256(value).hexdigest()


def require(value, message):
    if not value:
        raise RuntimeError(message)


def atomic(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.read_bytes() == value:
        return
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.demolish-036-', suffix='.tmp', delete=False) as stream:
        stage = Path(stream.name)
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        require(stage.read_bytes() == value, 'Staged output changed')
        os.replace(stage, path)
    finally:
        if stage.exists():
            stage.unlink()


def main():
    baseline = {name: (BASE / name).read_bytes() for name in EXPECTED}
    for name, value in baseline.items():
        require(digest(value) == EXPECTED[name], 'Frozen native integration baseline changed: ' + name)
    script = baseline['warzone2100.js'].decode('utf-8')
    data = baseline['warzone2100.data']
    begin, end, _, metadata = RUNTIME['package_call'](script)
    names = RUNTIME['verify_index'](metadata, data)
    require(VIRTUAL in names, 'Expected existing command adapter missing')
    source = (ROOT / 'scenario/warzone-towers-commands.js').read_bytes()
    appended = data + source
    rows = [dict(row, start=len(data), end=len(appended)) if row['filename'] == VIRTUAL else dict(row)
            for row in metadata['files']]
    generated_index = dict(metadata, files=rows, remote_package_size=len(appended),
                           package_uuid='warzone-towers-demolish-0.36-' + digest(appended)[:16])
    generated = script[:begin] + 'loadPackage(' + json.dumps(generated_index, separators=(',', ':')) + ')' + script[end:]
    start, stop, _, verified = RUNTIME['package_call'](generated)
    body = script[:begin] + 'PACKAGE_INDEX' + script[end:]
    require(generated[:start] + 'PACKAGE_INDEX' + generated[stop:] == body, 'Native program changed outside package index')
    require(RUNTIME['verify_index'](verified, appended) == names, 'VFS inventory changed')
    current_js = (ASSETS / 'warzone2100.js').read_text(encoding='utf-8')
    a, b, _, current_index = RUNTIME['package_call'](current_js)
    require(current_js[:a] + 'PACKAGE_INDEX' + current_js[b:] == body, 'Installed native program changed')
    current_data = (ASSETS / 'warzone2100.data').read_bytes()
    current_rows = {row['filename']: row for row in current_index['files']}
    require(RUNTIME['verify_index'](current_index, current_data) == names, 'Installed VFS inventory changed')
    for row in metadata['files']:
        if row['filename'] == VIRTUAL:
            continue
        other = current_rows[row['filename']]
        require(current_data[other['start']:other['end']] == data[row['start']:row['end']],
                'Unrelated virtual file changed: ' + row['filename'])
    require((ASSETS / 'warzone2100.wasm').read_bytes() == baseline['warzone2100.wasm'], 'Installed matched WASM changed')
    require(appended[:len(data)] == data, 'Frozen data prefix changed')
    atomic(ASSETS / 'warzone2100.data', appended)
    atomic(ASSETS / 'warzone2100.js', generated.encode('utf-8'))
    proof = {'version': '0.36', 'passed': True, 'recordedUTC': datetime.now(timezone.utc).isoformat(),
             'scope': 'One existing command adapter VFS replacement; package byte verification only',
             'nativeRuntimeProof': 'qa/0.36-intelligence/native-runtime-integration.json',
             'changedVFSFiles': [VIRTUAL], 'addedVFSFiles': [], 'removedVFSFiles': [],
             'unchangedVirtualFiles': len(names)-1, 'frozenDataPrefixUnchanged': True,
             'nativeProgramUnchangedOutsidePackageIndex': True, 'matchedWASMUnchanged': True,
             'source': {'path': 'scenario/warzone-towers-commands.js', 'bytes': len(source), 'sha256': digest(source)},
             'outputs': [{'file': name, 'bytes': (ASSETS / name).stat().st_size, 'sha256': digest((ASSETS / name).read_bytes())}
                         for name in EXPECTED]}
    atomic(PROOF, (json.dumps(proof, indent=2)+'\n').encode('utf-8'))
    print(json.dumps(proof, indent=2))


if __name__ == '__main__':
    main()
