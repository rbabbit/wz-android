"""Record existing passed v0.73 offline evidence; never run builds or a device.

Run only after both focused tests and the final APK build finish. The output
records their actual evidence, exact source hashes and APK hash, not Android
gameplay verification. Historical evidence and existing outputs are not replaced.
"""
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile
import argparse
import json
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
P = runpy.run_path(str(ROOT / 'tools/package-research-status-073.py'), run_name='research073_record_helpers')
digest, require, pin, repository_path, read_json = (P[name] for name in
    ('digest', 'require', 'pin', 'repository_path', 'read_json'))


def checked_sources(proof, label):
    rows = proof.get('sources')
    require(isinstance(rows, list) and rows, label + ' has no checked source pins')
    names = set()
    for row in rows:
        require(isinstance(row, dict) and isinstance(row.get('path'), str), label + ' has an invalid source pin')
        path = repository_path(row['path'])
        require(digest(path) == row.get('sha256'), label + ' is stale for ' + row['path'])
        names.add(path.relative_to(ROOT).as_posix())
    return names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--build-log', default='qa/research-status-073/build.log')
    parser.add_argument('--output', type=Path, default=ROOT / 'qa/research-status-073/verification.json')
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    apk = args.apk.resolve()
    require(apk.is_file() and digest(apk) == expected, 'The exact built APK is missing or changed')
    log_path = repository_path(args.build_log)
    require('BUILD SUCCESSFUL' in log_path.read_text(encoding='utf-8-sig', errors='replace'), 'Final build did not succeed')
    gradle = (ROOT / P['GRADLE']).read_text(encoding='utf-8')
    require('versionCode = 73' in gradle and 'versionName = "0.73"' in gradle, 'Current source is not v0.73')
    with ZipFile(apk) as archive:
        for name in P['ALLOWED_SOURCE_CHANGES']:
            require(P['zip_digest'](archive, 'assets/' + name[len(P['ASSETS']):]) == digest(ROOT / name),
                'Built APK does not contain the checked research source: ' + name)

    host_path = repository_path('qa/research-status-073/checks.json')
    browser_path = repository_path('qa/research-073/browser.json')
    host, browser = read_json(host_path), read_json(browser_path)
    require(host.get('version') == '0.73' and host.get('passed') is True
        and host.get('emulatorUsed') is False and host.get('actualNativeEngineExecuted') is False,
        'Host research fixture is missing, failed or claims a different verification scope')
    host_checks = host.get('checks')
    require(isinstance(host_checks, list) and host_checks
        and host.get('checksPassed') == len(host_checks)
        and all(isinstance(value, str) and value.strip() for value in host_checks),
        'Host fixture has no complete passed assertion inventory')
    host_sources = checked_sources(host, 'Host fixture')
    require({'app/src/main/assets/warzone-mobile-research.js', 'tools/test-research-status-073.cjs'} <= host_sources,
        'Host fixture lacks renderer/test pins')
    require(browser.get('passed') is True and browser.get('emulatorUsed') is False
        and browser.get('engineExecuted') is False and not browser.get('fatal')
        and browser.get('exceptions') == [] and browser.get('badRequests') == [],
        'Actual host-browser research fixture is missing or failed')
    browser_sources = checked_sources(browser, 'Browser fixture')
    require(P['ALLOWED_SOURCE_CHANGES'] <= browser_sources, 'Browser fixture lacks renderer/theme pins')
    results = browser.get('results', [])
    expected_cases = {(mode, size) for mode in ('towers', 'campaign', 'ffa', 'multiplayer')
        for size in ((1164, 554), (800, 360), (640, 320))}
    actual_cases = {(row.get('mode'), tuple(row.get('viewport', []))) for row in results}
    require(browser.get('modeViewports') == len(results) == len(expected_cases) and actual_cases == expected_cases,
        'Browser evidence does not cover all four modes at the checked viewport sizes')
    require(all(row.get('passed') is True and row.get('knownCards') == 6 and row.get('labs') == 5
        and row.get('assignedTapsDoNotQueue') is True and row.get('whiteOnlyPendingReady') is True
        and row.get('unknownMetadataHandled') is True for row in results),
        'Browser state/selection/artwork/layout assertions are incomplete')

    names = {path.relative_to(ROOT).as_posix() for path in (ROOT / 'app/src').rglob('*') if path.is_file()}
    names |= {P['GRADLE'], P['TOOL'], 'tools/record-research-status-073.py'} | P['FOCUSED_CHECKS']
    proof = dict(version='0.73', recordedUTC=datetime.now(timezone.utc).isoformat(), candidateAPK_SHA256=expected,
        candidateAPKBytes=apk.stat().st_size, passed=True, emulatorUsed=False, emulatorOmittedAtUserRequest=True,
        androidGameplayVerified=False, offlineHostChecksPassed=True, buildChecksPassed=True,
        verificationScope='Actual shared Research renderer/function checks and host Chromium CSS/art/DOM checks in Towers, Campaign, FFA and Multiplayer; synthetic BNTECH/BNQUEUE native inputs; successful exact-APK build.',
        limitations=['No emulator or Android gameplay tests were run, as requested.',
            'Native engine behavior, real research timing/unlocks, Android touch handling and multiplayer runtime behavior were not verified by these synthetic host fixtures.'],
        checks={name: True for name in P['REQUIRED_CHECKS']}, buildLog=pin(log_path),
        offlineFixtureEvidence=[pin(host_path), pin(browser_path)],
        assertionCounts=dict(host=len(host_checks), browserModeViewports=len(results)),
        sources=[pin(repository_path(name)) for name in sorted(names)])
    output = (args.output if args.output.is_absolute() else ROOT / args.output).resolve()
    require(output.is_relative_to(ROOT) and not output.exists(), 'Refusing outside-repository or existing verification output')
    require(digest(apk) == expected, 'Built APK changed while verification was recorded')
    output.parent.mkdir(parents=True, exist_ok=True)
    # The packager independently repeats the pins/evidence gates before delivery.
    output.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(recorded=str(output), candidateAPK_SHA256=expected, checkedSourceFiles=len(names),
        emulatorUsed=False, androidGameplayVerified=False)))


if __name__ == '__main__':
    main()
