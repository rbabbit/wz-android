"""Package 0.24's native compact home and removal of optional HQ graphics.

This checks source/archive/build integrity only. It never launches an emulator
and does not establish runtime layout, input, music or gameplay behaviour.
"""
from pathlib import Path
from hashlib import file_digest
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from datetime import datetime, timezone
import argparse
import json
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BASELINE_SHA = 'af42705865e83cd80b0fa1f631f5e90753869d35e2ec8f6e334f40d603658f44'
SOURCE_SHA = 'c667b90a7dbc13161553db1eabf57cb88685312c8fbfad935d96c6ddc2101504'
ASSET_SCOPE = {'assets/warzone/index.html', 'assets/warzone/index-duel.html'}
REMOVED_ASSETS = {'assets/warzone/graphics-loader.js'}
JAVA = 'app/src/main/java/com/rbabbit/blocknight/warzone/'
SOURCE_SCOPE = {JAVA + name for name in (
    'GraphicsSetupView.java', 'MainActivity.java', 'BattleLaunchSpec.java', 'HomeLayoutMetrics.java')}
SOURCE_SCOPE |= {'app/src/main/' + name for name in ASSET_SCOPE}
REMOVED_SOURCE = {JAVA + 'GraphicsPackStore.java'} | {'app/src/main/' + name for name in REMOVED_ASSETS}
NATIVE_SOURCE = 'archive/native-blueprint-4.7.0-source.tar.gz'
MANIFEST = 'archive/repository-files.json'
RECORD = 'archive/release-0.24-build-only.json'
FALLBACK = 'archive/fallback-0.24.json'
STORED = {'.gz', '.xz', '.zst', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.ogg', '.mp3', '.opus', '.wasm', '.data', '.woff2'}
SKIP = {'.git', '.gradle', '.kotlin', '.idea', 'build', 'node_modules', '__pycache__',
        '.pytest_cache', '.mypy_cache', '.ruff_cache', '.cache', '.venv', 'venv', 'dist'}
TRANSIENT = {'qa/0.19-home/latest-ui.xml'}
PRIVATE_SUFFIXES = {'.jks', '.keystore', '.pyc', '.pem', '.p12', '.pfx'}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def zip_digest(archive, name):
    with archive.open(name) as stream:
        return file_digest(stream, 'sha256').hexdigest()


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def repo_path(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT), 'Source/evidence outside repository: ' + str(path))
    return path.relative_to(ROOT).as_posix()


