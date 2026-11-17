"""Host-only deployment checks. No SSH, network or real VPS paths are used."""
from pathlib import Path
from hashlib import sha256
import ast
import contextlib
import io
import json
import runpy
import select
import subprocess
import sys
import tempfile
import types
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT/'tools/deploy-warzone-update-089.py'
checks = []


def forbidden(*args, **kwargs):
    raise AssertionError('SSH/process/network execution is forbidden in this host check')


subprocess.run = forbidden
subprocess.Popen = forbidden
urllib.request.urlopen = forbidden
urllib.request.OpenerDirector.open = forbidden
module = runpy.run_path(str(FILE), run_name='host_guard_check')


def check(name, run):
    run()
    checks.append(name)
    print('PASS ' + name)


def rejected(run):
    try:
        run()
    except (RuntimeError, ValueError, KeyError):
        return
    raise AssertionError('Invalid guard input was accepted')


def syntax():
    ast.parse(FILE.read_text(encoding='utf-8'))
    ast.parse(module['REMOTE'])
    remote = module['REMOTE']
    assert remote.index('os.replace(staged,apk)') < remote.index('acknowledgement=receive(900)') < remote.index('os.replace(feedstage,oldfeed)')
    assert 'StrictHostKeyChecking=yes' in FILE.read_text(encoding='utf-8')


def proofs():
    with tempfile.TemporaryDirectory(prefix='warzone-proof-host-') as directory:
        folder = Path(directory)
        apk, evidence = folder/'candidate.apk', folder/'actual-runtime.json'
        apk.write_bytes(b'fixture APK bytes only')
        evidence.write_bytes(b'explicitly mocked runtime evidence')
        checksum = sha256(apk.read_bytes()).hexdigest()
        integrity = dict(passed=True, candidateAPK_SHA256=checksum, bytes=apk.stat().st_size,
                         applicationId=module['APPLICATION_ID'], versionCode=89, versionName='0.89',
                         certificateSHA256=module['SIGNER'], playStoreBuild=False, allSourceAssetsMatchAPK=True)
        runtime = dict(passed=True, candidateAPK_SHA256=checksum, versionCode=89, versionName='0.89',
                       certificateSHA256=module['SIGNER'], modesVerified=['towers','ffa','campaign','multiplayer'],
                       nativeSelectionAndBarsVerified=True, navigationAndInputRestored=True,
                       evidenceFiles=[dict(path=evidence.name, sha256=sha256(evidence.read_bytes()).hexdigest())])
        ip, rp = folder/'integrity.json', folder/'runtime.json'
        def validate():
            ip.write_text(json.dumps(integrity));rp.write_text(json.dumps(runtime))
            return module['validate_proofs'](apk, checksum, ip, rp)
        assert validate()['bytes'] == apk.stat().st_size
        ip.write_text(json.dumps(integrity),encoding='utf-8-sig');rp.write_text(json.dumps(runtime),encoding='utf-8-sig')
        assert module['validate_proofs'](apk,checksum,ip,rp)['bytes']==apk.stat().st_size
        for target, name, bad in [(integrity,'passed',False),(integrity,'playStoreBuild',True),
                                  (integrity,'allSourceAssetsMatchAPK',False),(integrity,'certificateSHA256','0'*64),
                                  (integrity,'bytes',999),(integrity,'versionCode',88),
                                  (runtime,'candidateAPK_SHA256','0'*64),(runtime,'modesVerified',['towers']),
                                  (runtime,'nativeSelectionAndBarsVerified',False),(runtime,'evidenceFiles',[])]:
            previous = target[name];target[name] = bad;rejected(validate);target[name] = previous
        evidence.write_bytes(b'changed after recording');rejected(validate)


