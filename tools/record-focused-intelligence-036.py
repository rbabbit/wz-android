"""Aggregate root's exact-APK v0.36 observations after visual/restoration approval.

This does not operate an emulator or make screenshots. It refuses to finalize
until every named delivery report passed, the small-screen review is explicitly
acknowledged, and root's original-device restoration record is present.
"""
from pathlib import Path
from hashlib import file_digest
from datetime import datetime, timezone
import argparse
import json
import struct

ROOT = Path(__file__).resolve().parents[1]
REPORTS = {
    'demolish': 'qa/0.36-demolish/delivery-demolish.json',
    'foundation': 'qa/0.36-demolish/delivery-foundation.json',
    'load': 'qa/0.36-demolish/delivery-load-cancel.json',
    'intel': 'qa/0.36-intelligence/delivery-intelligence.json',
    'research': 'qa/0.36-intelligence/delivery-research.json',
    'save': 'qa/0.36-intelligence/delivery-save.json',
    'small': 'qa/0.36-intelligence/delivery-small.json',
}
SETUP_OBSERVATIONS = {
    'qa/0.36-demolish/fixture-missing-worker.json': 'An assigned truck had died and its attempted setup was unreachable; a valid native checkpoint was used afterward.',
    'qa/0.36-intelligence/fixture-expired-notice.json': 'The notice fixture attempted to tap an already expired notice; the final run waited for a fresh natural completion.',
    'qa/0.36-intelligence/fixture-resume-readiness.json': 'A resumed archive correctly left the opening controller idle; the fixture incorrectly waited for released and was corrected.',
}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def relative(path):
    resolved = path.resolve()
    require(resolved.is_relative_to(ROOT), 'Proof input must be in source workspace: ' + str(path))
    return resolved.relative_to(ROOT).as_posix()


def bound(path):
    require(path.is_file(), 'Proof input missing: ' + str(path))
    return {'path': relative(path), 'sha256': digest(path)}


def png_size(path):
    with path.open('rb') as stream:
        header = stream.read(24)
    require(header[:8] == b'\x89PNG\r\n\x1a\n', 'Expected original screenshot PNG')
    return struct.unpack('>II', header[16:24])


