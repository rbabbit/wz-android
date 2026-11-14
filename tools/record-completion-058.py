"""Curate completed v0.58 exact-APK observations; never test, build or package.

Importing this module performs no writes. The root runs it only after the final
case schema, exact installed candidate and complete focused journey have passed.
"""
from datetime import datetime, timezone
from hashlib import file_digest
from pathlib import Path
import argparse
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa/completion-058'
OUT = ROOT / 'archive/completion-0.58'
APK = ROOT / 'app/build/outputs/apk/debug/app-debug.apk'
RECORD = ROOT / 'archive/completion-0.58-emulator-checks.json'
FINAL = 'verify-completion-058.json'
HOST_EVIDENCE = ()
REQUIRED_CASES = ('small-map-actions-and-uncompleted-state', 'seeded-easy-boundary-badges',
    'native-final-wave-victory-and-category-credit', 'completion-persists-without-repeat-credit',
    'unwon-map-abandon-does-not-complete')
SCHEMA_READY = True
BASELINE_APK_SHA = '34e5c91a0565423745f0d6b001574629449610c400a6dbe91ef58cdd6e4a181d'
BASELINE_SOURCE_SHA = 'dc94517af369e4421336d09dd315175e75c8b0d78b01b6999d174f63c6fc350a'
DESIGN_PREFIX = re.compile(r'(?:approved|design|comparison)', re.I)
PRIVATE_SUFFIXES = {'.jks', '.keystore', '.pem', '.p12', '.pfx', '.pyc'}
SKIP_PARTS = {'__pycache__', 'node_modules', '.git', '.gradle', 'build'}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def read(path):
    require(path.is_file(), 'Required evidence missing: ' + str(path.relative_to(ROOT)))
    return json.loads(path.read_text(encoding='utf-8'))


