"""Bind root's final three-profile v0.37 layout/action reports after restoration.

No emulator, build or gameplay suite is launched. Prior fixture failures and
the genuine corrected enlarged-label overflow remain separate from acceptance.
"""
from pathlib import Path
from hashlib import file_digest
from datetime import datetime, timezone
import argparse
import json
import struct

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa/0.37-square-controls'
IDS = ['wt-demolish', 'wt-intelligence', 'blocknight-select-all',
       'wt-deselect-units', 'blocknight-stop', 'wt-select-trucks']


def require(value, message):
    if not value:
        raise RuntimeError(message)


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def bound(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT) and path.is_file(), 'Missing/outside proof input: ' + str(path))
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)}


def size(path):
    with path.open('rb') as stream:
        header = stream.read(24)
    require(header[:8] == b'\x89PNG\r\n\x1a\n', 'Expected original PNG capture')
    return struct.unpack('>II', header[16:24])


def captures(value):
    # Footer snapshots also contain original icon URLs. Only the harness's
    # top-level capture fields are observed Android screenshots.
    for key, item in value.items():
        if not (key.lower().endswith('frame') and isinstance(item, str) and item.lower().endswith('.png')):
            continue
        path = Path(item)
        if not path.is_absolute():
            path = ROOT / path
        require(path.name.startswith('delivery-'), 'Acceptance must use final delivery captures')
        yield path.resolve()


