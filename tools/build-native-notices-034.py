"""Fresh native build with the preserved v0.31 HUD and v0.34 notice overlays.

This uses the pinned original recipe. Authored data must be integrated from the
app; generated stock build data must never replace the game's authored maps.
"""
from pathlib import Path
from hashlib import sha256
import argparse
import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
RECIPE_SHA = '6f3835c7eb8441c216f7e0b056affe22b34eb60e2985341029c866ca75e9bc26'
OVERLAYS = {
    'display3d.cpp': ('archive/native-hud-0.31/display3d.cpp',
                      'bcd73267db5cdceaae0b5ca609f549dec872a90f8393f976b0132aff95dd38cb',
                      '3b5c1a41144011805819d15e9bfac6f1289d726da276433bfeb237904c0fa15f'),
    'research.cpp': ('archive/native-notices-0.34/research.cpp',
                     '7ed1d110344d6db40f40954380bde3b5648f69b962f0b66b5ccab6cae12800ff',
                     '06b8999191bb0160e6b73c268f8ddd69347102133ecc221aee23504973dc918a'),
    'keybind.cpp': ('archive/native-notices-0.34/keybind.cpp',
                    'fc44389817ad6f1e4452db02ce4253ce701aca9406554770a33ad8c7fa9cda4b',
                    'f131e88aef09ddf53f1338b76061863424984e93afb568bde5a3fed722000ce3'),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path)
    parser.add_argument('--baseline-assets', type=Path, default=ROOT / 'app/src/main/assets/warzone')
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--incremental-cache', type=Path,
                        help='Verified prepared cache; builds only the changed native units and links')
    parser.add_argument('--raw-out', type=Path,
                        help='Copy the resulting matched pair and build evidence here')
    args = parser.parse_args()
    recipe = ROOT / 'tools/build-native-blueprint.sh'
    assert sha256(recipe.read_bytes()).hexdigest() == RECIPE_SHA
    code = recipe.read_text()
    anchor = 'test -f "$task_root/source/src/display3d.cpp"\n'
    assert code.count(anchor) == 1
    addition = ''
    env = dict(os.environ)
    for index, (name, (relative, original, expected)) in enumerate(OVERLAYS.items()):
        source = ROOT / relative
        assert sha256(source.read_bytes()).hexdigest() == expected, 'Native source overlay changed'
        variable = f'TOWERS_NATIVE_OVERLAY_{index}'
        env[variable] = str(source)
        addition += (
            f'test "$(sha256sum "$task_root/source/src/{name}" | cut -d " " -f 1)" = "{original}"\n'
            f'test "$(sha256sum "${variable}" | cut -d " " -f 1)" = "{expected}"\n'
            f'cp -- "${variable}" "$task_root/source/src/{name}"\n'
        )
    code = code.replace(anchor, anchor + addition, 1)
    if args.verify_only:
        subprocess.run(['bash', '-n'], input=code, text=True, check=True)
        print(json.dumps({'passed': True, 'nativeBuildPerformed': False,
                          'recipeSHA256': RECIPE_SHA, 'overlayFiles': list(OVERLAYS),
                          'shellSyntaxChecked': True}))
        return
    if args.incremental_cache:
        if os.name == 'nt':
            parser.error('Run the incremental cache under Linux/WSL')
        cache = args.incremental_cache.resolve()
        for name, (_, _, expected) in OVERLAYS.items():
            assert sha256((cache / 'source/src' / name).read_bytes()).hexdigest() == expected
        assert sha256((cache / 'build/src/warzone2100.js').read_bytes()).hexdigest() == 'a210b24220efc30a3e5e9bf87f50d61fd4564b0c5b56e1ce9e964e7eaf18d179'
        assert sha256((cache / 'build/src/warzone2100.wasm').read_bytes()).hexdigest() == 'c69a9d1a3873aa23e774524b67db0cb1257a8326904ed06eddca7b45691eba78'
        out = args.raw_out or ROOT.parent / '_release-records/native-notices034/raw'
        out.mkdir(parents=True, exist_ok=True)
        log = out / 'native-notices-incremental-build.log'
        command = ['bash', '-c', 'source "$1/emsdk/emsdk_env.sh" && cmake --build "$1/build" --target warzone2100 --parallel 4',
                   'native-notices-034', str(cache)]
        with log.open('w') as stream:
            subprocess.run(command, stdout=stream, stderr=subprocess.STDOUT, check=True, timeout=480)
        build_text = log.read_text()
        compiled = re.findall(r'Building CXX object (\S+)', build_text)
        assert sorted(compiled) == sorted([
            'src/CMakeFiles/warzone2100.dir/research.cpp.o',
            'src/CMakeFiles/warzone2100.dir/keybind.cpp.o']), 'Unexpected native compilation scope'
        result = {'version': '0.34', 'passed': True,
                  'emulatorUsed': False,
                  'nativeBuildPerformed': True, 'nativeFullFreshBuildPerformed': False,
                  'method': 'Verified ready source cache incremental compilation and native link',
                  'cachePath': str(cache), 'command': command,
                  'compiledObjects': compiled,
                  'relinkedNativeEngine': bool(re.search(r'Linking CXX executable.*warzone2100', build_text)),
                  'sourceOverlays': {name: expected for name, (_, _, expected) in OVERLAYS.items()},
                  'sourceOverlay': 'archive/native-notices-0.34/source-overlay.json',
                  'sourceOverlaySHA256': sha256((ROOT / 'archive/native-notices-0.34/source-overlay.json').read_bytes()).hexdigest(),
                  'originalBuildRecipeSHA256': RECIPE_SHA,
                  'logSHA256': sha256(log.read_bytes()).hexdigest(),
                  'recordedUTC': datetime.now(timezone.utc).isoformat(), 'raw': []}
        for name in ('warzone2100.js', 'warzone2100.wasm'):
            target = out / name
            shutil.copy2(cache / 'build/src' / name, target)
            result['raw'].append({'file': name, 'sha256': sha256(target.read_bytes()).hexdigest(),
                                  'bytes': target.stat().st_size})
        (out / 'native-notices-build.json').write_text(json.dumps(result, indent=2) + '\n')
        print(json.dumps(result))
        return
    if args.workspace is None:
        parser.error('--workspace is required to build')
    if os.name == 'nt':
        parser.error('Run under Linux/WSL with the pinned native build prerequisites')
    subprocess.run(['bash', '-s', '--', str(args.workspace),
                    str(ROOT / 'archive/native-blueprint-4.7.0-source.tar.gz'),
                    str(args.baseline_assets)], input=code, text=True, env=env, check=True)


if __name__ == '__main__':
    main()
