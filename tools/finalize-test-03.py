"""Finalize only the scoped module-fix reports; never reuse Test 02 gameplay passes."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
common = runpy.run_path(str(ROOT/'tools/package-test-03.py'), run_name='release_helpers')
QA, CHECKS = common['QA'], common['CHECKS']
read, digest, require, local = (common[n] for n in ('read', 'digest', 'require', 'local'))
identities = runpy.run_path(str(ROOT/'tools/finalize-test-02.py'), run_name='identity_helpers')['identities']
REQUIRED = ['package-verification.json', 'code-checks.json', 'emulator-verification.json', 'final-integrity.json']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT/'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--report', action='append', default=[], help='Additional required passed report relative to qa/test-03')
    parser.add_argument('--supporting', action='append', default=[], help='Diagnostic file relative to qa/test-03; not interpreted as a pass')
    args = parser.parse_args()
    candidate = digest(args.apk)
    records = []
    reports = {}
    for name in dict.fromkeys(REQUIRED+args.report):
        path = (QA/name).resolve();require(path.is_relative_to(QA) and path.is_file(), 'Missing or external report: '+name)
        result = read(path);require(result.get('passed') is True, 'Required report did not pass: '+name)
        identities(result, candidate, name)
        reports[name] = result;records.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)})
    emulator, package = reports['emulator-verification.json'], reports['package-verification.json']
    require(all(emulator.get(k) is True for k in ('emulatorTesting', 'gameplayTesting')), 'Actual emulator/gameplay evidence is required')
    require(emulator.get('candidateAPK_SHA256') == candidate == emulator.get('installedAPK_SHA256'), 'Emulator APK identity is not exact')
    require(all(emulator.get('checks', {}).get(k) is True for k in CHECKS), 'Scoped module/ordinary-construction/return/branding checks are incomplete')
    require(package.get('candidateAPK_SHA256') == candidate and package.get('version') == '0.3' and package.get('label') == 'Warzone Towers', 'Wrong package identity')
    tests = reports['code-checks.json'].get('tests', [])
    require(bool(tests) and all(t.get('passed') is True and t.get('exitCode') == 0 for t in tests), 'Source regression evidence is absent or failed')
    for entry in package['sourceFiles']+package['scenarioSourceFiles']:
        require(digest(local(entry['path'])) == entry['sha256'], 'Runtime source changed after APK check')
    supporting = []
    for name in args.supporting:
        path = (QA/name).resolve();require(path.is_relative_to(QA) and path.is_file(), 'Invalid supporting file')
        supporting.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': digest(path)})
    gate = {'passed': True, 'emulatorTesting': True, 'gameplayTesting': True, 'candidateAPK_SHA256': candidate,
            'package': package['package'], 'label': package['label'], 'version': package['version'],
            'scope': 'Focused module selection/completion, ordinary construction, visible trucks, returns and wording on the exact installed APK',
            'checks': emulator['checks'], 'reports': records, 'supportingReports': supporting,
            'limits': emulator.get('limits', []), 'recordedUTC': datetime.now(timezone.utc).isoformat()}
    (QA/'DELIVERY.json').write_text(json.dumps(gate, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'candidateAPK_SHA256': candidate, 'requiredReports': len(records)}, indent=2))


if __name__ == '__main__':
    main()
