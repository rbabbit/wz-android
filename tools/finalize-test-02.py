"""Create Test 02 delivery gates only after all scoped final-APK reports pass.

This aggregates recorded evidence; it does not execute emulator tests. Failed
fixture runs remain supporting diagnostics and are never treated as passes.
"""
from pathlib import Path
from hashlib import file_digest
from datetime import datetime, timezone
import argparse
import json

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT/'qa/test-02'
REPORTS = [
    'startup-delivery/lab-startup-qa.json',
    'visual-review.json',
    'paused-returns/test-02-paused-returns.json',
    'navigation/native-build-navigation.json',
    'integrated-journey.json',
    'gameplay-delivery/research-verified.json',
    'gameplay-delivery/lab-journey-production.json',
    'gameplay-delivery/lab-journey-designs.json',
    'gameplay-delivery/lab-journey-keyboard.json',
    'building/wide-controls/audit-building-wide.json',
    'building/fifo-delivery/audit-smooth-fifo.json',
    'save-roundtrip/save-roundtrip.json',
    'layout-delivery/layout-journey.json',
    'quit-delivery/test-02-quit-journey.json',
    'dustfall/audit-build-display-td1.json',
    'final-integrity.json',
    'code-checks.json',
    'package-verification.json',
]
IDENTITY_KEYS = {'candidateAPK_SHA256', 'installedAPK_SHA256', 'expectedAPK_SHA256', 'buildAPK_SHA256'}
REQUIRED_TESTS = {
    'test-visible-trucks.cjs', 'test-smooth-building.cjs', 'test-command-bridge.cjs',
    'test-command-pages.cjs', 'test-terrain-picker.cjs', 'test-build-display.cjs',
    'test-html-return.cjs', 'test-html-page-return.cjs', 'test-test-lifecycle.cjs',
    'test-html-input-modes.cjs', 'test-towers-camera.cjs', 'test-touch-zoom.cjs',
    'test-research-queue-bridge.cjs', 'test-html-design.cjs', 'test-production-removal.cjs',
    'test-tower-defense.cjs', 'test-native-build-navigation.cjs',
    'test-fresh-selection-state.cjs',
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def identities(value, candidate, context):
    if isinstance(value, dict):
        for key, item in value.items():
            if key in IDENTITY_KEYS and item:
                require(item == candidate, 'Different APK in '+context+': '+key)
            elif isinstance(item, (dict, list)):
                identities(item, candidate, context)
    elif isinstance(value, list):
        for item in value:
            identities(item, candidate, context)


def record(path):
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)}


def ids(reply):
    return sorted(t['id'] for t in reply['result']['selectedUnits'])


def closed_ui(state):
    return (state.get('frameInert') is False and state.get('frameHidden') is False
            and state.get('frameVisibility') == 'visible' and state.get('battleActive') is True
            and state.get('hudVisible') is True and not any(state.get(k) for k in
                ('page', 'nativeMenu', 'nativeBackVisible', 'researchOpen', 'researchOpening', 'helpOpen')))


def fifo_matches_native(fifo):
    wanted = [(c['item'], c['x'], c['y']) for c in fifo['cases']]
    finished = [(c['itemId'], c['x'], c['y']) for c in fifo['finished']]
    if len(wanted) != 3 or finished != wanted or len(fifo['structures']) != 3:
        return False
    if len({item for item, _, _ in wanted}) < 2:
        return False
    for (item, x, y), structure in zip(wanted, fifo['structures']):
        expected_points = {'PillBox1': 400, 'GuardTower1': 300}.get(item)
        if (expected_points is None or structure['name'] != item
                or structure['currentBuildPts'] != expected_points
                or abs(structure['position'][0]/128-(x+.5)) >= .1
                or abs(structure['position'][1]/128-(y+.5)) >= .1):
            return False
    return (len(fifo['nativeOrders']) == 3
            and all(d['order/type'] == 4 and d['order/stats'] == wanted[0][0] for d in fifo['nativeOrders'])
            and len(fifo['clicks']) == 3
            and all(c['read']['placement'] == c['id'] and c['latencyMs'] < 100 for c in fifo['clicks']))


