"""Append a guarded 0.94 test profile to the preserved complete 0.93 source archive."""
from pathlib import Path, PurePosixPath
from hashlib import file_digest, sha256
from datetime import datetime, timezone
import argparse, json, os, shutil, subprocess, sys, zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = 'test-release-094'
PROFILE = ROOT / NAME
BASE = Path('C:/timerApp/warzone-towers-0.93-test-source.zip')
BASE_SHA = '316131c0fb82306e35ace2e84e4802134e90cc9e08217b0c6a1f98b0bb8ade99'
OUT = Path('C:/timerApp/warzone-towers-0.94-test-source.zip')
ASSETS = 'app/src/main/assets/'

def require(value, message):
    if not value: raise RuntimeError(message)

def digest(path):
    if not path.is_file(): return None
    with path.open('rb') as stream: return file_digest(stream, 'sha256').hexdigest()

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.094-tmp')
    temporary.write_bytes(data)
    os.replace(temporary, path)

def jwrite(path, value):
    write(path, (json.dumps(value, indent=2) + '\n').encode())

def safe(name):
    p = PurePosixPath(name)
    require(str(p) == name and not p.is_absolute() and '..' not in p.parts and '\\' not in name and ':' not in name, 'Unsafe source path: ' + name)
    return name

def prepare(base):
    require(not (PROFILE / 'PACKAGE-SEAL.json').exists(), 'Preserve sealed source profile')
    with zipfile.ZipFile(base) as source:
        names = source.namelist()
        require(len(names) == len(set(names)) == 15077, 'Unexpected 0.93 source archive member set')
        old = json.loads(source.read('test-release-093/overlay-manifest.json'))
        effective = dict(old['priorEffectiveFiles'])
        origins = dict(old['priorOverrideSources'])
        accepted = {p:set(values) for p,values in old['acceptedRootHashes'].items()}
        for row in old['files']:
            effective[row['path']] = row['testSHA256']
            origins[row['path']] = 'test-release-093/overrides/' + row['path']
            accepted.setdefault(row['path'],set()).update([row['rootBaselineSHA256'],row['priorSHA256'],row['testSHA256']])
        listing = subprocess.run(['git', 'ls-files', '-c', '-o', '--exclude-standard', '-z'], cwd=ROOT, check=True, capture_output=True).stdout
        paths = {safe(p) for p in listing.decode().split('\0') if p}
        # Historical profiles stay byte-identical inside the complete baseline.
        paths = {p for p in paths if not p.startswith(('test-release-', 'source-overlay/', 'normal-release-', 'google-play-release/', 'network-test-'))}
        paths |= {p.relative_to(ROOT).as_posix() for p in (ROOT / 'app/src').rglob('*') if p.is_file()}
        rows = []
        for name in sorted(paths):
            p = ROOT / name
            if not p.is_file(): continue
            require(not p.is_symlink(), 'Source symlink refused: ' + name)
            current = digest(p)
            prior = effective.get(name)
            if prior is None and name in source.NameToInfo:
                with source.open(name) as stream: prior = file_digest(stream, 'sha256').hexdigest()
            if current == prior: continue
            require(p.name not in {'local.properties', '.env', 'known_hosts'} and p.suffix.lower() not in {'.apk', '.aab', '.jks', '.keystore', '.key', '.pem', '.p12', '.pyc'}, 'Private/output input refused: ' + name)
            data = p.read_bytes()
            require(not any(b'-----BEGIN ' + k + b'-----' in data for k in (b'PRIVATE KEY', b'OPENSSH PRIVATE KEY', b'RSA PRIVATE KEY')), 'Private key bytes refused')
            write(PROFILE / 'overrides' / name, data)
            rows.append({'path':name, 'sha256':current, 'priorSHA256':prior, 'bytes':len(data)})
            accepted.setdefault(name,set()).add(prior)
        assets = {p.relative_to(ROOT).as_posix():digest(p) for p in (ROOT / ASSETS).rglob('*') if p.is_file()}
        build = {p.relative_to(ROOT).as_posix():digest(p) for p in (ROOT / 'app/src').rglob('*') if p.is_file()}
        build.update({'app/build.gradle.kts':digest(ROOT / 'app/build.gradle.kts')})
        expected = dict(effective)
        expected.update({r['path']:r['sha256'] for r in rows})
        manifest = dict(versionCode=94, versionName='0.94', baseArchive=base.name, baseSHA256=BASE_SHA,
                        baseMembers=len(names), files=rows, priorEffectiveFiles=effective, priorOverrideSources=origins,
                        acceptedInitialHashes={p:sorted(values,key=lambda x:x or '') for p,values in accepted.items()},
                        effectiveFiles=expected, effectiveAPKAssets=assets, effectiveBuildSources=build,
                        knownAppSources=sorted(build), preparedUTC=datetime.now(timezone.utc).isoformat())
        jwrite(PROFILE / 'overlay-manifest.json', manifest)
    write(PROFILE / 'prepare-and-build.py', RESTORE.encode())
    write(PROFILE / 'README.md', b'# Survival normal test 0.94\n\nExtract the complete archive, then run `python test-release-094/prepare-and-build.py --apply-only` to restore the exact test source. The retained 0.93 source chain and every earlier member are preserved. Supply your own existing signing key to build; private keys/passwords are not included. This profile builds a normal APK only and performs no publication.\n\nGameplay verification is intentionally limited to early Survival gameplay, both map launches, focused purchases and save/return. Later waves and stress performance are not verified. See RUNTIME.json and AUDIT.md for observed evidence and limits.\n')
    print(json.dumps({'prepared':True,'overrides':len(rows),'assets':len(assets),'manifestSHA256':digest(PROFILE / 'overlay-manifest.json')}))

