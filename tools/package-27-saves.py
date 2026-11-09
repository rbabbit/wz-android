"""Package 0.27 saved games, active-match Rewards and a compact wave notice.

Archive/source checks are separate from the required hash-bound focused
emulator report. The native package index may change only to append reviewed
script hooks; compiled engine bytes, WASM, the original data prefix and every
unrelated native virtual file remain frozen. No complete gameplay claim follows.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from datetime import datetime, timezone
import argparse
import json
import os
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
COMMON = runpy.run_path(str(ROOT / 'tools/package-24-home.py'), run_name='package_027_helpers')
require, digest, zip_digest = (COMMON[k] for k in ('require', 'digest', 'zip_digest'))
read_json, write_json, repo_path, metadata = (COMMON[k] for k in ('read_json', 'write_json', 'repo_path', 'metadata'))
NATIVE_SOURCE, MANIFEST, STORED, SKIP, TRANSIENT, PRIVATE_SUFFIXES = (COMMON[k] for k in (
    'NATIVE_SOURCE', 'MANIFEST', 'STORED', 'SKIP', 'TRANSIENT', 'PRIVATE_SUFFIXES'))
BASELINE_SHA = 'ab464a5e280e0936b4d486c5a20219bc20e0a9860dab9c014c2ab2dd8f1e0cac'
SOURCE_SHA = '2258f67f256e8bf61f7aeacb42c9325797c39c58e6c54d37e54e58a2035904fa'
ASSET_SCOPE = {'assets/warzone-touch-controls.js', 'assets/warzone/rewards.js',
               'assets/warzone/warzone2100.js', 'assets/warzone/warzone2100.data',
               'assets/warzone/levels/catalog.json'}
OPTIONAL_ASSET_SCOPE = set()
NEW_ASSET_SCOPE = {'assets/warzone/saved-games.js', 'assets/warzone/ui/icons/save.svg'}
GENERATED_RESOURCE_SCOPE = set()
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
SOURCE_SCOPE = {JAVA + n for n in ('MainActivity.java', 'GraphicsSetupView.java',
    'RewardStore.java', 'RewardsView.java', 'RewardLedger.java', 'SaveGameStore.java', 'SavedGamesView.java')}
SOURCE_SCOPE |= {'app/src/main/' + n for n in ASSET_SCOPE | OPTIONAL_ASSET_SCOPE | NEW_ASSET_SCOPE}
OLD_NATIVE_LEVEL, NEW_NATIVE_LEVEL = 'Greenhaven-Beginner-T1', 'Greenhaven-T1'
MAP_NAME_SOURCE_SCOPE = {'map/greenhaven-beginner/level.lev', 'scenario/beginner/config-router.js',
                         'scenario/warzonetowers-beginner.json', 'scenario/beginner/README.md'}
SCENARIO_SCOPE = {'scenario/warzone-towers-commands.js', 'scenario/warzone-towers-rewards.js'} | MAP_NAME_SOURCE_SCOPE
VFS_CHANGE_SCOPE = {'/data/mp/tests/warzone-towers-commands.js', '/data/mp/tests/warzone-towers-rewards.js',
                    '/data/mp/addon.lev', '/data/mp/tests/towers-config-router-018.js',
                    '/data/mp/tests/warzonetowers-beginner.json'}
VFS_ADD_SCOPE = set()
RECORD = 'archive/release-0.27-focused-tested.json'
FALLBACK = 'archive/fallback-0.27.json'


def verify_native(apk, old, proof):
    """Recompute preservation from actual APK bytes, independently of builder assertions."""
    runtime = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='rewards_package_027')
    before_js = old.read('assets/warzone/warzone2100.js').decode('utf-8')
    after_js = apk.read('assets/warzone/warzone2100.js').decode('utf-8')
    before_data = old.read('assets/warzone/warzone2100.data')
    after_data = apk.read('assets/warzone/warzone2100.data')
    a, b, _, before_index = runtime['package_call'](before_js)
    c, d, _, after_index = runtime['package_call'](after_js)
    runtime['verify_index'](before_index, before_data)
    runtime['verify_index'](after_index, after_data)
    normalized = before_js[:a] + 'PACKAGE_INDEX' + before_js[b:]
    require(after_js[:c] + 'PACKAGE_INDEX' + after_js[d:] == normalized, 'Compiled engine program body changed')
    require(apk.read('assets/warzone/warzone2100.wasm') == old.read('assets/warzone/warzone2100.wasm'), 'Compiled WASM changed')
    require(len(after_data) >= len(before_data) and after_data[:len(before_data)] == before_data, 'Original data prefix changed')
    before = {r['filename']: r for r in before_index['files']}
    after = {r['filename']: r for r in after_index['files']}
    require(not set(before) - set(after), 'Native virtual files removed')
    added = set(after) - set(before)
    changed = {name for name in before if before_data[int(before[name]['start']):int(before[name]['end'])] !=
               after_data[int(after[name]['start']):int(after[name]['end'])]}
    require(changed == VFS_CHANGE_SCOPE, 'Native virtual replacements differ from the reviewed reward/wave hooks')
    require(added == VFS_ADD_SCOPE, 'Unexpected native virtual additions')
    require(set(proof.get('changedVFSFiles', [])) == changed, 'Builder changed virtual-file inventory differs')
    require(set(proof.get('addedVFSFiles', [])) == added, 'Builder added virtual-file inventory differs')
    require(proof.get('dataPrefixPreserved') is True and proof.get('normalizedEngineBodyUnchanged') is True
            and proof.get('wasmUnchanged') is True, 'Builder preservation assertions missing')
    require(proof.get('originalDataBytes') == len(before_data)
            and proof.get('originalDataSHA256') == sha256(before_data).hexdigest()
            and proof.get('normalizedEngineBodySHA256') == sha256(normalized.encode('utf-8')).hexdigest(),
            'Builder native preservation hashes differ from actual APK bytes')
    def contents(data, rows, name):
        row = rows[name]
        return data[int(row['start']):int(row['end'])]
    for name in ('/data/mp/addon.lev', '/data/mp/tests/towers-config-router-018.js'):
        original = contents(before_data, before, name)
        require(original.count(OLD_NATIVE_LEVEL.encode()) == 1
                and contents(after_data, after, name) == original.replace(OLD_NATIVE_LEVEL.encode(), NEW_NATIVE_LEVEL.encode()),
                'Native registration/router changed beyond the one save-compatible alias: ' + name)
    challenge_path = '/data/mp/tests/warzonetowers-beginner.json'
    challenge = json.loads(contents(before_data, before, challenge_path))
    require(challenge['challenge']['map'] == OLD_NATIVE_LEVEL, 'Frozen Greenhaven challenge identity differs')
    challenge['challenge']['map'] = NEW_NATIVE_LEVEL
    require(json.loads(contents(after_data, after, challenge_path)) == challenge,
            'Native challenge changed beyond its internal save-compatible alias')
    catalog = json.loads(apk.read('assets/warzone/levels/catalog.json'))
    expected = json.loads(old.read('assets/warzone/levels/catalog.json'))
    entry = [level for level in expected['levels'] if level['id'] == 'beginner']
    require(len(entry) == 1 and entry[0]['mapName'] == OLD_NATIVE_LEVEL, 'Frozen catalog identity differs')
    entry[0]['mapName'] = NEW_NATIVE_LEVEL
    require(catalog == expected, 'Catalog changed beyond the one internal native save name')
    require(len(catalog['levels']) == 46 and all(0 < len(level['mapName'].encode('utf-8')) < 20 for level in catalog['levels']),
            'A native catalog level name cannot fit the saved-game header')
    matrix = proof.get('nativeMapSaveNames', {})
    require(matrix.get('passed') is True and matrix.get('levelCount') == 46
            and matrix.get('changedInternalLevelNames') == {OLD_NATIVE_LEVEL: NEW_NATIVE_LEVEL},
            'Native map-name proof missing or outside the authorized correction')
    for level in matrix.get('allLevels', []):
        source = ROOT / level['challenge']; repo_path(source)
        require(source.is_file() and digest(source) == level['challengeSHA256'], 'Challenge proof source changed: ' + level['challenge'])
    return {'normalizedEngineBodySHA256': sha256(normalized.encode('utf-8')).hexdigest(),
            'originalDataBytes': len(before_data), 'dataPrefixPreserved': True,
            'compiledEngineBodyUnchanged': True, 'wasmUnchanged': True,
            'changedVFSFiles': sorted(changed), 'addedVFSFiles': sorted(added),
            'unchangedResolvedVFSFiles': len(before) - len(changed),
            'internalSaveNameCorrection': {OLD_NATIVE_LEVEL: NEW_NATIVE_LEVEL},
            'mapCatalogOtherwiseUnchanged': True, 'all46NativeNamesFitSavedGameHeader': True}


def verify_generated_resource_ids(aapt, candidate, baseline, changed):
    """A new drawable renumbers existing IDs; permit only identical resolved XML."""
    def resource_table(apk):
        text = subprocess.check_output([str(aapt), 'dump', 'resources', str(apk)], text=True, encoding='utf-8')
        return dict(re.findall(r'^\s*resource (0x[0-9a-fA-F]+) (\S+)', text, re.M)), text
    before, before_table = resource_table(baseline)
    after, after_table = resource_table(candidate)
    def resolve_xml(apk, name, table):
        text = subprocess.check_output([str(aapt), 'dump', 'xmltree', str(apk), '--file', name], text=True, encoding='utf-8')
        def replace(match):
            require(match[1] in table, 'Compiled drawable references an unknown resource ID')
            return '@' + table[match[1]]
        return re.sub(r'@(0x[0-9a-fA-F]+)', replace, text)
    def branding_entry(table):
        match = re.search(r'^\s*resource 0x[0-9a-fA-F]+ drawable/warzone_branding\s*\n([^\n]+)', table, re.M)
        require(match is not None, 'Original branding resource missing')
        return match[1].strip()
    require(branding_entry(before_table) == branding_entry(after_table), 'Branding resource target changed')
    for name in changed:
        old_xml = resolve_xml(baseline, name, before)
        new_xml = resolve_xml(candidate, name, after)
        require(old_xml == new_xml and '@drawable/warzone_branding' in new_xml,
                'Generated resource XML changed beyond equivalent ID remapping: ' + name)
    return sorted(changed)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--payload-proof', type=Path, default=ROOT / 'archive/rewards-0.27-payload.json')
    parser.add_argument('--expected-payload-proof-sha256', required=True)
    parser.add_argument('--source-report', type=Path, action='append', required=True)
    parser.add_argument('--emulator-proof', type=Path, required=True)
    parser.add_argument('--expected-emulator-proof-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside source tree')
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Candidate APK hash differs')
    emulator_name = repo_path(args.emulator_proof)
    require(digest(args.emulator_proof) == args.expected_emulator_proof_sha256, 'Emulator proof hash differs')
    emulator = read_json(args.emulator_proof)
    require(emulator.get('candidateAPK_SHA256') == candidate and emulator.get('emulatorUsed') is True,
            'Focused emulator evidence must bind the exact delivery APK')
    require(emulator.get('gameplayVerified') is False, 'Focused save/reward checks must not claim complete gameplay verification')
    observed_checks = emulator.get('checks', [])
    require(isinstance(observed_checks, list) and observed_checks
            and all(check.get('passed') is True and check.get('name') for check in observed_checks),
            'Focused emulator observations must name the checks actually passed')
    evidence_files = emulator.get('evidenceFiles', [])
    require(isinstance(evidence_files, list) and evidence_files, 'Focused emulator evidence inventory missing')
    for entry in evidence_files:
        path = ROOT / entry['path']; repo_path(path)
        require(path.is_file() and digest(path) == entry['sha256'], 'Focused emulator evidence changed: ' + entry['path'])
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'], 'Frozen fallback changed: ' + str(path))
    baseline = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.26.apk')
    old_source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.26-source.zip')
    require(digest(baseline) == BASELINE_SHA and digest(old_source) == SOURCE_SHA, 'Wrong 0.26 baseline')
    proof_name = repo_path(args.payload_proof)
    require(digest(args.payload_proof) == args.expected_payload_proof_sha256, 'Native payload proof hash differs')
    proof = read_json(args.payload_proof)
    require(proof.get('baselineSHA256') == BASELINE_SHA and proof.get('emulatorUsed') is False,
            'Wrong baseline or runtime scope in native proof')
    for entry in proof.get('sources', []):
        path = ROOT / entry['path']
        repo_path(path)
        require(path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Native proof source changed: ' + entry['path'])
    for entry in proof.get('sourceCheckReports', []):
        path = ROOT / entry['path']
        repo_path(path)
        require(path.is_file() and digest(path) == entry['sha256'], 'Native proof source fixture changed: ' + entry['path'])
    outputs = proof.get('outputs', [])
    require({e['path'] for e in outputs} == {'app/src/main/assets/warzone/warzone2100.js', 'app/src/main/assets/warzone/warzone2100.data'},
            'Native payload output inventory differs')
    for entry in outputs:
        path = ROOT / entry['path']
        repo_path(path)
        require(path.is_file() and path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'], 'Native payload proof output differs: ' + entry['path'])
    reports = []
    for path in args.source_report:
        name = repo_path(path)
        report = read_json(path)
        require(report.get('emulatorUsed') is False, 'Source report must explicitly exclude emulator use')
        for entry in report.get('sources', []):
            source = ROOT / entry['path']
            repo_path(source)
            require(source.is_file() and digest(source) == entry['sha256'], 'Reviewed source changed: ' + entry['path'])
        reports.append({'path': name, 'sha256': digest(path)})
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'AppData/Local/Android/Sdk')))
    aapt = sdk / 'build-tools/36.1.0/aapt2.exe'
    with ZipFile(args.apk) as apk, ZipFile(baseline) as old:
        require(apk.testzip() is None, 'Built APK CRC failure')
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()), 'Duplicate APK entry')
        removed, added = old_names - names, names - old_names
        require(not any(n.startswith('assets/') for n in removed), 'APK assets removed')
        require(all(metadata(n) for n in removed), 'Unexpected removed APK member')
        added_assets = {n for n in added if n.startswith('assets/')}
        require(added_assets == NEW_ASSET_SCOPE, 'New reward APK asset inventory differs')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(old, n) != zip_digest(apk, n)]
        changed_assets = {n for n in changed if n.startswith('assets/') and n in old_names}
        require(ASSET_SCOPE <= changed_assets <= ASSET_SCOPE | OPTIONAL_ASSET_SCOPE, 'Changed reward APK asset inventory differs')
        require(all(n in ASSET_SCOPE | OPTIONAL_ASSET_SCOPE | NEW_ASSET_SCOPE | GENERATED_RESOURCE_SCOPE or metadata(n) for n in changed),
                'APK changed outside authorized reward scope')
        remapped_resources = verify_generated_resource_ids(aapt, args.apk, baseline,
            set(changed) & GENERATED_RESOURCE_SCOPE)
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in names and digest(path) == zip_digest(apk, name), 'Stale/missing APK source asset: ' + name)
        frozen_assets = {n: zip_digest(old, n) for n in old_names if n.startswith('assets/') and n not in changed_assets}
        require(all(zip_digest(apk, n) == sha for n, sha in frozen_assets.items()), 'Frozen maps/music/Duel asset changed')
        native = verify_native(apk, old, proof)
    with ZipFile(old_source) as source:
        source_names = set(source.namelist())
        protected = [n for n in source_names if not n.endswith('/') and (
            n.startswith('vendor/') or (n.startswith('map/') and n not in MAP_NAME_SOURCE_SCOPE) or n == NATIVE_SOURCE or
            (n.startswith('scenario/') and n not in SCENARIO_SCOPE) or
            (n.startswith('app/src/main/') and n not in SOURCE_SCOPE))]
        for name in protected:
            path = ROOT / name
            require(path.is_file() and digest(path) == zip_digest(source, name), 'Frozen source changed: ' + name)
        for name in MAP_NAME_SOURCE_SCOPE:
            original, current = source.read(name), (ROOT / name).read_bytes()
            if name.endswith('.json'):
                expected = json.loads(original)
                require(expected['challenge']['map'] == OLD_NATIVE_LEVEL, 'Frozen challenge source identity differs')
                expected['challenge']['map'] = NEW_NATIVE_LEVEL
                require(json.loads(current) == expected, 'Challenge source changed beyond save name: ' + name)
            else:
                require(original.count(OLD_NATIVE_LEVEL.encode()) == (2 if name.endswith('README.md') else 1)
                        and current == original.replace(OLD_NATIVE_LEVEL.encode(), NEW_NATIVE_LEVEL.encode()),
                        'Map/router source changed beyond save name: ' + name)
        new_app_source = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()} - source_names
        require(new_app_source <= SOURCE_SCOPE, 'Unexpected app source additions: ' + str(new_app_source))
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(t in badging for t in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='27'", "versionName='0.27'", "application-label:'Warzone Towers'")), 'Wrong package/version/label')
    apk_out, source_out, checksums = [args.output / n for n in ('Warzone-Towers-0.27.apk', 'warzone-towers-0.27-source.zip', 'Warzone-Towers-0.27-SHA256.txt')]
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksums, partial)), 'Existing delivery/partial must not be overwritten')
    write_json(ROOT / RECORD, {
        'version': '0.27', 'versionCode': 27, 'candidateAPK_SHA256': candidate,
        'scope': 'Saved games, active-match Rewards and compact cleared-wave notice; focused exact-APK emulator checks.',
        'emulatorUsed': True, 'gameplayVerified': False,
        'verification': 'Source/JVM fixtures, Android compilation, exact archive integrity and only the focused observations in the bound emulator report.',
        'emulatorProof': {'path': emulator_name, 'sha256': args.expected_emulator_proof_sha256},
        'focusedEmulatorChecks': observed_checks, 'emulatorEvidenceFiles': evidence_files,
        'changedAPKAssets': sorted(changed_assets), 'newAPKAssets': sorted(added_assets),
        'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'equivalentResourceIDRemappedXML': remapped_resources,
        'nativePreservation': native, 'mapContentMusicAndDuelPayloadUnchanged': True,
        'preservedOriginalSourceFiles': len(protected), 'preservedAPKAssets': len(frozen_assets),
        'payloadProof': {'path': proof_name, 'sha256': args.expected_payload_proof_sha256},
        'sourceCheckReports': reports, 'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'git ls-files --cached --others --exclude-standard; filtered caches/private/transient files',
        'gitMetadataIncluded': False, 'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
    required = {NATIVE_SOURCE, 'tools/package-24-home.py', 'tools/package-27-saves.py',
                'tools/integrate-native-runtime.py', 'tools/embed-rewards-027.py', RECORD, FALLBACK,
                proof_name, 'README.md', 'AGENTS.md', 'docs/releases/0.27-saves.md',
                'archive/save-store-0.27-checks.json', 'tools/check-save-store-027.py',
                'tools/check-save-store-027.java', 'tools/save-store-fixture/android/content/Context.java',
                'docs/ui-0.25/1-rewards-drawer.png', 'docs/ui-0.25/2-victory-receipt.png',
                'docs/ui-0.25/3-defeat-home.png', 'docs/ui-0.25/mockups.json', emulator_name}
    required.update(r['path'] for r in reports)
    required.update(e['path'] for e in evidence_files)
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    tracked = set(filter(None, subprocess.check_output(['git', 'ls-files', '--cached', '-z'], cwd=ROOT).decode('utf-8').split('\0')))
    files = []
    for name in sorted(set(filter(None, names)) | {RECORD, MANIFEST}):
        rel = Path(name)
        if any(p in SKIP for p in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial', '.tmp'}:
            continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env') and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source entry: ' + name)
        path = ROOT / rel
        repo_path(path)
        if path.is_file():
            require(name in tracked or path.stat().st_size <= 128 * 1024 * 1024, 'Unexpected large untracked source/cache: ' + name)
            files.append((name, path))
    require(required <= {n for n, _ in files}, 'Required complete source missing: ' + str(sorted(required - {n for n, _ in files})))
    entries = [{'path': n, 'bytes': p.stat().st_size, 'sha256': digest(p)} for n, p in files if n != MANIFEST]
    write_json(ROOT / MANIFEST, {'schemaVersion': 1, 'files': entries})
    expected = {e['path']: e for e in entries}
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=3) as archive:
        for name, path in files:
            archive.write(path, name, compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist()) == len(files), 'Source archive entry count differs')
        require(archive.getinfo(NATIVE_SOURCE).file_size > 100 * 1024 * 1024, 'Complete native source missing/LFS pointer')
        for name, path in files:
            archived = zip_digest(archive, name)
            require(archived == digest(path) and (name not in expected or archived == expected[name]['sha256']), 'Source archive differs: ' + name)
    require(digest(args.apk) == candidate and digest(args.payload_proof) == args.expected_payload_proof_sha256
            and digest(args.emulator_proof) == args.expected_emulator_proof_sha256, 'Candidate/proof changed during packaging')
    for report in reports:
        require(digest(ROOT / report['path']) == report['sha256'], 'Source report changed during packaging')
    for entry in evidence_files:
        require(digest(ROOT / entry['path']) == entry['sha256'], 'Focused emulator evidence changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == candidate, 'Delivery APK differs from reviewed build')
    partial.rename(source_out)
    source_sha = digest(source_out)
    checksums.write_text(f'{candidate}  {apk_out.name}\n{source_sha}  {source_out.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': True,
                      'gameplayVerified': False, 'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size,
                      'candidateAPK_SHA256': candidate, 'source': str(source_out), 'sourceBytes': source_out.stat().st_size,
                      'sourceZIP_SHA256': source_sha, 'sourceFiles': len(files), 'checksums': str(checksums),
                      'streamedEverySourceEntryCRCAndSHA': True}, indent=2))


if __name__ == '__main__':
    main()
