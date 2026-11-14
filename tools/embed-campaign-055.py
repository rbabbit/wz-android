"""Append only the v0.55 Campaign command bridge to immutable v0.54 data.

No native compilation or mission regeneration. Read the exact delivered APK and
complete source ZIP, retain their data prefix and loader program, and replace
only the existing Campaign mobile bridge VFS row with the additive source.
"""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json, re, runpy

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
FALLBACK = ROOT / 'archive/fallback-0.55.json'
OUT = ROOT / 'archive/campaign-0.55-payload.json'
VIRTUAL = '/data/base/script/campaign/mobile/campaign-bridge.js'
ASSEMBLY = ['campaign/mobile-events.js', 'campaign/research-bridge.js', 'campaign/commands.js']
APK_SHA = '89c842519c2c34cdb87fec002d98a2d0bf6277a2058feaccdd9f7d731c795f99'
SOURCE_SHA = '41d18033cd239d8bd4f03736e2a24ae81487fc9f76506427f0a337098ff4145d'
R = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='campaign055_vfs_helpers')

def digest(value): return sha256(value).hexdigest()

def file_digest(path):
    result = sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''): result.update(block)
    return result.hexdigest()

def baseline_paths():
    saved = json.loads(FALLBACK.read_text(encoding='utf-8'))
    assert saved.get('version') == '0.55' and saved.get('baseline') == '0.54', 'Wrong fallback lineage'
    paths = {}; identities = {}
    for row in saved['files']:
        path = Path(row['path'])
        assert path.is_file() and path.stat().st_size == row['bytes'] and file_digest(path) == row['sha256'], 'Immutable fallback changed: '+str(path)
        paths[path.suffix.lower()] = path
        identities[path.suffix.lower()] = row['sha256']
    assert set(paths) == {'.apk', '.zip'}, 'Expected exact APK and complete source fallback'
    assert identities['.apk'] == APK_SHA and identities['.zip'] == SOURCE_SHA, 'Wrong delivered v0.54 bytes'
    return paths['.apk'], paths['.zip']

