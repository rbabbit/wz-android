"""Curate completed v0.55 exact-APK observations; never test, build or package.

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
QA = ROOT / 'qa/campaign-055'
OUT = ROOT / 'archive/campaign-0.55'
APK = ROOT / 'app/build/outputs/apk/debug/app-debug.apk'
RECORD = ROOT / 'archive/campaign-0.55-emulator-checks.json'
FINAL = 'final.json'
HOST_EVIDENCE = ()
REQUIRED_CASES = ('queued-cancel-clears-preview-while-builders-busy',
    'other-job-and-selected-builders-preserved', 'menu-returns-do-not-revive-cancelled-preview',
    'remaining-native-build-completes', 'active-cancel-preserves-physical-foundation',
    'cancelled-state-phone-save', 'save-continue-keeps-cancellation-and-foundation',
    'cancelled-foundation-resumes-and-completes', 'campaign-intelligence-and-footer-preserved',
    'towers-build-and-footer-preserved')
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
    require(record.get('version') == '0.55' and record.get('passed') is True and not record.get('error'),
        'Final live cancellation journey has not passed')
    for key in ('emulatorUsed', 'actualNativeEngineExecuted'):
        if key in record:
            require(record[key] is True, 'Final result rejects native emulator execution: ' + key)
    require(record.get('installedAPK_SHA256') == apk_sha, 'Final journey differs from the installed APK identity')
    if 'candidateAPK_SHA256' in record:
        require(record['candidateAPK_SHA256'] == apk_sha, 'Conflicting final candidate identity')
    cases = record.get('checks')
    require(isinstance(cases, list) and cases and all(isinstance(row, dict) and row.get('passed') is True
        and isinstance(row.get('name'), str) and row['name'] and row.get('data') is not None for row in cases),
        'Missing/failed final live-case data')
    names = [row['name'] for row in cases]
    require(len(names) == len(set(names)), 'Duplicate final live-case names')
    require(set(REQUIRED_CASES) <= set(names), 'Required complete cancellation QA schema is not satisfied')
    observed = {row['name']: row['data'] for row in cases}
    jobs = record.get('jobs', {})
    lab, power = jobs.get('lab', {}), jobs.get('power', {})
    require(isinstance(lab.get('id'), str) and isinstance(power.get('id'), str) and lab['id'] != power['id'],
        'Prepared native job identities missing')
    cancelled = {lab['id'], power['id']}
    queued = observed['queued-cancel-clears-preview-while-builders-busy']
    before, after = queued.get('before', {}), queued.get('after', {})
    before_state, after_state = before.get('state', {}), after.get('state', {})
    require(any(row.get('id') == power['id'] for row in before_state.get('jobs', []))
        and any(row.get('id') == power['id'] for row in before_state.get('constructionSites', []))
        and any(row.get('id') == power['id'] for row in before.get('display', {}).get('acceptedSites', [])),
        'Cancelled queued target was not present in every pre-cancel record')
    require(not any(row.get('id') == power['id'] for row in after_state.get('jobs', []))
        and not any(row.get('id') == power['id'] for row in after_state.get('constructionSites', []))
        and not any(row.get('id') == power['id'] for row in after.get('display', {}).get('acceptedSites', []))
        and any(row.get('id') == lab['id'] for row in after_state.get('jobs', []))
        and any(row.get('order') in (4, 16) for row in after_state.get('trucks', []))
        and not any(row.get('id') == lab['id'] for row in after_state.get('finishedBuilds', [])),
        'Queued cancellation did not retire jobs/journal/display while the other build stayed active')
    elapsed = after_state.get('gameTime', -1) - before_state.get('gameTime', -1)
    require(0 <= elapsed < 10000, 'Queued cancellation was not observed within the bounded native interval')
    active = observed['active-cancel-preserves-physical-foundation']
    foundation = active.get('foundationId')
    require(isinstance(foundation, int) and foundation > 0 and record.get('foundationId') == foundation,
        'Actual native foundation identity missing')
    active_after = active.get('after', {})
    require(any(row.get('id') == foundation for row in active_after.get('state', {}).get('construction', [])),
        'Cancelled active foundation was removed from the native world')
    for capture in (active_after, observed['save-continue-keeps-cancellation-and-foundation']):
        state = capture.get('state', {})
        require(not any(row.get('id') in cancelled for row in state.get('jobs', []))
            and not any(row.get('id') in cancelled for row in state.get('constructionSites', []))
            and not any(row.get('id') in cancelled for row in capture.get('display', {}).get('acceptedSites', []))
            and any(row.get('id') == foundation for row in state.get('construction', [])),
            'Cancelled state resurrected a job/blueprint or lost its foundation')
    saved = observed['cancelled-state-phone-save']
    require(saved.get('phase') == 'saved' and re.fullmatch(r'wt_[0-9a-f]{32}', saved.get('savedId', ''))
        and record.get('savedId') == saved['savedId'], 'Native cancelled-state phone Save identity missing')
    resumed = observed['cancelled-foundation-resumes-and-completes'].get('state', {})
    require(any(row.get('id') == foundation and row.get('ready') is True for row in resumed.get('facilityTargets', [])),
        'The same cancelled native foundation was not observed completing after resume')
    require(record.get('runtimeErrors') == [], 'Final runtime error observations missing/not empty')
    return record


def curated_inputs():
    paths = []
    for path in sorted(QA.iterdir()):
        if not path.is_file() or path.suffix.lower() not in {'.json', '.png'} or path.name in {'inprogress.json', 'progress.json'}:
            continue
        if path.name.lower().startswith(('failed', 'failure', 'error')) or re.search(r'(^|[-_])(failed|failure|error)([-_.]|$)', path.name, re.I):
            continue
        require(path.stat().st_size <= 16 * 1024 * 1024, 'QA file exceeds curated small-evidence bound: ' + path.name)
        if path.suffix.lower() == '.json':
            read(path)
        else:
            with path.open('rb') as stream:
                require(path.stat().st_size > 100 and stream.read(8) == b'\x89PNG\r\n\x1a\n', 'Invalid evidence PNG: ' + path.name)
        paths.append(path)
    require(any(path.name == FINAL for path in paths), 'Final result was not curated')
    require(sum(path.suffix.lower() == '.png' for path in paths) >= 3, 'Focused visual evidence missing')
    return paths


def source_paths():
    paths = {ROOT / 'app/build.gradle.kts', Path(__file__).resolve(), ROOT / 'README.md',
        ROOT / 'docs/releases/0.55-campaign-cancel.md', ROOT / 'tools/android-sdk.cjs',
        ROOT / 'archive/fallback-0.55.json'}
    for folder in ('app/src', 'campaign', 'scenario'):
        paths.update(path for path in (ROOT / folder).rglob('*') if path.is_file())
    paths.update(path for path in (ROOT / 'tools').glob('*055*') if path.is_file())
    # Package/manifest outputs are written later and must not create a circular
    # proof chain. All existing source inputs and host checks are pinned instead.
    paths.update(path for path in (ROOT / 'archive').glob('*0.55*') if path.is_file()
        and path != RECORD and not path.name.startswith('release-'))
    paths.update(OUT / name for name in HOST_EVIDENCE)
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
    final = checked_final(expected)
    fallback_path = ROOT / 'archive/fallback-0.55.json'
    fallback = read(fallback_path)
    require(fallback.get('version') == '0.55' and fallback.get('baseline') == '0.54', 'Wrong fallback identity')
    for row in fallback['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'Immutable v0.54 fallback changed: ' + str(path))
    inputs = curated_inputs()
    require(not set(HOST_EVIDENCE) & {path.name for path in inputs}, 'QA would overwrite an existing host proof')
    before = {path.name: file_row(path) for path in inputs}
    sources = [file_row(path) for path in source_paths()]
    names = set(before) | set(HOST_EVIDENCE)
    require(not OUT.exists() or all(path.is_file() and path.name in names for path in OUT.iterdir()), 'Uncurated evidence already exists in archive output')
    require(digest(APK) == expected, 'Candidate APK changed during validation')
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = []
    for path in inputs:
        target = OUT / path.name
        shutil.copyfile(path, target)
        require(digest(target) == before[path.name]['sha256'], 'QA evidence changed while copying: ' + path.name)
        evidence.append(file_row(target))
    for row in sources:
        require(digest(ROOT / row['path']) == row['sha256'], 'Source changed during recording: ' + row['path'])
    require(digest(APK) == expected, 'Candidate APK changed before proof commit')
    record = dict(version='0.55', passed=True, candidateAPK_SHA256=expected,
        emulatorUsed=True, androidWebViewUsed=True, androidRuntimeExecuted=True, actualNativeEngineExecuted=True,
        browserUsed=False, checks=[row['name'] for row in final['checks']], checksPassed=len(final['checks']),
        verificationInputs={FINAL: dict(path=(OUT / FINAL).relative_to(ROOT).as_posix(), sha256=before[FINAL]['sha256'])},
        fallbackRecord=dict(path=fallback_path.relative_to(ROOT).as_posix(), sha256=digest(fallback_path)),
        gameplayVerifiedScope='Focused Campaign cancellation journal/accepted-blueprint retirement and related order/save/navigation regressions; the exact observed case data defines verified scope.',
        fixtureDisclosure=final.get('fixtureDisclosure'), seededGameState=final.get('seededGameState'),
        nativeCheckpointReused=final.get('nativeCheckpointReused'), seededUIPreference=final.get('seededUIPreference'),
        fixtureNotes=final.get('fixtureNotes', []),
        nativeProgramBodyChanged=False, campaignCommandsBridgeModified=True, otherCampaignAndScenarioSourcesChanged=False,
        singleCampaignVFSBridgeAppend=True,
        fullCampaignPlaythroughVerified=False, laterMissionsVerified=False, offworldMissionsVerified=False,
        allMapsVerified=False, physicalPhonePerformanceVerified=False, audioPlaybackVerified=False,
        terrainVisualCorrectnessVerified=False, rewardedAdsWatched=False, liveAdsTested=False,
        githubPublished=False, vpsChanged=False,
        limitations=['This is a targeted Campaign cancellation and regression journey, not a full Alpha/Beta/Gamma or off-world playthrough.',
            'Prepared native saves or other fixture adjustments, if used, are disclosed in the final live record; seeded fixtures do not establish ordinary combat balance.',
            'The emulator retains its previously observed dark/black terrain; native models/orders and UI observations are separate from terrain appearance, audible playback and physical-phone performance.'],
        sources=sources, evidence=evidence, recordedUTC=datetime.now(timezone.utc).isoformat())
    temporary = RECORD.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    temporary.replace(RECORD)
    print(json.dumps(dict(passed=True, proof=str(RECORD), candidateAPK_SHA256=expected,
        checksPassed=len(final['checks']), sourceFiles=len(sources), curatedEvidence=len(evidence)), indent=2))


if __name__ == '__main__':
    main()
