"""Package an explicitly INCOMPLETE local test checkpoint; verified gate stays intact."""
from pathlib import Path
from hashlib import sha256,file_digest
import argparse,json,runpy,uuid,zipfile

ROOT=Path(__file__).resolve().parents[1]
RECORDS=ROOT/'release-records';RUNTIME=ROOT.parents[1]/'normal-test-090-20261116'
STANDARD=RECORDS/'package-test-source-090.py'
APK_SHA='ee65c0cd433f5959ff9b2cbc40de6f3e98c79f4c080996e87b3eeaa983403de2'
APK_BYTES=612992260
INTEGRITY_SHA='5526f323fe529e13f42643848765a9f33301508eea2e51d2935395e2ba4a4225'
PROFILE_SHA='440dec652c3262ec6059f61ac8edf6670c143970c6c0bf829656197f4f76ca42'
STANDARD_SHA='6402708f96efcad046a7d30a4dfb5dffc3374ecd8645e5d6c30786b90099ed88'
SIGNER='4499efe00477c7c724c06a1dd96f935864548665c13ab5e2bd0a9c0f83f7cb15'
MODES={'towers','ffa','campaign','multiplayer'}

def require(value,message):
 if not value:raise RuntimeError(message)

def digest(path):
 with Path(path).open('rb')as stream:return file_digest(stream,'sha256').hexdigest()

def bounded(path,limit=4*1024*1024):
 require(path.is_file()and not path.is_symlink()and 0<path.stat().st_size<=limit,'Invalid proof path/size')
 with path.open('rb')as stream:data=stream.read(limit+1)
 require(0<len(data)<=limit,'Proof size changed beyond bound');return data

def document(data):return json.loads(data.decode('utf-8-sig'))

def encoded(value):return(json.dumps(value,indent=2)+'\n').encode()

def identity(value):
 require(value.get('candidateAPK_SHA256')==APK_SHA and value.get('versionCode')==90
  and value.get('versionName')=='0.90'and value.get('certificateSHA256')==SIGNER,'Wrong exact test APK proof identity')

def runtime_document(data,expected_sha):
 require(sha256(data).hexdigest()==expected_sha,'Runtime proof hash changed')
 headers=[b'-----BEGIN '+kind+b'-----'for kind in [b'PRIVATE KEY',b'OPENSSH PRIVATE KEY',b'RSA PRIVATE KEY']]
 require(not any(x in data for x in headers),'Private key bytes refused')
 value=document(data);identity(value)
 require(value.get('passed')is False and value.get('status')=='incomplete','Checkpoint requires an honest incomplete runtime report')
 modes=value.get('modesVerified');require(isinstance(modes,list)and len(modes)==len(set(modes))and set(modes)<MODES,'Only fully observed modes belong in modesVerified')
 for key in ['verifiedChecks','remainingVerification']:
  rows=value.get(key);require(isinstance(rows,list)and bool(rows)and all(isinstance(x,str)and x.strip()for x in rows),'Missing explicit '+key)
 require(value.get('limitationCategory')=='emulator-visual','Checkpoint is scoped to the disclosed emulator visual verification limit')
 require(isinstance(value.get('evidenceFiles'),list)and bool(value['evidenceFiles']),'Missing actual hash-bound runtime evidence')
 return value

def evidence_payloads(value,secret_check):
 import re
 payloads=[];manifest=[]
 for index,row in enumerate(value['evidenceFiles'],1):
  path=Path(row['path']);path=path if path.is_absolute()else RECORDS/path
  require(path.resolve().is_relative_to(RUNTIME.resolve()),'Evidence outside owned090 runtime directory')
  require(path.suffix.lower()in{'.json','.png'},'Only explicit JSON/PNG checkpoint evidence is exported')
  require(not re.search(r'(?:^|[._-])(?:password|secret|credentials?|id_rsa|id_ed25519|keystore|known_hosts)(?:[._-]|$)',path.name,re.I),'Sensitive attachment name refused')
  data=bounded(path,32*1024*1024);require(sha256(data).hexdigest()==row['sha256'],'Runtime evidence changed')
  secret_check(path.name,data)
  if path.suffix.lower()=='.json':document(data)
  else:require(data.startswith(b'\x89PNG\r\n\x1a\n'),'Invalid PNG evidence')
  name='validation/runtime/'+str(index).zfill(3)+'-'+re.sub('[^A-Za-z0-9._-]','_',path.name)
  payloads.append((name,data));manifest.append(dict(path=name,source=row['path'],sha256=sha256(data).hexdigest(),bytes=len(data)))
 require(sum(len(data)for _,data in payloads)<=128*1024*1024,'Checkpoint evidence bound exceeded')
 return payloads,manifest

