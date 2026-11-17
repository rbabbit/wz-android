"""Publish only the signed APK and update feed; preserve the VPS site/config.

Uses the already configured owner's SSH key, never embeds or uploads secrets or
source. APK identity/signing/package verification must pass before invocation.
"""
from pathlib import Path
from hashlib import file_digest
from datetime import datetime, timezone
import argparse, json, shlex, subprocess, urllib.request

ROOT = Path(__file__).resolve().parents[1]
APK_NAME = 'warzone2100-andriod.apk'  # User-requested spelling.
PUBLIC = 'https://wz2100.uk/downloads/warzone/'

REMOTE = r'''
from pathlib import Path
from hashlib import file_digest
from datetime import datetime, timezone
import json, os, shutil, sys
expected, size, version, version_name, staged_name = sys.argv[1:]
size, version = int(size), int(version)
root = Path('/srv/wz2100/public')
folder = root / 'downloads/warzone'
assert root.resolve() == root and folder.resolve().is_relative_to(root)
assert folder.is_dir() and not folder.is_symlink()
def digest(p):
    with p.open('rb') as stream: return file_digest(stream, 'sha256').hexdigest()
guard = {p: digest(p) for p in [Path('/etc/caddy/Caddyfile'), root/'index.html']}
staged = folder / staged_name
assert staged_name.startswith('.candidate-086-') and staged_name.endswith('.apk')
assert staged.stat().st_size == size and digest(staged) == expected
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = Path('/root/warzone-update-backups') / stamp
backup.mkdir(parents=True, mode=0o700)
for name in ['warzone2100-andriod.apk', 'latest.json']:
    prior = folder/name
    if prior.exists():
        assert prior.is_file() and not prior.is_symlink()
        shutil.copy2(prior, backup/name)
feed = dict(schemaVersion=1, applicationId='com.rbabbit.warzonetowers.lab',
    versionCode=version, versionName=version_name,
    apkUrl='https://wz2100.uk/downloads/warzone/warzone2100-andriod.apk',
    sizeBytes=size, sha256=expected,
    notes='Multiplayer background protection, concise lobby retries, manual updates and manufacturing ALL.')
feed_stage = folder / '.latest-086.json'
feed_stage.write_text(json.dumps(feed, indent=2)+'\n', encoding='utf-8')
os.chmod(staged, 0o644); os.chmod(feed_stage, 0o644)
assert all(digest(p) == sha for p, sha in guard.items()), 'Site changed during preparation'
os.replace(staged, folder/'warzone2100-andriod.apk')
os.replace(feed_stage, folder/'latest.json')
assert all(digest(p) == sha for p, sha in guard.items()), 'Site/config was modified'
record = dict(version=version_name, versionCode=version, apkSHA256=expected,
    bytes=size, publicAPK=feed['apkUrl'], publicFeed='https://wz2100.uk/downloads/warzone/latest.json',
    websiteUnchanged=True, caddyUnchanged=True, backup=str(backup),
    guards={str(p):sha for p,sha in guard.items()}, recordedUTC=stamp)
(backup/'deployment.json').write_text(json.dumps(record, indent=2)+'\n')
print(json.dumps(record))
'''

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, required=True)
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--stage-only', action='store_true')
    parser.add_argument('--publish-staged', action='store_true')
    parser.add_argument('--host', default='root@wz2100.uk')
    parser.add_argument('--key', type=Path, default=Path.home()/'.ssh/rbot_botmaker_ed25519')
    args = parser.parse_args()
    with args.apk.open('rb') as stream: checksum = file_digest(stream, 'sha256').hexdigest()
    assert checksum == args.expected_sha256 and len(checksum) == 64
    proof = json.loads((ROOT/'qa/delivery-086/apk-integrity.json').read_text())
    assert proof['passed'] and proof['candidateAPK_SHA256'] == checksum
    size = args.apk.stat().st_size
    opts = ['-i', str(args.key), '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes']
    folder = '/srv/wz2100/public/downloads/warzone'
    subprocess.run(['ssh', *opts, args.host,
        'install -d -m 755 /srv/wz2100/public/downloads '+folder], check=True)
    staged = '.candidate-086-'+checksum[:16]+'.apk'
    assert not (args.stage_only and args.publish_staged)
    if not args.publish_staged:
        subprocess.run(['scp', *opts, str(args.apk), args.host+':'+folder+'/'+staged], check=True)
    if args.stage_only:
        print(json.dumps(dict(staged=True, feedPublished=False, candidateAPK_SHA256=checksum)))
        return
    command = 'python3 - '+ ' '.join(shlex.quote(v) for v in [checksum, str(size), '86', '0.86', staged])
    result = subprocess.run(['ssh', *opts, args.host, command], input=REMOTE,
        capture_output=True, text=True, check=True)
    record = json.loads(result.stdout)
    request = urllib.request.Request(PUBLIC+'latest.json', headers={'Cache-Control':'no-cache','Accept-Encoding':'identity'})
    with urllib.request.urlopen(request, timeout=30) as response: feed = json.load(response)
    assert feed['sha256'] == checksum and feed['sizeBytes'] == size and feed['versionCode'] == 86
    request = urllib.request.Request(PUBLIC+APK_NAME, headers={'Range':'bytes=0-4095','Accept-Encoding':'identity'})
    with urllib.request.urlopen(request, timeout=30) as response:
        assert response.status == 206 and response.headers['Content-Range'] == f'bytes 0-4095/{size}'
        with args.apk.open('rb') as stream: assert response.read() == stream.read(4096)
    record['externalHTTPSFeedAndAPKRangeVerified'] = True
    (ROOT/'qa/delivery-086/vps-deployment.json').write_text(json.dumps(record, indent=2)+'\n')
    print(json.dumps(record, indent=2))

if __name__ == '__main__': main()
