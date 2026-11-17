"""Prepare/publish the exact checked normal 0.89 APK and updater feed only.

Without --publish this performs local proof validation only. Publication uses the
existing owner's SSH key with strict known-host checks. The remote transaction
holds a private lock and backs up the old APK/feed. It atomically replaces the
APK, waits for the full external canonical HTTPS bytes to pass, then replaces
the feed. Any failed/absent acknowledgement after the APK swap restores the old
APK/feed if their current bytes still belong to this transaction. Unknown
concurrent changes are preserved and reported. EOF and catchable SIGHUP/SIGTERM
trigger rollback; SIGKILL/server crash require the retained private recovery
record and backup rather than a claim of automatic rollback.

Required integrity proof: passed, candidateAPK_SHA256, bytes, applicationId,
versionCode, versionName, certificateSHA256, playStoreBuild:false,
allSourceAssetsMatchAPK:true. Runtime proof binds the same hash/version/signer,
passed:true, modesVerified:[towers,ffa,campaign,multiplayer],
nativeSelectionAndBarsVerified:true, navigationAndInputRestored:true, and a
nonempty evidenceFiles:[{path,sha256}] whose local files still match.
No website, Caddy, source archive, signing file or secret is uploaded.
"""
from pathlib import Path
from hashlib import file_digest, sha256
from datetime import datetime, timezone
import argparse
import json
import queue
import shlex
import subprocess
import threading
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
HOST = 'root@wz2100.uk'
APK_NAME = 'warzone2100-andriod.apk'  # Approved canonical spelling.
PUBLIC_APK = 'https://wz2100.uk/downloads/warzone/' + APK_NAME
PUBLIC_FEED = 'https://wz2100.uk/downloads/warzone/latest.json'
REMOTE_FOLDER = '/srv/wz2100/public/downloads/warzone'
APPLICATION_ID = 'com.rbabbit.warzonetowers.lab'
SIGNER = '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
OLD_APK_SHA = '475a4cc87aca6be4348082f7e48b3e22e9eddcf6347475438b4ff06e329ae05b'
OLD_APK_SIZE = 616662059
OLD_FEED_SHA = 'b1c57c84de2b3f862f520629aba9e6653bfd07d2dd49c0aa4568d80a562c7bbe'
OLD_FEED_SIZE = 414


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with Path(path).open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()


def validate_proofs(apk, expected, integrity_path, runtime_path):
    require(len(expected) == 64 and all(c in '0123456789abcdef' for c in expected), 'Invalid expected SHA256')
    require(apk.is_file() and not apk.is_symlink(), 'APK must be a regular local file')
    require(digest(apk) == expected, 'Local delivery APK hash mismatch')
    size = apk.stat().st_size
    require(0 < size <= 2 * 1024**3, 'APK size outside updater bounds')
    integrity = json.loads(integrity_path.read_text(encoding='utf-8-sig'))
    runtime = json.loads(runtime_path.read_text(encoding='utf-8-sig'))
    for name, proof in [('integrity', integrity), ('runtime', runtime)]:
        require(proof.get('passed') is True, name + ' proof has not passed')
        require(proof.get('candidateAPK_SHA256') == expected, name + ' proof is for another APK')
        require(proof.get('versionCode') == 89 and proof.get('versionName') == '0.89', name + ' proof version mismatch')
        require(proof.get('certificateSHA256') == SIGNER, name + ' proof has wrong normal signing chain')
    require(integrity.get('bytes') == size and integrity.get('applicationId') == APPLICATION_ID, 'Integrity identity/size mismatch')
    require(integrity.get('playStoreBuild') is False, 'Only the normal updater build may publish here')
    require(integrity.get('allSourceAssetsMatchAPK') is True, 'Source/APK identity was not verified')
    require(set(runtime.get('modesVerified', [])) == {'towers', 'ffa', 'campaign', 'multiplayer'}, 'Missing required mode runtime evidence')
    require(runtime.get('nativeSelectionAndBarsVerified') is True, 'Native selection/bars runtime check missing')
    require(runtime.get('navigationAndInputRestored') is True, 'Navigation/input restoration runtime check missing')
    evidence = runtime.get('evidenceFiles')
    require(isinstance(evidence, list) and bool(evidence), 'Runtime evidence files are required')
    for entry in evidence:
        require(isinstance(entry, dict) and isinstance(entry.get('path'), str), 'Invalid evidence reference')
        path = Path(entry['path'])
        if not path.is_absolute():
            path = runtime_path.parent / path
        require(path.is_file() and digest(path) == entry.get('sha256'), 'Runtime evidence file missing/changed: ' + str(path))
    return dict(bytes=size, sha256=expected,
                integrityProofSHA256=digest(integrity_path), runtimeProofSHA256=digest(runtime_path))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise RuntimeError('Redirect forbidden for canonical updater URL')


