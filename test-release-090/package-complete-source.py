"""Prepare complete0.90 TEST source; final --package requires exact APK runtime."""
from pathlib import Path,PurePosixPath
from hashlib import file_digest,sha256
import argparse,json,re,shutil,subprocess,sys,uuid,zipfile
ROOT=Path(__file__).resolve().parents[1]
BASE=Path('C:/timerApp/warzone-towers-0.89-source.zip')
BASE_SHA='c3b1154efa2b2b6a65a13c484dd1da19d403027bfe4da2c0264fae60232b3f30'
OUTPUT=Path('C:/timerApp/warzone-towers-0.90-test-source.zip')
NAME='test-release-090';PROFILE=ROOT/'source-overlay'/NAME
RUNTIME=ROOT.parents[1]/'normal-test-090-20261116'
SIGNER='4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
ASSETS={'warzone-touch-controls.js','warzone-campaign-hud.js','warzone-command-pages.js',
 'multiplayer/mobile-controls.js','multiplayer/session.js','multiplayer/native-ui-adapter.js','warzone/ui/towers-game-controls.css',
 'warzone/warzone2100.js','warzone/warzone2100.wasm','warzone/warzone2100-towers-052.js','warzone/warzone2100-towers-052.wasm',
 'warzone/warzone2100-campaign.js','warzone/warzone2100-ffa.js','warzone/warzone2100-duel.js',
 'multiplayer/warzone2100.js','multiplayer/warzone2100.wasm'}

def require(value,message):
 if not value:raise RuntimeError(message)
def digest(path):
 with Path(path).open('rb')as stream:return file_digest(stream,'sha256').hexdigest()
