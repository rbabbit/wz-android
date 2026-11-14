/* Exact-APK Android Home journeys. Preparation does not execute this runner. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const names=[
 'home-native-layout-normal','home-rewards-return','home-towers-saves-return',
 'towers-map-browser-back-and-selection','towers-launch-native-and-return-to-same-map',
 'campaign-continue-saves-native-and-return','campaign-new-movie-native-and-return',
 'compact-home-scroll-and-map-return','large-text-home-actions-accessible','normal-home-restored'];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const errorPattern=/\berror\s*\||Uncaught|Assert in Warzone|Aborted|RuntimeError/i;
function isModeHome(tree){
 const nodes=tree?.nodes||[],has=label=>nodes.some(n=>(n.text===label||n['content-desc']===label)&&n.enabled==='true'&&n.bounds!=='[0,0][0,0]');
 const modal=nodes.some(n=>/TextView$/.test(n.class||'')&&['SAVED GAMES','CAMPAIGN SAVES'].includes(n.text));
 const rewards=has('Fortresses')&&nodes.some(n=>/Gain 10 Crystals|Watch an optional ad/.test(n.text+' '+n['content-desc']));
 // The native scroll container and pinned utilities identify this screen even
 // when Campaign or Towers actions are beyond the compact viewport. Individual
 // action visibility remains a separate normal-layout / scrolling assertion.
 return nodes.some(n=>n['content-desc']==='Campaign and Towers modes; scroll vertically when needed'&&/ScrollView$/.test(n.class||''))
  &&nodes.some(n=>n['content-desc']==='Warzone 2100'&&/ImageView$/.test(n.class||''))
  &&has('Open saved games on this phone')&&!modal&&!rewards&&!has('BACK')&&!has('Return');
}

async function main(){
 const args=process.argv.slice(2),argument=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
 assert(args.includes('--run'),'Runner prepared only. Root must approve the final visual pass before using --run.');
 const expected=argument('--expected-sha256');assert(/^[a-f0-9]{64}$/i.test(expected||''),'Pass the frozen --expected-sha256');
 process.env.WZ_QA_DEVICE||='emulator-5558';process.env.WZ_NATIVE_QA||=path.join(root,'qa/home-056');
 assert.equal(process.env.WZ_QA_DEVICE,'emulator-5558','Home QA is restricted to the prepared5558 environment');
 const q=require('./campaign-live-051.cjs'),out=q.out;fs.mkdirSync(out,{recursive:true});
 const component=q.packageId+'/com.rbabbit.blocknight.warzone.MainActivity';
 const apk=argument('--apk')||path.join(root,'app/build/outputs/apk/debug/app-debug.apk');
 assert.equal(sha(fs.readFileSync(apk)),expected.toLowerCase(),'Candidate APK differs from approved hash');
 const progressFile=path.join(out,'progress.json');let c=null;
 const report=fs.existsSync(progressFile)?JSON.parse(fs.readFileSync(progressFile,'utf8')):{version:'0.56',candidateAPK_SHA256:expected.toLowerCase(),device:q.device,checks:[],runtimeErrors:[],startedAt:new Date().toISOString(),preparedCampaignSaveUsed:true,seededUnits:false,
  fixtureDisclosure:{preparedSave:'Existing phone Campaign checkpoint with native HQ; no unit grants or debug orders are created.',graphics:'Prior emulator terrain/shader limitations remain a fixture limitation. These checks establish native navigation/readiness and captured layouts, not graphics parity with a physical phone.'}};
 assert.equal(report.candidateAPK_SHA256,expected.toLowerCase(),'Resume proof belongs to another APK');assert.equal(report.device,q.device);
 let failedCase=report.failureCase||report.current?.case;
 if(report.failure){
  report.fixtureFailures||=[];
  const identity=sha(Buffer.from(failedCase+'\n'+report.failure));
  if(!report.fixtureFailures.some(value=>value.identity===identity)){
   const prior={identity,case:failedCase,error:report.failure,phase:report.current,recordedAt:new Date().toISOString(),capture:report.failureCapture};
   const screenshot=prior.capture?.screenshot;
   if(screenshot){const source=path.resolve(root,screenshot.path),copy=path.join(out,'fixture-failure-'+String(report.fixtureFailures.length+1).padStart(2,'0')+'.png');if(source.startsWith(path.resolve(out)+path.sep)&&fs.existsSync(source)){fs.copyFileSync(source,copy);prior.capture={...prior.capture,screenshot:{...screenshot,path:path.relative(root,copy).replaceAll('\\','/'),sha256:sha(fs.readFileSync(copy))}};}}
   report.fixtureFailures.push(prior);
  }
 }
 function write(){fs.writeFileSync(progressFile,JSON.stringify(report,null,2)+'\n');}
 function phase(value,detail={}){report.current={case:report.current?.case,phase:value,detail,at:new Date().toISOString()};write();}
 async function act(value,action,detail={}){phase(value,detail);return action();}
 function installed(){const output=q.adb('shell','pm','path',q.packageId).toString();const target=output.split(/\r?\n/).find(line=>line.endsWith('/base.apk'))?.replace(/^package:/,'');assert(/^\/data\/app\/[A-Za-z0-9_~+=.\/-]+\/base\.apk$/.test(target||''),'Installed APK path invalid');assert(q.adb('shell','sha256sum',target).toString().trim().startsWith(report.candidateAPK_SHA256),'Installed APK differs from frozen candidate');return target;}
 async function tree(){for(let attempt=0;attempt<3;attempt++){try{const value=q.tree();if(value?.nodes?.length&&value.xml?.includes('<hierarchy'))return value;}catch(error){if(attempt===2)throw error;}await q.delay(150);}throw Error('Native UI hierarchy stayed empty; stop and inspect fixture');}
 const texts=t=>t.nodes.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,label:n['content-desc'],class:n.class,bounds:n.bounds,enabled:n.enabled,clickable:n.clickable}));
 const find=(t,label)=>t.nodes.find(n=>(n.text===label||n['content-desc']===label)&&n.enabled==='true'&&n.bounds!=='[0,0][0,0]');
 const textView=(t,label)=>t.nodes.some(n=>n.text===label&&/TextView$/.test(n.class||''));
 const savedModal=t=>textView(t,'SAVED GAMES')||textView(t,'CAMPAIGN SAVES');
 const rewardsModal=t=>!!find(t,'Fortresses')&&t.nodes.some(n=>/Gain 10 Crystals|Watch an optional ad/.test(n.text+' '+n['content-desc']));
 const cards=isModeHome;
 const mapBrowser=t=>!!find(t,'Back to Campaign and Towers')&&!!find(t,'PLAY')&&!savedModal(t)&&!rewardsModal(t);
 async function nativeWait(predicate,why,timeout=15000){let last={nodes:[]},failure;const end=Date.now()+timeout;while(Date.now()<end){try{last=await tree();if(predicate(last))return last;}catch(error){failure=String(error);}await q.delay(120);}throw Error(why+'; hierarchyError='+failure+'; native='+JSON.stringify(texts(last)));}
 async function nativeTap(label){return act('tap-native:'+label,()=>q.nativeTap(label,15000));}
 async function back(){return act('android-back',()=>q.adb('shell','input','keyevent','4'));}
 async function capture(label,extra={}){const png=q.screen(label),xml=await tree();return{...extra,screenshot:{path:path.relative(root,png).replaceAll('\\','/'),sha256:sha(fs.readFileSync(png)),bytes:fs.statSync(png).size},native:texts(xml),physical:{width:fs.readFileSync(png).readUInt32BE(16),height:fs.readFileSync(png).readUInt32BE(20)}};}
 async function connect(){if(c)return c;const end=Date.now()+40000;let failure;while(Date.now()<end){try{c=await q.connect();return c;}catch(error){failure=error;await q.delay(150);}}throw failure||Error('Game WebView never became ready');}
 async function closeConnection(){if(!c)return;const captured=[...c.errors];let native=[];try{native=await c.evaluate(`(window.errorLog||[]).filter(value=>${errorPattern}.test(String(value)))`)||[];}catch(error){captured.push({diagnostic:'Native error log unavailable before closing',message:String(error)});}report.runtimeErrors.push(...captured.map(value=>({case:report.current?.case,source:'CDP',value})),...native.map(value=>({case:report.current?.case,source:'native-log',value})));write();c.close();c=null;assert.equal(captured.length,0,'WebView runtime exceptions');assert.equal(native.length,0,'Native runtime errors');}
 async function returnFromGame(){
  const t=await tree();if(!find(t,'Return')){await back();await nativeWait(value=>!!find(value,'Return'),'Return to Main Menu confirmation missing');}
  await closeConnection();await nativeTap('Return');await nativeWait(value=>cards(value)||mapBrowser(value),'Home did not return');
 }
 async function ensureCards(){let t=await tree();if(cards(t))return t;if(savedModal(t)||rewardsModal(t)){await back();t=await tree();}if(mapBrowser(t)){await nativeTap('Back to Campaign and Towers');return nativeWait(cards,'Mode home missing');}if(cards(t))return t;
  await returnFromGame();t=await tree();if(mapBrowser(t))await nativeTap('Back to Campaign and Towers');return nativeWait(cards,'Mode home missing after game return');}
 async function chooseMap(){await ensureCards();await revealHomeButton('Choose a Towers map');await nativeTap('Choose a Towers map');return nativeWait(mapBrowser,'Towers map browser missing');}
 const selected=t=>t.nodes.find(n=>/^Map selection, \d+ of /.test(n['content-desc']||''))?.['content-desc'];
 async function previousMapBySwipe(t){
  const prior=Number((selected(t)||'').match(/^Map selection, (\d+) of /)?.[1]);assert(prior>1,'Previous-map swipe requires an observed index above1');
  const node=t.nodes.find(n=>/^Map selection, \d+ of /.test(n['content-desc']||'')&&/HorizontalScrollView$/.test(n.class||''));
  assert(node,'Observed native map HorizontalScrollView missing');const b=[...node.bounds.matchAll(/-?\d+/g)].map(Number),png=q.adb('exec-out','screencap','-p');
  assert(b.length===4&&b[0]>=0&&b[1]>=0&&b[2]<=png.readUInt32BE(16)&&b[3]<=png.readUInt32BE(20)&&b[2]-b[0]>100&&b[3]-b[1]>40,'Native map viewport bounds invalid');
  const from=Math.round(b[0]+(b[2]-b[0])*.28),to=Math.round(b[0]+(b[2]-b[0])*.76),y=Math.round((b[1]+b[3])/2);
  await act('previous-map-real-swipe',()=>q.adb('shell','input','swipe',String(from),String(y),String(to),String(y),'320'),{priorIndex:prior,viewport:node.bounds});
  return nativeWait(value=>{const next=Number((selected(value)||'').match(/^Map selection, (\d+) of /)?.[1]);return mapBrowser(value)&&next>=1&&next<prior;},'Rightward map swipe did not decrease observed selection');
 }
 async function greenhaven(){let t=await tree();if(!mapBrowser(t))t=await chooseMap();for(let i=0;i<17&&!/^Map selection, 1 of /.test(selected(t)||'');i++)t=await previousMapBySwipe(t);assert(/^Map selection, 1 of /.test(selected(t)||''),'Could not return to first Easy map');assert(t.nodes.some(n=>/Greenhaven/i.test(n.text+' '+n['content-desc'])),'First map is not Greenhaven');return t;}
 async function gameState(){return c.evaluate('({campaign:window.__warzoneCampaign?.report?.(),snapshot:window.__warzoneCommands?.report?.().snapshot,save:window.WarzoneSavedGames?.report?.(),briefing:window.WarzoneBriefing?.report?.(),config:window.LaunchedModule?.WZVAL_configDirPath})');}
 async function scrollHome(direction='down'){const png=q.adb('exec-out','screencap','-p'),w=png.readUInt32BE(16),h=png.readUInt32BE(20),x=Math.round(w*.62),top=Math.round(h*.27),bottom=Math.round(h*.82);await act('scroll-home:'+direction,()=>q.adb('shell','input','swipe',String(x),String(direction==='down'?bottom:top),String(x),String(direction==='down'?top:bottom),'320'));}
 function fullButton(t,label,width,height,minHeight=1){const n=find(t,label);if(!n)return null;const b=[...n.bounds.matchAll(/-?\d+/g)].map(Number);return b.length===4&&b[0]>=0&&b[1]>=0&&b[2]<=width&&b[3]<=height&&b[2]>b[0]&&b[3]-b[1]>=minHeight-1?n:null;}
 async function revealHomeButton(label){const density=[...q.adb('shell','wm','density').toString().matchAll(/(?:Physical|Override) density:\s*(\d+)/g)].map(match=>Number(match[1])).at(-1);assert(Number.isFinite(density),'Display density not observable');for(let i=0;i<8;i++){const t=await tree(),png=q.adb('exec-out','screencap','-p');if(fullButton(t,label,png.readUInt32BE(16),png.readUInt32BE(20),48*density/160))return t;await scrollHome();}throw Error('Bounded Home scroll did not reveal '+label);}
 function boundedButton(t,label,minHeight){const n=find(t,label);assert(n,'Missing accessible '+label);const b=[...n.bounds.matchAll(/-?\d+/g)].map(Number);assert(b.length===4&&b[0]>=0&&b[1]>=0&&b[2]>b[0]&&b[3]-b[1]>=minHeight-1,label+' has undersized/clipped touch rectangle');return{...n,height:b[3]-b[1]};}
 async function reachableButtons(tag,density){const found={},labels=['Continue a saved campaign','Start a new campaign from Alpha','Choose a Towers map'];const shots=[];
  for(let i=0;i<7&&Object.keys(found).length<labels.length;i++){const t=await tree(),png=q.adb('exec-out','screencap','-p'),w=png.readUInt32BE(16),h=png.readUInt32BE(20);for(const label of labels){const n=find(t,label);if(!n)continue;const b=[...n.bounds.matchAll(/-?\d+/g)].map(Number);if(b[0]>=0&&b[1]>=0&&b[2]<=w&&b[3]<=h&&b[3]-b[1]>=48*density/160-1)found[label]=boundedButton(t,label,48*density/160);}if(i===0||Object.keys(found).length===labels.length)shots.push(await capture(tag+(i?'-scrolled':'-initial')));if(Object.keys(found).length<labels.length)await scrollHome();}
  assert.equal(Object.keys(found).length,labels.length,'Scroll did not expose every full-size mode action');
  const end=await revealHomeButton('Choose a Towers map'),png=q.adb('exec-out','screencap','-p');
  assert(fullButton(end,'Choose a Towers map',png.readUInt32BE(16),png.readUInt32BE(20),48*density/160),'Scrolling proof must end with Choose Map ready for the next actual tap');
  return{buttons:found,screenshots:shots,endedWithChooseMapVisible:true};}
 async function restoreDisplay(){await act('restore-font-scale',()=>q.adb('shell','settings','put','system','font_scale','1.0'));await act('restore-wm-size',()=>q.adb('shell','wm','size','1080x2400'));await act('restore-wm-density',()=>q.adb('shell','wm','density','300'));}
 async function caseRun(name,action){if(report.checks.some(value=>value.name===name&&value.passed))return;report.current={case:name,phase:'starting',at:new Date().toISOString()};write();installed();const data=await action();assert.equal(report.runtimeErrors.length,0,'Runtime error evidence remains unresolved');const filename=path.join(out,name+'.json'),value={name,passed:true,candidateAPK_SHA256:report.candidateAPK_SHA256,...data,recordedAt:new Date().toISOString()};fs.writeFileSync(filename,JSON.stringify(value,null,2)+'\n');report.checks.push({name,passed:true,evidence:path.relative(root,filename).replaceAll('\\','/'),sha256:sha(fs.readFileSync(filename))});report.current={case:name,phase:'passed'};if(report.failure&&failedCase===name){delete report.failure;delete report.failureCase;delete report.failureCapture;delete report.captureFailure;failedCase=null;}write();console.log('PASS '+name);}
 const only=argument('--case');if(only)assert(names.includes(only),'Unknown case');const run=(name,fn)=>!only||only===name?caseRun(name,fn):Promise.resolve();
 try{
  installed();
  await run(names[0],async()=>{
   await closeConnection();await act('cold-start-stop',()=>q.adb('shell','am','force-stop',q.packageId));await act('cold-start-home',()=>q.adb('shell','am','start','-n',component));
   const t=await nativeWait(cards,'Cold launch did not show native mode Home',30000);
   for(const label of ['Choose a Towers map','Continue a saved campaign','Start a new campaign from Alpha','Open saved games on this phone'])assert(find(t,label),label);
   assert(!t.nodes.some(n=>['CHOOSE YOUR MODE','WARZONE TOWERS'].includes(n.text)),'Unwanted title visible');
   assert(t.nodes.some(n=>n['content-desc']==='Warzone 2100'&&/ImageView$/.test(n.class||'')),'Native official logo absent');
   assert(t.nodes.some(n=>/Greenhaven, easy, actual map preview/i.test(n['content-desc']||'')&&/ImageView$/.test(n.class||'')),'Real selected-map preview absent');
   return capture(names[0]);
  });
  await run(names[1],async()=>{await ensureCards();const t=await tree(),reward=t.nodes.find(n=>/^REWARDS \d+$/.test(n.text||''));assert(reward);await nativeTap(reward.text);await nativeWait(rewardsModal,'Rewards drawer not actually open');const opened=await capture(names[1]+'-open');await back();await nativeWait(value=>cards(value)&&!rewardsModal(value),'Rewards drawer did not close');return{opened,closed:await capture(names[1]+'-closed'),watchedAd:false};});
  await run(names[2],async()=>{await ensureCards();await nativeTap('Open saved games on this phone');const t=await nativeWait(value=>textView(value,'SAVED GAMES'),'Towers saves modal missing');assert(!textView(t,'CAMPAIGN SAVES'),'Home saved-games header routed to Campaign store');const opened=await capture(names[2]+'-open');await back();await nativeWait(value=>cards(value)&&!savedModal(value),'Towers saves modal did not close');return{opened,closed:await capture(names[2]+'-closed')};});
  await run(names[3],async()=>{let t=await chooseMap();assert(/^Map selection, 1 of /.test(selected(t)||''),'First cold launch map was not Easy map1');assert(t.nodes.some(n=>/Greenhaven/i.test(n.text+' '+n['content-desc'])));const first=await capture(names[3]+'-first');await nativeTap('Next map, or swipe left');t=await nativeWait(value=>/^Map selection, 2 of /.test(selected(value)||''),'Next map did not select map2');const second=await capture(names[3]+'-second');await nativeTap('Back to Campaign and Towers');await nativeWait(cards,'Map Back did not show cards');await nativeTap('Choose a Towers map');t=await nativeWait(value=>mapBrowser(value)&&/^Map selection, 2 of /.test(selected(value)||''),'Map selection was not preserved');const retained=await capture(names[3]+'-retained');await greenhaven();await nativeTap('Back to Campaign and Towers');await nativeWait(cards,'Cards missing after map reset');return{first,second,retained,resetMap:'Greenhaven'};});
  await run(names[4],async()=>{await greenhaven();await nativeTap('PLAY');await connect();await c.wait('window.WarzoneBriefing?.report?.().phase==="released"&&window.__warzoneCommands?.report?.().snapshot?.hasHQ',45000);const state=await gameState();assert(!state.campaign&&state.config==='/warzone2100','Towers launched wrong mode');const gameplay=await capture(names[4]+'-gameplay',{state});await returnFromGame();const returned=await nativeWait(mapBrowser,'Towers return did not preserve map browser');assert(/^Map selection, 1 of /.test(selected(returned)||''));assert(returned.nodes.some(n=>/Greenhaven/i.test(n.text+' '+n['content-desc'])));const map=await capture(names[4]+'-returned');await nativeTap('Back to Campaign and Towers');await nativeWait(cards,'Cards missing after Towers map Back');return{gameplay,map};});
  await run(names[5],async()=>{await ensureCards();await nativeTap('Continue a saved campaign');await nativeWait(value=>textView(value,'CAMPAIGN SAVES'),'Continue did not open Campaign saves',30000);const list=await capture(names[5]+'-saves');await nativeTap('LOAD');await connect();await c.wait('window.__warzoneCampaign?.report?.().nativeState?.worldSafe&&window.WarzoneSavedGames?.ready&&window.WarzoneSavedGames?.loading&&window.__warzoneCommands?.report?.().snapshot?.hasHQ',45000);const state=await gameState();assert(state.save.slotId,'Existing Campaign slot not identified');assert(state.config?.includes('campaign'),'Wrong config store');const gameplay=await capture(names[5]+'-continued',{state});await returnFromGame();await nativeWait(cards,'Campaign return did not show cards');return{list,gameplay,preparedSaveUsed:true,seededUnits:false};});
  await run(names[6],async()=>{await ensureCards();await nativeTap('Start a new campaign from Alpha');await connect();await c.wait('window.__warzoneCampaign?.report?.().nativeState?.video',45000);await c.wait('performance.getEntriesByType("resource").some(e=>e.name.includes("/sequences/")&&e.name.endsWith("c001.ogg")&&e.responseEnd>0)',30000);const resources=await c.evaluate('performance.getEntriesByType("resource").filter(e=>e.name.includes("/sequences/")).map(e=>({name:e.name,responseEnd:e.responseEnd}))');const video=await capture(names[6]+'-video',{resources});const p=await c.evaluate('(()=>{const b=document.getElementById("canvas").getBoundingClientRect(),f=parent.document.getElementById("warzone-game-frame").getBoundingClientRect();return{x:b.x+f.x+b.width/2,y:b.y+f.y+b.height/2,w:parent.innerWidth,h:parent.innerHeight}})()'),png=q.adb('exec-out','screencap','-p');await act('skip-original-opening-video',()=>q.adb('shell','input','tap',String(Math.round(p.x*png.readUInt32BE(16)/p.w)),String(Math.round(p.y*png.readUInt32BE(20)/p.h))));await c.wait('window.__warzoneCampaign?.report?.().snapshot?.mission==="cam1a"&&window.__warzoneCampaign?.report?.().nativeState?.worldSafe&&window.__warzoneCommands?.report?.().snapshot?.trucks?.length===3',45000);const mission=await capture(names[6]+'-alpha',{state:await gameState()});await returnFromGame();await nativeWait(cards,'New Campaign return did not show cards');return{video,mission,seededUnits:false};});
  await run(names[7],async()=>{await ensureCards();await act('compact-wm-size',()=>q.adb('shell','wm','size','720x1280'));await act('compact-wm-density',()=>q.adb('shell','wm','density','320'));await nativeWait(cards,'Compact Home not ready',30000);const content=await reachableButtons(names[7],320);const png=q.adb('exec-out','screencap','-p');assert.equal(png.readUInt32BE(16),1280);assert.equal(png.readUInt32BE(20),720);await nativeTap('Choose a Towers map');await nativeWait(mapBrowser,'Compact map browser missing');const map=await capture(names[7]+'-map');await nativeTap('Back to Campaign and Towers');await nativeWait(cards,'Compact Back missing');return{...content,map,physical:{width:1280,height:720,density:320},logicalDP:{width:640,height:360}};});
  await run(names[8],async()=>{await ensureCards();await act('large-text-wm-size',()=>q.adb('shell','wm','size','720x1280'));await act('large-text-wm-density',()=>q.adb('shell','wm','density','320'));const prior=await nativeWait(cards,'Compact Home before font change not ready',30000),before=find(prior,'Open saved games on this phone');await act('large-text-font-scale',()=>q.adb('shell','settings','put','system','font_scale','1.3'));await act('large-text-stop-for-configuration',()=>q.adb('shell','am','force-stop',q.packageId));await act('large-text-relaunch',()=>q.adb('shell','am','start','-n',component));const large=await nativeWait(cards,'Large text Home not ready',30000),after=find(large,'Open saved games on this phone');assert(before&&after,'Saved Games scale witness missing');const width=n=>{const b=[...n.bounds.matchAll(/-?\d+/g)].map(Number);return b[2]-b[0];};assert(width(after)>width(before),'Font scale did not visibly affect native text button after relaunch');await scrollHome('up');await scrollHome('up');const content=await reachableButtons(names[8],320);await restoreDisplay();return{...content,fontScale:1.3,fontScaleWitness:{before:before.bounds,after:after.bounds},noGameLaunched:true,restoredFontScale:1.0};});
  await run(names[9],async()=>{await restoreDisplay();await act('normal-restored-stop',()=>q.adb('shell','am','force-stop',q.packageId));await act('normal-restored-relaunch',()=>q.adb('shell','am','start','-n',component));await nativeWait(cards,'Restored normal Home missing',30000);const value=await capture(names[9]);assert.equal(value.physical.width,2400);assert.equal(value.physical.height,1080);assert.equal(q.adb('shell','settings','get','system','font_scale').toString().trim(),'1.0');return value;});
  installed();if(!only){assert.equal(report.checks.length,names.length);report.passed=true;report.finishedAt=new Date().toISOString();write();fs.writeFileSync(path.join(out,'verify-home-056.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS HOME056 '+report.checks.length);}
 }catch(error){report.passed=false;report.failureCase=report.current?.case;report.failure=String(error?.stack||error);try{report.failureCapture=await capture('failure-home-056');}catch(captureError){report.captureFailure=String(captureError);}write();throw error;}
 finally{try{await closeConnection();}finally{await restoreDisplay();write();}}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={cases:names,isModeHome};
