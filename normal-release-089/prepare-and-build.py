"""Apply the retained Play0.87 then exact normal0.89 source; build signed APK only."""
from pathlib import Path, PurePosixPath
from hashlib import file_digest
import argparse, json, shutil, subprocess, sys
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent

def require(value,message):
    if not value: raise RuntimeError(message)

def digest(path):
    if not path.is_file(): return None
    with path.open('rb') as stream: return file_digest(stream,'sha256').hexdigest()

def guarded(base,name):
    value=PurePosixPath(name)
    require(name and str(value)==name and not value.is_absolute() and '..' not in value.parts
            and '\\' not in name and ':' not in name,'Invalid profile path: '+name)
    path=base/name
    require(not path.is_symlink() and path.resolve().is_relative_to(base.resolve()),'Symlink/path escape: '+name)
    return path

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply-only',action='store_true')
    parser.add_argument('--keystore')
    parser.add_argument('--alias')
    parser.add_argument('--java-home')
    parser.add_argument('--android-sdk')
    parser.add_argument('--online',action='store_true')
    parser.add_argument('--test-ads',action='store_true')
    args=parser.parse_args()
    if not args.apply_only:
        require(all([args.keystore,args.alias,args.java_home,args.android_sdk]),
                'Normal APK build requires explicit --keystore, --alias, --java-home and --android-sdk')
    manifest=json.loads((HERE/'overlay-manifest.json').read_text(encoding='utf-8'))
    rows=manifest['files']; normal={row['path']:row for row in rows}
    play=manifest['retainedPlayFiles']
    # Validate every source and destination BEFORE any copy or retained-profile invocation.
    for item in manifest['retainedProfileFiles']:
        require(digest(guarded(ROOT,item['path']))==item['sha256'],'Retained Play profile changed: '+item['path'])
    for row in rows:
        require(digest(guarded(HERE/'overrides',row['path']))==row['normalSHA256'],'Invalid normal override: '+row['path'])
    destinations={row['path']:set([row['rootBaselineSHA256'],row['normalSHA256']]) for row in rows}
    for row in play:
        destinations.setdefault(row['path'],set()).update([row['baselineSHA256'],row['playSHA256']])
    for name,allowed in destinations.items():
        require(digest(guarded(ROOT,name)) in allowed,'Preserve local edits before applying normal profile: '+name)
    # The original retained wrapper cannot accept a newer normal value. If a partial
    # known-state extraction still needs Play preparation, normalize overlapping
    # normal files to their exact retained Play bytes, then use its original guards.
    need_play=any(digest(ROOT/row['path']) not in
                  {row['playSHA256'],normal.get(row['path'],{}).get('normalSHA256',row['playSHA256'])}
                  for row in play)
    if need_play:
        for row in play:
            if row['path'] in normal and digest(ROOT/row['path'])==normal[row['path']]['normalSHA256']:
                path=guarded(ROOT,row['path']); path.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(ROOT/'google-play-release/overrides'/row['path'],path)
        subprocess.run([sys.executable,str(ROOT/'google-play-release/prepare-and-build.py'),'--apply-only'],cwd=ROOT,check=True)
    for row in rows:
        destination=guarded(ROOT,row['path']); destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(HERE/'overrides'/row['path'],destination)
    expected={row['path']:row['playSHA256'] for row in play}
    expected.update({row['path']:row['normalSHA256'] for row in rows})
    require(all(digest(ROOT/name)==value for name,value in expected.items()),'Applied source identity mismatch')
    print('Applied exact normal0.89 source; updater enabled; no AAB target.')
    if not args.apply_only:
        command=[sys.executable,str(ROOT/'tools/build-normal-apk.py'),'--keystore',args.keystore,'--alias',args.alias,
                 '--java-home',args.java_home,'--android-sdk',args.android_sdk]
        if args.online: command.append('--online')
        if args.test_ads: command.append('--test-ads')
        raise SystemExit(subprocess.run(command,cwd=ROOT).returncode)
if __name__=='__main__': main()
