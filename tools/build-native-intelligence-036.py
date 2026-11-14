"""Build native v0.36 from the pinned source plus cumulative notice overlays.

Fresh mode uses the original recipe. Incremental mode validates the existing
v0.35 cache and builds only hci.cpp before one link; no stock data is shipped.
"""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import argparse
import json
import os
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RECIPE_SHA = '6f3835c7eb8441c216f7e0b056affe22b34eb60e2985341029c866ca75e9bc26'
OVERLAYS = {
    'display3d.cpp': ('archive/native-hud-0.31/display3d.cpp',
                      'bcd73267db5cdceaae0b5ca609f549dec872a90f8393f976b0132aff95dd38cb',
                      '3b5c1a41144011805819d15e9bfac6f1289d726da276433bfeb237904c0fa15f'),
    'research.cpp': ('archive/native-notices-0.34/research.cpp',
                     '7ed1d110344d6db40f40954380bde3b5648f69b962f0b66b5ccab6cae12800ff',
                     '06b8999191bb0160e6b73c268f8ddd69347102133ecc221aee23504973dc918a'),
    'keybind.cpp': ('archive/native-notices-0.35/keybind.cpp',
                    'fc44389817ad6f1e4452db02ce4253ce701aca9406554770a33ad8c7fa9cda4b',
                    '5730cf9a2b791a6a437f4e0da040e9dbb75e8befb48dc02caefb1a8e824355ed'),
    'hci.cpp': ('archive/native-intelligence-0.36/hci.cpp',
                'aefa455ef2b228f8590b7d9a0aa6b18be70eb1dc2b82fde63116a57846782462',
                '9db6bef46703c3975d920a23cc071ea46ab938a3972204ca5325440e8e66e842'),
}


def digest(data):
    return sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path)
    parser.add_argument('--baseline-assets', type=Path, default=ROOT / 'app/src/main/assets/warzone')
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--incremental-cache', type=Path)
    parser.add_argument('--raw-out', type=Path)
    args = parser.parse_args()
    recipe = ROOT / 'tools/build-native-blueprint.sh'
    assert digest(recipe.read_bytes()) == RECIPE_SHA
    code = recipe.read_text()
    anchor = 'test -f "$task_root/source/src/display3d.cpp"\n'
    assert code.count(anchor) == 1
    addition = ''
    env = dict(os.environ)
    for index, (name, (relative, original, expected)) in enumerate(OVERLAYS.items()):
        source = ROOT / relative
        assert digest(source.read_bytes()) == expected
        variable = f'TOWERS_NATIVE_OVERLAY_{index}'
        env[variable] = str(source)
        addition += (
            f'test "$(sha256sum "$task_root/source/src/{name}" | cut -d " " -f 1)" = "{original}"\n'
            f'test "$(sha256sum "${variable}" | cut -d " " -f 1)" = "{expected}"\n'
            f'cp -- "${variable}" "$task_root/source/src/{name}"\n')
    code = code.replace(anchor, anchor + addition, 1)
    if args.verify_only:
        subprocess.run(['bash', '-n'], input=code, text=True, check=True)
        print(json.dumps({'passed':True,'nativeBuildPerformed':False,'recipeSHA256':RECIPE_SHA,
                          'overlayFiles':list(OVERLAYS),'shellSyntaxChecked':True}))
        return
    if os.name == 'nt':
        parser.error('Run the pinned native toolchain under Linux/WSL')
    if args.incremental_cache:
        cache = args.incremental_cache.resolve()
        for name, (_, _, expected) in OVERLAYS.items():
            assert digest((cache / 'source/src' / name).read_bytes()) == expected
        assert digest((cache / 'build/src/warzone2100.js').read_bytes()) == '8a6a88e7d302722ce1095d3c2d194a5f1212fd947e36ded4c3a8679d4145e0c2'
        assert digest((cache / 'build/src/warzone2100.wasm').read_bytes()) == '120457e5db655d819436f3c5315991cb013f771e01ace7a872469e0844796380'
        out = args.raw_out or ROOT.parent / '_release-records/native-intelligence036/raw'
        out.mkdir(parents=True, exist_ok=True)
        log = out / 'native-intelligence-incremental-build.log'
        command = ['bash', '-c', 'source "$1/emsdk/emsdk_env.sh" && cmake --build "$1/build" --target warzone2100 --parallel 4',
                   'native-intelligence-036', str(cache)]
        with log.open('w') as stream:
            subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, check=True, timeout=480)
        build_text = log.read_text()
        compiled = re.findall(r'Building CXX object (\S+)', build_text)
        assert compiled == ['src/CMakeFiles/warzone2100.dir/hci.cpp.o'], 'Unexpected native compile scope'
        assert re.search(r'Linking CXX executable.*warzone2100', build_text)
        record = {'version':'0.36','passed':True,'emulatorUsed':False,'nativeBuildPerformed':True,
                  'nativeFullFreshBuildPerformed':False,'compiledObjects':compiled,'relinkedNativeEngine':True,
                  'method':'Verified v0.35 source cache; one hci.cpp compile and one matched native link',
                  'cachePath':str(cache),'command':command,'originalBuildRecipeSHA256':RECIPE_SHA,
                  'sourceOverlay':'archive/native-intelligence-0.36/source-overlay.json',
                  'sourceOverlaySHA256':digest((ROOT / 'archive/native-intelligence-0.36/source-overlay.json').read_bytes()),
                  'sourceOverlays':{name:expected for name,(_,_,expected) in OVERLAYS.items()},
                  'logSHA256':digest(log.read_bytes()),'recordedUTC':datetime.now(timezone.utc).isoformat(),'raw':[]}
        for name in ['warzone2100.js','warzone2100.wasm']:
            target = out / name
            shutil.copy2(cache / 'build/src' / name, target)
            record['raw'].append({'file':name,'sha256':digest(target.read_bytes()),'bytes':target.stat().st_size})
        (out / 'native-intelligence-build.json').write_text(json.dumps(record,indent=2)+'\n')
        print(json.dumps(record))
        return
    if args.workspace is None:
        parser.error('--workspace or --incremental-cache is required')
    subprocess.run(['bash','-s','--',str(args.workspace),
                    str(ROOT / 'archive/native-blueprint-4.7.0-source.tar.gz'),str(args.baseline_assets)],
                   input=code,text=True,env=env,check=True)


if __name__ == '__main__':
    main()
