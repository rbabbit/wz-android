'use strict';
// Source/API fixtures only. Native compilation and exact-APK emulator evidence
// are separate; this program does not execute the engine or Android UI.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),pre=process.argv.includes('--pre-integration');
const file=name=>fs.readFileSync(path.join(root,name),'utf8'),hash=value=>createHash('sha256').update(value).digest('hex');
const native='archive/native-notices-0.35/keybind.cpp',notice='app/src/main/assets/warzone-towers-notices.js';
const reader='scenario/warzone-towers-config-reader.js',settings='scenario/warzone-towers-printsettings.js';
const vendor='vendor/tower-defense/mod/multiplay/script/';
const checks=[];async function check(name,fn){await fn();checks.push({name,passed:true});}
const clone=value=>JSON.parse(JSON.stringify(value));
function readerFixture(source){
  const events=[],packets=[],rng=[];
  const c=vm.createContext({actions:[],index:0,totalRounds:15,ranks:[0,11,22,33],selectedPlayer:0,gameTime:50000,
    Spawner:{rank:-1,queue:[]},Template:{fromString:name=>name==='invalid'?null:{name}},
    _:s=>s,console:text=>events.push(['console',text]),dump:text=>packets.push(text),
    playSound:name=>events.push(['sound',name]),queue:(...args)=>events.push(['queue',...args]),
    setMissionTime:seconds=>events.push(['mission-time',seconds]),
    syncRandom:n=>{const value=rng.length%n;rng.push(n);return value;}});
  vm.runInContext(source,c);return{c,events,packets,rng};
}
function browserFixture({duel=false,clock=50000}={}){
  const listeners=new Map(),timers=new Map(),nodes=new Map(),channels=[];
  let serial=0,now=0,phase='playing',nativeClock=clock,log=Buffer.from('historic BNNOTICE text\n'),reads=0;
  function node(tag){return{tag,hidden:false,textContent:'',children:[],attributes:{},
    append(...values){this.children.push(...values);for(const value of values)if(value.id)nodes.set(value.id,value);},
    appendChild(value){this.append(value);},setAttribute(k,v){this.attributes[k]=v;}};}
  const document={createElement:node,head:node('head'),body:node('body')};
  const add=(fn,delay,repeat=0)=>{const id=++serial;timers.set(id,{fn,at:now+delay,repeat});return id;};
  class BroadcastChannel{constructor(name){this.name=name;this.callbacks=[];this.closed=false;channels.push(this);}
    addEventListener(type,fn){if(type==='message')this.callbacks.push(fn);}close(){this.closed=true;}
    emit(text){if(!this.closed)for(const fn of this.callbacks)fn({data:text});}}
  const window={parent:null,__warzoneDuelConfig:duel?{mode:'duel'}:undefined,
    __towersHtml:{isEnded:()=>phase==='ended',report:()=>({phase})},
    __warzoneTowersWaves:{report:()=>({snapshot:nativeClock===null?null:{gameTime:nativeClock}})},
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    Module:{WZVAL_configDirPath:'/config',FS:{readdir:()=>['native.log'],stat:()=>({size:log.length}),
      open:()=>1,read(stream,buffer,offset,length,position){reads++;const b=log.subarray(position,position+length);buffer.set(b,offset);return b.length;},close(){}}}};
  vm.runInNewContext(file(notice),{window,document,Set,Map,Number,Uint8Array,TextDecoder,BroadcastChannel,
    setTimeout:(fn,delay)=>add(fn,delay),clearTimeout:id=>timers.delete(id),
    setInterval:(fn,delay)=>add(fn,delay,delay),clearInterval:id=>timers.delete(id)},{filename:notice});
  const dispatch=(type,detail)=>{for(const fn of listeners.get(type)||[])fn({type,detail});};
  return{window,document,channels,nodes,dispatch,clock:value=>{nativeClock=value;},
    engine:text=>dispatch('blocknight-engine-output',{text}),
    box:()=>nodes.get('wt-game-notice'),title:()=>nodes.get('wt-game-notice')?.children[0],
    detail:()=>nodes.get('wt-game-notice')?.children[1],append:text=>{log=Buffer.concat([log,Buffer.from(text)]);},
    truncate:text=>{log=Buffer.from(text);},reads:()=>reads,
    end(){phase='ended';dispatch('warzone-battle-ended');},
    advance(ms){const target=now+ms;for(let i=0;i<1000;i++){const next=[...timers].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next){now=target;return;}const[id,t]=next;timers.delete(id);now=t.at;if(t.repeat)timers.set(id,{...t,at:now+t.repeat});t.fn();}throw Error('Fixture timer bound exceeded');}};
}
const packet=value=>'BNNOTICE:'+JSON.stringify(value);
const camera=(direction='north',gameTime=50000)=>({kind:'camera',direction,gameTime});
(async()=>{
  await check('Round notice replaces only the banner while rank, sound and continuation stay identical',()=>{
    const before=readerFixture(file(vendor+'mods/configReader.js')),after=readerFixture(file(reader));
    before.c.processRound({round:2});after.c.processRound({round:2});
    assert.equal(before.c.Spawner.rank,22);assert.equal(after.c.Spawner.rank,22);
    assert.deepEqual(after.events,before.events.filter(e=>e[0]!=='console'));
    assert.deepEqual(after.events,[['sound','pcv373.ogg'],['queue','next']]);
    assert.equal(after.packets.length,1);assert.deepEqual(JSON.parse(after.packets[0].slice(9)),
      {kind:'round',round:2,totalRounds:15,player:0,gameTime:50000});assert.deepEqual(after.rng,[]);
  });
  await check('Wait timing, template choices, RNG calls and spawn continuation retain vendor behavior',()=>{
    const a=readerFixture(file(vendor+'mods/configReader.js')),b=readerFixture(file(reader));
    for(const f of [a,b]){f.c.processWait({seconds:5});f.c.processWait({seconds:15});
      f.c.processSpawn({count:5,templatePool:['Machinegun Viper Wheels','Light Cannon Viper Wheels','invalid']});
      f.c.processSpawn({count:9,templatePool:['invalid']});}
    assert.deepEqual(b.events,a.events);assert.deepEqual(b.rng,a.rng);assert.equal(b.rng.length,5);
    assert.deepEqual(clone(b.c.Spawner.queue),clone(a.c.Spawner.queue));assert.deepEqual(b.packets,[]);
  });
  await check('Startup banner is gone while all original IS_HACK save/load warnings remain',()=>{
    for(const hacked of [false,true]){const logs=[];const c=vm.createContext({IS_HACK:hacked,console:text=>logs.push(text),_:s=>s});
      vm.runInContext(file(settings),c);c.printGameSettings();
      assert.deepEqual(logs,hacked?Array(3).fill('WARNING: Saving/loading is broken because Scavengers are off'):[]);}
  });
  await check('Native source differs from v034 only by the camera notice helper and four success calls',()=>{
    const before=file('archive/native-notices-0.34/keybind.cpp'),after=file(native);
    const start=after.indexOf('// Emit only after the existing native camera action has completed.');
    const end=after.indexOf('extern char\tScreenDumpPath[];',start);assert(start>0&&end>start);
    const helper=after.slice(start,end);assert.match(helper,/if \(!towersOwnsRoutineNotices\(\)\)/);
    assert.match(helper,/CONPRINTF\("%s", stockMessage\);\s*return;/);
    assert.match(helper,/#ifdef __EMSCRIPTEN__[\s\S]*fprintf\(stderr, "BNNOTICE:/);
    let normalized=after.slice(0,start)+after.slice(end);
    for(const d of ['North','South','East','West']){
      const old=`CONPRINTF("%s", _("View Aligned to ${d}"));`,replacement=`towersCameraAlignmentNotice("${d.toLowerCase()}", _("View Aligned to ${d}"));`;
      assert.equal(normalized.split(replacement).length,2);normalized=normalized.replace(replacement,old);}
    assert.equal(normalized,before,'Camera mutations, other console calls, errors and QuickSave suppression remain exact');
    const proof=JSON.parse(file('archive/native-notices-0.35/source-overlay.json'));
    assert.equal(hash(before),proof.beforeSHA256);assert.equal(hash(after),proof.afterSHA256);
  });
  await check('Round packets from the authored callback reach one black/white non-blocking notice box',()=>{
    const source=readerFixture(file(reader));source.c.processRound({round:2});
    const f=browserFixture();f.engine(source.packets[0]);assert.equal(f.title().textContent,'Round 2 / 15');
    assert.equal(f.detail().hidden,true);assert.equal(f.document.body.children.length,1);
    assert.match(f.document.head.children[0].textContent,/background:#080808;color:#fff/);
    assert.match(f.document.head.children[0].textContent,/pointer-events:none/);
    assert.equal(f.window.WarzoneNotices.report().nativeEvents,1);
  });
  await check('Camera notices use actual scoped native packets and share the same box without overlap',()=>{
    const format=file(native).match(/fprintf\(stderr,\s*("(?:\\.|[^"\\])*")/);assert(format,'Actual native stderr packet format exists');
    const wireFormat=JSON.parse(format[1]),f=browserFixture();for(const direction of ['north','south','east','west']){
      const wire=wireFormat.replace('%s',direction).replace('%u','50000');
      assert.deepEqual(JSON.parse(wire.slice(9)),camera(direction));
      f.engine(wire);assert.equal(f.title().textContent,'View aligned to '+direction[0].toUpperCase()+direction.slice(1));
      assert.equal(f.detail().hidden,true);assert.equal(f.document.body.children.length,1);}
    assert.equal(f.window.WarzoneNotices.report().nativeEvents,4);
  });
  await check('Engine, BroadcastChannel and log duplicates are consumed once without extending visibility',()=>{
    const f=browserFixture(),p=packet(camera());f.advance(650);f.engine(p);f.advance(4400);
    f.channels[0].emit(p);f.append('[native] '+p+'\n');f.advance(450);
    assert.equal(f.window.WarzoneNotices.report().shown,1);assert.equal(f.box().hidden,true);
  });
  await check('Log fallback waits for whole lines, skips startup history and survives truncation',()=>{
    const f=browserFixture();f.advance(650);assert.equal(f.window.WarzoneNotices.report().shown,0);
    const p=packet(camera('east'));f.append(p.slice(0,19));f.advance(650);assert.equal(f.window.WarzoneNotices.report().shown,0);
    f.append(p.slice(19)+'\n');f.advance(650);assert.equal(f.title().textContent,'View aligned to East');
    f.truncate(packet(camera('west'))+'\n');f.advance(650);assert.equal(f.title().textContent,'View aligned to West');
  });
  await check('Invalid, foreign-player, stale and pre-load packets cannot claim a current notice',()=>{
    const f=browserFixture();for(const value of [null,{kind:'camera',direction:'diagonal',gameTime:50000},
      {kind:'round',round:2,totalRounds:15,player:1,gameTime:50000},{kind:'round',round:99,totalRounds:15,player:0,gameTime:50000},
      camera('north',10000),camera('north',90000)])f.engine(packet(value));
    f.engine('BNNOTICE:not json');assert.equal(f.window.WarzoneNotices.report().shown,0);
    f.engine(packet(camera()));f.clock(30000);f.engine(packet(camera()));assert.equal(f.box().hidden,true);
    f.engine(packet(camera('south',30000)));assert.equal(f.title().textContent,'View aligned to South');
  });
  await check('Research completion and Game saved keep their exact text and cannot reappear after battle end',()=>{
    const f=browserFixture();f.dispatch('blocknight-research-completed',{id:'R-X',name:'Light Cannon',player:0,labId:7,gameTime:50000});
    assert.equal(f.title().textContent,'Research complete');assert.equal(f.detail().textContent,'Light Cannon');
    assert.equal(f.window.WarzoneNotices.show('Game saved'),true);assert.equal(f.title().textContent,'Game saved');assert.equal(f.detail().hidden,true);
    const before=f.window.WarzoneNotices.report().shown;f.end();f.engine(packet(camera('east')));f.channels[0].emit(packet(camera('west')));
    assert.equal(f.window.WarzoneNotices.show('Game saved'),false);f.advance(10000);
    assert.equal(f.window.WarzoneNotices.report().shown,before);assert.equal(f.box().hidden,true);assert.equal(f.channels[0].closed,true);
  });
  await check('Duel receives no Towers notices, channel or polling work',()=>{
    const f=browserFixture({duel:true});assert.equal(f.window.WarzoneNotices,undefined);assert.equal(f.document.body.children.length,0);assert.equal(f.channels.length,0);
  });
  if(!pre){
    await check('Packaged VFS contains the exact reviewed reader and settings source bytes',()=>{
      const js=file('app/src/main/assets/warzone/warzone2100.js'),data=fs.openSync(path.join(root,'app/src/main/assets/warzone/warzone2100.data'),'r');
      try{for(const[vfs,relative]of [['/data/mp/multiplay/script/mods/configReader.js',reader],['/data/mp/multiplay/script/rules/printsettings.js',settings]]){
        const escaped=vfs.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const row=js.match(new RegExp('\\{\\s*"filename"\\s*:\\s*"'+escaped+'"\\s*,\\s*"start"\\s*:\\s*(\\d+)\\s*,\\s*"end"\\s*:\\s*(\\d+)\\s*\\}'));
        assert(row,'Missing VFS entry '+vfs);const bytes=Buffer.alloc(Number(row[2])-Number(row[1]));fs.readSync(data,bytes,0,bytes.length,Number(row[1]));assert.equal(hash(bytes),hash(file(relative)));}
      }finally{fs.closeSync(data);}
    });
    await check('Private worker hook changes only by the explicit BNNOTICE route',()=>{
      const js=file('app/src/main/assets/warzone/warzone2100.js');const after=js.match(/var out=console\.log\.bind\(console\);var blockNightOutputChannel=[\s\S]*?;var wasmBinary;/)?.[0];assert(after);
      const addition='||text.includes("BNNOTICE")';assert.equal(after.split(addition).length,2);const before=after.replace(addition,'');
      assert.equal(hash(before),'d552fdf229b98791fbaf979928c4a0df1a829e0c4fb52beead2bb89ac73c4c4f');
      assert.equal(after,before.replace('text.includes("BNQUEUE")','text.includes("BNQUEUE")'+addition));
    });
    await check('Actual worker hook forwards scoped notices and retains research, queue and every ordinary error',()=>{
      const hook=file('app/src/main/assets/warzone/warzone2100.js').match(/var out=console\.log\.bind\(console\);var blockNightOutputChannel=[\s\S]*?;var wasmBinary;/)?.[0];
      const forwarded=[],errors=[];class BroadcastChannel{postMessage(text){forwarded.push(text);}}
      const context={console:{log(){},error:(...args)=>errors.push(args.join(' '))},BroadcastChannel};
      vm.createContext(context);vm.runInContext(hook+'\nglobalThis.sendError=err;',context);
      for(const text of [packet(camera()),'BNTECH:{"player":0}','BNQUEUE:{"ok":true}','Renderer error remains visible'])context.sendError(text);
      assert.deepEqual(forwarded,[packet(camera()),'BNTECH:{"player":0}','BNQUEUE:{"ok":true}']);
      assert.equal(errors.length,4);assert.equal(errors.at(-1),'Renderer error remains visible');
    });
  }
  const sources=[reader,settings,native,notice,'tools/check-notices-035.cjs'].map(p=>({path:p,sha256:hash(fs.readFileSync(path.join(root,p)))}));
  const report={version:'0.35',phase:pre?'pre-integration':'integrated-source',passed:true,emulatorUsed:false,
    androidRuntimeExecuted:false,actualNativeEngineExecuted:false,sourceCheckGroupsPassed:checks.length,checks,sources,
    scope:'Actual native/scenario sources and browser API fixtures; no emulator, native gameplay, visual acceptance or performance claim.'};
  const output=path.join(root,'qa/0.35-notices');fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,pre?'notices-source-preintegration-checks.json':'notices-source-checks.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,phase:report.phase,sourceCheckGroupsPassed:checks.length,emulatorUsed:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
