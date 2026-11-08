'use strict';
// Root-run native launcher checks. No engine launch, debug fixture or save edit.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs');
assert.ok(process.env.WZ_QA_APK,'WZ_QA_APK must name the exact installed candidate');
const file=path.join(l.out,'launcher.json');
const r={passed:false,identity:j.installedIdentity(process.env.WZ_QA_APK),profiles:[],checks:{},started:new Date().toISOString()};
const write=()=>fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');
const shell=(...args)=>l.adb('shell',...args).toString().trim();
const size=()=>{const b=l.adb('exec-out','screencap','-p');return[b.readUInt32BE(16),b.readUInt32BE(20)];};
const bounds=n=>{assert.ok(n,'actual native node');const b=[...n.bounds.matchAll(/\d+/g)].map(x=>+x[0]);assert.equal(b.length,4);assert.ok(b[2]>b[0]&&b[3]>b[1]);return b;};
const byText=(nodes,text)=>nodes.find(n=>n.text===text&&n.clickable==='true');
const byDescription=(nodes,label)=>nodes.find(n=>n['content-desc']===label);
async function until(fn,message,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const x=await fn();if(x)return x;await l.delay(120)}throw Error(message);}
async function launch(){shell('am','force-stop',l.packageId);shell('am','start','-n',l.packageId+'/com.rbabbit.blocknight.warzone.MainActivity');return until(()=>{const t=l.tree();return byText(t.nodes,'Towers')&&byDescription(t.nodes,'Music settings')?.enabled==='true'&&t;},'native setup ready after genuine app launch');}
function dump(name){const tree=l.tree(),screen=l.screen(name);fs.writeFileSync(path.join(l.out,name+'.xml'),tree.xml);return{screen,xml:name+'.xml',nodes:tree.nodes,device:size()};}
function state(capture,mode,weapon,scale){
 const nodes=capture.nodes,t=byText(nodes,'Towers'),d=byText(nodes,'1v1 vs Bot');assert.ok(t&&d,'both real mode buttons visible');assert.equal(t.selected,mode==='towers'?'true':'false');assert.equal(d.selected,mode==='duel'?'true':'false');
 const controls=[t,d],c=byText(nodes,'Cannon'),rockets=byText(nodes,'Rockets');
 if(mode==='duel'){assert.ok(c&&rockets,'both real weapon buttons visible');assert.equal(c.selected,weapon==='cannon'?'true':'false');assert.equal(rockets.selected,weapon==='rockets'?'true':'false');controls.push(c,rockets);assert.ok(!nodes.some(n=>/^Dustfall map,|^Iron Valley map,/.test(n['content-desc']||'')),'Towers map choices hidden only in duel');}
 else{assert.ok(!c&&!rockets,'weapon choices hidden in Towers');const maps=nodes.filter(n=>/^Dustfall map,|^Iron Valley map,/.test(n['content-desc']||''));assert.equal(maps.length,2,'both Towers maps restored');assert.equal(maps.filter(n=>n.selected==='true').length,1,'one Towers map selected');controls.push(...maps);}
 const play=nodes.find(n=>/^Start game, /.test(n['content-desc']||''));assert.ok(play,'mode-specific native Play action');assert.ok(mode==='duel'?play['content-desc']==='Start game, 1v1 vs Bot':/^Start game, (Dustfall|Iron Valley)$/.test(play['content-desc']));controls.push(play);
 const graphics=nodes.find(n=>/^Graphics options, /.test(n['content-desc']||'')),music=byDescription(nodes,'Music settings'),hq=nodes.find(n=>/^HQ pack ready offline$|^Download High Quality graphics$/.test(n['content-desc']||''));assert.ok(graphics&&music&&hq,'original graphics/music/HQ actions remain');controls.push(graphics,music,hq);
 const measured=controls.map(n=>{const b=bounds(n);assert.ok(b[0]>=0&&b[1]>=0&&b[2]<=capture.device[0]&&b[3]<=capture.device[1],(n.text||n['content-desc'])+' fully inside viewport');assert.ok(b[3]-b[1]>=48*scale-1,(n.text||n['content-desc'])+' native touch height >=48dp');return{text:n.text,label:n['content-desc'],bounds:b,heightDp:(b[3]-b[1])/scale,enabled:n.enabled,selected:n.selected};});
 for(let a=0;a<measured.length;a++)for(let b=a+1;b<measured.length;b++){const x=measured[a].bounds,y=measured[b].bounds;assert.ok(Math.min(x[2],y[2])<=Math.max(x[0],y[0])||Math.min(x[3],y[3])<=Math.max(x[1],y[1]),'actionable native controls do not overlap');}
 assert.ok(!nodes.some(n=>/TOWERS TEST|TOWERS LAB|LAB 0?1/i.test(n.text||'')),'normal game wording');return{mode,weapon:mode==='duel'?weapon:null,screen:capture.screen,xml:capture.xml,device:capture.device,controls:measured};
}
async function selected(mode,weapon){return until(()=>{const t=l.tree(),d=byText(t.nodes,'1v1 vs Bot');if(!d||d.selected!==(mode==='duel'?'true':'false'))return false;if(mode==='duel'&&byText(t.nodes,weapon==='rockets'?'Rockets':'Cannon')?.selected!=='true')return false;return t;},'observed native mode/weapon selection');}
async function captureState(profile,label,mode,weapon){const shot=dump(profile.name+'-'+label),s=state(shot,mode,weapon,profile.scale);profile.states.push(s);write();return shot;}
async function changeMapBack(profile){const t=l.tree(),maps=t.nodes.filter(n=>/^Dustfall map,|^Iron Valley map,/.test(n['content-desc']||'')),original=maps.find(n=>n.selected==='true'),other=maps.find(n=>n.selected!=='true');assert.ok(original&&other);const originalName=original['content-desc'].split(' map,')[0],otherName=other['content-desc'].split(' map,')[0];await l.nativeTap(other['content-desc']);await until(()=>l.tree().nodes.some(n=>n['content-desc']===otherName+' map, selected'),'other actual Towers map selected');await l.nativeTap(originalName+' map, not selected');await until(()=>l.tree().nodes.some(n=>n['content-desc']===originalName+' map, selected'),'original actual Towers map restored');profile.mapRoundTrip={original:originalName,selected:otherName,restored:true};}
let displayChanged=false;
(async()=>{try{
 const source=fs.readFileSync(path.join(l.root,'app/src/main/java/com/rbabbit/blocknight/warzone/GraphicsSetupView.java'),'utf8'),activity=fs.readFileSync(path.join(l.root,'app/src/main/java/com/rbabbit/blocknight/warzone/MainActivity.java'),'utf8');
 assert.ok(source.includes('actions.start(mode, map, matchMode, duelWeapon)'));assert.ok(source.includes('String selectedMatchMode()')&&source.includes('String selectedDuelWeapon()'));assert.ok(activity.includes('graphicsSetup.selectedMatchMode()')&&activity.includes('graphicsSetup.selectedDuelWeapon()'),'Music Start captures actual native choices');assert.ok(source.includes('exact(matchChoices, innerWidth, dp(48))')&&source.includes('exact(weaponChoices, innerWidth, botMatch ? dp(48) : 0)'));assert.ok(activity.includes('private String matchMode = "towers"'),'Towers remains native default');r.checks.nativeChoiceContracts=true;
 r.originalDisplay={size:shell('wm','size'),density:shell('wm','density'),fontScale:shell('settings','get','system','font_scale')};write();
 for(const p of [{name:'standard',width:1080,height:600,density:240,fontScale:'1.0'},{name:'compact-large-text',width:854,height:480,density:240,fontScale:'1.3'}]){
  displayChanged=true;shell('wm','size',p.width+'x'+p.height);shell('wm','density',String(p.density));shell('settings','put','system','font_scale',p.fontScale);await launch();await until(()=>{const s=size();return s[0]===p.width&&s[1]===p.height},'actual screenshot matches requested landscape profile');
  const profile={...p,scale:p.density/160,actualSize:shell('wm','size'),actualDensity:shell('wm','density'),actualFontScale:shell('settings','get','system','font_scale'),states:[],navigation:[]};r.profiles.push(profile);assert.equal(Number(profile.actualFontScale),Number(p.fontScale));
  await captureState(profile,'default-towers','towers');
  await l.nativeTap('1v1 vs Bot');await selected('duel','cannon');await captureState(profile,'duel-cannon','duel','cannon');
  await l.nativeTap('Rockets');await selected('duel','rockets');await captureState(profile,'duel-rockets','duel','rockets');
  const before=l.tree().nodes,graphics=before.find(n=>/^Graphics options, /.test(n['content-desc']||''));await l.nativeTap(graphics['content-desc']);let popup;await until(()=>{popup=l.tree();return popup.nodes.some(n=>n.text==='Normal')&&popup.nodes.some(n=>n.text==='High Quality')},'actual native graphics popup');fs.writeFileSync(path.join(l.out,p.name+'-graphics-popup.xml'),popup.xml);profile.graphicsPopup={screen:l.screen(p.name+'-graphics-popup'),nodes:popup.nodes.filter(n=>['Normal','High Quality'].includes(n.text))};
  shell('input','keyevent','4');profile.navigation.push({from:'graphics-popup',source:'real-Android-keyevent',code:4});await selected('duel','rockets');assert.ok(!l.tree().nodes.some(n=>n.text==='High Quality'&&n.checkable==='true'),'actual graphics popup dismissed');await captureState(profile,'graphics-return','duel','rockets');
  await l.nativeTap('Music settings');await until(()=>l.tree().nodes.some(n=>n.text==='Music on'),'actual native Music choices opened');const music=dump(p.name+'-music');profile.music={screen:music.screen,xml:music.xml,returnBounds:bounds(byText(music.nodes,'BACK'))};
  if(p.name==='standard'){shell('input','keyevent','4');profile.navigation.push({from:'music',source:'real-Android-keyevent',code:4});}else{await l.nativeTap('BACK');profile.navigation.push({from:'music',source:'actual-native-BACK-control'});}
  await selected('duel','rockets');await captureState(profile,'music-return','duel','rockets');
  await l.nativeTap('Cannon');await selected('duel','cannon');await l.nativeTap('Towers');await selected('towers');await changeMapBack(profile);await captureState(profile,'restored-towers','towers');
  profile.passed=true;write();
 }
 r.checks.defaultTowers=true;r.checks.mutuallyExclusiveNativeChoices=true;r.checks.minimum48dpTargets=true;r.checks.standardAndCompactLargeText=true;r.checks.graphicsDismissalAndMusicReturns=true;
 r.afterIdentity=j.installedIdentity(process.env.WZ_QA_APK);assert.equal(r.afterIdentity.candidateAPK_SHA256,r.identity.candidateAPK_SHA256);r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('launcher-failure')}catch(_){}throw e;
 }finally{
  if(displayChanged&&r.originalDisplay){try{const sizeOverride=r.originalDisplay.size.match(/Override size:\s*(\d+x\d+)/)?.[1],densityOverride=r.originalDisplay.density.match(/Override density:\s*(\d+)/)?.[1];shell('wm','size',sizeOverride||'reset');shell('wm','density',densityOverride||'reset');if(r.originalDisplay.fontScale==='null')shell('settings','delete','system','font_scale');else shell('settings','put','system','font_scale',r.originalDisplay.fontScale);await launch();r.restoredDisplay={size:shell('wm','size'),density:shell('wm','density'),fontScale:shell('settings','get','system','font_scale')};assert.deepEqual(r.restoredDisplay,r.originalDisplay,'original display/font settings restored');r.restoredScreen=l.screen('launcher-restored-original-profile');}catch(e){r.cleanupFailure=String(e.stack||e);r.passed=false;}}
  r.finished=new Date().toISOString();write();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