def main():
    baseline, source_zip = baseline_paths()
    with ZipFile(baseline) as old, ZipFile(source_zip) as source:
        loader_bytes = old.read('assets/warzone/warzone2100-campaign.js')
        data = old.read('assets/warzone/warzone2100-campaign.data')
        assert source.read('app/src/main/assets/warzone/warzone2100-campaign.js') == loader_bytes
        assert source.read('app/src/main/assets/warzone/warzone2100-campaign.data') == data, 'APK/source Campaign payload mismatch'
        loader = loader_bytes.decode('utf-8')
        start, end, _, index = R['package_call'](loader)
        R['verify_index'](index, data)
        entries = [dict(row) for row in index['files']]
        original = {row['filename']: dict(row) for row in entries}
        table = {row['filename']: row for row in entries}
        assert len(entries) == len(table) and VIRTUAL in table
        prior_parts = [source.read(name).decode('utf-8').replace('\r\n', '\n') for name in ASSEMBLY]
        current_parts = [(ROOT / name).read_text(encoding='utf-8') for name in ASSEMBLY]
        assert (ROOT / ASSEMBLY[0]).read_bytes() == source.read(ASSEMBLY[0]), 'Campaign event/Guide hooks changed'
        assert (ROOT / ASSEMBLY[1]).read_bytes() == source.read(ASSEMBLY[1]), 'Campaign research bridge changed'
        assert current_parts[2] != prior_parts[2], 'Expected reviewed Campaign commands source update'
        previous = ('\n'.join(prior_parts)).encode('utf-8')
        row = table[VIRTUAL]
        assert data[row['start']:row['end']] == previous, 'Baseline packaged bridge differs from complete source'
        content = ('\n'.join(current_parts)).encode('utf-8')
        final = data + content
        row.update(start=len(data), end=len(final))
        index.update(files=entries, remote_package_size=len(final), package_uuid='campaign-mobile-055-'+digest(final)[:16])
        current = (loader[:start]+'loadPackage('+json.dumps(index, separators=(',', ':'))+')'+loader[end:]).encode('utf-8')
        a, b, _, parsed = R['package_call'](current.decode('utf-8'))
        body = current.decode('utf-8')[:a]+'PACKAGE_INDEX'+current.decode('utf-8')[b:]
        assert body == loader[:start]+'PACKAGE_INDEX'+loader[end:]
        R['verify_index'](parsed, final)
        assert len(parsed['files']) == len(entries) and final[:len(data)] == data
        assert {key:value for key,value in parsed.items() if key not in {'files','remote_package_size','package_uuid'}} == {key:value for key,value in R['package_call'](loader)[3].items() if key not in {'files','remote_package_size','package_uuid'}}
        changed = []
        missions = 0
        for entry in parsed['files']:
            name = entry['filename']; before = original[name]
            if name == VIRTUAL:
                assert entry['start'] == len(data) and entry['end'] == len(final)
                assert final[entry['start']:entry['end']] == content
                changed.append(name)
            else:
                assert entry == before and final[entry['start']:entry['end']] == data[before['start']:before['end']], 'Other VFS entry changed: '+name
                if re.fullmatch(r'/data/base/script/campaign/cam[^/]+\.js', name): missions += 1
        assert changed == [VIRTUAL] and missions == 52, 'Unexpected Campaign mission/VFS inventory'
        # Every other packaged asset, including all native code, Towers, Duel,
        # maps, videos, sounds and entry pages stays exactly as delivered v0.54.
        frozen = []
        for name in old.namelist():
            if not name.startswith('assets/') or name.endswith('/') or name in {'assets/warzone/warzone2100-campaign.js','assets/warzone/warzone2100-campaign.data'}: continue
            target = ROOT / 'app/src/main' / name
            assert target.is_file() and file_digest(target) == digest(old.read(name)), 'Other packaged asset changed: '+name
            if name.endswith('.wasm') or '/warzone2100' in name: frozen.append({'path':name,'sha256':file_digest(target)})
        # Source-built native provenance is retained alongside the frozen bytes.
        manifest = json.loads(source.read('archive/repository-files.json'))
        native_sources = [entry for entry in manifest['files'] if entry['path'].startswith('archive/native')]
        for entry in native_sources:
            assert file_digest(ROOT / entry['path']) == entry['sha256'], 'Native provenance source changed: '+entry['path']
        for name, expected, previous_bytes in [('warzone2100-campaign.js',current,loader_bytes),('warzone2100-campaign.data',final,data)]:
            existing = (ASSETS / name).read_bytes()
            assert existing in (previous_bytes, expected), 'Unreviewed current Campaign payload: '+name
        # Finish all guards before replacing either candidate asset.
        for name, value in [('warzone2100-campaign.js',current),('warzone2100-campaign.data',final)]:
            target = ASSETS / name; temporary = target.with_name(target.name+'.v55.tmp')
            temporary.write_bytes(value); temporary.replace(target)
        proof = dict(version='0.55', passed=True, baselineAPK_SHA256=APK_SHA, baselineSourceSHA256=SOURCE_SHA,
            fallbackSHA256=file_digest(FALLBACK), onlyChangedVirtualFile=VIRTUAL,
            sourcePath=ASSEMBLY[2], sourceSHA256=file_digest(ROOT / ASSEMBLY[2]), sourceAssembly=ASSEMBLY,
            sourceAssemblySHA256={name:file_digest(ROOT/name) for name in ASSEMBLY},
            preservedMobileEventsSHA256=file_digest(ROOT/ASSEMBLY[0]), preservedResearchBridgeSHA256=file_digest(ROOT/ASSEMBLY[1]),
            baselineDataBytes=len(data), baselineDataSHA256=digest(data), originalDataPrefixUnchanged=True,
            unchangedOtherVirtualFiles=len(entries)-1, originalMissionBodiesPreserved=True, originalMissionCount=missions,
            originalMissionIncludesPreserved=True, runtimeBodySHA256=digest(body.encode('utf-8')),
            loaderSHA256=digest(current), dataSHA256=digest(final), dataBytes=len(final),
            towersAndDuelRuntimeFrozen=True, nativeRuntimeUnchanged=True, frozenNativeAssets=frozen,
            preservedNativeSourceEntries=len(native_sources))
        OUT.write_text(json.dumps(proof, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(proof))

if __name__ == '__main__': main()
