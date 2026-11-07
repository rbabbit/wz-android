'use strict';
// Read-only preservation evidence. Never launches or writes the stable app.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),cp=require('child_process');
const live=require('./native-live.cjs'),j=require('./lab-journey.cjs'),root=live.root,base=path.dirname(root),qa=path.join(root,'qa/test-03');
const hash=p=>new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),s=fs.createReadStream(p);s.on('error',reject);s.on('data',b=>h.update(b));s.on('end',()=>resolve(h.digest('hex')))});
function stable(){
 const pkg='com.rbabbit.warzonetowers',prefix=['shell','run-as',pkg],names=live.adb(...prefix,'ls','shared_prefs').toString().trim().split(/\r?\n/).filter(n=>n.endsWith('.xml')).sort();
 const preferences=names.map(name=>{assert.match(name,/^[\w.-]+\.xml$/);const file='shared_prefs/'+name,data=live.adb('exec-out','run-as',pkg,'cat',file),sha256=crypto.createHash('sha256').update(data).digest('hex');assert.equal(sha256,live.adb(...prefix,'sha256sum',file).toString().split(/\s/)[0],'raw exec-out byte hash agrees with on-device SHA-256');return{name,sha256}});
 const apk=live.adb('shell','pm','path',pkg).toString().trim().replace(/^package:/,'');
 return{package:pkg,apkSHA256:live.adb('shell','sha256sum',apk).toString().split(/\s/)[0],preferences};
}
(async()=>{
 fs.mkdirSync(qa,{recursive:true});const before=process.argv.includes('--before'),baseline=path.join(qa,'stable-before.json');
 const current=stable(),r={recordedUTC:new Date().toISOString(),method:'Read-only Git/filesystem/ADB hashes; no stable app launch or writes',stable:current};
 assert.equal(current.apkSHA256,'12532300d9ce2010b911fae879a6e197eb059a98bd672901bd65307cd9f3532a');
 const previous=JSON.parse(fs.readFileSync(path.join(root,'qa/test-02/final-integrity.json')));
 const prior=previous.preferenceComparison.files;
 assert.deepEqual(current.preferences,prior.map(({name,sha256})=>({name,sha256})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0),'raw stable preference bytes match the previous final on-device capture');
 r.stablePreferenceHashMethod='Raw ADB exec-out Buffer plus independently checked on-device sha256sum; shell cat transport can convert LF to CRLF and is deliberately not used for byte checks';
 if(before){assert.ok(!fs.existsSync(baseline));fs.writeFileSync(baseline,JSON.stringify(r,null,2));console.log('Recorded actual stable APK and all preference hashes; match previous final capture');return;}
 assert.deepEqual(current,JSON.parse(fs.readFileSync(baseline)).stable,'stable APK/preferences match this task audit baseline');
 const stableRoot=path.join(base,'wz-tower-defense');r.stableHead=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:stableRoot,encoding:'utf8'}).trim();assert.equal(r.stableHead,'9280cccad984320503240d9a39e7d766646c1dfe');assert.equal(cp.execFileSync('git',['status','--porcelain=v1'],{cwd:stableRoot,encoding:'utf8'}),'');
 const python='C:/Users/punke/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';r.stableSourceVerification=cp.execFileSync(python,['tools/verify-project.py'],{cwd:stableRoot,encoding:'utf8'}).trim();assert.match(r.stableSourceVerification,/Verified 4916 project files/);
 r.artifacts=[];
 const extra=[{path:path.join(base,'Warzone-Towers-Test-02.apk'),sha256:'64324e568fd21ac449958d3f0d6e0f289e1ef9a06befd1d05de550fee272822f'},{path:path.join(base,'warzone-towers-test-02-source.zip'),sha256:'df8f76b11810c3978f4e96bd0c5dc2c27546c3a2793475bfb7685d6e7adb7dff'}];
 for(const entry of [...previous.frozenArtifacts,...previous.copiedFallback,...extra]){const actual=await hash(entry.path);assert.equal(actual,entry.sha256,'frozen artifact '+entry.path);r.artifacts.push({path:entry.path,sha256:actual})}
 for(const entry of extra){const p=path.join(base,'fallbacks/towers-before-module-fix-20261107',path.basename(entry.path));assert.equal(await hash(p),entry.sha256);r.artifacts.push({path:p,sha256:entry.sha256})}
 r.identity=j.installedIdentity();r.passed=true;r.stablePreferencesUnchanged=true;r.stableSourceAndAPKUnchanged=true;r.fallbacksPreserved=true;
 fs.writeFileSync(path.join(qa,'final-integrity.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({passed:true,stableFiles:4916,frozenArtifacts:r.artifacts.length,identity:r.identity}));
})().catch(e=>{console.error(e);process.exitCode=1});
