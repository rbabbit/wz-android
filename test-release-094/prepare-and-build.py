"""Restore the guarded exact 0.94 normal test profile. No publishing."""
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