def preflight(helper):
 require(digest(STANDARD)==STANDARD_SHA,'Verified packager changed')
 profile=helper['PROFILE'];manifest_data=bounded(profile/'overlay-manifest.json',8*1024*1024)
 require(sha256(manifest_data).hexdigest()==PROFILE_SHA,'Frozen source profile changed');manifest=document(manifest_data)
 for row in manifest['files']:
  for path in [ROOT/row['path'],profile/'overrides'/row['path']]:
   require(path.is_file()and not path.is_symlink()and digest(path)==row['testSHA256'],'Frozen source/override changed: '+row['path'])
 integrity_data=bounded(RECORDS/'apk-integrity.json');require(sha256(integrity_data).hexdigest()==INTEGRITY_SHA,'Frozen integrity report changed')
 integrity=document(integrity_data);identity(integrity)
 require(integrity.get('passed')is True and integrity.get('allSourceAssetsMatchAPK')is True
  and integrity.get('playStoreBuild')is False and integrity.get('aabBuilt')is False
  and set(integrity.get('changedAssets',[]))==helper['ASSETS'],'Normal test integrity scope changed')
 apk=Path(integrity['apk']);require(apk.stat().st_size==APK_BYTES and digest(apk)==APK_SHA,'Exact test APK changed')
 restore_data=bounded(RECORDS/'source-package-validation.json');restore=document(restore_data)
 require(restore.get('passed')is True and restore.get('sourceProfileManifestSHA256')==PROFILE_SHA
  and restore.get('archiveCreated')is False and restore.get('buildOrPublicationExecuted')is False,'Current restoration proof required')
 for key in ['firstApply','repeatedApply','interruptedKnownStateApply','localEditRefusedBeforeMutation','corruptOverrideRefusedBeforeMutation']:
  require(restore.get(key)is True,'Missing source restoration check: '+key)
 require(digest(helper['BASE'])==helper['BASE_SHA'],'Complete immutable089 baseline changed')
 with zipfile.ZipFile(apk)as archive:
  for row in manifest['files']:
   if row['path'].startswith('app/src/main/assets/'):
    with archive.open('assets/'+row['path'].removeprefix('app/src/main/assets/'))as stream:
     require(file_digest(stream,'sha256').hexdigest()==row['testSHA256'],'APK/source asset mismatch')
 return manifest,integrity_data,restore_data

