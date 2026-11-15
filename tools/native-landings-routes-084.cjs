'use strict';
const u=require('./native-landings-live-084.cjs'),web=require('./mp-live-082.cjs'),fs=require('node:fs'),assert=require('node:assert/strict');
const mode=process.argv[2]||'normal',log=[];
function record(action,more={}){log.push({action,...more});console.log(action);}
const waitText=(name,text)=>u.wait(name,s=>s.rows.some(n=>n.text===text));
const back=()=>u.adb('shell','input','keyevent','4');
async function openHome(label){await u.homeState('final-'+mode+'-home-before-'+label);u.tap(u.observe(),label);}
async function run(){
 if(mode==='compact'||mode==='large'){
  u.adb('shell','wm','size','640x1280');u.adb('shell','wm','density','320');u.adb('shell','settings','put','system','font_scale',mode==='large'?'1.3':'1.0');
 }
 const home=await u.homeState('final-'+mode+'-home');
 await openHome('Campaign');await u.wait('final-'+mode+'-campaign',s=>s.rows.some(n=>n.text==='Videos ready · Play offline'),30000);
 if(mode==='normal'){u.tap(u.observe(),'CONTINUE');await waitText('final-normal-campaign-saves','CAMPAIGN SAVES');back();await waitText('final-normal-campaign-saves-return','Videos ready · Play offline');}
 // Compact/large layouts may scroll only the details; Back must remain fixed.
 let camp=u.observe();assert(u.find(camp,'BACK'));if(!u.find(camp,'NEW CAMPAIGN')){u.adb('shell','input','swipe',String(Math.round(camp.width*.33)),String(Math.round(camp.height*.76)),String(Math.round(camp.width*.33)),String(Math.round(camp.height*.32)),'300');camp=u.observe();}
 assert(u.find(camp,'NEW CAMPAIGN'));record('Campaign ready, actions reachable');back();await u.homeState('final-'+mode+'-campaign-return');
 await openHome('Towers');await u.wait('final-'+mode+'-towers',s=>!!u.find(s,'PLAY'));
 if(mode==='normal'){
  u.tap(u.observe(),'Next Towers map, or swipe left');await waitText('final-normal-towers-next','2 / 16');
  u.tap(u.observe(),'Previous Towers map, or swipe right');await waitText('final-normal-towers-previous','1 / 16');
  u.tap(u.observe(),'Medium · 15');await u.wait('final-normal-towers-medium',s=>s.rows.some(n=>n['content-desc']==='Medium maps, 15, selected'));
  u.tap(u.observe(),'Easy · 16');await u.wait('final-normal-towers-easy',s=>!!u.find(s,'Start game, Greenhaven'));
  u.tap(u.observe(),'Open saved games on this phone');await waitText('final-normal-towers-saves','SAVED GAMES');back();await u.wait('final-normal-towers-saves-return',s=>!!u.find(s,'PLAY'));
  const raw=u.observe(),reward=raw.rows.find(n=>n.text?.startsWith('REWARDS '));u.tap(raw,reward['content-desc']);await waitText('final-normal-towers-rewards','Fortresses');back();await u.wait('final-normal-towers-rewards-return',s=>!!u.find(s,'PLAY'));
 }
 record('Towers picker fits and actions work');back();await u.homeState('final-'+mode+'-towers-return');
 await openHome('Free for all');await u.wait('final-'+mode+'-ffa',s=>!!u.find(s,'START FFA'));
 if(mode==='normal'){
  for(const players of [2,3,4]){u.tap(u.observe(),players+' players');await u.wait('final-normal-ffa-'+players+'p',s=>s.rows.some(n=>n['content-desc']===players+' player FFA maps, selected group'));}
  u.tap(u.observe(),'Originals');await waitText('final-normal-ffa-originals','EMAG FFA');u.tap(u.observe(),'Next FFA map, or swipe left');await waitText('final-normal-ffa-next','2 / 6');u.tap(u.observe(),'Previous FFA map, or swipe right');await waitText('final-normal-ffa-previous','1 / 6');
  u.tap(u.observe(),'Open FFA saved games on this phone');await waitText('final-normal-ffa-saves','FFA SAVES');back();await u.wait('final-normal-ffa-saves-return',s=>!!u.find(s,'START FFA'));
 }
 record('FFA groups, preview and fixed Start fit');back();await u.homeState('final-'+mode+'-ffa-return');
 await openHome('Multiplayer');await u.wait('final-'+mode+'-multiplayer',s=>s.rows.some(n=>n.class==='android.widget.CheckBox')&&s.rows.some(n=>n.text==='JOIN'),30000);
 assert(!u.observe().rows.some(n=>n.text==='Join by IP address'));record('Native Multiplayer list fits');back();await u.homeState('final-'+mode+'-multiplayer-return');
 if(mode==='normal')for(const [label,fragment,key]of [['Guide: research paths and how to play','/assets/guide/index.html','guide'],['Game Hub: public multiplayer results and rankings','/assets/hub/index.html','hub']]){
  await openHome(label);const c=await web.connect(fragment);try{await c.wait('document.readyState==="complete"&&document.body.innerText.trim().length>60','Loaded retained '+key,25000);u.save('final-normal-'+key);}finally{c.close();}back();await u.homeState('final-normal-'+key+'-return');record('Retained '+key+' opens and returns');
 }
 const after=await u.homeState('final-'+mode+'-home-after');assert.deepEqual(after.mainTokens,home.mainTokens,'Main Activity was recreated');
 fs.writeFileSync(u.out+'/routes-'+mode+'.json',JSON.stringify({version:'0.84',passed:true,mode,actualAndroidViewsExecuted:true,emulatorUsed:true,viewport:[after.width,after.height],fontScale:mode==='large'?1.3:1,mainActivityToken:home.mainTokens[0],checks:log},null,2));
}
run().catch(e=>{u.save('failure-final-'+mode);console.error(e);process.exitCode=1;});
