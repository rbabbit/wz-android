'use strict';
// Focused source/VM input checks. No browser, Android, native engine or ads.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const paths=['app/src/main/assets/warzone-touch-controls.js','app/src/main/assets/warzone/ui/lab-ui.js','app/src/main/assets/warzone/ui/towers-feedback.js'];
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const touch=read(paths[0]),dock=read(paths[1]),feedback=read(paths[2]);
for(const n of paths)new vm.Script(read(n),{filename:n});

// Execute the actual footer activation function with independent input gates.
const start=touch.indexOf('  function activateFooterBuild()'),end=touch.indexOf('\n  function ',start+4);
assert.ok(start>0&&end>start);
const state={battleActive:true,stopNonce:null},calls=[],window={__warzoneDuelConfig:null,
  __towersHtml:{isEnded:()=>false},WarzoneRewards:{cancelTarget:()=>calls.push('target')},
  __warzoneCommands:{toggle:page=>calls.push(page)}};
let allow=true;
const activate=vm.runInNewContext('('+touch.slice(start,end).trim()+')',{window,state,prepareHeaderMenu:()=>allow});
activate();assert.deepEqual(calls,['target','build']);
for(const variant of ['inactive','stop','ended','duel','blocked']){
  calls.length=0;state.battleActive=variant!=='inactive';state.stopNonce=variant==='stop'?'pending':null;
  window.__towersHtml.isEnded=()=>variant==='ended';window.__warzoneDuelConfig=variant==='duel'?{mode:'duel'}:null;allow=variant!=='blocked';
  assert.equal(activate(),false);assert.equal(calls.length,0,variant+' must not issue commands');
}
assert.match(touch,/duelNavigation \? \["build", "design", "factory", "queue"\] : \["factory", "queue"\]/);
assert.match(dock,/build\.id = 'wt-open-build'/);assert.match(dock,/dock\.appendChild\(build\)/);
assert.match(dock,/commands\.afterBuildExit\?\.\(showStatus\)/);
assert.ok(!dock.includes('Boolean(commands.page || commands.buildOpen'),'dock must stay reachable in Build');

