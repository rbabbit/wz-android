"""Record a successful clean build and the exact resulting APK, without rebuilding."""
from pathlib import Path
from hashlib import file_digest
from zipfile import ZipFile
import argparse
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT / 'app/build/outputs/apk/debug/app-debug.apk')
    parser.add_argument('--build-log', type=Path, required=True)
    parser.add_argument('--expected-sha256', required=True)
    args = parser.parse_args()
    assert re.fullmatch('[0-9a-f]{64}', args.expected_sha256)
    assert digest(args.apk) == args.expected_sha256, 'Candidate APK changed'
    log = args.build_log.read_text(encoding='utf-8-sig', errors='replace')
    assert re.search(r'Task :app:clean(?:\s|$)', log) and 'BUILD SUCCESSFUL' in log, 'Successful clean build log required'
    with ZipFile(args.apk) as archive:
        rows = archive.infolist()
        assert len({row.filename for row in rows}) == len(rows) and archive.testzip() is None
        assets = [row for row in rows if row.filename.startswith('assets/') and not row.is_dir()]
        for row in assets:
            source = ROOT / 'app/src/main' / row.filename
            assert source.is_file(), 'Unexpected APK asset: ' + row.filename
            with archive.open(row) as stream:
                assert file_digest(stream, 'sha256').hexdigest() == digest(source), 'APK/source mismatch: ' + row.filename
        compressed = sum(row.compress_size for row in rows)
        overhead = args.apk.stat().st_size - compressed
        assert overhead < 2 * 1024 * 1024, 'Unexpected unused APK space: ' + str(overhead)
    retained = ROOT / 'archive/ffa-pathways-clean-build-0.68.log'
    if args.build_log.resolve() != retained.resolve():
        shutil.copyfile(args.build_log, retained)
    record = dict(version='0.68', passed=True, cleanBuild=True, candidateAPK_SHA256=digest(args.apk),
        candidateBytes=args.apk.stat().st_size, zipMembers=len(rows), zipPayloadBytes=compressed,
        zipOverheadBytes=overhead, allAPKAssetsMatchSource=True, emulatorUsed=False,
        buildCommand='gradlew.bat clean assembleDebug',
        sources=[dict(path='app/build.gradle.kts',sha256=digest(ROOT / 'app/build.gradle.kts'),bytes=(ROOT / 'app/build.gradle.kts').stat().st_size)],
        buildLog=dict(path=retained.relative_to(ROOT).as_posix(), sha256=digest(retained)))
    assert digest(args.apk) == args.expected_sha256, 'APK changed during recording'
    (ROOT / 'archive/ffa-pathways-clean-apk-0.68.json').write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(record, indent=2))


if __name__ == '__main__':
    main()
