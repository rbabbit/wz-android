'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const {harness}=require('./check-campaign-js-051.cjs');
const ROOT=path.resolve(__dirname,'..'),DOCK='app/src/main/assets/warzone/ui/lab-ui.js',HELPER='tools/check-campaign-layout-053.cjs';
const source=file=>fs.readFileSync(path.join(ROOT,file),'utf8'),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
// Reuse only the existing controlled DOM helpers, never its main/proof writer.
const helper=source(HELPER),a=helper.indexOf('function dom(){'),b=helper.indexOf('async function main(){',a);
assert.ok(a>=0&&b>a);const helpers=vm.createContext({harness,source,DOCK,vm});vm.runInContext(helper.slice(a,b),helpers);
const checks=[];
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS: '+name);}
function setup(mode='towers',saved='true'){
 const f=helpers.fixture(mode==='campaign'),store=new Map([['lab-ops-collapsed',saved]]),storageCalls=[],intervals=[],actions=[];
 if(mode==='duel')f.h.window.__warzoneDuelConfig={mode:'duel'};
 f.h.context.localStorage={getItem:key=>{storageCalls.push(['read',key]);return store.get(key)||null;},setItem:(key,value)=>{storageCalls.push(['write',key,value]);store.set(key,value);}};
 f.h.context.setInterval=fn=>{intervals.push(fn);return intervals.length;};
 f.h.window.__kalaWarzoneTouch.activateFooterBuild=()=>{actions.push('build');f.h.commandState.buildOpen=!f.h.commandState.buildOpen;};
 f.h.window.TowersStatus={toggle:kind=>actions.push('status:'+kind),close:()=>actions.push('close-status'),update(){}};
 f.h.window.__warzoneCommands.afterBuildExit=action=>{actions.push('keep-orders-exit');f.h.commandState.buildOpen=false;return action();};
 f.runDock();for(const script of f.h.document.head.children)script.onload?.();
 const click=id=>{const target=f.node(id);assert.ok(target,id);for(const fn of f.node('lab-ops').listeners.click||[])fn({target});};
 return{...f,store,storageCalls,actions,click,update:()=>intervals[0]()};
}
async function main(){
 await check('Campaign and Towers remove the actual collapse node and ignore old collapsed=true without changing Duel preference',()=>{
  for(const mode of['campaign','towers']){const f=setup(mode);assert.equal(f.node('lab-ops-toggle'),null);assert.equal(f.node('lab-ops').dataset.collapsed,'false');assert.equal(f.h.window.TowersLab.report().collapsed,false);assert.equal(f.store.get('lab-ops-collapsed'),'true');assert.deepEqual(f.storageCalls,[]);
   assert.deepEqual(Array.from(f.node('lab-ops').children,n=>n.id),['lab-ops-research','lab-ops-production','wt-open-build']);assert.equal(f.h.window.TowersLab.report().visible,true);assert.equal(f.node('lab-ops').hidden,false);
  }
 });
 await check('Always-visible footer Build retains its toggle, pressed state and close caption in both modes',()=>{
  for(const mode of['campaign','towers']){const f=setup(mode);f.click('wt-open-build');f.update();assert.equal(f.h.commandState.buildOpen,true);assert.equal(f.node('wt-open-build').getAttribute('aria-expanded'),'true');assert.equal(f.node('wt-open-build').querySelector('small').textContent,'Tap to close');assert.equal(f.node('lab-ops').hidden,false);
   f.click('wt-open-build');f.update();assert.equal(f.h.commandState.buildOpen,false);assert.equal(f.node('wt-open-build').getAttribute('aria-expanded'),'false');assert.equal(f.node('wt-open-build').querySelector('small').textContent,'Structures');assert.deepEqual(f.actions,['build','build']);
  }
 });
 await check('Analysis and Manufacturing still open activity panels, and switching from Build uses the existing keep-orders exit',async()=>{
  for(const mode of['campaign','towers']){const f=setup(mode);f.click('lab-ops-research');await f.h.settle();f.click('lab-ops-production');await f.h.settle();assert.deepEqual(f.actions,['status:research','status:factory']);
   f.actions.length=0;f.click('wt-open-build');f.click('lab-ops-research');await f.h.settle();assert.deepEqual(f.actions,['build','keep-orders-exit','status:research']);assert.equal(f.h.commandState.buildOpen,false);
  }
 });
 await check('Duel keeps its real SHOW/minus control, old collapsed preference, persistence and two activity buttons',()=>{
  const f=setup('duel');const toggle=f.node('lab-ops-toggle');assert.ok(toggle);assert.equal(toggle.textContent,'SHOW');assert.equal(f.h.window.TowersLab.report().collapsed,true);assert.equal(f.node('wt-open-build'),null);
  toggle.click();assert.equal(toggle.textContent,'−');assert.equal(f.node('lab-ops').dataset.collapsed,'false');assert.equal(f.store.get('lab-ops-collapsed'),'false');toggle.click();assert.equal(toggle.textContent,'SHOW');assert.equal(f.store.get('lab-ops-collapsed'),'true');
 });
 await check('Non-Duel mode remains expanded even when local storage is unavailable',()=>{
  for(const mode of['campaign','towers']){const f=helpers.fixture(mode==='campaign');f.h.context.localStorage={getItem(){throw Error('unavailable');},setItem(){throw Error('unavailable');}};f.runDock();assert.equal(f.h.window.TowersLab.report().error,'');assert.equal(f.h.window.TowersLab.report().collapsed,false);assert.equal(f.node('lab-ops-toggle'),null);}
 });
 await check('Existing click/update/label paths are byte-identical to v0.53; no empty CSS column or new fixed footer width is introduced',()=>{
  const prior=cp.execFileSync('python',['-c',String.raw`import json,pathlib,sys,zipfile
r=pathlib.Path(sys.argv[1]);f=json.loads((r/'archive/fallback-0.54.json').read_text());p=next(x['path'] for x in f['files'] if x['path'].endswith('.zip'));sys.stdout.buffer.write(zipfile.ZipFile(p).read('app/src/main/assets/warzone/ui/lab-ui.js'))`,ROOT],{encoding:'utf8',maxBuffer:1024*1024}).replace(/\r\n/g,'\n');
  const current=source(DOCK).replace(/\r\n/g,'\n');const begin=text=>text.indexOf("  dock.addEventListener('click', event =>");const end=text=>text.indexOf('  collapse(state.collapsed);');assert.equal(current.slice(begin(current),end(current)),prior.slice(begin(prior),end(prior)));
  assert.ok(source('app/src/main/assets/warzone/ui/lab-shell.css').includes('#lab-ops{position:fixed'));assert.ok(source('app/src/main/assets/warzone/ui/lab-shell.css').includes('display:flex'));assert.ok(!current.includes('grid-template-columns'));assert.ok(!current.includes('width:'));
  for(const mode of['campaign','towers'])assert.equal(setup(mode).node('lab-ops').children.length,3);
 });
 const files=[DOCK,'tools/check-footer-collapse-054.cjs',HELPER,'tools/check-campaign-js-051.cjs'];
 const report={version:'0.54',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
  scope:'Actual activity-dock controller in controlled DOM/VM fixtures, persisted collapsed users, activity/Build handler preservation and Duel behavior. Real small-screen bounds and native interactions require the exact-APK emulator checks.',
  sources:files.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(ROOT,file)))})),recordedUTC:new Date().toISOString()};
 fs.writeFileSync(path.join(ROOT,'archive/footer-collapse-js-0.54-checks.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