def http_stream():
    value = b'whole streamed public APK fixture'
    checksum = sha256(value).hexdigest()
    class Response(io.BytesIO):
        status = 200
        headers = {'Content-Length':str(len(value))}
        def geturl(self): return module['PUBLIC_APK']
    class Opener:
        response = Response
        payload = value
        def open(self, request, timeout):
            assert request.full_url == module['PUBLIC_APK'] and not request.has_header('Range')
            return self.response(self.payload)
    opener = Opener()
    assert module['external_apk'](module['PUBLIC_APK'],checksum,len(value),opener)['bytes'] == len(value)
    opener.payload = value[:-1];rejected(lambda: module['external_apk'](module['PUBLIC_APK'],checksum,len(value),opener))
    opener.payload = value + b'oversize';rejected(lambda: module['external_apk'](module['PUBLIC_APK'],checksum,len(value),opener))
    opener.payload = b'x'*len(value);rejected(lambda: module['external_apk'](module['PUBLIC_APK'],checksum,len(value),opener))
    opener.payload = value;Response.status = 206;rejected(lambda: module['external_apk'](module['PUBLIC_APK'],checksum,len(value),opener))
    Response.status = 200;Response.geturl = lambda self:'https://other.example/changed.apk'
    rejected(lambda: module['external_apk'](module['PUBLIC_APK'],checksum,len(value),opener))
    rejected(lambda: module['external_apk']('http://wz2100.uk/downloads/warzone/warzone2100-andriod.apk',checksum,len(value),opener))


def transaction(acknowledgement):
    # Execute the actual remote transaction on temporary files only. Rewrite
    # absolute VPS paths and pinned fixture identities; mock Linux flock/stdin.
    # HTTPS streaming itself is separately exercised above, never requested here.
    with tempfile.TemporaryDirectory(prefix='warzone-transaction-host-') as directory:
        folder = Path(directory).resolve()
        public, private, caddy = folder/'public', folder/'private', folder/'Caddyfile'
        downloads = public/'downloads/warzone';downloads.mkdir(parents=True)
        old, new, previous_feed = b'old fixture APK', b'new fixture APK', b'old feed fixture'
        index, configuration = b'fixed site fixture', b'fixed Caddy fixture'
        (public/'index.html').write_bytes(index);caddy.write_bytes(configuration)
        apk, feed = downloads/module['APK_NAME'], downloads/'latest.json'
        apk.write_bytes(old);feed.write_bytes(previous_feed)
        run = 'a'*32;checksum = sha256(new).hexdigest()
        (downloads/('.candidate-089-'+run+'.apk')).write_bytes(new)
        metadata = dict(schemaVersion=1, applicationId=module['APPLICATION_ID'], versionCode=89, versionName='0.89',
                        apkUrl=module['PUBLIC_APK'], sizeBytes=len(new), sha256=checksum,
                        notes='Cleaner selected-unit display and restored ALL COMBAT controls.')
        feed_sha = sha256((json.dumps(metadata,indent=2)+'\n').encode()).hexdigest()
        remote = module['REMOTE'].replace("Path('/srv/wz2100/public')", 'Path('+repr(str(public))+')')
        remote = remote.replace("Path('/root/warzone-update-backups')", 'Path('+repr(str(private))+')')
        remote = remote.replace("Path('/etc/caddy/Caddyfile')", 'Path('+repr(str(caddy))+')')
        for before, after in [(module['OLD_APK_SHA'],sha256(old).hexdigest()),(module['OLD_FEED_SHA'],sha256(previous_feed).hexdigest()),
                              ('885948ff9728386a48a3a9521206d61d7bf5132db6ad055d9a71b8e141b32c53',sha256(index).hexdigest()),
                              ('bba3b110c9a8ddf0a828707cff3bc8f32a6067027531348ba075db27f80beabe',sha256(configuration).hexdigest()),
                              ('oldsize=616662059','oldsize='+str(len(old))),('oldfeedsize=414','oldfeedsize='+str(len(previous_feed))),
                              (",3367)",','+str(len(index))+')'),(",2827)",','+str(len(configuration))+')')]:
            remote = remote.replace(before,after)
        messages = [dict(sha256=checksum,bytes=len(new),run=run)]
        if acknowledgement != 'disconnect':
            messages.append(dict(apkVerified=True,sha256=checksum,bytes=len(new)) if acknowledgement not in {'apk-failed','concurrent-apk','concurrent-feed'} else dict(apkVerified=False))
            messages.append(dict(feedVerified=True,sha256=feed_sha) if acknowledgement != 'feed-failed' else dict(feedVerified=False))
        stdin, stdout = io.StringIO('\n'.join(map(json.dumps,messages))+'\n'), io.StringIO()
        flock = types.ModuleType('fcntl');flock.flock=lambda *args:None;flock.LOCK_EX=1;flock.LOCK_NB=2;flock.LOCK_UN=8
        previous_fcntl = sys.modules.get('fcntl');sys.modules['fcntl'] = flock
        signals=types.ModuleType('signal');signals.SIGHUP=1;signals.SIGTERM=15;signals.SIG_IGN='ignored';handlers={}
        signals.getsignal=lambda number:handlers.get(number)
        def set_signal(number,handler):
            previous=handlers.get(number);handlers[number]=handler;return previous
        signals.signal=set_signal
        previous_signal=sys.modules.get('signal');sys.modules['signal']=signals
        receives=0
        def readable(*args):
            nonlocal receives
            receives+=1
            if receives==2:
                if acknowledgement=='concurrent-apk': apk.write_bytes(b'UNKNOWN concurrent APK')
                if acknowledgement=='concurrent-feed': feed.write_bytes(b'UNKNOWN concurrent feed')
                if acknowledgement=='signal-hup': handlers[signals.SIGHUP](signals.SIGHUP,None)
            return ([stdin],[],[])
        previous_select = select.select;select.select=readable
        try:
            with contextlib.redirect_stdin(stdin) if hasattr(contextlib,'redirect_stdin') else contextlib.nullcontext():
                previous_stdin=sys.stdin;sys.stdin=stdin
                try:
                    with contextlib.redirect_stdout(stdout):
                        try: exec(compile(remote,'remote-temporary-host-fixture','exec'),{})
                        except SystemExit as error: assert error.code == 1 and acknowledgement != 'success'
                finally: sys.stdin=previous_stdin
        finally:
            select.select=previous_select
            if previous_fcntl is None: del sys.modules['fcntl']
            else: sys.modules['fcntl']=previous_fcntl
            if previous_signal is None: del sys.modules['signal']
            else: sys.modules['signal']=previous_signal
        phases = [json.loads(line) for line in stdout.getvalue().splitlines()]
        if acknowledgement == 'success':
            assert phases[-1]['phase']=='complete' and apk.read_bytes()==new and json.loads(feed.read_bytes())==metadata
            assert phases[-1]['fullExternalAPKVerifiedBeforeFeed'] is True
        elif acknowledgement in {'concurrent-apk','concurrent-feed'}:
            assert phases[-1]['phase']=='rollback-refused-concurrent-change'
            assert apk.read_bytes()==(b'UNKNOWN concurrent APK' if acknowledgement=='concurrent-apk' else new)
            assert feed.read_bytes()==(b'UNKNOWN concurrent feed' if acknowledgement=='concurrent-feed' else previous_feed)
        else:
            assert phases[-1]['phase']=='rolled-back' and phases[-1]['rollbackRemoteVerified'] is True
            assert apk.read_bytes()==old and feed.read_bytes()==previous_feed
        assert (public/'index.html').read_bytes()==index and caddy.read_bytes()==configuration
        backups=list(private.glob('*-0.89-*'));assert len(backups)==1
        assert (backups[0]/module['APK_NAME']).read_bytes()==old and (backups[0]/'latest.json').read_bytes()==previous_feed


