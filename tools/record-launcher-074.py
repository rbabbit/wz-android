"""Record actual passed v0.74 host layout checks and an exact successful APK build.

Run after the Home/FFA fixtures and final Gradle build. This script does not run
tests, build an APK, operate a device or verify Android rendering/gameplay.
Existing verification records and historical evidence are never overwritten.
"""
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile
import argparse
import json
import re
import runpy
import subprocess

ROOT = Path(__file__).resolve().parents[1]
P = runpy.run_path(str(ROOT / 'tools/package-launcher-074.py'), run_name='launcher074_record_helpers')
digest, require, pin, repository_path = (P[name] for name in
    ('digest', 'require', 'pin', 'repository_path'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--build-log', default='qa/launcher-074/build.log')
    parser.add_argument('--output', type=Path, default=ROOT / 'qa/launcher-074/verification.json')
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    apk = args.apk.resolve()
    require(apk.is_file() and digest(apk) == expected, 'The exact built APK is missing or changed')
    log = repository_path(args.build_log)
    require('BUILD SUCCESSFUL' in log.read_text(encoding='utf-8-sig', errors='replace'),
        'A successful final Gradle build log is required')
    gradle = (ROOT / P['GRADLE']).read_text(encoding='utf-8')
    require(gradle.count('versionCode = 74') == gradle.count('versionName = "0.74"') == 1,
        'Current source is not unambiguously v0.74')
    aapt, _, _ = P['H']['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'",
        "versionCode='74'", "versionName='0.74'", "application-label:'Warzone Towers'")),
        'The built APK is not the v0.74 delivery application')
    with ZipFile(apk) as archive:
        require(any(re.fullmatch(r'classes(?:\d+)?\.dex', name) for name in archive.namelist()),
            'Built APK has no Java bytecode')

    fixture = P['validate_layout_evidence']()
    names = {path.relative_to(ROOT).as_posix() for path in (ROOT / 'app/src').rglob('*') if path.is_file()}
    names |= {P['GRADLE'], P['TOOL'], P['RECORDER']} | P['focused_sources']() | set(fixture['checkedSourcePaths'])
    checks = {name: fixture['coverage'][name] for name in P['REQUIRED_CHECKS'] if name != 'successfulBuild'}
    checks['successfulBuild'] = True
    proof = dict(version='0.74', recordedUTC=datetime.now(timezone.utc).isoformat(), candidateAPK_SHA256=expected,
        candidateAPKBytes=apk.stat().st_size, passed=True, emulatorUsed=False, emulatorOmittedAtUserRequest=True,
        actualAndroidViewsExecuted=False, androidGameplayVerified=False,
        offlineHostChecksPassed=True, buildChecksPassed=True,
        verificationScope='Actual pure Java Home/FFA layout helpers and host text/geometry/control fixtures, current native view source checks, and the exact successful APK build. No browser stand-in is treated as an Android screen.',
        limitations=['No emulator tests were run, as requested.',
            'Host Java geometry and text fixtures do not verify actual Android view rendering, system insets, font rasterisation, physical touch, navigation or gameplay on a device.'],
        checks=checks, buildLog=pin(log), offlineFixtureEvidence=[fixture['evidence']],
        assertionCounts=dict(hostLayout=fixture['assertions']),
        sources=[pin(repository_path(name)) for name in sorted(names)])
    output = (args.output if args.output.is_absolute() else ROOT / args.output).resolve()
    require(output.is_relative_to(ROOT) and not output.exists(),
        'Refusing an outside-repository or existing verification output')
    require(digest(apk) == expected, 'Built APK changed while verification was recorded')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(recorded=str(output), candidateAPK_SHA256=expected, checkedSourceFiles=len(names),
        emulatorUsed=False, actualAndroidViewsExecuted=False, androidGameplayVerified=False)))


if __name__ == '__main__':
    main()
