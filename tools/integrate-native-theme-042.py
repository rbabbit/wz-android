"""Integrate the two-file source-built sage renderer with exact 0.41 authored data.

No VFS file, scenario, worker hook or WASM instruction is patched after linking.
"""
from pathlib import Path
from hashlib import sha256
from zipfile import ZipFile
from datetime import datetime, timezone
import argparse
import json
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'archive/native-theme-0.42'
ASSETS = ROOT / 'app/src/main/assets/warzone'


def digest(path):
    h = sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(8*1024*1024),b''): h.update(block)
    return h.hexdigest()


def atomic(path, value):
    with tempfile.NamedTemporaryFile(dir=path.parent,prefix='.theme042-',suffix='.tmp',delete=False) as stream:
        stage=Path(stream.name);stream.write(value);stream.flush();os.fsync(stream.fileno())
    try:
        assert stage.read_bytes() == value
        os.replace(stage,path)
    finally:
        if stage.exists(): stage.unlink()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--raw',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--install',action='store_true')
    a=p.parse_args()
    assert ROOT not in a.out.resolve().parents
    frozen=json.loads((ROOT/'archive/fallback-0.42.json').read_text(encoding='utf-8-sig'))
    row=next(r for r in frozen['files'] if r['path'].endswith('.apk'))
    baseline=Path(row['path'])
    assert baseline.stat().st_size==row['bytes'] and digest(baseline)==row['sha256']
    build=json.loads((OUT/'native-build.json').read_text())
    assert build['version']=='0.42' and build['passed'] and build['nativeFullFreshBuildPerformed'] is False
    assert sorted(build['compiledObjects'])==['src/CMakeFiles/warzone2100.dir/console.cpp.o','src/CMakeFiles/warzone2100.dir/intdisplay.cpp.o']
    for r in build['raw']:
        raw=a.raw/r['file'];assert raw.stat().st_size==r['bytes'] and digest(raw)==r['sha256']
    subprocess.run([sys.executable,str(ROOT/'tools/integrate-native-runtime.py'),
                    '--raw-js',str(a.raw/'warzone2100.js'),'--raw-wasm',str(a.raw/'warzone2100.wasm'),
                    '--baseline-apk',str(baseline),'--out',str(a.out)],check=True,stdout=subprocess.DEVNULL)
    integration=json.loads((a.out/'native-runtime-integration.json').read_text())
    assert integration['passed'] and integration['generatedCodeUnchangedOutsideIndexAndExistingWorkerHook']
    with ZipFile(baseline) as z:
        assert (a.out/'warzone2100.data').read_bytes()==z.read('assets/warzone/warzone2100.data')
        assert (ASSETS/'warzone2100.data').read_bytes()==z.read('assets/warzone/warzone2100.data')
    integration.update({'version':'0.42','emulatorUsed':False,'androidRuntimeExecuted':False,
                        'scope':'Towers-only console and power bar palette from two compiled presentation files; exact 0.41 authored data, package index and existing worker hook retained',
                        'changedVFSFiles':[],'workerHookChanged':False})
    (OUT/'native-runtime-integration.json').write_text(json.dumps(integration,indent=2)+'\n')
    proof={'version':'0.42','passed':True,'emulatorUsed':False,'androidRuntimeExecuted':False,'gameplayVerified':False,
           'scope':'Matched source-built native theme pair; complete authored data and VFS frozen',
           'nativeBuildProof':'archive/native-theme-0.42/native-build.json',
           'nativeRuntimeProof':'archive/native-theme-0.42/native-runtime-integration.json',
           'nativeRuntimeProofSHA256':digest(OUT/'native-runtime-integration.json'),
           'baselineAPK':str(baseline),'baselineSHA256':row['sha256'],
           'changedVFSFiles':[],'addedVFSFiles':[],'removedVFSFiles':[],
           'unchangedVirtualFiles':integration['frozenVirtualFiles'],
           'frozenDataSHA256':integration['frozenDataSHA256'],'frozenPackageIndexSHA256':integration['frozenPackageIndexSHA256'],
           'frozenWorkerOutputHookSHA256':integration['frozenWorkerOutputHookSHA256'],
           'outputs':[{'file':n,'bytes':(a.out/n).stat().st_size,'sha256':digest(a.out/n)}
                      for n in ['warzone2100.js','warzone2100.wasm','warzone2100.data']],
           'recordedUTC':datetime.now(timezone.utc).isoformat()}
    (OUT/'native-payload.json').write_text(json.dumps(proof,indent=2)+'\n')
    if a.install:
        with ZipFile(baseline) as z:
            for n in ['warzone2100.js','warzone2100.wasm']:
                current=(ASSETS/n).read_bytes()
                assert current in [z.read('assets/warzone/'+n),(a.out/n).read_bytes()], 'Current native baseline changed: '+n
        for n in ['warzone2100.wasm','warzone2100.js']: atomic(ASSETS/n,(a.out/n).read_bytes())
    print(json.dumps(proof))


if __name__=='__main__': main()
