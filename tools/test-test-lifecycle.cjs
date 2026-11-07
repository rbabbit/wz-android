'use strict';
// Code regressions for the HTML lifecycle. Emulator gameplay is verified separately.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base='app/src/main/assets/';
function harness(){
 const listeners=new Map(),calls=[],pending=[];
 const frame={inert:false,hidden:false,contentWindow:null},header={hidden:false};
 const nodes={'warzone-game-frame':frame,'warzone-command-strip':header,'lab-ops':{hidden:false},'warzone-towers-help-overlay':{hidden:false,querySelector:()=>({click(){}})}};
 const document={body:{dataset:{},scrollTop:0,scrollLeft:0},documentElement:{scrollTop:0,scrollLeft:0},getElementById:id=>nodes[id]||null};
 const w={document,location:{search:'?battle_session=test-session'},URLSearchParams,console:{log(){},warn(){},error(){}},CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail}},Event:class{constructor(type){this.type=type}},scrollX:0,scrollY:0,scrollTo(){},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event)},BlockNightAndroid:{confirmReturnToMainMenu:s=>calls.push(['menu',s]),battleExited:s=>calls.push(['exit',s]),battleFinished:s=>calls.push(['lost',s]),battleWon:s=>calls.push(['won',s])},__kalaWarzoneTouch:{setBattleActive:v=>calls.push(['input',v]),releaseAll:()=>false,nativePressKey:k=>calls.push(['key',k])},WarzoneBuildDisplay:{reset:()=>calls.push(['clear-ghosts'])},LaunchedModule:{pauseMainLoop:()=>{throw Error('Back must not pause the public engine loop')},resumeMainLoop:()=>{throw Error('Back must not resume the public engine loop')},wzSaveConfigDirToPersistentStore:fn=>pending.push(fn)}};
 w.window=w;w.parent=w;frame.contentWindow=w;
 const ctx=vm.createContext(w),html=fs.readFileSync(base+'warzone/mobile.html','utf8');
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],ctx);
 vm.runInContext(fs.readFileSync(base+'warzone-html-session.js','utf8'),ctx);
 const output=text=>w.dispatchEvent(new w.CustomEvent('blocknight-engine-output',{detail:{text}}));
 const wave=phase=>output('BNWAVE:'+JSON.stringify({mode:'tower-defense',phase,gameTime:1000}));
 return {w,calls,pending,frame,header,document,wave,output};
}
(async()=>{
 const h=harness();
 assert.equal(h.w.WarzoneHost.restoreBattlefield(),false,'a cached restore cannot expose pre-battle frontend');
 h.wave('countdown');assert.equal(h.w.__towersHtml.isActive(),true);assert.equal(h.document.body.dataset.playing,'true');
 h.output('main | GAMECODE_LOADGAME');assert.equal(h.w.__towersHtml.isActive(),true,'load transition is not treated as quit');
 h.document.getElementById('warzone-towers-help-overlay').hidden=true;
 await h.w.__towersHtml.back();assert.equal(h.calls.filter(c=>c[0]==='key').length,0,'ordinary Back never opens the native pause menu');
 assert.equal(h.w.__towersHtml.isActive(),true,'opening the return confirmation does not end a battle');
 assert.equal(h.calls.filter(c=>c[0]==='menu').length,1);
 await h.w.__towersHtml.back();assert.equal(h.calls.filter(c=>c[0]==='menu').length,1,'repeated requests cannot duplicate the dialog');
 assert.equal(h.w.__towersHtml.cancelMainMenuReturn('stale-session'),false,'stale cancellation cannot affect current play');
 assert.equal(h.w.__towersHtml.cancelMainMenuReturn('test-session'),true);
 assert.equal(h.w.__towersHtml.cancelMainMenuReturn('test-session'),false,'cancel only consumes the current dialog request once');
 h.w.__kalaWarzoneTouch.releaseAll=()=>true;
 await h.w.__towersHtml.back();assert.equal(h.calls.filter(c=>c[0]==='key').length,0,'a tool cancellation does not add an Escape');assert.equal(h.calls.filter(c=>c[0]==='menu').length,1);
 h.output('main | GAMECODE_QUITGAME');
 assert.equal(h.w.__towersHtml.isEnded(),true);assert.equal(h.frame.inert,true);assert.equal(h.header.hidden,true);assert.equal(h.document.body.dataset.battleEnded,'true');
 assert.equal(h.w.WarzoneHost.restoreBattlefield(),false,'late restore cannot expose the frontend');
 assert.equal(h.pending.length,1,'ordinary quit flushes saves/config before native return');
 assert.equal(h.calls.filter(c=>c[0]==='exit').length,0);h.pending.shift()();
 h.output('main | GAMECODE_QUITGAME');h.wave('countdown');h.w.__towersHtml.finish(false);
 assert.deepEqual(h.calls.filter(c=>['exit','lost','won'].includes(c[0])),[['exit','test-session']],'quit is neutral, terminal and emitted once');
 const menu=harness();menu.wave('countdown');menu.document.getElementById('warzone-towers-help-overlay').hidden=true;
 await menu.w.__towersHtml.back();assert.equal(menu.w.__towersHtml.returnToMainMenu('old-session'),false);
 assert.equal(menu.w.__towersHtml.returnToMainMenu('test-session'),true);assert.equal(menu.w.__towersHtml.report().exitReason,'main-menu');
 assert.equal(menu.frame.inert,true);assert.equal(menu.header.hidden,true);assert.equal(menu.pending.length,1,'confirmed return flushes saves before Android unload');
 assert.equal(menu.calls.filter(c=>c[0]==='exit').length,0);
 assert.equal(menu.w.__towersHtml.cancelMainMenuReturn('test-session'),false);assert.equal(menu.w.__towersHtml.returnToMainMenu('test-session'),false);
 menu.pending.shift()();assert.deepEqual(menu.calls.filter(c=>c[0]==='exit'),[['exit','test-session']]);
 for(const [phase,label]of [['defeated','lost'],['victory','won']]){
  const g=harness();g.wave(phase);g.output('main | GAMECODE_QUITGAME');g.wave(phase);
  assert.deepEqual(g.calls.filter(c=>['exit','lost','won'].includes(c[0])),[[label,'test-session']],'only a native result packet reports '+phase);
 }
 const f=harness();f.wave('countdown');f.output('error | Trying to load Game QuickSave failed!');assert.equal(f.w.__towersHtml.report().exitReason,'load-failed');
 const nativeConsole=harness();nativeConsole.wave('countdown');nativeConsole.w.console.log('main | GAMECODE_QUITGAME');assert.equal(nativeConsole.w.__towersHtml.isEnded(),true,'EM_LOG_CONSOLE is observed synchronously');
 const nativeResult=harness();nativeResult.w.console.log('script | BNWAVE:'+JSON.stringify({mode:'tower-defense',phase:'victory'}));nativeResult.w.console.log('main | GAMECODE_QUITGAME');assert.deepEqual(nativeResult.calls.filter(c=>['exit','lost','won'].includes(c[0])),[['won','test-session']],'native console result is observed before its immediate quit transition');
 console.log('PASS: authoritative lifecycle, save flush, guarded restore and session-scoped Cancel/Return confirmation without native Escape (code checks only)');
})().catch(error=>{console.error(error);process.exitCode=1});
