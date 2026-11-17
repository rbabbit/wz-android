"use strict";
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),child=require('node:child_process');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets');
const read=name=>fs.readFileSync(path.join(assets,name),'utf8').replace(/\r\n/g,'\n');
const source=read('warzone-command-pages.js'),session=read('multiplayer/session.js');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),checks=[];
function between(s,a,b){const start=s.indexOf(a),end=s.indexOf(b,start);assert(start>=0&&end>start,a);return s.slice(start,end);}
function fn(s,name){const match=new RegExp('^  (?:async )?function '+name+'\\(','m').exec(s);assert(match,name);const rest=s.slice(match.index+match[0].length),next=/^  (?:async )?function /m.exec(rest);return s.slice(match.index,next?match.index+match[0].length+next.index:s.length).trim();}
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
function fixture(){
 let now=0,id=0,serial=0,autoAck=null;const files=new Map(),timers=new Map(),writes=[],notices=[];
 const packet={schemaVersion:91,context:'players-context-1',frame:1,gameTime:1000,realTime:1000,ready:true,mode:'multiplayer',viewer:{realPlayer:0,viewedPlayer:0,role:'player',ownsViewedPlayer:true,canIssueOrders:true},capabilities:{readOnly:true,teamMode:false,fullSpectatorStats:false,legacyPlayers:true,legacySpectatorStats:false},players:[{id:0,position:0,name:'You',kind:'human',state:'active',allocated:true,human:true,local:true,host:true,colorRGB:[0,128,255],team:null,stats:{score:0,kills:2,units:3,structures:null,power:100,pingMs:null},observerDetails:null}],spectators:[],nativeMenu:{players:false,spectatorStats:false}};
 const module={calledRun:true,FS:{readFile:name=>{if(name==='/tmp/warzone-players-v91.json')return JSON.stringify(packet);if(files.has(name))return files.get(name);throw Error('ENOENT');},writeFile:(name,value)=>files.set(name,value),rename:(a,b)=>{files.set(b,files.get(a));files.delete(a);const request=JSON.parse(files.get(b));writes.push(request);if(autoAck&&request.action!=='cancel')files.set('/tmp/warzone-players-nav-result-v91.json',JSON.stringify({nonce:request.nonce,context:request.context,action:request.action,ok:true,nativeMenu:autoAck}));}}};
 const nodes=new Map(),node=()=>({hidden:true,disabled:false,textContent:'',scrollTop:0,innerHTML:'',querySelector:()=>null});nodes.set('wt-page-content',node());nodes.set('wt-players-native-back',node());
 const state={page:'players'},doc={body:{dataset:{}},activeElement:null};const win={__towersHtml:{session:'world1'}};
 const context=vm.createContext({state,window:win,doc,performance:{now:()=>now},module:()=>module,playersSession:()=>win.__towersHtml.session,element:name=>nodes.get(name)||null,
  close:async()=>{state.page='';},notify:text=>notices.push(text),setTimeout:(callback,ms)=>{const key=++id;timers.set(key,{callback,at:now+ms});return key;},Promise,Set,Map,JSON,Number,Math,Date,
  pause:ms=>new Promise(resolve=>{const key=++id;timers.set(key,{callback:resolve,at:now+ms});})});
 vm.runInContext(source.match(/^  const esc =.*$/m)[0]+'\n'+fn(source,'button')+'\n'+between(source,'  const playersState=','  function install(){')+'\n'+fn(source,'onClick')+'\nthis.api={packet:playersPacket,render:renderPlayers,details:playersObserverDetails,valid:validPlayersPacket,paint:paintPlayers,navigate:navigatePlayers,poll:pollPlayers,cancel:cancelPlayersNavigation,pointer:playersPointer,keyboard:playersKeyboard,change:changePlayersView,tabs:playersTabs,click:onClick,state:playersState};',context);
 async function advance(ms){const end=now+ms;for(let j=0;j<20;j++)await Promise.resolve();for(let n=0;n<10000;n++){const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;timers.delete(next[0]);now=next[1].at;next[1].callback();for(let j=0;j<20;j++)await Promise.resolve();}now=end;for(let j=0;j<20;j++)await Promise.resolve();}
 function fresh(){context.api.packet();packet.frame++;packet.gameTime+=1000;packet.realTime+=1000;return context.api.packet();}
 return{context,api:context.api,packet,module,win,doc,state,nodes,writes,notices,advance,fresh,ack(value){autoAck=value;},files};
}
function interactiveFixture(f){
 const content=f.nodes.get('wt-page-content');let html='',table=null,view=null,replacements=0,nodes=new Map();
 const node=dataset=>{const n=new EventTarget();n.dataset=dataset;n.disabled=false;n.scrollLeft=0;
  n.closest=selector=>selector==='button'?Object.keys(dataset).length?n:null:selector.includes('[data-players-')&&Object.keys(dataset).length?n:null;
  n.focus=options=>{assert.equal(options.preventScroll,true);f.doc.activeElement=n;};
  for(const type of ['keydown','keyup'])n.addEventListener(type,f.api.keyboard);
  n.addEventListener('click',f.api.click);return n;};
 Object.defineProperty(content,'innerHTML',{get:()=>html,set:value=>{
  if(f.doc.activeElement===table||[...nodes.values()].includes(f.doc.activeElement))f.doc.activeElement=null;
  html=value;nodes=new Map();replacements++;
  const match=/data-players-view="([^"]+)" data-players-view-revision="([^"]+)"/.exec(html);
  view=match?{dataset:{playersView:match[1],playersViewRevision:match[2]}}:null;
  for(const match of html.matchAll(/data-players-(tab|detail)="([^"]+)"/g))nodes.set(match[1]+':'+match[2],node({[match[1]==='tab'?'playersTab':'playersDetail']:match[2]}));
  table=html.includes('class="wt-players-table-wrap"')?node({}):null;
  if(table)table.addEventListener('keydown',event=>{if(event.key==='ArrowRight'&&f.doc.activeElement===table)table.scrollLeft+=40;});
 }});
 content.querySelector=selector=>selector==='.wt-players-table-wrap'?table:selector==='.wt-players-content'?view:(()=>{const match=/\[data-players-(tab|detail)="([^"]+)"\]/.exec(selector);return match?nodes.get(match[1]+':'+match[2])||null:null;})();
 return {content,table:()=>table,node:(kind,name)=>nodes.get(kind+':'+name),replacements:()=>replacements,
  key(n,type,key,code=''){const event=new Event(type);Object.defineProperties(event,{key:{value:key},code:{value:code}});n.dispatchEvent(event);},
  click(kind,name){const target=nodes.get(kind+':'+name);assert(target,kind+':'+name);target.dispatchEvent(new Event('click'));}};
}
function observer(f){Object.assign(f.packet.viewer,{realPlayer:13,viewedPlayer:13,role:'spectator',ownsViewedPlayer:false,canIssueOrders:false});f.packet.capabilities.fullSpectatorStats=true;
 f.packet.players[0].observerDetails={power:1,powerRate:'+2',powerLost:'18446744073709551615',powerWon:'0',labUsePercent:null,kills:2,units:3,kineticArmor:{tank:1,cyborg:2},thermalArmor:{tank:3,cyborg:4},weaponGrades:[{id:0,name:'<Cannon>',grade:0}]};
 f.packet.spectators=[{id:13,name:'Actual watcher',kind:'spectator',state:'spectator',allocated:true,spectator:true,local:true,colorRGB:null}];return f;
}
function nextFrame(f){f.packet.frame++;f.packet.gameTime+=1000;f.packet.realTime+=1000;}
async function main(){
 await check('Advancing native samples, complete MP poll cycles and monotonic freshness remain required',async()=>{
  const f=fixture();f.win.PcMultiplayerNative={state:{phase:'game',worldReady:true,realPlayer:0,player:0,canIssueOrders:true,spectator:false}};
  f.api.poll();assert(f.api.state.watch);assert.equal(f.api.state.value,null);f.api.poll();assert(f.api.state.watch);
  nextFrame(f);f.api.poll();assert(f.api.state.value);await f.advance(3501);f.api.poll();assert.equal(f.api.state.value,null);
  nextFrame(f);f.api.poll();assert(f.api.state.value);f.win.PcMultiplayerNative.state.realPlayer=13;f.api.poll();assert.equal(f.api.state.value,null);
 });
 await check('Malformed packets, unallocated watchers, MP ownership mismatches and unsafe replay data fail closed',()=>{
  for(const mutate of[f=>f.packet.schemaVersion=90,f=>f.packet.spectators=[{id:13,name:'empty',allocated:false,spectator:true}],f=>f.win.PcMultiplayerNative={state:{phase:'game',worldReady:true,realPlayer:13,player:0}},f=>{f.packet.mode='replay';f.packet.viewer.role='replay';}]){const f=fixture();f.fresh();mutate(f);assert.equal(f.api.packet(),null);}
  const replay=observer(fixture());replay.packet.mode='replay';replay.packet.viewer.role='replay';assert(replay.fresh());assert.equal(replay.writes.length,0);
 });
 await check('Offline summary and online tables retain native zero, hidden null, escaped names and conditional teams',()=>{
  const f=fixture(),row=f.packet.players[0];row.name='<img src=x onerror=alert(1)>';f.fresh();
  let html=f.api.render(f.packet);assert(html.includes('&lt;img'));assert(!html.includes('<img src=x'));assert(html.includes('aria-label="Not available"'));assert(html.includes('<td>0</td>'));assert(html.includes('rgb(0,128,255)'));assert(html.includes('Host'));assert(!html.includes('>TEAM<'));
  f.packet.capabilities.teamMode=true;row.team=1;html=f.api.render(f.packet);assert(html.includes('>TEAM<'));assert(html.includes('<td>2</td>'));
  f.packet.mode='offline-scenario';row.kind='scenario';row.human=false;html=f.api.render(f.packet);assert(html.includes('wt-players-summary'));assert(!html.includes('wt-players-tabs'));assert(!html.includes('>SCORE<'));assert(html.includes('>STRUCTURES<'));
  f.packet.mode='campaign';html=f.api.render(f.packet);assert(html.includes('wt-players-summary'));assert(html.includes('>SCORE<'));
  f.packet.mode='offline-skirmish';html=f.api.render(f.packet);assert(html.includes('wt-players-table-wrap'));assert(!html.includes('wt-players-summary'));
 });
 await check('Spectators and permitted detail groups use separate views without redundant headings or legacy buttons',()=>{
  const f=observer(fixture());f.fresh();assert.deepEqual(Array.from(f.api.tabs(f.packet)),['participants','spectators','details']);
  let html=f.api.render(f.packet);assert(!html.includes('Actual watcher'));for(const text of ['PLAYER CONTROLS','OBSERVER TABLE','data-players-native','wt-players-intro','<h1','<h2'])assert(!html.includes(text));
  f.api.state.tab='spectators';html=f.api.render(f.packet);assert(html.includes('Actual watcher'));assert(html.includes('/warzone/ui/icons/eye.svg'));assert(!html.includes('wt-players-table-wrap'));
  f.api.state.tab='details';html=f.api.render(f.packet);assert(html.includes('ECONOMY &amp; ARMY'));assert(html.includes('18446744073709551615'));assert(html.includes('>+2<'));assert(!html.includes('TANK ARMOR'));
  f.api.state.detailTab='upgrades';html=f.api.render(f.packet);assert(html.includes('TANK ARMOR'));assert(html.includes('CYBORG THERMAL'));assert(html.includes('&lt;Cannon&gt;'));assert(!html.includes('18446744073709551615'));
  f.packet.capabilities.fullSpectatorStats=false;assert.equal(f.api.details(f.packet),'');assert(!f.api.render(f.packet).includes('data-players-tab="details"'));
 });
 await check('Connected defeated participants are not labelled disconnected and actual former rows remain distinct',()=>{
  const f=fixture(),row=f.packet.players[0];row.state='spectating';row.allocated=true;row.spectator=true;let html=f.api.render(f.packet);assert(html.includes('Now spectating'));assert(!html.includes('Disconnected'));
  row.state='former';row.kind='former-human';row.allocated=false;html=f.api.render(f.packet);assert(html.includes('Disconnected'));assert(html.includes('Human'));
 });
 await check('Real delegated tab clicks preserve per-view scroll, active tab focus and zero game writes across 1Hz refresh',()=>{
  const f=observer(fixture()),ui=interactiveFixture(f);f.fresh();f.api.paint();ui.content.scrollTop=35;ui.table().scrollLeft=150;
  ui.click('tab','details');assert.equal(f.api.state.tab,'details');ui.content.scrollTop=80;ui.table().scrollLeft=280;ui.node('detail','upgrades').focus({preventScroll:true});ui.click('detail','upgrades');assert.equal(f.api.state.detailTab,'upgrades');assert.equal(f.doc.activeElement,ui.node('detail','upgrades'));
  ui.content.scrollTop=90;ui.table().scrollLeft=330;nextFrame(f);f.api.paint();assert.equal(f.api.state.tab,'details');assert.equal(f.api.state.detailTab,'upgrades');assert.equal(ui.table().scrollLeft,330);assert.equal(ui.content.scrollTop,90);assert.equal(f.doc.activeElement,ui.node('detail','upgrades'));
  ui.click('tab','participants');assert.equal(ui.table().scrollLeft,150);assert.equal(ui.content.scrollTop,35);assert.equal(f.writes.length,0);
 });
 await check('Focused table and held Space activation survive a valid refresh; invalid role data redacts immediately',async()=>{
  const f=observer(fixture()),ui=interactiveFixture(f);f.fresh();f.api.paint();let table=ui.table();table.scrollLeft=240;table.focus({preventScroll:true});ui.key(table,'keydown','ArrowRight','ArrowRight');assert.equal(table.scrollLeft,280);nextFrame(f);f.api.paint();table=ui.table();assert.equal(f.doc.activeElement,table);assert.equal(table.scrollLeft,280);
  const original=ui.node('tab','spectators');original.focus({preventScroll:true});ui.key(original,'keydown',' ','Space');await f.advance(900);nextFrame(f);f.api.paint();assert.equal(ui.node('tab','spectators'),original);ui.key(original,'keyup',' ','Space');original.dispatchEvent(new Event('click'));assert.equal(f.api.state.tab,'spectators');assert.equal(f.api.state.keys.size,0);
  f.packet.ready=false;f.api.paint();assert(!ui.content.innerHTML.includes('Actual watcher'));assert(!ui.content.innerHTML.includes('data-players-tab'));
 });
 await check('Context, real/viewed role, session and capability loss reset details and discard previous-view scroll',()=>{
  for(const loss of ['context','role','session','capability']){const f=observer(fixture()),ui=interactiveFixture(f);f.fresh();f.api.paint();ui.click('tab','details');ui.click('detail','upgrades');ui.table().scrollLeft=300;ui.content.scrollTop=100;
   if(loss==='context')f.packet.context='other';if(loss==='role')f.packet.viewer.role='view-only';if(loss==='session')f.win.__towersHtml.session='other';if(loss==='capability')f.packet.capabilities.fullSpectatorStats=false;
   nextFrame(f);f.api.paint();assert.equal(f.api.state.value,null);assert.equal(f.api.state.tab,'participants');assert.equal(f.api.state.detailTab,'economy');assert.equal(Object.keys(f.api.state.viewScroll).length,0);assert(!ui.content.innerHTML.includes('TANK ARMOR'));
   nextFrame(f);f.api.paint();assert.equal(ui.table()?.scrollLeft||0,0);assert.equal(ui.content.scrollTop,0);
  }
 });
 await check('Held touch refresh deferral remains bounded and never delays stale data redaction',async()=>{
  const f=fixture(),ui=interactiveFixture(f);f.fresh();f.api.paint();f.api.pointer({type:'pointerdown',pointerId:1});f.packet.players[0].name='Updated';nextFrame(f);f.api.paint();assert(!ui.content.innerHTML.includes('Updated'));f.api.pointer({type:'pointerup',pointerId:1});await f.advance(201);f.api.paint();assert(ui.content.innerHTML.includes('Updated'));await f.advance(3501);f.api.paint();assert(!ui.content.innerHTML.includes('Updated'));
 });
 await check('Player navigation remains read-only while an already submitted production ACK is consumed',()=>{
  const body=between(source,'  setInterval(()=>{\n    pollPlayers();','  },150);').replace('  setInterval(()=>{','');let fresh=0,resolved=0,consumed=0,writes=0;
  const pending={command:{nonce:'submitted',action:'queue-production'},at:0,warned:false,resolve:()=>resolved++};
  const state={page:'players',pending:new Map([['submitted',pending]]),snapshot:null,acks:0,history:[],lastBatch:{nonces:['submitted'],revision:'original'},lastWrite:0};let context;
  const window={addEventListener(){},__towersHtml:{isEnded:()=>false,consume:()=>consumed++},__kalaWarzoneTouch:{report:()=>({hudVisible:true})},__blockNightResearch:{pollOutput:()=>context.accept({nonce:'submitted',action:'queue-production',ok:true,result:{}})}};
  context=vm.createContext({state,window,pollPlayers(){},requestState:()=>fresh++,Date:{now:()=>5000},campaign:false,module:()=>({FS:{writeFile:()=>writes++,rename(){}}}),PATH:'owned-commands.json',setTimeout(){}});
  vm.runInContext(fn(source,'flush')+'\n'+fn(source,'accept')+'\nthis.accept=accept;this.tick=()=>{'+body+'};',context);context.tick();assert.equal(fresh,0);assert.equal(resolved,1);assert.equal(consumed,1);assert.equal(state.pending.size,0);assert.equal(writes,0);
  assert(fn(source,'requestState').includes("if(state.page==='players')return"));
 });
 await check('Global Players toggle and Back preserve combat intent and restore battlefield input without new owned requests',async()=>{
  const f=fixture(),state=f.state,calls=[];Object.assign(state,{page:'',scroll:{},saved:[],opens:0,closes:0,navigationSerial:0,buildOpen:true,placement:{id:'A0TankTrap'},nativeMenu:'',factoryMenuOpen:false});
  const frame={inert:false},panel={hidden:true,contains:()=>false};f.nodes.set('wt-command-pages',panel);f.nodes.set('warzone-game-frame',frame);f.nodes.get('wt-page-content').dataset={};
  f.win.__kalaWarzoneTouch={report:()=>({pendingClicks:0,combatLockRequested:true}),releaseAll:()=>calls.push('release'),setHeaderMenuState:(name,on)=>calls.push(name+':'+on)};f.win.__warzoneCommands={hidePreview(){}};f.win.__blockNightResearch={close(){}};
  Object.assign(f.context,{campaign:false,polishedTowers:true,host:{TowersStatus:{close(){}},WarzoneHost:{resetScroll(){},restoreBattlefield:()=>calls.push('restore')}},document:{getElementById:()=>({focus(){}})},finishDesignRename(){},cancelDemolish(){},rememberPanelScroll(){},install(){},render(){assert.equal(state.page,'players');},requestState(){throw Error('New owned request');},clearTimeout(){},notify(){},selectMode:async()=>{calls.push('build-exit');state.buildOpen=false;state.placement=null;},closeNative(){}});
  vm.runInContext(fn(source,'headerPage')+'\n'+fn(source,'updateHeaderMenus')+'\n'+fn(source,'open')+'\n'+fn(source,'close')+'\n'+fn(source,'handlePanelBack')+'\nthis.open=open;this.back=handlePanelBack;',f.context);
  await f.context.open('players');assert.equal(state.page,'players');assert.equal(state.placement,null);assert.equal(frame.inert,true);assert(calls.includes('players:true'));assert.equal(f.context.back(),true);assert.equal(frame.inert,false);assert(calls.includes('restore'));
 });
 await check('Compact surface contains scroll, hides redundant local headings and uses the approved existing icon system',()=>{
  const css=read('warzone/ui/towers-game-controls.css');assert(/\[data-page=players\] \.wt-command-title\{display:none!important/.test(css));assert(css.includes('max-height:calc(100dvh'));assert(css.includes('isolation:isolate'));assert(css.includes('pointer-events:auto'));assert(css.includes('overflow-wrap:anywhere'));assert(css.includes('touch-action:pan-x pan-y'));assert(css.includes('@media(max-width:460px)'));assert(css.includes('grid-template-columns:1fr'));assert(!source.includes("button('PLAYER CONTROLS'"));assert(!source.includes("button('OBSERVER TABLE'"));
  const eye=fs.readFileSync(path.join(assets,'warzone/ui/icons/eye.svg'));assert.equal(sha(eye),'766b10b6ed7d8a899a76ba28f3f066ca49e8ce0a75ae68b65bfec0e615d8130d');assert(!/script|onload|https?:/i.test(eye.toString().replace(/xmlns="[^"]+"/,'')));
 });
 await check('Freshness and key listeners tear down without retaining panel handlers',()=>{
  const f=fixture(),removed=[];f.api.state.panel={removeEventListener:(type,handler,capture)=>{removed.push(type);assert.equal(capture,true);}};f.api.state.pointers.add(1);f.api.state.keys.add('Space');f.api.state.keyUntil=2000;
  const marker="window.addEventListener('pagehide',()=>{playersState.disposed=true;",start=source.indexOf(marker),end=source.indexOf('});',start);assert(start>=0);vm.runInContext('this.teardown=()=>{'+source.slice(start+"window.addEventListener('pagehide',()=>{".length,end)+'};',f.context);f.context.teardown();assert.deepEqual(removed,['pointerdown','pointerup','pointercancel','keydown','keyup']);assert.equal(f.api.state.pointers.size,0);assert.equal(f.api.state.keys.size,0);assert.equal(f.api.state.disposed,true);
 });
 const edited=['warzone-command-pages.js','warzone/ui/towers-game-controls.css','warzone/ui/icons/eye.svg'];
 const base='C:/timerApp/candidates/mobile-network-test-20261117',walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
 const old=new Map(walk(path.join(base,'app/src')).map(p=>[path.relative(path.join(base,'app/src'),p).replaceAll('\\','/'),p]));
 const current=new Map(walk(path.join(root,'app/src')).map(p=>[path.relative(path.join(root,'app/src'),p).replaceAll('\\','/'),p]));
 const changed=[],added=[],protectedSources=[];
 for(const[name,p]of current){if(!old.has(name)){added.push(name);continue;}const hash=sha(fs.readFileSync(p));if(hash!==sha(fs.readFileSync(old.get(name))))changed.push(name);else if(name.endsWith('.java')||/lobby-(http|ui)\.js$|\.wasm$/.test(name))protectedSources.push({path:'app/src/'+name,sha256:hash});}
 assert.deepEqual(changed.sort(),['main/assets/warzone-command-pages.js','main/assets/warzone/ui/towers-game-controls.css'].sort());assert.deepEqual(added,['main/assets/warzone/ui/icons/eye.svg']);assert([...old.keys()].every(name=>current.has(name)));
 checks.push('All app sources match the accepted baseline except the two approved UI files and one approved eye icon; Java, networking, native data and gameplay sources are preserved');
 new vm.Script(source,{filename:'warzone-command-pages.js'});
 const result={passed:true,checksPassed:checks.length,checks,sources:edited.map(name=>({path:name,sha256:sha(fs.readFileSync(path.join(assets,name)))})),protectedSources,baselineAPK_SHA256:'a19848c0ecfac6a4b20b1510f5889b771fd739de340da7e842916d59cfe020d3',scope:'Focused actual JavaScript VM/event/VFS policy tests and source/CSS constraints. Real Android paint, touch geometry and exact-APK gameplay remain separate runtime checks.'};
 fs.writeFileSync(path.join(root,'release-records/players-ui-092-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,checks:checks.length,assets:edited.length}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
