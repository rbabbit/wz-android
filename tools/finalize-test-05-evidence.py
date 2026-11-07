"""Aggregate completed 0.5 evidence; never execute or invent gameplay checks.

Run only after the exact candidate's nine integrated phases, code/package/native
reports, manual visual-review.json and final-integrity.json exist and pass.
The manual visual report must include checks.queuedBlueprintAlignment:true;
custom overlay geometry alone cannot certify the native green blueprint.

Example after root review:
  python tools/finalize-test-05-evidence.py --apk PATH --max-overlay-paint-ms 150

All source reports are hash-bound. Failed/superseded runs may be included with
--supporting FILE_OR_FOLDER but never become required passing reports. No source,
APK, old raw reports or existing screenshots are edited by this tool.
"""
from pathlib import Path
from datetime import datetime, timezone
from hashlib import sha256
import argparse
import json
import math
import runpy

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT/'qa/test-05'
helpers = runpy.run_path(str(ROOT/'tools/verify-test-05-package.py'), run_name='preview_evidence_helpers')
digest, require, local = (helpers[n] for n in ('digest', 'require', 'local'))
PHASES = (
    ('ordinary-preview-and-mixed-module', 'preview-journey', 'preview-journey.json'),
    ('raised-platform-and-cyborg-footprint', 'raised-footprint', 'audit-build-display-td1.json'),
    ('research-power-and-native-save-load', 'module-journey', 'module-journey-dustfall.json'),
    ('factory-two-levels-and-normal-production', 'factory-journey', 'module-journey-factory.json'),
    ('module-layout-and-same-item-reselection', 'module-layout', 'module-layout.json'),
    ('mixed-selection-fifo-movement-and-returns', 'mixed-regression', 'mixed-selection.json'),
    ('twelve-paused-returns', 'paused-returns', 'test-02-paused-returns.json'),
    ('keyboard-returns', 'keyboard-returns', 'lab-journey-keyboard.json'),
    ('native-quit-and-fresh-battle', 'quit-return', 'test-02-quit-journey.json'),
)
AGGREGATES = ('package-verification.json', 'code-checks.json', 'visual-review.json',
              'native-build-verification.json', 'final-integrity.json')
IDENTITY_KEYS = {'candidateAPK_SHA256', 'installedAPK_SHA256', 'expectedAPK_SHA256', 'buildAPK_SHA256'}
REQUIRED_TESTS = {
    'test-placement-preview.cjs', 'test-module-target-display.cjs', 'test-terrain-picker.cjs',
    'test-terrain-height-index.cjs', 'test-terrain-cpu-mirror.cjs', 'test-visible-trucks.cjs', 'test-smooth-building.cjs',
    'test-command-bridge.cjs', 'test-command-pages.cjs', 'test-build-display.cjs',
    'test-html-return.cjs', 'test-html-page-return.cjs', 'test-test-lifecycle.cjs',
    'test-html-input-modes.cjs', 'test-towers-camera.cjs', 'test-touch-zoom.cjs',
    'test-research-queue-bridge.cjs', 'test-html-design.cjs', 'test-production-removal.cjs',
    'test-tower-defense.cjs', 'test-native-build-navigation.cjs', 'test-fresh-selection-state.cjs',
    'test-native-box-input.cjs', 'test-selection-cache.cjs', 'test-module-targets.cjs', 'test-module-placement.cjs',
}


def identities(value, candidate, label):
    count = 0
    if isinstance(value, dict):
        for key, item in value.items():
            if key in IDENTITY_KEYS and item:
                require(item == candidate, 'Different APK in '+label+': '+key)
                count += 1
            elif isinstance(item, (dict, list)):
                count += identities(item, candidate, label)
    elif isinstance(value, list):
        for item in value:
            count += identities(item, candidate, label)
    return count


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def json_text(value):
    return json.dumps(value, indent=2, ensure_ascii=False)+'\n'