def file_row(path):
    require(path.is_file() and path.resolve().is_relative_to(ROOT), 'Invalid source/evidence path: ' + str(path))
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def checked_final(apk_sha):
    record = read(QA / FINAL)
    require(record.get('version') == '0.58' and record.get('passed') is True and not record.get('error'),
        'Final live Home/navigation journey has not passed')
    for key in ('emulatorUsed', 'actualNativeEngineExecuted'):
        if key in record:
            require(record[key] is True, 'Final result rejects native emulator execution: ' + key)
    require(record.get('candidateAPK_SHA256') == apk_sha and record.get('device') == 'emulator-5558'
        and record.get('finishedAt'), 'Final journey differs from the exact checked emulator/APK identity')
    cases = record.get('checks')
    require(isinstance(cases, list) and cases and all(isinstance(row, dict) and row.get('passed') is True
        and isinstance(row.get('name'), str) and row['name'] and row.get('evidence') and row.get('sha256') for row in cases),
        'Missing/failed final live-case data')
    names = [row['name'] for row in cases]
    require(len(names) == len(set(names)), 'Duplicate final live-case names')
    require(SCHEMA_READY, 'Stable v0.58 per-case schema is still pending')
    require(set(REQUIRED_CASES) == set(names), 'Required complete Home QA schema is not satisfied')
    require(record.get('runtimeErrors') == [], 'Final runtime error observations missing/not empty')
    observed, paths = {}, {QA / FINAL}
    def screenshots(value, label):
        if isinstance(value, dict):
            shot = value.get('screenshot')
            if isinstance(shot, dict):
                if 'path' in shot:
                    require(isinstance(shot['path'], str) and shot['path'], 'Malformed screenshot path in ' + label)
                    image = ROOT / shot['path']
                    require(image.parent.resolve() == QA.resolve() and image.suffix.lower() == '.png'
                        and image.is_file() and digest(image) == shot.get('sha256')
                        and image.stat().st_size == shot.get('bytes'),
                        'Missing/changed screenshot in ' + label)
                    paths.add(image)
                else:
                    require(isinstance(shot.get('screenshot'), dict), 'Malformed nested screenshot capture in ' + label)
            elif shot is not None:
                require(False, 'Malformed screenshot capture in ' + label)
            for nested in value.values():
                screenshots(nested, label)
        elif isinstance(value, list):
            for nested in value:
                screenshots(nested, label)
    for row in cases:
        path = ROOT / row['evidence']
        require(path.resolve() == (QA / (row['name'] + '.json')).resolve()
            and path.is_file() and digest(path) == row['sha256'],
            'Missing or changed hash-pinned live case: ' + row['name'])
        data = read(path)
        require(data.get('name') == row['name'] and data.get('passed') is True
            and data.get('candidateAPK_SHA256') == apk_sha, 'Conflicting live case identity: ' + row['name'])
        observed[row['name']] = data
        paths.add(path)
        screenshots(data, 'live case: ' + row['name'])
    # Retain disclosed fixture history separately from the passed case records.
    failures = record.get('fixtureFailures', [])
    require(isinstance(failures, list), 'Malformed fixture-failure history')
    screenshots(failures, 'disclosed fixture-failure history')
    def retained_file(row, suffixes, label, curate=True):
        require(isinstance(row, dict), 'Missing ' + label)
        path = ROOT / row.get('path', '')
        require(path.parent.resolve() == QA.resolve() and path.suffix.lower() in suffixes
            and path.is_file() and digest(path) == row.get('sha256')
            and path.stat().st_size == row.get('bytes'), 'Missing/changed ' + label)
        if curate:
            paths.add(path)
        return path
    win = observed['native-final-wave-victory-and-category-credit']
    fixture, native_config = win.get('fixture', {}), win.get('nativeConfig', {})
    require(win.get('initialVictoryWasNative') is True and win.get('full15WavePlaythrough') is False
        and fixture.get('seeded') is True and fixture.get('mode') == 'victory'
        and native_config.get('rounds') == 15 and native_config.get('actions') == 84
        and native_config.get('sha256') == digest(ROOT / 'scenario/beginner/config.js'),
        'Seeded native terminal boundary/config disclosure missing')
    hostile = fixture.get('lastHostile', {})
    require(isinstance(hostile.get('id'), int) and hostile['id'] > 0 and hostile.get('health') == 1
        and isinstance(hostile.get('defense'), int) and hostile['defense'] > 0,
        'Real retained hostile/defense identities missing')
    timers = {(item.get('name'), item.get('timerID')) for item in fixture.get('omittedSavedTopLevelTimers', [])}
    require(timers == {('blockNightV32PollBridgeCommands', 1), ('warzoneTowersDiagnosticSnapshot', 2)},
        'Two recreated saved-timer fixture corrections were not disclosed')
    before, wallet = win.get('before', {}), win.get('wallet', {})
    catalog = read(ROOT / 'app/src/main/assets/warzone/levels/catalog.json')['levels']
    easy = {item['id'] for item in catalog if item['difficulty'] == 'easy'}
    require(len(easy) == 16 and set(before.get('completed', [])) == easy - {'beginner'}
        and 'easy' not in before.get('claimedDifficultyBonuses', [])
        and set(wallet.get('completed', [])) == easy
        and wallet.get('claimedDifficultyBonuses') == ['easy']
        and wallet.get('balance', -1) - before.get('balance', -1) == 1115,
        'Native final win did not persist the exact completion/category credit')
    packets = win.get('nativePackets', [])
    require(isinstance(packets, list) and packets, 'Native terminal observations missing')
    for packet in packets:
        wave = packet.get('wave', {})
        session = packet.get('session')
        require(packet.get('source') == 'native-log-poll-activate-before-finish'
            and isinstance(session, str) and session and wave.get('phase') == 'victory'
            and wave.get('wave') == 15 and wave.get('totalRounds') == 15
            and wave.get('enemyDroids') == 0 and wave.get('queuedEnemies') == 0
            and wave.get('completedWaves') == [15] and wave.get('rewards', {}).get('session') == session
            and packet.get('nativeErrors') == [], 'Native terminal packet mismatch/error')
        destroyed = []
        for line in packet.get('destructionRewards', []):
            require(isinstance(line, str) and 'BNTDREWARD:' in line, 'Malformed native destruction observation')
            destroyed.append(json.loads(line.split('BNTDREWARD:', 1)[1]))
        require(any(item.get('id') == hostile['id'] and item.get('player') == 0 for item in destroyed),
            'The retained final hostile has no actual native destruction event')
        run = next((item for item in wallet.get('runs', []) if item.get('session') == session), {})
        require(run.get('settled') is True and run.get('winPaid') is True
            and run.get('difficultyCredits') == 1000 and run.get('receipt', {}).get('earned') == 1115
            and re.search(r'Easy difficulty completed\s+\+1000', run.get('receipt', {}).get('reason', '')),
            'Native run receipt/settlement does not match the credited category bonus')
    retained_file(win.get('nativeLogEvidence'), {'.txt'}, 'final native console log')
    observer = QA / 'native-terminal-observer.jsonl'
    require(observer.is_file() and observer.stat().st_size <= 2 * 1024 * 1024, 'Final native observer log missing')
    observer_rows = [json.loads(line) for line in observer.read_text(encoding='utf-8').splitlines() if line.strip()]
    require(any(item.get('candidateAPK_SHA256') == apk_sha
        and item.get('session') == packets[0]['session'] and item.get('wave') == packets[0]['wave']
        and item.get('destructionRewards') == packets[0].get('destructionRewards') for item in observer_rows),
        'Final raw observer log does not match the native terminal case')
    paths.add(observer)
    retry = record.get('fixtureRetry', {})
    require(isinstance(retry, dict), 'Malformed native observer fixture history')
    for row in retry.get('retainedPriorAttempt', []):
        path = ROOT / row.get('path', '')
        # Validate full save provenance without distributing private native saves.
        if path.name.endswith('-native-victory-fixture.json'):
            retained_file(row, {'.json'}, 'excluded first-attempt native save', curate=False)
        else:
            retained_file(row, {'.txt', '.png'}, 'disclosed first-attempt evidence')
    persistent = observed['completion-persists-without-repeat-credit']
    a, b = persistent.get('before', {}), persistent.get('after', {})
    require(a.get('balance') == b.get('balance') == wallet['balance']
        and a.get('completed') == b.get('completed') == wallet['completed']
        and a.get('claimedDifficultyBonuses') == b.get('claimedDifficultyBonuses') == ['easy']
        and persistent.get('reopenCredit') == 0, 'Completion restart/menu reentry paid again or lost history')
    compact = persistent.get('compactLargeText', {})
    require(compact.get('badgeFullyInsideMap') is True and compact.get('noBadgeOverlap') is True
        and compact.get('physical') == {'width': 1280, 'height': 720}
        and compact.get('logicalDP') == {'width': 640, 'height': 360} and compact.get('fontScale') == 1.3,
        'Compact enlarged-text badge bounds were not observed')
    abandoned = observed['unwon-map-abandon-does-not-complete']
    a, b = abandoned.get('before', {}), abandoned.get('after', {})
    require(abandoned.get('abandonCredit') == 0 and a.get('balance') == b.get('balance')
        and a.get('completed') == b.get('completed')
        and a.get('claimedDifficultyBonuses') == b.get('claimedDifficultyBonuses'),
        'Unwon-map abandonment added completion or credit')
    restore = record.get('walletRestoration', {})
    normalized = restore.get('normalizedOriginal', {})
    raw = restore.get('rawAndroidBeforeRestart', {})
    original = QA / 'original-wallet.xml'
    normalized_path = retained_file(normalized, {'.xml'}, 'excluded normalized original wallet', curate=False)
    require(original.is_file() and restore.get('originalBackupUntouched') is True
        and digest(original) == restore.get('originalSHA256') == record.get('originalWalletSHA256')
        and normalized_path.name == 'normalized-original-wallet.xml'
        and normalized_path.read_bytes() == original.read_bytes().replace(b'\r\n', b'\n')
        and raw.get('matchesNormalizedOriginal') is True and raw.get('sha256') == normalized.get('sha256')
        and raw.get('bytes') == normalized.get('bytes') and restore.get('verified') is True
        and restore.get('afterSchemaMigration', {}).get('version') == 4
        and restore.get('afterSchemaMigration', {}).get('balance') == 380
        and restore.get('afterSchemaMigration', {}).get('completed') == []
        and restore.get('afterSchemaMigration', {}).get('claimedDifficultyBonuses') == []
        and record.get('walletRestorationRequired') is False
        and record.get('seededNativeBoundaryFixtures') is True and record.get('fullWavePlaythrough') is False,
        'Original wallet raw transport/restored schema-4 semantics are not verified')
    return record, observed, paths