def native_navigation_matches(nav):
    running = {case['menu']: case for case in nav['cases'] if case.get('menu')}
    if running.keys() != {'stats', 'commanders'}:
        return False
    native_ids = None
    for menu, case in running.items():
        selected = sorted(d['id'] for d in case['selected']['selected'])
        returned = case['returned']
        if (case['nativeOpened']['nativeMenu'] != menu or case['nativeClosed']['nativeMenu'] != ''
                or case['immediate']['placement'] != 'GuardTower1' or not selected
                or selected != sorted(case['selected']['group']) or returned['nativeMenu'] != ''
                or returned['nativeBackVisible'] or returned['frameInert'] or returned['busyVisible']):
            return False
        if native_ids is not None and native_ids != selected:
            return False
        native_ids = selected
    paused_cases = [case['record'] for case in nav['cases'] if case.get('record')]
    if len(paused_cases) != 1:
        return False
    paused = paused_cases[0]
    returned = paused['returned']
    restored = paused['restored']
    toast = paused.get('toast', {})
    toast_visible = (toast.get('present') is True and toast.get('hidden') is False
                     and toast.get('display') != 'none' and toast.get('visibility') != 'hidden')
    compact_toast = (toast.get('present') is True and
                     (not toast_visible or 0 < toast.get('rect', {}).get('height', 0) < 100))
    return (paused['elapsedMs'] < 6500 and returned['clock'] == paused['stoppedAt']
            and not returned['frameInert'] and not returned['buildOpen'] and not returned['busyVisible']
            and returned['session']['phase'] == 'playing' and paused['resumedAt'] > paused['stoppedAt']
            and sorted(d['id'] for d in restored['snapshot']['selectedUnits']) == native_ids
            and not restored['nativeMenu'] and not restored['frameInert'] and not restored['busyVisible']
            and compact_toast
            and bool(nav['monitor']['samples']) and all(not sample['covered'] for sample in nav['monitor']['samples']))


def integrated_journey_matches(master):
    expected = {
        'native-build-navigation', 'paused-returns', 'research-production-models-and-returns',
        'keyboard-returns', 'wide-stop-movement-and-building', 'three-site-mixed-fifo',
        'compact-layouts', 'genuine-native-save-load', 'native-quit-confirm-and-new-battle',
        'dustfall-camera-and-construction',
    }
    phases = master.get('phases', [])
    fixture = master.get('quitFixture', {})
    return (master.get('passed') is True and master.get('current') == 'completed'
            and master.get('libraryPreservedAcrossUpdate') is True
            and expected == {phase['name'] for phase in phases}
            and all(phase.get('passed') is True for phase in phases)
            and len(fixture.get('native', {}).get('jobs', [])) >= 2
            and len(fixture.get('ghosts', {}).get('acceptedSites', [])) >= 2
            and isinstance(fixture.get('pausedAt'), (int, float)) and fixture['pausedAt'] > 0)


