"""Record passed v0.77 Manufacturing/Queue host/browser evidence and an exact successful build.

Run only after the focused fixtures and final Gradle build finish. Never build,
operate a device, replace historical proof or claim Android gameplay/rendering.
The packager independently validates preservation, signing and every APK asset.
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
P = runpy.run_path(str(ROOT / 'tools/package-manufacturing-clean-077.py'), run_name='manufacturing077_record_helpers')
digest, require, pin, repository_path = (P[name] for name in
    ('digest', 'require', 'pin', 'repository_path'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--build-log', default='qa/manufacturing-clean-077/build.log')
    parser.add_argument('--output', type=Path, default=ROOT / 'qa/manufacturing-clean-077/verification.json')
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected), 'Invalid expected APK SHA256')
    apk = args.apk.resolve()
    require(apk.is_file() and digest(apk) == expected, 'The exact built APK is missing or changed')
    log = repository_path(args.build_log)
    require('BUILD SUCCESSFUL' in log.read_text(encoding='utf-8-sig', errors='replace'),
        'A successful final Gradle build log is required')
    gradle = (ROOT / P['GRADLE']).read_text(encoding='utf-8')
    require(gradle.count('versionCode = 77') == gradle.count('versionName = "0.77"') == 1,
        'Current source is not unambiguously v0.77')
    aapt, _, _ = P['H']['sdk_paths']()
    badging = subprocess.check_output([str(aapt), 'dump', 'badging', str(apk)], text=True, encoding='utf-8')
    require(all(value in badging for value in ("package: name='com.rbabbit.warzonetowers.lab'",
        "versionCode='77'", "versionName='0.77'", "application-label:'Warzone Towers'")),
        'The built APK is not the v0.77 delivery application')
    with ZipFile(apk) as archive:
        for name in P['ALLOWED_SOURCE_CHANGES']:
            if not name.startswith(P['ASSETS']):
                continue
            require(P['zip_digest'](archive, 'assets/' + name[len(P['ASSETS']):]) == digest(ROOT / name),
                'Built APK does not contain the checked Manufacturing/Queue source: ' + name)

    fixture = P['validate_fixtures']()
    baseline, _ = P['baseline_paths']()
    payloads = P['validate_payloads'](baseline)
    names = {path.relative_to(ROOT).as_posix() for path in (ROOT / 'app/src').rglob('*') if path.is_file()}
    names |= {P['GRADLE'], P['TOOL'], P['RECORDER']} | P['focused_sources']() | P['REPRO_TOOLS'] | P['BACKEND_SOURCE_CHANGES'] | set(fixture['checkedSourcePaths'])
    proof = dict(version='0.77', recordedUTC=datetime.now(timezone.utc).isoformat(), candidateAPK_SHA256=expected,
        candidateAPKBytes=apk.stat().st_size, passed=True, emulatorUsed=False, emulatorOmittedAtUserRequest=True,
        actualAndroidViewsExecuted=False, androidGameplayVerified=False,
        offlineHostChecksPassed=True, buildChecksPassed=True,
        verificationScope='Authoritative Manufacturing/Queue command handlers on host native-API fixtures and actual shared UI in host Chromium for Towers, Campaign, FFA and Multiplayer, using synthetic native events; independent append-only VFS/program preservation checks and successful exact-APK build.',
        limitations=['No emulator tests were run, as requested.',
            'Host browser/native-API fixtures do not verify Android WebView rendering, physical touch, real production timing/unit creation, multiplayer runtime behavior or gameplay.'],
        checks={name: True for name in P['REQUIRED_CHECKS']}, buildLog=pin(log),
        offlineFixtureEvidence=fixture['evidence'], renderedScreenshots=fixture['screenshots'],
        assertionCounts=fixture['assertionCounts'], commandPayloadPreservation=payloads,
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
