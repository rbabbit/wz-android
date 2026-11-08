'use strict';
// Execute current lifecycle/driver code. This models transport and DOM ownership;
// actual field layout, camera consumption and native play require the emulator.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const base='app/src/main/assets/';
class Node{
 constructor(tag){this.tagName=tag;this.children=[];this.parentNode=null;this.hidden=false;this.attributes={};this.dataset={};this.textContent='';this.className='';}
 append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
 appendChild(n){this.append(n);return n;}
 setAttribute(name,value){this.attributes[name]=value;}
 get isConnected(){return Boolean(this.root||this.parentNode?.isConnected);}
 all(){return this.children.flatMap(c=>[c,...c.all()]);}
 querySelector(selector){let nodes=[this];for(const part of selector.split(' ')){const matches=n=>part.startsWith('.')?n.className.split(' ').includes(part.slice(1)):part.startsWith('#')?n.id===part.slice(1):n.tagName===part;nodes=nodes.flatMap(n=>n.all().filter(matches));}return nodes[0]||null;}
}
function document(){const body=new Node('body'),head=new Node('head');body.root=head.root=true;return {body,head,createElement:tag=>new Node(tag),getElementById:id=>[head,body,...head.all(),...body.all()].find(n=>n.id===id)||null};}
function harness(options={}){
 const doc=document(),outer=document(),listeners=new Map(),timeouts=[],intervals=[],calls=[],pending=[],mutations=[];
 const header=outer.createElement('header');header.id='warzone-command-strip';outer.body.append(header);
 const frame=outer.createElement('iframe');frame.id='warzone-game-frame';outer.body.append(frame);
 let log=Buffer.from(options.oldLog||'');
 const FS={readdir:()=>['engine.log'],stat:()=>({size:log.length}),open:()=>1,close(){},read(fd,out,offset,count,position){const bytes=log.subarray(position,position+count);out.set(bytes,offset);return bytes.length;}};
 const touch={cameraFacingPending:false,cameraFacingError:''};
 const config=options.config===null?undefined:options.config||Object.freeze({mode:'duel',humanBranch:'cannon',botBranch:'rockets'});
 const host={document:outer,WarzoneHost:{setPlaying(){outer.body.dataset.playing='true';},endBattle(){header.hidden=true;frame.inert=true;outer.body.dataset.battleEnded='true';},restoreBattlefield(){calls.push(['restore']);return true;}}};
 const w={document:doc,parent:host,__warzoneDuelConfig:config,location:{search:'?battle_session=duel-session'},URLSearchParams,TextDecoder,Uint8Array,JSON,Date,
  console:{log(){},warn(){},error(){}},CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
  setTimeout:(fn,ms)=>{timeouts.push({fn,ms});return timeouts.length;},setInterval:(fn,ms)=>{const timer={fn,ms,cleared:false};intervals.push(timer);return timer;},clearInterval:timer=>timer.cleared=true,
  MutationObserver:class{constructor(fn){this.fn=fn;mutations.push(this);}observe(){}disconnect(){this.closed=true;}},
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);},
  BlockNightAndroid:{battleWon:s=>calls.push(['won',s]),battleFinished:s=>calls.push(['lost',s]),battleExited:s=>calls.push(['exit',s]),confirmReturnToMainMenu:s=>calls.push(['menu',s])},
  __kalaWarzoneTouch:{setBattleActive:v=>calls.push(['input',v]),releaseAll:()=>false,faceOpponent:id=>{calls.push(['face',id]);return true;},report:()=>({...touch})},
  WarzoneBuildDisplay:{reset:()=>calls.push(['ghost-reset'])},LaunchedModule:{FS,WZVAL_configDirPath:'/duel-cannon',wzSaveConfigDirToPersistentStore:fn=>pending.push(fn)}};
 w.window=w;frame.contentWindow=w;const context=vm.createContext(w);
 vm.runInContext(fs.readFileSync(base+'warzone-html-session.js','utf8'),context);
 vm.runInContext(fs.readFileSync(base+'warzone-duel-ui.js','utf8'),context);
 const packet=(changes={})=>({version:1,mode:'duel',phase:'active',gameTime:1000,player:0,enemyPlayer:1,humanBranch:config?.humanBranch||'cannon',botBranch:config?.botBranch||'rockets',humanHQ:{alive:true,health:93,x:18,y:65},enemyHQ:{alive:true,x:18,y:7},...changes});
 const output=text=>w.dispatchEvent(new w.CustomEvent('blocknight-engine-output',{detail:{text}}));
 return {w,context,doc,outer,header,frame,calls,pending,timeouts,intervals,mutations,touch,packet,output,send:changes=>output('BNDUEL:'+JSON.stringify(packet(changes))),append:bytes=>{log=Buffer.concat([log,Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes)]);},poll:()=>w.__warzoneDuel.pollOutput()};
}
const outcomes=h=>h.calls.filter(c=>['won','lost','exit'].includes(c[0]));
function helpMarkup(config){
 const source=fs.readFileSync(base+'warzone-touch-controls.js','utf8'),stop=Error('captured actual guide markup');let markup='';
 const doc={getElementById:()=>null,createElement(tag){const n=new Node(tag);if(tag==='section')Object.defineProperty(n,'innerHTML',{set(value){markup=value;throw stop;}});return n;}};
 const context=vm.createContext({state:{battleActive:true},window:{__warzoneDuelConfig:config,__warzoneCommands:{close(){},closeNative(){}}},commandDocument:()=>doc});
 vm.runInContext(source.slice(source.indexOf('  function showHelp()'),source.indexOf('  function beginSingle(')),context);
 assert.throws(()=>context.showHelp(),error=>error===stop);return markup;
}
(async()=>{
 for(const config of [null,{mode:'duel',humanBranch:'cannon',botBranch:'rockets'},Object.freeze({mode:'tower-defense'})]){
  const h=harness({config});assert.equal(h.w.__warzoneDuel,undefined,'only immutable explicit Duel config installs its driver');assert.equal(h.w.__warzoneTowersWaves,undefined);
  h.output('BNDUEL:'+JSON.stringify(h.packet({phase:'victory'})));assert.equal(h.w.__towersHtml.isActive(),false);assert.deepEqual(outcomes(h),[],'Duel packets cannot finish a default Towers session');
  h.output('BNWAVE:'+JSON.stringify({mode:'tower-defense',phase:'countdown'}));assert.equal(h.w.__towersHtml.isActive(),true,'default Towers activation remains intact');
 }
 const h=harness();assert.equal(h.w.__warzoneDuel.report().active,false);
 h.output('BNWAVE:'+JSON.stringify({mode:'tower-defense',phase:'victory'}));h.send({humanBranch:'rockets',botBranch:'cannon'});assert.equal(h.w.__towersHtml.isActive(),false);assert.deepEqual(outcomes(h),[]);
 h.send();assert.equal(h.w.__towersHtml.isActive(),true);assert.equal(h.w.__warzoneDuel.report().active,true);
 const hud=h.outer.getElementById('warzone-duel-status');assert.equal(hud.hidden,false);assert.equal(hud.querySelector('.duel-title').textContent,'CANNON · 0:01');assert.equal(hud.querySelector('.duel-detail').textContent,'HQ 93% · opponent: Rockets');
 assert.equal(h.outer.getElementById('warzone-towers-wave-hud'),null);assert.equal(h.outer.getElementById('warzone-towers-next-wave'),null,'Duel creates no wave or Skip Wave controls');
 const updates=h.w.__warzoneDuel.report().updates;h.w.console.log('BNDUEL:'+JSON.stringify(h.packet()));assert.equal(h.w.__warzoneDuel.report().updates,updates,'stdout and console copies are consumed once');
 const shell=h.doc.createElement('section');shell.id='blocknight-research-shell';const brand=h.doc.createElement('div');brand.className='bn-tech-brand';const subtitle=h.doc.createElement('small');brand.append(subtitle);shell.append(brand);h.doc.body.append(shell);h.mutations.forEach(m=>m.fn());
 assert.equal(subtitle.textContent,'CANNON + SHARED TECHNOLOGY','new research shells retain the selected native branch plus shared technology heading');
 assert.equal(h.w.__warzoneDuel.faceOpponent(),true);assert.deepEqual(h.calls.find(c=>c[0]==='face'),['face','td1']);assert.equal(h.w.__warzoneDuel.report().cameraReady,true);
 h.touch.cameraFacingPending=true;assert.equal(h.w.__warzoneDuel.report().cameraReady,false);h.touch.cameraFacingPending=false;h.touch.cameraFacingError='unconsumed';assert.equal(h.w.__warzoneDuel.report().cameraReady,false);
 await h.w.__towersHtml.back();assert.equal(h.w.__towersHtml.cancelMainMenuReturn('old-session'),false);assert.equal(h.w.__towersHtml.cancelMainMenuReturn('duel-session'),true);assert.equal(h.w.__towersHtml.isActive(),true);
 await h.w.__towersHtml.back();assert.equal(h.w.__towersHtml.returnToMainMenu('duel-session'),true);assert.equal(h.frame.inert,true);assert.equal(hud.hidden,true);assert.equal(h.pending.length,1);assert.deepEqual(outcomes(h),[],'confirmed Return flushes saves before unloading');h.pending.shift()();assert.deepEqual(outcomes(h),[['exit','duel-session']]);
 h.send({phase:'victory'});assert.deepEqual(outcomes(h),[['exit','duel-session']],'a late result cannot change an already retired neutral session');
 for(const phase of ['victory','defeated']){
  const terminal=harness();terminal.send();terminal.w.console.log('BNDUEL:'+JSON.stringify(terminal.packet({phase})));terminal.w.console.log('main | GAMECODE_QUITGAME');terminal.send({phase:phase==='victory'?'defeated':'victory'});terminal.send();
  assert.deepEqual(outcomes(terminal),[[phase==='victory'?'won':'lost','duel-session']]);assert.equal(terminal.w.__warzoneDuel.report().snapshot.phase,phase,'terminal status cannot be replaced by a late packet');assert.equal(terminal.header.hidden,true);
 }
 const old=harness({oldLog:'BNDUEL:'+JSON.stringify(h.packet({phase:'defeated'}))+'\n'});old.poll();assert.deepEqual(outcomes(old),[],'persisted previous-game packets are skipped');
 const line=Buffer.from('BNDUEL:'+JSON.stringify(old.packet({diagnostic:'Cañón'}))+'\n'),cut=line.indexOf(Buffer.from('ñ'))+1;
 old.append(line.subarray(0,cut));old.poll();assert.equal(old.w.__towersHtml.isActive(),false,'partial packets cannot activate play');old.append(line.subarray(cut));old.poll();assert.equal(old.w.__towersHtml.isActive(),true,'streaming UTF8 and line fragments reassemble the authoritative packet');
 old.append('noise\n'.repeat(50000));const bytes=old.w.__warzoneDuel.report().readBytes;old.poll();assert.ok(old.w.__warzoneDuel.report().readBytes-bytes<=128*1024,'the reader bounds work per poll');old.poll();old.poll();old.append('BNDUEL:'+JSON.stringify(old.packet({phase:'victory'}))+'\n');old.w.__warzoneDuel.engineExited();assert.deepEqual(outcomes(old),[['won','duel-session']],'engine exit reads pending native results before neutral fallback');
 const rockets=harness({config:Object.freeze({mode:'duel',humanBranch:'rockets',botBranch:'cannon'})});rockets.send({humanHQ:{alive:true,health:100,y:7},enemyHQ:{alive:true,y:65}});assert.equal(rockets.w.__warzoneDuel.faceOpponent(),true);assert.deepEqual(rockets.calls.find(c=>c[0]==='face'),['face','td2']);
 assert.equal(rockets.w.__warzoneTowersWaves.report().snapshot.mode,'duel','shared build timing receives the real Duel native clock');
 const duelGuide=helpMarkup(rockets.w.__warzoneDuelConfig);assert.ok(duelGuide.includes('Your weapon branch is <b>Rockets</b>'));assert.ok(duelGuide.includes('opponent uses <b>Cannon</b>'));assert.ok(duelGuide.includes('Aircraft are unavailable'));assert.ok(!duelGuide.includes('SKIP WAVE')&&!duelGuide.includes('30 rounds')&&!duelGuide.includes('3 minutes'));
 const towersGuide=helpMarkup(undefined);assert.ok(towersGuide.includes('SKIP WAVE')&&towersGuide.includes('30 rounds')&&towersGuide.includes('3 minutes'),'Towers keeps its own existing guide');
 rockets.w.dispatchEvent(new rockets.w.CustomEvent('pagehide'));assert.ok(rockets.intervals.every(t=>t.cleared));assert.ok(rockets.mutations.every(m=>m.closed));
 console.log('PASS: immutable mode isolation, native Duel lifecycle/results, bounded stale-safe streaming logs, branch labels, compact wave-free status, camera delegation and session-scoped Cancel/Return');
})().catch(error=>{console.error(error);process.exitCode=1;});