def package(base, output, apk, runtime):
    require(not output.exists(), 'Preserve existing source delivery')
    manifest = json.loads((PROFILE / 'overlay-manifest.json').read_text())
    for row in manifest['files']:
        require(digest(ROOT / row['path']) == row['sha256'] == digest(PROFILE / 'overrides' / row['path']), 'Source changed after preparation: ' + row['path'])
    for name, wanted in manifest['effectiveBuildSources'].items(): require(digest(ROOT / name) == wanted, 'Build input changed: ' + name)
    seal = json.loads(runtime.read_text(encoding='utf-8-sig'))
    require(seal.get('passed') is True and seal.get('versionCode') == 94 and seal.get('apkSHA256') == digest(apk), 'Exact passed APK runtime receipt required')
    require(seal.get('sourceManifestSHA256') == digest(PROFILE / 'overlay-manifest.json'), 'Runtime receipt source mismatch')
    require(seal.get('scope') == 'focused-early-survival' and seal.get('laterWavesTested') is False, 'Wrong authorized runtime scope')
    require(seal.get('verifiedChecks') and seal.get('limitations') and seal.get('evidenceFiles'), 'Specific observed checks, limitations and evidence required')
    with zipfile.ZipFile(apk) as archive:
        actual = {'app/src/main/' + name:sha256(archive.read(name)).hexdigest() for name in archive.namelist() if name.startswith('assets/') and not name.endswith('/')}
        require(actual == manifest['effectiveAPKAssets'], 'APK assets differ from source profile')
    require((PROFILE / 'AUDIT.md').is_file(), 'Curated audit required')
    write(PROFILE / 'RUNTIME.json', runtime.read_bytes())
    for index, name in enumerate(seal['evidenceFiles']):
        p = Path(name)
        require(p.is_file() and p.suffix.lower() in {'.json','.png','.txt','.log'} and p.stat().st_size <= 16*1024*1024, 'Invalid curated evidence')
        write(PROFILE / 'validation' / (f'{index:03}-' + p.name), p.read_bytes())
    jwrite(PROFILE / 'PACKAGE-SEAL.json', {'apkSHA256':digest(apk),'sourceManifestSHA256':digest(PROFILE / 'overlay-manifest.json'),'runtimeSHA256':digest(runtime),'published':False,'aabBuilt':False})
    with zipfile.ZipFile(base) as source: original, prefix = source.infolist(), source.start_dir
    with base.open('rb') as src, output.open('xb') as dst: shutil.copyfileobj(src,dst,8*1024*1024)
    with zipfile.ZipFile(output,'a',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for p in sorted(PROFILE.rglob('*')):
            if p.is_file(): archive.write(p, NAME + '/' + p.relative_to(PROFILE).as_posix())
    with zipfile.ZipFile(output) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) and names[:len(original)] == [i.filename for i in original], 'Original members changed/duplicated')
        require(archive.testzip() is None, 'Archive CRC failure')
        for a,b in zip(original,archive.infolist()): require((a.CRC,a.file_size,a.compress_size,a.header_offset)==(b.CRC,b.file_size,b.compress_size,b.header_offset),'Original compressed member changed')
        for p in PROFILE.rglob('*'):
            if p.is_file():
                with archive.open(NAME + '/' + p.relative_to(PROFILE).as_posix()) as stream: require(file_digest(stream,'sha256').hexdigest() == digest(p),'Profile member hash mismatch')
    with base.open('rb') as a,output.open('rb') as b:
        remaining=prefix
        while remaining:
            size=min(remaining,8*1024*1024);require(a.read(size)==b.read(size),'Original compressed prefix changed');remaining-=size
    receipt={'passed':True,'archive':str(output),'sha256':digest(output),'bytes':output.stat().st_size,'allOriginalMembersPreserved':True,'baseMembers':len(original),'members':len(names),'originalCompressedPrefixByteIdentical':True,'published':False}
    jwrite(output.with_suffix(output.suffix+'.validation.json'),receipt)
    print(json.dumps(receipt,indent=2))

