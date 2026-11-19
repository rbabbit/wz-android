'use strict';
// Actual native reward functions with simulated native APIs. No gameplay/emulator claim.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'scenario/warzone-towers-catalog.json')));
const rewardSource=fs.readFileSync(path.join(root,'scenario/warzone-towers-rewards.js'),'utf8');
const commandSource=fs.readFileSync(path.join(root,'scenario/warzone-towers-commands.js'),'utf8');
const retained=fs.readFileSync(path.join(root,'tools/check-rewards-native-027.cjs'),'utf8');
const baseSource=retained.slice(retained.indexOf('function baseSetup()'),retained.indexOf('\nfunction setup()')).replace('setTimer(){},queue(){}','setTimer(){},removeTimer(){},queue(){}');
const baseSetup=new Function('vm','catalog','commandSource','rewardSource','fortress',baseSource+';return baseSetup;')(vm,catalog,commandSource,rewardSource,'X-Super-Cannon');
const clone=v=>JSON.parse(JSON.stringify(v)),checks=[];
function check(name,fn){fn();checks.push(name);}
function fixture(profile='challenge',map='firefight'){
 const t=baseSetup();let context={profile,map};t.c.wt_rewardContext=()=>context;t.context=v=>context=v;
 t.c.maxPlayers=2;t.c.scavengerPlayer=7;t.c.allianceExistsBetween=(a,b)=>a===b;
 for(const item of catalog.buildings){t.c.Stats.Building[item.name].HitPoints=1000;t.c.Stats.Building[item.name].Type='Structure';t.upgrades[0].Building[item.name]={HitPoints:1000,ResearchPoints:100,ModuleResearchPoints:50};}
 t.upgrades[0].Sensor={};
 for(const [key,type]of Object.entries(t.c.wtreward_types)){
  if(type.id)t.available.delete(type.id);
  if(type.more){for(const group of ['Building','Weapon'])for(const [name,value]of Object.entries(t.c.Stats[group]||{}))if(value.Id===type.id)delete t.c.Stats[group][name];}
 }
 t.request=(items={},extra={})=>({session:'challenge099',profile:context?.profile||'challenge',map:context?.map||'firefight',items,...extra});
 t.apply=(items={},extra={})=>t.c.wtreward_apply(t.request(items,extra));
 t.add=(items,id)=>t.c.wtreward_add(t.request(items,{transactionId:id}));return t;
}
check('Challenge rejects every More Fortress purchase before native effects even with no mod stats',()=>{
 for(const [key,type]of Object.entries(fixture().c.wtreward_types))if(type.more){const t=fixture();assert.equal(t.apply({[key]:1}).error,'reward-morefortress-profile-invalid');assert.equal(t.calls.length,0);assert.equal(Object.keys(t.c.wtreward_match.entries).length,0);}
});
check('Challenge requires actual native profile and explicit matching map on all initial requests',()=>{
 for(const change of [{profile:'towers'},{map:'earthsea'},{profile:undefined},{map:undefined}]){const t=fixture();assert.equal(t.apply({},change).ok,false);assert.equal(t.calls.length,0);}
 const t=fixture();t.context(null);assert.equal(t.apply().error,'reward-challenge-context-required');
});
check('Standard artillery stock unlocks only paid allowance and construction consumes quota',()=>{
 const t=fixture();assert.equal(t.apply({ripple:2}).ok,true);const type=t.c.wtreward_types.ripple,item=catalog.buildings.find(b=>b.id===type.id);
 assert.equal(t.limits[type.id],2);assert.equal(t.c.wtreward_state().profile,'challenge');assert.equal(t.c.wtreward_state().map,'firefight');
 t.structures.push({id:400,player:0,type:1,itemId:type.id,name:item.name,x:20,y:20,status:0});t.c.wtreward_tick();
 assert.equal(t.c.wtreward_state().remaining.ripple,1);assert.equal(t.apply({ripple:2}).ok,true);assert.equal(t.c.wtreward_state().remaining.ripple,1);
});
check('Live purchases are idempotent, scoped, and cannot insert More Fortress types',()=>{
 const t=fixture();assert.equal(t.apply().ok,true);assert.equal(t.add({ripple:3},'live-ripple').ok,true);
 assert.equal(t.add({ripple:3},'live-ripple').ok,true);assert.equal(t.c.wtreward_state().remaining.ripple,3);
 assert.equal(t.add({mf_concrete_1:1},'live-mf').error,'reward-morefortress-profile-invalid');
 assert.equal(t.c.wtreward_add(t.request({ripple:1},{map:'earthsea',transactionId:'wrong-map'})).error,'reward-context-conflict');
 assert.deepEqual(clone(t.c.wtreward_state().transactions),['live-ripple']);
});
check('Native save resume cannot refill consumed buildings or repeat supply power',()=>{
 const t=fixture();assert.equal(t.apply({ripple:2},{supply:true}).ok,true);assert.equal(t.power(),3000);
 const type=t.c.wtreward_types.ripple,item=catalog.buildings.find(b=>b.id===type.id);
 t.structures.push({id:401,player:0,type:1,itemId:type.id,name:item.name,x:20,y:20,status:1});t.c.wtreward_tick();
 const saved=clone(t.c.wtreward_match),loaded=fixture();loaded.c.wtreward_match=saved;loaded.setPower(1700);
 loaded.c.wtreward_eventGameLoaded();const caps=loaded.request({ripple:2},{supply:true,remaining:{ripple:1}});
 assert.equal(loaded.c.wtreward_resume(caps).resumed,true);assert.equal(loaded.c.wtreward_resume(caps).resumed,true);
 assert.equal(loaded.c.wtreward_state().remaining.ripple,1);assert.equal(loaded.power(),1700);
});
check('Challenge laser satellite can target the opponent and scavengers but rejects owned targets',()=>{
 const t=fixture(),enemies=[{id:501,player:1,type:0,x:20,y:20},{id:502,player:7,type:1,x:30,y:30},{id:503,player:0,type:0,x:10,y:10}];
 assert.equal(t.apply({laser_sat:1}).ok,true);t.c.gameTime=2000;
 t.c.Stats.Weapon.LasSat={Id:'LasSat',FirePause:1000};t.upgrades[0].Weapon={LasSat:{FirePause:1000}};
 const item=catalog.buildings.find(b=>b.id==='A0LasSatCommand');t.structures.push({id:500,player:0,type:1,itemId:item.id,name:item.name,x:15,y:15,status:1,selected:true,weapons:[{id:'LasSat',lastFired:0}]});
 t.c.enumRange=(x,y,r,p)=>enemies.filter(o=>o.player===p&&Math.hypot(o.x-x,o.y-y)<=r);
 t.c.getObject=(type,p,id)=>[...t.structures,...enemies].find(o=>o.player===p&&o.type===type&&o.id===id);
 t.c.activateStructure=(s,o)=>{t.calls.push({kind:'laser',target:o.id});return true;};
 assert.equal(t.c.wtreward_fireLasSat({x:20,y:20}).ok,true);t.c.wtreward_match.lassatPending=null;
 assert.equal(t.c.wtreward_fireLasSat({x:30,y:30}).ok,true);t.c.wtreward_match.lassatPending=null;
 assert.equal(t.c.wtreward_fireLasSat({x:10,y:10}).error,'lassat-target-missing');
 assert.deepEqual(t.calls.filter(c=>c.kind==='laser').map(c=>c.target),[501,502]);
});
check('Towers retains its scavenger-only laser targeting and standard profile behavior',()=>{
 const t=fixture('towers','waves-map'),enemies=[{id:601,player:1,type:0,x:20,y:20},{id:602,player:7,type:1,x:30,y:30}];
 t.c.scavAI=7;assert.equal(t.apply({laser_sat:1}).ok,true);assert.equal(t.c.wtreward_state().profile,'towers');
 t.c.Stats.Weapon.LasSat={Id:'LasSat',FirePause:1000};t.upgrades[0].Weapon={LasSat:{FirePause:1000}};
 const item=catalog.buildings.find(b=>b.id==='A0LasSatCommand');t.structures.push({id:600,player:0,type:1,itemId:item.id,name:item.name,x:15,y:15,status:1,selected:true,weapons:[{id:'LasSat',lastFired:0}]});
 t.c.enumRange=(x,y,r,p)=>enemies.filter(o=>o.player===p&&Math.hypot(o.x-x,o.y-y)<=r);
 t.c.getObject=(type,p,id)=>[...t.structures,...enemies].find(o=>o.player===p&&o.type===type&&o.id===id);
 t.c.activateStructure=(s,o)=>{t.calls.push({kind:'laser',target:o.id});return true;};
 assert.equal(t.c.wtreward_fireLasSat({x:20,y:20}).error,'lassat-target-missing');
 assert.equal(t.c.wtreward_fireLasSat({x:30,y:30}).ok,true);
 assert.deepEqual(t.calls.filter(c=>c.kind==='laser').map(c=>c.target),[602]);
});
const report={passed:true,checksPassed:checks.length,checks,scope:'Actual common reward and command source in Node VM with simulated native APIs and absent More Fortress stats. Not emulator/gameplay proof.',emulatorUsed:false};
const out=path.join(root,'qa/challenge-099');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'rewards-native-host.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