def readjson(path):return json.loads(path.read_text(encoding='utf-8-sig'))
def write(path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(value)
def jwrite(path,value):write(path,(json.dumps(value,indent=2)+'\n').encode())
def safe(name):
 p=PurePosixPath(name);require(name and str(p)==name and not p.is_absolute() and '..'not in p.parts and '\\'not in name and ':'not in name,'Unsafe profile path');return name
def target(name):
 p=PROFILE/safe(name);require(not PROFILE.is_symlink()and not p.is_symlink()and p.resolve().is_relative_to(PROFILE.resolve()),'Unsafe audit attachment target');return p
def bounded(path,limit):
 require(path.is_file()and not path.is_symlink()and 0<path.stat().st_size<=limit,'Invalid/oversized proof file')
 with path.open('rb')as stream:data=stream.read(limit+1)
 require(0<len(data)<=limit,'Proof grew beyond bound');return data
def stage(payloads):
 for name,data in payloads:
  secret_check(name,data)
  p=target(name)
  if p.exists():require(p.is_file()and digest(p)==sha256(data).hexdigest(),'Preserve changed prepared audit attachment')
 for name,data in payloads:write(target(name),data)
def secret_check(name,data):
 require(Path(name).name not in {'local.properties','.env','id_rsa','id_ed25519','known_hosts'}
  and Path(name).suffix.lower() not in {'.jks','.keystore','.key','.pem','.p12'},'Sensitive source path refused')
 require(not any(x in data for x in [b'-----BEGIN PRIVATE KEY-----',b'-----BEGIN OPENSSH PRIVATE KEY-----',b'-----BEGIN RSA PRIVATE KEY-----']),'Private key bytes refused')

WRAPPER=r'''"""Apply retained normal0.89, then exact0.90 TEST source; build APK only."""
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
'''

README='''# Complete Warzone Towers0.90 TEST source

This archive retains EVERY member of the complete0.89 source ZIP, its original
compressed local-record bytes and historical engine/source/media inputs. The
test-release-090 profile adds the exact current test sources and native builds.
Extract the ENTIRE ZIP and keep google-play-release, normal-release-089 and
test-release-090. The archive root initially represents historical source;
apply the test profile before building the current APK.

    python test-release-090/prepare-and-build.py --apply-only
    python test-release-090/prepare-and-build.py --keystore PATH_TO_NORMAL_PRIVATE_KEY --alias NORMAL_KEY_ALIAS --java-home PATH_TO_JDK --android-sdk PATH_TO_ANDROID_SDK

The wrapper prepares retained normal0.89 first, then0.90 with SHA256 guards.
Full repeated application and interrupted mixtures of exact root/Play/normal89/
test90 bytes are supported. Unrelated local edits and changed override/profile
sources are refused before mutation. Copies are not an atomic transaction;
preserve unrelated work separately. Private signing keys/passwords, local SDK
settings, SSH keys and emulator userdata are excluded. Use the existing normal
publisher key (certificate4499efe0...), not the Google Play upload key. Builder
password prompts do not echo. --online permits dependency downloads; otherwise
cached Gradle dependencies are used. Output: app/build/outputs/apk/release/app-release.apk.

Version0.90/code90 is a LOCAL TEST APK. No AAB, VPS/feed/website, GitHub or Google
Play publication is performed or authorized by this profile. User testing and
explicit approval of this exact build are required before later publication.
Historical publication records/tools remain historical and are not test gates.

ALL COMBAT is a requested persistent mode: white on black#000 while OFF, green
on black#000 while ON. Native selection covers all owned eligible combat units
across the map and new production; explicit OFF deselects combat units safely.
Builder/menu/input suspension preserves requested ON. Selected horizontal health
bars and white brackets are removed. Unselected hover/status and structure/build
progress remain unchanged. No camera pilot, data/map/media or protocol change.

After application, vendor/native-090/BUILD.md and CONTRACT.md document the exact
three native lineages, shared policy, source deltas, warm-cache commands and
header-safe cold bootstrap. Six full JS loaders and three WASM files are paired;
all aliases are regenerated from their matching raw programs. Cold wrappers were
syntax checked, not rebuilt from fresh dependencies. Objects, redundant generated
data/HTML and host executables are excluded from the overlay.

VALIDATION.json, APK-INTEGRITY.json, RUNTIME.json and AUDIT.md contain exact test
APK/runtime identity and explicit fixture/environment limits. JSON/PNG runtime
evidence is exported only from the report's explicit hash-bound list; raw native
saves, full userdata and private host keys are not bundled as evidence. Restore
checks are source-only and do not replace actual Android gameplay verification.
'''

def inputs():
 paths={'AGENTS.md','app/build.gradle.kts','tools/build-normal-apk.py'}|{'app/src/main/assets/'+x for x in ASSETS}
 for p in (ROOT/'tools').iterdir():
  if p.is_file()and'090'in p.name:
   require(p.suffix in {'.py','.cjs','.sh','.java'},'Unexpected090 tool');paths.add(p.relative_to(ROOT).as_posix())
 native=ROOT/'vendor/native-090';manifest=readjson(native/'source-provenance-manifest.json')
 for row in manifest['files']:require(digest(ROOT/row['path'])==row['sha256'],'Native source input changed: '+row['path'])
 for p in native.rglob('*'):
  if not p.is_file():continue
  rel=p.relative_to(native)
  if rel.parts[0]in{'objects','raw'}:continue
  if rel.parts[0]=='integrated'and p.name!='runtime-integration.json':continue
  if rel.parts[0]=='checks'and p.suffix not in {'.json','.txt','.log'}:continue
  require(p.suffix in {'.cpp','.h','.inc','.patch','.json','.txt','.py','.sh','.md','.log'},'Unreviewed native source type')
  paths.add(p.relative_to(ROOT).as_posix())
 for name in ['initial-fallback.json','ISSUES-AND-CHECKS.md','all-combat-ui-090-checks.json','native-ui-contract-review-090.json']:
  require((ROOT/'release-records'/name).is_file(),'Missing source/check record: '+name);paths.add('release-records/'+name)
 return sorted(paths)

def prepare(source):
 names=source.namelist();require(len(names)==len(set(names))==14156,'Unexpected complete0.89 member set')
 play=json.loads(source.read('google-play-release/overlay-manifest.json'));normal=json.loads(source.read('normal-release-089/overlay-manifest.json'))
 accepted={};effective={};prior_sources={}
 def add(name,*values):accepted.setdefault(name,set()).update(values)
 for row in play['files']:
  add(row['path'],row['baselineSHA256'],row['playSHA256']);effective[row['path']]=row['playSHA256'];prior_sources[row['path']]='google-play-release/overrides/'+row['path']
 for row in normal['files']:
  add(row['path'],row['rootBaselineSHA256'],row['normalSHA256']);effective[row['path']]=row['normalSHA256'];prior_sources[row['path']]='normal-release-089/overrides/'+row['path']
 rows=[];allowed=set()
 for name in inputs():
  safe(name);path=ROOT/name;require(path.is_file()and not path.is_symlink(),'Missing/symlink source input');data=path.read_bytes();secret_check(name,data)
  raw=sha256(source.read(name)).hexdigest()if name in names else None
  rows.append(dict(path=name,rootBaselineSHA256=raw,priorSHA256=effective.get(name,raw),testSHA256=sha256(data).hexdigest(),bytes=len(data)))
  write(PROFILE/'overrides'/name,data);allowed.add('overrides/'+name)
 retained=[dict(path=name,sha256=sha256(source.read(name)).hexdigest())for name in names
           if name.startswith(('google-play-release/','normal-release-089/'))and not name.endswith('/')]
 m=dict(schemaVersion=1,versionCode=90,versionName='0.90',profile='local-test-normal-apk-only',completeBaselineArchive=BASE.name,
  completeBaselineSHA256=BASE_SHA,completeBaselineMembers=14156,priorEffectiveFiles=effective,priorOverrideSources=prior_sources,
  acceptedRootHashes={name:sorted(values,key=lambda x:x or'')for name,values in accepted.items()},retainedProfileFiles=retained,files=rows)
 jwrite(PROFILE/'overlay-manifest.json',m);write(PROFILE/'prepare-and-build.py',WRAPPER.encode());write(PROFILE/'README.md',README.encode());write(PROFILE/'package-complete-source.py',Path(__file__).read_bytes())
 allowed.update({'overlay-manifest.json','prepare-and-build.py','README.md','package-complete-source.py','RESTORE-CHECK.json',
                 'VALIDATION.json','APK-INTEGRITY.json','RUNTIME.json','AUDIT.md','RUNTIME-ATTACHMENTS.json','PACKAGING-CHECKS.json'})
 attachment_manifest=target('RUNTIME-ATTACHMENTS.json')
 if attachment_manifest.is_file():
  for row in readjson(attachment_manifest)['files']:
   name=safe(row['path']);require(name.startswith('validation/runtime/'),'Unexpected runtime attachment');require(digest(target(name))==row['sha256'],'Changed prepared attachment');allowed.add(name)
 actual={p.relative_to(PROFILE).as_posix()for p in PROFILE.rglob('*')if p.is_file()}
 require(actual<=allowed,'Unexpected/stale test profile files: '+str(actual-allowed));return m

def restore(source,m):
 fixture=ROOT/'source-overlay'/('restore-check-test090-'+uuid.uuid4().hex);require(fixture.resolve().is_relative_to((ROOT/'source-overlay').resolve()),'Unsafe fixture');fixture.mkdir()
 paths=set(m['acceptedRootHashes'])|{x['path']for x in m['files']};names=set(source.namelist())
 for name in paths|{x['path']for x in m['retainedProfileFiles']}:
  if name in names:write(fixture/name,source.read(name))
 shutil.copytree(PROFILE,fixture/NAME);cmd=[sys.executable,str(fixture/NAME/'prepare-and-build.py'),'--apply-only']
 def run(ok=True):
  p=subprocess.run(cmd,capture_output=True,text=True);require((p.returncode==0)==ok,p.stdout+p.stderr)
 def state():return{name:digest(fixture/name)if(fixture/name).is_file()else None for name in paths}
 expected=dict(m['priorEffectiveFiles']);expected.update({x['path']:x['testSHA256']for x in m['files']})
 def exact():require(all(digest(fixture/name)==value for name,value in expected.items()),'Restore differs')
 run();exact();before=state();run();require(state()==before,'Repeated apply differs')
 write(fixture/'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java',source.read('app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'))
 write(fixture/'app/build.gradle.kts',source.read('normal-release-089/overrides/app/build.gradle.kts'))
 (fixture/'tools/build-native-selection-090.py').unlink();run();exact()
 for name in ['AGENTS.md','app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java']:
  p=fixture/name;old=p.read_bytes();p.write_bytes(old+b'\nLOCAL EDIT GUARD\n');before=state();run(False);require(state()==before,'Local-edit refusal mutated source');p.write_bytes(old)
 p=fixture/NAME/'overrides/app/build.gradle.kts';old=p.read_bytes();p.write_bytes(old+b'TAMPERED');before=state();run(False);require(state()==before,'Corrupt override mutated source');p.write_bytes(old)
 exact();result=dict(passed=True,firstApply=True,repeatedApply=True,interruptedKnownStateApply=True,localEditRefusedBeforeMutation=True,
  corruptOverrideRefusedBeforeMutation=True,buildOrPublicationExecuted=False,sourceProfileManifestSHA256=digest(PROFILE/'overlay-manifest.json'),fixture=str(fixture))
 jwrite(PROFILE/'RESTORE-CHECK.json',result);return result

def gates(m):
 records=ROOT/'release-records';buffers={name:bounded(records/name,4*1024*1024)for name in ['final-validation.json','apk-integrity.json','focused-runtime.json','AUDIT.md','source-attachment-checks.json']}
 final=json.loads(buffers['final-validation.json'].decode('utf-8-sig'));integrity=json.loads(buffers['apk-integrity.json'].decode('utf-8-sig'));runtime=json.loads(buffers['focused-runtime.json'].decode('utf-8-sig'))
 apk=Path(integrity['apk']);expected=digest(apk)
 for label,p in [('final',final),('integrity',integrity),('runtime',runtime)]:
  require(p.get('passed')is True and p.get('candidateAPK_SHA256')==expected and p.get('versionCode')==90 and p.get('versionName')=='0.90'and p.get('certificateSHA256')==SIGNER,label+' proof identity mismatch')
 require(final.get('sourceProfileManifestSHA256')==digest(PROFILE/'overlay-manifest.json'),'Final source manifest mismatch')
 require(integrity.get('allSourceAssetsMatchAPK')is True and integrity.get('playStoreBuild')is False and integrity.get('aabBuilt')is False and set(integrity.get('changedAssets',[]))==ASSETS,'Normal test APK integrity scope mismatch')
 require(set(runtime.get('modesVerified',[]))=={'towers','ffa','campaign','multiplayer'},'Missing four-mode runtime')
 for key in ['persistentCombatLatchVerified','offDeselectVerified','globalNewProductionVerified','selectedBarsAndBracketsRemoved','navigationAndInputRestored']:require(runtime.get(key)is True,'Runtime check missing: '+key)
 for key,name in [('integrityProof','apk-integrity.json'),('runtimeProof','focused-runtime.json')]:
  ref=final.get(key,{});require(ref.get('path')==name and ref.get('sha256')==sha256(buffers[name]).hexdigest(),'Final proof reference changed')
 require(final.get('auditSHA256')==sha256(buffers['AUDIT.md']).hexdigest(),'Final audit changed')
 checks=json.loads(buffers['source-attachment-checks.json'].decode('utf-8-sig'));require(checks.get('passed')is True and checks.get('packagerSHA256')==digest(Path(__file__)),'Current packaging guard checks required')
 evidence=runtime.get('evidenceFiles');require(isinstance(evidence,list)and bool(evidence),'Hash-bound runtime evidence required')
 attachments=[]
 for i,row in enumerate(evidence,1):
  path=Path(row['path']);path=path if path.is_absolute()else records/path
  require(path.resolve().is_relative_to(RUNTIME.resolve()),'Evidence outside owned runtime directory')
  require(path.is_file()and not path.is_symlink()and digest(path)==row['sha256'],'Runtime evidence changed: '+str(path))
  if path.suffix.lower()not in {'.json','.png'}:continue
  require(not re.search(r'(?:^|[._-])(?:password|secret|credentials?|id_rsa|id_ed25519|keystore|known_hosts)(?:[._-]|$)',path.name,re.I),'Sensitive runtime attachment name')
  data=bounded(path,32*1024*1024);require(sha256(data).hexdigest()==row['sha256'],'Runtime evidence changed during copy');secret_check(path.name,data)
  if path.suffix.lower()=='.json':json.loads(data.decode('utf-8-sig'))
  else:require(data.startswith(b'\x89PNG\r\n\x1a\n'),'Invalid PNG attachment')
  filename=re.sub('[^A-Za-z0-9._-]','_',path.name);name='validation/runtime/'+str(i).zfill(3)+'-'+filename
  attachments.append((name,data,row['path']))
 require(sum(len(x[1])for x in attachments)<=128*1024*1024,'Runtime attachment total bound exceeded')
 with zipfile.ZipFile(apk)as z:
  for row in m['files']:
   if row['path'].startswith('app/src/main/assets/'):
    with z.open('assets/'+row['path'].removeprefix('app/src/main/assets/'))as stream:require(file_digest(stream,'sha256').hexdigest()==row['testSHA256'],'Current source asset differs from APK')
 payloads=[(name,data)for name,data,_ in attachments]
 payloads.append(('RUNTIME-ATTACHMENTS.json',(json.dumps(dict(files=[dict(path=n,sha256=sha256(d).hexdigest(),bytes=len(d),source=p)for n,d,p in attachments]),indent=2)+'\n').encode()))
 payloads.extend((dst,buffers[src])for dst,src in [('VALIDATION.json','final-validation.json'),('APK-INTEGRITY.json','apk-integrity.json'),('RUNTIME.json','focused-runtime.json'),('AUDIT.md','AUDIT.md'),('PACKAGING-CHECKS.json','source-attachment-checks.json')])
 stage(payloads)
 return expected

def package():
 require(not OUTPUT.exists(),'Refusing to overwrite a delivery source archive')
 with BASE.open('rb')as source,OUTPUT.open('xb')as target:shutil.copyfileobj(source,target,8*1024*1024)
 with zipfile.ZipFile(BASE)as z:original=z.infolist();prefix=z.start_dir
 with zipfile.ZipFile(OUTPUT,'a',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as z:
  for p in sorted(PROFILE.rglob('*')):
   if p.is_file():require(not p.is_symlink(),'Profile symlink refused');z.write(p,NAME+'/'+p.relative_to(PROFILE).as_posix())
 with zipfile.ZipFile(OUTPUT)as z:
  names=z.namelist();require(len(names)==len(set(names))and names[:len(original)]==[x.filename for x in original],'Baseline member preservation failed')
  for old,new in zip(original,z.infolist()):require((old.CRC,old.file_size,old.compress_size,old.header_offset)==(new.CRC,new.file_size,new.compress_size,new.header_offset),'Baseline member metadata changed')
  for p in PROFILE.rglob('*'):
   if p.is_file():
    with z.open(NAME+'/'+p.relative_to(PROFILE).as_posix())as stream:require(file_digest(stream,'sha256').hexdigest()==digest(p),'Packaged profile differs')
 with BASE.open('rb')as old,OUTPUT.open('rb')as new:
  left=prefix
  while left:
   size=min(left,8*1024*1024);require(old.read(size)==new.read(size),'Original compressed local records changed');left-=size
 return dict(output=str(OUTPUT),bytes=OUTPUT.stat().st_size,sha256=digest(OUTPUT),allOriginal14156MembersPreserved=True,originalLocalRecordPrefixBytes=prefix,originalLocalRecordPrefixByteIdentical=True,noDuplicateMembers=True)

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--package',action='store_true');a=p.parse_args()
 require(digest(BASE)==BASE_SHA,'Immutable complete0.89 source baseline changed')
 with zipfile.ZipFile(BASE)as source:
  m=prepare(source);apk_sha=gates(m)if a.package else None;report=restore(source,m)
 report.update(sourceFiles=len(m['files']),sourceProfileManifestSHA256=digest(PROFILE/'overlay-manifest.json'),archiveCreated=False,publicationRequired=False)
 if a.package:report.update(package(),archiveCreated=True,candidateAPK_SHA256=apk_sha)
 jwrite(ROOT/'release-records/source-package-validation.json',report);print(json.dumps(report,indent=2))
if __name__=='__main__':main()
