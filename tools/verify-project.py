"""Hash the archived working tree, without requiring Android or third-party packages."""
from pathlib import Path
from hashlib import sha256
import argparse, json, subprocess

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'archive/repository-files.json'

def digest(file):
    checksum = sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(block)
    return checksum.hexdigest()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--refresh', action='store_true', help='Record an intentionally updated working tree')
args = parser.parse_args()
if args.refresh:
    names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode('utf8').split('\0')
    entries = []
    for name in sorted(set(names)):
        if not name or name == MANIFEST.relative_to(ROOT).as_posix():
            continue
        file = ROOT / name
        if file.is_file():
            entries.append({'path': name, 'bytes': file.stat().st_size, 'sha256': digest(file)})
    MANIFEST.write_text(json.dumps({'schemaVersion': 1, 'files': entries}, indent=2) + '\n', encoding='utf8')
    print(f'Recorded {len(entries)} project files')
else:
    errors = []
    entries = json.loads(MANIFEST.read_text(encoding='utf8'))['files']
    for entry in entries:
        file = (ROOT / entry['path']).resolve()
        if not file.is_relative_to(ROOT) or not file.is_file():
            errors.append(entry['path'] + ': missing or invalid path')
        elif file.stat().st_size != entry['bytes'] or digest(file) != entry['sha256']:
            errors.append(entry['path'] + ': content differs from saved snapshot')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Verified {len(entries)} project files, including engine, assets, mod/map and evidence')