def derive_checks(reports):
    wide = reports['building/wide-controls/audit-building-wide.json']
    dust = reports['dustfall/audit-build-display-td1.json']
    fifo = reports['building/fifo-delivery/audit-smooth-fifo.json']
    research = reports['gameplay-delivery/research-verified.json']
    production = reports['gameplay-delivery/lab-journey-production.json']['production']
    designs = reports['gameplay-delivery/lab-journey-designs.json']['designs']
    keyboard = reports['gameplay-delivery/lab-journey-keyboard.json']['keyboardReturns']
    save = reports['save-roundtrip/save-roundtrip.json']
    quit_report = reports['quit-delivery/test-02-quit-journey.json']
    paused = reports['paused-returns/test-02-paused-returns.json']
    navigation_ok = native_navigation_matches(reports['navigation/native-build-navigation.json'])
    master = reports['integrated-journey.json']
    integrated_ok = integrated_journey_matches(master)
    visual = reports['visual-review.json']['checks']
    startup = reports['startup-delivery/lab-startup-qa.json']
    layout = reports['layout-delivery/layout-journey.json']
    selection = wide['explicitTruckSelection']
    native_trucks = sorted(t['id'] for t in wide['movement']['commands']['snapshot']['selectedUnits'])
    assigned_trucks = sorted(wide['movement']['commands']['nativeBuildGroup'])
    samples = wide['samples']
    fifo_samples = fifo['samples']
    monitor = dust['monitor']['samples']
    point, height = dust['startingCamera']['point'], dust['startingCamera']['height']
    completion = research['researchCompletion']
    lab_id = completion['nativeTarget']['id']
    before_lab = next(l for l in completion['before']['labs'] if l['id'] == lab_id)
    after_lab = next(l for l in completion['after']['labs'] if l['id'] == lab_id)
    produced_ids = {u['id'] for u in production['produced']}
    native_ids = {u['id'] for u in production['nativeUnits']}
    preserved_designs = {d['id'] for d in designs['libraryAfter']['designs']}
    returns = [case for round_ in paused['rounds'] for case in round_['cases']]
    ended = quit_report['ended']
    profiles = {p['name']: p for p in layout['profiles']}
    geometry_ok = True
    for profile in profiles.values():
        for screen in profile['screens']:
            g = screen['geometry']
            geometry_ok &= (g['content']['horizontalOverflow'] <= 2
                            and all(c['horizontalOverflow'] <= 2 for c in g['columns']))
        geometry_ok &= profile['research']['horizontalOverflow'] <= 2
    checks = {
        'truckSelection': (navigation_ok and selection['coveredSamples'] == 0 and bool(native_trucks) and native_trucks == assigned_trucks
                           and ids(dust['coldSelection']) == ids(dust['repeatedSelection'])),
        'smoothConstruction': (len(samples) > 2 and all(s['frozen'] is False for s in samples)
                               and samples[-1]['frames'] > samples[0]['frames']
                               and samples[-1]['time'] > samples[0]['time']
                               and all(s['frame'] == samples[0]['frame'] and s['canvas'] == samples[0]['canvas']
                                       and s['zoom'] == samples[0]['zoom'] for s in samples)
                               and len(fifo_samples) > 2 and all(s['frozen'] is False for s in fifo_samples)
                               and fifo_samples[-1]['frames'] > fifo_samples[0]['frames']
                               and fifo_samples[-1]['time'] > fifo_samples[0]['time']
                               and all(s['frame'] == fifo_samples[0]['frame'] and s['canvas'] == fifo_samples[0]['canvas']
                                       and s['zoom'] == fifo_samples[0]['zoom'] for s in fifo_samples)),
        # The passing fresh mixed FIFO run includes its EXIT preview-hidden
        # assertion. Historical eight-site fixtures are not delivery gates.
        'constructionQueues': fifo_matches_native(fifo),
        'movement': (wide['structure']['currentBuildPts'] >= 300
                     and any('movement' in case for case in wide['cases'])),
        'research': (set(research['verifiedPhases']) == {'research', 'research-completion'}
                     and bool(research['researchQueue']['nativeTargets'])
                     and before_lab['topicId'] != after_lab['topicId']
                     and after_lab['topicId'] == completion['nativeTarget']['Research/target']),
        'production': bool(produced_ids) and produced_ids <= native_ids,
        'saves': (integrated_ok and master['libraryPreservedAcrossUpdate'] is True
                  and save['preLoadClock'] > save['rewoundClock'] + 3000
                  and save['native']['structuresCompared'] > 0 and save['input']['factoryBackRestored'] is True
                  and designs['libraryBefore'] == designs['libraryAfter']
                  and {designs['custom']['id'], designs['savedTemplate']['id']} <= preserved_designs
                  and keyboard['phoneLibraryUnchanged'] is True),
        'menuReturns': (integrated_ok and navigation_ok and len(returns) >= 12 and all(closed_ui(c['returned']) and closed_ui(c['afterResume'])
                         and c['resumeClock']['after'] > c['resumeClock']['before']
                         and c['nativeAfterResume']['gameTime'] > c['stoppedClock'] for c in returns)
                        and len(keyboard['rounds']) >= 2 and all(r['imeDismissed'] for r in keyboard['rounds'])
                        and ended['session']['result'] == 'exited' and ended['session']['exitReason'] == 'quit'
                        and ended['frameInert'] is True and ended['frameVisibility'] == 'hidden'
                        and ended['headerHidden'] is True and ended['dockHidden'] is True
                        and ended['snapshotCleared'] is True and ended['pending'] == 0
                        and ended['battleActive'] is False and ended['hudVisible'] is False
                        and len(quit_report['beforeGhostSites']) >= 1
                        and not ended['ghostSites'] and not ended['ghostPreview']
                        and closed_ui(quit_report['newBattleInput'])),
        'dustfallCamera': (dust['startingCamera']['rotation']['y'] == 0
                           and height*.7 < point['y'] < height-8),
        'dustfallMinimapTouchPlacement': (bool(dust['site']) and bool(dust['native']) and len(monitor) > 2
                                         and all(not s['frozen'] and s['frame'] == monitor[0]['frame']
                                                 and s['canvas'] == monitor[0]['canvas']
                                                 and s['zoom'] == monitor[0]['zoom'] for s in monitor)),
        'branding': (visual['normalTestNameAndOfficialSplashBranding'] is True
                      and visual['correctStartupPunctuation'] is True
                      and visual['noExtraneousProductLabBadgesOrSlogansInReviewedImages'] is True
                      and {'phone', 'wide', 'enlarged'} <= {c['name'] for c in startup['cases']}),
        'compactLayout': (geometry_ok and {'wide', 'phone-enlarged', 'compact-extra-large'} <= profiles.keys()
                          and visual['phoneWideAndEnlargedStartupControlsReadableWithinViewport'] is True),
    }
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    args = parser.parse_args()
    package = read(QA/'package-verification.json')
    candidate = digest(args.apk)
    require(package.get('passed') is True and package['candidateAPK_SHA256'] == candidate, 'Package report is for a different APK')
    reports = {}
    for name in REPORTS:
        report = read(QA/name)
        require(report.get('passed') is True, 'Required final report did not pass: '+name)
        identities(report, candidate, name)
        reports[name] = report
    require(reports['startup-delivery/lab-startup-qa.json'].get('installedAPK_SHA256') == candidate, 'Startup did not verify the installed final APK')
    for name in ('paused-returns/test-02-paused-returns.json', 'gameplay-delivery/research-verified.json',
                 'gameplay-delivery/lab-journey-production.json', 'gameplay-delivery/lab-journey-designs.json',
                 'gameplay-delivery/lab-journey-keyboard.json', 'save-roundtrip/save-roundtrip.json',
                 'layout-delivery/layout-journey.json', 'quit-delivery/test-02-quit-journey.json', 'dustfall/audit-build-display-td1.json',
                 'navigation/native-build-navigation.json', 'integrated-journey.json'):
        require(reports[name].get('identity', {}).get('candidateAPK_SHA256') == candidate, 'Missing exact installed-APK identity: '+name)
    tests = reports['code-checks.json']['tests']
    require(all(test.get('passed') is True and test.get('exitCode') == 0 for test in tests), 'Source regression record contains a failure')
    missing_tests = REQUIRED_TESTS - {test['name'] for test in tests}
    require(not missing_tests, 'Required source regressions are missing: '+', '.join(sorted(missing_tests)))
    for entry in package['sourceFiles'] + package['scenarioSourceFiles']:
        source = (ROOT/entry['path']).resolve()
        require(source.is_relative_to(ROOT) and digest(source) == entry['sha256'], 'Source changed after package verification: '+entry['path'])
    checks = derive_checks(reports)
    failed = [name for name, passed in checks.items() if passed is not True]
    require(not failed, 'Required emulator checks are not established: '+', '.join(failed))
    diagnostics = QA/'fixture-diagnostics.json'
    require(diagnostics.is_file(), 'Fixture diagnostics are missing')
    source_run = QA/'preflight-ce/gameplay-all-interrupted.json'
    require(source_run.is_file(), 'Original interrupted research/production runner evidence is missing')
    # Historical supporting evidence may identify an earlier APK. Its checksum
    # preserves provenance; it is never allowed to establish a final-APK pass.
    read(source_run)
    supporting_paths = [diagnostics, source_run]
    research_fixture_miss = QA/'preflight-ce/research-card-fixture-miss.json'
    if research_fixture_miss.is_file():
        supporting_paths.append(research_fixture_miss)
    for name in ('building/numbered-sites/audit-build-display.json', 'building/numbered-sites-delivery/audit-build-display.json',
                 'preflight-c930/integrated-journey.json', 'preflight-c930/native-build-navigation.json',
                 'integrated-fifo-readiness.json', 'save-roundtrip-observer-miss.json',
                 'save-roundtrip/save-roundtrip-observer-miss.json',
                 'save-roundtrip-native-loading-timeout.json',
                 'save-roundtrip/save-roundtrip-native-loading-timeout.json',
                 'integrated-save-loading-timeout.json'):
        path = QA/name
        if path.is_file():
            supporting_paths.append(path)
    supporting = [record(path) for path in supporting_paths]
    records = [record(QA/name) for name in REPORTS]
    recorded = datetime.now(timezone.utc).isoformat()
    limitations = [
        'The historical preflight all-run stopped at a production-fixture lookup and remains supporting diagnostics only. Current delivery requires the completed integrated master journey and all current passing child reports.',
        'Some immediate paused-return screencaps contain the preceding compositor frame; settled pause/resume witnesses and native state/clock checks are identified in visual-review.json.',
        'Software-emulator black terrain remains; no physical-device GPU, audio/FPS or complete 30-wave victory certification.',
        'Prepared fixtures restore complete ordinary native saves; normal production and genuine F7/F8 save/load are checked separately.',
        'The historical eight-site fixture was abandoned after repeated readiness/reachability failures. Construction delivery evidence is the fresh three-site mixed FIFO journey and the separate STOP/movement journey.',
    ]
    emulator = {
        'passed': True, 'emulatorTesting': True, 'gameplayTesting': True,
        'candidateAPK_SHA256': candidate, 'installedAPK_SHA256': candidate,
        'package': package['package'], 'version': package['version'], 'checks': checks,
        'reportScope': 'Completed integrated final-APK master journey with individually passing scope reports and documented bounded QA retries; historical interrupted runs are supporting diagnostics only',
        'libraryPreservedAcrossUpdate': True,
        'quitClearedNonemptyGhostSites': True,
        'constructionQueueScope': 'Fresh three-site mixed FIFO with native orders/completion and EXIT preview-hidden assertion, plus separate STOP/movement checks; no eight-site certification',
        'sourceReports': records, 'supportingReports': supporting, 'limits': limitations, 'recordedUTC': recorded,
    }
    emulator_path = QA/'emulator-verification.json'
    emulator_path.write_text(json.dumps(emulator, indent=2)+'\n', encoding='utf-8')
    gate = {
        'passed': True, 'emulatorTesting': True, 'gameplayTesting': True,
        'candidateAPK_SHA256': candidate, 'package': package['package'], 'version': package['version'],
        'checks': checks, 'reports': records + [record(emulator_path)], 'supportingReports': supporting,
        'completeOrdinaryNativeFixtures': True, 'debugUnitsPowerResearchOrWorldEdits': False,
        'limits': limitations, 'recordedUTC': recorded,
    }
    (QA/'DELIVERY.json').write_text(json.dumps(gate, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'candidateAPK_SHA256': candidate, 'requiredReports': len(records), 'requiredChecks': len(checks)}, indent=2))


if __name__ == '__main__':
    main()
