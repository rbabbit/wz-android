"""Retain completed exact-APK FFA observations and pin their product sources.

The parent supplies the final observed journey JSON. This recorder never runs
tests, controls a device, rebuilds an APK, or invents verification claims.
"""
from datetime import datetime, timezone
from pathlib import Path
import argparse
import json
import re
import runpy
import shutil

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = runpy.run_path(str(ROOT / 'tools/package-ffa-060.py'), run_name='ffa060_record_helpers')
digest, require = PACKAGE['digest'], PACKAGE['require']
QA = ROOT / 'qa/ffa-060'
OUT = ROOT / 'archive/ffa-0.60'
RECORD = ROOT / PACKAGE['EMULATOR']
DEFAULT_FINAL = QA / 'verify-ffa-060.json'
APK = ROOT / 'app/build/outputs/apk/debug/app-debug.apk'


def read(path):
    require(path.is_file(), 'Missing evidence: ' + str(path))
    return json.loads(path.read_text(encoding='utf-8'))


def row(path):
    require(path.is_file() and path.resolve().is_relative_to(ROOT), 'Missing/outside source or evidence: ' + str(path))
    return dict(path=path.relative_to(ROOT).as_posix(), bytes=path.stat().st_size, sha256=digest(path))


def source_paths():
    paths = {ROOT / 'app/build.gradle.kts', ROOT / 'AGENTS.md', ROOT / 'README.md', ROOT / PACKAGE['FALLBACK'],
        Path(__file__).resolve(), ROOT / 'tools/package-ffa-060.py', ROOT / 'tools/campaign-live-051.cjs'}
    for prefix in ('app/src/', 'scenario/ffa/', 'map/ffa-emag/', 'vendor/ffa-map/'):
        paths.update(path for path in (ROOT / prefix).rglob('*') if path.is_file())
    paths.update(path for path in (ROOT / 'tools').glob('*060*') if path.is_file())
    paths.update(path for path in (ROOT / 'archive').glob('*0.60*') if path.is_file()
        and path != RECORD and not path.name.startswith('release-'))
    document = ROOT / 'docs/releases/0.60-ffa.md'
    if document.is_file(): paths.add(document)
    for path in paths:
        rel = path.relative_to(ROOT)
        require(path.suffix.lower() not in PACKAGE['C']['PRIVATE_SUFFIXES'] and not path.name.startswith('.env')
            and not any(part in PACKAGE['C']['SKIP'] for part in rel.parts)
            and path.suffix not in {'.tmp', '.partial'}, 'Private/transient proof source: ' + str(rel))
    return sorted(paths)


