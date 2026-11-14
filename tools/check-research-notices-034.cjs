'use strict';
// Executes the embedded research event and real HTML notice helper in bounded
// API/DOM fixtures. This is not native gameplay, emulator or visual acceptance.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const noticeFile = 'app/src/main/assets/warzone-towers-notices.js';
const noticeSource = fs.readFileSync(path.join(root, noticeFile), 'utf8');
const loader = fs.readFileSync(path.join(root, 'app/src/main/assets/warzone/warzone2100.js'), 'utf8');
const row = loader.match(/\{\s*"filename"\s*:\s*"\/data\/mp\/multiplay\/script\/rules\/events\/research\.js"\s*,\s*"start"\s*:\s*(\d+)\s*,\s*"end"\s*:\s*(\d+)\s*\}/);
assert(row, 'Embedded native research event entry must exist');
const data = fs.openSync(path.join(root, 'app/src/main/assets/warzone/warzone2100.data'), 'r');
const bytes = Buffer.alloc(Number(row[2]) - Number(row[1]));
fs.readSync(data, bytes, 0, bytes.length, Number(row[1])); fs.closeSync(data);
const embeddedResearch = bytes.toString('utf8');
const nativeEvent = embeddedResearch.match(/function eventResearched\(research, structure, player\)[\s\S]*?\n\}/)?.[0];
assert(nativeEvent, 'Actual eventResearched function must be present');
function completion({time=20000, player=0, labId=7, id='R-Wpn-Cannon1Mk1', name='Light Cannon'} = {}) {
  const packets = [], queued = [];
  const c = {gameTime:time, selectedPlayer:0, blockNightLabTopics:{7:'active'},
    blockNightLastResearchSnapshot:'old', queue:(...args)=>queued.push(args), dump:text=>packets.push(text)};
  vm.createContext(c); vm.runInContext(nativeEvent, c);
  c.eventResearched({id, fullname:name, name:'Internal name must not be displayed'}, labId === null ? null : {id:labId}, player);
  return {payload:packets.length ? JSON.parse(packets[0].slice('BNTECHDONE:'.length)) : null, c, queued};
}
function fixture({duel=false, clock=20000} = {}) {
  const listeners = new Map(), timers = new Map(), nodes = new Map();
  let serial=0, now=0, phase='playing', nativeClock=clock;
  function node(tag) { return {tag, hidden:false, textContent:'', children:[], attributes:{},
    append(...children) { this.children.push(...children); for (const child of children) if (child.id) nodes.set(child.id,child); },
    appendChild(child) { this.append(child); }, setAttribute(key,value) { this.attributes[key]=value; }}; }
  const document = {createElement:node, head:node('head'), body:node('body')};
  const window = {parent:null, __warzoneDuelConfig:duel ? {mode:'duel'} : undefined,
    __towersHtml:{isEnded:()=>phase==='ended',report:()=>({phase})},
    __warzoneTowersWaves:{report:()=>({snapshot:nativeClock === null ? null : {gameTime:nativeClock}})},
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name,[]); listeners.get(name).push(fn); }};
  const context = {window, document, Set, Number, clearTimeout:id=>timers.delete(id),
    setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,at:now+delay});return id;}};
  vm.runInNewContext(noticeSource,context,{filename:noticeFile});
  const dispatch = (type,detail) => { for (const fn of listeners.get(type) || []) fn({type,detail}); };
  return {window, document, nodes, dispatch, setClock:value=>{nativeClock=value;},
    research:payload=>dispatch('blocknight-research-completed',payload),
    box:()=>nodes.get('wt-game-notice'), title:()=>nodes.get('wt-game-notice')?.children[0],
    detail:()=>nodes.get('wt-game-notice')?.children[1],
    end:()=>{phase='ended';dispatch('warzone-battle-ended');},
    advance(ms) {now+=ms; for (const [id,t] of [...timers]) if (t.at<=now) {timers.delete(id);t.fn();}}};
}
const checks=[];
async function check(name, run) {await run();checks.push({name,passed:true});}
(async()=>{
  await check('Actual embedded BNTECHDONE preserves fullname, topic ID, laboratory and native gameTime',()=>{
    const f=fixture(), real=completion();
    assert.deepEqual(real.payload,{version:23,id:'R-Wpn-Cannon1Mk1',name:'Light Cannon',player:0,labId:7,gameTime:20000});
    assert.equal(real.c.blockNightLabTopics[7],undefined);assert.equal(real.c.blockNightLastResearchSnapshot,'');
    assert.deepEqual(real.queued,[['blockNightEmitResearchSnapshotV23',50]]);
    f.research(real.payload);assert.equal(f.box().hidden,false);assert.equal(f.title().textContent,'Research complete');
    assert.equal(f.detail().textContent,'Light Cannon');assert.equal(f.detail().hidden,false);
  });
  await check('Window/channel/log duplicates show once and do not prolong an existing notice',()=>{
    const f=fixture(), p=completion().payload;f.research(p);f.advance(4700);f.research({...p});f.research({...p});
    f.advance(101);assert.equal(f.box().hidden,true);
  });
  await check('Independent real laboratory completions at the same native tick are not mistaken for duplicates',()=>{
    const f=fixture();f.research(completion().payload);
    f.research(completion({labId:9,id:'R-Vehicle-Engine01',name:'Fuel Injection Engine'}).payload);
    assert.equal(f.detail().textContent,'Fuel Injection Engine');
  });
  await check('Other players, malformed packets and startup grants do not claim a completion',()=>{
    assert.equal(completion({player:1}).payload,null);assert.equal(completion({time:1000}).payload,null);
    const f=fixture();for(const p of [null,'Light Cannon',{player:1,name:'Other player',gameTime:20000},
      {player:0,name:'Missing time'},{player:0,name:' ',gameTime:20000}])f.research(p);
    assert.equal(f.box().hidden,true);
  });
  await check('Native clock rewind removes old dedupe state and rejects delayed pre-load or historical events',()=>{
    const f=fixture({clock:40000}), old=completion({time:40000}).payload;
    f.research(old);f.setClock(20000);f.research({...old});assert.equal(f.box().hidden,true);
    f.research(completion({time:20000,id:'R-Wpn-MG1Mk1',name:'Machinegun'}).payload);
    assert.equal(f.detail().textContent,'Machinegun');
    f.setClock(40000);f.research(old);assert.equal(f.detail().textContent,'Light Cannon');
    f.window.WarzoneNotices.clear();f.research(completion({time:10000,name:'Historic log'}).payload);
    assert.equal(f.box().hidden,true);
  });
  await check('Missing wave snapshot still accepts and deduplicates the real completion payload',()=>{
    const f=fixture({clock:null}),p=completion().payload;f.research(p);f.advance(4700);f.research(p);f.advance(101);
    assert.equal(f.box().hidden,true);
  });
  await check('Game saved has exactly one title, no metadata/detail row, and expires without blocking input',()=>{
    const f=fixture();assert.equal(f.window.WarzoneNotices.show('Game saved'),true);
    assert.equal(f.title().textContent,'Game saved');assert.equal(f.detail().textContent,'');assert.equal(f.detail().hidden,true);
    assert.match(f.document.head.children[0].textContent,/pointer-events:none/);f.advance(4801);assert.equal(f.box().hidden,true);
  });
  await check('A battle end clears current notices and rejects late research or save acknowledgements',()=>{
    const f=fixture();f.research(completion().payload);f.end();assert.equal(f.box().hidden,true);
    assert.equal(f.window.WarzoneNotices.show('Game saved'),false);
    f.research(completion({time:21000,name:'Late completion'}).payload);assert.equal(f.box().hidden,true);
  });
  await check('Duel mode receives no Towers notice UI or API',()=>{
    const f=fixture({duel:true});assert.equal(f.window.WarzoneNotices,undefined);assert.equal(f.document.body.children.length,0);
  });
  await check('Real save coordinator requests the polished notice only after successful archive acknowledgement',async()=>{
    const existing='tools/check-saved-games-027.cjs';
    const head=fs.readFileSync(path.join(root,existing),'utf8').split('\nasync function check(')[0];
    const module={exports:{}};vm.runInNewContext(head+'\nmodule.exports={fixture};',
      {require,__dirname:path.join(root,'tools'),module,console,process,Buffer,setImmediate,URLSearchParams,TextEncoder,TextDecoder},
      {filename:existing+' (reused source fixture)'});
    for(const options of [{},{syncError:true},{noNativeSave:true}]) {
      const save=module.exports.fixture(options),f=fixture();let displays=0;
      save.window.WarzoneNotices={show:text=>{assert(save.calls.some(c=>c[0]==='archive'));displays++;f.window.WarzoneNotices.show(text);}};
      try {const accepted=await save.finish(save.api.save());
        assert.equal(accepted,!options.syncError&&!options.noNativeSave);assert.equal(displays,accepted?1:0);
        if(accepted){assert.equal(f.title().textContent,'Game saved');assert.equal(f.detail().hidden,true);}
      } finally {save.dispose();}
    }
  });
  const report={version:'0.34',passed:true,emulatorUsed:false,actualNativeEngineExecuted:false,
    scope:'Actual embedded eventResearched source, browser notice helper and existing native/Android save API fixtures; not gameplay or visual acceptance.',
    sourceCheckGroupsPassed:checks.length,checks,embeddedResearchEventSHA256:createHash('sha256').update(nativeEvent).digest('hex'),
    sources:[noticeFile,'app/src/main/assets/warzone/saved-games.js','tools/check-research-notices-034.cjs'].map(p=>({path:p,sha256:createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};
  fs.mkdirSync(path.join(root,'qa/0.34-notices'),{recursive:true});
  fs.writeFileSync(path.join(root,'qa/0.34-notices/research-notices-source-checks.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,sourceCheckGroupsPassed:checks.length,emulatorUsed:false}));
})().catch(error=>{console.error(error);process.exitCode=1;});
