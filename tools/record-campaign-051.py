"""Record the completed exact-APK Campaign/Towers emulator journey; never run tests.

All three live-run pass records and the named final screenshots must already exist.
Importing this module performs no filesystem writes. The root agent runs it only
after the independent Campaign, Towers and small-layout checks have passed.
"""
from datetime import datetime, timezone
from hashlib import file_digest
from pathlib import Path
import json
import re
import shutil


ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa/campaign-051'
OUT = ROOT / 'archive/campaign-0.51'
APK = ROOT / 'app/build/outputs/apk/debug/app-debug.apk'
RECORD = ROOT / 'archive/campaign-0.51-emulator-checks.json'
PASS_INPUTS = ('integrated-passed.json', 'towers-regression.json', 'small-layout.json')
SCREENS = (
    'final-alpha-video.png',
    'final-alpha-guide.png',
    'final-alpha-gameplay.png',
    'final-campaign-intelligence.png',
    'final-alpha-continued.png',
    'final-towers-gameplay.png',
    'final-small-campaign-setup.png',
    'final-small-campaign-gameplay.png',
    'final-small-manufacturing.png',
)
EXPECTED_RESULTS = (
    'Opening movie from private offline route',
    'Alpha mission and original guide return',
    'ALL COMBAT selects and moves four combat units, excluding trucks',
    'Native construction A0CommandCentre',
    'Native construction A0LightFactory',
    'Native production progress and queued quantity',
    'Queue cancellation and one actual completed truck',
    'Research, Manufacturing, Queue, Help and native Intelligence returns',
    'Actual mission minimap drag uses native geometry',
    'Finger pan releases cleanly with native camera movement',
    'Campaign phone save',
    'Android Back Cancel and Return',
    'Continue restores actual campaign world',
)
# The root agent independently observed this installed candidate before and after
# the first-order diagnostic. Its raw trace predates the final pass-record schema.
FIRST_ORDER_OBSERVED_APK = '02294330e639f7d42a2622a16dbcace6125f02e6ddbe6f2bca836f129933b948'
PRIVATE_SUFFIXES = {'.jks', '.keystore', '.pem', '.p12', '.pfx', '.pyc'}
SKIP_PARTS = {'__pycache__', 'node_modules', '.git', '.gradle', 'build'}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def read(path):
    require(path.is_file(), 'Required observed evidence missing: ' + str(path.relative_to(ROOT)))
    return json.loads(path.read_text(encoding='utf-8'))


def file_row(path):
    require(path.resolve().is_relative_to(ROOT) and path.is_file(), 'Invalid proof source: ' + str(path))
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def checked_inputs(apk_sha):
    records = {name: read(QA / name) for name in PASS_INPUTS}
    for name, record in records.items():
        require(record.get('passed') is True, 'Live run did not pass: ' + name)
        require(record.get('candidateAPK_SHA256') == apk_sha, 'Live evidence belongs to another APK: ' + name)
    results = records['integrated-passed.json'].get('results', [])
    require(isinstance(results, list) and len(results) == 13
        and tuple(row.get('name') for row in results) == EXPECTED_RESULTS,
        'Integrated Campaign journey must contain the exact 13 expected observed cases')
    require(all('data' in row and row['data'] is not None for row in results),
        'Integrated Campaign case is missing its observed native data')
    diagnostic = read(QA / 'first-order-observed.json')
    diagnostic_sha = diagnostic.get('candidateAPK_SHA256', FIRST_ORDER_OBSERVED_APK)
    require(isinstance(diagnostic_sha, str) and re.fullmatch(r'[0-9a-f]{64}', diagnostic_sha)
        and ('candidateAPK_SHA256' in diagnostic or diagnostic_sha == FIRST_ORDER_OBSERVED_APK),
        'First-order diagnostic must identify its explicitly recorded or root-observed candidate')
    require(diagnostic.get('initial', {}).get('ok') is True
        and diagnostic.get('movement', {}).get('sample', {}).get('ok') is True
        and isinstance(diagnostic.get('observed'), list) and diagnostic['observed'],
        'First-order supporting diagnostic has no successful authoritative native observation')
    require(diagnostic.get('focusCalls') == 0,
        'First-order diagnostic used a focus override; disclose and record the actual fixture instead')
    for name in SCREENS:
        path = QA / name
        require(path.is_file() and path.stat().st_size > 100, 'Final emulator screenshot missing: ' + name)
        with path.open('rb') as stream:
            require(stream.read(8) == b'\x89PNG\r\n\x1a\n', 'Invalid final screenshot: ' + name)
    return records, diagnostic_sha