def metadata(name):
    return name in {'AndroidManifest.xml', 'resources.arsc'} or bool(
        re.fullmatch(r'classes(?:\d+)?\.dex', name) or
        re.fullmatch(r'META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))', name, re.I))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--source-report', type=Path, action='append', default=[])
    parser.add_argument('--output', type=Path, default=ROOT.parent)
    args = parser.parse_args()
    require(not args.output.resolve().is_relative_to(ROOT), 'Delivery output must be outside source tree')
    candidate = digest(args.apk)
    require(candidate == args.expected_sha256, 'Candidate APK hash differs')
    saved = read_json(ROOT / FALLBACK)
    for entry in saved['files']:
        path = Path(entry['path'])
        require(path.stat().st_size == entry['bytes'] and digest(path) == entry['sha256'],
                'Frozen fallback changed: ' + str(path))
    baseline = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'Warzone-Towers-0.23.apk')
    old_source = next(Path(e['path']) for e in saved['files'] if Path(e['path']).name == 'warzone-towers-0.23-source.zip')
    require(digest(baseline) == BASELINE_SHA and digest(old_source) == SOURCE_SHA, 'Wrong 0.23 baseline')
    reports = []
    for path in args.source_report:
        name = repo_path(path)
        report = read_json(path)
        require(report.get('emulatorUsed') is False, 'Source report must explicitly exclude emulator use')
        for entry in report.get('sources', []):
            source = ROOT / entry['path']
            repo_path(source)
            require(source.is_file() and digest(source) == entry['sha256'], 'Reviewed source changed: ' + entry['path'])
        reports.append({'path': name, 'sha256': digest(path)})
    with ZipFile(args.apk) as apk, ZipFile(baseline) as old:
        require(apk.testzip() is None, 'Built APK CRC failure')
        names, old_names = set(apk.namelist()), set(old.namelist())
        require(len(names) == len(apk.namelist()), 'Duplicate APK entry')
        removed, added = old_names - names, names - old_names
        require({n for n in removed if n.startswith('assets/')} == REMOVED_ASSETS, 'Unexpected removed APK asset')
        require(not any(n.startswith('assets/') for n in added), 'Unexpected new APK asset')
        require(all(n in REMOVED_ASSETS or metadata(n) for n in removed), 'Unexpected removed APK member')
        changed = [n for n in apk.namelist() if n not in old_names or zip_digest(old, n) != zip_digest(apk, n)]
        require({n for n in changed if n.startswith('assets/')} == ASSET_SCOPE, 'Unexpected changed APK asset')
        require(all(n in ASSET_SCOPE or metadata(n) for n in changed), 'APK changed outside authorized home/HD scope')
        for path in (ROOT / 'app/src/main/assets').rglob('*'):
            if path.is_file():
                name = 'assets/' + path.relative_to(ROOT / 'app/src/main/assets').as_posix()
                require(name in names and digest(path) == zip_digest(apk, name), 'Stale/missing APK source asset: ' + name)
        frozen_assets = {n: zip_digest(old, n) for n in old_names if n.startswith('assets/') and n not in ASSET_SCOPE | REMOVED_ASSETS}
        require(all(zip_digest(apk, n) == sha for n, sha in frozen_assets.items()), 'Frozen engine/map/music asset changed')
    with ZipFile(old_source) as source:
        source_names = set(source.namelist())
        protected = [n for n in source_names if not n.endswith('/') and (
            n.startswith(('vendor/', 'map/', 'scenario/')) or n == NATIVE_SOURCE or
            (n.startswith('app/src/main/') and n not in SOURCE_SCOPE | REMOVED_SOURCE))]
        for name in protected:
            path = ROOT / name
            require(path.is_file() and digest(path) == zip_digest(source, name), 'Frozen source changed: ' + name)
        require(all(not (ROOT / name).exists() for name in REMOVED_SOURCE), 'Removed HD source still present')
        new_app_source = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src/main').rglob('*') if p.is_file()} - source_names
        require(new_app_source <= SOURCE_SCOPE, 'Unexpected app source additions: ' + str(new_app_source))
    sdk = Path(os.environ.get('ANDROID_HOME', str(Path.home() / 'AppData/Local/Android/Sdk')))
    badging = subprocess.check_output([str(sdk / 'build-tools/36.1.0/aapt2.exe'), 'dump', 'badging', str(args.apk)], text=True, encoding='utf-8')
    require(all(token in badging for token in ("package: name='com.rbabbit.warzonetowers.lab'", "versionCode='24'", "versionName='0.24'", "application-label:'Warzone Towers'")), 'Wrong package/version/label')
    apk_out, source_out, checksums = [args.output / n for n in ('Warzone-Towers-0.24.apk', 'warzone-towers-0.24-source.zip', 'Warzone-Towers-0.24-SHA256.txt')]
    partial = source_out.with_suffix('.zip.partial')
    require(not any(p.exists() for p in (apk_out, source_out, checksums, partial)), 'Existing delivery/partial must not be overwritten')
    write_json(ROOT / RECORD, {
        'version': '0.24', 'versionCode': 24, 'candidateAPK_SHA256': candidate,
        'scope': 'Option 1 native home layout and removal of optional HQ graphics from the app; VPS unchanged.',
        'emulatorUsed': False, 'screensVerified': False, 'gameplayVerified': False, 'musicPlaybackVerified': False,
        'verification': 'Source review, Android compilation and exact source/APK archive integrity only. No emulator was used for this revision.',
        'changedAPKAssets': sorted(ASSET_SCOPE), 'removedAPKAssets': sorted(REMOVED_ASSETS),
        'changedAPKMembers': changed, 'removedAPKMembers': sorted(removed),
        'engineAndMapAndMusicPayloadUnchanged': True, 'duelGameplayPayloadUnchanged': True,
        'preservedOriginalSourceFiles': len(protected), 'preservedAPKAssets': len(frozen_assets),
        'sourceCheckReports': reports, 'fallbackRecord': {'path': FALLBACK, 'sha256': digest(ROOT / FALLBACK)},
        'sourceInventory': 'git ls-files --cached --others --exclude-standard; filtered caches/private/transient files',
        'gitMetadataIncluded': False, 'recordedUTC': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')})
    required = {NATIVE_SOURCE, 'tools/package-24-home.py', RECORD, FALLBACK,
                'README.md', 'AGENTS.md', 'docs/releases/0.24-compact-home.md'}
    required.update(r['path'] for r in reports)
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode('utf-8').split('\0')
    tracked = set(filter(None, subprocess.check_output(['git', 'ls-files', '--cached', '-z'], cwd=ROOT).decode('utf-8').split('\0')))
    files = []
    for name in sorted(set(filter(None, names)) | {RECORD, MANIFEST}):
        rel = Path(name)
        if any(part in SKIP for part in rel.parts) or name in TRANSIENT or rel.suffix in {'.partial', '.tmp'}:
            continue
        require(rel.suffix.lower() not in PRIVATE_SUFFIXES and not rel.name.startswith('.env') and name not in {'local.properties', 'tools/live-cdp-url.txt'}, 'Private/local source entry: ' + name)
        path = ROOT / rel
        repo_path(path)
        if path.is_file():
            require(name in tracked or path.stat().st_size <= 128 * 1024 * 1024, 'Unexpected large untracked source/cache: ' + name)
            files.append((name, path))
    require(required <= {n for n, _ in files}, 'Required complete source missing: ' + str(sorted(required - {n for n, _ in files})))
    entries = [{'path': n, 'bytes': p.stat().st_size, 'sha256': digest(p)} for n, p in files if n != MANIFEST]
    write_json(ROOT / MANIFEST, {'schemaVersion': 1, 'files': entries})
    expected = {e['path']: e for e in entries}
    args.output.mkdir(parents=True, exist_ok=True)
    with ZipFile(partial, 'w', ZIP_DEFLATED, compresslevel=3) as archive:
        for name, path in files:
            archive.write(path, name, compress_type=ZIP_STORED if path.suffix.lower() in STORED else ZIP_DEFLATED)
    with ZipFile(partial) as archive:
        require(len(archive.namelist()) == len(files), 'Source archive entry count differs')
        require(archive.getinfo(NATIVE_SOURCE).file_size > 100 * 1024 * 1024, 'Complete native source missing/LFS pointer')
        for name, path in files:
            archived = zip_digest(archive, name)
            require(archived == digest(path) and (name not in expected or archived == expected[name]['sha256']), 'Source archive differs: ' + name)
    require(digest(args.apk) == candidate, 'Candidate APK changed during packaging')
    for report in reports:
        require(digest(ROOT / report['path']) == report['sha256'], 'Source check report changed during packaging')
    shutil.copyfile(args.apk, apk_out)
    require(digest(apk_out) == candidate, 'Delivery APK differs from reviewed build')
    partial.rename(source_out)
    source_sha = digest(source_out)
    checksums.write_text(f'{candidate}  {apk_out.name}\n{source_sha}  {source_out.name}\n', encoding='utf-8')
    print(json.dumps({'packageIntegrityPassed': True, 'emulatorUsed': False, 'screensVerified': False,
                      'gameplayVerified': False, 'apk': str(apk_out), 'apkBytes': apk_out.stat().st_size,
                      'candidateAPK_SHA256': candidate, 'source': str(source_out), 'sourceBytes': source_out.stat().st_size,
                      'sourceZIP_SHA256': source_sha, 'sourceFiles': len(files), 'checksums': str(checksums),
                      'streamedEverySourceEntryCRCAndSHA': True}, indent=2))


if __name__ == '__main__':
    main()
