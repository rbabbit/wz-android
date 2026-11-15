"""Record already-observed exact-APK v0.79 private-room emulator evidence.

This recorder does not build, run an emulator, send chat or create observations.
It validates the caller's pinned real evidence and current offline/native checks.
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
P = runpy.run_path(str(ROOT / 'tools/package-multiplayer-room-079.py'), run_name='room079_record_helpers')
digest, require, pin, repository_path = (P[name] for name in ('digest', 'require', 'pin', 'repository_path'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--build-log', default='qa/multiplayer-room-079/build.log')
    parser.add_argument('--emulator-proof', default='qa/multiplayer-room-079/emulator.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'qa/multiplayer-room-079/verification.json')
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    apk = args.apk.resolve()
    require(apk.is_file() and digest(apk) == expected, 'Exact tested APK missing/changed')
    log = repository_path(args.build_log)
    require('BUILD SUCCESSFUL' in log.read_text(encoding='utf-8-sig', errors='replace'), 'Successful build log missing')
    emulator_path = repository_path(args.emulator_proof)
    observed, _ = P['validate_emulator_proof'](emulator_path, expected)
    fixture = P['validate_fixtures']()
    gradle = (ROOT / P['GRADLE']).read_text(encoding='utf-8')
    require(gradle.count('versionCode = 79') == gradle.count('versionName = "0.79"') == 1,
        'Current source is not v0.79')
    aapt, _, _ = P['H']['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'",
        "versionCode='79'", "versionName='0.79'", "application-label:'Warzone Towers'")), 'Wrong APK identity/version')
    with ZipFile(apk) as archive:
        for name in P['ALLOWED_SOURCE_CHANGES']:
            if name.startswith(P['ASSETS']):
                require(P['zip_digest'](archive, 'assets/' + name[len(P['ASSETS']):]) == digest(ROOT / name),
                    'APK does not contain checked room source: ' + name)
    names = {path.relative_to(ROOT).as_posix() for path in (ROOT / 'app/src').rglob('*') if path.is_file()}
    names |= {path.relative_to(ROOT).as_posix() for path in (ROOT / P['NATIVE']).rglob('*') if path.is_file()}
    names |= {P['GRADLE'], P['TOOL'], P['RECORDER']} | P['FOCUSED_CHECKS'] | P['NATIVE_TOOLS'] | P['EMULATOR_TOOLS'] | set(fixture['checkedSourcePaths'])
    proof = dict(version='0.79', passed=True, recordedUTC=datetime.now(timezone.utc).isoformat(),
        candidateAPK_SHA256=expected, candidateAPKBytes=apk.stat().st_size,
        emulatorUsed=True, exactInstalledAPKVerified=True, actualAndroidViewsExecuted=True,
        verificationScope=observed['verificationScope'], limitations=observed['limitations'],
        checks=observed['checks'], buildLog=pin(log), emulatorProof=pin(emulator_path),
        offlineFixtureEvidence=fixture['evidence'], renderedScreenshots=fixture['screenshots'],
        assertionCounts=fixture['assertionCounts'], sources=[pin(repository_path(name)) for name in sorted(names)])
    output = (args.output if args.output.is_absolute() else ROOT / args.output).resolve()
    require(output.is_relative_to(ROOT) and not output.exists(), 'Refusing outside/existing verification output')
    require(digest(apk) == expected, 'APK changed while evidence was recorded')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(recorded=str(output), candidateAPK_SHA256=expected,
        pinnedSourceFiles=len(names), emulatorUsed=True, observedChecks=observed['checks'])))


if __name__ == '__main__':
    main()