function fixture(config='voicevol=100\nfxvol=100\n',nativeSound=false){
  let now=1000,prevented=0,plays=0,activeObserver;
  const events=new Map(),winEvents=new Map(),classes=new Set(),attrs=new Map();
  const button={isConnected:true,disabled:false,
    classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n)},
    getAttribute:n=>attrs.get(n),getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:50}),
    closest(selector){return selector==='button,[role="button"]'?this:selector==='[hidden],[inert]'?null:
      selector==='#wt-intelligence-panel,#wt-game-notice[data-research-topic]'?(nativeSound?{}:null):{};}};
  const document={hidden:false,body:{classList:{contains:n=>n==='wt-towers-polished'}},
    addEventListener(n,fn){events.set(n,fn);},getElementById:()=>null};
  const context={document,performance:{now:()=>now},window:{devicePixelRatio:1},
    MutationObserver:class{constructor(fn){activeObserver=fn;}observe(){}disconnect(){}},
    Audio:class{constructor(url){assert.equal(url,'/warzone/ui/game-controls/click.ogg');}play(){plays++;return Promise.resolve();}pause(){}},
    WeakMap,Math};
  context.window.document=document;context.window.parent=context.window;
  context.window.Module={WZVAL_configDirPath:'/config',FS:{readFile:()=>config}};
  context.window.addEventListener=(n,fn)=>winEvents.set(n,fn);
  vm.runInNewContext(feedback,context);
  const emit=(name,extra={})=>events.get(name)?.({target:button,button:0,isPrimary:true,pointerId:1,clientX:20,clientY:20,
    preventDefault(){prevented++;},...extra});
  return {button,classes,attrs,emit,blur:()=>winEvents.get('blur')(),mutation:()=>activeObserver(),
    time:n=>{now+=n;},setHidden:v=>{document.hidden=v;},report:()=>context.window.TowersFeedback.report(),
    plays:()=>plays,prevented:()=>prevented};
}
const f=fixture();f.emit('pointerdown');assert.equal(f.classes.has('wt-pressing'),true);assert.equal(f.plays(),0);
f.emit('pointerup');assert.equal(f.classes.has('wt-pressing'),false);assert.equal(f.plays(),1);
f.emit('click',{detail:1,pointerType:'touch'});assert.equal(f.plays(),1,'compatibility click must not duplicate release sound');
f.time(800);f.emit('pointerdown');f.emit('pointermove',{clientX:55});f.time(900);f.emit('pointerup',{clientX:55});
f.emit('click',{detail:1,pointerType:'touch'});assert.equal(f.plays(),1,'drag and delayed compatibility click must stay quiet');
f.emit('pointerdown');f.emit('pointercancel');assert.equal(f.report().pressing,false);
f.emit('pointerdown');f.blur();assert.equal(f.report().pressing,false);
f.emit('pointerdown');f.button.disabled=true;f.mutation();assert.equal(f.report().pressing,false);f.emit('click');assert.equal(f.plays(),1);
f.button.disabled=false;f.emit('keydown',{key:'Enter',repeat:false});assert.equal(f.classes.has('wt-pressing'),true);f.emit('keyup',{key:'Enter'});assert.equal(f.report().pressing,false);
f.emit('pointerdown');f.setHidden(true);f.emit('visibilitychange');assert.equal(f.report().pressing,false);
assert.equal(f.prevented(),0,'feedback must never intercept or fabricate commands');
for(const config of ['voicevol=0\nfxvol=100\n','voicevol=100\nfxvol=0\n']){const quiet=fixture(config);quiet.emit('pointerdown');quiet.emit('pointerup');assert.equal(quiet.plays(),0,'native mute respected');}
const defaultVolume=fixture('');defaultVolume.emit('pointerdown');defaultVolume.emit('pointerup');assert.equal(defaultVolume.plays(),1,'native optional-key volume default preserved');
const native=fixture(undefined,true);native.emit('pointerdown');assert.equal(native.classes.has('wt-pressing'),true);
native.emit('pointerup');native.emit('click',{detail:1,pointerType:'touch'});assert.equal(native.plays(),0,'native Intelligence/report sounds must not be duplicated');
const synthetic=fixture();synthetic.emit('pointerdown',{isTrusted:false});synthetic.emit('pointerup',{isTrusted:false});synthetic.emit('click',{isTrusted:false});
assert.equal(synthetic.plays(),0);assert.equal(synthetic.report().pressing,false,'programmatic input gets no extra feedback');
const checks=[
 'All three changed controllers parse; Towers top navigation omits Build and footer retains its established ID after both activity tabs',
 'Actual footer activation executes only the existing guarded Build toggle; inactive, stopped, ended, Duel and blocked menu states issue no action',
 'Neighbouring footer activity tabs leave Build through the existing keep-orders transition; the footer stays reachable during Build',
 'Actual feedback controller depresses immediately, releases/cancels on drag, pointercancel, blur, visibility and disabled mutation, without preventing any event',
 'Control feedback sound is emitted once per release, ignores compatibility clicks and disabled/dragged presses, respects native mute and optional volume defaults',
 'Cancelled long drags remain quiet through delayed compatibility clicks; Intelligence/report controls retain visual feedback without duplicating their native sound; synthetic events stay quiet'
];
const report={version:'0.45',passed:true,emulatorUsed:false,browserUsed:false,androidRuntimeExecuted:false,actualNativeEngineExecuted:false,gameplayVerified:false,
 scope:'Focused actual-JavaScript source/VM controls checks only. No browser, Android/native gameplay, audible sound or touch-screen execution.',checks,checksPassed:checks.length,
 sources:paths.map(n=>({path:n,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex')})),recordedUTC:new Date().toISOString()};
fs.writeFileSync(path.join(root,'archive/game-controls-0.45-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checksPassed:checks.length,emulatorUsed:false,report:'archive/game-controls-0.45-checks.json'}));