def curated_inputs(references):
    paths = []
    for path in sorted(references):
        require(path.is_file() and path.resolve().is_relative_to(QA.resolve())
            and path.suffix.lower() in {'.json', '.png', '.txt', '.jsonl'}, 'Invalid final journey reference')
        require(path.stat().st_size <= 16 * 1024 * 1024, 'QA file exceeds curated small-evidence bound: ' + path.name)
        if path.suffix.lower() == '.json':
            read(path)
        elif path.suffix.lower() == '.png':
            with path.open('rb') as stream:
                require(path.stat().st_size > 100 and stream.read(8) == b'\x89PNG\r\n\x1a\n', 'Invalid evidence PNG: ' + path.name)
        else:
            text = path.read_text(encoding='utf-8')
            require(text.strip(), 'Empty native observer/console evidence: ' + path.name)
            if path.suffix.lower() == '.jsonl':
                for line in text.splitlines():
                    if line.strip():
                        json.loads(line)
        paths.append(path)
    require(any(path.name == FINAL for path in paths), 'Final result was not curated')
    require(len({path.name for path in paths}) == len(paths), 'Curated evidence names would collide')
    require(sum(path.suffix.lower() == '.png' for path in paths) >= 3, 'Focused visual evidence missing')
    return paths


def design_inputs(qa_names):
    """Preserve approved mock/comparison artifacts without calling them runtime QA."""
    paths = []
    if not OUT.exists():
        return paths
    for path in sorted(OUT.iterdir()):
        if path.name in qa_names:
            continue
        require(path.is_file() and DESIGN_PREFIX.search(path.name)
            and path.suffix.lower() in {'.png', '.json', '.md'},
            'Unrecognized existing archive artifact: ' + path.name)
        require(path.stat().st_size <= 16 * 1024 * 1024, 'Design artifact exceeds small-evidence bound: ' + path.name)
        if path.suffix.lower() == '.png':
            with path.open('rb') as stream:
                require(path.stat().st_size > 100 and stream.read(8) == b'\x89PNG\r\n\x1a\n',
                    'Invalid design reference PNG: ' + path.name)
        elif path.suffix.lower() == '.json':
            read(path)
        paths.append(path)
    return paths


