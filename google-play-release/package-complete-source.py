"""Prepare the 0.87 Play source overlay, then package only after final authorization."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import argparse
import json
import os
import shutil
import subprocess
import sys
import uuid
import zipfile

VERSION = '0.87'
VERSION_CODE = 87
BASELINE_SHA = 'b85989860085d238e25fbcaf7eab95dbf610ab366d2d061f97903411b6758321'
BASELINE_MEMBERS = 13991
OVERRIDES = [
    'AGENTS.md',
    'app/build.gradle.kts',
    'app/src/main/AndroidManifest.xml',
    'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',
    'app/src/main/java/com/rbabbit/blocknight/warzone/HomeModesView.java',
    'app/src/main/java/com/rbabbit/blocknight/warzone/MultiplayerActivity.java',
    'app/src/playRelease/AndroidManifest.xml',
    'app/src/playRelease/java/com/rbabbit/blocknight/warzone/AppUpdateController.java',
    'tools/build-play-release.py',
]

def digest_file(path, limit=None):
    h = sha256()
    with Path(path).open('rb') as source:
        remaining = limit
        while remaining is None or remaining:
            block = source.read(8 * 1024 * 1024 if remaining is None else min(remaining, 8 * 1024 * 1024))
            if not block:
                break
            h.update(block)
            if remaining is not None:
                remaining -= len(block)
        if remaining is not None and remaining:
            raise ValueError('Input ended before requested ZIP prefix')
    return h.hexdigest()

def atomic_bytes(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.new-' + uuid.uuid4().hex)
    temporary.write_bytes(data)
    os.replace(temporary, path)

def write_json(path, value):
    atomic_bytes(path, (json.dumps(value, indent=2) + '\n').encode('utf-8'))

def prepare(candidate, baseline, validation=None):
    assert digest_file(baseline) == BASELINE_SHA, 'Complete baseline source ZIP hash changed'
    overlay = candidate / 'source-overlay' / 'google-play-release'
    overlay.mkdir(parents=True, exist_ok=True)
    rows = []
    with zipfile.ZipFile(baseline) as original:
        entries = original.infolist()
        names = [entry.filename for entry in entries]
        assert len(names) == BASELINE_MEMBERS and len(set(names)) == len(names)
        assert not any(name.startswith('google-play-release/') for name in names)
        assert not any(name.lower().endswith(('.jks', '.keystore', '.p12', '.pfx')) for name in names)
        for name in OVERRIDES:
            current = candidate / name
            assert current.is_file(), 'Missing candidate input: ' + name
            data = current.read_bytes()
            previous = original.read(name) if name in names else None
            rows.append({'path': name,
                         'baselineSHA256': sha256(previous).hexdigest() if previous is not None else None,
                         'playSHA256': sha256(data).hexdigest()})
            atomic_bytes(overlay / 'overrides' / name, data)
        baseline_start_dir = original.start_dir
    manifest = {'schemaVersion': 1, 'versionName': VERSION, 'versionCode': VERSION_CODE,
                'completeBaselineArchive': baseline.name, 'completeBaselineSHA256': BASELINE_SHA,
                'completeBaselineMembers': BASELINE_MEMBERS, 'files': rows}
    write_json(overlay / 'overlay-manifest.json', manifest)
    prepare_source = '''"""Apply the guarded Play overlay to a freshly extracted complete source snapshot."""
from pathlib import Path
from hashlib import sha256
import argparse, json, shutil, subprocess, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply-only', action='store_true')
    args, build_args = parser.parse_known_args()
    manifest = json.loads((HERE/'overlay-manifest.json').read_text(encoding='utf-8'))
    for row in manifest['files']:
        source = HERE/'overrides'/row['path']
        destination = ROOT/row['path']
        if not destination.resolve().is_relative_to(ROOT.resolve()):
            raise SystemExit('Invalid overlay path')
        if sha256(source.read_bytes()).hexdigest() != row['playSHA256']:
            raise SystemExit('Overlay content differs: '+row['path'])
        current = sha256(destination.read_bytes()).hexdigest() if destination.is_file() else None
        if current not in (row['baselineSHA256'], row['playSHA256']):
            raise SystemExit('Preserve local edits before applying overlay: '+row['path'])
    for row in manifest['files']:
        destination = ROOT/row['path']
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(HERE/'overrides'/row['path'], destination)
    print('Applied the verified Google Play source profile.')
    if not args.apply_only:
        raise SystemExit(subprocess.run([sys.executable, str(ROOT/'tools/build-play-release.py'), *build_args], cwd=ROOT).returncode)

if __name__ == '__main__':
    main()
'''
    atomic_bytes(overlay / 'prepare-and-build.py', prepare_source.encode('utf-8'))
    readme = '''# Complete Warzone Towers 0.87 Google Play source

The ZIP retains every one of the 13,991 files from the complete 0.86 source
snapshot, including game engines, assets, build tools and retained history.
The baseline files at the archive root are intentionally unchanged. This
google-play-release directory adds the exact 0.87 Play source changes.

Extract the entire ZIP into a NEW directory. To prepare and build version
0.87 (version code 87), run from the extracted archive root:

    python google-play-release/prepare-and-build.py --keystore PATH_TO_PRIVATE_KEY --alias KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK

The wrapper checks baseline and override hashes before changing any file. It
refuses to overwrite unrelated edits. Add --apply-only to prepare the source
without building. Running Gradle directly before applying this overlay builds
the retained baseline, rather than this 0.87 Play release.

The build uses the existing publisher/upload key, a 4 GB Java heap and cached
dependencies. Keep the keystore outside the extracted project. Passwords are
prompted without echo, or may be supplied through private process environment
variables WZ_RELEASE_STORE_PASSWORD and WZ_RELEASE_KEY_PASSWORD. No signing key
or password is included in this archive. Add --online only if dependencies
are missing. Normal outputs are app/build/outputs/apk/release/app-release.apk
and app/build/outputs/bundle/release/app-release.aab.

The default Play build retains publisher ad configuration. Use --test-ads only
for a separately marked development build, not to reproduce delivery hashes.
The APK is for direct installation/testing; the AAB is for Play Console upload.

0.87 adds Android 13+ notification consent for the live multiplayer foreground
service. Consent is requested once on first Multiplayer entry, denial does not
block joining or cause repeated prompts, and granting refreshes any active
session notification. Existing session start/background/leave logic remains.
The Play profile excludes the external APK updater and installer permission,
shows the installed version without Check for updates, and disables release
application/WebView debugging. All bundled game assets remain unchanged.

Read RELEASE-NOTES.md and VALIDATION.json for the exact delivery verification
and its limits. SOURCE-PROVENANCE.json records the preserved baseline and source
overlay. The source archive checksum is recorded externally to avoid embedding
the checksum of a ZIP inside itself. No website/VPS/Git changes or Play upload
are performed by this source archive.
'''
    atomic_bytes(overlay / 'README.md', readme.encode('utf-8'))
    notes = '''# Warzone Towers 0.87 - Google Play notification permission fix

Application ID: com.rbabbit.warzonetowers.lab
Version: 0.87 / code 87; minimum SDK 26; target SDK 36.

Changes are limited to Android notification permission declaration, contextual
one-time Multiplayer consent, active-notification refresh after grant, release
version and these source/release records. The existing specialUse multiplayer
foreground service and its cleanup remain in place. Notification denial does
not block multiplayer or request permission repeatedly. This does not promise
survival after force-stop, process death or loss of network connectivity.

The Play build excludes the outside APK updater/provider/installation
permission and uses the existing publisher key. Its Home screen displays
rbabbit v0.87 without an external Check for updates action. Native compiled
engines, protocol, maps, music, gameplay assets and command logic are frozen.

The signed 0.86 Play APK, AAB and complete source ZIP are preserved as fallbacks.
Their filenames and hashes are recorded in FALLBACKS.json. Direct website
artifacts, the live VPS and Git repositories are unchanged by this release.

VALIDATION.json records artifact signatures, manifest/build checks and actual
runtime observations for the exact delivery APK. It does not establish Play
review approval. Use the new Play APK for a foreground-service demonstration
and upload the matching AAB to Google Play Console.

Every baseline source member remains intact in the complete source ZIP. Apply
the guarded overlay before building; see README.md. Private signing inputs and
temporary Android runtime data are excluded from the source additions.
'''
    atomic_bytes(overlay / 'RELEASE-NOTES.md', notes.encode('utf-8'))
    fallback_file = candidate / 'release-records' / 'initial-fallback.json'
    if fallback_file.is_file():
        fallback = json.loads(fallback_file.read_text(encoding='utf-8'))
        write_json(overlay / 'FALLBACKS.json', {'fallbacks': fallback['fallbacks'],
                                             'preservedWithoutOverwrite': True})
    write_json(overlay / 'SOURCE-PROVENANCE.json', {
        'versionName': VERSION, 'versionCode': VERSION_CODE,
        'baselineArchive': baseline.name, 'baselineSHA256': BASELINE_SHA,
        'baselineMembers': BASELINE_MEMBERS,
        'baselineArchiveRootFilesUnchanged': True,
        'packagingMethod': 'Copy the immutable complete baseline ZIP, then append the guarded Play overlay. Original local ZIP records and compressed payload bytes are retained.',
        'overrideFiles': rows,
        'noPrivateSigningInputsInOverlay': True,
    })
    atomic_bytes(overlay / 'package-complete-source.py', Path(__file__).read_bytes())
    if validation:
        report = json.loads(validation.read_text(encoding='utf-8'))
        assert report.get('versionCode') == VERSION_CODE and report.get('versionName') == VERSION
        write_json(overlay / 'VALIDATION.json', report)
    check = restore_check(candidate, baseline, overlay, rows)
    prepared = {'createdUTC': datetime.now(timezone.utc).isoformat(),
                'candidate': str(candidate), 'baseline': str(baseline),
                'baselineSHA256': BASELINE_SHA, 'baselineMembers': BASELINE_MEMBERS,
                'baselineZIPLocalRecordsEnd': baseline_start_dir,
                'overlayFiles': len(rows), 'restoreCheck': check,
                'validationIncluded': bool(validation),
                'finalZIPCreated': False}
    write_json(candidate / 'source-overlay' / 'packaging-prepared.json', prepared)
    return overlay, prepared

def restore_check(candidate, baseline, overlay, rows):
    target = candidate / 'source-overlay' / 'restore-check-0.87' / uuid.uuid4().hex
    target.mkdir(parents=True)
    with zipfile.ZipFile(baseline) as original:
        for row in rows:
            if row['baselineSHA256'] is not None:
                atomic_bytes(target / row['path'], original.read(row['path']))
    shutil.copytree(overlay, target / 'google-play-release')
    command = [sys.executable, str(target / 'google-play-release' / 'prepare-and-build.py'), '--apply-only']
    result = subprocess.run(command, cwd=target, capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    for row in rows:
        assert digest_file(target / row['path']) == row['playSHA256'], row['path']
    changed = target / rows[0]['path']
    expected = changed.read_bytes()
    changed.write_bytes(expected + b'\nUNRELATED LOCAL EDIT GUARD CHECK\n')
    refused = subprocess.run(command, cwd=target, capture_output=True, text=True)
    assert refused.returncode != 0 and 'Preserve local edits' in refused.stderr
    assert changed.read_bytes().endswith(b'UNRELATED LOCAL EDIT GUARD CHECK\n')
    changed.write_bytes(expected)
    return {'passed': True, 'overrideFilesMatchCandidate': len(rows),
            'unrelatedLocalEditRefused': True, 'directory': str(target)}

def package(candidate, baseline, overlay, output, prepared):
    assert not output.exists(), 'Refusing to overwrite an existing delivery ZIP'
    assert (overlay / 'VALIDATION.json').is_file(), 'Final delivery validation report required'
    new_members = sorted(path for path in overlay.rglob('*') if path.is_file())
    assert all(path.suffix.lower() not in {'.jks', '.keystore', '.p12', '.pfx', '.apk', '.aab'} for path in new_members)
    assert not any(path.name.endswith('.pyc') for path in new_members)
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = output.with_name(output.name + '.stage-' + uuid.uuid4().hex)
    shutil.copyfile(baseline, staging)
    with zipfile.ZipFile(staging, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in new_members:
            archive.write(path, 'google-play-release/' + path.relative_to(overlay).as_posix())
    prefix_end = prepared['baselineZIPLocalRecordsEnd']
    old_prefix = digest_file(baseline, prefix_end)
    assert digest_file(staging, prefix_end) == old_prefix, 'Original compressed ZIP records changed'
    with zipfile.ZipFile(baseline) as original, zipfile.ZipFile(staging) as packed:
        original_entries = original.infolist()
        packed_entries = packed.infolist()
        packed_names = [entry.filename for entry in packed_entries]
        assert len(packed_names) == len(set(packed_names)), 'Duplicate source archive members'
        for entry in original_entries:
            retained = packed.getinfo(entry.filename)
            for attr in ['CRC', 'file_size', 'compress_size', 'compress_type', 'header_offset']:
                assert getattr(entry, attr) == getattr(retained, attr), (entry.filename, attr)
        for path in new_members:
            name = 'google-play-release/' + path.relative_to(overlay).as_posix()
            assert packed.read(name) == path.read_bytes(), 'Overlay CRC/content differs: ' + name
        added = len(packed_entries) - len(original_entries)
    os.replace(staging, output)
    result = {'sourceArchive': output.name, 'bytes': output.stat().st_size,
              'sha256': digest_file(output), 'allBaselineMembersRetained': BASELINE_MEMBERS,
              'overlayMembersAdded': added, 'noDuplicateMembers': True,
              'baselineCompressedContentByteIdentical': True,
              'baselineCompressedPrefixSHA256': old_prefix,
              'overlayCRCsAndContentChecked': True,
              'sourceOverlayRestorePassed': True, 'unrelatedEditGuardPassed': True,
              'validationIncluded': True, 'privateSigningInputsIncluded': False}
    write_json(candidate / 'release-records' / 'source-package-validation.json', result)
    print(json.dumps(result, indent=2))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, required=True)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--validation', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--final-authorized', action='store_true')
    args = parser.parse_args()
    candidate, baseline = args.candidate.resolve(), args.baseline.resolve()
    if not args.prepare_only and (not args.final_authorized or not args.validation or not args.output):
        parser.error('Final packaging requires --final-authorized, --validation and --output')
    validation = args.validation.resolve() if args.validation else None
    overlay, prepared = prepare(candidate, baseline, validation)
    if args.prepare_only:
        print(json.dumps(prepared, indent=2))
    else:
        package(candidate, baseline, overlay, args.output.resolve(), prepared)

if __name__ == '__main__':
    main()
