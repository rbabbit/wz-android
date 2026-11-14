'use strict';
const q=require('./mp-live-070.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const stage=process.argv[2]||'join';
(async()=>{const c=await q.connect();const read=expr=>c.child(expr);try{
 if(stage==='join'||stage==='join-only'){
  await c.wait('document.querySelectorAll(".room").length>0','live rooms');
  const p=await c.evaluate(`(()=>{const r=[...document.querySelectorAll('.room')].find(e=>/1 vs A[lI] Bots Battle/i.test(e.textContent));if(!r)throw Error('Bot room is absent');const b=r.querySelector('button').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()`);
  await c.touch(p.x,p.y);await c.wait('PcMultiplayerSession.active','join request');await c.save('journey-joining');
  await c.wait('PcMultiplayerSession.phase==="room"','rendered waiting room',25000);
  const first=await c.evaluate('PcMultiplayerSession.report().sockets[0].id');let v=await read('({w:innerWidth,h:innerHeight})');
  await c.touch((v.w-640)/2+572,(v.h-480)/2+131);
  await c.wait(`PcMultiplayerSession.phase==='room'&&PcMultiplayerSession.report().sockets.some(s=>s.id!==${first})`,'transferred room',20000);
  await c.wait(`PcMultiplayerSession.events.some(e=>/File has been received|MAP DOWNLOADED/.test(e.detail||''))`,'map download or cached map',6500).catch(()=>{});
  await c.save('journey-match-room');v=await read('({w:innerWidth,h:innerHeight,player:PcMultiplayerNative.state.player})');
  // Ready row observed in the native room screenshot; use its actual local slot.
  await c.touch((v.w-640)/2+584,(v.h-480)/2+43+38*v.player);
  await c.wait('PcMultiplayerSession.phase==="game"','first rendered world',25000);
  await c.wait('document.querySelector("#warzone-game-frame").contentWindow.__warzoneCommands?.report().snapshot && document.querySelector("#warzone-game-frame").contentWindow.__blockNightResearch?.report().catalogCount>1','native command/research snapshots',8000);
  const value=await c.save('journey-world');assert.equal(value.native.state.protocolMajor,16384);assert.equal(value.native.state.protocolMinor,104);assert.equal(value.native.state.playerName,'noobcrusher');assert.equal(value.commands.snapshot.player,value.native.state.player);assert.equal(value.session.loadingCoverVisible,false);
  console.log('PASS real join, transfer, ready, protocol, identity, world frame and native UI snapshots');
 }
 if(stage==='join'||stage==='menus'){
  await c.wait('document.querySelector("#warzone-game-frame").contentWindow.__warzoneCommands?.report().snapshot && document.querySelector("#warzone-game-frame").contentWindow.__blockNightResearch?.report().catalogCount>1','actual native UI snapshot readiness',10000);
  if(!await read('__blockNightResearch.report().open'))await c.tap('#blocknight-tech');await c.wait('document.querySelector("#warzone-game-frame").contentWindow.__blockNightResearch.report().open','Research opens');
  await c.wait(`document.querySelector('#warzone-game-frame').contentDocument.querySelectorAll('#blocknight-research-shell [data-topic-id]:not([disabled])').length>=2`,'available research rows render',6000);
  const topics=await read(`[...document.querySelectorAll('#blocknight-research-shell [data-topic-id]')].filter(e=>!e.disabled).slice(0,2).map(e=>e.dataset.topicId)`);
  assert.equal(topics.length,2);for(const id of topics)await c.tap('[data-topic-id='+JSON.stringify(id)+']',true);
  assert.equal((await read('__blockNightResearch.report().selectedTopicIds')).length,2);
  await c.tap('.bn-tech-assign',true);
  await c.wait('document.querySelector("#warzone-game-frame").contentWindow.__blockNightResearch.report().commandAcks>0','native research queue acknowledgement',6500);
  const research=await c.save('journey-research-queued');assert.equal(research.research.commandRejects,0);assert.ok(research.research.queueAdds>=2);
  await c.tap('#blocknight-tech');await c.wait('!document.querySelector("#warzone-game-frame").contentWindow.__blockNightResearch.report().open','Research toggles closed');
  await c.tap('#wt-open-factory');await c.wait('document.querySelector("#warzone-game-frame").contentWindow.__warzoneCommands.report().page==="factory"','Manufacturing opens');
  await c.save('journey-manufacturing');
  console.log(JSON.stringify({stage:'research-pass-manufacturing-open',topics,research:{acks:research.research.commandAcks,queues:research.research.queues,labs:research.research.labs},buttons:await c.evaluate(`[...document.querySelectorAll('#wt-page-content button')].map(b=>({text:b.innerText,data:{...b.dataset},disabled:b.disabled})).slice(-24)`)}));
 }
 if(stage==='join'||stage==='production'){
  const page=await read('__warzoneCommands.report().page');if(page!=='factory')await c.tap('#wt-open-factory');
  await c.wait('document.querySelector("#warzone-game-frame").contentWindow.__warzoneCommands.report().page==="factory"','Manufacturing');
  await c.tap('[data-factory-family="vehicle"]');
  const before=await read('__warzoneCommands.report().history.length');
  await c.tap('[data-count="20"]');await c.tap('.wt-factory-produce:not([disabled])');
  await c.wait(`document.querySelector('#warzone-game-frame').contentWindow.__warzoneCommands.report().history.slice(${before}).some(r=>r.action==='queue-production'&&r.ok)`,'production queue accepted',6000);
  await c.tap('#wt-open-queue');
  await c.wait(`document.querySelector('[data-production-cancel-ids]:not([data-production-cancel-current])')`,'waiting unit cancel control',3000);
  await c.tap('[data-production-cancel-ids]:not([data-production-cancel-current])');
  await c.wait(`document.querySelector('#warzone-game-frame').contentWindow.__warzoneCommands.report().history.slice(${before}).some(r=>['cancel-production','remove-production'].includes(r.action)&&r.ok)`,'native production cancellation',6000);
  const proof=await c.save('journey-production-cancelled');
  console.log(JSON.stringify({stage:'production-cancel',history:proof.commands.history.slice(-5),factories:proof.commands.snapshot.factories.filter(f=>f.active||f.queue.length)}));
  await c.tap('#wt-open-queue');await c.wait("(()=>{const b=document.querySelector('#wt-open-build')?.getBoundingClientRect();return b&&b.width>0&&b.height>0;})()",'Build footer is visible');await c.tap('#wt-open-build');
  await c.wait('document.querySelector("#warzone-game-frame").contentWindow.__warzoneCommands.report().buildOpen','Build opens');
  await c.wait('!document.querySelector("#warzone-game-frame").contentWindow.__warzoneCommands.report().selectingTrucks','visible trucks selected',10000);
  const build=await c.save('journey-build-selection');console.log(JSON.stringify({group:build.commands.nativeBuildGroup,selection:build.commands.truckSelection,buttons:await c.evaluate(`[...document.querySelectorAll('#wt-build-sidebar button')].slice(0,14).map(b=>({text:b.innerText,data:{...b.dataset}}))`)}));
  assert.ok(build.commands.nativeBuildGroup.length>0,'BUILD must highlight actual visible trucks');
 }
}catch(error){try{await c.save('journey-failure-'+stage);}catch{}throw error;}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
