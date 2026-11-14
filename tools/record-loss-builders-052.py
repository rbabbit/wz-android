"""Record completed v0.52 exact-APK observations; never run gameplay or package.

No writes occur on import. Every required live pass, casualty record and named
screenshot must already exist and identify the exact APK before any copy/proof.
"""
from datetime import datetime, timezone
from hashlib import file_digest
from pathlib import Path
import argparse
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa/loss-builders-052'
OUT = ROOT / 'archive/loss-builders-0.52'
APK = ROOT / 'app/build/outputs/apk/debug/app-debug.apk'
RECORD = ROOT / 'archive/loss-builders-0.52-emulator-checks.json'
PASS_INPUTS = ('integrated.json', 'menus-production.json', 'save-campaign.json')
FIXTURE_INPUTS = ('delivery-casualty.json', 'casualty-fixture.json', 'quiet-fixture.json')
OPTIONAL_JSON = ('baseline-casualty.json', 'fixture-save-identity.json')
OPTIONAL_SCREENS = ('baseline-casualty.png', 'native-completed-structures.png')
SCREENS = ('delivery-casualty.png', 'recovery-waiting.png', 'recovery-selected.png',
    'recovery-assigned.png', 'recovery-complete.png', 'ordinary-production.png',
    'phone-save.png', 'saved-games.png', 'restored-world.png', 'campaign-setup.png', 'campaign-preserved.png')
EXPECTED = {
    'integrated.json': ('isolated-recovery-fixture', 'resume-without-selection-rejected',
        'explicit-single-truck-touch-selection', 'resume-existing-job',
        'stop-preserves-unrelated-waiting-jobs', 'orphan-foundation-and-remaining-plans-resumed',
        'native-completion-same-foundation-and-both-plans', 'completed-sidebar-cleanup'),
    'menus-production.json': ('repeated-menu-returns', 'ordinary-production-completes'),
    'save-campaign.json': ('phone-save', 'phone-save-restores-native-world',
        'campaign-continue-original-runtime', 'campaign-selection-and-menu-returns'),
}
PRIVATE_SUFFIXES = {'.jks', '.keystore', '.pem', '.p12', '.pfx', '.pyc'}
SKIP_PARTS = {'__pycache__', 'node_modules', '.git', '.gradle', 'build'}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def read(path):
    require(path.is_file(), 'Required observation missing: ' + str(path.relative_to(ROOT)))
    return json.loads(path.read_text(encoding='utf-8'))


def file_row(path):
    require(path.resolve().is_relative_to(ROOT) and path.is_file(), 'Invalid evidence/source path: ' + str(path))
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def candidate_identity(record, apk_sha, name):
    identities = [record[key] for key in ('installedAPK_SHA256', 'candidateAPK_SHA256') if key in record]
    require(identities and all(value == apk_sha for value in identities), 'Missing/different exact APK identity: ' + name)


