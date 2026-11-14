"""Package only the exact checked v0.55 Campaign cancellation delivery.

This is a packaging gate, never an emulator runner or native/bootstrap builder.
Unchanged complete-source ZIP members reuse their preserved compressed bytes.
"""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
import argparse
import json
import re
import runpy
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CAMPAIGN = runpy.run_path(str(ROOT / 'tools/package-campaign-051.py'), run_name='campaign055_package_helpers')
H, C = CAMPAIGN['H'], CAMPAIGN['C']
digest, zip_digest, require = (C[key] for key in ('digest', 'zip_digest', 'require'))
MANIFEST = C['MANIFEST']
R = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='campaign055_index_helpers')
FALLBACK = 'archive/fallback-0.55.json'
EMULATOR = 'archive/campaign-0.55-emulator-checks.json'
PAYLOAD = 'archive/campaign-0.55-payload.json'
RECORD = 'archive/release-0.55-campaign-cancel.json'
GRADLE = 'app/build.gradle.kts'
ASSETS = 'app/src/main/assets/'
CAMPAIGN_HOOK = 'campaign/commands.js'
PRESERVED_CAMPAIGN = ('campaign/mobile-events.js', 'campaign/research-bridge.js')
VIRTUAL = '/data/base/script/campaign/mobile/campaign-bridge.js'
BASELINE_APK_SHA = '89c842519c2c34cdb87fec002d98a2d0bf6277a2058feaccdd9f7d731c795f99'
BASELINE_SOURCE_SHA = '41d18033cd239d8bd4f03736e2a24ae81487fc9f76506427f0a337098ff4145d'
APP_CHANGES = {ASSETS + name for name in ('warzone/warzone2100-campaign.js', 'warzone/warzone2100-campaign.data')}
APP_ADDITIONS = set()
APP_SCOPE = APP_CHANGES
DOCUMENTATION = {'AGENTS.md', 'README.md', 'design-qa.md', 'docs/KNOWN-ISSUES.md'}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def repository_path(value):
    path = Path(str(value).replace('\\', '/'))
    path = (path if path.is_absolute() else ROOT / path).resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing/outside repository file: ' + str(value))
    return path


def pinned_rows(rows, label):
    require(isinstance(rows, list) and rows, 'Missing pinned ' + label)
    names = set()
    for row in rows:
        path = repository_path(row['path'])
        name = path.relative_to(ROOT).as_posix()
        require(name not in names and row['sha256'] == digest(path), label + ' changed/duplicated: ' + name)
        if 'bytes' in row:
            require(row['bytes'] == path.stat().st_size, label + ' size changed: ' + name)
        names.add(name)
    return names


def baseline_paths():
    saved = read_json(ROOT / FALLBACK)
    require(saved.get('version') == '0.55' and saved.get('baseline') == '0.54', 'Wrong fallback record')
    for row in saved['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
            'Immutable v0.54 fallback changed: ' + str(path))
    apk = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.apk'))
    source = next(Path(row['path']) for row in saved['files'] if row['path'].endswith('.zip'))
    require(digest(apk) == BASELINE_APK_SHA and digest(source) == BASELINE_SOURCE_SHA, 'Wrong v0.54 baseline bytes')
    return apk, source


def validate_emulator(expected_sha):
    proof = read_json(ROOT / EMULATOR)
    require(proof.get('version') == '0.55' and proof.get('passed') is True
        and proof.get('emulatorUsed') is True and proof.get('actualNativeEngineExecuted') is True
        and proof.get('candidateAPK_SHA256') == expected_sha,
        'Passed exact delivery-APK emulator proof is required')
    sources = pinned_rows(proof.get('sources'), 'emulator source')
    evidence = pinned_rows(proof.get('evidence'), 'emulator evidence')
    require(all(not name.startswith('qa/') for name in evidence), 'Curated emulator evidence must be retained outside disposable QA')
    return proof, sources, evidence


