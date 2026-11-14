'use strict';
// Bounded on-device verification. Native fixtures are kept outside source ZIP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const q=require('./campaign-live-051.cjs');
const report={version:'0.52',passed:false,emulator:q.device,fixture:'Seeded native casualty; subsequent construction isolated from enemy waves.',checks:[]};
const output=path.join(q.out,'integrated.json');
const write=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));
const ids=['cmd-1794410894046-318','cmd-1794410894266-320','cmd-1794410894431-321'];
let c;
async function snapshot(){const r=await c.evaluate("__warzoneCommands.send('state',{}, {fresh:true})");assert(r.ok);return r.result;}
function check(name,data){report.checks.push({name,passed:true,data});write();console.log(name);}
async function focus(){await c.host("(()=>{const f=document.getElementById('warzone-game-frame');f.focus({preventScroll:true});f.contentDocument.getElementById('canvas').focus({preventScroll:true});return true})()");await c.paint();}
async function nativeSave(){await focus();const p=await c.evaluate("LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave'");const before=await c.evaluate(`(()=>{try{return LaunchedModule.FS.stat(${JSON.stringify(p)}+'/droid.json').mtime.getTime()}catch(_){return 0}})()`);await c.evaluate('__kalaWarzoneTouch.nativePressKey("F7","F7",118);true');await c.wait(`LaunchedModule.FS.stat(${JSON.stringify(p)}+'/droid.json').mtime.getTime()>${before}`,15000);return c.evaluate(`(()=>{let f=LaunchedModule.FS,p=${JSON.stringify(p)},v={path:p,files:{}};for(let n of f.readdir(p))if(n.endsWith('.json'))v.files[n]=JSON.parse(f.readFile(p+'/'+n,{encoding:'utf8'}));return v})()`);}
async function physical(x,y){const b=q.adb('exec-out','screencap','-p'),v=await c.host('({w:innerWidth,h:innerHeight})');q.adb('shell','input','tap',String(Math.round(x*b.readUInt32BE(16)/v.w)),String(Math.round(y*b.readUInt32BE(20)/v.h)));await c.paint();}
async function resume(id){await c.tap(`[data-site-id="${id}"] [data-resume-jobs]`);return c.wait(`__warzoneCommands.report().snapshot?.jobs.find(j=>j.id===${JSON.stringify(id)})?.workers.includes(160007)`,12000);}
(async()=>{c=await q.connect();try{
 const installed=q.adb('shell','pm','path',q.packageId).toString().trim().replace(/^package:/,'');report.installedAPK_SHA256=q.adb('shell','sha256sum',installed).toString().split(/\s/)[0];assert.equal(report.installedAPK_SHA256,crypto.createHash('sha256').update(fs.readFileSync(path.join(q.root,'app/build/outputs/apk/debug/app-debug.apk'))).digest('hex'));
 let s=await snapshot();assert.equal(s.jobs.length,3);assert(s.jobs.every(j=>j.reason==='builder-lost'&&!j.workers.length));
 // Avoid another expired fixture: defer only the upcoming wave in an emulator
 // checkpoint. The actual casualty was already observed in delivery-casualty.
 let v=await nativeSave(),g=v.files['scriptstate.json'].globals_0,shift=900000;let triggers=[];
 for(let[k,t]of Object.entries(v.files['scriptstate.json']))if(k.startsWith('triggers_')&&t.timerName==='next'){triggers.push({name:t.timerName,before:t.frame,after:t.frame+shift});t.frame+=shift;}
 if(g.warzoneTowersWaves_state?.deadline)g.warzoneTowersWaves_state.deadline+=shift;
 assert(triggers.length);await c.evaluate(`(()=>{let v=${JSON.stringify(v)},f=LaunchedModule.FS;for(let[n,j]of Object.entries(v.files))f.writeFile(v.path+'/'+n,JSON.stringify(j));return true})()`);
 fs.writeFileSync('C:/timerApp/_release-records/loss-builders052/recovery-quiet.json',JSON.stringify(v));
 await focus();const oldContext=s.recoveryContext;await c.evaluate('__kalaWarzoneTouch.nativePressKey("F8","F8",119);true');await c.wait(`__warzoneCommands.report().snapshot?.recoveryContext!==${JSON.stringify(oldContext)}&&__warzoneCommands.report().snapshot?.jobs.length===3`,20000);
 check('isolated-recovery-fixture',{triggers,description:'Upcoming next-wave trigger and display deadline deferred 900 seconds in emulator checkpoint only. Native construction rates, units, power and research unchanged.'});
 const before=await nativeSave(),foundation=Object.values(before.files['struct.json']).find(t=>t.id===160093);assert(foundation&&foundation.status===0&&foundation.currentBuildPts>0&&foundation.currentBuildPts<500);report.foundationBefore=foundation;
 await c.tap('#wt-open-queue');await c.wait("[...parent.document.querySelectorAll('[data-site-status=waiting-trucks]')].length>=3");q.screen('recovery-waiting');
 s=await snapshot();await c.tap(`[data-site-id="${ids[0]}"] [data-resume-jobs]`);await q.delay(500);let after=await snapshot();assert(after.jobs.every(j=>!j.workers.length));assert(after.trucks.every(t=>t.order===0));check('resume-without-selection-rejected',{selected:after.selectedUnits,jobs:after.jobs,trucks:after.trucks});
 await c.tap('#wt-open-queue');
 // Actual minimap touch to the prepared connected rear base.
 let p=await c.evaluate("(()=>{let b=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return{x:innerWidth-120+(55-32)*192/80+b.x,y:innerHeight-120+(74-40)*192/80+b.y}})()");await physical(p.x,p.y);
 await c.evaluate('WarzoneTerrain.refresh()');await c.paint();p=await c.evaluate("(()=>{let t=__warzoneCommands.report().snapshot.trucks.find(t=>t.id===160007),p=WarzoneTerrain.project((t.x+.5)*128,(t.y+.5)*128,t.z*128+16),f=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();return p&&{x:p.x+f.x,y:p.y+f.y,canvasW:innerWidth,canvasH:innerHeight}})()");assert(p&&p.x>0&&p.x<1280&&p.y>58&&p.y<576,JSON.stringify(p));await physical(p.x,p.y);
 await c.wait('__warzoneCommands.report().snapshot?.selectedUnits.length===1&&__warzoneCommands.report().snapshot.selectedUnits[0].id===160007',12000);s=await snapshot();check('explicit-single-truck-touch-selection',{point:p,selected:s.selectedUnits,trucks:s.trucks});q.screen('recovery-selected');
 await c.tap('#wt-open-queue');await resume(ids[0]);s=await snapshot();assert.deepEqual(s.jobs.find(j=>j.id===ids[0]).workers,[160007]);assert(s.jobs.slice(1).every(j=>!j.workers.length));check('resume-existing-job',{jobs:s.jobs,trucks:s.trucks});
 await c.tap('#wt-open-queue');await c.tap('#wt-field-toggle');await c.tap('#blocknight-stop');await c.wait(`!__warzoneCommands.report().snapshot?.jobs.some(j=>j.id===${JSON.stringify(ids[0])})`,12000);s=await snapshot();assert.equal(s.jobs.length,2);assert(s.jobs.every(j=>j.reason==='builder-lost'&&!j.workers.length));check('stop-preserves-unrelated-waiting-jobs',{jobs:s.jobs,trucks:s.trucks});
 await c.tap('#wt-field-toggle');await c.tap('#wt-open-queue');await c.wait('!!parent.document.querySelector("[data-resume-structure=\\"160093\\"]")',10000);await c.tap('[data-resume-structure="160093"]');await c.wait('__warzoneCommands.report().snapshot?.jobs.some(j=>j.resumeStructureId===160093&&j.workers.includes(160007))',12000);
 await resume(ids[1]);await resume(ids[2]);s=await snapshot();assert.equal(s.jobs.length,3);assert(s.jobs.every(j=>j.workers.length===1&&j.workers[0]===160007));check('orphan-foundation-and-remaining-plans-resumed',{jobs:s.jobs,trucks:s.trucks});q.screen('recovery-assigned');
 await c.tap('#wt-open-queue');
 const end=Date.now()+190000;let samples=[];while(Date.now()<end){s=await snapshot();samples.push({gameTime:s.gameTime,trucks:s.trucks,jobs:s.jobs,construction:s.constructionSites});report.progress=samples;write();if(!s.jobs.length)break;if(samples.length%8===0)console.log('Native build progress: '+s.jobs.map(j=>j.itemId+':'+j.status).join(', '));await q.delay(2000);}
 assert.equal(s.jobs.length,0,'Native jobs did not complete in bounded run');let completed=await nativeSave();let structures=Object.values(completed.files['struct.json']);let lab=structures.find(t=>t.id===160093),towerA=structures.find(t=>t.player===0&&t.name==='GuardTower1'&&Math.floor(t.position[0]/128)===32&&Math.floor(t.position[1]/128)===58),towerB=structures.find(t=>t.player===0&&t.name==='GuardTower1'&&Math.floor(t.position[0]/128)===34&&Math.floor(t.position[1]/128)===58);assert(lab&&(lab.status??1)===1&&lab.currentBuildPts===500);assert(towerA&&(towerA.status??1)===1&&towerA.currentBuildPts===300&&towerB&&(towerB.status??1)===1&&towerB.currentBuildPts===300);assert(s.facilityTargets.some(t=>t.id===160093&&t.ready));for(const id of [160003,160005]){const a=s.trucks.find(t=>t.id===id),b=after.trucks.find(t=>t.id===id);assert(a&&a.order===0&&a.x===b.x&&a.y===b.y);}
 check('native-completion-same-foundation-and-both-plans',{lab,towerA,towerB,trucks:s.trucks});report.foundationAfter=lab;
 await q.delay(4500);await c.tap('#wt-open-build');await c.paint();check('completed-sidebar-cleanup',{sidebar:await c.host("document.getElementById('wt-build-sidebar')?.innerText"),draw:await c.evaluate('WarzoneBuildDisplay.report()')});q.screen('recovery-complete');await c.tap('#wt-open-build');
 report.runtimeErrors=c.errors;assert.equal(c.errors.length,0);report.passed=true;write();console.log('Integrated native recovery passed');
 }finally{c?.close();}})().catch(e=>{report.error=String(e?.stack||e);write();console.error(e);process.exitCode=1});

