"""Curate completed v0.54 exact-APK observations; never test, build or package.

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
QA = ROOT / 'qa/campaign-054'
OUT = ROOT / 'archive/campaign-0.54'
APK = ROOT / 'app/build/outputs/apk/debug/app-debug.apk'
RECORD = ROOT / 'archive/campaign-0.54-emulator-checks.json'
FINAL = 'final.json'
HOST_EVIDENCE = ('intelligence-js-checks.json',)
REQUIRED_CASES = ('campaign-footer-expanded-without-collapse-control',
    'campaign-queued-blueprints-visible', 'switching-building-keeps-accepted-blueprints',
    'cancelled-queued-site-removes-its-blueprint', 'campaign-intelligence-over-battlefield',
    'all-combat-suspended-during-intelligence', 'intelligence-android-back-and-reopen',
    'campaign-mission-briefings-remain-accessible', 'intelligence-header-handoffs-close-cleanly',
    'native-build-completion-clears-ghost', 'compact-campaign-footer-and-intelligence-fit',
    'campaign-save-from-intelligence', 'campaign-save-continue-and-reader-reset',
    'towers-footer-expanded-without-collapse-control', 'towers-intelligence-behavior-preserved',
    'towers-build-toggle-and-selection-preserved')
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
    require(record.get('version') == '0.54' and record.get('passed') is True and not record.get('error'),
        'Final live journey has not passed')
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
    require(set(REQUIRED_CASES) <= set(names), 'Required complete live-case schema not satisfied')
    observed = {row['name']: row['data'] for row in cases}
    for mode in ('campaign', 'towers'):
        dock = observed[mode + '-footer-expanded-without-collapse-control']
        require(dock.get('collapseControl') is False and dock.get('collapsed') == 'false'
            and dock.get('oldPreference') == 'true' and dock.get('hidden') is False
            and [row.get('id') for row in dock.get('buttons', [])]
                == ['lab-ops-research', 'lab-ops-production', 'wt-open-build'],
            'Old collapsed preference migration not observed: ' + mode)
    ghosts = observed['campaign-queued-blueprints-visible']
    require(ghosts.get('overlay', {}).get('display') == 'block' and len(ghosts.get('display', {}).get('drawn', [])) >= 2,
        'Visible accepted Campaign blueprint overlay not established')
    intel = observed['campaign-intelligence-over-battlefield']
    frame = intel.get('campaign', {}).get('nativeState', {})
    require(intel.get('intel', {}).get('open') is True and frame.get('worldSafe') is True
        and not frame.get('paused') and not frame.get('intelligenceOpen'),
        'Research Intelligence over active native battlefield not observed')
    briefing = observed['campaign-mission-briefings-remain-accessible']
    require(briefing.get('campaign', {}).get('nativeState', {}).get('intelligenceOpen') is True
        and briefing.get('intel', {}).get('open') is False, 'Explicit original mission-briefing handoff missing')
    small = observed['compact-campaign-footer-and-intelligence-fit']
    require(small.get('physical', {}).get('width') == 1280 and small['physical'].get('height') == 720,
        'Compact physical emulator profile missing')
    small_png = QA / 'compact-campaign-footer.png'
    require(small_png.is_file(), 'Compact footer screenshot missing')
    with small_png.open('rb') as stream:
        header = stream.read(24)
    require(header[:8] == b'\x89PNG\r\n\x1a\n' and int.from_bytes(header[16:20], 'big') == 1280
        and int.from_bytes(header[20:24], 'big') == 720, 'Compact screenshot has wrong physical dimensions')
    saved = observed['campaign-save-from-intelligence']
    require(saved.get('phase') == 'saved' and re.fullmatch(r'wt_[0-9a-f]{32}', saved.get('savedId', ''))
        and record.get('savedId') == saved['savedId'], 'Actual Campaign phone Save identity missing')
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
        ROOT / 'docs/releases/0.54-campaign-overlays.md', ROOT / 'tools/android-sdk.cjs',
        ROOT / 'archive/fallback-0.54.json'}
    for folder in ('app/src', 'campaign', 'scenario'):
        paths.update(path for path in (ROOT / folder).rglob('*') if path.is_file())
    paths.update(path for path in (ROOT / 'tools').glob('*054*') if path.is_file())
    # Package/manifest outputs are written later and must not create a circular
    # proof chain. All existing source inputs and host checks are pinned instead.
    paths.update(path for path in (ROOT / 'archive').glob('*0.54*') if path.is_file()
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
    fallback_path = ROOT / 'archive/fallback-0.54.json'
    fallback = read(fallback_path)
    require(fallback.get('version') == '0.54' and fallback.get('baseline') == '0.53', 'Wrong fallback identity')
    for row in fallback['files']:
        path = Path(row['path'])
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], 'Immutable v0.53 fallback changed: ' + str(path))
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
    record = dict(version='0.54', passed=True, candidateAPK_SHA256=expected,
        emulatorUsed=True, androidWebViewUsed=True, androidRuntimeExecuted=True, actualNativeEngineExecuted=True,
        browserUsed=False, checks=[row['name'] for row in final['checks']], checksPassed=len(final['checks']),
        verificationInputs={FINAL: dict(path=(OUT / FINAL).relative_to(ROOT).as_posix(), sha256=before[FINAL]['sha256'])},
        fallbackRecord=dict(path=fallback_path.relative_to(ROOT).as_posix(), sha256=digest(fallback_path)),
        gameplayVerifiedScope='Focused Campaign Intelligence/native briefing handoffs, construction overlay visibility and footer interaction, plus Towers regression; exact observed case data defines the verified scope.',
        fixtureDisclosure=final.get('fixtureDisclosure'), seededGameState=final.get('seededGameState'),
        nativeCheckpointReused=final.get('nativeCheckpointReused'), seededUIPreference=final.get('seededUIPreference'),
        fixtureNotes=final.get('fixtureNotes', []),
        nativeRuntimeChanged=False, campaignOrScenarioSourceChanged=False, noVFSAppend=True,
        fullCampaignPlaythroughVerified=False, laterMissionsVerified=False, offworldMissionsVerified=False,
        allMapsVerified=False, physicalPhonePerformanceVerified=False, audioPlaybackVerified=False,
        terrainVisualCorrectnessVerified=False, rewardedAdsWatched=False, liveAdsTested=False,
        githubPublished=False, vpsChanged=False,
        limitations=['This is a targeted Campaign UI/overlay and Towers-regression journey, not a full Alpha/Beta/Gamma or off-world playthrough.',
            'Prepared native saves or other fixture adjustments, if used, are disclosed in the final live record; seeded fixtures do not establish ordinary combat balance.',
            'The pre-existing Campaign cancellation journal can retain a construction-site/blueprint entry after its app job is cancelled until builders become idle and reconciliation completes; this backend was not changed in v0.54.',
            'The emulator retains its previously observed dark/black terrain; native models/orders and UI observations are separate from terrain appearance, audible playback and physical-phone performance.'],
        sources=sources, evidence=evidence, recordedUTC=datetime.now(timezone.utc).isoformat())
    temporary = RECORD.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    temporary.replace(RECORD)
    print(json.dumps(dict(passed=True, proof=str(RECORD), candidateAPK_SHA256=expected,
        checksPassed=len(final['checks']), sourceFiles=len(sources), curatedEvidence=len(evidence)), indent=2))


if __name__ == '__main__':
    main()
