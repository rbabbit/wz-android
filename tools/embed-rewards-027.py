"""Append only authorized idempotent midgame transaction changes to frozen 0.26 data.

No compiled engine program or WASM modifications. Repeated runs produce the
same bytes from the frozen APK rather than appending to an earlier result.
Native-API fixtures and package byte checks are source-only, not gameplay QA.
"""
from pathlib import Path
from hashlib import file_digest, sha256
from zipfile import ZipFile
import json
import os
import runpy
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
BASELINE = ROOT.parent / 'Warzone-Towers-0.26.apk'
BASELINE_SHA = 'ab464a5e280e0936b4d486c5a20219bc20e0a9860dab9c014c2ab2dd8f1e0cac'
PROOF = ROOT / 'archive/rewards-0.27-payload.json'
CHECKS = ROOT / 'archive/rewards-native-0.27-checks.json'
RUNTIME = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='rewards_payload_027')
CHANGED = {
    '/data/mp/tests/warzone-towers-commands.js': 'scenario/warzone-towers-commands.js',
    '/data/mp/tests/warzone-towers-rewards.js': 'scenario/warzone-towers-rewards.js',
    '/data/mp/tests/warzonetowers-beginner.json': 'scenario/warzonetowers-beginner.json',
    '/data/mp/tests/towers-config-router-018.js': 'scenario/beginner/config-router.js',
    # Replace one complete registration in the frozen list; retain every other
    # map registration byte. Terrain, object files and map folders stay intact.
    '/data/mp/addon.lev': 'map/greenhaven-beginner/level.lev',
}
ADDED = {}



def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(value):
    return sha256(value).hexdigest()


def path_digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def atomic_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.read_bytes() == value:
        return
    stage = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.rewards-027-', suffix='.tmp', delete=False) as stream:
            stage = Path(stream.name)
            stream.write(value)
            stream.flush()
            os.fsync(stream.fileno())
        require(path_digest(stage) == digest(value), 'Staged bytes differ: ' + str(path))
        os.replace(stage, path)
    finally:
        if stage is not None and stage.exists():
            stage.unlink()


