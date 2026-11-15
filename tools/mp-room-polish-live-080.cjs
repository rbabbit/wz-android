/* Observes real installed app/host state. All chat is confined to the private fixture. */
'use strict';
const q=require('./mp-live-080.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const stage=process.argv[2]||'inspect',name=process.argv[3]||'polish';
const w='document.getElementById("warzone-game-frame").contentWindow',native=w+'.PcMultiplayerNative';
async function paint(c){await c.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');}
async function capture(c,suffix,extra={}){await paint(c);const v=await c.evaluate(`({phase:PcMultiplayerSession.phase,active:document.activeElement.id,viewport:[innerWidth,innerHeight,visualViewport.height],root:document.getElementById('mp-room').getBoundingClientRect().toJSON(),room:PcMultiplayerRoomUI.report(),nativeRoom:${native}?.room,chat:{top:document.getElementById('mp-room-chat-log').scrollTop,height:document.getElementById('mp-room-chat-log').clientHeight,total:document.getElementById('mp-room-chat-log').scrollHeight},draft:document.getElementById('mp-room-chat-input').value,roster:getComputedStyle(document.querySelector('.mp-room-roster')).display,footer:getComputedStyle(document.querySelector('.mp-room-footer')).display})`);const file=name+'-'+suffix;fs.writeFileSync(path.join(q.out,file+'.json'),JSON.stringify({...v,observations:extra},null,2));q.screen(file);console.log(JSON.stringify({file,phase:v.phase,viewport:v.viewport,rootHeight:v.root.height,chat:v.chat,draft:v.draft,...extra}));return v;}
async function send(c,text){await c.tap('#mp-room-chat-input');await c.wait('document.activeElement.id==="mp-room-chat-input"','chat focused');await c.call('Input.insertText',{text});await c.wait(`document.getElementById('mp-room-chat-input').value===${JSON.stringify(text)}`,'typed actual draft');await c.tap('#mp-room-chat-send');await c.wait(`document.getElementById('mp-room-chat-input').value===''&&!PcMultiplayerRoomUI.report().pending`,'actual Send acknowledgement');}
async function drag(c,up){const b=await c.evaluate('document.getElementById("mp-room-chat-log").getBoundingClientRect().toJSON()');const x=b.left+b.width*.55,start=b.top+b.height*(up?.75:.25),end=b.top+b.height*(up?.25:.75);assert(b.height>35);await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:90,x,y:start,force:.6}]});for(let i=1;i<=10;i++){await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:90,x,y:start+(end-start)*i/10,force:.6}]});await q.delay(20);}await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await paint(c);}
(async()=>{const c=await q.connect();try{
 if(stage==='type'){
  await c.tap('#mp-room-chat-input');await c.wait('document.activeElement.id==="mp-room-chat-input"','chat focus');
  for(const s of ['Hello, ','testing chat ','in the waiting room.']){await c.call('Input.insertText',{text:s});await paint(c);}
  await c.wait('visualViewport.height<innerHeight-50||innerHeight<400','actual IME available area');
  const v=await capture(c,'typed');assert.equal(v.draft,'Hello, testing chat in the waiting room.');
  if(name!=='baseline'){assert.notEqual(v.roster,'none');assert.notEqual(v.footer,'none');}
  await c.tap('#mp-room-chat-send');await c.wait('document.getElementById("mp-room-chat-input").value===""&&!PcMultiplayerRoomUI.report().pending','real message sent');await capture(c,'sent');
 } else if(stage==='fill'){
  for(let i=0;i<7;i++){await send(c,'/help');await c.wait(`${native}.room.messages.filter(m=>m.text==='Command list:').length>=${i+1}`,'private host reply '+i);}
  await capture(c,'history-filled');
 } else if(stage==='scroll'){
  let v=await capture(c,'before-scroll');assert(v.chat.total>v.chat.height+50,'real chat history overflows');const before=v.chat.top;
  await drag(c,false);await c.wait(`document.getElementById('mp-room-chat-log').scrollTop<${before-15}`,'actual finger drag reads older messages');
  const old=await capture(c,'older-messages');
  const snap=await c.evaluate(`${native}.room.messages.at(-1).seq`);await send(c,'/admin');await c.wait(`${native}.room.messages.at(-1).seq>${snap}`,'new private host reply');
  v=await capture(c,'new-message-anchor');assert(v.chat.top<v.chat.total-v.chat.height-20,'new reply must not jump to newest while reading');
  await drag(c,true);await capture(c,'scrolled-newer',{priorOlderTop:old.chat.top});
 } else if(stage==='preview'){
  await c.tap('#mp-room-map-toggle');await c.wait(`!document.getElementById('mp-room-map-canvas').hidden&&${native}.room.mapPreview.status==='ready'`,'actual native map preview');
  const preview=await c.evaluate(`(()=>{const p=${native}.room.mapPreview,a=${native}.roomMapPreview(),canvas=document.getElementById('mp-room-map-canvas'),rgb=a.pixels,rgba=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let different=0,mismatch=0;for(let i=0;i<rgb.length;i++){if(rgb[i]!==rgb[0])different++;if(rgba[Math.floor(i/3)*4+i%3]!==rgb[i])mismatch++;}return{meta:p,width:canvas.width,height:canvas.height,bytes:rgb.length,different,mismatch}})()`);
  assert.equal(preview.bytes,preview.width*preview.height*3);assert.equal(preview.mismatch,0);assert(preview.different>100);await capture(c,'map-preview',{preview});
 } else if(stage==='roster'){
  await c.tap('#mp-room-chat-input');await c.wait('document.activeElement.id==="mp-room-chat-input"','inline typing focus');
  await c.wait('innerHeight<400','actual keyboard room height');
  const b=await c.evaluate('document.getElementById("mp-room-players").getBoundingClientRect().toJSON()'),before=await c.evaluate('({top:document.getElementById("mp-room-players").scrollTop,height:document.getElementById("mp-room-players").clientHeight,total:document.getElementById("mp-room-players").scrollHeight})');
  assert(before.total>before.height,'roster overflow under keyboard');const x=b.left+b.width*.5;
  await c.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:91,x,y:b.bottom-12,force:.6}]});for(let i=1;i<=8;i++){await c.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:91,x,y:b.bottom-12-(b.height-24)*i/8,force:.6}]});await q.delay(20);}await c.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await c.wait('document.getElementById("mp-room-players").scrollTop>5','real player roster scroll');await capture(c,'roster-scroll',{before});
 } else if(stage==='audio'){
  await c.evaluate(`(()=>{const old=HTMLMediaElement.prototype.play,ctx=new AudioContext(),streams=new WeakMap();window.__qa080Audio={ctx,samples:[],events:[],old};HTMLMediaElement.prototype.play=function(...args){if(this.src.endsWith('/game-controls/click.ogg')){const q=__qa080Audio;q.events.push({type:'play',src:this.src,volume:this.volume,at:performance.now()});let p=streams.get(this);if(!p){const stream=this.captureStream(),analyser=ctx.createAnalyser(),gain=ctx.createGain();gain.gain.value=0;p={stream,analyser,gain,source:null};streams.set(this,p);const attach=()=>{if(p.source||!stream.getAudioTracks().length)return;p.source=ctx.createMediaStreamSource(stream);p.source.connect(analyser);analyser.connect(gain);gain.connect(ctx.destination)};this.addEventListener('playing',attach);this.addEventListener('ended',()=>q.events.push({type:'ended',at:performance.now()}));p.attach=attach;}p.attach();ctx.resume();q.active=p;}return old.apply(this,args)};__qa080Audio.timer=setInterval(()=>{const q=__qa080Audio,p=q.active;if(!p?.source)return;const a=new Float32Array(p.analyser.fftSize);p.analyser.getFloatTimeDomainData(a);q.samples.push({peak:Math.max(...a.map(Math.abs)),rms:Math.sqrt(a.reduce((s,n)=>s+n*n,0)/a.length),context:ctx.state,tracks:p.stream.getAudioTracks().map(t=>t.readyState)});if(q.samples.length>800)q.samples.shift();},8);return true})()`);
  for(let i=0;i<10;i++){await c.tap(i%2===0?'#mp-room-map-toggle':'#mp-room-map-close');await q.delay(90);}
  await c.wait('__qa080Audio.samples.some(s=>s.peak>0.00001&&s.context==="running")','actual click decoded PCM');
  const audio=await c.evaluate('({events:__qa080Audio.events,samples:__qa080Audio.samples.filter(s=>s.peak>0.00001),sound:PcMultiplayerRoomUI.report().sound,physicalSpeakerMonitored:false,method:"Unmodified actual Audio playback captureStream into zero-gain observer analyser"})');
  await capture(c,'audio',{audio});
  await c.evaluate('(()=>{clearInterval(__qa080Audio.timer);HTMLMediaElement.prototype.play=__qa080Audio.old;__qa080Audio.ctx.close();delete window.__qa080Audio;return true})()');
 } else if(stage==='audio-direct'){
  await c.evaluate(`(()=>{const prev=window.__qa080Audio;if(prev){clearInterval(prev.timer);HTMLMediaElement.prototype.play=prev.old;prev.ctx.close();delete window.__qa080Audio;}const old=HTMLMediaElement.prototype.play,ctx=new AudioContext(),seen=new WeakMap();window.__qa080Direct={old,ctx,samples:[],events:[]};HTMLMediaElement.prototype.play=function(...args){if(this.src.endsWith('/game-controls/click.ogg')){const q=__qa080Direct;q.events.push({src:this.src,volume:this.volume,duration:this.duration});if(!seen.has(this)){const source=ctx.createMediaElementSource(this),analyser=ctx.createAnalyser();source.connect(analyser);analyser.connect(ctx.destination);seen.set(this,{source,analyser});}q.active=seen.get(this);ctx.resume();}return old.apply(this,args)};__qa080Direct.timer=setInterval(()=>{const q=__qa080Direct;if(!q.active)return;const a=new Float32Array(q.active.analyser.fftSize);q.active.analyser.getFloatTimeDomainData(a);q.samples.push({peak:Math.max(...a.map(Math.abs)),rms:Math.sqrt(a.reduce((s,n)=>s+n*n,0)/a.length),context:ctx.state});if(q.samples.length>1000)q.samples.shift();},4);return true})()`);
  for(let i=0;i<8;i++){await c.tap(i%2===0?'#mp-room-map-toggle':'#mp-room-map-close');await q.delay(100);}
  await c.wait('__qa080Direct.samples.some(s=>s.peak>0.00001&&s.context==="running")','actual element decoded click PCM');
  const audio=await c.evaluate('({events:__qa080Direct.events,samples:__qa080Direct.samples.filter(s=>s.peak>0.00001),sound:PcMultiplayerRoomUI.report().sound,physicalSpeakerMonitored:false,method:"Actual HTMLAudioElement routed through MediaElementAudioSource analyser to original destination; no synthesized audio source"})');await capture(c,'audio',{audio});
  await c.evaluate('(()=>{clearInterval(__qa080Direct.timer);HTMLMediaElement.prototype.play=__qa080Direct.old;return true})()');
 } else if(stage==='mute'){
  const before=await c.evaluate('PcMultiplayerRoomUI.report().sound.sounds');
  await c.child('(()=>{const m=LaunchedModule,p=m.WZVAL_configDirPath+"/config",text=m.FS.readFile(p,{encoding:"utf8"});window.__qa080OriginalConfig=text;m.FS.writeFile(p,text.replace(/^voicevol\\s*=.*$/m,"voicevol=0"));return true})()');
  try{await c.tap('#mp-room-map-toggle');await c.tap('#mp-room-map-close');const after=await c.evaluate('PcMultiplayerRoomUI.report().sound.sounds');assert.equal(after,before);await capture(c,'muted',{before,after});}
  finally{await c.child('(()=>{const m=LaunchedModule;m.FS.writeFile(m.WZVAL_configDirPath+"/config",window.__qa080OriginalConfig);delete window.__qa080OriginalConfig;return true})()');}
 } else if(stage==='inspect')await capture(c,'inspect');
 else throw Error('unknown stage');
}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