def geometry(state):
    require([b['id'] for b in state['buttons']] == IDS, 'Six control identities/order differ')
    require(state['panel']['width'] == (210 if state['viewport']['w'] <= 800 else 242), 'Original outer width differs')
    for index, button in enumerate(state['buttons']):
        box = button['box']
        require(abs(box['width'] - box['height']) < .6 and button['overflow'] is False
                and button['icon']['loaded'] is True, 'Square geometry, text or original icon failed')
        require(box['left'] >= state['panel']['left'] and box['right'] <= state['panel']['right'] + .1
                and box['top'] >= state['panel']['top'] and box['bottom'] <= state['panel']['bottom'] + .1,
                'Control lies outside the original panel')
        if index % 3:
            require(box['left'] > state['buttons'][index-1]['box']['left'], 'Columns are not ordered')
        if index >= 3:
            require(box['top'] > state['buttons'][index-3]['box']['bottom'], 'Rows overlap')
    require(state['panel']['top'] >= 0 and state['panel']['bottom'] <= state['footer']['top'] + .1
            and state['footer']['bottom'] <= state['viewport']['h'], 'Controls/footer clip or overlap')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--restoration-report', type=Path, default=QA / 'emulator-restoration.json')
    parser.add_argument('--visual-confirmed', action='store_true')
    parser.add_argument('--density-dpi', type=int, default=240)
    parser.add_argument('--small-font-scale', type=float, default=1.3)
    parser.add_argument('--output', type=Path, default=QA / 'emulator-focused-proof.json')
    args = parser.parse_args()
    require(args.visual_confirmed, 'Root must confirm the final actual layouts before proof finalization')
    require(not args.output.exists(), 'Do not overwrite an existing aggregate proof')
    require(digest(args.apk) == args.expected_sha256, 'Candidate APK hash differs')
    reports = {mode: read(QA / ('delivery-' + mode + '.json')) for mode in ('small', 'normal', 'wide')}
    for mode, report in reports.items():
        require(report.get('version') == '0.37' and report.get('mode') == mode and report.get('passed') is True
                and report.get('stoppedAfterChecks') is True, 'Final sequential profile did not pass: ' + mode)
        require(report.get('identity', {}).get('candidateAPK_SHA256') == args.expected_sha256, 'Profile used a different APK')
        geometry(report['layout'])
        if mode != 'wide':
            geometry(report['after'])
    normal, small, wide = (reports[k] for k in ('normal', 'small', 'wide'))
    require(any(t['id'] == normal['combatUnit']['id'] for t in normal['all']) and normal['deselected'] is True,
            'ALL UNITS/combat selection and Deselect evidence incomplete')
    require(normal['trucks'] and all(t['constructor'] is True for t in normal['trucks'])
            and set(normal['stop']['ids']) == {t['id'] for t in normal['trucks']} and normal['stop']['acks'] > 0,
            'Trucks/Stop native acknowledgements incomplete')
    require(normal['demolish']['workerIds'] and normal['intelligence']['open'] is True,
            'Demolish arming/cancel and Intelligence opening evidence incomplete')
    require(len(normal['footer']) == 2 and len(small['footer']) == 2, 'Existing footer route observations missing')
    require(wide.get('physicalBaselinePassed') is True and wide.get('noncompactBranchUnverified') is True
            and wide.get('viewportFixture', {}).get('cleared') is True,
            'Physical-wide acceptance and unverified noncompact boundary must remain explicit')
    restored = read(args.restoration_report)
    require(restored.get('passed') is True and restored.get('allFileBytesMatchOriginal') is True
            and restored.get('fileCount', 0) > 0, 'Original app-data restoration not yet verified')
    profile = restored.get('profile', {})
    require(profile.get('physicalWidth') == 1080 and profile.get('physicalHeight') == 600
            and profile.get('densityDpi') == 240 and profile.get('fontScale') == 1.0, 'Original emulator profile not restored')
    evidence = sorted({p for mode,r in reports.items() if mode != 'wide' for p in captures(r)}
                      | {Path(wide['layoutFrame']).resolve()})
    configurations = []
    for mode, report in reports.items():
        width, height = size(Path(report['layoutFrame']))
        configurations.append({'mode': mode, 'physicalWidth': width, 'physicalHeight': height,
            'densityDpi': args.density_dpi, 'fontScale': args.small_font_scale if mode == 'small' else 1.0})
    require(any(min(c['physicalWidth'],c['physicalHeight'])*160/c['densityDpi'] <= 360 and c['fontScale'] >= 1.3
                for c in configurations), 'Small enlarged-text profile missing')
    supporting = [bound(QA / ('delivery-' + mode + '.json')) for mode in reports]
    supporting += [bound(args.restoration_report), bound(ROOT / 'tools/qa-square-controls-037.cjs'),
                   bound(ROOT / 'tools/record-square-controls-037.py'),
                   bound(QA / 'restored-original-home.png'), bound(QA / 'restore-startup-timeout.png')]
    design = read(QA / 'design-qa-result.json')
    require(design.get('finalResult') == 'passed' and design.get('candidateAPK_SHA256') == args.expected_sha256
            and design.get('reportSHA256') == digest(ROOT / 'design-qa.md')
            and design.get('comparisonSHA256') == digest(QA / 'source-vs-delivery-controls.png'),
            'Final visual comparison does not bind this APK/current images')
    supporting += [bound(QA / 'design-qa-result.json'), bound(ROOT / 'design-qa.md'),
                   bound(QA / 'source-vs-delivery-controls.png'), bound(QA / 'design-comparison-inputs.json'),
                   bound(QA / 'enlarged-label-before-after.png')]
    corrected_fixtures = []
    for path in sorted(QA.glob('fixture-*.json')):
        record = read(path)
        require(record.get('passed') is False, 'Historical fixture classification must retain its failure status')
        supporting.append(bound(path)); corrected_fixtures.append({'path': path.relative_to(ROOT).as_posix(),
            'classification': ('unverified optional noncompact viewport attempt' if path.name == 'fixture-wide-viewport-attempt.json'
                               else 'corrected fixture expectation/setup'), 'passed': False})
    label_record = read(QA / 'pre-fix-enlarged-label.json')
    require(label_record.get('passed') is False, 'Actual pre-fix overflow must retain its failed status')
    supporting += [bound(QA / 'pre-fix-enlarged-label.json'), bound(QA / 'pre-fix-enlarged-label.png')]
    proof = {'version': '0.37', 'candidateAPK_SHA256': args.expected_sha256, 'emulatorUsed': True,
        'gameplayVerified': False, 'newGameplayBehaviorClaimed': False, 'nativeRuntimeChanged': False,
        'testAdsOnly': True, 'liveAdsTested': False, 'audibleAudioVerified': False,
        'smallPhoneConfigurations': configurations,
        'focusedObservations': {'squareControlsLayoutVerified': True, 'outerWidthAndFooterPreservedVerified': True,
            'sixControlActionsVerified': True, 'smallScreenAndTextVerified': True},
        'checks': [{'name': label, 'passed': True, 'observation': 'qa/0.37-square-controls/delivery-'+mode+'.json'}
            for mode,label in [('small','Small enlarged-text controls are square, unclipped, and keep the existing footer usable'),
                ('normal','Six existing actions and both footer routes remain usable with native acknowledgements'),
                ('wide','Physical-wide compact layout retains square controls, original icons/labels/width and separate footer; noncompact Build branch remains unverified')]],
        'evidenceFiles': [bound(p) for p in evidence], 'supportingObservations': supporting,
        'productionDisclosure': normal['productionDisclosure'],
        'correctedProductIssue': {'path': 'qa/0.37-square-controls/pre-fix-enlarged-label.json',
            'description': 'An actual one-pixel Intelligence-label overflow at small enlarged text was fixed by CSS span bounds/wrapping and a narrow text-size adjustment.',
            'classification': 'real related CSS layout defect corrected before final APK'},
        'correctedFixtureObservations': corrected_fixtures,
        'noncompactBranchVerified': False,
        'noncompactBranchDisclosure': 'Physical1280x800 rendered957x598 CSS and remained compact. A temporary CDP override reached noncompact DOM geometry but Android retained visual scale/cropped it; the optional Build toggle was covered, so that interaction/gap is not accepted. The override was cleared and app stopped.',
        'emulatorRestored': True, 'restoredOriginalPrivateFiles': restored['fileCount'], 'restoredOriginalProfile': profile,
        'limitations': ['CSS layout and existing-control checks only, not a new gameplay or complete-match acceptance pass.',
            'One ordinary paid machinegun vehicle supported ALL UNITS, which selects combat units rather than construction trucks; no units/research/power/positions were seeded.',
            'Wrong combat-selection expectations, repeated toggle state, automatic panel collapse, a late dead-worker fixture and a queued-clock pause assertion were corrected in the driver rather than by unrelated app changes.',
            'The driver force-stopped the test app after each profile; no new pause/timing behavior is claimed.',
            'Observed emulator cold-start/profile-change FocusEvent startup timeouts recovered with cold restart or the system Wait action, including after restoring the original profile. Startup code was unchanged and was not audited in this CSS task; no CSS cause is asserted.',
            'The noncompact Build-sidebar interaction/gap was not verified; only the physical-wide compact layout passed.',
            'No audible audio test or live-ad test; native runtime, music, rules, wallet/saves and ads remain byte-identical to v0.36.'],
        'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00','Z')}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(proof, indent=2)+'\n', encoding='utf-8', newline='\n')
    print(json.dumps({'aggregateProofWritten': str(args.output), 'sha256': digest(args.output),
        'passedProfiles': 3, 'evidenceFiles': len(evidence), 'gameplayVerified': False}, indent=2))


if __name__ == '__main__':
    main()
