'use strict';
// Focused r4 native-mode smoke; root runs it after the active gameplay checks.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
assert.ok(process.env.WZ_QA_APK,'WZ_QA_APK must name the exact installed candidate');
const file=path.join(l.out,'modes.json'),r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),profiles:[],started:new Date().toISOString()};
const write=()=>fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
const shell=(...args)=>l.adb('shell',...args).toString().trim();
const size=()=>{const p=l.adb('exec-out','screencap','-p');return[p.readUInt32BE(16),p.readUInt32BE(20)];};
const button=(nodes,text)=>nodes.find(n=>n.text===text&&n.clickable==='true');
async function until(fn,message,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await l.delay(120)}throw Error(message);}
async function launch(){shell('am','force-stop',l.packageId);shell('am','start','-n',l.packageId+'/com.rbabbit.blocknight.warzone.MainActivity');return until(()=>{const t=l.tree();return button(t.nodes,'Towers')?.selected==='true'&&t.nodes.some(n=>n['content-desc']==='Music settings'&&n.enabled==='true')&&t;},'fresh native setup defaults to Towers');}
async function chosen(mode,weapon){return until(()=>{const t=l.tree(),d=button(t.nodes,'1v1 vs Bot');return d?.selected===(mode==='duel'?'true':'false')&&(mode!=='duel'||button(t.nodes,weapon==='rockets'?'Rockets':'Cannon')?.selected==='true')&&t;},'native mode/weapon selection observed');}
function capture(profile,label,mode,weapon){
 const t=l.tree(),nodes=t.nodes,device=size(),screen=l.screen(profile.name+'-'+label),xml=profile.name+'-'+label+'.xml';fs.writeFileSync(path.join(l.out,xml),t.xml);
 const towers=button(nodes,'Towers'),duel=button(nodes,'1v1 vs Bot'),cannon=button(nodes,'Cannon'),rockets=button(nodes,'Rockets');assert.ok(towers&&duel,'both native mode choices visible');assert.equal(towers.selected,mode==='towers'?'true':'false');assert.equal(duel.selected,mode==='duel'?'true':'false');
 const controls=[towers,duel];
 if(mode==='duel'){assert.ok(cannon&&rockets,'both native weapon choices visible');assert.equal(cannon.selected,weapon==='cannon'?'true':'false');assert.equal(rockets.selected,weapon==='rockets'?'true':'false');controls.push(cannon,rockets);assert.ok(!nodes.some(n=>/^Dustfall map,|^Iron Valley map,/.test(n['content-desc']||'')),'Towers map row absent only in duel');assert.ok(nodes.some(n=>n['content-desc']==='Start game, 1v1 vs Bot'));}
 else{assert.ok(!cannon&&!rockets,'duel weapon row absent in Towers');const maps=nodes.filter(n=>/^Dustfall map,|^Iron Valley map,/.test(n['content-desc']||''));assert.equal(maps.length,2);assert.equal(maps.filter(n=>n.selected==='true').length,1);assert.ok(nodes.some(n=>/^Start game, (Dustfall|Iron Valley)$/.test(n['content-desc']||'')));}
 const measured=controls.map(n=>{const b=[...n.bounds.matchAll(/\d+/g)].map(x=>+x[0]);assert.equal(b.length,4);assert.ok(b[0]>=0&&b[1]>=0&&b[2]<=device[0]&&b[3]<=device[1]&&b[2]>b[0],n.text+' inside actual viewport');assert.ok(b[3]-b[1]>=48*profile.scale-1,n.text+' touch target >=48dp');return{text:n.text,label:n['content-desc'],bounds:b,heightDp:(b[3]-b[1])/profile.scale,selected:n.selected};});
 for(let a=0;a<measured.length;a++)for(let b=a+1;b<measured.length;b++){const x=measured[a].bounds,y=measured[b].bounds;assert.ok(Math.min(x[2],y[2])<=Math.max(x[0],y[0])||Math.min(x[3],y[3])<=Math.max(x[1],y[1]),'native mode/weapon targets do not overlap');}
 const result={label,mode,weapon:mode==='duel'?weapon:null,device,screen,xml,controls:measured};profile.states.push(result);write();return result;
}
let changed=false;
(async()=>{try{
 r.originalDisplay={size:shell('wm','size'),density:shell('wm','density'),fontScale:shell('settings','get','system','font_scale')};write();
 for(const p of [{name:'standard',width:1080,height:600,fontScale:'1.0'},{name:'compact-large-text',width:854,height:480,fontScale:'1.3'}]){
  changed=true;shell('wm','size',p.width+'x'+p.height);shell('wm','density','240');shell('settings','put','system','font_scale',p.fontScale);await launch();await until(()=>{const d=size();return d[0]===p.width&&d[1]===p.height},'actual landscape viewport matches profile');
  const profile={...p,density:240,scale:1.5,actualSize:shell('wm','size'),actualFontScale:shell('settings','get','system','font_scale'),states:[]};assert.equal(Number(profile.actualFontScale),Number(p.fontScale));r.profiles.push(profile);
  capture(profile,'default-towers','towers');await l.nativeTap('1v1 vs Bot');await chosen('duel','cannon');capture(profile,'duel-cannon','duel','cannon');await l.nativeTap('Rockets');await chosen('duel','rockets');capture(profile,'duel-rockets','duel','rockets');await l.nativeTap('Towers');await chosen('towers');capture(profile,'restored-towers','towers');profile.passed=true;write();
 }
 r.afterIdentity=j.installedIdentity(process.env.WZ_QA_APK);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('modes-failure')}catch(_){}throw e;
 }finally{
  if(changed&&r.originalDisplay){try{const originalSize=r.originalDisplay.size.match(/Override size:\s*(\d+x\d+)/)?.[1],originalDensity=r.originalDisplay.density.match(/Override density:\s*(\d+)/)?.[1];shell('wm','size',originalSize||'reset');shell('wm','density',originalDensity||'reset');if(r.originalDisplay.fontScale==='null')shell('settings','delete','system','font_scale');else shell('settings','put','system','font_scale',r.originalDisplay.fontScale);await launch();r.restoredDisplay={size:shell('wm','size'),density:shell('wm','density'),fontScale:shell('settings','get','system','font_scale')};assert.deepEqual(r.restoredDisplay,r.originalDisplay);r.restoredScreen=l.screen('modes-original-profile-towers');}catch(e){r.cleanupFailure=String(e.stack||e);r.passed=false;}}
  r.finished=new Date().toISOString();write();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