def checked_inputs(apk_sha):
    records = {name: read(QA / name) for name in (*PASS_INPUTS, *FIXTURE_INPUTS)}
    records.update({name: read(QA / name) for name in OPTIONAL_JSON if (QA / name).is_file()})
    identity = records.get('fixture-save-identity.json')
    if identity is not None:
        require(identity.get('fixtureOnly') is True and identity.get('description')
            and identity.get('save', {}).get('phase') == 'error'
            and identity.get('documentSession') and identity.get('nativeSession')
            and identity['documentSession'] != identity['nativeSession'],
            'Cross-session checkpoint diagnostic is not clearly identified as fixture-only')
    cases = {}
    for name in PASS_INPUTS:
        record = records[name]
        require(record.get('version') == '0.52' and record.get('passed') is True, 'Live run did not pass: ' + name)
        candidate_identity(record, apk_sha, name)
        require(not record.get('error'), 'Live run retained an error: ' + name)
        rows = record.get('checks')
        require(isinstance(rows, list) and rows and all(isinstance(row, dict) and row.get('passed') is True
            and row.get('data') is not None for row in rows), 'Missing/failed native case data: ' + name)
        names = [row.get('name') for row in rows]
        require(len(names) == len(set(names)) and set(EXPECTED[name]) <= set(names), 'Required native cases missing/duplicated: ' + name)
        cases.update({row['name']: row['data'] for row in rows})
    casualty = records['delivery-casualty.json']
    candidate_identity(casualty, apk_sha, 'delivery-casualty.json')
    fixture = casualty.get('fixture', {})
    require(fixture.get('seeded') is True and isinstance(fixture.get('truckId'), int)
        and fixture['truckId'] > 0 and fixture.get('enemyId') and fixture.get('originalEnemy')
        and isinstance(fixture.get('replacements'), list) and len(fixture['replacements']) == 3
        and fixture.get('removedGuardTowerIDs') and len(fixture.get('jobs', [])) == 3,
        'Actual casualty fixture disclosure is incomplete')
    require(records['casualty-fixture.json'] == fixture, 'Casualty seed record differs from actual observed fixture')
    quiet = records['quiet-fixture.json']
    require(isinstance(quiet.get('removedHostileIDs'), list) and quiet['removedHostileIDs']
        and isinstance(quiet.get('description'), str) and quiet['description'], 'Quiet checkpoint disclosure missing')
    state = casualty.get('state', {})
    notice = state.get('notices', {})
    native = notice.get('lastNative', {})
    require(native.get('kind') == 'unit-lost' and native.get('id') == fixture['truckId']
        and native.get('constructor') is True and native.get('player') == 0
        and isinstance(native.get('gameTime'), (int, float)) and native['gameTime'] > 0
        and isinstance(native.get('name'), str) and native['name'].strip()
        and notice.get('lastNotice', {}).get('text') == 'Truck destroyed'
        and notice['lastNotice'].get('description') == native['name'], 'Actual native casualty notice not established')
    snapshot = state.get('commands', {}).get('snapshot', {})
    require(isinstance(snapshot.get('trucks'), list) and not any(truck.get('id') == fixture['truckId'] for truck in snapshot['trucks']),
        'Destroyed truck still present in observed native state')
    sites = {site.get('id'): site for site in snapshot.get('constructionSites', [])}
    require(all(job in sites and sites[job].get('status') == 'waiting-trucks' and not sites[job].get('workers')
        for job in fixture['jobs']), 'Casualty did not retain all waiting construction sites')
    defer = cases['isolated-recovery-fixture']
    require(isinstance(defer.get('triggers'), list) and defer['triggers']
        and all(row.get('name') == 'next' and isinstance(row.get('before'), (int, float))
            and isinstance(row.get('after'), (int, float)) and row['after'] - row['before'] == 900000
            for row in defer['triggers']), 'The 900-second fixture wave postponement is not recorded')
    integrated = records['integrated.json']
    require(integrated.get('runtimeErrors') == [], 'Integrated native runtime errors are missing/not empty')
    before = integrated.get('foundationBefore', {})
    completion = cases['native-completion-same-foundation-and-both-plans']
    lab = completion.get('lab', {})
    require(before.get('id') and lab.get('id') == before['id'] and before.get('status') == 0
        and 0 < before.get('currentBuildPts', 0) < 500 and lab.get('status', 1) == 1
        and lab.get('currentBuildPts') == 500, 'Same native foundation was not observed completing')
    for name in ('towerA', 'towerB'):
        tower = completion.get(name, {})
        require(tower.get('id') and tower.get('status', 1) == 1 and tower.get('currentBuildPts') == 300,
            'Native follow-up tower did not complete: ' + name)
    require(cases['completed-sidebar-cleanup'].get('draw') is not None, 'Completed blueprint cleanup observation missing')
    menu = cases['repeated-menu-returns']
    require(menu.get('page') == '' and menu.get('touch', {}).get('battleActive') is True, 'Menu-return world input not observed')
    production = cases['ordinary-production-completes']
    require(production.get('id') and production.get('ready') is True, 'Ordinary factory completion data missing')
    save, restored = cases['phone-save'], cases['phone-save-restores-native-world']
    require(save.get('phase') == 'saved' and re.fullmatch(r'wt_[0-9a-f]{32}', save.get('savedId', ''))
        and restored.get('save', {}).get('slotId') == save['savedId']
        and restored.get('snapshot', {}).get('hasHQ') is True, 'Phone SAVE/native restore not established')
    campaign = cases['campaign-continue-original-runtime']
    runtime = campaign.get('runtime')
    require(campaign.get('config') == '/warzone2100-campaign'
        and isinstance(runtime, list) and runtime and all('towers-052' not in name for name in runtime)
        and any('warzone2100-campaign.js' in name for name in runtime)
        and campaign.get('campaign', {}).get('snapshot', {}).get('mode') == 'campaign', 'Campaign original-runtime Continue not established')
    require(cases['campaign-selection-and-menu-returns'].get('selectedCount', 0) > 0, 'Campaign selection/menu return missing')
    for name in (*SCREENS, *(name for name in OPTIONAL_SCREENS if (QA / name).is_file())):
        path = QA / name
        require(path.is_file() and path.stat().st_size > 100, 'Required final screenshot missing: ' + name)
        with path.open('rb') as stream:
            require(stream.read(8) == b'\x89PNG\r\n\x1a\n', 'Invalid final screenshot: ' + name)
    return records, cases