def source_paths(design):
    paths = {ROOT / 'app/build.gradle.kts', Path(__file__).resolve(), ROOT / 'README.md', ROOT / 'AGENTS.md',
        ROOT / 'docs/releases/0.58-completion.md', ROOT / 'tools/android-sdk.cjs',
        ROOT / 'archive/fallback-0.58.json'}
    for folder in ('app/src', 'campaign', 'scenario'):
        paths.update(path for path in (ROOT / folder).rglob('*') if path.is_file())
    paths.update(path for path in (ROOT / 'tools').glob('*058*') if path.is_file())
    # Package/manifest outputs are written later and must not create a circular
    # proof chain. All existing source inputs and host checks are pinned instead.
    paths.update(path for path in (ROOT / 'archive').glob('*0.58*') if path.is_file()
        and path != RECORD and not path.name.startswith('release-'))
    paths.update(OUT / name for name in HOST_EVIDENCE)
    paths.update(design)
    if (ROOT / 'design-qa.md').is_file():
        paths.add(ROOT / 'design-qa.md')
    for path in paths:
        relative = path.relative_to(ROOT)
        require(path.is_file() and not relative.as_posix().startswith('qa/'), 'Missing/transient source identity: ' + str(relative))
        require(path.suffix.lower() not in PRIVATE_SUFFIXES and not path.name.startswith('.env')
            and not any(part in SKIP_PARTS for part in relative.parts)
            and path.suffix.lower() not in {'.tmp', '.part', '.partial'}, 'Private/transient source identity: ' + str(relative))
    return sorted(paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-sha256', required=True)
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected) and APK.is_file() and digest(APK) == expected, 'Current candidate APK mismatch')
    final, observed, references = checked_final(expected)
    fallback_path = ROOT / 'archive/fallback-0.58.json'
    fallback = read(fallback_path)
    require(fallback.get('version') == '0.58' and fallback.get('baseline') == '0.57', 'Wrong fallback identity')
    for row in fallback['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'Immutable v0.57 fallback changed: ' + str(path))
    require(next(row['sha256'] for row in fallback['files'] if row['path'].endswith('.apk')) == BASELINE_APK_SHA
        and next(row['sha256'] for row in fallback['files'] if row['path'].endswith('.zip')) == BASELINE_SOURCE_SHA,
        'Fallback record does not identify the delivered v0.57 bytes')
    inputs = curated_inputs(references)
    require(not set(HOST_EVIDENCE) & {path.name for path in inputs}, 'QA would overwrite an existing host proof')
    before = {path.name: file_row(path) for path in inputs}
    design = design_inputs(set(before))
    design_rows = [file_row(path) for path in design]
    sources = [file_row(path) for path in source_paths(design)]
    require(digest(APK) == expected, 'Candidate APK changed during validation')
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = []
    for path in inputs:
        target = OUT / path.name
        require(not target.exists() or digest(target) == before[path.name]['sha256'],
            'Refusing to overwrite different retained evidence: ' + path.name)
        shutil.copyfile(path, target)
        require(digest(target) == before[path.name]['sha256'], 'QA evidence changed while copying: ' + path.name)
        evidence.append(file_row(target))
    evidence.extend(design_rows)
    for row in sources:
        require(digest(ROOT / row['path']) == row['sha256'], 'Source changed during recording: ' + row['path'])
    require(digest(APK) == expected, 'Candidate APK changed before proof commit')
    record = dict(version='0.58', passed=True, candidateAPK_SHA256=expected,
        emulatorUsed=True, androidWebViewUsed=True, androidRuntimeExecuted=True, actualNativeEngineExecuted=True,
        browserUsed=False, checks=[row['name'] for row in final['checks']], checksPassed=len(final['checks']),
        verificationInputs={FINAL: dict(path=(OUT / FINAL).relative_to(ROOT).as_posix(), sha256=before[FINAL]['sha256'])},
        fallbackRecord=dict(path=fallback_path.relative_to(ROOT).as_posix(), sha256=digest(fallback_path)),
        gameplayVerifiedScope='Seeded real-native Towers terminal/category reward boundary, map markers, persistence/reentry, unwon-map abandonment and compact Back/badge layouts. Direct callback replay and genuine loss accounting are host checks, not additional native runs.',
        fixtureDisclosure=final.get('fixtureDisclosure'), seededGameState=final.get('seededGameState'),
        nativeCheckpointReused=final.get('nativeCheckpointReused'), seededUIPreference=final.get('seededUIPreference'),
        fixtureNotes=final.get('fixtureNotes', []),
        fixtureFailures=final.get('fixtureFailures', []),
        fixtureRetry=final.get('fixtureRetry'), priorFixtureErrorsIncluded=True,
        initialAttemptZeroErrorsClaimed=False, seededNativeBoundaryFixtures=True,
        walletRestoration=final.get('walletRestoration'), originalWalletRestored=True, fullWavesPlayed=False,
        excludedPrivateFixtureFiles=['original-wallet.xml', 'normalized-original-wallet.xml',
            'seeded-wallet.xml', 'native-victory-fixture.json', 'first-attempt-native-victory-fixture.json'],
        nativeProgramBodyChanged=False, allEngineAndWebAssetsFrozen=True, campaignAndScenarioSourcesChanged=False,
        nativeCompletionAndWalletOnly=True, noVFSAppend=True, noNativeBuild=True, designArtifacts=design_rows,
        fullCampaignPlaythroughVerified=False, laterMissionsVerified=False, offworldMissionsVerified=False,
        allMapsVerified=False, physicalPhonePerformanceVerified=False, audioPlaybackVerified=False,
        terrainVisualCorrectnessVerified=False, rewardedAdsWatched=False, liveAdsTested=False,
        githubPublished=False, vpsChanged=False,
        limitations=['This is a targeted completion/reward boundary and native terminal/layout journey; seeded final-wave fixtures do not establish a full set of ordinary waves or catalogue-wide playthroughs.',
            'Prepared native saves or other fixture adjustments, if used, are disclosed in the final live record; seeded fixtures do not establish ordinary combat balance.',
            'Completion/control screenshots and native terminal observations do not establish audible playback or physical-phone performance.'],
        sources=sources, evidence=evidence, recordedUTC=datetime.now(timezone.utc).isoformat())
    temporary = RECORD.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    temporary.replace(RECORD)
    print(json.dumps(dict(passed=True, proof=str(RECORD), candidateAPK_SHA256=expected,
        checksPassed=len(final['checks']), sourceFiles=len(sources), curatedEvidence=len(evidence)), indent=2))


if __name__ == '__main__':
    main()
