'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {connect,adb,out}=require('./native-live.cjs');
const report={started:new Date().toISOString(),seeded:false,cases:[]};
let c,a;
function verifyPage(d,kind){
 const headerHeight=d.headerBounds[3]-d.headerBounds[1];
 assert.equal(d.controlScale,1,'visual target uses Standard interface size');
 assert.equal(headerHeight,d.minimumTouchPx,'actual native header is exactly48dp');
 for(const label of ['BUILD','TECH','FACTORY','DESIGN','MORE','SKIP WAVE','BACK TO BATTLE']){
  const b=d.views.find(v=>v.label===label);assert.ok(b&&b.bounds[3]-b.bounds[1]>=d.minimumTouchPx,label+' has full touch height');
 }
 const prefix=kind==='research'?'tech:':null;
 const actions=d.views.filter(v=>v.class==='android.widget.Button'&&(prefix?v.rowId?.startsWith(prefix):/^(PRODUCE) /.test(v.label))&&v.bounds[3]-v.bounds[1]>=d.minimumTouchPx);
 assert.ok(actions.length>=5,'five catalogue actions are fully visible');
 const toolbar=d.views.filter(v=>v.class==='android.widget.TextView'&&v.bounds[1]>=headerHeight&&v.bounds[3]<=headerHeight+d.minimumTouchPx);
 const selectors=toolbar.filter(v=>kind==='research'?v.text.startsWith('Lab ')||v.text==='All tech':v.text.startsWith('Factory '));
 assert.ok(selectors.length>=(kind==='research'?2:1));
 assert.ok(selectors.every(v=>v.ellipsizedCharacters===0),'collapsed selectors are legible without truncation');
 const search=d.views.find(v=>v.label===(kind==='research'?'Search technology':'Search designs'));
 assert.ok(search&&search.bounds[3]-search.bounds[1]>=d.minimumTouchPx,'search keeps48dp input height');
 assert.ok(!d.views.some(v=>v.text===(kind==='research'?'RESEARCH':'FACTORY')),'no duplicate page heading');
 return {headerHeight,fullyVisibleCatalogueActions:actions.length,selectors,search};
}
(async()=>{c=await connect();a=require('./native-audit-controls.cjs')(c,report);try{
 const apk=adb('shell','pm','path','com.rbabbit.warzonetowers').toString().trim().replace('package:','');report.installedAPK_SHA256=adb('shell','sha256sum',apk).toString().split(/\s/)[0];
 await a.resume();await a.menu('Help & interface size');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).page==="help"');await a.scrollTo('Standard');await a.tap('Standard');await a.close();
 await a.tap('UNIT CONTROLS');await a.tap('TRUCKS');await c.wait('__warzoneCommands.report().snapshot.selectedUnits.length>0');report.selected=await c.evaluate('__warzoneCommands.report().snapshot.selectedUnits');await a.capture('compact-battle');
 await a.tap('TECH');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).page==="research"');await c.wait('!JSON.parse(BlockNightAndroid.nativeDiagnostics()).layoutPending');
 report.research=verifyPage(await a.ui(),'research');await a.capture('compact-research');
 const labs=await c.evaluate('__blockNightResearch.report().labs.map(l=>({id:l.id,idle:l.idle})).sort((a,b)=>a.id-b.id)');
 if(labs.length>=3){await a.tap('SELECT Lab 3');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).selectedLab==='+labs[2].id);assert.equal(await c.evaluate('__blockNightResearch.report().labs.find(l=>l.id==='+labs[2].id+').idle'),labs[2].idle,'changing selected lab assigns no topic');await a.tap('SELECT Lab 1');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).selectedLab==='+labs[0].id);}
 await a.close();await a.tap('FACTORY');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).page==="factory"');report.factory=verifyPage(await a.ui(),'factory');
 await a.tap('Decrease production quantity');assert.equal((await a.ui()).productionQuantity,1);
 await a.tap('Increase production quantity');await a.tap('Increase production quantity');assert.equal((await a.ui()).productionQuantity,3);
 await a.tap('Decrease production quantity');assert.equal((await a.ui()).productionQuantity,2);
 await a.tap('Production quantity');await a.tap('5 units');await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).productionQuantity===5');
 const factories=await c.evaluate('__warzoneCommands.report().snapshot.factories');
 if(factories.length>1){const other=factories[1];await a.tap('SELECT '+other.kind+' '+other.number);await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).selectedFactory==='+other.id);assert.equal((await a.ui()).productionQuantity,5);await a.tap('SELECT '+factories[0].kind+' '+factories[0].number);await c.wait('JSON.parse(BlockNightAndroid.nativeDiagnostics()).selectedFactory==='+factories[0].id);}
 await a.capture('compact-factory');await a.tap('Production quantity');await a.tap('1 unit');await a.close();await a.pause();report.errors=c.errors;assert.deepEqual(c.errors,[]);report.passed=true;
 fs.writeFileSync(path.join(out,'audit-compact-layout.json'),JSON.stringify(report,null,2));console.log('PASS: actual compact48dp header/controls, five full rows, legible selectors, direct lab/factory selection and quantity controls');
}catch(e){report.failure=String(e.stack||e);try{await a.capture('compact-layout-failure');report.ui=await a.ui();if(report.ui.dialog)await a.tap('Cancel');await a.pause();}catch(x){report.recoveryError=String(x);}fs.writeFileSync(path.join(out,'audit-compact-layout-failure.json'),JSON.stringify(report,null,2));throw e;}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
