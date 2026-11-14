"""Curate completed v0.56 exact-APK observations; never test, build or package.

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
QA = ROOT / 'qa/home-056'
OUT = ROOT / 'archive/home-0.56'
APK = ROOT / 'app/build/outputs/apk/debug/app-debug.apk'
RECORD = ROOT / 'archive/home-0.56-emulator-checks.json'
FINAL = 'verify-home-056.json'
HOST_EVIDENCE = ()
REQUIRED_CASES = ('home-native-layout-normal', 'home-rewards-return',
    'home-towers-saves-return', 'towers-map-browser-back-and-selection',
    'towers-launch-native-and-return-to-same-map',
    'campaign-continue-saves-native-and-return', 'campaign-new-movie-native-and-return',
    'compact-home-scroll-and-map-return', 'large-text-home-actions-accessible',
    'normal-home-restored')
BASELINE_APK_SHA = 'c2f65e8c0a043b435e63ef3dd098ee13b97af3cfe4ccbd9c9c76607881a3e26e'
BASELINE_SOURCE_SHA = '3fd40759bf5799e1fba3ac23383f12a562ff72e0d15d090b55b69bb3a53fe19f'
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
    require(record.get('version') == '0.56' and record.get('passed') is True and not record.get('error'),
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
    require(set(REQUIRED_CASES) == set(names), 'Required complete Home QA schema is not satisfied')
    require(record.get('runtimeErrors') == [], 'Final runtime error observations missing/not empty')
    observed, paths = {}, {QA / FINAL}
    def screenshots(value, label):
        if isinstance(value, dict):
            shot = value.get('screenshot')
            if isinstance(shot, dict):
                image = ROOT / shot.get('path', '')
                require(image.parent.resolve() == QA.resolve() and image.suffix.lower() == '.png'
                    and image.is_file() and digest(image) == shot.get('sha256')
                    and image.stat().st_size == shot.get('bytes'),
                    'Missing/changed screenshot in ' + label)
                paths.add(image)
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
    # Retain disclosed fixture history separately from the ten passed case records.
    failures = record.get('fixtureFailures', [])
    require(isinstance(failures, list), 'Malformed fixture-failure history')
    screenshots(failures, 'disclosed fixture-failure history')
    towers = observed['towers-launch-native-and-return-to-same-map'].get('gameplay', {}).get('state', {})
    require(towers.get('config') == '/warzone2100' and not towers.get('campaign')
        and towers.get('snapshot', {}).get('hasHQ') is True, 'Towers native entry not observed')
    continued = observed['campaign-continue-saves-native-and-return'].get('gameplay', {}).get('state', {})
    require(continued.get('campaign', {}).get('nativeState', {}).get('worldSafe') is True
        and 'campaign' in continued.get('config', '')
        and re.fullmatch(r'wt_[0-9a-f]{32}', continued.get('save', {}).get('slotId', '')),
        'Existing Campaign phone-save/native entry not observed')
    original = observed['campaign-new-movie-native-and-return']
    mission = original.get('mission', {}).get('state', {})
    require(any(item.get('name', '').endswith('/c001.ogg') and item.get('responseEnd', 0) > 0
            for item in original.get('video', {}).get('resources', []))
        and mission.get('campaign', {}).get('snapshot', {}).get('mission') == 'cam1a'
        and mission.get('campaign', {}).get('nativeState', {}).get('worldSafe') is True
        and len(mission.get('snapshot', {}).get('trucks', [])) == 3,
        'Original movie resource and ordinary Alpha mission entry not observed')
    require(record.get('seededUnits') is False and record.get('preparedCampaignSaveUsed') is True,
        'Fixture disclosure does not match the checked native routes')
    return record, observed, paths


def curated_inputs(references):
    paths = []
    for path in sorted(references):
        require(path.is_file() and path.resolve().is_relative_to(QA.resolve())
            and path.suffix.lower() in {'.json', '.png'}, 'Invalid final journey reference')
        require(path.stat().st_size <= 16 * 1024 * 1024, 'QA file exceeds curated small-evidence bound: ' + path.name)
        if path.suffix.lower() == '.json':
            read(path)
        else:
            with path.open('rb') as stream:
                require(path.stat().st_size > 100 and stream.read(8) == b'\x89PNG\r\n\x1a\n', 'Invalid evidence PNG: ' + path.name)
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
        ROOT / 'docs/releases/0.56-home.md', ROOT / 'tools/android-sdk.cjs',
        ROOT / 'archive/fallback-0.56.json'}
    for folder in ('app/src', 'campaign', 'scenario'):
        paths.update(path for path in (ROOT / folder).rglob('*') if path.is_file())
    paths.update(path for path in (ROOT / 'tools').glob('*056*') if path.is_file())
    # Package/manifest outputs are written later and must not create a circular
    # proof chain. All existing source inputs and host checks are pinned instead.
    paths.update(path for path in (ROOT / 'archive').glob('*0.56*') if path.is_file()
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
    fallback_path = ROOT / 'archive/fallback-0.56.json'
    fallback = read(fallback_path)
    require(fallback.get('version') == '0.56' and fallback.get('baseline') == '0.55', 'Wrong fallback identity')
    for row in fallback['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'Immutable v0.55 fallback changed: ' + str(path))
    require(next(row['sha256'] for row in fallback['files'] if row['path'].endswith('.apk')) == BASELINE_APK_SHA
        and next(row['sha256'] for row in fallback['files'] if row['path'].endswith('.zip')) == BASELINE_SOURCE_SHA,
        'Fallback record does not identify the delivered v0.55 bytes')
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
    record = dict(version='0.56', passed=True, candidateAPK_SHA256=expected,
        emulatorUsed=True, androidWebViewUsed=True, androidRuntimeExecuted=True, actualNativeEngineExecuted=True,
        browserUsed=False, checks=[row['name'] for row in final['checks']], checksPassed=len(final['checks']),
        verificationInputs={FINAL: dict(path=(OUT / FINAL).relative_to(ROOT).as_posix(), sha256=before[FINAL]['sha256'])},
        fallbackRecord=dict(path=fallback_path.relative_to(ROOT).as_posix(), sha256=digest(fallback_path)),
        gameplayVerifiedScope='Native Home mode selection, compact layout and focused existing Campaign/Towers entry/return routes; the exact observed case data defines verified scope.',
        fixtureDisclosure=final.get('fixtureDisclosure'), seededGameState=final.get('seededGameState'),
        nativeCheckpointReused=final.get('nativeCheckpointReused'), seededUIPreference=final.get('seededUIPreference'),
        fixtureNotes=final.get('fixtureNotes', []),
        fixtureFailures=final.get('fixtureFailures', []),
        preparedCampaignSaveUsed=final.get('preparedCampaignSaveUsed'), seededUnits=final.get('seededUnits'),
        originalOpeningMovieFetchedAndShown=True, originalOpeningMovieWatchedToEnd=False,
        nativeProgramBodyChanged=False, allEngineAndWebAssetsFrozen=True, campaignAndScenarioSourcesChanged=False,
        nativeHomeOnly=True, noVFSAppend=True, noNativeBuild=True, designArtifacts=design_rows,
        fullCampaignPlaythroughVerified=False, laterMissionsVerified=False, offworldMissionsVerified=False,
        allMapsVerified=False, physicalPhonePerformanceVerified=False, audioPlaybackVerified=False,
        terrainVisualCorrectnessVerified=False, rewardedAdsWatched=False, liveAdsTested=False,
        githubPublished=False, vpsChanged=False,
        limitations=['This is a targeted native Home/navigation and screen journey, not a new gameplay feature or full Campaign/Towers playthrough.',
            'Prepared native saves or other fixture adjustments, if used, are disclosed in the final live record; seeded fixtures do not establish ordinary combat balance.',
            'Home/control screenshots and native route observations do not establish audible playback or physical-phone performance.'],
        sources=sources, evidence=evidence, recordedUTC=datetime.now(timezone.utc).isoformat())
    temporary = RECORD.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    temporary.replace(RECORD)
    print(json.dumps(dict(passed=True, proof=str(RECORD), candidateAPK_SHA256=expected,
        checksPassed=len(final['checks']), sourceFiles=len(sources), curatedEvidence=len(evidence)), indent=2))


if __name__ == '__main__':
    main()
