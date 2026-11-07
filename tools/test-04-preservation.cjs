'use strict';
// Read-only preservation checks: no app launches, input or preference writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const live=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const root=live.root,base=path.dirname(root),qa=path.join(root,'qa/test-04');
const hash=p=>new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),s=fs.createReadStream(p);s.on('error',reject);s.on('data',b=>h.update(b));s.on('end',()=>resolve(h.digest('hex')));});
const frozen03={
 'Warzone-Towers-0.3.apk':'a623655e457bb8e397267b711a019b3787a22402b29cd182444f3a21bdae8ef4',
 'warzone-towers-0.3-source.zip':'6848f58e6e1340a2535ad67c1ac3f0afbce828b76893a92b1ff13a1a83fe92f6'
};
function stable(){
 const pkg='com.rbabbit.warzonetowers',prefix=['shell','run-as',pkg];
 const names=live.adb(...prefix,'ls','shared_prefs').toString().trim().split(/\r?\n/).filter(n=>n.endsWith('.xml')).sort();
 const preferences=names.map(name=>{
  assert.match(name,/^[\w.-]+\.xml$/);const file='shared_prefs/'+name;
  const bytes=live.adb('exec-out','run-as',pkg,'cat',file),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha256,live.adb(...prefix,'sha256sum',file).toString().split(/\s/)[0],'raw exec-out hash matches native byte hash');
  return{name,sha256};
 });
 const installed=live.adb('shell','pm','path',pkg).toString().trim();assert.match(installed,/^package:\S+\/base\.apk$/);
 return{package:pkg,apkSHA256:live.adb('shell','sha256sum',installed.slice(8)).toString().split(/\s/)[0],preferences};
}
(async()=>{
 fs.mkdirSync(qa,{recursive:true});const before=process.argv.includes('--before'),baseline=path.join(qa,'stable-before.json');
 const previous=JSON.parse(fs.readFileSync(path.join(root,'qa/test-03/final-integrity.json'),'utf8'));
 assert.equal(previous.passed,true);const current=stable();
 assert.equal(current.apkSHA256,'12532300d9ce2010b911fae879a6e197eb059a98bd672901bd65307cd9f3532a');
 assert.deepEqual(current,previous.stable,'stable APK and raw preference bytes equal the preserved 0.3 final capture');
 const report={recordedUTC:new Date().toISOString(),method:'Read-only Git/filesystem/ADB hashes; no app launch, input or stable preference writes',
  stable:current,stablePreferenceHashMethod:'Raw ADB exec-out Buffer independently checked with on-device sha256sum',
  comparisonBaseline:'qa/test-03/final-integrity.json'};
 if(before){assert.equal(fs.existsSync(baseline),false,'do not overwrite the initial preservation capture');fs.writeFileSync(baseline,JSON.stringify(report,null,2)+'\n');console.log('PASS: recorded unchanged stable APK and raw preferences against preserved 0.3 final baseline');return;}
 assert.deepEqual(current,JSON.parse(fs.readFileSync(baseline,'utf8')).stable,'stable APK/preferences match this task initial capture');
 const stableRoot=path.join(base,'wz-tower-defense');
 report.stableHead=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:stableRoot,encoding:'utf8'}).trim();assert.equal(report.stableHead,'9280cccad984320503240d9a39e7d766646c1dfe');
 assert.equal(cp.execFileSync('git',['status','--porcelain=v1'],{cwd:stableRoot,encoding:'utf8'}),'');
 const python='C:/Users/punke/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
 report.stableSourceVerification=cp.execFileSync(python,['tools/verify-project.py'],{cwd:stableRoot,encoding:'utf8'}).trim();assert.match(report.stableSourceVerification,/Verified 4916 project files/);
 const fallback=path.join(base,'fallbacks/towers-before-module-ui-fix-20261107');
 const manifest=JSON.parse(fs.readFileSync(path.join(fallback,'fallback-manifest.json'),'utf8'));
 assert.equal(manifest.preservedBeforeEdits,true);assert.deepEqual(Object.fromEntries(manifest.files.map(e=>[e.name,e.sha256])),frozen03);
 const extra=Object.entries(frozen03).flatMap(([name,sha256])=>[{path:path.join(base,name),sha256},{path:path.join(fallback,name),sha256}]);
 report.artifacts=[];
 for(const entry of [...previous.artifacts,...extra]){
  const actual=await hash(entry.path);assert.equal(actual,entry.sha256,'frozen artifact '+entry.path);report.artifacts.push({path:entry.path,sha256:actual});
 }
 assert.equal(report.artifacts.length,16,'older twelve artifacts plus current original/copy APK and source remain preserved');
 report.identity=journey.installedIdentity();report.candidateAPK_SHA256=report.identity.candidateAPK_SHA256;report.installedAPK_SHA256=report.identity.candidateAPK_SHA256;
 report.passed=true;report.bothAppsInstalled=true;report.stablePreferencesUnchanged=true;report.stableSourceAndAPKUnchanged=true;report.fallbacksPreserved=true;
 fs.writeFileSync(path.join(qa,'final-integrity.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,stableFiles:4916,frozenArtifacts:report.artifacts.length,identity:report.identity}));
})().catch(error=>{console.error(error);process.exitCode=1;});
