"""Curate completed v0.53 exact-APK observations; never test, build or package.

Importing this module performs no writes. Run only after final.json identifies
the installed delivery candidate and its complete live journey has passed.
"""
from datetime import datetime, timezone
from hashlib import file_digest
from pathlib import Path
import argparse
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa/campaign-053'
OUT = ROOT / 'archive/campaign-0.53'
APK = ROOT / 'app/build/outputs/apk/debug/app-debug.apk'
RECORD = ROOT / 'archive/campaign-0.53-emulator-checks.json'
FINAL = 'final.json'
HOST_EVIDENCE = ('guide-hook-checks.json',)
REQUIRED_CASES = ('opening-video-preserved', 'fresh-alpha-no-automatic-guide',
    'campaign-header-footer-fit', 'all-combat-preserved', 'pre-hq-design-rule-clear',
    'command-centre-normal-construction', 'hq-completion-refreshes-same-draft',
    'campaign-blueprint-saved', 'factory-normal-construction',
    'designed-unit-native-production-progress', 'campaign-footer-live-production',
    'designed-unit-completed', 'menus-manual-intelligence-and-input-return',
    'small-phone-footer-and-build-fit', 'campaign-phone-save',
    'campaign-continue-preserves-world-and-guide-policy', 'towers-controls-and-selection-preserved')
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


def checked_recovery(record, observed, apk_sha):
    recovery = record.get('reportRecovery')
    if recovery is None:
        return None
    partial = read(QA / 'recovered-first-pass.json')
    require(partial.get('installedAPK_SHA256') == apk_sha and partial.get('seeded') is False
        and partial.get('reportRecovery') == recovery and recovery.get('description'), 'Partial-report recovery provenance differs')
    rows = partial.get('checks', [])
    require([row.get('name') for row in rows] == list(REQUIRED_CASES[:9])
        and all(row.get('passed') is True and row.get('data') is not None for row in rows),
        'Recovered first-nine case provenance is incomplete')
    for row in rows:
        current = dict(observed[row['name']])
        current.pop('currentLayout', None)
        require(current == row['data'], 'Recovered observation changed: ' + row['name'])
    native = recovery.get('nativeEvidence', {})
    history, completed = native.get('history', []), native.get('finished', [])
    require(any(row.get('action') == 'campaign-select-combat' and row.get('ok') is True
        and row.get('gameTime', 0) >= 8000 and row.get('result', {}).get('count') == 4 for row in history),
        'Recovered native combat-selection acknowledgment missing')
    for item in ('A0CommandCentre', 'A0LightFactory'):
        orders = [row for row in history if row.get('action') == 'queue-build' and row.get('ok') is True
            and row.get('result', {}).get('itemId') == item]
        require(any(any(done.get('id') == row['result'].get('id') and done.get('itemId') == item
            for done in completed) for row in orders), 'Recovered native construction completion missing: ' + item)
    design = observed['campaign-blueprint-saved']
    require(any(row.get('action') == 'save-design' and row.get('ok') is True
        and row.get('result', {}).get('id') == design.get('id') for row in history)
        and any(row.get('id') == design.get('id') for row in native.get('saved', [])),
        'Recovered native blueprint-save acknowledgment missing')
    for name in REQUIRED_CASES[:9]:
        screen = observed[name].get('screen')
        if screen:
            require(Path(screen).name == screen and (QA / screen).is_file(), 'Recovered screenshot missing: ' + str(screen))
    return recovery


def checked_final(apk_sha):
    record = read(QA / FINAL)
    require(record.get('version') == '0.53' and record.get('passed') is True and not record.get('error'),
        'Final live journey has not passed')
    require(record.get('emulatorUsed') is True and record.get('actualNativeEngineExecuted') is True
        and record.get('seeded') is False, 'Actual unseeded Campaign run is not identified')
    require(record.get('installedAPK_SHA256') == apk_sha, 'Final journey is missing/differs from installed APK identity')
    if 'candidateAPK_SHA256' in record:
        require(record['candidateAPK_SHA256'] == apk_sha, 'Conflicting final candidate identity')
    cases = record.get('checks')
    require(isinstance(cases, list) and cases and all(isinstance(row, dict) and row.get('passed') is True
        and isinstance(row.get('name'), str) and row['name'] and row.get('data') is not None for row in cases),
        'Missing/failed final live-case data')
    names = [row['name'] for row in cases]
    require(len(names) == len(set(names)), 'Duplicate final live-case names')
    require(set(REQUIRED_CASES) <= set(names), 'Required complete live journey cases are missing')
    observed = {row['name']: row['data'] for row in cases}
    recovery = checked_recovery(record, observed, apk_sha)
    fresh = observed['fresh-alpha-no-automatic-guide']
    if recovery is None:
        require(fresh.get('native', {}).get('gameTime', 0) >= 8000 and fresh['native'].get('worldSafe') is True
            and fresh.get('state', {}).get('hasHQ') is False, 'Fresh pre-HQ/no-guide observation is incomplete')
    else:
        require(fresh.get('initialRunnerAssertionPassed') is True and fresh.get('assertion')
            and observed['opening-video-preserved'].get('initialRunnerAssertionPassed') is True,
            'Recovered initial runner assertions are not explicitly identified')
    require(observed['pre-hq-design-rule-clear'].get('disabled') is True
        and 'Command Centre' in observed['pre-hq-design-rule-clear'].get('text', ''), 'Native pre-HQ Design requirement not observed')
    unit = observed['designed-unit-completed']
    require(unit.get('id') and unit.get('body') == 'Body1REC' and unit.get('name'), 'Designed native unit completion not observed')
    small = observed['small-phone-footer-and-build-fit']
    require(small.get('w', 0) > 0 and small.get('h', 0) > 0, 'Compact emulator CSS viewport not recorded')
    small_png = QA / 'small-phone-footer.png'
    require(small_png.is_file(), 'Compact emulator screenshot missing')
    with small_png.open('rb') as stream:
        png_header = stream.read(24)
    require(png_header[:8] == b'\x89PNG\r\n\x1a\n'
        and int.from_bytes(png_header[16:20], 'big') == 1280
        and int.from_bytes(png_header[20:24], 'big') == 720,
        'Actual compact emulator physical profile is not 1280 by 720')
    saved = observed['campaign-phone-save']
    continued = observed['campaign-continue-preserves-world-and-guide-policy']
    require(saved.get('phase') == 'saved' and re.fullmatch(r'wt_[0-9a-f]{32}', saved.get('savedId', ''))
        and continued.get('save', {}).get('slotId') == saved['savedId']
        and continued.get('state', {}).get('hasHQ') is True, 'Campaign phone Save/Continue world identity not observed')
    if 'runtimeErrors' in record:
        require(record['runtimeErrors'] == [], 'Final run retained runtime errors')
    return record