RESTORE = '''"""Restore the guarded exact 0.94 normal test profile. No publishing."""
from pathlib import Path,PurePosixPath
from hashlib import file_digest
import argparse,json,subprocess,sys,os
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
def guarded(base,name):
    p=PurePosixPath(name)
    assert name and str(p)==name and not p.is_absolute() and '..' not in p.parts and chr(92) not in name and ':' not in name,'Unsafe source path'
    target=base/name
    assert not base.is_symlink() and not target.is_symlink() and target.resolve().is_relative_to(base.resolve()),'Source path escape'
    return target
def digest(p):
    if not p.is_file(): return None
    with p.open('rb') as s: return file_digest(s,'sha256').hexdigest()
def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('--apply-only',action='store_true')
    for name in ['keystore','alias','java-home','android-sdk']: a.add_argument('--'+name)
    a.add_argument('--online',action='store_true');a.add_argument('--test-ads',action='store_true')
    args=a.parse_args();m=json.loads((HERE/'overlay-manifest.json').read_text())
    assert m['versionCode']==94 and m['versionName']=='0.94'
    actual={p.relative_to(ROOT).as_posix() for p in (ROOT/'app/src').rglob('*') if p.is_file()}
    assert actual<=set(m['knownAppSources']),'Preserve unknown future app sources before applying 0.94'
    for r in m['files']:
        guarded(ROOT,r['path'])
        assert digest(guarded(HERE/'overrides',r['path']))==r['sha256'],r['path']
    exact=all(digest(guarded(ROOT,p))==h for p,h in m['effectiveFiles'].items())
    if not exact:
        # Refuse partially applied/future edits rather than downgrading them.
        for r in m['files']:
            assert digest(guarded(ROOT,r['path'])) in m['acceptedInitialHashes'][r['path']],'Preserve partial/local edits and extract a clean archive before applying: '+r['path']
        subprocess.run([sys.executable,str(ROOT/'test-release-093/prepare-and-build.py'),'--apply-only'],cwd=ROOT,check=True)
        for r in m['files']:
            p=guarded(ROOT,r['path']);p.parent.mkdir(parents=True,exist_ok=True)
            t=p.with_name(p.name+'.094-tmp');t.write_bytes(guarded(HERE/'overrides',r['path']).read_bytes());os.replace(t,p)
    for p,h in m['effectiveFiles'].items(): assert digest(guarded(ROOT,p))==h,p
    for p,h in m['effectiveBuildSources'].items(): assert digest(guarded(ROOT,p))==h,p
    print('Applied exact normal test 0.94 source. No publication.')
    if not args.apply_only:
        assert all([args.keystore,args.alias,args.java_home,args.android_sdk]),'Explicit private signing inputs required'
        cmd=[sys.executable,str(ROOT/'tools/build-normal-apk.py')]
        for name in ['keystore','alias','java-home','android-sdk']: cmd.extend(['--'+name,getattr(args,name.replace('-','_'))])
        if args.online:cmd.append('--online')
        if args.test_ads:cmd.append('--test-ads')
        raise SystemExit(subprocess.run(cmd,cwd=ROOT).returncode)
if __name__=='__main__':main()
'''

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--prepare',action='store_true');p.add_argument('--pack',action='store_true')
    p.add_argument('--base',type=Path,default=BASE);p.add_argument('--output',type=Path,default=OUT)
    p.add_argument('--apk',type=Path);p.add_argument('--runtime',type=Path);args=p.parse_args()
    require(digest(args.base)==BASE_SHA,'Complete fallback source hash changed')
    if args.prepare:prepare(args.base)
    if args.pack:
        require(args.apk and args.runtime,'--pack requires exact --apk and --runtime')
        package(args.base,args.output,args.apk,args.runtime)
    require(args.prepare or args.pack,'Choose --prepare or --pack')
if __name__=='__main__':main()
