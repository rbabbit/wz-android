"""Apply retained normal0.89, then exact0.90 TEST source; build APK only."""
from pathlib import Path,PurePosixPath
from hashlib import file_digest
import argparse,json,shutil,subprocess,sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent
def require(value,message):
 if not value:raise RuntimeError(message)
def digest(path):
 if not path.is_file():return None
 with path.open('rb')as stream:return file_digest(stream,'sha256').hexdigest()
def guarded(base,name):
 p=PurePosixPath(name);require(name and str(p)==name and not p.is_absolute()and'..'not in p.parts and'\\'not in name and':'not in name,'Invalid profile path')
 target=base/name;require(not target.is_symlink()and target.resolve().is_relative_to(base.resolve()),'Profile path escape');return target
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply-only',action='store_true')
 for name in ['keystore','alias','java-home','android-sdk']:p.add_argument('--'+name)
 p.add_argument('--online',action='store_true');p.add_argument('--test-ads',action='store_true');a=p.parse_args()
 if not a.apply_only:require(all([a.keystore,a.alias,a.java_home,a.android_sdk]),'Explicit normal private --keystore/--alias/--java-home/--android-sdk required')
 m=json.loads((HERE/'overlay-manifest.json').read_text());rows=m['files'];test={r['path']:r for r in rows}
 for row in m['retainedProfileFiles']:require(digest(guarded(ROOT,row['path']))==row['sha256'],'Retained source profile changed: '+row['path'])
 for row in rows:require(digest(guarded(HERE/'overrides',row['path']))==row['testSHA256'],'Changed test override: '+row['path'])
 allowed={name:set(values)for name,values in m['acceptedRootHashes'].items()}
 for row in rows:allowed.setdefault(row['path'],set()).update([row['rootBaselineSHA256'],row['priorSHA256'],row['testSHA256']])
 for name,values in allowed.items():require(digest(guarded(ROOT,name))in values,'Preserve local edits before applying test profile: '+name)
 prior=m['priorEffectiveFiles']
 needed=any(digest(ROOT/name)not in {value,test.get(name,{}).get('testSHA256',value)}for name,value in prior.items())
 if needed:
  for name,value in prior.items():
   if name in test and digest(ROOT/name)==test[name]['testSHA256']:
    source=ROOT/m['priorOverrideSources'][name];target=guarded(ROOT,name);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
  subprocess.run([sys.executable,str(ROOT/'normal-release-089/prepare-and-build.py'),'--apply-only'],cwd=ROOT,check=True)
 for row in rows:
  target=guarded(ROOT,row['path']);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(HERE/'overrides'/row['path'],target)
 expected=dict(prior);expected.update({r['path']:r['testSHA256']for r in rows})
 require(all(digest(ROOT/name)==value for name,value in expected.items()),'Prepared test source identity mismatch')
 print('Applied exact0.90 local TEST source. No AAB or publication target.')
 if not a.apply_only:
  command=[sys.executable,str(ROOT/'tools/build-normal-apk.py'),'--keystore',a.keystore,'--alias',a.alias,'--java-home',a.java_home,'--android-sdk',a.android_sdk]
  if a.online:command.append('--online')
  if a.test_ads:command.append('--test-ads')
  raise SystemExit(subprocess.run(command,cwd=ROOT).returncode)
if __name__=='__main__':main()
