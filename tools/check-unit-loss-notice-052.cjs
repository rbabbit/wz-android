'use strict';
// Execute the real notice controller; native death handling and Android layout
// are checked separately against the delivery runtime/APK.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),FILE='app/src/main/assets/warzone-towers-notices.js',SOURCE=fs.readFileSync(path.join(ROOT,FILE),'utf8');
const checks=[],sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function fixture({duel=false}={}){
 const listeners=new Map(),timers=new Map(),nodes=new Map(),channels=[];let serial=0,now=0,clock=50000,ended=false,log=Buffer.from('historical native log\n');
 function node(tag){const events=new Map();return{tag,id:'',hidden:false,textContent:'',children:[],attributes:{},
  append(...children){this.children.push(...children);for(const child of children)if(child.id)nodes.set(child.id,child);},appendChild(child){this.append(child);},
  setAttribute(key,value){this.attributes[key]=String(value);},getAttribute(key){return this.attributes[key]??null;},removeAttribute(key){delete this.attributes[key];},
  addEventListener(type,fn){events.set(type,fn);},fire(type,value={}){events.get(type)?.(value);}};}
 const document={createElement:node,head:node('head'),body:node('body')};
 const schedule=(fn,delay,repeat=0)=>{const id=++serial;timers.set(id,{fn,at:now+delay,repeat});return id;};
 class BroadcastChannel{constructor(){this.callbacks=[];this.closed=false;channels.push(this);}addEventListener(type,fn){if(type==='message')this.callbacks.push(fn);}close(){this.closed=true;}emit(text){if(!this.closed)this.callbacks.forEach(fn=>fn({data:text}));}}
 const window={parent:null,__warzoneDuelConfig:duel?{mode:'duel'}:undefined,
  __towersHtml:{isEnded:()=>ended,report:()=>({phase:ended?'ended':'playing'})},
  __warzoneTowersWaves:{report:()=>({snapshot:{gameTime:clock}})},WarzoneResearchArt:{isReportDefinition:()=>true},
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
  Module:{WZVAL_configDirPath:'/config',FS:{readdir:()=>['native.log'],stat:()=>({size:log.length}),open:()=>1,
   read(stream,buffer,offset,length,position){const part=log.subarray(position,position+length);buffer.set(part,offset);return part.length;},close(){}}}};
 vm.runInNewContext(SOURCE,{window,document,Set,Map,Number,Uint8Array,TextDecoder,BroadcastChannel,
  setTimeout:(fn,delay)=>schedule(fn,delay),clearTimeout:id=>timers.delete(id),setInterval:(fn,delay)=>schedule(fn,delay,delay),clearInterval:id=>timers.delete(id)},{filename:FILE});
 const dispatch=(type,detail)=>{for(const fn of listeners.get(type)||[])fn({type,detail});};
 return{window,document,nodes,channels,dispatch,clock:value=>clock=value,
  engine:text=>dispatch('blocknight-engine-output',{text}),append:text=>log=Buffer.concat([log,Buffer.from(text)]),
  box:()=>nodes.get('wt-game-notice'),title:()=>nodes.get('wt-game-notice')?.children[0],detail:()=>nodes.get('wt-game-notice')?.children[1],
  end(){ended=true;dispatch('warzone-battle-ended');},
  advance(ms){const target=now+ms;for(let i=0;i<1000;i++){const next=[...timers].filter(([,value])=>value.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!next){now=target;return;}const[id,task]=next;timers.delete(id);now=task.at;if(task.repeat)timers.set(id,{...task,at:now+task.repeat});task.fn();}throw Error('Timer fixture exceeded bound');}};
}
const loss=(patch={})=>({kind:'unit-lost',id:160001,name:'Truck Viper Wheels',constructor:true,player:0,gameTime:50000,...patch});
const packet=value=>'BNNOTICE:'+JSON.stringify(value);
function check(name,fn){fn();checks.push({name,passed:true});console.log('PASS: '+name);}
check('Actual local constructor and combat deaths use the existing compact black/white left notice with their real names',()=>{
 const f=fixture();f.engine(packet(loss()));assert.equal(f.title().textContent,'Truck destroyed');assert.equal(f.detail().textContent,'Truck Viper Wheels');assert.equal(f.box().hidden,false);
 f.engine(packet(loss({id:160002,constructor:false,name:'Light Cannon Cobra Tracks'})));assert.equal(f.title().textContent,'Unit destroyed');assert.equal(f.detail().textContent,'Light Cannon Cobra Tracks');
 assert.equal(f.document.body.children.length,1);const css=f.document.head.children[0].textContent;assert.match(css,/position:fixed;left:10px/);assert.match(css,/background:#080808;color:#fff/);assert.match(css,/max-width:min\(330px,calc\(100vw - 190px\)\)/);assert.match(css,/pointer-events:none/);
});
check('Engine, BroadcastChannel and log copies of one death appear once and do not extend its notice timeout',()=>{
 const f=fixture(),wire=packet(loss());f.advance(650);f.engine(wire);f.advance(4400);f.channels[0].emit(wire);f.append(wire+'\n');f.advance(450);
 assert.equal(f.window.WarzoneNotices.report().shown,1);assert.equal(f.window.WarzoneNotices.report().nativeEvents,1);assert.equal(f.box().hidden,true);
});
check('Different death IDs at the same time and the same ID at a different time remain distinct events',()=>{
 const f=fixture();f.engine(packet(loss()));f.engine(packet(loss({id:160002})));f.engine(packet(loss({gameTime:50100})));assert.equal(f.window.WarzoneNotices.report().shown,3);
 f.engine(packet(loss({name:'Renamed duplicate',constructor:false})));assert.equal(f.window.WarzoneNotices.report().shown,3);
});
check('Malformed, foreign-player, non-finite, stale and future loss packets cannot display a notice',()=>{
 const f=fixture();for(const value of[null,loss({player:1}),loss({player:'0'}),loss({id:0}),loss({id:-1}),loss({id:1.5}),loss({id:'160001'}),loss({name:''}),loss({name:'  '}),loss({name:5}),loss({constructor:1}),loss({constructor:'true'}),loss({gameTime:'50000'}),loss({gameTime:null}),loss({gameTime:NaN}),loss({gameTime:Infinity}),loss({gameTime:-1}),loss({gameTime:10000}),loss({gameTime:90000})])f.engine(packet(value));
 f.engine('BNNOTICE:{broken');assert.equal(f.window.WarzoneNotices.report().shown,0);
});
check('Loss names are plain text and cannot retain a research report action from an earlier notice',()=>{
 const f=fixture();f.dispatch('blocknight-research-completed',{id:'R-X',name:'Light Cannon',player:0,labId:7,gameTime:50000});assert.equal(f.box().getAttribute('data-research-topic'),'R-X');
 f.engine(packet(loss({name:' <img src=x onerror=fail> '})));assert.equal(f.detail().textContent,'<img src=x onerror=fail>');assert.equal(f.box().getAttribute('data-research-topic'),null);assert.equal(f.box().getAttribute('role'),'status');assert.equal(f.box().getAttribute('tabindex'),null);
});
check('Native round/camera notices, research completion and Game saved preserve their established text and common route',()=>{
 const f=fixture();f.engine(packet({kind:'round',round:2,totalRounds:15,player:0,gameTime:50000}));assert.equal(f.title().textContent,'Round 2 / 15');assert.equal(f.detail().hidden,true);
 f.engine(packet({kind:'camera',direction:'north',gameTime:50000}));assert.equal(f.title().textContent,'View aligned to North');
 f.dispatch('blocknight-research-completed',{id:'R-X',name:'Composite Alloys',player:0,labId:8,gameTime:50000});assert.equal(f.title().textContent,'Research complete');assert.equal(f.detail().textContent,'Composite Alloys');
 f.window.WarzoneNotices.show('Game saved');assert.equal(f.title().textContent,'Game saved');assert.equal(f.detail().hidden,true);
});
check('Incremental log fallback skips startup history and waits for complete death packets',()=>{
 const f=fixture(),wire=packet(loss());f.append(wire+'\n');f.advance(650);assert.equal(f.window.WarzoneNotices.report().shown,0);
 f.append(wire.slice(0,24));f.advance(650);assert.equal(f.window.WarzoneNotices.report().shown,0);f.append(wire.slice(24)+'\n');f.advance(650);assert.equal(f.window.WarzoneNotices.report().shown,1);
});
check('Battle end rejects late losses and Duel continues to install no Towers notice listeners or polling',()=>{
 const f=fixture();f.engine(packet(loss()));f.end();f.engine(packet(loss({id:160002})));f.channels[0].emit(packet(loss({id:160003})));f.advance(10000);assert.equal(f.window.WarzoneNotices.report().shown,1);assert.equal(f.box().hidden,true);assert.equal(f.channels[0].closed,true);
 const duel=fixture({duel:true});assert.equal(duel.window.WarzoneNotices,undefined);assert.equal(duel.document.body.children.length,0);assert.equal(duel.channels.length,0);
});
const proof={version:'0.52',passed:true,checksPassed:checks.length,checks,emulatorUsed:false,actualNativeEngineExecuted:false,
 scope:'Real Towers notice controller in VM with structured fatal-loss packets and all existing output transports. Native score/audio/destruction and visible APK behavior are verified separately.',
 sources:[FILE,'tools/check-unit-loss-notice-052.cjs'].map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(ROOT,file)))})),recordedUTC:new Date().toISOString()};
fs.writeFileSync(path.join(ROOT,'archive/unit-loss-notice-js-0.52-checks.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:true,checksPassed:checks.length}));
