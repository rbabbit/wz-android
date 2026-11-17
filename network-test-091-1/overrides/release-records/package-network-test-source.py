"""Prepare complete network TEST source; package only a sealed truthful phone outcome."""
from pathlib import Path, PurePosixPath
from hashlib import file_digest, sha256
import argparse, json, re, shutil, subprocess, sys, uuid, zipfile
ROOT = Path(__file__).resolve().parents[1]
BASE = Path('C:/timerApp/warzone-towers-0.91-test-source.zip')
BASE_SHA = '95260d19f6a4465e8578ea4481f252d6f81a10f90b4e31e65c48906d8474ec42'
OUTPUT = Path('C:/timerApp/warzone-towers-0.91-network.1-test-source.zip')
NAME = 'network-test-091-1'
PROFILE = ROOT / 'source-overlay' / NAME
RUNTIME = ROOT.parents[1] / 'mobile-network-test-20261117'
SIGNER = '4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
ASSETS = {'multiplayer/lobby-http.js', 'multiplayer/lobby-ui.js'}

def document(data):
    return json.loads(data.decode('utf-8-sig'))

def require(value, message):
    if not value:
        raise RuntimeError(message)

def digest(path):
    with Path(path).open('rb') as stream:
        return file_digest(stream, 'sha256').hexdigest()

def readjson(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value)

def jwrite(path, value):
    write(path, (json.dumps(value, indent=2) + '\n').encode())

def safe(name):
    p = PurePosixPath(name)
    require(name and str(p) == name and (not p.is_absolute()) and ('..' not in p.parts) and ('\\' not in name) and (':' not in name), 'Unsafe profile path')
    return name

def target(name):
    p = PROFILE / safe(name)
    require(not PROFILE.is_symlink() and (not p.is_symlink()) and p.resolve().is_relative_to(PROFILE.resolve()), 'Unsafe audit attachment target')
    return p

def bounded(path, limit):
    require(path.is_file() and (not path.is_symlink()) and (0 < path.stat().st_size <= limit), 'Invalid/oversized proof file')
    with path.open('rb') as stream:
        data = stream.read(limit + 1)
    require(0 < len(data) <= limit, 'Proof grew beyond bound')
    return data

def stage(payloads):
    for name, data in payloads:
        secret_check(name, data)
        p = target(name)
        if p.exists():
            require(p.is_file() and digest(p) == sha256(data).hexdigest(), 'Preserve changed prepared audit attachment')
    for name, data in payloads:
        write(target(name), data)