def source_paths():
    paths = {ROOT / 'app/build.gradle.kts', Path(__file__).resolve(), ROOT / 'README.md',
        ROOT / 'docs/releases/0.52-loss-builders.md', ROOT / 'tools/android-sdk.cjs',
        ROOT / 'tools/integrate-native-runtime.py', ROOT / 'archive/fallback-0.52.json'}
    for folder in ('app/src', 'campaign', 'scenario', 'archive/native-unit-loss-0.52'):
        paths.update(path for path in (ROOT / folder).rglob('*') if path.is_file())
    paths.update(path for path in (ROOT / 'tools').glob('*052*') if path.is_file())
    paths.update(path for path in (ROOT / 'archive').glob('*0.52*') if path.is_file() and path != RECORD)
    for path in paths:
        name = path.relative_to(ROOT)
        require(path.is_file() and not name.as_posix().startswith('qa/'), 'Missing/transient source identity: ' + str(name))
        require(path.suffix.lower() not in PRIVATE_SUFFIXES and not path.name.startswith('.env')
            and not any(part in SKIP_PARTS for part in name.parts)
            and path.suffix.lower() not in {'.tmp', '.part', '.partial'}, 'Private/transient source identity: ' + str(name))
    return sorted(paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-sha256', required=True)
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected) and APK.is_file() and digest(APK) == expected, 'Current exact candidate APK mismatch')
    records, cases = checked_inputs(expected)
    fallback_path = ROOT / 'archive/fallback-0.52.json'
    fallback = read(fallback_path)
    require(fallback.get('version') == '0.52' and fallback.get('baseline') == '0.51', 'Wrong fallback identity')
    for row in fallback['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'Immutable v0.51 fallback changed: ' + str(path))
    baseline = records.get('baseline-casualty.json')
    if baseline is not None:
        baseline_apks = [row['sha256'] for row in fallback['files'] if Path(row['path']).suffix.lower() == '.apk']
        require(len(baseline_apks) == 1, 'Ambiguous v0.51 baseline APK identity')
        candidate_identity(baseline, baseline_apks[0], 'baseline-casualty.json')
        require(baseline.get('fixture', {}).get('seeded') is True
            and baseline.get('state', {}).get('commands', {}).get('snapshot', {}).get('constructionSites'),
            'Baseline casualty reproduction data missing')
    sources = [file_row(path) for path in source_paths()]
    optional_names = tuple(name for name in (*OPTIONAL_JSON, *OPTIONAL_SCREENS) if (QA / name).is_file())
    names = (*PASS_INPUTS, *FIXTURE_INPUTS, *SCREENS, *optional_names)
    before = {name: file_row(QA / name) for name in names}
    require(digest(APK) == expected, 'Candidate APK changed while evidence was validated')
    require(not OUT.exists() or all(path.is_file() and path.name in names for path in OUT.iterdir()), 'Uncurated files already in evidence output directory')
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = []
    for name in names:
        destination = OUT / name
        shutil.copyfile(QA / name, destination)
        require(digest(destination) == before[name]['sha256'], 'Evidence changed during copy: ' + name)
        evidence.append(file_row(destination))
    for row in sources:
        require(digest(ROOT / row['path']) == row['sha256'], 'Source changed while recording: ' + row['path'])
    require(digest(APK) == expected, 'Candidate APK changed before proof commit')
    record = dict(version='0.52', passed=True, candidateAPK_SHA256=expected,
        emulatorUsed=True, androidWebViewUsed=True, androidRuntimeExecuted=True,
        actualNativeEngineExecuted=True, browserUsed=False, seeded=True,
        checks=list(cases), checksPassed=len(cases),
        gameplayVerifiedScope='Native seeded truck casualty and polished notice; retained plans and explicit selected-truck Resume/STOP/orphan recovery through native foundation and two-tower completion; ordinary truck production/menu returns, phone Save/Load and brief preserved Campaign Continue/selection.',
        fixtureDisclosure=dict(casualty=records['delivery-casualty.json']['fixture'], quiet=records['quiet-fixture.json'],
            wavePostponementSeconds=900, wavePostponement=cases['isolated-recovery-fixture'],
            ordinaryUnmodifiedCombatBalanceVerified=False, debugHooksCompiledIntoApp=False),
        phoneSaveScope='Ordinary Towers match Save/Load; retained paused-construction plans were checked separately through native checkpoint restore and controlled serializer probes.',
        pausedConstructionPhoneSaveVerified=False,
        supportingFixtureInputs={name: dict(path=(OUT / name).relative_to(ROOT).as_posix(), sha256=before[name]['sha256'])
            for name in OPTIONAL_JSON if name in before},
        verificationInputs={name: dict(path=(OUT / name).relative_to(ROOT).as_posix(), sha256=before[name]['sha256']) for name in PASS_INPUTS},
        nativeCasualtyInput=dict(path=(OUT / 'delivery-casualty.json').relative_to(ROOT).as_posix(), sha256=before['delivery-casualty.json']['sha256']),
        fallbackRecord=dict(path=fallback_path.relative_to(ROOT).as_posix(), sha256=digest(fallback_path)),
        fullCampaignPlaythroughVerified=False, allMapsVerified=False, laterMissionsVerified=False,
        physicalPhonePerformanceVerified=False, audioPlaybackVerified=False, terrainVisualCorrectnessVerified=False,
        limitations=[
            'The casualty was seeded by changing an existing builder health/enemy position, removing five guard towers and relocating three original replacement trucks only in an emulator checkpoint.',
            'Recovery was isolated by removing hostile actors and scheduled spawns and postponing the next-wave trigger/display deadline 900 seconds only in the checkpoint; this does not verify combat balance or a full-map playthrough.',
            'Phone Save/Load used a normal Towers match. The raw F8 checkpoint came from another purchase session and was correctly rejected by the identity guard; this fixture-only rejection is not a product-save failure or a passed phone-save test of paused construction.',
            'Campaign received only a brief preserved-runtime Continue/selection/menu regression; no new full Campaign playthrough is claimed.',
            'The emulator retains its previously observed black terrain; screenshots/native models, actual orders/positions/completion were checked, not terrain appearance or audible playback.',
        ], rewardedAdsWatched=False, liveAdsTested=False, githubPublished=False, vpsChanged=False,
        sources=sources, evidence=evidence, recordedUTC=datetime.now(timezone.utc).isoformat())
    temporary = RECORD.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    temporary.replace(RECORD)
    print(json.dumps(dict(passed=True, proof=str(RECORD), candidateAPK_SHA256=expected,
        checksPassed=len(cases), sourceFiles=len(sources), curatedEvidence=len(evidence)), indent=2))


if __name__ == '__main__':
    main()