def checked_final(path, expected):
    final = read(path)
    require(final.get('version') == '0.60' and final.get('passed') is True
        and final.get('candidateAPK_SHA256') == expected and final.get('device') == 'emulator-5558'
        and final.get('emulatorUsed') is True and final.get('actualNativeEngineExecuted') is True,
        'A passed final exact-APK native emulator observation is required')
    require(final.get('runtimeErrors') == [] and final.get('finishedAt'), 'Missing runtime-error/final completion observation')
    checks = final.get('checks')
    require(isinstance(checks, list) and checks and all(isinstance(value, dict) and value.get('name')
        and value.get('passed') is True for value in checks), 'Missing/failed named final checks')
    require(len({value['name'] for value in checks}) == len(checks), 'Duplicate final check names')
    references = {path}

    def reference(value, expected_hash=None, expected_bytes=None):
        candidate = Path(str(value).replace('\\', '/'))
        candidate = (candidate if candidate.is_absolute() else ROOT / candidate).resolve()
        require(candidate.is_relative_to(QA.resolve()) and candidate.is_file()
            and candidate.suffix.lower() in {'.json', '.png'}, 'Only retained FFA QA JSON/PNG evidence is accepted: ' + str(value))
        require(expected_hash is None or digest(candidate) == expected_hash, 'Evidence hash changed: ' + str(value))
        require(expected_bytes is None or candidate.stat().st_size == expected_bytes, 'Evidence size changed: ' + str(value))
        if candidate in references: return
        references.add(candidate)
        if candidate.suffix.lower() == '.json': walk(read(candidate))

    def walk(value):
        if isinstance(value, dict):
            # Existing journey runners use screenshot:{path,sha256,bytes} and
            # check evidence paths. Preserve both without a new case schema.
            if isinstance(value.get('path'), str) and value['path'].replace('\\', '/').startswith('qa/ffa-060/'):
                reference(value['path'], value.get('sha256'), value.get('bytes'))
            if isinstance(value.get('evidence'), str):
                reference(value['evidence'], value.get('sha256'))
            for nested in value.values(): walk(nested)
        elif isinstance(value, list):
            for nested in value: walk(nested)
        elif isinstance(value, str) and value.replace('\\', '/').startswith('qa/ffa-060/') and value.endswith(('.json', '.png')):
            reference(value)

    walk(final)
    require(any(value.suffix.lower() == '.png' for value in references), 'No actual screen evidence retained')
    require(len({value.name for value in references}) == len(references), 'Curated evidence filenames collide')
    for evidence in references:
        require(evidence.stat().st_size <= 16 * 1024 * 1024, 'Evidence exceeds bounded record size: ' + evidence.name)
        if evidence.suffix.lower() == '.png':
            with evidence.open('rb') as stream:
                require(evidence.stat().st_size > 100 and stream.read(8) == b'\x89PNG\r\n\x1a\n', 'Invalid PNG: ' + evidence.name)
    return final, references


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--apk', type=Path, default=APK)
    parser.add_argument('--final', type=Path, default=DEFAULT_FINAL)
    args = parser.parse_args()
    expected = args.expected_sha256.lower()
    require(re.fullmatch('[0-9a-f]{64}', expected) and args.apk.is_file() and digest(args.apk) == expected, 'Current candidate APK mismatch')
    final_path = args.final.resolve()
    require(final_path.is_relative_to(QA.resolve()), 'Final observation must stay in qa/ffa-060')
    final, references = checked_final(final_path, expected)
    PACKAGE['baseline_paths']()
    sources = [row(path) for path in source_paths()]
    before = {path.name: row(path) for path in references}
    OUT.mkdir(parents=True, exist_ok=True)
    evidence_rows = []
    for path in sorted(references):
        target = OUT / path.name
        require(not target.exists() or digest(target) == before[path.name]['sha256'], 'Refusing to overwrite different retained evidence: ' + path.name)
        shutil.copyfile(path, target)
        require(digest(target) == before[path.name]['sha256'], 'Evidence changed while copying: ' + path.name)
        evidence_rows.append(row(target))
    for source in sources:
        require(digest(ROOT / source['path']) == source['sha256'], 'Source changed during recording: ' + source['path'])
    require(digest(args.apk) == expected, 'Candidate APK changed before proof commit')
    record = dict(version='0.60', passed=True, candidateAPK_SHA256=expected,
        emulatorUsed=True, actualNativeEngineExecuted=True, device='emulator-5558',
        checks=final['checks'], runtimeErrors=[],
        verificationInput=dict(path=(OUT / final_path.name).relative_to(ROOT).as_posix(), sha256=before[final_path.name]['sha256']),
        fallbackRecord=dict(path=PACKAGE['FALLBACK'], sha256=digest(ROOT / PACKAGE['FALLBACK'])),
        fixtureDisclosure=final.get('fixtureDisclosure'), fixtureFailures=final.get('fixtureFailures', []),
        limitations=final.get('limitations', []), sources=sources, evidence=evidence_rows,
        liveAdsTested=False, githubPublished=False, vpsChanged=False, recordedUTC=datetime.now(timezone.utc).isoformat())
    temporary = RECORD.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    temporary.replace(RECORD)
    print(json.dumps(dict(passed=True, proof=str(RECORD), candidateAPK_SHA256=expected,
        checksPassed=len(final['checks']), sourceFiles=len(sources), retainedEvidence=len(evidence_rows)), indent=2))


if __name__ == '__main__':
    main()
