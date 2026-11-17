"""Bind the final observed runtime summary and evidence to the exact delivery APK.

Does not run tests or create observations. Root supplies runtime-summary.json
after inspecting native/device results, including all unverified limits.
"""
from pathlib import Path
from hashlib import file_digest
from datetime import datetime, timezone
import json, runpy, subprocess

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT/'qa/delivery-086'
PACK = runpy.run_path(str(ROOT/'tools/package-delivery-086.py'), run_name='record086_helpers')
EXPECTED = '475a4cc87aca6be4348082f7e48b3e22e9eddcf6347475438b4ff06e329ae05b'

def digest(path):
    with path.open('rb') as stream: return file_digest(stream, 'sha256').hexdigest()

def pin(name):
    p = ROOT/name
    assert p.is_file() and p.resolve().is_relative_to(ROOT)
    return dict(path=name, bytes=p.stat().st_size, sha256=digest(p))

def main():
    summary = json.loads((QA/'runtime-summary.json').read_text(encoding='utf-8-sig'))
    assert summary['candidateAPK_SHA256'] == EXPECTED
    assert summary['passed'] is True and summary['observations'] and isinstance(summary['limitations'], list)
    apk = ROOT/'app/build/outputs/apk/debug/app-debug.apk'
    assert digest(apk) == EXPECTED
    log = (QA/'build.log').read_text(encoding='utf-8-sig', errors='replace')
    assert 'BUILD SUCCESSFUL' in log and 'error:' not in log and 'BUILD FAILED' not in log
    changed = set(filter(None, subprocess.check_output(['git','diff','--name-only','HEAD','-z'], cwd=ROOT).decode().split('\0')))
    source_names = (PACK['PRODUCT']|PACK['NEW_TOOLS']|PACK['NEW_DOCS']|changed|{'tools/record-delivery-086.py'})-{
        'archive/repository-files.json','archive/release-0.86.json'}
    source_names = {n for n in source_names if (ROOT/n).is_file()}
    evidence = set(summary['evidence']) | {
        'qa/delivery-086/fallback.json','qa/delivery-086/runtime-summary.json',
        'qa/delivery-086/apk-integrity.json',
        'qa/manufacturing-all-086/all.json','qa/manufacturing-all-086/baseline-native.json',
        'qa/manufacturing-all-086/baseline-ui.json','qa/manufacturing-all-086/browser.json',
        'qa/manufacturing-all-086/payload.json','qa/mp-updates-manufacturing-086/lifecycle-host.json',
        'qa/updates-086/host-checks.json'}
    proof = dict(version='0.86', passed=True, candidateAPK_SHA256=EXPECTED,
        emulatorUsed=True, actualAndroidViewsExecuted=True, actualNativeEngineExecuted=True,
        nativeBuildPerformed=False, checks={'androidBuild':True, **summary['checks']},
        observations=summary['observations'], limitations=summary['limitations'],
        vpsUpdateDeployment=summary.get('vpsUpdateDeployment', False),
        sources=[pin(n) for n in sorted(source_names)],
        evidence=[pin(n) for n in sorted(evidence)],
        buildLog=pin('qa/delivery-086/build.log'), recordedUTC=datetime.now(timezone.utc).isoformat())
    (QA/'verification.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(dict(passed=True, candidateAPK_SHA256=EXPECTED, sources=len(proof['sources']), evidence=len(proof['evidence']))))

if __name__ == '__main__': main()
