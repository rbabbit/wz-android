"""Restore the retained 0.92 chain, apply the guarded normal 0.93 test profile, build APK only."""
from pathlib import Path, PurePosixPath
from hashlib import file_digest
import argparse
import json
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(path):
    if not path.is_file():
        return None
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def guarded(base, name):
    p = PurePosixPath(name)
    require(name and str(p) == name and not p.is_absolute() and '..' not in p.parts
            and '\\' not in name and ':' not in name, 'Invalid source-profile path')
    target = base / name
    require(not base.is_symlink() and not target.is_symlink()
            and target.resolve().is_relative_to(base.resolve()), 'Source-profile path escape')
    return target


def apply():
    manifest = json.loads((HERE / 'overlay-manifest.json').read_text(encoding='utf-8-sig'))
    require(manifest.get('versionCode') == 93 and manifest.get('versionName') == '0.93', 'Wrong source profile')
    rows = manifest['files']
    current = {row['path']: row for row in rows}
    for name, wanted in manifest['profileDocuments'].items():
        require(digest(guarded(HERE, name)) == wanted, 'Source-profile document changed: ' + name)
    actual_app = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src').rglob('*') if p.is_file()}
    require(actual_app <= set(manifest['knownAppSources']), 'Preserve unknown future app source files before applying 0.93')
    # Validate every source and every guarded destination before the first copy.
    # A future 0.94 or other unknown edit cannot be silently downgraded.
    for row in manifest['retainedProfileFiles']:
        require(digest(guarded(ROOT, row['path'])) == row['sha256'], 'Retained profile changed: ' + row['path'])
    for row in rows:
        require(digest(guarded(HERE / 'overrides', row['path'])) == row['testSHA256'], 'Changed 0.93 override: ' + row['path'])
    for row in manifest['priorRootFiles']:
        require(digest(guarded(HERE, row['path'])) == row['sha256'], 'Changed retained root source: ' + row['path'])
    for name, hashes in manifest['acceptedRootHashes'].items():
        require(digest(guarded(ROOT, name)) in hashes, 'Preserve unknown local edits before applying 0.93: ' + name)

    prior = manifest['priorEffectiveFiles']
    needs_prior = any(digest(guarded(ROOT, name)) not in {wanted, current.get(name, {}).get('testSHA256', wanted)}
                      for name, wanted in prior.items())
    if needs_prior:
        # The 0.92 wrapper understands its own historical states. Roll back
        # only already-applied, exactly known 0.93 files before invoking it.
        for name, row in current.items():
            if name not in prior or digest(guarded(ROOT, name)) != row['testSHA256']:
                continue
            source_name = manifest['priorRestoreSources'][name]
            source = guarded(ROOT, source_name)
            require(digest(source) == prior[name], 'Prior source identity changed: ' + name)
            target = guarded(ROOT, name)
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.resolve() != target.resolve():
                shutil.copy2(source, target)
        subprocess.run([sys.executable, str(ROOT / 'test-release-092/prepare-and-build.py'), '--apply-only'],
                       cwd=ROOT, check=True)
    for row in rows:
        target = guarded(ROOT, row['path'])
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(HERE / 'overrides' / row['path'], target)
    expected = dict(prior)
    expected.update({row['path']: row['testSHA256'] for row in rows})
    require(all(digest(guarded(ROOT, name)) == wanted for name, wanted in expected.items()), 'Restored 0.93 source differs')
    require(all(digest(guarded(ROOT, name)) == wanted for name, wanted in manifest['effectiveBuildSources'].items()),
            'Restored Java/Gradle/app source differs from the exact 0.93 profile')
    require(all(digest(guarded(ROOT, name)) == wanted for name, wanted in manifest['effectiveAPKAssets'].items()),
            'Restored app assets differ from the exact 0.93 profile')
    print('Applied exact normal 0.93 test source. No AAB or publication action.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply-only', action='store_true')
    for name in ['keystore', 'alias', 'java-home', 'android-sdk']:
        parser.add_argument('--' + name)
    parser.add_argument('--online', action='store_true')
    parser.add_argument('--test-ads', action='store_true')
    args = parser.parse_args()
    if not args.apply_only:
        require(all([args.keystore, args.alias, args.java_home, args.android_sdk]),
                'Explicit existing private --keystore/--alias/--java-home/--android-sdk inputs required')
    apply()
    if not args.apply_only:
        command = [sys.executable, str(ROOT / 'tools/build-normal-apk.py'), '--keystore', args.keystore,
                   '--alias', args.alias, '--java-home', args.java_home, '--android-sdk', args.android_sdk]
        if args.online:
            command.append('--online')
        if args.test_ads:
            command.append('--test-ads')
        raise SystemExit(subprocess.run(command, cwd=ROOT).returncode)


if __name__ == '__main__':
    main()