def validate_campaign_data(baseline, baseline_source):
    """Check the one Campaign VFS append and unchanged compiled native runtimes."""
    payload = read_json(ROOT / PAYLOAD)
    require(payload.get('version') == '0.55' and payload.get('passed') is True
        and payload.get('baselineAPK_SHA256') == BASELINE_APK_SHA
        and payload.get('baselineSourceSHA256') == BASELINE_SOURCE_SHA
        and payload.get('onlyChangedVirtualFile') == VIRTUAL
        and payload.get('originalDataPrefixUnchanged') is True
        and payload.get('sourcePath') == CAMPAIGN_HOOK
        and payload.get('sourceSHA256') == digest(ROOT / CAMPAIGN_HOOK), 'Campaign VFS proof failed')
    asset_root = ROOT / ASSETS / 'warzone'
    loader_path, data_path = asset_root / 'warzone2100-campaign.js', asset_root / 'warzone2100-campaign.data'
    loader, data = loader_path.read_text(encoding='utf-8'), data_path.read_bytes()
    require(digest(loader_path) == payload['loaderSHA256'] and digest(data_path) == payload['dataSHA256']
        and len(data) == payload['dataBytes'], 'Campaign payload differs from proof')
    with ZipFile(baseline) as old, ZipFile(baseline_source) as old_source:
        old_data = old.read('assets/warzone/warzone2100-campaign.data')
        old_loader = old.read('assets/warzone/warzone2100-campaign.js').decode()
        a, b, _, old_index = R['package_call'](old_loader)
        c, d, _, index = R['package_call'](loader)
        body = loader[:c] + 'PACKAGE_INDEX' + loader[d:]
        require(body == old_loader[:a] + 'PACKAGE_INDEX' + old_loader[b:]
            and sha256(body.encode()).hexdigest() == payload['runtimeBodySHA256'],
            'Campaign loader generated program changed outside package metadata')
        require(data[:len(old_data)] == old_data and payload['baselineDataBytes'] == len(old_data)
            and payload['baselineDataSHA256'] == sha256(old_data).hexdigest(), 'Original Campaign data prefix changed')
        mobile = (ROOT / PRESERVED_CAMPAIGN[0]).read_text(encoding='utf-8')
        research = (ROOT / PRESERVED_CAMPAIGN[1]).read_text(encoding='utf-8')
        commands = (ROOT / CAMPAIGN_HOOK).read_text(encoding='utf-8')
        expected_bridge = (mobile + '\n' + research + '\n' + commands).encode()
        require(data[len(old_data):] == expected_bridge, 'Campaign append differs from the exact additive source assembly')
        for name in PRESERVED_CAMPAIGN:
            require((ROOT / name).read_bytes() == old_source.read(name), 'Historical Campaign bridge changed: ' + name)
        old_table = {row['filename']: row for row in old_index['files']}
        table = {row['filename']: row for row in index['files']}
        require({key:value for key,value in index.items() if key not in {'files', 'remote_package_size', 'package_uuid'}}
            == {key:value for key,value in old_index.items() if key not in {'files', 'remote_package_size', 'package_uuid'}},
            'Campaign preload metadata changed outside the reviewed append')
        require(len(table) == len(index['files']) and set(table) == set(old_table), 'Campaign virtual-file inventory changed')
        R['verify_index'](index, data)
        changed = []
        for name, row in table.items():
            prior = old_table[name]
            if name != VIRTUAL:
                require(row == prior and data[row['start']:row['end']] == old_data[prior['start']:prior['end']],
                    'Original Campaign virtual file changed: ' + name)
            elif data[row['start']:row['end']] != old_data[prior['start']:prior['end']]:
                changed.append(name)
        row = table[VIRTUAL]
        require(changed == [VIRTUAL] and row['start'] == len(old_data) and row['end'] == len(data)
            and data[row['start']:row['end']] == expected_bridge, 'Wrong Campaign bridge VFS entry')
        require(sum(bool(re.fullmatch(r'/data/base/script/campaign/cam[^/]+\.js', name)) for name in table) == 52,
            'Original mission inventory changed')
        frozen = []
        for name in ('warzone2100.js', 'warzone2100.wasm', 'warzone2100.data',
                     'warzone2100-towers-052.js', 'warzone2100-towers-052.wasm',
                     'warzone2100-duel.js', 'index.html', 'index-duel.html', 'index-campaign.html', 'mobile-campaign.html'):
            require((asset_root / name).read_bytes() == old.read('assets/warzone/' + name), 'Frozen compiled/Towers/Duel/entry file changed: ' + name)
            frozen.append(name)
    return dict(payloadSHA256=digest(ROOT / PAYLOAD), campaignLoaderSHA256=digest(loader_path),
        campaignDataSHA256=digest(data_path), singleChangedVirtualFile=VIRTUAL,
        unchangedOtherVirtualFiles=len(table)-1, originalMissionBodiesUnchanged=52,
        originalCampaignDataPrefixUnchanged=True, noNativeBuild=True, frozenRuntimes=frozen,
        preservedCampaignBridgeSources=list(PRESERVED_CAMPAIGN))