def source_paths():
    paths = {ROOT / 'app/build.gradle.kts', Path(__file__).resolve(),
        ROOT / 'tools/android-sdk.cjs', ROOT / 'tools/integrate-native-runtime.py',
        ROOT / 'archive/fallback-0.51.json', ROOT / 'archive/native-touch-0.50/native-build.json',
        ROOT / 'archive/touch-pan-0.50-emulator-checks.json'}
    # Full app inputs bind Java/resources and all shared or separate engine assets,
    # including the exact Campaign data/loader and the frozen Towers data.
    for folder in ('app/src', 'campaign', 'scenario', 'archive/native-campaign-0.51'):
        paths.update(path for path in (ROOT / folder).rglob('*') if path.is_file())
    paths.update(path for path in (ROOT / 'tools').glob('*campaign*051*') if path.is_file())
    paths.update(path for path in (ROOT / 'archive').glob('*campaign*0.51*')
        if path.is_file() and path != RECORD)
    for path in paths:
        relative = path.relative_to(ROOT)
        require(not relative.as_posix().startswith('qa/'), 'Transient QA included in source identity')
        require(path.suffix.lower() not in PRIVATE_SUFFIXES and not path.name.startswith('.env'),
            'Private/local source must not be recorded: ' + str(relative))
        require(not any(part in SKIP_PARTS for part in relative.parts)
            and path.suffix.lower() not in {'.tmp', '.part', '.partial'},
            'Transient source must not be recorded: ' + str(relative))
        require(path.is_file(), 'Required campaign source missing: ' + str(relative))
    return sorted(paths)


def main():
    require(APK.is_file(), 'Candidate APK missing')
    apk_sha = digest(APK)
    records, diagnostic_sha = checked_inputs(apk_sha)
    fallback_path = ROOT / 'archive/fallback-0.51.json'
    fallback = read(fallback_path)
    require(fallback.get('baseline') == '0.50' and fallback.get('version') == '0.51', 'Wrong fallback identity')
    for row in fallback['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'],
            'Immutable v0.50 fallback changed: ' + str(path))
    sources = [file_row(path) for path in source_paths()]
    evidence_names = (*PASS_INPUTS, 'first-order-observed.json', *SCREENS)
    before = {name: file_row(QA / name) for name in evidence_names}
    require(digest(APK) == apk_sha, 'Candidate APK changed while recording evidence')
    # Only the fixed curated allowlist is copied. Device backups, caches, failing
    # fixtures, raw UI dumps and app-private runtime archives remain outside source.
    OUT.mkdir(parents=True, exist_ok=True)
    evidence = []
    for name in evidence_names:
        target = OUT / name
        shutil.copyfile(QA / name, target)
        require(digest(target) == before[name]['sha256'], 'Evidence changed while copying: ' + name)
        evidence.append(file_row(target))
    for row in sources:
        require(digest(ROOT / row['path']) == row['sha256'], 'Source changed during recording: ' + row['path'])
    require(digest(APK) == apk_sha, 'Candidate APK changed before proof commit')
    record = dict(
        version='0.51', passed=True, candidateAPK_SHA256=apk_sha,
        emulatorUsed=True, androidWebViewUsed=True, androidRuntimeExecuted=True,
        actualNativeEngineExecuted=True, browserUsed=False, seeded=False,
        checks=list(EXPECTED_RESULTS), checksPassed=len(EXPECTED_RESULTS),
        towersRegressionVerified=True, smallPhoneLayoutsVerified=True,
        gameplayVerifiedScope='Original Alpha opening, actual unit movement/selection, normal construction/production, queues, menu and Intelligence returns, minimap/pan and campaign phone Save/Continue; focused Towers and small-layout regressions.',
        verificationInputs={name: dict(path=(OUT / name).relative_to(ROOT).as_posix(), sha256=before[name]['sha256'])
            for name in PASS_INPUTS},
        firstOrderDiagnostic=dict(path=(OUT / 'first-order-observed.json').relative_to(ROOT).as_posix(),
            sha256=before['first-order-observed.json']['sha256'], candidateAPK_SHA256=diagnostic_sha,
            sameAsDeliveryAPK=diagnostic_sha == apk_sha,
            role=('Supporting authoritative native-order diagnostic on the delivery candidate'
                if diagnostic_sha == apk_sha else 'Supporting PRIOR candidate diagnostic only')
                + '; final exact-APK movement is independently verified by the integrated journey',
            identityBasis='Candidate identity recorded by root before and after this diagnostic; no focus override was required'),
        fallbackRecord=dict(path=fallback_path.relative_to(ROOT).as_posix(), sha256=digest(fallback_path)),
        fullCampaignPlaythroughVerified=False, laterMissionsVerified=False,
        offworldTransportVerified=False, chapterTransitionsVerified=False,
        physicalPhonePerformanceVerified=False, audioPlaybackVerified=False,
        terrainVisualCorrectnessVerified=False,
        limitations=[
            'Only the original Alpha opening mission journey was exercised; later missions, off-world transport and chapter progression were not played through.',
            'The emulator already displayed black terrain in v0.50 and the candidate. Visible units, structures, native geometry/minimap and actual orders were inspected; terrain visual correctness is not claimed.',
            'Screenshots and native movie state establish the opening visual playback route; audible playback and physical-phone frame pacing were not verified.',
        ],
        rewardedAdsWatched=False, adRequestsMadeThroughRewardControls=False,
        liveAdsTested=False, githubPublished=False, vpsChanged=False,
        sources=sources, evidence=evidence,
        recordedUTC=datetime.now(timezone.utc).isoformat(),
    )
    temporary = RECORD.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    temporary.replace(RECORD)
    print(json.dumps(dict(passed=True, proof=str(RECORD), candidateAPK_SHA256=apk_sha,
        integratedCases=len(EXPECTED_RESULTS), sourceFiles=len(sources), curatedEvidence=len(evidence)), indent=2))


if __name__ == '__main__':
    main()
