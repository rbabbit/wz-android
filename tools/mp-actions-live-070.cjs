'use strict';
const q=require('./mp-live-070.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const c=await q.connect(),proof={};const child=c.child,waitChild=(expr,label,ms)=>c.wait(`document.querySelector('#warzone-game-frame').contentWindow.eval(${JSON.stringify(expr)})`,label,ms);try{
 const r=()=>child('__warzoneCommands.report()');
 if((await r()).buildOpen)await c.tap('#wt-open-build');
 await c.tap('#wt-open-factory');await c.tap('[data-page="design"]');
 await c.tap('[data-part="Body1REC"]');await c.tap('[data-step="propulsion"]');await c.tap('[data-part="wheeled01"]');await c.tap('[data-step="0"]');
 await c.tap('[data-part="MG1Mk1"]');
 await c.wait("document.querySelector('#wt-save-design')&&!document.querySelector('#wt-save-design').disabled",'native valid design',6000);
 proof.draft=(await r()).draft;await c.tap('#wt-save-design');
 await waitChild('__warzoneCommands.report().saved.some(d=>d.body==="Body1REC"&&d.turrets.includes("MG1Mk1"))','blueprint saved',5000);
 proof.saved=(await r()).saved;await c.save('final-design-saved');
 await c.tap('#wt-open-factory');await c.wait("(()=>{const b=document.querySelector('#wt-open-build')?.getBoundingClientRect();return b&&b.width>0;})()",'footer restored');
 await c.tap('#wt-open-build');await waitChild('!__warzoneCommands.report().selectingTrucks','selected visible builders',7000);
 await c.tap('[data-build="GuardTower1"]');
 proof.site=await child(`(async()=>{const r=__warzoneCommands.report(),w=r.nativeBuildGroup,radar=PcMultiplayerNative.state.radar;for(const t of r.snapshot.trucks.filter(t=>w.includes(t.id))){for(let d=2;d<=12;d+=2)for(const [dx,dy] of [[d,0],[-d,0],[0,d],[0,-d],[d,d],[-d,d]]){const x=Math.round(t.x)+dx,y=Math.round(t.y)+dy,h=WarzoneTerrain.heightAt((x+.5)*128,(y+.5)*128),p=WarzoneTerrain.project((x+.5)*128,(y+.5)*128,h);if(!p||p.x<270||p.x>900||p.y<30||p.y>420||radar.visible&&p.x>=radar.left&&p.x<=radar.right&&p.y>=radar.top&&p.y<=radar.bottom)continue;const k=WarzoneTerrain.pick(p.x,p.y);if(!k||k.x!==x||k.y!==y)continue;const v=await __warzoneCommands.send('preview-build',{itemId:'GuardTower1',x,y,workerIds:w,session:r.session});if(v.ok)return{x,y,p,radar,workerIds:w};}}throw Error('No validated visible reachable build site');})()`);
 const frame=await c.evaluate("(()=>{const b=document.querySelector('#warzone-game-frame').getBoundingClientRect();return{left:b.left,top:b.top};})()");
 const before=(await r()).history.length;await c.touch(frame.left+proof.site.p.x,frame.top+proof.site.p.y);
 await waitChild(`__warzoneCommands.report().history.slice(${before}).some(h=>h.action==='queue-build'&&h.ok)`,'real construction order',6000);
 proof.buildStart=await r();await c.save('final-building');
 const job=proof.buildStart.history.slice(before).find(h=>h.action==='queue-build'&&h.ok);proof.buildJob=job;
 await c.tap('#wt-open-build');
 // The same menu must toggle repeatedly without opening stock native panels.
 for(const [id,expr] of [['#blocknight-tech','__blockNightResearch.report().open'],['#wt-open-factory','__warzoneCommands.report().page==="factory"'],['#wt-open-queue','__warzoneCommands.report().page==="queue"']])for(let i=0;i<2;i++){await c.tap(id);await waitChild(expr,'custom page opens');await c.tap(id);await waitChild('!('+expr+')','custom page closes');}
 await c.tap('#blocknight-help');assert.equal(await c.evaluate("document.querySelector('#warzone-towers-help-overlay').hidden"),false);await c.save('final-help');await c.tap('#blocknight-help');
 await c.tap('#wt-field-toggle');await c.tap('[data-command="deselect"]');await waitChild('__warzoneCommands.report().snapshot.trucks.every(t=>!t.selected)','deselect actual trucks',5000);
 await c.tap('[data-command="intelligence"]');await waitChild('__warzoneIntelligence.report().open','Intelligence opens');await q.delay(800);assert.equal(await child('__warzoneIntelligence.report().open'),true);proof.intelligence=await child('__warzoneIntelligence.report()');await c.save('final-intelligence');
 await c.tap('#blocknight-tech');await waitChild('__blockNightResearch.report().open','Research replaces Intelligence');await c.tap('#blocknight-tech');
 await waitChild(`__warzoneCommands.report().snapshot.finishedBuilds.some(b=>b.x===${proof.site.x}&&b.y===${proof.site.y})`,'tower completes with real builders',45000);
 proof.buildComplete=await r();await c.save('final-build-complete');
 const factory=proof.buildComplete.snapshot.factories.find(f=>f.active);proof.factory=factory;
 proof.controls=await child('__kalaWarzoneTouch.report()');proof.passed=true;console.log(JSON.stringify({passed:true,design:proof.draft,site:proof.site,finished:proof.buildComplete.snapshot.finishedBuilds,reportCount:proof.intelligence.items?.length}));
}catch(e){proof.error=String(e);await c.save('final-actions-failure');throw e;}finally{fs.writeFileSync(path.join(q.out,'final-actions-proof.json'),JSON.stringify(proof,null,2));c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
