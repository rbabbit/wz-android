'use strict';
// Run the existing native construction journeys against the isolated delivery.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const live=require('./native-live.cjs'),journey=require('./lab-journey.cjs');
const {root,out,screen}=live;
const report={passed:false,seeded:false,cases:[],started:new Date().toISOString()};
async function child(name,file,args=[]){
 const folder=path.join(out,name);fs.mkdirSync(folder,{recursive:true});
 console.log('START '+name);
 const log=fs.createWriteStream(path.join(folder,'run.log'));
 const code=await new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[path.join(root,'tools',file),...args],{cwd:root,env:{...process.env,WZ_NATIVE_QA:folder}});
  p.stdout.on('data',b=>{log.write(b);process.stdout.write(b)});p.stderr.on('data',b=>{log.write(b);process.stderr.write(b)});
  p.on('error',reject);p.on('close',resolve);
 });
 await new Promise(resolve=>log.end(resolve));
 if(code!==0)throw Error(name+' failed with exit '+code);
 const filename=name==='wide-controls'?'audit-building-wide.json':name==='numbered-sites'?'audit-build-display.json':'audit-build-display-td1.json';
 const result=JSON.parse(fs.readFileSync(path.join(folder,filename),'utf8'));
 if(!result.passed)throw Error(name+' has no passed native evidence');
 report.cases.push({name,report:path.relative(root,path.join(folder,filename)).replaceAll('\\','/'),passed:true});
 console.log('PASS '+name);
}
async function prepare(){const c=await journey.connectReady();try{await journey.restoreFixture(c,'early',report);await journey.pause(c)}finally{c.close()}}
(async()=>{
 report.identity=journey.installedIdentity(process.env.WZ_QA_APK);
 try{
  await prepare();await child('wide-controls','audit-building-wide.cjs');
  await child('numbered-sites','audit-build-display.cjs',['--reuse']);
  report.afterIdentity=journey.installedIdentity(process.env.WZ_QA_APK);
  if(report.afterIdentity.candidateAPK_SHA256!==report.identity.candidateAPK_SHA256)throw Error('APK changed during construction verification');
  report.passed=true;
 }catch(error){report.failure=String(error.stack||error);try{screen('building-failure');const c=await journey.connectReady();try{report.failureState={commands:await c.evaluate('__warzoneCommands.report()'),waves:await c.evaluate('__warzoneTowersWaves.report()')};await journey.pause(c)}finally{c.close()}}catch(recovery){report.recoveryFailure=String(recovery)}throw error;
 }finally{report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'building-journey.json'),JSON.stringify(report,null,2))}
})().catch(error=>{console.error(error);process.exitCode=1});