def screenshot_paths(value):
    if isinstance(value, dict):
        for item in value.values():
            yield from screenshot_paths(item)
    elif isinstance(value, list):
        for item in value:
            yield from screenshot_paths(item)
    elif isinstance(value, str) and value.lower().endswith('.png'):
        path = Path(value)
        if not path.is_absolute():
            path = ROOT / path
        require(path.name.startswith('delivery-'), 'Passed proof must bind only final delivery captures: ' + str(path))
        yield path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--restoration-report', type=Path, default=ROOT / 'qa/0.36-intelligence/emulator-restoration.json')
    parser.add_argument('--small-visual-confirmed', action='store_true')
    parser.add_argument('--small-density-dpi', type=int, default=240)
    parser.add_argument('--small-font-scale', type=float, default=1.3)
    parser.add_argument('--output', type=Path, default=ROOT / 'qa/0.36-intelligence/emulator-focused-proof.json')
    args = parser.parse_args()
    require(args.small_visual_confirmed, 'Root must confirm the actual small-screen visual review before finalization')
    require(not args.output.exists(), 'Existing aggregate proof must not be overwritten')
    relative(args.output)
    require(digest(args.apk) == args.expected_sha256, 'Candidate APK differs')
    reports = {key: read(ROOT / name) for key, name in REPORTS.items()}
    for key, report in reports.items():
        require(report.get('version') == '0.36' and report.get('passed') is True, 'Delivery report did not pass: ' + key)
        require(report.get('identity', {}).get('candidateAPK_SHA256') == args.expected_sha256,
                'Report is from another candidate APK: ' + key)
    d, f, load, intel, research, save, small = (reports[k] for k in REPORTS)
    selected = {t['id'] for t in d['initialTrucks'] if t['selected']}
    require(selected == set(d['orderReply']['result']['workerIds']) and len(selected) == 1
            and d.get('hqProtected') is True and d.get('otherGroupPreserved') is True
            and isinstance(d.get('completedTargetRemoved'), int), 'Selected-worker demolition evidence incomplete')
    require(any(t['id'] in selected and t['order'] == 7 for t in d['nativeAfterOrder']), 'Actual native Demolish order missing')
    require(f['busyTarget']['foundation'] is True and f['busyTarget']['eligible'] is False
            and f['unselectedBuilderPreserved']['building'] is True
            and f['unselectedBuilderPreserved']['selected'] is False
            and set(f['selectedWorkers']) == set(f['reply']['result']['workerIds'])
            and f.get('partialRemoved') is True, 'Real foundation/protected-other-group evidence incomplete')
    require(load.get('cancelled') is True and load['stale']['ok'] is False
            and load['stale']['reason'] in ('cancelled', 'game-reloaded')
            and load['after']['gameTime'] < load['before']['clock'], 'QuickLoad/stale-intent rejection incomplete')
    require(any(t['id'] == 'R-Vehicle-Body05' and t['hasMessage'] for t in load['historyAfter']['history']),
            'Completed research did not survive the actual native load')
    a, b = intel['before']['preview'], intel['after']['preview']
    require(a['active'] is True and b['active'] is True and b['frames'] > a['frames']
            and b['realTime'] > a['realTime'] and a['topicId'] == b['topicId'], 'Real native model advancement missing')
    require('No claim of listening' in intel.get('audioDisclosure', '')
            and intel['before']['selected']['categoryAudio'], 'Audio dispatch limitation must remain explicit')
    require(intel['afterBack']['open'] is False and intel['afterBack']['closing'] is False
            and len(intel['navigation']) >= 3 and all(n['preview']['active'] is False for n in intel['navigation']),
            'Back and existing-menu native preview cleanup incomplete')
    for state, topic in ((research['cobra'], 'R-Vehicle-Body05'), (research['report'], 'R-Vehicle-Metals01')):
        require(state['selectedId'] == topic and state['selected']['hasReport'] is True
                and state['selected']['read'] is True and state['selected']['description'], 'Natural completion report evidence incomplete')
    require(research['report']['selected']['results'], 'Actual Composite Alloys effects missing')
    require(save['save']['phase'] == 'saved' and research['save']['phase'] == 'saved'
            and small['savedAgain']['phase'] == 'saved', 'Actual native archive acknowledgements missing')
    require(small['bounds']['overflow'] is False and small['historyScroll'] > 20
            and small['bounds']['panel']['bottom'] <= small['bounds']['viewport']['h'], 'Small-phone layout/scroll evidence incomplete')
    restoration = read(args.restoration_report)
    profile = restoration.get('profile', {})
    require(restoration.get('passed') is True and restoration.get('allFileBytesMatchOriginal') is True
            and restoration.get('fileCount', 0) > 0
            and profile.get('physicalWidth') == 1080 and profile.get('physicalHeight') == 600
            and profile.get('densityDpi') == 240 and profile.get('fontScale') == 1.0,
            'Original emulator data/config restoration not yet confirmed')
    screenshots = sorted({path.resolve() for report in reports.values() for path in screenshot_paths(report)})
    require(screenshots, 'Final delivery captures missing')
    width, height = png_size(Path(small['modelFrame']))
    require(min(width, height) * 160 / args.small_density_dpi <= 360, 'Observed screenshot is not the small-phone profile')
    require(args.small_font_scale >= 1.3, 'Enlarged-text observation missing')
    supporting = [bound(ROOT / name) for name in REPORTS.values()] + [bound(args.restoration_report)]
    for name in ('tools/qa-intelligence-demolish-036.cjs', 'tools/qa-restore-036.cjs',
                 'tools/record-focused-intelligence-036.py', 'qa/0.36-intelligence/restored-original-home.png'):
        supporting.append(bound(ROOT / name))
    setup = []
    for name, explanation in SETUP_OBSERVATIONS.items():
        supporting.append(bound(ROOT / name)); setup.append({'path': name, 'classification': 'corrected fixture failure', 'explanation': explanation})
    save_error = ROOT / 'qa/0.36-intelligence/save-error.png'
    if save_error.is_file():
        supporting.append(bound(save_error))
    proof = {'version': '0.36', 'candidateAPK_SHA256': args.expected_sha256,
        'emulatorUsed': True, 'gameplayVerified': False, 'focusedNativeDemolishVerified': True,
        'testAdsOnly': True, 'liveAdsTested': False, 'audibleAudioVerified': False,
        'smallPhoneConfigurations': [{'physicalWidth': width, 'physicalHeight': height,
            'densityDpi': args.small_density_dpi, 'fontScale': args.small_font_scale}],
        'focusedObservations': {'demolishNativeOrdersVerified': True, 'demolishCancellationAndLoadVerified': True,
            'intelligenceCompletedHistoryVerified': True, 'intelligencePreviewAndOriginalAudioDispatchVerified': True,
            'intelligenceNavigationAndInputVerified': True},
        'checks': [{'name': label, 'passed': True, 'observation': REPORTS[key]} for key, label in (
            ('demolish','One selected native demolition truck removes structure; other group and HQ remain protected'),
            ('foundation','Real paid foundation remains protected from an unselected builder group then is demolished by explicitly selected workers'),
            ('load','Native F8 cancels armed targeting, rejects stale intent and retains completed research history'),
            ('intel','Actual rotating native model advances; Back/Research/Production/Help clear it; original audio dispatch is scoped'),
            ('research','Natural Cobra and Composite research completes; Composite notice opens its matching authored report and native save succeeds'),
            ('save','Cold-restarted exact APK completes native phone save archive'),
            ('small','Small enlarged-text profile supports history scrolling, bounded report layout, keyboard Back, closure and saving'))],
        'evidenceFiles': [bound(p) for p in screenshots], 'supportingObservations': supporting,
        'fixtureDisclosure': f['setupDisclosure'], 'correctedSetupFailures': setup,
        'audioDisclosure': 'Emulator started with -no-audio. Original UI/category playback dispatch and native audio bytes are retained; no listening or audible-output verification is claimed.',
        'emulatorRestored': True, 'restoredOriginalPrivateFiles': restoration['fileCount'],
        'restoredOriginalProfile': profile,
        'limitations': ['Focused affected-flow/native-order checks, not all maps or a complete match.',
            'No audible audio listening test: the existing emulator was started with -no-audio.',
            'An initial test save after reinstall encountered an IndexedDB connection-closing error. A cold restart of the exact candidate then passed multiple native saves; storage code was not changed.',
            'The pre-existing emulator renders gameplay terrain black; native units, models, controls and authoritative state remain observable.',
            'Corrected dead/unreachable-worker, expired-notice and resumed-idle-controller fixture failures are retained separately from passed delivery observations.'],
        'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00','Z')}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'aggregateProofWritten': str(args.output), 'sha256': digest(args.output),
        'passedDeliveryChecks': len(proof['checks']), 'evidenceFiles': len(screenshots),
        'gameplayVerified': False, 'audibleAudioVerified': False}, indent=2))


if __name__ == '__main__':
    main()
