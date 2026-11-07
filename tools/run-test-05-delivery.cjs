'use strict';
// One integrated relevant journey on the exact candidate; old evidence is never overwritten.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'qa/test-05'),apk=path.resolve(process.env.WZ_QA_APK||path.join(root,'app/build/outputs/apk/debug/app-debug.apk'));
const phases=[
 ['ordinary-preview-and-mixed-module','test-05-preview-journey.cjs','preview-journey',[...(process.env.WZ_QA_REUSE_START==='1'?['--reuse']:[]),...(process.env.WZ_QA_PREPARED_SAVE==='1'?['--prepared-save']:[])]],
 ['raised-platform-and-cyborg-footprint','audit-build-display-td1.cjs','raised-footprint',[]],
 ['research-power-and-native-save-load','test-04-module-journey.cjs','module-journey',['--phase','dustfall']],
 ['factory-two-levels-and-normal-production','test-04-module-journey.cjs','factory-journey',['--phase','factory']],
 ['module-layout-and-same-item-reselection','test-04-module-layout.cjs','module-layout',[]],
 ['mixed-selection-fifo-movement-and-returns','test-03-mixed-selection.cjs','mixed-regression',[]],
 ['twelve-paused-returns','test-02-paused-returns.cjs','paused-returns',['--apk',apk]],
 ['keyboard-returns','lab-journey.cjs','keyboard-returns',['keyboard','--apk',apk]],
 ['native-quit-and-fresh-battle','test-02-quit-journey.cjs','quit-return',['--apk',apk]],
];
const reportFiles={
 'preview-journey':'preview-journey.json','raised-footprint':'audit-build-display-td1.json',
 'module-journey':'module-journey-dustfall.json','factory-journey':'module-journey-factory.json',
 'module-layout':'module-layout.json','mixed-regression':'mixed-selection.json',
 'paused-returns':'test-02-paused-returns.json','keyboard-returns':'lab-journey-keyboard.json',
 'quit-return':'test-02-quit-journey.json',
};
const args=process.argv.slice(2),resumeTail=args.includes('--resume-tail');
assert.ok(args.every(arg=>arg==='--resume-tail'),'only --resume-tail is supported');
fs.mkdirSync(qa,{recursive:true});const j=require('./lab-journey.cjs'),file=path.join(qa,'integrated-journey.json');
let report={passed:false,started:new Date().toISOString(),identity:j.installedIdentity(apk),phases:[]},writeEnabled=!resumeTail,resumption;
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const record=(name,data)=>({path:path.relative(root,name).replaceAll('\\','/'),sha256:digest(data)});
const write=()=>{if(writeEnabled)fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n')};
function exactIdentity(value,expected,label){
 let count=0;
 if(value&&typeof value==='object')for(const[key,item]of Object.entries(value)){
  if(['candidateAPK_SHA256','installedAPK_SHA256','expectedAPK_SHA256','buildAPK_SHA256'].includes(key)&&item){assert.equal(item,expected,label+': exact candidate identity');count++;}
  else if(item&&typeof item==='object')count+=exactIdentity(item,expected,label);
 }
 return count;
}
function verifiedReport(folder,expected){
 const name=path.join(qa,folder,reportFiles[folder]),bytes=fs.readFileSync(name),value=JSON.parse(bytes);
 assert.equal(value.passed,true,folder+': raw report must actually pass');
 assert.ok(!value.failure&&!value.cleanupFailure,folder+': no unresolved failure');
 assert.ok(exactIdentity(value,expected,folder)>0,folder+': raw exact-APK identity is required');
 return record(name,bytes);
}
function preserve(bytes,base){
 const directory=path.join(qa,'iteration-r4-quit-readiness');fs.mkdirSync(directory,{recursive:true});
 const extension=path.extname(base),stem=base.slice(0,-extension.length);let target=path.join(directory,base),index=1;
 while(fs.existsSync(target)&&digest(fs.readFileSync(target))!==digest(bytes))target=path.join(directory,stem+'-'+(++index)+extension);
 if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx'});
 return record(target,bytes);
}
function prepareTailResume(){
 const bytes=fs.readFileSync(file),prior=JSON.parse(bytes),installed=report.identity,expected=installed.candidateAPK_SHA256;
 assert.equal(prior.passed,false,'tail recovery requires an interrupted, unfinished journey');
 assert.equal(prior.current,phases.at(-1)[0],'only final fresh-battle startup may be resumed');
 assert.equal(prior.identity?.candidateAPK_SHA256,expected,'prior journey must use the exact installed candidate');
 assert.equal(prior.identity?.packageId,installed.packageId,'prior/current app package must match');
 assert.equal(prior.identity?.device,installed.device,'reuse the same prepared emulator');
 assert.equal(prior.phases?.length,phases.length-1,'exactly the first eight phases must already pass');
 const sourceReports=phases.slice(0,-1).map(([name,,folder],i)=>{
  assert.deepEqual([prior.phases[i].name,prior.phases[i].folder,prior.phases[i].passed],[name,folder,true],'retained phase chronology must match');
  return verifiedReport(folder,expected);
 });
 // Validate everything before changing the current report. The root-owned raw
 // Quit report is preserved by its own --resume-startup helper, never here.
 const previousIntegrated=preserve(bytes,'integrated-journey-before-tail-resume.json');
 const oldLog=path.join(qa,'quit-return/delivery-run.log'),previousLog=fs.existsSync(oldLog)?preserve(fs.readFileSync(oldLog),'quit-delivery-run-before-tail-resume.log'):null;
 resumption={started:new Date().toISOString(),method:'Retain eight hash-verified exact-APK phases; resume only the actual fresh-battle startup following recorded native Quit/Confirm and app start.',
  previousIntegrated,previousLog,previousFinished:prior.finished,previousFailure:prior.failure,installedIdentity:installed,retainedSourceReports:sourceReports,rerunPhases:[phases.at(-1)[0]],passed:false};
 report={...prior,passed:false,tailResumptions:[...(prior.tailResumptions||[]),resumption]};delete report.failure;delete report.finished;writeEnabled=true;write();
}
(async()=>{try{
 if(resumeTail)prepareTailResume();
 const scheduled=resumeTail?phases.slice(-1):phases;
 for(const[name,tool,folder,phaseArgs]of scheduled){
  const started=new Date().toISOString(),childArgs=resumeTail?[...phaseArgs,'--resume-startup']:phaseArgs;
  report.current=name;write();console.log('START '+name);const out=path.join(qa,folder);fs.mkdirSync(out,{recursive:true});
  const log=fs.createWriteStream(path.join(out,'delivery-run.log'));
  let code;try{code=await new Promise((resolve,reject)=>{const child=cp.spawn(process.execPath,[path.join(root,'tools',tool),...childArgs],{cwd:root,env:{...process.env,WZ_NATIVE_QA:out,WZ_QA_APK:apk,WZ_QA_EXPECTED_APK_SHA256:report.identity.candidateAPK_SHA256}});for(const stream of ['stdout','stderr'])child[stream].on('data',data=>{log.write(data);process[stream].write(data)});child.on('error',reject);child.on('close',resolve)});}finally{await new Promise(resolve=>log.end(resolve));}
  assert.equal(code,0,name+' must pass');const sourceReport=verifiedReport(folder,report.identity.candidateAPK_SHA256);report.phases.push({name,folder,passed:true,started,finished:new Date().toISOString(),sourceReport,...(resumeTail?{resumed:true}:{})});write();console.log('PASS '+name);
 }
 report.afterIdentity=j.installedIdentity(apk);assert.equal(report.afterIdentity.candidateAPK_SHA256,report.identity.candidateAPK_SHA256);report.current='completed';report.passed=true;if(resumption)resumption.passed=true;
}catch(error){report.failure=String(error.stack||error);throw error;}finally{report.finished=new Date().toISOString();if(resumption)resumption.finished=report.finished;write();}})().catch(error=>{console.error(error);process.exitCode=1});
