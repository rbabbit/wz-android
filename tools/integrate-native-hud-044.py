"""Integrate the matched HUD/autosave build with exact v0.43 authored data.

Only the compiled JS/WASM pair changes. No scenario, VFS, worker hook or data
entry is modified, and no engine/gameplay runtime is executed.
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

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'archive/native-hud-0.44'
ASSETS=ROOT/'app/src/main/assets/warzone'


def digest(path):
    value=sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(8*1024*1024),b''):value.update(block)
    return value.hexdigest()


def atomic(path,value):
    with tempfile.NamedTemporaryFile(dir=path.parent,prefix='.hud044-',suffix='.tmp',delete=False) as stream:
        stage=Path(stream.name);stream.write(value);stream.flush();os.fsync(stream.fileno())
    try:
        assert stage.read_bytes()==value
        os.replace(stage,path)
    finally:
        if stage.exists():stage.unlink()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--install',action='store_true')
    args=parser.parse_args()
    assert ROOT not in args.out.resolve().parents
    frozen=json.loads((ROOT/'archive/fallback-0.44.json').read_text(encoding='utf-8-sig'))
    row=next(r for r in frozen['files'] if r['path'].endswith('.apk'))
    baseline=Path(row['path'])
    assert baseline.stat().st_size==row['bytes'] and digest(baseline)==row['sha256']
    build=json.loads((OUT/'native-build.json').read_text())
    assert build['version']=='0.44' and build['passed'] and build['nativeFullFreshBuildPerformed'] is False
    assert sorted(build['compiledObjects'])==['src/CMakeFiles/warzone2100.dir/intdisplay.cpp.o','src/CMakeFiles/warzone2100.dir/loadsave.cpp.o']
    for entry in build['raw']:
        path=args.raw/entry['file'];assert path.stat().st_size==entry['bytes'] and digest(path)==entry['sha256']
    subprocess.run([sys.executable,str(ROOT/'tools/integrate-native-runtime.py'),
        '--raw-js',str(args.raw/'warzone2100.js'),'--raw-wasm',str(args.raw/'warzone2100.wasm'),
        '--baseline-apk',str(baseline),'--out',str(args.out)],check=True,stdout=subprocess.DEVNULL)
    runtime=json.loads((args.out/'native-runtime-integration.json').read_text())
    assert runtime['passed'] and runtime['generatedCodeUnchangedOutsideIndexAndExistingWorkerHook']
    with ZipFile(baseline) as archive:
        original_data=archive.read('assets/warzone/warzone2100.data')
        assert (args.out/'warzone2100.data').read_bytes()==original_data
        assert (ASSETS/'warzone2100.data').read_bytes()==original_data
    runtime.update({'version':'0.44','emulatorUsed':False,'androidRuntimeExecuted':False,
        'scope':'Source-built Towers gauge/autosave patch with exact v0.43 authored data, package index and existing worker hook',
        'changedVFSFiles':[],'workerHookChanged':False})
    (OUT/'native-runtime-integration.json').write_text(json.dumps(runtime,indent=2)+'\n')
    proof={'version':'0.44','passed':True,'emulatorUsed':False,'androidRuntimeExecuted':False,'gameplayVerified':False,
        'scope':'Matched two-object Towers gauge/autosave build; complete authored data and VFS frozen',
        'nativeBuildProof':'archive/native-hud-0.44/native-build.json','nativeBuildProofSHA256':digest(OUT/'native-build.json'),
        'nativeRuntimeProof':'archive/native-hud-0.44/native-runtime-integration.json',
        'nativeRuntimeProofSHA256':digest(OUT/'native-runtime-integration.json'),
        'baselineAPK':str(baseline),'baselineSHA256':row['sha256'],
        'changedVFSFiles':[],'addedVFSFiles':[],'removedVFSFiles':[],
        'unchangedVirtualFiles':runtime['frozenVirtualFiles'],'frozenDataSHA256':runtime['frozenDataSHA256'],
        'frozenPackageIndexSHA256':runtime['frozenPackageIndexSHA256'],
        'frozenWorkerOutputHookSHA256':runtime['frozenWorkerOutputHookSHA256'],
        'outputs':[{'file':name,'bytes':(args.out/name).stat().st_size,'sha256':digest(args.out/name)}
            for name in ['warzone2100.js','warzone2100.wasm','warzone2100.data']],
        'recordedUTC':datetime.now(timezone.utc).isoformat()}
    (OUT/'native-payload.json').write_text(json.dumps(proof,indent=2)+'\n')
    if args.install:
        with ZipFile(baseline) as archive:
            for name in ['warzone2100.js','warzone2100.wasm']:
                assert (ASSETS/name).read_bytes() in [archive.read('assets/warzone/'+name),(args.out/name).read_bytes()]
        for name in ['warzone2100.wasm','warzone2100.js']:atomic(ASSETS/name,(args.out/name).read_bytes())
    print(json.dumps(proof))


if __name__=='__main__':main()
