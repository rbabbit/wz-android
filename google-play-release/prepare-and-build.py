"""Apply the guarded Play overlay to a freshly extracted complete source snapshot."""
from pathlib import Path
from hashlib import sha256
import argparse, json, shutil, subprocess, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply-only', action='store_true')
    args, build_args = parser.parse_known_args()
    manifest = json.loads((HERE/'overlay-manifest.json').read_text(encoding='utf-8'))
    for row in manifest['files']:
        source = HERE/'overrides'/row['path']
        destination = ROOT/row['path']
        if not destination.resolve().is_relative_to(ROOT.resolve()):
            raise SystemExit('Invalid overlay path')
        if sha256(source.read_bytes()).hexdigest() != row['playSHA256']:
            raise SystemExit('Overlay content differs: '+row['path'])
        current = sha256(destination.read_bytes()).hexdigest() if destination.is_file() else None
        if current not in (row['baselineSHA256'], row['playSHA256']):
            raise SystemExit('Preserve local edits before applying overlay: '+row['path'])
    for row in manifest['files']:
        destination = ROOT/row['path']
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(HERE/'overrides'/row['path'], destination)
    print('Applied the verified Google Play source profile.')
    if not args.apply_only:
        raise SystemExit(subprocess.run([sys.executable, str(ROOT/'tools/build-play-release.py'), *build_args], cwd=ROOT).returncode)

if __name__ == '__main__':
    main()