def curated_inputs():
    paths = []
    for path in sorted(QA.iterdir()):
        if not path.is_file() or path.suffix.lower() not in {'.json', '.png'}:
            continue
        if path.name == 'inprogress.json':
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
    require(sum(path.suffix.lower() == '.png' for path in paths) >= 3, 'Final visual evidence is incomplete')
    return paths


def source_paths():
    paths = {ROOT / 'app/build.gradle.kts', Path(__file__).resolve(), ROOT / 'README.md',
        ROOT / 'docs/releases/0.53-campaign-polish.md', ROOT / 'tools/android-sdk.cjs',
        ROOT / 'tools/integrate-native-runtime.py', ROOT / 'archive/fallback-0.53.json'}
    for folder in ('app/src', 'campaign', 'scenario'):
        paths.update(path for path in (ROOT / folder).rglob('*') if path.is_file())
    paths.update(path for path in (ROOT / 'tools').glob('*053*') if path.is_file())
    # Packaging writes release/manifest records after this proof. Pin inputs,
    # never those later outputs or this proof itself, so no circular hash chain.
    paths.update(path for path in (ROOT / 'archive').glob('*0.53*') if path.is_file()
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
    fallback_path = ROOT / 'archive/fallback-0.53.json'
    fallback = read(fallback_path)
    require(fallback.get('version') == '0.53' and fallback.get('baseline') == '0.52', 'Wrong fallback identity')
    for row in fallback['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'Immutable v0.52 fallback changed: ' + str(path))
    inputs = curated_inputs()
    require(not set(HOST_EVIDENCE) & {path.name for path in inputs}, 'QA evidence would overwrite an existing host proof')
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
    record = dict(version='0.53', passed=True, candidateAPK_SHA256=expected,
        emulatorUsed=True, androidWebViewUsed=True, androidRuntimeExecuted=True, actualNativeEngineExecuted=True,
        browserUsed=False, seeded=False, checks=[row['name'] for row in final['checks']], checksPassed=len(final['checks']),
        verificationInputs={FINAL: dict(path=(OUT / FINAL).relative_to(ROOT).as_posix(), sha256=before[FINAL]['sha256'])},
        fallbackRecord=dict(path=fallback_path.relative_to(ROOT).as_posix(), sha256=digest(fallback_path)),
        gameplayVerifiedScope='Focused original Alpha opening, Campaign header/footer and Design/HQ transition, native manufacturing/selection/menu returns, phone Save/Continue, compact-screen layout and brief Towers regression; see exact observed case data.',
        reportRecovery=final.get('reportRecovery'), resumedPreparedWorld=bool(final.get('resumedPreparedWorld')),
        firstNineRawSnapshotJsonPreserved=not bool(final.get('reportRecovery')),
        fullCampaignPlaythroughVerified=False, laterMissionsVerified=False, offworldMissionsVerified=False,
        allMapsVerified=False, physicalPhonePerformanceVerified=False, audioPlaybackVerified=False,
        terrainVisualCorrectnessVerified=False, rewardedAdsWatched=False, liveAdsTested=False,
        githubPublished=False, vpsChanged=False,
        limitations=['The Campaign journey covers the opening Alpha mission and a short Continue regression; it is not a full Alpha/Beta/Gamma or off-world playthrough.',
            'The opening movie was loaded and visibly presented, then skipped with actual user input; complete movie playback and audible sound were not verified.',
            *(['The initial runner passed nine cases and retained screenshots before a test recipe-selector failure; a resume helper overwrote the partial JSON. Those nine observations were recovered from the screens and original native acknowledgments/completions, not preserved raw initial snapshots. Remaining checks reused the same unchanged prepared world.'] if final.get('reportRecovery') else []),
            'Small-screen evidence is from an Android emulator, not a physical phone.',
            'The emulator retains its previously observed black terrain; native models/orders, controls and completion are separate from terrain appearance and audible playback.'],
        sources=sources, evidence=evidence, recordedUTC=datetime.now(timezone.utc).isoformat())
    temporary = RECORD.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    temporary.replace(RECORD)
    print(json.dumps(dict(passed=True, proof=str(RECORD), candidateAPK_SHA256=expected,
        checksPassed=len(final['checks']), sourceFiles=len(sources), curatedEvidence=len(evidence)), indent=2))


if __name__ == '__main__':
    main()
