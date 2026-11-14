"""Install the matched Intelligence runtime, preserving every authored VFS byte.

Uses the existing guarded integrator. Intelligence introduces no virtual files
and makes no worker-hook change; Demolish VFS integration runs afterwards.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
import argparse
import json
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets/warzone'
BASELINE = ROOT.parent / 'Warzone-Towers-0.35-Test-Ads.apk'
BASELINE_SHA = '438d8f708da975270973cfee65c67ce71739132d9d979cbf8d462bb2176c2e06'


def digest(value):
    return sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--install',action='store_true')
    args = parser.parse_args()
    assert digest(BASELINE.read_bytes()) == BASELINE_SHA
    with ZipFile(BASELINE) as archive:
        for name in ['warzone2100.js','warzone2100.data','warzone2100.wasm']:
            assert (ASSETS / name).read_bytes() == archive.read('assets/warzone/' + name), 'Integrate before the Demolish VFS step'
    subprocess.run([sys.executable,str(ROOT / 'tools/integrate-native-runtime.py'),
                    '--raw-js',str(args.raw / 'warzone2100.js'),'--raw-wasm',str(args.raw / 'warzone2100.wasm'),
                    '--baseline-assets',str(ASSETS),'--out',str(args.out)],check=True,stdout=subprocess.DEVNULL)
    report = json.loads((args.out / 'native-runtime-integration.json').read_text())
    report.update({'version':'0.36','baselineAPK':str(BASELINE),'baselineSHA256':BASELINE_SHA,
                   'scope':'Matched source-built hci.cpp Intelligence extension; existing authored data/index and exact v0.35 worker hook retained',
                   'intelligenceVFSChanges':[],'workerHookChanged':False})
    (args.out / 'native-runtime-integration.json').write_text(json.dumps(report,indent=2)+'\n')
    qa = ROOT / 'qa/0.36-intelligence';qa.mkdir(parents=True,exist_ok=True)
    shutil.copy2(args.out / 'native-runtime-integration.json',qa / 'native-runtime-integration.json')
    for name in ['native-intelligence-build.json','native-intelligence-incremental-build.log']:
        shutil.copy2(args.raw / name,qa / name)
    first = args.raw / 'native-intelligence-first-compile-missing-header.log'
    if first.is_file():
        shutil.copy2(first,qa / first.name)
        build_file = qa / 'native-intelligence-build.json'
        build = json.loads(build_file.read_text())
        build['priorCompileAttempt'] = {'successful':False,'nativeRuntimeInstalled':False,
            'reason':'Missing piemode.h declaration of renderer UI origin; corrected before the successful build',
            'log':'qa/0.36-intelligence/' + first.name,'logSHA256':digest(first.read_bytes())}
        build_file.write_text(json.dumps(build,indent=2)+'\n')
    if args.install:
        for name in ['warzone2100.js','warzone2100.data']:
            expected = report['baselineAssets']['jsSHA256' if name.endswith('.js') else 'dataSHA256']
            assert digest((ASSETS / name).read_bytes()) == expected
        backup = ROOT.parent / '_release-records/native-intelligence036/baseline-assets';backup.mkdir(parents=True,exist_ok=True)
        for name in ['warzone2100.js','warzone2100.wasm','warzone2100.data']:
            shutil.copy2(ASSETS / name,backup / name)
        for name in ['warzone2100.js','warzone2100.wasm']:
            shutil.copy2(args.out / name,ASSETS / name)
        assert digest((ASSETS / 'warzone2100.data').read_bytes()) == report['frozenDataSHA256']
    print(json.dumps(report))


if __name__ == '__main__':
    main()
