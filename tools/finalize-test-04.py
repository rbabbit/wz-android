"""Aggregate exact 0.4 module gameplay, visual, code, package and integrity evidence."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
common = runpy.run_path(str(ROOT/'tools/package-test-04.py'), run_name='release_helpers')
QA, CHECKS, REQUIRED = (common[n] for n in ('QA', 'CHECKS', 'REQUIRED'))
read, digest, require, local = (common[n] for n in ('read', 'digest', 'require', 'local'))
identities = runpy.run_path(str(ROOT/'tools/finalize-test-02.py'), run_name='identity_helpers')['identities']
REQUIRED_TESTS = {
    'test-visible-trucks.cjs', 'test-smooth-building.cjs', 'test-command-bridge.cjs', 'test-command-pages.cjs',
    'test-terrain-picker.cjs', 'test-build-display.cjs', 'test-html-return.cjs', 'test-html-page-return.cjs',
    'test-test-lifecycle.cjs', 'test-html-input-modes.cjs', 'test-towers-camera.cjs', 'test-touch-zoom.cjs',
    'test-research-queue-bridge.cjs', 'test-html-design.cjs', 'test-production-removal.cjs', 'test-tower-defense.cjs',
    'test-native-build-navigation.cjs', 'test-fresh-selection-state.cjs', 'test-native-box-input.cjs', 'test-selection-cache.cjs',
    'test-module-targets.cjs', 'test-module-placement.cjs', 'test-module-target-display.cjs',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--report', action='append', default=[], help='Additional required passed report relative to qa/test-04')
    parser.add_argument('--supporting', action='append', default=[], help='Diagnostic file, not interpreted as a pass')
    args = parser.parse_args()
    candidate, records, reports = digest(args.apk), [], {}
    for name in dict.fromkeys(sorted(REQUIRED)+args.report):
        path = (QA/name).resolve()
        require(path.is_relative_to(QA) and path.is_file(), 'Missing or external required report: '+name)
        result = read(path)
        require(result.get('passed') is True, 'Required report did not pass: '+name)
        identities(result, candidate, name)
        reports[name] = result
        records.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)})
    emulator, package, visual, integrity = (reports[n] for n in ('emulator-verification.json', 'package-verification.json', 'visual-review.json', 'final-integrity.json'))
    require(all(emulator.get(k) is True for k in ('emulatorTesting', 'gameplayTesting')), 'Actual emulator/gameplay evidence is required')
    require(emulator.get('candidateAPK_SHA256') == candidate == emulator.get('installedAPK_SHA256'), 'Emulator APK identity is not exact')
    require(all(emulator.get('checks', {}).get(k) is True for k in CHECKS), 'Required module UI/gameplay checks are incomplete')
    require(package.get('candidateAPK_SHA256') == candidate and package.get('version') == '0.4' and package.get('label') == 'Warzone Towers', 'Wrong package identity')
    require((visual.get('candidateAPK_SHA256') or visual.get('identity', {}).get('candidateAPK_SHA256')) == candidate, 'Visual review does not identify the exact APK')
    require(all(integrity.get(k) is True for k in ('stablePreferencesUnchanged', 'stableSourceAndAPKUnchanged', 'fallbacksPreserved', 'bothAppsInstalled')), 'Stable/fallback preservation is incomplete')
    tests = reports['code-checks.json'].get('tests', [])
    require(REQUIRED_TESTS <= {t.get('name') for t in tests} and all(t.get('passed') is True and t.get('exitCode') == 0 for t in tests), 'Required source regressions are absent or failed')
    for entry in package['sourceFiles']+package['scenarioSourceFiles']:
        require(digest(local(entry['path'])) == entry['sha256'], 'Runtime source changed after APK check')
    supporting = []
    for name in args.supporting:
        path = (QA/name).resolve()
        require(path.is_relative_to(QA) and path.is_file() and name not in reports, 'Invalid supporting diagnostic')
        supporting.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)})
    gate = {'passed': True, 'emulatorTesting': True, 'gameplayTesting': True, 'visualReview': True,
            'candidateAPK_SHA256': candidate, 'package': package['package'], 'label': package['label'], 'version': package['version'],
            'scope': 'Audited module guidance/targeting/feedback/repeated placement and native completion, ordinary construction, save/load, returns and layout on the exact installed APK',
            'checks': emulator['checks'], 'reports': records, 'supportingReports': supporting,
            'limits': emulator.get('limits', []), 'recordedUTC': datetime.now(timezone.utc).isoformat()}
    (QA/'DELIVERY.json').write_text(json.dumps(gate, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'candidateAPK_SHA256': candidate, 'requiredReports': len(records)}, indent=2))


if __name__ == '__main__':
    main()
