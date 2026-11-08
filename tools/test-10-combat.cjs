'use strict';
// Ordinary units from UI production, actual ALL UNITS and battlefield touches.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const l=require('./native-live.cjs'),j=require('./lab-journey.cjs'),{controls}=require('./audit-smooth-building.cjs');
const r={passed:false,seeded:false,identity:j.installedIdentity(),checks:{},samples:[],started:new Date().toISOString()};
const write=()=>fs.writeFileSync(path.join(l.out,'combat.json'),JSON.stringify(r,null,2)+'\n');
(async()=>{let c;try{
 c=await j.connectReady();await j.resume(c);r.before=await c.evaluate('__warzoneDuel.report().snapshot');
 await j.closeOverlays(c);if(await c.host('document.getElementById("wt-field-toggle").getAttribute("aria-expanded")==="false"'))await c.tap('#wt-field-toggle');await c.tap('#blocknight-select-all');
 await c.wait('__warzoneCommands.report().snapshot.selectedUnits.some(u=>!u.constructor)',15000);
 r.selected=await j.commandState(c);assert.ok(r.selected.selectedUnits.length&&r.selected.selectedUnits.every(u=>!u.constructor));
 const ctl=await controls(c);r.radarCentre=await ctl.camera(18,29);
 const target=await c.evaluate(`(()=>{WarzoneTerrain.refresh();const x=18.5*128,y=29.5*128,z=WarzoneTerrain.heightAt(x,y),p=WarzoneTerrain.project(x,y,z);if(!p||!__kalaWarzoneTouch.isBattlefieldPoint(p.x,p.y))throw Error('Combat destination not visible');return {...p,pick:WarzoneTerrain.pick(p.x,p.y)}})()`);
 assert.ok(target.pick&&Math.hypot(target.pick.x-18,target.pick.y-29)<2);await ctl.touch(target.x,target.y);r.destination=target;
 const start=await c.evaluate('__warzoneDuel.report().snapshot.gameTime');
 await c.wait('__warzoneDuel.report().snapshot.gameTime>'+Number(start+4000),10000);r.afterMove=await c.evaluate('__warzoneDuel.report().snapshot');
 const selectedIDs=r.selected.selectedUnits.map(u=>u.id);assert.ok(r.afterMove.diagnostics.players[0].units.some(u=>selectedIDs.includes(u.id)&&r.before.diagnostics.players[0].units.some(b=>b.id===u.id&&(b.x!==u.x||b.y!==u.y))),'selected ordinary human units moved after real ground tap');r.checks.actualHumanSelectionAndMovement=true;
 const end=Date.now()+100000;
 while(Date.now()<end){const p=await c.evaluate('__warzoneDuel.report().snapshot');r.samples.push(p);write();const all=p.diagnostics.players.flatMap(x=>x.units);if(all.some(u=>u.weapons.length&&u.health<100)||p.humanHQ.health<100||p.enemyHQ.health<100){r.combatPacket=p;break}if(p.phase!=='active')break;await l.delay(700)}
 assert.ok(r.combatPacket,'ordinary opposing combat units inflict native health damage');r.checks.ordinaryNativeCombat=true;
 const saved=await c.save('10-ordinary-combat-native');r.nativeCombatUnits=Object.values(saved['droid.json']).filter(d=>d.weapons>0);r.screen=l.screen('10-ordinary-native-combat');r.final=await c.evaluate('__warzoneDuel.report().snapshot');r.passed=true;
 }catch(e){r.failure=String(e.stack||e);try{r.failureScreen=l.screen('10-combat-failure');if(c)r.failureState=await c.evaluate('({duel:__warzoneDuel.report(),touch:__kalaWarzoneTouch.report(),commands:__warzoneCommands.report()})')}catch(_){}throw e}
 finally{r.finished=new Date().toISOString();write();c?.close()}
 console.log({passed:r.passed,checks:r.checks});
})().catch(e=>{console.error(e);process.exitCode=1});