def audit(value,runtime_sha):
 return ('# INCOMPLETE local test checkpoint\n\n'
  'This complete source archive matches normal test APK0.90/code90, SHA256 '+APK_SHA+'. '
  'Runtime validation is INCOMPLETE (passed:false). This is not a fully verified release.\n\n'
  'Observed checks:\n\n'+''.join('- '+x+'\n'for x in value['verifiedChecks'])+'\n'
  'Remaining verification / emulator limits:\n\n'+''.join('- '+x+'\n'for x in value['remainingVerification'])+'\n'
  'Only these modes have a complete observed journey: '+(', '.join(value['modesVerified'])or'none')+'. '
  'Native-state checks in an unpainted view do not establish screen usability. '
  'Prepared/seeded fixtures and any physical-device limitations remain as recorded in RUNTIME.json.\n\n'
  'Build/signature/658-source-asset integrity and source restoration passed their separate checks. '
  'The complete0.89 archive and all original compressed local records are retained; the exact0.90 profile overlays them. '
  'No AAB, VPS/feed/website, GitHub or Google Play publication is performed or authorized. '
  'User testing and explicit approval of this exact build are required before later publication.\n\n'
  'Runtime report SHA256: '+runtime_sha+'\nSource profile SHA256: '+PROFILE_SHA+'\n').encode()

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--package',action='store_true')
 parser.add_argument('--runtime-report',type=Path,default=RECORDS/'focused-runtime.json');parser.add_argument('--runtime-sha256')
 args=parser.parse_args();require(digest(STANDARD)==STANDARD_SHA,'Verified packager changed')
 helper=runpy.run_path(str(STANDARD));manifest,integrity_data,restore_data=preflight(helper)
 if not args.package:
  print(json.dumps(dict(status='ready-awaiting-actual-incomplete-runtime-report',archiveCreated=False,sourceProfileManifestSHA256=PROFILE_SHA,candidateAPK_SHA256=APK_SHA,verifiedPackagingGateUnchanged=True),indent=2));return
 require(args.runtime_sha256 and len(args.runtime_sha256)==64,'Explicit frozen runtime report SHA256 required')
 report_path=args.runtime_report.resolve();require(report_path.is_relative_to(RECORDS.resolve())or report_path.is_relative_to(RUNTIME.resolve()),'Runtime report outside owned proof directories')
 runtime_data=bounded(args.runtime_report);runtime=runtime_document(runtime_data,args.runtime_sha256)
 helper['secret_check'](args.runtime_report.name,runtime_data);attachments,evidence=evidence_payloads(runtime,helper['secret_check'])
 checks_data=bounded(RECORDS/'checkpoint-packaging-checks.json');checks=document(checks_data)
 require(checks.get('checkpointToolSHA256')==digest(Path(__file__))and checks.get('hostChecksPassed')is True,'Current checkpoint host checks required')
 require(not helper['OUTPUT'].exists(),'Refusing to overwrite a delivery archive')
 stage=ROOT/'source-overlay'/('checkpoint-test090-'+uuid.uuid4().hex)
 require(stage.resolve().is_relative_to((ROOT/'source-overlay').resolve())and not stage.exists(),'Unsafe checkpoint stage')
 namespace=helper['prepare'].__globals__;namespace['PROFILE']=stage
 with zipfile.ZipFile(helper['BASE'])as baseline:
  current=helper['prepare'](baseline);require(digest(stage/'overlay-manifest.json')==PROFILE_SHA,'Checkpoint source inputs changed')
  restored=helper['restore'](baseline,current)
 audit_data=audit(runtime,args.runtime_sha256)
 validation=dict(passed=False,status='incomplete',limitationCategory='emulator-visual',candidateAPK_SHA256=APK_SHA,candidateAPK_bytes=APK_BYTES,
  versionCode=90,versionName='0.90',certificateSHA256=SIGNER,sourceProfileManifestSHA256=PROFILE_SHA,
  integrityProofSHA256=INTEGRITY_SHA,runtimeProofSHA256=args.runtime_sha256,auditSHA256=sha256(audit_data).hexdigest(),
  completeSourceRestorationVerified=True,runtimeVerified=False,modesVerified=runtime['modesVerified'],remainingVerification=runtime['remainingVerification'],publicationPerformed=False)
 banner=b'# INCOMPLETE LOCAL TEST CHECKPOINT\n\nRuntime validation remains incomplete. Read AUDIT.md and RUNTIME.json before testing. No publication is authorized.\n\n'
 payloads=attachments+[(name,data)for name,data in [('VALIDATION.json',encoded(validation)),('APK-INTEGRITY.json',integrity_data),
  ('RUNTIME.json',runtime_data),('AUDIT.md',audit_data),('PACKAGING-CHECKS.json',checks_data),('SOURCE-RESTORATION.json',restore_data),
  ('RUNTIME-ATTACHMENTS.json',encoded(dict(files=evidence))),('README.md',banner+helper['README'].encode()),
  ('package-incomplete-checkpoint.py',Path(__file__).read_bytes())]]
 # prepare wrote README; replace only that exact known metadata before the
 # ordinary all-destination preflight. Source/override manifest stays identical.
 require((stage/'README.md').read_bytes()==helper['README'].encode(),'Unexpected checkpoint README');(stage/'README.md').unlink()
 helper['stage'](payloads)
 result=helper['package']();result.update(status='incomplete',runtimePassed=False,archiveIntegrityVerified=True,archiveCreated=True,
  sourceProfileManifestSHA256=PROFILE_SHA,candidateAPK_SHA256=APK_SHA,runtimeProofSHA256=args.runtime_sha256,publicationPerformed=False)
 helper['jwrite'](RECORDS/'source-checkpoint-package-validation.json',result);print(json.dumps(result,indent=2))
if __name__=='__main__':main()
