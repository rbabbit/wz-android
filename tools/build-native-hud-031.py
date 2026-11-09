"""Rebuild the v0.31 native runtime from the complete bundled source and HUD overlay.

Run under Linux/WSL with the same prerequisites as build-native-blueprint.sh.
The existing build recipe is used unchanged except for installing the verified
display3d.cpp overlay immediately after extracting its original source bundle.
"""
from pathlib import Path
from hashlib import sha256
import argparse
import json
import os
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA = 'bcd73267db5cdceaae0b5ca609f549dec872a90f8393f976b0132aff95dd38cb'
OVERLAY_SHA = '3b5c1a41144011805819d15e9bfac6f1289d726da276433bfeb237904c0fa15f'
RECIPE_SHA = '6f3835c7eb8441c216f7e0b056affe22b34eb60e2985341029c866ca75e9bc26'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, help='Empty build workspace, as required by the original recipe')
    parser.add_argument('--baseline-assets', type=Path, default=ROOT / 'app/src/main/assets/warzone')
    parser.add_argument('--verify-only', action='store_true', help='Check recipe, overlay and shell syntax without building')
    args = parser.parse_args()
    recipe = ROOT / 'tools/build-native-blueprint.sh'
    overlay = ROOT / 'archive/native-hud-0.31/display3d.cpp'
    assert sha256(recipe.read_bytes()).hexdigest() == RECIPE_SHA, 'Original build recipe changed'
    assert sha256(overlay.read_bytes()).hexdigest() == OVERLAY_SHA, 'Native source overlay changed'
    code = recipe.read_text()
    anchor = 'test -f "$task_root/source/src/display3d.cpp"\n'
    assert code.count(anchor) == 1
    addition = (
        'test "$(sha256sum "$task_root/source/src/display3d.cpp" | cut -d " " -f 1)" = "' + SOURCE_SHA + '"\n'
        'test "$(sha256sum "$TOWERS_NATIVE_HUD_OVERLAY" | cut -d " " -f 1)" = "' + OVERLAY_SHA + '"\n'
        'cp -- "$TOWERS_NATIVE_HUD_OVERLAY" "$task_root/source/src/display3d.cpp"\n'
    )
    code = code.replace(anchor, anchor + addition, 1)
    if args.verify_only:
        subprocess.run(['bash', '-n'], input=code, text=True, check=True)
        print(json.dumps({'passed': True, 'nativeBuildPerformed': False, 'recipeSHA256': RECIPE_SHA,
                          'sourceOverlaySHA256': OVERLAY_SHA, 'shellSyntaxChecked': True}))
        return
    if args.workspace is None:
        parser.error('--workspace is required to perform the build')
    if os.name == 'nt':
        parser.error('Run the build under Linux/WSL, as with the original native recipe')
    env = dict(os.environ, TOWERS_NATIVE_HUD_OVERLAY=str(overlay))
    subprocess.run(['bash', '-s', '--', str(args.workspace),
                    str(ROOT / 'archive/native-blueprint-4.7.0-source.tar.gz'), str(args.baseline_assets)],
                   input=code, text=True, env=env, check=True)


if __name__ == '__main__':
    main()
