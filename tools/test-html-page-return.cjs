'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/src/main/assets/warzone-command-pages.js','utf8');
const closeSource=source.slice(source.indexOf('  function close(){'),source.indexOf('  async function openSidebar(){'));
function setup(nativeMenu=''){
 const frame={inert:true},content={scrollTop:71,dataset:{}},page={hidden:false,contains:()=>false},calls=[];
 const nodes={'warzone-game-frame':frame,'wt-page-content':content,'wt-command-pages':page};
 const state={page:'factory',scroll:{},closes:0,nativeMenu,nativeMenuPending:Boolean(nativeMenu)};
 const context=vm.createContext({state,Promise,element:id=>nodes[id],rememberPanelScroll(){},doc:{body:{dataset:{commandPage:'factory'}}},
  window:{__kalaWarzoneTouch:{releaseAll:()=>calls.push('release')}},host:{WarzoneHost:{restoreBattlefield:()=>calls.push('restore')}},document:{getElementById:()=>({focus:()=>calls.push('focus')})},
  send(){throw Error('An HTML-only return must not send or await a native-menu command');},closeNative:()=>{calls.push('native-close');return new Promise(()=>{});}});
 vm.runInContext(closeSource,context);return{state,frame,page,calls,context};
}
(async()=>{
 const html=setup();await html.context.close();
 assert.equal(html.state.page,'');assert.equal(html.page.hidden,true);assert.equal(html.frame.inert,false,'paused Factory Back restores real battlefield touch input immediately');
 assert.equal(html.state.scroll.factory,71,'normal page scroll preference remains');assert.deepEqual(html.calls,['release','restore','focus']);
 const native=setup('stats');await native.context.close();assert.equal(native.frame.inert,false,'a genuinely pending native close cannot hold the HTML iframe inert while paused');
 assert.equal(native.calls.filter(c=>c==='native-close').length,1,'a tracked native panel receives one ordered close');
 const count=native.calls.length;await native.context.close();assert.equal(native.calls.length,count,'repeated Back on an already closed HTML page adds no extra native command');
 const openSource=source.slice(source.indexOf('  function open(page='),source.indexOf('  function close(){'));
 assert.equal(openSource.includes("send('native-menu',{menu:'close'})"),false,'opening an HTML page does not add an untracked native close request');
 console.log('PASS: paused HTML page return restores iframe input/focus without a native acknowledgement; tracked native close stays ordered and independent');
})().catch(error=>{console.error(error);process.exitCode=1;});
