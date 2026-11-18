/* Native timer restoration model against the real shared bridge/initializer. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const bridge=fs.readFileSync(path.join(root,'scenario/warzone-towers-bridge.js'),'utf8');
const commands=fs.readFileSync(path.join(root,'scenario/warzone-towers-commands.js'),'utf8');
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'scenario/warzone-towers-catalog.json'),'utf8'));
function harness(){
  const timers=new Map();let last=0;
  const context=vm.createContext({
    namespace:()=>{},eventChat:()=>{},eventResearched:()=>{},includeJSON:name=>name==='warzone-towers-catalog.json'?catalogue:{},
    hideInterface:()=>{},dump:()=>{},
    setTimer:(name,ms)=>{do{last++;}while(timers.has(last));timers.set(last,{name,ms});return true;},
    removeTimer:name=>{for(const[id,t]of timers)if(t.name===name)timers.delete(id);return true;}
  });
  vm.runInContext(bridge,context,{timeout:1000});
  vm.runInContext(commands,context,{timeout:1000});
  vm.runInContext('wtcmd_indexStats=function(){};',context);
  return{context,timers,run:s=>vm.runInContext(s,context,{timeout:1000}),
    restore:(id,timer)=>{assert(!timers.has(id),'Native duplicate timer ID '+id);timers.set(id,timer);}};
}
const results=[];
const fresh=harness();assert.equal(fresh.timers.size,0);results.push('Including real scenario scripts allocates no native timers');
fresh.run('warzoneTowersBridge_eventStartLevel();warzoneTowersBridge_eventStartLevel();wtcmd_initialize();wtcmd_initialize();');
assert.equal([...fresh.timers.values()].filter(t=>t.name==='blockNightV32PollBridgeCommands').length,1);
assert.equal([...fresh.timers.values()].filter(t=>t.name==='warzoneTowersDiagnosticSnapshot').length,1);
assert.equal([...fresh.timers.values()].filter(t=>t.name==='wtcmd_tick').length,1);
results.push('Repeated new-world bridge/command initialization keeps one timer per function');
for(const priorFlag of [false,true]){
  const loaded=harness();
  // Old0.93/early0.94 saves have no bridge lifecycle flag, but do have both
  // saved IDs1/2. New saves include the flag; both restore without allocating.
  loaded.run('warzoneTowersBridge_started='+priorFlag+';');
  loaded.restore(1,{name:'blockNightV32PollBridgeCommands',ms:120});
  loaded.restore(2,{name:'warzoneTowersDiagnosticSnapshot',ms:5000});
  const next={name:'next',ms:240000,due:240002,type:'single'};
  loaded.restore(3,next);loaded.restore(10,{name:'wtcmd_tick',ms:250});
  for(let load=0;load<3;load++)loaded.run('warzoneTowersBridge_eventGameLoaded();wtcmd_initialize();');
  assert.equal(loaded.timers.get(1).name,'blockNightV32PollBridgeCommands');
  assert.equal(loaded.timers.get(2).name,'warzoneTowersDiagnosticSnapshot');
  assert.strictEqual(loaded.timers.get(3),next);
  assert.equal([...loaded.timers.values()].filter(t=>t.name==='wtcmd_tick').length,1);
  assert.equal(loaded.timers.size,4);
  results.push((priorFlag?'New':'Legacy')+' saved timer IDs restore without collision; repeated maintenance initialization preserves single wave deadline');
}
const proof={passed:true,checks:results.length,results,nativeWavesExecuted:0,
  scope:'Real script functions with native-compatible timer-ID restoration model; exact APK save/load is verified separately.'};
fs.writeFileSync(path.join(root,'scenario/survival/TIMER-CHECKS.json'),JSON.stringify(proof,null,2)+'\n');
console.log(JSON.stringify(proof));