def secret_check(name, data):
    require(Path(name).name not in {'local.properties', '.env', 'id_rsa', 'id_ed25519', 'known_hosts'} and Path(name).suffix.lower() not in {'.jks', '.keystore', '.key', '.pem', '.p12'}, 'Sensitive source path refused')
    require(not any(b'-----BEGIN ' + x + b'-----' in data for x in
                    [b'PRIVATE KEY', b'OPENSSH PRIVATE KEY', b'RSA PRIVATE KEY']), 'Private key bytes refused')
    if Path(name).suffix.lower() == '.json':
        private = {'password', 'hostpassword', 'gamepassword', 'keystorepassword', 'jointoken', 'jointokens', 'hosttoken', 'lobbyconnecttoken',
                   'authorization', 'cookie', 'setcookie', 'attest', 'signature',
                   'phoneserial', 'deviceserial', 'ssid'}
        def inspect(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    normalized = re.sub('[^a-z0-9]', '', key.lower())
                    uia_false = (normalized == 'password' and item == 'false'
                                 and {'class', 'resource-id', 'bounds'} <= value.keys()
                                 and isinstance(value['class'], str) and bool(value['class'])
                                 and isinstance(value['resource-id'], str)
                                 and isinstance(value['bounds'], str)
                                 and re.fullmatch(r'\[\d+,\d+\]\[\d+,\d+\]', value['bounds']) is not None)
                    require(normalized not in private or item in (None, '', False) or uia_false, 'Private JSON field refused: ' + key)
                    inspect(item)
            elif isinstance(value, list):
                for item in value: inspect(item)
        inspect(document(data))

def evidence_path(path):
    require(path.is_absolute() and path.resolve().is_relative_to(RUNTIME.resolve()), 'Evidence outside owned curated runtime')
    parents = path.resolve().relative_to(RUNTIME.resolve()).parts[:-1]
    require(not any('host' in part.lower() or part.lower().startswith(('private', 'raw', 'userdata', 'phone-dump', 'chrome', 'download'))
                    for part in parents), 'Private host/phone subtree refused')
    return path
WRAPPER = '"""Apply retained normal test0.91, then exact0.91-network.1 TEST source; build APK only."""\nfrom pathlib import Path,PurePosixPath\nfrom hashlib import file_digest\nimport argparse,json,shutil,subprocess,sys\nHERE=Path(__file__).resolve().parent;ROOT=HERE.parent\ndef require(value,message):\n if not value:raise RuntimeError(message)\ndef digest(path):\n if not path.is_file():return None\n with path.open(\'rb\')as stream:return file_digest(stream,\'sha256\').hexdigest()\ndef guarded(base,name):\n p=PurePosixPath(name);require(name and str(p)==name and not p.is_absolute()and\'..\'not in p.parts and\'\\\\\'not in name and\':\'not in name,\'Invalid profile path\')\n target=base/name;require(not target.is_symlink()and target.resolve().is_relative_to(base.resolve()),\'Profile path escape\');return target\ndef main():\n p=argparse.ArgumentParser(description=__doc__);p.add_argument(\'--apply-only\',action=\'store_true\')\n for name in [\'keystore\',\'alias\',\'java-home\',\'android-sdk\']:p.add_argument(\'--\'+name)\n p.add_argument(\'--online\',action=\'store_true\');p.add_argument(\'--test-ads\',action=\'store_true\');a=p.parse_args()\n if not a.apply_only:require(all([a.keystore,a.alias,a.java_home,a.android_sdk]),\'Explicit normal private --keystore/--alias/--java-home/--android-sdk required\')\n m=json.loads((HERE/\'overlay-manifest.json\').read_text());rows=m[\'files\'];test={r[\'path\']:r for r in rows}\n for row in m[\'retainedProfileFiles\']:require(digest(guarded(ROOT,row[\'path\']))==row[\'sha256\'],\'Retained source profile changed: \'+row[\'path\'])\n for row in rows:require(digest(guarded(HERE/\'overrides\',row[\'path\']))==row[\'testSHA256\'],\'Changed test override: \'+row[\'path\'])\n allowed={name:set(values)for name,values in m[\'acceptedRootHashes\'].items()}\n for row in rows:allowed.setdefault(row[\'path\'],set()).update([row[\'rootBaselineSHA256\'],row[\'priorSHA256\'],row[\'testSHA256\']])\n for name,values in allowed.items():require(digest(guarded(ROOT,name))in values,\'Preserve local edits before applying test profile: \'+name)\n prior=m[\'priorEffectiveFiles\']\n needed=any(digest(ROOT/name)not in {value,test.get(name,{}).get(\'testSHA256\',value)}for name,value in prior.items())\n if needed:\n  for name,value in prior.items():\n   if name in test and digest(ROOT/name)==test[name][\'testSHA256\']:\n    source=ROOT/m[\'priorOverrideSources\'][name];target=guarded(ROOT,name);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)\n  subprocess.run([sys.executable,str(ROOT/\'test-release-091/prepare-and-build.py\'),\'--apply-only\'],cwd=ROOT,check=True)\n for row in rows:\n  target=guarded(ROOT,row[\'path\']);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(HERE/\'overrides\'/row[\'path\'],target)\n expected=dict(prior);expected.update({r[\'path\']:r[\'testSHA256\']for r in rows})\n require(all(digest(ROOT/name)==value for name,value in expected.items()),\'Prepared test source identity mismatch\')\n print(\'Applied exact0.91-network.1 local TEST source. No AAB or publication target.\')\n if not a.apply_only:\n  command=[sys.executable,str(ROOT/\'tools/build-normal-apk.py\'),\'--keystore\',a.keystore,\'--alias\',a.alias,\'--java-home\',a.java_home,\'--android-sdk\',a.android_sdk]\n  if a.online:command.append(\'--online\')\n  if a.test_ads:command.append(\'--test-ads\')\n  raise SystemExit(subprocess.run(command,cwd=ROOT).returncode)\nif __name__==\'__main__\':main()\n'
README = "# Complete Warzone Towers0.91-network.1 LOCAL TEST source\n\nThis retains every member and original compressed source record of the complete\n0.91 test archive (SHA25695260d19...). Extract the ENTIRE archive and keep every\nretained profile. The archive root is historical; apply this network-test profile\nbefore building the current test APK:\n\n    python network-test-091-1/prepare-and-build.py --apply-only\n    python network-test-091-1/prepare-and-build.py --keystore PATH_TO_NORMAL_PRIVATE_KEY --alias NORMAL_KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK --online\n\nThe wrapper applies retained test-release-091, then exact network overrides.\nFull/repeated and interrupted known-state application is guarded by SHA256.\nUnknown local edits, changed profile inputs and path escapes are refused before\nsource copies. Copies are not an atomic transaction; preserve other work first.\nVersionCode91 is intentional: original0.91 can be restored in-place without data\nclearing. VersionName0.91-network.1 distinguishes this reversible experiment.\nThe normal builder prompts privately for the existing normal signing key; no\nkey or password is supplied here. --online permits first-time pinned Maven\nresolution. Output: app/build/outputs/apk/release/app-release.apk. Never build an\nAAB or publish this test. Original0.91 APK/source and all game data remain intact.\n\nOnly direct lobby HTTP networking changes: self-contained Cronet500.1.0, official\nHTTPS logical URLs, original signed request bodies/custom headers and stock\nnative join authorization. HTTP/3 capability does not establish ECH negotiation\nor successful cellular access. All native engines, maps, media, gameplay and\nPlayers/ALL COMBAT assets remain unchanged. Dependency coordinates, official\nsource/license URLs and API/AAR hashes are in overrides/release-records/cronet-dependency-source.json.\n\nRead VALIDATION.json, RUNTIME.json, APK-INTEGRITY.json and AUDIT.md for the EXACT\nAPK outcome. Failed/incomplete cellular results stay failed/incomplete; source\nrestoration or a successful build is not a phone-networking pass. Historical\n0.91/0.90 validation remains historical. Only explicitly selected sanitized\nJSON/PNG evidence is appended. Phone dumps, full logcat, private host configs,\ncredentials, tokens, signing keys and local.properties are excluded.\n\nNo VPS, proxy/domain rewrite, feed/site, GitHub or Google Play publication occurs.\nAny future publication requires the user's approval of the exact tested build.\n"

def inputs():
    paths = {'AGENTS.md', 'app/build.gradle.kts', 'tools/build-normal-apk.py',
             'tools/verify-network-apk.py', 'tools/check-lobby-cronet-network.py',
             'tools/check-network-source-package.py', 'release-records/network-source-guard-checks.json',
             'release-records/package-network-test-source.py',
             'tools/check-lobby-network.cjs', 'tools/lobby-network-proof.json',
             'release-records/NETWORK-AUDIT-AND-CHECKS.json',
             'release-records/lobby-cronet-java-checks.json',
             'release-records/cronet-dependency-source.json', 'vendor/cronet-500.1.0/LICENSES.txt'}
    paths |= {'app/src/main/assets/' + x for x in ASSETS}
    paths |= {'app/src/main/java/com/rbabbit/blocknight/warzone/' + x for x in
              ('MultiplayerActivity.java', 'CronetLobbyHttp.java', 'LobbyHttpPolicy.java')}
    for name in paths:
        require((ROOT / name).is_file(), 'Missing frozen network source/check: ' + name)
    return sorted(paths)

def prepare(source):
    names = source.namelist()
    require(len(names) == len(set(names)) == 14626, 'Unexpected complete0.91 member set')
    previous = json.loads(source.read('test-release-091/overlay-manifest.json'))
    effective = dict(previous['priorEffectiveFiles'])
    sources = dict(previous['priorOverrideSources'])
    accepted = {name: set(values) for name, values in previous['acceptedRootHashes'].items()}
    for row in previous['files']:
        accepted.setdefault(row['path'], set()).update([row['rootBaselineSHA256'], row['priorSHA256'], row['testSHA256']])
        effective[row['path']] = row['testSHA256']
        sources[row['path']] = 'test-release-091/overrides/' + row['path']
    rows = []
    allowed = set()
    for name in inputs():
        safe(name)
        path = ROOT / name
        require(path.is_file() and (not path.is_symlink()) and path.resolve().is_relative_to(ROOT.resolve()), 'Missing/symlink/escaped source input')
        data = path.read_bytes()
        secret_check(name, data)
        raw = sha256(source.read(name)).hexdigest() if name in names else None
        rows.append(dict(path=name, rootBaselineSHA256=raw, priorSHA256=effective.get(name, raw), testSHA256=sha256(data).hexdigest(), bytes=len(data)))
        write(target('overrides/' + name), data)
        allowed.add('overrides/' + name)
    retained = [dict(path=name, sha256=sha256(source.read(name)).hexdigest()) for name in names if name.startswith(('google-play-release/', 'normal-release-089/', 'test-release-090/', 'test-release-091/')) and (not name.endswith('/'))]
    m = dict(schemaVersion=1, versionCode=91, versionName='0.91-network.1', profile='local-test-normal-apk-only', completeBaselineArchive=BASE.name, completeBaselineSHA256=BASE_SHA, completeBaselineMembers=14626, priorEffectiveFiles=effective, priorOverrideSources=sources, acceptedRootHashes={name: sorted(values, key=lambda x: x or '') for name, values in accepted.items()}, retainedProfileFiles=retained, files=rows)
    jwrite(PROFILE / 'overlay-manifest.json', m)
    write(PROFILE / 'prepare-and-build.py', WRAPPER.encode())
    write(PROFILE / 'README.md', README.encode())
    write(PROFILE / 'package-complete-source.py', Path(__file__).read_bytes())
    allowed.update({'overlay-manifest.json', 'prepare-and-build.py', 'README.md', 'package-complete-source.py', 'RESTORE-CHECK.json', 'VALIDATION.json', 'APK-INTEGRITY.json', 'RUNTIME.json', 'AUDIT.md', 'RUNTIME-ATTACHMENTS.json', 'PACKAGING-CHECKS.json'})
    attachment_manifest = target('RUNTIME-ATTACHMENTS.json')
    if attachment_manifest.is_file():
        for row in readjson(attachment_manifest)['files']:
            name = safe(row['path'])
            require(name.startswith('validation/runtime/'), 'Unexpected runtime attachment')
            require(digest(target(name)) == row['sha256'], 'Changed prepared attachment')
            allowed.add(name)
    actual = {p.relative_to(PROFILE).as_posix() for p in PROFILE.rglob('*') if p.is_file()}
    require(actual <= allowed, 'Unexpected/stale test profile files: ' + str(actual - allowed))
    return m

def restore(source, m):
    fixture = ROOT / 'source-overlay' / ('restore-check-network-'  + uuid.uuid4().hex)
    require(fixture.resolve().is_relative_to((ROOT / 'source-overlay').resolve()), 'Unsafe fixture')
    fixture.mkdir()
    paths = set(m['acceptedRootHashes']) | {x['path'] for x in m['files']}
    names = set(source.namelist())
    for name in paths | {x['path'] for x in m['retainedProfileFiles']}:
        if name in names:
            write(fixture / name, source.read(name))
    shutil.copytree(PROFILE, fixture / NAME)
    cmd = [sys.executable, str(fixture / NAME / 'prepare-and-build.py'), '--apply-only']

    def run(ok=True):
        p = subprocess.run(cmd, capture_output=True, text=True)
        require((p.returncode == 0) == ok, p.stdout + p.stderr)

    def state():
        return {name: digest(fixture / name) if (fixture / name).is_file() else None for name in paths}
    expected = dict(m['priorEffectiveFiles'])
    expected.update({x['path']: x['testSHA256'] for x in m['files']})

    def exact():
        require(all((digest(fixture / name) == value for name, value in expected.items())), 'Restore differs')
    run()
    exact()
    before = state()
    run()
    require(state() == before, 'Repeated apply differs')
    write(fixture / 'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java', source.read('app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'))
    write(fixture / 'app/build.gradle.kts', source.read('normal-release-089/overrides/app/build.gradle.kts'))
    (fixture / 'tools/build-native-players-091.py').unlink()
    run()
    exact()
    for name in ['AGENTS.md', 'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java']:
        p = fixture / name
        old = p.read_bytes()
        p.write_bytes(old + b'\nLOCAL EDIT GUARD\n')
        before = state()
        run(False)
        require(state() == before, 'Local-edit refusal mutated source')
        p.write_bytes(old)
    p = fixture / NAME / 'overrides/app/build.gradle.kts'
    old = p.read_bytes()
    p.write_bytes(old + b'TAMPERED')
    before = state()
    run(False)
    require(state() == before, 'Corrupt override mutated source')
    p.write_bytes(old)
    exact()
    result = dict(passed=True, firstApply=True, repeatedApply=True, interruptedKnownStateApply=True, localEditRefusedBeforeMutation=True, corruptOverrideRefusedBeforeMutation=True, buildOrPublicationExecuted=False, sourceProfileManifestSHA256=digest(PROFILE / 'overlay-manifest.json'), fixture=str(fixture))
    jwrite(PROFILE / 'RESTORE-CHECK.json', result)
    return result

def gates(m, allow_incomplete=False):
    records = ROOT / 'release-records'
    buffers = {name: bounded(records / name, 4 * 1024 * 1024) for name in
               ['final-validation.json', 'apk-integrity.json', 'focused-runtime.json', 'AUDIT.md']}
    final, integrity, runtime = [document(buffers[name]) for name in
                                ['final-validation.json', 'apk-integrity.json', 'focused-runtime.json']]
    apk = Path(integrity['apk']); expected = digest(apk)
    for label, value in [('final', final), ('integrity', integrity), ('runtime', runtime)]:
        require(value.get('candidateAPK_SHA256', value.get('sha256')) == expected and value.get('versionCode') == 91
                and value.get('versionName') == '0.91-network.1' and value.get('certificateSHA256') == SIGNER,
                label + ' exact test identity mismatch')
    require(integrity.get('passed') is True and integrity.get('normalBuild') is True
            and integrity.get('aabBuilt') is False and integrity.get('sourceAssetsAllMatch') is True
            and integrity.get('allNativeGameDataMapsMediaAndPlayersAssetsUnchanged') is True
            and set(integrity.get('changedAssets', [])) == ASSETS, 'Normal test integrity/scope mismatch')
    app_sources = {'app/build.gradle.kts'} | {'app/src/main/assets/' + x for x in ASSETS}
    app_sources |= {'app/src/main/java/com/rbabbit/blocknight/warzone/' + x for x in
                    ['MultiplayerActivity.java', 'CronetLobbyHttp.java', 'LobbyHttpPolicy.java']}
    source_rows = {row['path']: row['testSHA256'] for row in m['files']}
    require(set(integrity.get('sourceSHA256', {})) == app_sources
            and all(integrity['sourceSHA256'][name] == source_rows[name] for name in app_sources),
            'APK integrity does not bind the current Gradle/Java/JS sources')
    require(integrity.get('javaPolicyAndAPICompileProofSHA256') == digest(records / 'lobby-cronet-java-checks.json')
            and integrity.get('jsCancellationAndRecoveryProofSHA256') == digest(ROOT / 'tools/lobby-network-proof.json'),
            'APK source/check proof references changed')
    complete = runtime.get('passed') is True
    status = runtime.get('status')
    require(status in {'passed', 'failed', 'incomplete'} and (status == 'passed') == complete
            and final.get('status') == status, 'Captured runtime/final status mismatch')
    if complete:
        require(final.get('passed') is True, 'Complete final validation required')
        for key in ['cellularDirectoryVerified', 'signedJoinVerified', 'controlledMatchVerified', 'cancellationAndRecoveryVerified']:
            require(runtime.get(key) is True, 'Missing exact phone check: ' + key)
    else:
        require(allow_incomplete and final.get('passed') is False and runtime.get('passed') is False
                and runtime.get('status') in {'failed', 'incomplete'} and final.get('status') == runtime.get('status'),
                'Explicit honest failed/incomplete phone outcome required')
        require(buffers['AUDIT.md'].startswith((b'# INCOMPLETE', b'# FAILED')), 'Honest failed/incomplete audit banner required')
    for key in ['verifiedChecks', 'remainingVerification']:
        require(isinstance(runtime.get(key), list) and all(isinstance(x, str) and x.strip() for x in runtime[key]),
                'Missing truthful runtime scope: ' + key)
    require(complete or bool(runtime['remainingVerification']), 'Failed/incomplete outcome needs remaining checks')
    require(final.get('sourceProfileManifestSHA256') == digest(PROFILE / 'overlay-manifest.json'), 'Source manifest mismatch')
    for key, name in [('integrityProof', 'apk-integrity.json'), ('runtimeProof', 'focused-runtime.json')]:
        ref = final.get(key, {})
        require(ref.get('path') == name and ref.get('sha256') == sha256(buffers[name]).hexdigest(), 'Final proof reference changed')
    require(final.get('auditSHA256') == sha256(buffers['AUDIT.md']).hexdigest(), 'Final audit changed')
    checks = readjson(ROOT / 'release-records/network-source-guard-checks.json')
    require(checks.get('passed') is True and checks.get('packagerSHA256') == digest(Path(__file__)), 'Current packaging helper checks required')
    evidence = runtime.get('evidenceFiles')
    require(isinstance(evidence, list) and bool(evidence), 'Explicit nonempty captured runtime evidence required')
    attachments = []
    for i, row in enumerate(evidence, 1):
        path = evidence_path(Path(row['path']))
        require(path.suffix.lower() in {'.json', '.png'}, 'Only curated JSON/PNG evidence may be exported')
        require(not re.search(r'(?:^|[._-])(?:password|secret|credentials?|id_rsa|id_ed25519|keystore|known_hosts|logcat|userdata|dump)(?:[._-]|$)', path.name, re.I), 'Private phone/host evidence refused')
        data = bounded(path, 16 * 1024 * 1024)
        require(sha256(data).hexdigest() == row['sha256'], 'Runtime evidence changed')
        secret_check(path.name, data)
        if path.suffix.lower() == '.json':
            document(data)
        else:
            require(data.startswith(b'\x89PNG\r\n\x1a\n'), 'Invalid PNG attachment')
        name = 'validation/runtime/' + str(i).zfill(3) + '-' + re.sub('[^A-Za-z0-9._-]', '_', path.name)
        attachments.append((name, data, row['path']))
    require(sum(len(x[1]) for x in attachments) <= 64 * 1024 * 1024, 'Evidence total bound exceeded')
    with zipfile.ZipFile(apk) as z:
        for row in m['files']:
            if row['path'].startswith('app/src/main/assets/'):
                with z.open('assets/' + row['path'].removeprefix('app/src/main/assets/')) as stream:
                    require(file_digest(stream, 'sha256').hexdigest() == row['testSHA256'], 'Source asset differs from APK')
    payloads = [(name, data) for name, data, _ in attachments]
    payloads.append(('RUNTIME-ATTACHMENTS.json', (json.dumps(dict(files=[dict(path=n, sha256=sha256(d).hexdigest(), bytes=len(d)) for n,d,_ in attachments]), indent=2)+'\n').encode()))
    payloads.extend((dst,buffers[src]) for dst,src in [('VALIDATION.json','final-validation.json'),('APK-INTEGRITY.json','apk-integrity.json'),('RUNTIME.json','focused-runtime.json'),('AUDIT.md','AUDIT.md')])
    stage(payloads)
    return expected, complete, status

def package():
    require(not OUTPUT.exists(), 'Refusing to overwrite a delivery source archive')
    with BASE.open('rb') as source, OUTPUT.open('xb') as target:
        shutil.copyfileobj(source, target, 8 * 1024 * 1024)
    with zipfile.ZipFile(BASE) as z:
        original = z.infolist()
        prefix = z.start_dir
    with zipfile.ZipFile(OUTPUT, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in sorted(PROFILE.rglob('*')):
            if p.is_file():
                require(not p.is_symlink(), 'Profile symlink refused')
                z.write(p, NAME + '/' + p.relative_to(PROFILE).as_posix())
    with zipfile.ZipFile(OUTPUT) as z:
        names = z.namelist()
        require(z.testzip() is None, 'Archive member CRC failure')
        require(len(names) == len(set(names)) and names[:len(original)] == [x.filename for x in original], 'Baseline member preservation failed')
        for old, new in zip(original, z.infolist()):
            require((old.CRC, old.file_size, old.compress_size, old.header_offset) == (new.CRC, new.file_size, new.compress_size, new.header_offset), 'Baseline member metadata changed')
        for p in PROFILE.rglob('*'):
            if p.is_file():
                with z.open(NAME + '/' + p.relative_to(PROFILE).as_posix()) as stream:
                    require(file_digest(stream, 'sha256').hexdigest() == digest(p), 'Packaged profile differs')
    with BASE.open('rb') as old, OUTPUT.open('rb') as new:
        left = prefix
        while left:
            size = min(left, 8 * 1024 * 1024)
            require(old.read(size) == new.read(size), 'Original compressed local records changed')
            left -= size
    return dict(output=str(OUTPUT), bytes=OUTPUT.stat().st_size, sha256=digest(OUTPUT), allOriginal14626MembersPreserved=True, originalLocalRecordPrefixBytes=prefix, originalLocalRecordPrefixByteIdentical=True, noDuplicateMembers=True)

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--package', action='store_true')
    p.add_argument('--allow-incomplete', action='store_true')
    a = p.parse_args()
    require(not a.allow_incomplete or a.package, 'Incomplete flag is only an explicit package choice')
    require(not a.package or not OUTPUT.exists(), 'Refusing to overwrite a delivery source archive')
    require(digest(BASE) == BASE_SHA, 'Immutable complete0.91 source baseline changed')
    with zipfile.ZipFile(BASE) as source:
        m = prepare(source)
        gate = gates(m, a.allow_incomplete) if a.package else None
        report = restore(source, m)
    report.update(sourceFiles=len(m['files']), sourceProfileManifestSHA256=digest(PROFILE / 'overlay-manifest.json'), archiveCreated=False, publicationRequired=False)
    if a.package:
        if not gate[1]:
            require((PROFILE / 'README.md').read_bytes() == README.encode(), 'Unexpected prepared README')
            write(PROFILE / 'README.md', b'# EXPERIMENTAL LOCAL NETWORK TEST: FAILED OR INCOMPLETE\n\nRead the exact sealed outcome in AUDIT.md and RUNTIME.json. No cellular success or publication is implied.\n\n' + README.encode())
        report.update(package(), archiveCreated=True, candidateAPK_SHA256=gate[0], sourceRestorationPassed=True, passed=gate[1], runtimePassed=gate[1], status=gate[2])
    jwrite(ROOT / 'release-records/source-package-validation.json', report)
    print(json.dumps(report, indent=2))
if __name__ == '__main__':
    main()
