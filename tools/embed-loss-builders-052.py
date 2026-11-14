"""Append only Towers' reviewed construction bridge to its isolated v0.52 VFS."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json
import os
import runpy

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
NATIVE = ROOT / 'archive/native-unit-loss-0.52'
BASELINE = ROOT.parent / 'Warzone-Towers-0.51-Campaign.apk'
BASELINE_SHA = '9f52adb6738eee5596129f68f3bce2e235e9b793bd3d75a6c6829b879e687d26'
VIRTUAL = '/data/mp/tests/warzone-towers-commands.js'
PAYLOAD = ROOT / 'archive/loss-builders-0.52-payload.json'
R = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='loss052_index')
digest = lambda data: sha256(data).hexdigest()


def write(path, data):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_bytes(data)
    os.replace(temporary, path)


def main():
    assert digest(BASELINE.read_bytes()) == BASELINE_SHA, 'v0.51 fallback changed'
    with ZipFile(BASELINE) as z:
        base_js = z.read('assets/warzone/warzone2100.js').decode()
        base_data = z.read('assets/warzone/warzone2100.data')
        _, _, _, metadata = R['package_call'](base_js)
        R['verify_index'](metadata, base_data)
        for name in ('warzone2100.js', 'warzone2100.wasm', 'index-campaign.html',
                     'mobile-campaign.html', 'warzone2100-campaign.js', 'warzone2100-campaign.data',
                     'index-duel.html', 'warzone2100-duel.js'):
            assert (ASSETS / name).read_bytes() == z.read('assets/warzone/' + name), name + ' changed'
    native = json.loads((NATIVE / 'native-payload.json').read_text())
    loader = ASSETS / 'warzone2100-towers-052.js'
    current = loader.read_bytes()
    original = NATIVE / 'towers-loader-before-scenario.js'
    if not original.exists():
        assert digest(current) == native['towersLoader']['sha256'], 'Unreviewed native loader'
        original.write_bytes(current)
    assert digest(original.read_bytes()) == native['towersLoader']['sha256']
    before = original.read_text()
    a, b, _, _ = R['package_call'](before)
    body = before[:a] + 'PACKAGE_INDEX' + before[b:]
    c, d, _, _ = R['package_call'](current.decode())
    assert current.decode()[:c] + 'PACKAGE_INDEX' + current.decode()[d:] == body, 'Native runtime body changed'
    table = {row['filename']: row for row in metadata['files']}
    old = table[VIRTUAL]
    source = ROOT / 'scenario/warzone-towers-commands.js'
    content = source.read_bytes()
    data = base_data + content
    old.update(start=len(base_data), end=len(data))
    metadata.update(remote_package_size=len(data), package_uuid='towers-loss-builders-052-' + digest(data)[:16])
    output = (before[:a] + 'loadPackage(' + json.dumps(metadata, separators=(',', ':')) + ')' + before[b:]).encode()
    x, y, _, final_index = R['package_call'](output.decode())
    assert output.decode()[:x] + 'PACKAGE_INDEX' + output.decode()[y:] == body
    R['verify_index'](final_index, data)
    _, _, _, baseline_index = R['package_call'](base_js)
    old_table = {row['filename']: row for row in baseline_index['files']}
    unchanged = 0
    for row in final_index['files']:
        if row['filename'] == VIRTUAL:
            assert data[row['start']:row['end']] == content
        else:
            previous = old_table[row['filename']]
            assert data[row['start']:row['end']] == base_data[previous['start']:previous['end']]
            unchanged += 1
    write(ASSETS / 'warzone2100.data', data)
    write(loader, output)
    record = dict(version='0.52', passed=True, baselineAPK_SHA256=BASELINE_SHA,
        onlyChangedVirtualFile=VIRTUAL, sourcePath=source.relative_to(ROOT).as_posix(), sourceSHA256=digest(content),
        baselineDataBytes=len(base_data), baselineDataSHA256=digest(base_data), originalDataPrefixUnchanged=True,
        unchangedOtherVirtualFiles=unchanged, runtimeBodySHA256=digest(body.encode()),
        nativeLoaderBeforeScenario=dict(path=original.relative_to(ROOT).as_posix(), sha256=digest(original.read_bytes())),
        loaderSHA256=digest(output), dataSHA256=digest(data), dataBytes=len(data),
        campaignAndDuelEntryRuntimeFilesUnchanged=True)
    PAYLOAD.write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record))


if __name__ == '__main__':
    main()
