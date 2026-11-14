'use strict';
const q=require('./mp-live-071.cjs'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
(async()=>{const c=await q.connect(),proof=JSON.parse(fs.readFileSync(path.join(q.out,'combat-live-proof.json'),'utf8'));delete proof.error;
 const read=c.child,wait=(e,l,t=10000)=>c.wait(`document.querySelector('#warzone-game-frame').contentWindow.eval(${JSON.stringify(e)})`,l,t);
 try{
  if(await c.evaluate(`document.querySelector('#wt-field-centre').hidden`))await c.tap('#wt-field-toggle');
  await c.tap('[data-command="trucks"]');await wait('!PcMultiplayerNative.state.combatLock.enabled&&__warzoneCommands.report().snapshot.trucks.some(t=>t.selected)','Trucks override');proof.trucks=await c.save('combat071-trucks-override');
  if(await c.evaluate(`!document.querySelector('#wt-field-centre').hidden`))await c.tap('#wt-field-toggle');
  await c.tap('#wt-open-build');await wait('!__warzoneCommands.report().selectingTrucks','builders ready');
  await c.tap('#wt-open-build');await c.tap('#blocknight-combat');await wait('PcMultiplayerNative.state.combatLock.enabled&&!PcMultiplayerNative.state.combatLock.suspended','rearmed ON');
  proof.movementBefore=await read('__warzoneCommands.report().snapshot.selectedUnits');
  // Prepare the existing units' actual native view; no orders or units are seeded.
  proof.cameraFixture=await read(`(()=>{const u=__warzoneCommands.report().snapshot.selectedUnits.find(u=>!u.constructor),camera=PcMultiplayerNative.state.view.camera;const target={...camera,x:Math.round((u.x+.5)*128),y:Math.round((u.y+.5)*128)};PcMultiplayerNative.setCamera(target);return target;})()`);
  await wait(`Math.abs(PcMultiplayerNative.state.view.camera.x-${proof.cameraFixture.x})<160&&Math.abs(PcMultiplayerNative.state.view.camera.y-${proof.cameraFixture.y})<160`,'prepared camera centres actual combat units');
  proof.moveTarget=await read(`(async()=>{const r=__warzoneCommands.report(),z=PcMultiplayerNative.state.radar,v=PcMultiplayerNative.state.view;for(const t of r.snapshot.selectedUnits.filter(t=>!t.constructor)){for(const d of [2,3,4,5])for(const [dx,dy] of [[d,0],[-d,0],[0,d],[0,-d],[d,d],[-d,-d]]){const x=Math.round(t.x)+dx,y=Math.round(t.y)+dy;if(r.snapshot.trucks.some(u=>Math.hypot(u.x-x,u.y-y)<1.4))continue;const p=WarzoneTerrain.project((x+.5)*128,(y+.5)*128,WarzoneTerrain.heightAt((x+.5)*128,(y+.5)*128));if(!p||p.x<300||p.x>v.width-70||p.y<60||p.y>v.height-80||z.visible&&p.x>=z.left-20&&p.x<=z.right+20&&p.y>=z.top-20&&p.y<=z.bottom+20)continue;const k=WarzoneTerrain.pick(p.x,p.y);if(k?.x!==x||k?.y!==y)continue;const a=await __warzoneCommands.send('preview-build',{itemId:'GuardTower1',x,y,workerIds:r.snapshot.trucks.map(t=>t.id),session:r.session});if(a.ok)return{x,y,p};}}throw Error('No verified free ground');})()`);
  const f=await c.evaluate(`document.querySelector('#warzone-game-frame').getBoundingClientRect().toJSON()`);await c.touch(f.left+proof.moveTarget.p.x,f.top+proof.moveTarget.p.y);
  await wait(`PcMultiplayerNative.state.combatLock.enabled&&__warzoneCommands.report().snapshot.selectedUnits.some(t=>${JSON.stringify(proof.movementBefore)}.some(b=>b.id===t.id&&(Math.abs(b.x-t.x)>.2||Math.abs(b.y-t.y)>.2)))`,'native combat movement with toggle ON',12000);
  proof.moving=await read('__warzoneCommands.report().snapshot.selectedUnits');await c.save('combat071-moving');
  await c.tap('#wt-field-toggle');await c.tap('[data-command="stop"]');await wait('PcMultiplayerNative.state.combatLock.enabled&&__warzoneCommands.report().snapshot.selectedUnits.every(t=>t.order===0)','Stop preserves lock');
  if(await c.evaluate(`!document.querySelector('#wt-field-centre').hidden`))await c.tap('#wt-field-toggle');
  proof.after=await read('PcMultiplayerNative.state.combatLock');proof.passed=true;
  fs.writeFileSync(path.join(q.out,'combat-live-proof.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({passed:true,ids:proof.after.selectedIds,move:proof.moveTarget,orders:proof.moving.map(u=>u.order)}));
 }catch(e){proof.error=String(e);fs.writeFileSync(path.join(q.out,'combat-finish-failure.json'),JSON.stringify(proof,null,2));try{await c.save('combat-finish-failure')}catch{}throw e;}finally{c.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
