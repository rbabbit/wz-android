'use strict';
const q=require('./mp-live-071.cjs'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const stage=process.argv[2]||'prepare';
(async()=>{const c=await q.connect();const read=c.child,wait=(expr,label,ms=12000)=>c.wait(`document.querySelector('#warzone-game-frame').contentWindow.eval(${JSON.stringify(expr)})`,label,ms),proof={};try{
 await wait('PcMultiplayerNative.state.worldReady','world ready');
 if(stage==='prepare'){
  if(await read('__warzoneCommands.report().page')!=='factory')await c.tap('#wt-open-factory');await c.wait(`document.querySelector('[data-factory-family="cyborg"]')`,'cyborg selector');await c.tap('[data-factory-family="cyborg"]');
  console.log(JSON.stringify(await c.evaluate(`[...document.querySelectorAll('#wt-page-content button')].map(e=>({text:e.innerText,data:{...e.dataset},disabled:e.disabled}))`)));
  await c.save('combat-production-menu');return;
 }
 if(stage==='exercise'||stage==='resume'){
  const state=()=>read('PcMultiplayerNative.state.combatLock');
  if(stage==='exercise'){
  proof.before=await state();assert.equal(proof.before.enabled,false);
  if(await read('__warzoneCommands.report().page')!=='factory')await c.tap('#wt-open-factory');await c.tap('[data-factory-family="cyborg"]');
  await c.tap('[data-produce-template="Cyb-Chain-GROUND"]');await c.tap('[data-produce-template="Cyb-Chain-GROUND"]');
  await wait('__warzoneCommands.report().history.some(h=>h.action==="queue-production"&&h.ok)','native production accepted');
  console.log('Native cyborg production accepted');
  await c.tap('#blocknight-combat');await wait('PcMultiplayerNative.state.combatLock.enabled','confirmed ON');
  assert.equal((await state()).suspended,true,'production page temporarily suspends selection');
  await c.tap('#wt-open-factory');await wait('PcMultiplayerNative.state.combatLock.enabled&&!PcMultiplayerNative.state.combatLock.suspended','page closed, policy resumes');
  }else{proof.before=JSON.parse(fs.readFileSync(path.join(q.out,'combat-live-failure.json'),'utf8')).before;}
  await wait(`PcMultiplayerNative.state.combatLock.combatIds.length>=2&&PcMultiplayerNative.state.combatLock.combatIds.every(id=>PcMultiplayerNative.state.combatLock.selectedIds.includes(id))`,'two real newborn combat units automatically selected',75000);
  proof.newborns=await c.save('combat071-newborns-selected');
  console.log('Two native combat births selected while ON');
  assert.equal(await c.evaluate(`document.querySelector('#blocknight-combat').getAttribute('aria-pressed')`),'true');
  // Repeat menu returns without clearing the toggle or replacing actual orders.
  for(const id of ['#blocknight-tech','#wt-open-queue']){await c.tap(id);await wait('PcMultiplayerNative.state.combatLock.enabled&&PcMultiplayerNative.state.combatLock.suspended','custom page pauses');await c.tap(id);await wait('PcMultiplayerNative.state.combatLock.enabled&&!PcMultiplayerNative.state.combatLock.suspended','custom page resumes');}
  await c.wait(`(()=>{const b=document.querySelector('#wt-open-build')?.getBoundingClientRect();return b&&b.width>0;})()`,'Build footer visible');await c.tap('#wt-open-build');
  await wait('__warzoneCommands.report().buildOpen&&!__warzoneCommands.report().selectingTrucks','Build selected actual visible trucks');
  proof.build=await c.save('combat071-build-suspended');assert.ok(proof.build.commands.nativeBuildGroup.length>0);assert.equal(proof.build.native.state.combatLock.enabled,true);assert.equal(proof.build.native.state.combatLock.suspended,true);
  assert.ok(proof.build.commands.nativeBuildGroup.every(id=>proof.build.native.state.combatLock.selectedIds.includes(id)));
  await c.tap('#wt-open-build');await wait('PcMultiplayerNative.state.combatLock.enabled&&!PcMultiplayerNative.state.combatLock.suspended&&PcMultiplayerNative.state.combatLock.combatIds.every(id=>PcMultiplayerNative.state.combatLock.selectedIds.includes(id))','Build closes and combat restores');
  await c.tap('#wt-field-toggle');await c.tap('[data-command="all-units"]');
  await wait('!PcMultiplayerNative.state.combatLock.enabled&&__warzoneCommands.report().snapshot.trucks.every(t=>t.selected)','All Units remains one-shot and includes trucks');proof.allUnits=await c.save('combat071-all-units');
  await c.tap('[data-command="deselect"]');await wait('PcMultiplayerNative.state.combatLock.selectedIds.length===0','Deselect actual units');
  await c.tap('#blocknight-combat');await wait('PcMultiplayerNative.state.combatLock.enabled&&!PcMultiplayerNative.state.combatLock.suspended','explicit ON rearmed');
  if(await c.evaluate(`document.querySelector('#wt-field-centre').hidden`))await c.tap('#wt-field-toggle');await c.tap('[data-command="trucks"]');await wait('!PcMultiplayerNative.state.combatLock.enabled&&__warzoneCommands.report().snapshot.trucks.some(t=>t.selected)','Trucks deliberately overrides combat');proof.trucks=await c.save('combat071-trucks-override');
  if(await c.evaluate(`!document.querySelector('#wt-field-centre').hidden`))await c.tap('#wt-field-toggle');
  await c.tap('#blocknight-combat');await wait('PcMultiplayerNative.state.combatLock.enabled&&!PcMultiplayerNative.state.combatLock.suspended','ON reenabled after Trucks');
  proof.after=await state();proof.passed=true;
  fs.writeFileSync(path.join(q.out,'combat-live-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({passed:true,combatIds:proof.after.combatIds,selectedIds:proof.after.selectedIds,buildTrucks:proof.build.commands.nativeBuildGroup}));
 }
}catch(e){proof.error=String(e);fs.writeFileSync(path.join(q.out,'combat-live-failure.json'),JSON.stringify(proof,null,2));try{await c.save('combat-failure-'+stage);}catch{}throw e;}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