def record(path, data=None):
    if data is None:
        data = path.read_bytes()
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha256(data).hexdigest()}


def input_report(name, candidate, exact=True):
    path = (QA/name).resolve()
    require(path.is_relative_to(QA) and path.is_file(), 'Missing/external evidence: '+name)
    raw = path.read_bytes()
    value = json.loads(raw.decode('utf-8-sig'))
    require(value.get('passed') is True, 'Report not completed/passed: '+name)
    if exact:
        require(identities(value, candidate, name) > 0, 'Exact APK identity absent: '+name)
    require(not value.get('failure') and not value.get('cleanupFailure'), 'Unresolved report failure: '+name)
    return value, record(path, raw)


def displays(value):
    if isinstance(value, dict):
        if {'models', 'frames', 'maxPaintMs', 'error'} <= value.keys():
            yield value
        for child in value.values():
            yield from displays(child)
    elif isinstance(value, list):
        for child in value:
            yield from displays(child)


def preview_proof(preview, catalog, paint_budget, budget_reason):
    require(preview.get('seeded') is False, 'Preview journey must disclose unseeded native state')
    accepted = preview.get('accepted', [])
    wanted = {'A0ResearchFacility', 'A0PowerGenerator', 'A0CyborgFactory', 'GuardTower1'}
    require(len(accepted) == 4 and {r.get('site', {}).get('itemId') for r in accepted} == wanted, 'Four exact ordinary structure cases incomplete')
    buildings = {r['itemId']:r for r in preview.get('nativeBuildings', [])}
    require(buildings.keys() == wanted, 'Native completion records incomplete')
    job_ids = []
    for case in accepted:
        site, reply, paint = (case.get(k, {}) for k in ('site', 'reply', 'paint'))
        spec = catalog[site['itemId']]
        expected = [(site['x']+(0.5 if spec['width'] % 2 else 0))*128,
                    (site['y']+(0.5 if spec['breadth'] % 2 else 0))*128]
        require(reply.get('ok') is True and reply.get('result', {}).get('workers') == preview.get('expectedWorkerIds'), 'Actual accepted truck group differs')
        require(paint.get('model') is True and paint.get('triangles', 0) > 0 and finite(paint.get('number')), 'Ordinary mesh/site number was not actually painted')
        require(paint.get('validation') == 'accepted' and case.get('expectedWorldCentre') == expected, 'Accepted paint/footprint parity evidence differs')
        native = buildings[site['itemId']]
        require(native.get('position', [])[:2] == expected and native.get('expectedCentre') == expected and native.get('currentBuildPts') == spec['points'], 'Actual native building is incomplete or at the wrong centre')
        if site['itemId'] == 'A0ResearchFacility':
            require(native.get('id') == preview.get('newLabId') and native.get('modules') == 1, 'New Research Facility module did not complete')
        job_ids.append(reply['result']['id'])
    module = preview.get('module', {}).get('reply', {})
    require(module.get('ok') is True and module.get('result', {}).get('itemId') == 'A0ResearchModule1', 'Real mixed Research Module order missing')
    job_ids.append(module['result']['id'])
    require([r.get('id') for r in preview.get('fifo', [])] == job_ids, 'Exact native ordinary/module FIFO completion differs')
    mixed = preview.get('mixed', {}).get('display', {})
    require(any(r.get('itemId') in wanted and r.get('model') and r.get('triangles', 0) > 0 for r in mixed.get('drawn', [])), 'Mixed frame lacks a painted ordinary model')
    require(mixed.get('moduleDrawn') and mixed.get('error') == '', 'Mixed frame lacks actual module paint')
    held = preview.get('held', {})
    require(held.get('holdingEndedBeforePNG') is False and held.get('holdingEndedAfterPNG') is False, 'Neutral-preview capture was not made during the actual hold')
    require(any(r.get('id') == 'preview' and r.get('model') and r.get('validation') == 'pending' and r.get('colour') == '#bac7cc' for r in held.get('display', {}).get('drawn', [])), 'Actual neutral pending mesh preview absent')
    observed = list(displays(preview))
    require(observed and all(r.get('error') == '' for r in observed), 'Caught renderer error in preview evidence')
    require(all(finite(r.get('maxPaintMs')) and r['maxPaintMs'] >= 0 for r in observed), 'Invalid/missing overlay timing')
    final = preview.get('finalDisplay', {})
    terrain = preview.get('finalTerrain', {})
    require(final.get('frames', 0) > 0 and final.get('error') == '' and terrain.get('error') == '', 'Final renderer/terrain errors or no completed paint')
    require(terrain.get('heightQueries', 0) > 0 and terrain.get('heightIndexBuilds', 0) > 0 and terrain.get('heightTriangleTests', 0) > 0, 'Actual indexed height queries were not measured')
    for name in ('maxHeightMs', 'maxHeightIndexMs', 'maxMeshReadMs', 'maxHeightCandidates'):
        require(finite(terrain.get(name)) and terrain[name] >= 0, 'Actual height-index timing/counter missing: '+name)
    held_terrain = held.get('display', {}).get('terrain', {})
    for name in ('gpuBufferReads', 'cpuBufferReads', 'mirroredUploads', 'cpuInvalidations'):
        require(type(terrain.get(name)) is int and terrain[name] >= 0 and type(held_terrain.get(name)) is int and held_terrain[name] >= 0, 'Actual CPU upload-mirror counter missing: '+name)
    require(terrain['mirroredUploads'] > 0 and terrain['cpuBufferReads'] > 0, 'Actual native terrain uploads/CPU reads were not observed')
    require(terrain['gpuBufferReads'] == held_terrain['gpuBufferReads'], 'Additional GPU readback occurred after held preview/native foundation work; inspect the upload path before approving performance')
    require(terrain['cpuInvalidations'] == held_terrain['cpuInvalidations'], 'An unmirrored/unknown native buffer write occurred during the construction journey; inspect it before approval')
    measured = max(r['maxPaintMs'] for r in observed)
    require(measured <= paint_budget, f'Actual overlay peak {measured:.3f}ms exceeds explicitly configured {paint_budget:.3f}ms; inspect the cause, do not silently relax the budget')
    samples = preview.get('monitor', {}).get('samples', [])
    require(len(samples) > 5 and all(r.get('covered') is False and r.get('ended') is False for r in samples), 'Frozen/ended field or no sufficient live samples')
    require(all(r.get('zoom') == samples[0].get('zoom') and r.get('viewport') == samples[0].get('viewport') for r in samples), 'Automatic zoom/viewport changes during preview journey')
    return {'passed': True, 'configuredMaxOverlayPaintMs': paint_budget, 'measuredMaxOverlayPaintMs': measured,
            'budgetReason': budget_reason, 'interpretation': 'Observed exact-APK emulator regression measurement; not a 60 FPS or physical-device performance guarantee',
            'finalDisplay': {k:final.get(k) for k in ('frames', 'paintMs', 'maxPaintMs', 'error')},
            'finalTerrain': {k:terrain.get(k) for k in ('heightIndexBuilds', 'heightQueries', 'heightTriangleTests', 'maxHeightCandidates', 'maxHeightMs', 'maxHeightIndexMs', 'maxMeshReadMs', 'gpuBufferReads', 'cpuBufferReads', 'mirroredUploads', 'cpuInvalidations', 'error')},
            'heldTerrain': {k:held_terrain.get(k) for k in ('gpuBufferReads', 'cpuBufferReads', 'mirroredUploads', 'cpuInvalidations')},
            'postHeldAdditionalGPUReads': terrain['gpuBufferReads']-held_terrain['gpuBufferReads'],
            'observedDisplayReports': len(observed), 'liveMonitorSamples': len(samples)}