def write_json(path, value):
    atomic_write(path, (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode('utf-8'))


def source_record(name):
    path = ROOT / name
    return {'path': name, 'bytes': path.stat().st_size, 'sha256': path_digest(path)}


def main():
    require(path_digest(BASELINE) == BASELINE_SHA, 'Frozen 0.26 APK differs')
    source_names = sorted(set(CHANGED.values()) | set(ADDED.values()) | {
        'tools/check-map-save-027.py', 'tools/build-greenhaven.py', 'tools/build-levels-019.py',
        'app/src/main/assets/warzone/levels/catalog.json',
        'scenario/warzone-towers-catalog.json', 'tools/check-rewards-native-027.cjs',
        'tools/test-command-bridge.cjs', 'tools/embed-rewards-027.py', 'tools/embed-warzone-towers.ps1',
        'scenario/warzone-towers-rules.js',
        'scenario/warzone-towers-waves.js', 'scenario/warzone-towers-objective.js',
        'vendor/tower-defense/mod/multiplay/script/mods/Spawner.js',
        'vendor/tower-defense/mod/multiplay/script/mods/configReader.js',
    })
    sources = [source_record(name) for name in source_names]
    with ZipFile(BASELINE) as archive:
        old_js_bytes = archive.read('assets/warzone/warzone2100.js')
        old_data = archive.read('assets/warzone/warzone2100.data')
        old_wasm = archive.read('assets/warzone/warzone2100.wasm')
        # The dormant Duel is a separate native payload; nothing here may alter it.
        duel = [name for name in archive.namelist() if name.startswith('assets/warzone/')
                and 'duel' in name.lower() and name.endswith(('.js', '.data', '.wasm'))]
        require(duel, 'Frozen Duel native payload inventory missing')
        for name in duel:
            path = ROOT / 'app/src/main' / name
            require(path.read_bytes() == archive.read(name), 'Dormant Duel payload changed: ' + name)
    old_js = old_js_bytes.decode('utf-8')
    begin, end, _, metadata = RUNTIME['package_call'](old_js)
    old_names = RUNTIME['verify_index'](metadata, old_data)
    rows = {entry['filename']: dict(entry) for entry in metadata['files']}
    require(set(CHANGED) <= set(rows), 'Authorized existing VFS paths missing')
    require(not set(ADDED) & set(rows), 'New rewards VFS path already in frozen baseline')
    data = bytearray(old_data)
    replacements = {}
    for virtual, source in list(CHANGED.items()) + list(ADDED.items()):
        content = (ROOT / source).read_bytes()
        if virtual == '/data/mp/addon.lev':
            row = rows[virtual]
            previous = old_data[row['start']:row['end']]
            old_registration = content.replace(b'Greenhaven-T1', b'Greenhaven-Beginner-T1')
            require(previous.count(old_registration) == 1, 'Frozen Greenhaven registration differs')
            content = previous.replace(old_registration, content)
        replacements[virtual] = content
        offset = len(data)
        data.extend(content)
        rows[virtual] = dict(rows.get(virtual, {'filename': virtual}), start=offset, end=len(data))
    current_metadata = dict(metadata, files=list(rows.values()), remote_package_size=len(data),
                            package_uuid='warzone-towers-rewards-0.27-' + str(len(data)))
    generated = old_js[:begin] + 'loadPackage(' + json.dumps(current_metadata, separators=(',', ':')) + ')' + old_js[end:]
    generated_bytes = generated.encode('utf-8')
    a, b, _, actual_metadata = RUNTIME['package_call'](generated)
    current_names = RUNTIME['verify_index'](actual_metadata, data)
    normalized = old_js[:begin] + 'PACKAGE_INDEX' + old_js[end:]
    require(generated[:a] + 'PACKAGE_INDEX' + generated[b:] == normalized, 'Compiled native engine body changed')
    require(data[:len(old_data)] == old_data, 'Frozen data prefix changed')
    require((ASSETS / 'warzone2100.wasm').read_bytes() == old_wasm, 'Compiled WASM changed')
    changed = []
    for entry in metadata['files']:
        virtual = entry['filename']
        current = rows[virtual]
        before = old_data[int(entry['start']):int(entry['end'])]
        after = data[int(current['start']):int(current['end'])]
        if after != before:
            changed.append(virtual)
    require(set(changed) == set(CHANGED), 'Native VFS replacements differ: ' + str(changed))
    require(set(current_names) - set(old_names) == set(ADDED) and not set(old_names) - set(current_names),
            'Native VFS additions/removals differ')
    for virtual, source in {**CHANGED, **ADDED}.items():
        row = rows[virtual]
        require(bytes(data[row['start']:row['end']]) == replacements[virtual], 'Stale native source: ' + virtual)
    current_js = (ASSETS / 'warzone2100.js').read_bytes()
    current_data = (ASSETS / 'warzone2100.data').read_bytes()
    previous_verified = False
    if PROOF.is_file():
        previous_proof = json.loads(PROOF.read_text(encoding='utf-8'))
        previous_outputs = {entry['path']: entry for entry in previous_proof.get('outputs', [])}
        previous_verified = previous_proof.get('baselineSHA256') == BASELINE_SHA and all(
            entry in previous_outputs and previous_outputs[entry].get('sha256') == digest(content)
            for entry, content in [('app/src/main/assets/warzone/warzone2100.js', current_js),
                                   ('app/src/main/assets/warzone/warzone2100.data', current_data)])
        if previous_verified:
            previous_begin, previous_end, _, previous_metadata = RUNTIME['package_call'](current_js.decode())
            RUNTIME['verify_index'](previous_metadata, current_data)
            require(current_js.decode()[:previous_begin] + 'PACKAGE_INDEX' + current_js.decode()[previous_end:] == normalized,
                    'Previously verified compiled engine body changed')
            require(current_data[:len(old_data)] == old_data, 'Previously verified frozen prefix changed')
            require(set(previous_proof.get('changedVFSFiles', [])) <= set(CHANGED)
                    and not previous_proof.get('addedVFSFiles') and not previous_proof.get('removedVFSFiles'),
                    'Previous native proof exceeds this authorized replacement scope')
    require((current_js == old_js_bytes and current_data == old_data)
            or (current_js == generated_bytes and current_data == data) or previous_verified,
            'Current native assets are neither exact 0.26 baseline nor this reproducible output')
    map_fixture = subprocess.run([sys.executable, 'tools/check-map-save-027.py'], cwd=ROOT,
                                 text=True, capture_output=True, check=True, encoding='utf-8')
    map_report = json.loads(map_fixture.stdout)
    require(map_report.get('passed') is True and map_report.get('levelCount') == 46,
            'Native map save-name contract failed')
    fixture = subprocess.run(['node', 'tools/check-rewards-native-027.cjs'], cwd=ROOT,
                             text=True, capture_output=True, check=True, encoding='utf-8')
    fixture_report = json.loads(fixture.stdout)
    require(fixture_report.get('passed',0) >= 27 and fixture_report.get('emulatorUsed') is False
            and fixture_report.get('gameplayVerified') is False, 'Reward fixture report differs')
    research_row=rows['/data/mp/stats/research.json']
    research=json.loads(old_data[int(research_row['start']):int(research_row['end'])])
    require(research.get('_config_',{}).get('calculationMode','compat')=='compat',
            'Native research calculation mode differs from reviewed Compat reconciliation')
    require(len(fixture_report.get('types',{}))==17,'Native shop type inventory differs')
    for key,item in fixture_report['types'].items():
        require(item['id'] in research.get(item['research'],{}).get('resultStructures',[]),
                'Actual bundled native research does not unlock reviewed item: '+key)
    bridge = subprocess.run(['node', 'tools/test-command-bridge.cjs'], cwd=ROOT,
                            text=True, capture_output=True, check=True, encoding='utf-8')
    require('PASS:' in bridge.stdout and 'FAIL' not in bridge.stdout, 'Existing command bridge regression failed')
    require(all(path_digest(ROOT / entry['path']) == entry['sha256'] for entry in sources),
            'Source changed during native fixture checks')
    write_json(CHECKS, {'scope': 'Native API source fixtures only; no emulator, actual native construction/combat or device save/load verified.',
                       'emulatorUsed': False, 'gameplayVerified': False, 'sources': sources,
                       'nativeMapSaveNames': map_report,
                       'nativeRewardFixtures': fixture_report, 'existingCommandBridgePassed': True,
                       'existingCommandBridgeOutput': bridge.stdout.strip()})
    atomic_write(ASSETS / 'warzone2100.data', bytes(data))
    atomic_write(ASSETS / 'warzone2100.js', generated_bytes)
    require((ASSETS / 'warzone2100.js').read_bytes() == generated_bytes
            and (ASSETS / 'warzone2100.data').read_bytes() == data, 'Native asset atomic-write result differs')
    outputs = [source_record('app/src/main/assets/warzone/' + name)
               for name in ('warzone2100.js', 'warzone2100.data')]
    write_json(PROOF, {'scope': 'Idempotent midgame reward transactions and Greenhaven native save-name correction; metadata append/reindex only.',
                      'baselineAPK': str(BASELINE), 'baselineSHA256': BASELINE_SHA,
                      'emulatorUsed': False, 'gameplayVerified': False,
                      'dataPrefixPreserved': True, 'originalDataBytes': len(old_data), 'originalDataSHA256': digest(old_data),
                      'normalizedEngineBodyUnchanged': True, 'normalizedEngineBodySHA256': digest(normalized.encode('utf-8')),
                      'wasmUnchanged': True, 'wasmSHA256': digest(old_wasm), 'duelPayloadUnchanged': True,
                      'changedVFSFiles': sorted(changed), 'addedVFSFiles': sorted(ADDED), 'removedVFSFiles': [],
                      'unchangedResolvedVFSFiles': len(old_names) - len(changed), 'sources': sources,
                      'nativeMapSaveNames': map_report,
                      'sourceCheckReports': [{'path': CHECKS.relative_to(ROOT).as_posix(), 'sha256': path_digest(CHECKS)}],
                      'outputs': outputs})
    print(json.dumps({'nativePayloadReady': True, 'emulatorUsed': False, 'dataBytes': len(data),
                      'changedVFSFiles': sorted(changed), 'addedVFSFiles': sorted(ADDED),
                      'proof': str(PROOF), 'proofSHA256': path_digest(PROOF),
                      'checks': str(CHECKS), 'checksSHA256': path_digest(CHECKS), 'outputs': outputs}, indent=2))


if __name__ == '__main__':
    main()
