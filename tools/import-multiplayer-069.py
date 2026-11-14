"""Reproduce the multiplayer engine from retained, project-local inputs.

The original 0.2 wrapper import was a one-time migration. The integrated
MultiplayerActivity, session, controls and UI under app/src are authoritative.
This tool verifies/reproduces the three engine assets, and can export the old
transport/Activity templates for provenance. It NEVER overwrites app/src.
"""
from pathlib import Path
from hashlib import file_digest, sha256
import argparse
import json
import runpy

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'vendor/multiplayer/source'
ASSETS = ROOT / 'app/src/main/assets/multiplayer'
EXPECTED = {
    'warzone2100.js': '82209a164840bce40a570bfc3e039161f72bc997c2251a88e02cc682d1f053cb',
    'warzone2100.data': '9e89d11c8b67b5f68ddc0be43290233c28cd43b3d2a96fea1a7b4beaf83b8424',
    'warzone2100.wasm': '5cfd676db13c96899a876fbd77197b7092b924ed265feed8594a2356f0b2492d',
}
PROBE = 'Module["getMultiplayerGameMode"]=()=>{growMemViews();return HEAPU32[7015680>>2];};'


def require(value, message):
    if not value:
        raise RuntimeError(message)


def verify_inputs():
    record = json.loads((SOURCE / 'source-inputs.json').read_text(encoding='utf-8'))
    require(record['protocol'] == [16384, 104], 'Unexpected protocol')
    for row in record['files']:
        path = (SOURCE / row['path']).resolve()
        require(path.is_relative_to(SOURCE.resolve()) and path.is_file(), 'Missing source input')
        with path.open('rb') as stream:
            digest = file_digest(stream, 'sha256').hexdigest()
        require(path.stat().st_size == row['bytes'] and digest == row['sha256'],
                'Multiplayer source input changed: ' + row['path'])
    return record


def prepare():
    verify_inputs()
    helpers = runpy.run_path(str(SOURCE / 'tools/prepare.py'), run_name='retained_mp02_preparation')
    files = helpers['prepare']()
    script = files['warzone2100.js'].decode('utf-8')
    marker = 'Module["FS"]=FS;'
    require(script.count(marker) == 1, 'Expected one original FS export')
    script = script.replace(marker, marker + PROBE)
    files['warzone2100.js'] = script.encode('utf-8')
    for name, content in files.items():
        require(sha256(content).hexdigest() == EXPECTED[name], 'Prepared asset differs: ' + name)
    probe = runpy.run_path(str(ROOT / 'tools/verify-multiplayer-state-probe-069.py'),
                          run_name='mp069_probe_verification')
    probe['verify'](SOURCE / 'vendor/stock/warzone2100.wasm',
                    SOURCE / 'vendor/warzone2100-4.7.0-upstream-reference.zip')
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path,
                        help='Optional scratch export directory; app/src destinations are refused')
    parser.add_argument('--check', action='store_true', help='Check current engine assets (the default)')
    args = parser.parse_args()
    files = prepare()
    for name, content in files.items():
        require((ASSETS / name).read_bytes() == content, 'Integrated engine differs: ' + name)
    if args.output_dir:
        out = args.output_dir.resolve()
        require(not out.is_relative_to((ROOT / 'app').resolve()), 'Refusing to overwrite application files')
        out.mkdir(parents=True, exist_ok=True)
        for name, content in files.items():
            (out / name).write_bytes(content)
        templates = out / 'historical-0.2-templates'
        templates.mkdir(exist_ok=True)
        for path in (SOURCE / 'templates').iterdir():
            if path.is_file():
                (templates / path.name).write_bytes(path.read_bytes())
    print(json.dumps({'passed': True, 'protocol': [16384,104],
        'currentAssetsMatchReproduction': True, 'appFilesWritten': False,
        'sourceInputs': 'vendor/multiplayer/source/source-inputs.json',
        'assets': [{'path': name, 'bytes': len(value), 'sha256': sha256(value).hexdigest()}
                   for name, value in files.items()],
        'scratchExport': str(args.output_dir.resolve()) if args.output_dir else None}, indent=2))


if __name__ == '__main__':
    main()