def validate_related(reports):
    raised = reports['raised-footprint']
    require(raised.get('preview', {}).get('error') == '' and raised.get('native'), 'Raised-footprint native/paint proof missing')
    dustfall = reports['module-journey'].get('dustfall', {})
    require(dustfall.get('passed') is True and len(dustfall.get('researchNative', [])) == 2 and dustfall.get('powerNative', {}).get('modules') == 1, 'Research/Power Module completion evidence incomplete')
    quickload = dustfall.get('quickload', {})
    require(finite(quickload.get('rewoundClock')) and quickload['rewoundClock'] < quickload.get('preLoadClock', -1)-2000 and len(quickload.get('parents', [])) == 3, 'Genuine native save/load rewind and parent persistence not proven')
    factory = reports['factory-journey'].get('factory', {})
    require(factory.get('passed') is True and factory.get('native', {}).get('modules') == 2 and len(factory.get('fifo', [])) == 2, 'Factory two-level completion/FIFO missing')
    production = factory.get('production', {})
    require(production.get('applicable') is True, 'Normal production was not actually exercised')
    require(production.get('produced', {}).get('id') == production.get('nativeUnit', {}).get('id') and production.get('nativeFactory', {}).get('modules') == 2, 'Actual factory-origin produced unit missing')
    require(production.get('nativeUnit', {}).get('id') not in production.get('beforeIds', []), 'Produced unit already existed before normal production')
    layout = reports['module-layout']
    require({'phone', 'compact-enlarged'} <= {p.get('name') for p in layout.get('profiles', [])}, 'Phone and enlarged compact layout profiles missing')
    mixed = reports['mixed-regression']
    require(len(mixed.get('structures', [])) == 2 and mixed.get('moveTarget') and mixed.get('moved') and mixed.get('afterMove') and len(mixed.get('returns', [])) == 3, 'Selection/construction/movement/return evidence incomplete')
    rounds = reports['paused-returns'].get('rounds', [])
    require(len(rounds) == 2 and all(len(r.get('cases', [])) == 6 for r in rounds), 'Twelve paused menu returns incomplete')
    keyboard = reports['keyboard-returns'].get('keyboardReturns', {})
    require(keyboard.get('phoneLibraryUnchanged') is True and len(keyboard.get('rounds', [])) == 2 and all(r.get('imeDismissed') is True for r in keyboard['rounds']), 'Keyboard/library-preserving returns incomplete')
    quit_report = reports['quit-return']
    require(quit_report.get('newBattle') and finite(quit_report.get('newBattleClock')) and quit_report.get('newBattleInput') and quit_report.get('finalPause'), 'Native Quit/fresh-battle input return incomplete')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--max-overlay-paint-ms', type=float, default=100, help='Explicit emulator regression ceiling, recorded with measured peak; default 100')
    parser.add_argument('--performance-budget-reason', default='Emulator regression ceiling including software GPU mesh readback, spatial-index construction and overlay rendering; not a 60 FPS guarantee')
    parser.add_argument('--supporting', action='append', default=[], help='Diagnostic file/folder relative to qa/test-05, hash-bound but never counted as a pass')
    parser.add_argument('--check-only', action='store_true', help='Validate existing evidence without writing emulator/gate outputs')
    parser.add_argument('--replace', action='store_true', help='Explicitly replace an unreleased emulator/gate aggregate; raw evidence is never edited')
    args = parser.parse_args()
    require(finite(args.max_overlay_paint_ms) and args.max_overlay_paint_ms > 0 and args.performance_budget_reason.strip(), 'Positive explicit timing budget/reason required')
    candidate = digest(args.apk)
    aggregates, input_records = {}, []
    for name in AGGREGATES:
        value, rec = input_report(name, candidate)
        require(value.get('candidateAPK_SHA256') == candidate, 'Aggregate needs top-level exact APK identity: '+name)
        aggregates[name] = value
        input_records.append(rec)
    integrated, integrated_record = input_report('integrated-journey.json', candidate)
    require(integrated.get('current') == 'completed', 'Integrated runner is not complete')
    expected = [(name, folder) for name,folder,_ in PHASES]
    require([(p.get('name'), p.get('folder')) for p in integrated.get('phases', [])] == expected and all(p.get('passed') is True for p in integrated['phases']), 'All nine exact integrated phases must pass in order')
    require(integrated.get('afterIdentity', {}).get('candidateAPK_SHA256') == candidate, 'Final installed identity missing')
    source_reports, sources = {}, []
    for _,folder,file in PHASES:
        value, rec = input_report(folder+'/'+file, candidate)
        source_reports[folder] = value
        sources.append(rec)
    code = aggregates['code-checks.json']
    tests = code.get('tests', [])
    require(REQUIRED_TESTS <= {t.get('name') for t in tests} and all(t.get('passed') is True and t.get('exitCode') == 0 for t in tests), 'Required 26 source checks absent/failed')
    require(all(code.get('checks', {}).get(k) is True for k in helpers['CODE_CHECKS']), 'A required renderer/index code check is missing')
    visual = aggregates['visual-review.json']
    require(visual.get('reviewed') is True and visual.get('checks', {}).get('queuedBlueprintAlignment') is True, 'Manual native green blueprint alignment review is required')
    require(isinstance(visual.get('limitations'), list), 'Visual limitations must be explicitly recorded')
    screenshots = visual.get('screenshots', [])
    require(screenshots and all(s.get('accepted') is True for s in screenshots), 'Manual accepted screenshot list missing')
    for entry in screenshots:
        p = local(entry['path'])
        require(p.is_relative_to(QA) and p.suffix.lower() == '.png' and p.read_bytes().startswith(b'\x89PNG\r\n\x1a\n') and digest(p) == entry['sha256'], 'Reviewed screenshot missing/changed')
    native = aggregates['native-build-verification.json']
    require(native.get('sourceBuild') is True and native.get('scopeVerified') is True, 'Native source build/scope not verified')
    probe, probe_record = input_report('native/native-preview-probe.json', candidate, exact=False)
    require(native.get('nativeGeometryProbe') == probe, 'Native build review does not bind the actual geometry probe')
    require(probe.get('ordinaryCases') == 1932 and probe.get('catalogueTypes') == 161 and probe.get('afterMismatch') == 0 and probe.get('orderMutations') == 0 and probe.get('heightChanges') == 0 and probe.get('moduleParentUnchanged') is True and probe.get('lineBuildUnchanged') is True, 'Native alignment/source probe incomplete')
    catalog = {r['id']:r for r in json.loads((ROOT/'app/src/main/assets/warzone/command-catalog.json').read_text())['buildings']}
    preview = source_reports['preview-journey']
    performance = preview_proof(preview, catalog, args.max_overlay_paint_ms, args.performance_budget_reason)
    validate_related(source_reports)
    package = aggregates['package-verification.json']
    require(package.get('version') == '0.5' and package.get('package') == 'com.rbabbit.warzonetowers.lab' and package.get('sourceBuiltNativePreviewCorrection') is True, 'Package report identity/scope differs')
    for entry in package['sourceFiles']+package['scenarioSourceFiles']+package['nativeSourceFiles']:
        require(digest(local(entry['path'])) == entry['sha256'], 'Source changed after package verification: '+entry['path'])
    # These names correspond to the concrete proofs above and the nine fixed
    # passing phases. A future gate must not silently approve an unknown check.
    checks = {name:True for name in (
        'queuedBlueprintAlignment', 'evenFootprints', 'oddFootprints',
        'ordinaryConstruction', 'moduleConstruction', 'mixedQueues',
        'selectionAndMovement', 'normalProduction', 'saveLoad',
        'inputReturns', 'layout', 'previewPerformance',
    )}
    require(helpers['EMULATOR_CHECKS'] <= checks.keys(), 'New emulator check has no evidence mapping in this finalizer')
    limitations = visual['limitations']
    emulator = {'passed': True, 'emulatorTesting': True, 'gameplayTesting': True,
                'candidateAPK_SHA256': candidate, 'installedAPK_SHA256': candidate,
                'package': 'com.rbabbit.warzonetowers.lab', 'version': '0.5',
                'scope': 'Audited ordinary/module preview rendering and native queued alignment, parity-correct construction, queues, selection/movement, normal production, native save/load and input/layout returns',
                'checks': checks, 'performance': performance, 'integratedJourney': integrated_record,
                'sourceReports': sources, 'nativeGeometryProbe': {'sourceReport':probe_record, 'ordinaryCases':probe['ordinaryCases'], 'afterMismatch':probe['afterMismatch'], 'method':probe['method']},
                'fixtureDisclosure': {'previewMethod':preview.get('method'), 'preparedSaveRequested':preview.get('preparedSaveRequested', False), 'preparedTruckCount':preview.get('preparedTruckCount'), 'preparedSaveSource':preview.get('preparedSave', {}).get('source'), 'mixedSelectionScope':source_reports['mixed-regression'].get('scope')},
                'limitations': limitations, 'recordedUTC':datetime.now(timezone.utc).isoformat()}
    emulator_path = QA/'emulator-verification.json'
    gate_path = QA/'DELIVERY.json'
    emulator_bytes = json_text(emulator).encode('utf-8')
    normalized = input_records+[record(emulator_path, emulator_bytes)]
    supporting = sources+[integrated_record, probe_record]
    used = {e['path'] for e in normalized+supporting}
    for name in args.supporting:
        path = (QA/name).resolve()
        require(path.is_relative_to(QA) and path.exists(), 'Supporting path missing/external: '+name)
        paths = sorted(p for p in path.rglob('*') if p.is_file()) if path.is_dir() else [path]
        for p in paths:
            require(p != gate_path, 'DELIVERY.json cannot be its own supporting evidence')
            rec = record(p)
            if rec['path'] in used:
                continue
            supporting.append(rec)
            used.add(rec['path'])
    gate = {'passed': True, 'emulatorTesting': True, 'gameplayTesting': True, 'visualReview': True,
            'candidateAPK_SHA256':candidate, 'package':package['package'], 'label':package['label'], 'version':'0.5',
            'scope':emulator['scope'], 'checks':checks, 'reports':normalized, 'sourceReports':sources,
            'supportingReports':supporting,
            'supportingInterpretation':'The nine passing raw gameplay reports are hash-bound source evidence referenced by emulator-verification; only the six normalized aggregates are required gate reports. Diagnostic/superseded files added with --supporting are never interpreted as passes.',
            'limitations':limitations, 'recordedUTC':datetime.now(timezone.utc).isoformat()}
    # Detect evidence changing during aggregation before creating either output.
    for entry in input_records+sources+[integrated_record, probe_record]:
        require(digest(local(entry['path'])) == entry['sha256'], 'Evidence changed during aggregation: '+entry['path'])
    require(digest(args.apk) == candidate, 'Candidate changed during aggregation')
    if not args.check_only:
        require(args.replace or not emulator_path.exists() and not gate_path.exists(), 'Unreleased aggregates already exist; use --replace explicitly after review')
        emulator_path.write_bytes(emulator_bytes)
        gate_path.write_text(json_text(gate), encoding='utf-8')
    print(json.dumps({'passed': True, 'checkOnly':args.check_only, 'candidateAPK_SHA256':candidate,
                      'integratedPhases':len(PHASES), 'requiredAggregateReports':len(normalized),
                      'sourceReports':len(sources), 'measuredMaxOverlayPaintMs':performance['measuredMaxOverlayPaintMs'],
                      'configuredMaxOverlayPaintMs':args.max_overlay_paint_ms}, indent=2))


if __name__ == '__main__':
    main()