def source_inventory(required, evidence):
    raw = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    names = set(filter(None, raw.decode().split('\0'))) | required | evidence | APP_ADDITIONS | {MANIFEST, RECORD, EMULATOR, PAYLOAD, FALLBACK}
    files = {}
    for name in sorted(names):
        rel = Path(name)
        if name.startswith('qa/') and name not in required:
            require(name not in required, 'Prior complete source unexpectedly contains disposable QA: ' + name)
            continue
        if any(part in C['SKIP'] for part in rel.parts) or name in C['TRANSIENT'] or rel.suffix in {'.partial', '.tmp'}:
            require(name not in required, 'Prior source entry would be omitted: ' + name)
            continue
        require(rel.suffix.lower() not in C['PRIVATE_SUFFIXES'] and not rel.name.startswith('.env')
            and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source: ' + name)
        require(not name.endswith(('.apk', '-source.zip', '-data.tar')), 'External runtime archive in source: ' + name)
        path = ROOT / name
        require(path.resolve().is_relative_to(ROOT) and (path.is_file() or name in {MANIFEST, RECORD}), 'Missing source: ' + name)
        files[name] = path
    require(required <= set(files), 'A prior complete-source entry was omitted')
    return files


def validate_source(source, files, checked_sources):
    with ZipFile(source) as old:
        names = set(old.namelist())
        require(len(names) == len(old.namelist()), 'Duplicate baseline source entry')
        prior = {row['path']: row for row in json.loads(old.read(MANIFEST))['files']}
        require(set(prior) == names - {MANIFEST}, 'Baseline complete-source manifest incomplete')
        expected_gradle = old.read(GRADLE).replace(b'versionCode = 54', b'versionCode = 55').replace(
            b'versionName = "0.54"', b'versionName = "0.55"')
        require(files[GRADLE].read_bytes() == expected_gradle, 'Gradle changed beyond version55')
        changed = []
        for name, row in prior.items():
            actual = digest(files[name])
            if actual == row['sha256']:
                continue
            if name.startswith('app/'):
                require(name in APP_CHANGES | {GRADLE}, 'Unexpected app/Campaign/Duel source change: ' + name)
            elif name.startswith('scenario/'):
                require(False, 'Towers/Duel scenario changed: ' + name)
            elif name.startswith('campaign/'):
                require(name == CAMPAIGN_HOOK, 'Original Campaign source changed: ' + name)
            else:
                require(name in DOCUMENTATION or name.startswith(('tools/', 'archive/')),
                    'Unrelated source changed: ' + name)
            changed.append(dict(path=name, beforeSHA256=row['sha256'], sha256=actual))
        additions = {name for name in files if name.startswith('app/') and name not in prior}
        require(additions == APP_ADDITIONS, 'Unexpected new app files: ' + str(sorted(additions)))
        require(not any(name.startswith('campaign/') and name not in prior for name in files), 'Campaign source added')
        require(not any(name.startswith('scenario/') and name not in prior for name in files), 'Scenario source added')
        delivery_changes = {row['path'] for row in changed if row['path'].startswith(('app/', 'scenario/', 'campaign/'))} | APP_ADDITIONS
        require(delivery_changes <= checked_sources, 'Changed delivery source was not pinned by emulator proof: ' + str(sorted(delivery_changes - checked_sources)))
    return dict(changedBaselineSources=changed, baselineSourceEntries=len(names), addedAppSources=sorted(additions),
        everyBaselineSourceEntryRetained=True, allOtherAppSourcesFrozen=True, towersAndDuelSourcesFrozen=True, originalCampaignMissionSourcesFrozen=True)


def validate_apk(apk, baseline, expected_sha):
    require(apk.is_file() and digest(apk) == expected_sha, 'Candidate APK changed')
    aapt, java, signer = H['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='55'",
        "versionName='0.55'", "application-label:'Warzone Towers'")), 'APK identity/version mismatch')
    signing = H['certificate'](apk, java, signer)
    require(signing == H['certificate'](baseline, java, signer), 'Signing certificate changed')
    with ZipFile(apk) as current, ZipFile(baseline) as old:
        names, prior = set(current.namelist()), set(old.namelist())
        require(len(names) == len(current.namelist()) and current.testzip() is None, 'Corrupt or duplicate APK archive')
        require(prior <= names, 'A prior APK member was removed')
        asset_additions = {name.removeprefix('app/src/main/') for name in APP_ADDITIONS}
        require({name for name in names if name.startswith('assets/')} == {name for name in prior if name.startswith('assets/')} | asset_additions,
            'APK asset inventory changed beyond Campaign cancellation bridge')
        changed = []
        for name in sorted(names):
            if name in prior and zip_digest(current, name) == zip_digest(old, name):
                continue
            require(name.startswith('assets/') and 'app/src/main/' + name in APP_SCOPE or C['metadata'](name),
                'Unexpected APK member change: ' + name)
            changed.append(name)
        for path in (ROOT / ASSETS).rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / ASSETS).as_posix()
                require(name in names and zip_digest(current, name) == digest(path), 'APK/source asset mismatch: ' + name)
        mutable_runtime = {'assets/warzone/warzone2100-campaign.js', 'assets/warzone/warzone2100-campaign.data'}
        for name in prior:
            if name not in mutable_runtime and re.fullmatch(r'assets/warzone/warzone2100(?:-[^/]+)?\.(?:js|wasm|data)', name):
                require(zip_digest(current, name) == zip_digest(old, name), 'Frozen native/Towers/Duel asset changed: ' + name)
        music = 'assets/warzone/music/music.data'
        require(current.getinfo(music).compress_type == ZIP_STORED and zip_digest(current, music) == zip_digest(old, music),
            'Bundled soundtrack changed or compressed')
    return dict(certificateSHA256=signing, changedAPKMembers=changed, allAPKAssetsMatchSource=True,
        everyBaselineAPKMemberRetained=True, nativeTowersAndDuelRuntimeFrozen=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery outputs must stay outside the repository')
    baseline, source = baseline_paths()
    proof, checked_sources, evidence = validate_emulator(expected)
    campaign = validate_campaign_data(baseline, source)
    with ZipFile(source) as old:
        required = set(old.namelist())
    files = source_inventory(required, evidence)
    preservation = validate_source(source, files, checked_sources)
    apk_record = validate_apk(args.apk, baseline, expected)
    require(digest(args.apk) == expected, 'Candidate APK changed during validation')
    if args.validate_only:
        print(json.dumps(dict(packageValidationPassed=True, deliveryWritten=False, sourceFiles=len(files),
            **preservation, **apk_record, campaignPayload=campaign), indent=2))
        return
    apk_out, source_out, checksum = (args.output / name for name in ('Warzone-Towers-0.55.apk',
        'warzone-towers-0.55-source.zip', 'Warzone-Towers-0.55-SHA256.txt'))
    partial = source_out.with_suffix('.zip.partial')
    require(not any(path.exists() for path in (apk_out, source_out, checksum, partial)), 'Delivery output already exists')
    record = dict(version='0.55', versionCode=55, candidateAPK_SHA256=expected,
        scope='Campaign-only cancellation journal/blueprint cleanup; native engine, original missions, Towers/Duel and all other app inputs remain preserved.',
        emulatorUsed=True, exactAPKVerified=True, githubPublished=False, vpsChanged=False,
        fallback=dict(path=FALLBACK, sha256=digest(ROOT / FALLBACK)), verification=proof,
        sourcePreservation=preservation, campaignPayload=campaign, **apk_record,
        recordedUTC=datetime.now(timezone.utc).isoformat())
    (ROOT / RECORD).write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    entries = [dict(path=name, bytes=path.stat().st_size, sha256=digest(path)) for name, path in files.items() if name != MANIFEST]
    (ROOT / MANIFEST).write_text(json.dumps(dict(schemaVersion=1, files=entries), indent=2) + '\n', encoding='utf-8')
    args.output.mkdir(parents=True, exist_ok=True)
    reused = H['write_source_zip'](source, partial, files, entries)
    require(digest(args.apk) == expected, 'Candidate changed while complete source was packaged')
    shutil.copy2(args.apk, apk_out)
    require(digest(apk_out) == expected and digest(args.apk) == expected, 'Delivery/candidate APK changed during copy')
    with ZipFile(partial) as archive, ZipFile(apk_out) as apk:
        require(required <= set(archive.namelist()), 'Complete prior source missing from output ZIP')
        for name in files:
            if name.startswith(ASSETS):
                require(zip_digest(archive, name) == zip_digest(apk, 'assets/' + name[len(ASSETS):]), 'Source ZIP/APK asset mismatch: ' + name)
    partial.rename(source_out)
    apk_sha, source_sha = digest(apk_out), digest(source_out)
    require(apk_sha == expected and digest(args.apk) == expected, 'Exact APK changed before delivery completed')
    checksum.write_text(apk_sha + '  ' + apk_out.name + '\n' + source_sha + '  ' + source_out.name + '\n', encoding='utf-8')
    require(digest(apk_out) == expected and digest(args.apk) == expected and digest(source_out) == source_sha,
        'Delivery output changed before final checksum verification')
    print(json.dumps(dict(packageIntegrityPassed=True, apk=str(apk_out), apkSHA256=apk_sha,
        source=str(source_out), sourceSHA256=source_sha, checksums=str(checksum), sourceFiles=len(files),
        rawCopiedUnchangedZIPMembers=reused, everySourceMemberCRCAndSHAStreamed=True,
        exactCheckedAPKCopied=True, nativeTowersAndDuelFrozen=True), indent=2))


if __name__ == '__main__':
    main()
