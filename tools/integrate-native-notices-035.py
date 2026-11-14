"""Install the matched v0.35 source-built runtime with one exact notice route.

First runs the original frozen-data integrator against the v0.34 APK. Then adds
only BNNOTICE to its existing private worker filter, with exact before/after
hook files and hashes. This step preserves the complete authored data/index.
"""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import argparse
import json
import re
import runpy
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT.parent / 'Warzone-Towers-0.34-Test-Ads.apk'
BASELINE_SHA = '4c5c5b6937ea756aea0f46697b0ea6c4f0192d918d88e4caa663a00a149fda7a'
ASSETS = ROOT / 'app/src/main/assets/warzone'
HOOK_BEFORE_SHA = 'd552fdf229b98791fbaf979928c4a0df1a829e0c4fb52beead2bb89ac73c4c4f'
RUNTIME = runpy.run_path(str(ROOT / 'tools/integrate-native-runtime.py'), run_name='notices_runtime_035')


def digest(value):
    return sha256(value).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--install', action='store_true')
    args = parser.parse_args()
    assert digest(BASELINE.read_bytes()) == BASELINE_SHA
    subprocess.run([sys.executable,str(ROOT / 'tools/integrate-native-runtime.py'),
                    '--raw-js',str(args.raw / 'warzone2100.js'),'--raw-wasm',str(args.raw / 'warzone2100.wasm'),
                    '--baseline-apk',str(BASELINE),'--out',str(args.out)],check=True,stdout=subprocess.DEVNULL)
    base_report = json.loads((args.out / 'native-runtime-integration.json').read_text())
    shutil.copy2(args.out / 'native-runtime-integration.json',args.out / 'native-base-runtime-integration.json')
    source = (args.out / 'warzone2100.js').read_text()
    hooks = re.findall(r'var out=console\.log\.bind\(console\);var blockNightOutputChannel=.*?;var wasmBinary;',source,re.S)
    assert len(hooks) == 1
    before = hooks[0]
    assert digest(before.encode()) == HOOK_BEFORE_SHA
    old = 'text.includes("BNQUEUE")))'
    new = 'text.includes("BNQUEUE")||text.includes("BNNOTICE")))'
    assert before.count(old) == 1
    after = before.replace(old,new,1)
    result = source.replace(before,after,1)
    assert result.replace(after,before,1) == source
    start,end,_,metadata = RUNTIME['package_call'](source)
    new_start,new_end,new_index,new_metadata = RUNTIME['package_call'](result)
    assert metadata == new_metadata and result[new_start:new_end] == source[start:end]
    data = (args.out / 'warzone2100.data').read_bytes()
    RUNTIME['verify_index'](new_metadata,data)
    (args.out / 'warzone2100.js').write_text(result,encoding='utf-8',newline='\n')
    overlay = ROOT / 'archive/native-notices-0.35'
    (overlay / 'worker-output-before.js').write_text(before,encoding='utf-8',newline='\n')
    (overlay / 'worker-output-after.js').write_text(after,encoding='utf-8',newline='\n')
    hook_record = {'version':'0.35','passed':True,'scope':'Only add BNNOTICE to the existing private output filter; console error output and existing BNTECH/BNQUEUE routes stay unchanged.',
                   'beforeSHA256':digest(before.encode()),'afterSHA256':digest(after.encode()),
                   'replaceFrom':old,'replaceTo':new,'replacementCount':1,
                   'beforeFile':'archive/native-notices-0.35/worker-output-before.js',
                   'afterFile':'archive/native-notices-0.35/worker-output-after.js'}
    (overlay / 'worker-output-delta.json').write_text(json.dumps(hook_record,indent=2)+'\n')
    outputs = [{'file':name,'sha256':digest((args.out / name).read_bytes()),'bytes':(args.out / name).stat().st_size}
               for name in ['warzone2100.js','warzone2100.wasm','warzone2100.data']]
    report = {'version':'0.35','passed':True,'recordedUTC':datetime.now(timezone.utc).isoformat(),
              'method':'Matched source-built runtime; frozen v0.34 authored index/data plus one exact BNNOTICE worker-filter extension',
              'baselineAPK':str(BASELINE),'baselineSHA256':BASELINE_SHA,
              'raw':base_report['raw'],'integrated':outputs,
              'frozenDataSHA256':base_report['frozenDataSHA256'],'frozenVirtualFiles':base_report['frozenVirtualFiles'],
              'frozenPackageIndexSHA256':base_report['frozenPackageIndexSHA256'],
              'workerHookDelta':'archive/native-notices-0.35/worker-output-delta.json',
              'workerHookBeforeSHA256':hook_record['beforeSHA256'],'workerHookAfterSHA256':hook_record['afterSHA256'],
              'noticeRouteOnlyWorkerHookChange':True,'generatedCodeUnchangedOutsideIndexAndReviewedWorkerHook':True,
              'nativeProgramBodySHA256':digest((result[:new_start]+'PACKAGE_INDEX'+result[new_end:]).encode()),
              'runtimeContract':base_report['runtimeContract']}
    (args.out / 'native-runtime-integration.json').write_text(json.dumps(report,indent=2)+'\n')
    qa = ROOT / 'qa/0.35-notices';qa.mkdir(parents=True,exist_ok=True)
    for name in ['native-runtime-integration.json','native-base-runtime-integration.json']:
        shutil.copy2(args.out / name,qa / name)
    for name in ['native-notices-build.json','native-notices-incremental-build.log']:
        shutil.copy2(args.raw / name,qa / name)
    if args.install:
        assert digest((ASSETS / 'warzone2100.data').read_bytes()) == report['frozenDataSHA256']
        backup = ROOT.parent / '_release-records/native-notices035/baseline-assets';backup.mkdir(parents=True,exist_ok=True)
        for name in ['warzone2100.js','warzone2100.wasm','warzone2100.data']:
            shutil.copy2(ASSETS / name,backup / name)
        for name in ['warzone2100.js','warzone2100.wasm']:
            shutil.copy2(args.out / name,ASSETS / name)
    print(json.dumps(report))


if __name__ == '__main__':
    main()