check('Local/remote Python syntax and APK-before-verification-before-feed order',syntax)
check('Exact normal identity, signer, runtime modes and immutable evidence proof gates',proofs)
check('Canonical full HTTP200 stream verifies every byte/hash and rejects truncated/partial/changed responses',http_stream)
check('Actual remote protocol completes in an isolated local temporary filesystem',lambda:transaction('success'))
check('Actual remote protocol restores private backup after failed APK verification acknowledgement',lambda:transaction('apk-failed'))
check('Actual remote protocol restores APK and feed after failed feed verification acknowledgement',lambda:transaction('feed-failed'))
check('Verifier disconnect/EOF restores the old APK without publishing the feed',lambda:transaction('disconnect'))
check('Unknown concurrent canonical APK bytes are preserved and rollback is refused before touching either file',lambda:transaction('concurrent-apk'))
check('Unknown concurrent canonical feed bytes are preserved and rollback is refused before touching either file',lambda:transaction('concurrent-feed'))
check('Registered SIGHUP callback dispatch enters rollback and restores the old artifacts',lambda:transaction('signal-hup'))
report=dict(passed=True,checks=checks,SSHExecuted=False,networkExecuted=False,realDeploymentExecuted=False,
            scope='Host-only AST, guard, HTTP-response mocks and actual transaction code against rewritten temporary fixture paths; Linux flock and SIGHUP dispatch mocked.')
(ROOT/'release-records/vps-deploy-guard-checks.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(dict(passed=True,checks=len(checks),SSHExecuted=False,networkExecuted=False)))