def external_apk(url, expected, size, opener=None):
    require(url == PUBLIC_APK, 'Only the approved canonical APK URL is allowed')
    opener = opener or urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(url, headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'})
    observed, count, started = sha256(), 0, time.monotonic()
    with opener.open(request, timeout=30) as response:
        require(response.status == 200 and response.geturl() == PUBLIC_APK, 'Canonical APK must return a complete HTTP200 response')
        require(response.headers.get('Content-Encoding', 'identity').lower() == 'identity', 'Unexpected APK content encoding')
        require(response.headers.get('Content-Length') == str(size), 'Public APK Content-Length mismatch')
        while chunk := response.read(1024 * 1024):
            count += len(chunk)
            require(count <= size, 'Public APK exceeds verified size')
            require(time.monotonic() - started < 600, 'Full public APK verification timed out')
            observed.update(chunk)
    require(count == size and observed.hexdigest() == expected, 'Full public APK SHA256/byte count mismatch')
    return dict(url=url, bytes=count, sha256=observed.hexdigest(), fullResponseVerified=True)


def external_feed(expected, size, feed_sha):
    opener = urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(PUBLIC_FEED, headers={'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'})
    with opener.open(request, timeout=30) as response:
        require(response.status == 200 and response.geturl() == PUBLIC_FEED, 'Canonical feed response mismatch')
        raw = response.read(32769)
    require(len(raw) <= 32768 and sha256(raw).hexdigest() == feed_sha, 'Public feed bytes differ from staged feed')
    value = json.loads(raw)
    require(value == dict(schemaVersion=1, applicationId=APPLICATION_ID, versionCode=89, versionName='0.89',
                         apkUrl=PUBLIC_APK, sizeBytes=size, sha256=expected,
                         notes='Cleaner selected-unit display and restored ALL COMBAT controls.'), 'Public feed metadata mismatch')
    return dict(url=PUBLIC_FEED, bytes=len(raw), sha256=feed_sha, verified=True)


# Executed only by --publish, in a private remote process; never saved publicly.
# One process keeps flock held through both external-verification handshakes.
REMOTE = r'''
from pathlib import Path
from hashlib import file_digest
from datetime import datetime, timezone
import fcntl, json, os, re, select, shutil, signal, sys

def require(value, message):
    if not value: raise RuntimeError(message)
def digest(path):
    with path.open('rb') as stream: return file_digest(stream,'sha256').hexdigest()
def regular(path):
    return path.is_file() and not path.is_symlink()
def emit(phase, **value):
    print(json.dumps(dict(phase=phase,**value)),flush=True)
def receive(timeout):
    require(bool(select.select([sys.stdin],[],[],timeout)[0]),'Verifier acknowledgement timed out')
    line=sys.stdin.readline()
    require(bool(line),'Verifier disconnected before acknowledgement')
    return json.loads(line)

request=receive(30)
expected,size,run=request['sha256'],request['bytes'],request['run']
require(bool(re.fullmatch('[0-9a-f]{64}',expected)) and type(size) is int and 0<size<=2*1024**3,'Invalid candidate identity')
require(bool(re.fullmatch('[0-9a-f]{32}',run)),'Invalid transaction ID')
root=Path('/srv/wz2100/public');folder=root/'downloads/warzone'
private=Path('/root/warzone-update-backups')
require(root.resolve()==root and folder.resolve()==folder and folder.is_dir(),'Unexpected public folder/symlink')
require(not private.is_symlink(),'Unexpected private backup symlink')
private.mkdir(parents=True,exist_ok=True,mode=0o700);os.chmod(private,0o700)
lockpath=private/'deployment.lock';require(not lockpath.is_symlink(),'Unexpected deployment-lock symlink')
lock=os.open(str(lockpath),os.O_CREAT|os.O_RDWR,0o600)
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
apk=folder/'warzone2100-andriod.apk';oldfeed=folder/'latest.json'
staged=folder/('.candidate-089-'+run+'.apk');feedstage=folder/('.latest-089-'+run+'.json')
guards={root/'index.html':('885948ff9728386a48a3a9521206d61d7bf5132db6ad055d9a71b8e141b32c53',3367),
        Path('/etc/caddy/Caddyfile'):('bba3b110c9a8ddf0a828707cff3bc8f32a6067027531348ba075db27f80beabe',2827)}
oldsha='475a4cc87aca6be4348082f7e48b3e22e9eddcf6347475438b4ff06e329ae05b';oldsize=616662059
oldfeedsha='b1c57c84de2b3f862f520629aba9e6653bfd07d2dd49c0aa4568d80a562c7bbe';oldfeedsize=414
def guard():
    require(all(regular(p) and p.stat().st_size==s and digest(p)==h for p,(h,s) in guards.items()),'Pinned website/Caddy guard changed')
def match(path,sha,size):
    require(regular(path) and path.stat().st_size==size and digest(path)==sha,'File identity changed: '+str(path))
class ConcurrentChange(RuntimeError): pass
def owned(path,allowed):
    if not regular(path): return False
    size=path.stat().st_size
    return any(size==s and digest(path)==h for h,s in allowed)
def require_owned(path,allowed):
    if not owned(path,allowed): raise ConcurrentChange('Unknown concurrent canonical bytes: '+str(path))
guard();match(apk,oldsha,oldsize);match(oldfeed,oldfeedsha,oldfeedsize);match(staged,expected,size)
stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup=private/(stamp+'-0.89-'+run);backup.mkdir(mode=0o700)
shutil.copy2(apk,backup/apk.name);shutil.copy2(oldfeed,backup/oldfeed.name)
match(backup/apk.name,oldsha,oldsize);match(backup/oldfeed.name,oldfeedsha,oldfeedsize)
feed=dict(schemaVersion=1,applicationId='com.rbabbit.warzonetowers.lab',versionCode=89,versionName='0.89',
          apkUrl='https://wz2100.uk/downloads/warzone/warzone2100-andriod.apk',sizeBytes=size,sha256=expected,
          notes='Cleaner selected-unit display and restored ALL COMBAT controls.')
raw=(json.dumps(feed,indent=2)+'\n').encode()
with feedstage.open('xb') as stream: stream.write(raw);stream.flush();os.fsync(stream.fileno())
os.chmod(feedstage,0o644);os.chmod(staged,0o644)
feedsha=digest(feedstage)
record=dict(versionCode=89,versionName='0.89',apkSHA256=expected,bytes=size,backup=str(backup),
            oldAPK_SHA256=oldsha,oldAPKBytes=oldsize,oldFeedSHA256=oldfeedsha,oldFeedBytes=oldfeedsize,feedSHA256=feedsha,
            guards={str(p):h for p,(h,s) in guards.items()},state='prepared',feedPublished=False)
def save():
    destination=backup/'deployment.json'
    temporary=backup/'deployment.json.tmp'
    with temporary.open('w',encoding='utf-8') as stream:
        stream.write(json.dumps(record,indent=2)+'\n');stream.flush();os.fsync(stream.fileno())
    os.chmod(temporary,0o600);os.replace(temporary,destination)
    if hasattr(os,'O_DIRECTORY'):
        directory=os.open(str(backup),os.O_RDONLY|os.O_DIRECTORY)
        try: os.fsync(directory)
        finally: os.close(directory)
def restore(source,destination,suffix,sha,size,allowed):
    temporary=folder/('.rollback-089-'+run+suffix)
    with source.open('rb') as src,temporary.open('xb') as dst:
        shutil.copyfileobj(src,dst,1024*1024);dst.flush();os.fsync(dst.fileno())
    os.chmod(temporary,0o644);match(temporary,sha,size)
    require_owned(destination,allowed);os.replace(temporary,destination)
swapped=False;feed_swapped=False
watched_signals=[value for value in (getattr(signal,'SIGHUP',None),getattr(signal,'SIGTERM',None)) if value is not None]
previous_handlers={value:signal.getsignal(value) for value in watched_signals}
def interrupted(number,frame): raise RuntimeError('Verifier process interrupted by signal '+str(number))
for value in watched_signals: signal.signal(value,interrupted)
try:
    save();guard();match(apk,oldsha,oldsize);match(oldfeed,oldfeedsha,oldfeedsize)
    swapped=True;os.replace(staged,apk);record['state']='apk-swapped-awaiting-full-https';save()
    emit('apk-swapped',**record)
    acknowledgement=receive(900)
    require(acknowledgement==dict(apkVerified=True,sha256=expected,bytes=size),'Full external APK verification failed')
    record['fullExternalAPKVerifiedBeforeFeed']=True;save()
    guard();match(apk,expected,size);match(oldfeed,oldfeedsha,oldfeedsize);match(feedstage,feedsha,len(raw))
    feed_swapped=True;os.replace(feedstage,oldfeed)
    record.update(state='feed-published-awaiting-https',feedPublished=True);guard();save()
    emit('feed-published',**record)
    acknowledgement=receive(120)
    require(acknowledgement==dict(feedVerified=True,sha256=feedsha),'External feed verification failed')
    guard();match(apk,expected,size);match(oldfeed,feedsha,len(raw))
    record.update(state='complete',websiteUnchanged=True,caddyUnchanged=True,externalFeedVerified=True)
    save();emit('complete',**record)
except BaseException as error:
    # Complete a safe rollback despite repeated disconnect/termination signals.
    for value in watched_signals: signal.signal(value,signal.SIG_IGN)
    record.update(state='failed',error=str(error))
    if swapped:
        try:
            apk_allowed=[(oldsha,oldsize),(expected,size)];feed_allowed=[(oldfeedsha,oldfeedsize),(feedsha,len(raw))]
            # Check both before any restoration. Never overwrite an unrelated
            # deployment, even if it ignored this transaction's private lock.
            require_owned(apk,apk_allowed);require_owned(oldfeed,feed_allowed)
            restore(backup/apk.name,apk,'.apk',oldsha,oldsize,apk_allowed)
            if not owned(oldfeed,[(oldfeedsha,oldfeedsize)]):
                restore(backup/oldfeed.name,oldfeed,'.json',oldfeedsha,oldfeedsize,feed_allowed)
            require_owned(apk,apk_allowed);require_owned(oldfeed,feed_allowed)
            match(apk,oldsha,oldsize);match(oldfeed,oldfeedsha,oldfeedsize)
            record.update(state='rolled-back',feedPublished=False,rollbackRemoteVerified=True)
        except ConcurrentChange as rollback_error:
            record.update(state='rollback-refused-concurrent-change',rollbackError=str(rollback_error),rollbackStatusUncertain=True)
        except BaseException as rollback_error:
            record.update(state='rollback-failed',rollbackError=str(rollback_error))
    try: guard();record.update(websiteUnchanged=True,caddyUnchanged=True)
    except BaseException: record.update(websiteUnchanged=False,caddyUnchanged=False)
    save();emit(record['state'],**record);sys.exit(1)
finally:
    for value,handler in previous_handlers.items(): signal.signal(value,handler)
    fcntl.flock(lock,fcntl.LOCK_UN);os.close(lock)
'''


def publish(apk, proof):
    key, known_hosts = Path.home()/'.ssh/rbot_botmaker_ed25519', Path.home()/'.ssh/known_hosts'
    require(key.is_file() and known_hosts.is_file(), 'Existing owner key and known_hosts are required')
    options = ['-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
               '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(known_hosts),
               '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2']
    run = uuid.uuid4().hex
    staged = REMOTE_FOLDER + '/.candidate-089-' + run + '.apk'
    # Only the exact checked APK is transferred; source/signing files never enter scp.
    subprocess.run(['scp', *options, str(apk), HOST + ':' + staged], check=True, timeout=900)
    process = subprocess.Popen(['ssh', *options, HOST, 'python3 -u -c ' + shlex.quote(REMOTE)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding='utf-8', bufsize=1)
    messages = queue.Queue()
    def read_output():
        for line in process.stdout:
            messages.put(line)
        messages.put(None)
    threading.Thread(target=read_output, daemon=True).start()
    def send(value):
        process.stdin.write(json.dumps(value)+'\n');process.stdin.flush()
    def receive(timeout):
        line = messages.get(timeout=timeout)
        if line is None:
            raise RuntimeError('Remote transaction ended: ' + process.stderr.read(4096))
        value = json.loads(line)
        return value
    record = dict(proof, versionCode=89, versionName='0.89', publicAPK=PUBLIC_APK, publicFeed=PUBLIC_FEED,
                  transaction=run, state='staged', feedPublished=False)
    try:
        send(dict(sha256=proof['sha256'], bytes=proof['bytes'], run=run))
        first = receive(180);record.update(first)
        require(first['phase'] == 'apk-swapped', 'Unexpected remote phase: '+json.dumps(first))
        print(json.dumps(dict(phase='verifying-full-public-apk', bytes=proof['bytes'])), flush=True)
        record['externalAPK'] = external_apk(PUBLIC_APK, proof['sha256'], proof['bytes'])
        send(dict(apkVerified=True, sha256=proof['sha256'], bytes=proof['bytes']))
        second = receive(180);record.update(second)
        require(second['phase'] == 'feed-published', 'Unexpected remote feed phase: '+json.dumps(second))
        record['externalFeed'] = external_feed(proof['sha256'], proof['bytes'], second['feedSHA256'])
        send(dict(feedVerified=True, sha256=second['feedSHA256']))
        final = receive(180);record.update(final)
        require(final['phase'] == 'complete', 'Remote publication did not complete: '+json.dumps(final))
        process.stdin.close();require(process.wait(timeout=30) == 0, 'Remote transaction returned failure')
        return record
    except BaseException as error:
        if record.get('state') not in {'rolled-back','rollback-failed','rollback-refused-concurrent-change'}:
            record['state']='failed'
        record.update(error=str(error), localFailure=str(error))
        # EOF is a negative acknowledgement. The remote process keeps its lock
        # and restores its private copies before returning a rollback record.
        try: process.stdin.close()
        except (BrokenPipeError, OSError): pass
        try:
            deadline = time.monotonic() + 180
            while time.monotonic() < deadline:
                try: line = messages.get(timeout=1)
                except queue.Empty:
                    if process.poll() is not None: break
                    continue
                if line is None: break
                value = json.loads(line);record.update(value)
            else:
                record['rollbackStatusUncertain'] = 'Timed out waiting for remote rollback evidence.'
        except ValueError as recovery_error:
            record['rollbackStatusUncertain'] = str(recovery_error)
        try: process.wait(timeout=30)
        except subprocess.TimeoutExpired:
            record['rollbackStatusUncertain'] = 'Remote connection is still running; inspect private backup before retrying.'
        return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', type=Path, default=ROOT.parents[1]/'Warzone-Towers-0.89.apk')
    parser.add_argument('--expected-sha256', required=True)
    parser.add_argument('--integrity-proof', type=Path, default=ROOT/'release-records/apk-integrity.json')
    parser.add_argument('--runtime-proof', type=Path, default=ROOT/'release-records/focused-runtime.json')
    parser.add_argument('--publish', action='store_true', help='Execute the reviewed VPS transaction after all local proof gates pass')
    args = parser.parse_args()
    record = dict(versionCode=89, versionName='0.89', state='failed-preflight', feedPublished=False)
    try:
        proof = validate_proofs(args.apk, args.expected_sha256, args.integrity_proof, args.runtime_proof)
        if not args.publish:
            print(json.dumps(dict(localProofsVerified=True, publicationExecuted=False, **proof), indent=2))
            return
        record = publish(args.apk, proof)
    except BaseException as error:
        record['error'] = str(error)
    record['recordedUTC'] = datetime.now(timezone.utc).isoformat()
    destination = ROOT/'release-records/vps-deployment.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(record, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(record, indent=2))
    if record.get('state') != 'complete':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
