/* Exercise actual shipped UI functions with native/filesystem/DOM boundaries stubbed.
 * Native simulation, rendering and exact-APK Android checks are separate. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ROOT=path.resolve(__dirname,'..'),ASSETS=path.join(ROOT,'app/src/main/assets');
const source=name=>fs.readFileSync(path.join(ASSETS,name),'utf8');
function extract(text,name){
  const found=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(').exec(text);
  assert(found,`Actual function ${name} not found`);
  const brace=text.indexOf('{',found.index);let depth=0;
  for(let at=brace;at<text.length;at++){
    if(text[at]==='{')depth++;else if(text[at]==='}'&&!--depth)return text.slice(found.index,at+1);
  }
  throw Error('Unclosed function '+name);
}
function context(code){const out=vm.createContext({console,setTimeout,clearTimeout,performance:{now:()=>1},Date});vm.runInContext(code,out);return out;}
const evaluate=(ctx,code)=>vm.runInContext(code,ctx),literal=value=>JSON.stringify(value);
const shared=source('warzone-touch-controls.js'),mp=source('multiplayer/mobile-controls.js'),adapter=source('multiplayer/native-ui-adapter.js');
const results={scope:'Actual extracted UI transition/selection functions; native simulation and Android runtime are separate',checks:[]};
function checked(name,fn){fn();results.checks.push(name);}
const nodeStub=`
const nodes=new Map();
for(const id of ['wt-repair','wt-campaign-repair'])nodes.set(id,{dataset:{},attrs:{},disabled:false,classList:{toggle(){}},setAttribute(key,value){this.attrs[key]=value;}});
const commandDocument=()=>({getElementById:id=>nodes.get(id)||null});
const writes=[],files=new Map();
const nativeFS={writeFile(name,data){files.set(name,data);},rename(from,to){files.set(to,files.get(from));files.delete(from);writes.push(JSON.parse(files.get(to)));}};
const baseAck={schemaVersion:93,managed:false,canIssueOrders:true,worldSafe:true,enabled:false,applied:false,pending:false,context:'world-a',requestNonce:''};
`;
const offline=context(nodeStub+`
let repairRequested=null,repairIntent=null,repairConfirmedNonce='',repairContext='',repairError='',repairEnabled=false,repairPending=false,repairIntentSerial=0;
let combatWorld={context:'world-a'},combatPacket={repairPolicy:{...baseAck}};
const state={battleActive:true,stopNonce:null};
const window={Module:{calledRun:true,FS:nativeFS},__towersHtml:{isEnded:()=>false}};
function refreshCombatSelection(){}
`+['repairPolicyMatches','repairCanToggle','paintRepairMode','resetRepairPolicy','refreshRepairPolicy','toggleRepairPolicy','exactCombatSelection'].map(name=>extract(shared,name)).join('\n'));
function ackOffline(patch){evaluate(offline,`combatPacket.repairPolicy={...baseAck,managed:true,requestNonce:repairIntent?.nonce||'',enabled:repairRequested,applied:true,pending:false,...${literal(patch)}};refreshRepairPolicy();`);}
checked('Offline unmanaged native save stances cause no initial write',()=>{
  evaluate(offline,'refreshRepairPolicy()');assert.equal(evaluate(offline,'writes.length'),0);assert.equal(evaluate(offline,'repairEnabled'),false);
});
checked('Offline ON writes an atomic context-bound request and waits for native ACK',()=>{
  assert.equal(evaluate(offline,'toggleRepairPolicy()'),true);assert.equal(evaluate(offline,'writes.length'),1);
  assert.equal(evaluate(offline,'repairEnabled'),false);assert.equal(evaluate(offline,'repairPending'),true);
  assert.equal(evaluate(offline,"nodes.get('wt-repair').attrs['aria-pressed']"),'false');
  assert.equal(evaluate(offline,'writes[0].context'),'world-a');
});
checked('Offline stale context, stale nonce and unconfirmed queued stance never turn green',()=>{
  for(const patch of [{context:'old-world'},{requestNonce:'old-request'},{applied:false,pending:true},{canIssueOrders:false}]){
    ackOffline(patch);assert.equal(evaluate(offline,'repairEnabled'),false);
  }
});
checked('Offline green follows native application and remains through newborn synchronization',()=>{
  ackOffline({});assert.equal(evaluate(offline,'repairEnabled'),true);
  ackOffline({applied:false,pending:true});assert.equal(evaluate(offline,'repairEnabled'),true);assert.equal(evaluate(offline,'repairPending'),true);
  assert.equal(evaluate(offline,"nodes.get('wt-campaign-repair').attrs['aria-pressed']"),'true');
  assert.equal(evaluate(offline,"nodes.get('wt-campaign-repair').attrs['aria-busy']"),'true');
});
checked('Offline OFF clears green immediately and ignores the older ON acknowledgement',()=>{
  const old=evaluate(offline,'repairIntent.nonce');assert.equal(evaluate(offline,'toggleRepairPolicy()'),false);
  assert.equal(evaluate(offline,'repairEnabled'),false);assert.notEqual(evaluate(offline,'repairIntent.nonce'),old);
  ackOffline({enabled:true,requestNonce:old});assert.equal(evaluate(offline,'repairEnabled'),false);assert.equal(evaluate(offline,'repairPending'),true);
  ackOffline({});assert.equal(evaluate(offline,'repairPending'),false);
});
checked('Offline rapid ON-OFF keeps only newest native intent authoritative',()=>{
  evaluate(offline,'toggleRepairPolicy(true)');const old=evaluate(offline,'repairIntent.nonce');evaluate(offline,'toggleRepairPolicy(false)');
  ackOffline({enabled:true,requestNonce:old});assert.equal(evaluate(offline,'repairEnabled'),false);
});
checked('Offline new native context resets global toggle without overwriting loaded stances',()=>{
  const before=evaluate(offline,'writes.length');evaluate(offline,"combatWorld={context:'world-b'};combatPacket.repairPolicy={...baseAck,context:'world-b'};refreshRepairPolicy();");
  assert.equal(evaluate(offline,'repairRequested'),null);assert.equal(evaluate(offline,'writes.length'),before);assert.equal(evaluate(offline,'repairEnabled'),false);
});
checked('Offline missing owner acknowledgement and duel mode cannot write a repair policy',()=>{
  const before=evaluate(offline,'writes.length');evaluate(offline,'combatPacket.repairPolicy.canIssueOrders=false;');assert.equal(evaluate(offline,'toggleRepairPolicy()'),false);
  evaluate(offline,"combatPacket.repairPolicy.canIssueOrders=true;window.__warzoneDuelConfig={mode:'duel'};");assert.equal(evaluate(offline,'toggleRepairPolicy()'),false);
  assert.equal(evaluate(offline,'writes.length'),before);
});
const allowedLine=mp.split(/\r?\n/).find(line=>line.trimStart().startsWith('const ordersAllowed='));assert(allowedLine);
const multiplayer=context(nodeStub+`
let repairRequested=null,repairIntent=null,repairContext='',repairConfirmedNonce='',repairEnabled=false,repairPending=false,repairError='';
let enabled=true,phase='game',combatPageHidden=false,combatContext='world-a',stopped=false,repairSerial=0;
const document={hidden:false};const module={FS:nativeFS};
const native={state:{worldReady:true,canIssueOrders:true,spectator:false,player:1,realPlayer:1,combatLock:{context:'world-a'},repairPolicy:{...baseAck}},repairPolicyIntent:null};
const window={PcMultiplayerNative:native,PcMultiplayerState:native.state};
function fail(error){throw error;}
function refreshCombatLock(){refreshRepairPolicy();}
`+allowedLine+'\n'+extract(adapter,'setRepairPolicy')+'\nnative.setRepairPolicy=setRepairPolicy;\n'+
['repairPolicyMatches','resetRepairPolicy','repairCanToggle','refreshRepairPolicy','toggleRepairPolicy','exactCombatSelection'].map(name=>extract(mp,name)).join('\n'));
function ackMP(patch){evaluate(multiplayer,`native.state.repairPolicy={...baseAck,managed:true,requestNonce:repairIntent?.nonce||'',enabled:repairRequested,applied:true,pending:false,...${literal(patch)}};refreshRepairPolicy();`);}
checked('MP actual adapter writes no unmanaged initial policy and waits for matching applied ACK',()=>{
  evaluate(multiplayer,'refreshRepairPolicy()');assert.equal(evaluate(multiplayer,'writes.length'),0);
  assert.equal(evaluate(multiplayer,'toggleRepairPolicy()'),true);assert.equal(evaluate(multiplayer,'writes.length'),1);assert.equal(evaluate(multiplayer,'repairEnabled'),false);
  for(const patch of [{context:'old-world'},{requestNonce:'old-request'},{applied:false,pending:true}]){ackMP(patch);assert.equal(evaluate(multiplayer,'repairEnabled'),false);}
  ackMP({});assert.equal(evaluate(multiplayer,'repairEnabled'),true);
});
checked('MP native acknowledged ON survives newborn pending; OFF cancels its visual latch',()=>{
  ackMP({applied:false,pending:true});assert.equal(evaluate(multiplayer,'repairEnabled'),true);assert.equal(evaluate(multiplayer,'repairPending'),true);
  const old=evaluate(multiplayer,'repairIntent.nonce');evaluate(multiplayer,'toggleRepairPolicy(false)');ackMP({enabled:true,requestNonce:old});
  assert.equal(evaluate(multiplayer,'repairEnabled'),false);ackMP({});assert.equal(evaluate(multiplayer,'repairPending'),false);
});
checked('MP spectator, viewed-player mismatch, hidden page and stale context cannot write',()=>{
  const count=evaluate(multiplayer,'writes.length');
  for(const setup of ['native.state.spectator=true;','native.state.spectator=false;native.state.realPlayer=13;',
      'native.state.realPlayer=1;document.hidden=true;','document.hidden=false;native.state.repairPolicy.context="old-world";']){
    evaluate(multiplayer,setup);assert.equal(evaluate(multiplayer,'toggleRepairPolicy(true)'),false);
  }
  assert.equal(evaluate(multiplayer,'writes.length'),count);assert.equal(evaluate(multiplayer,'repairEnabled'),false);
});
checked('MP raw native adapter rejects malformed/stale/foreign repair requests',()=>{
  evaluate(multiplayer,"native.state.repairPolicy={...baseAck};document.hidden=false;");
  const count=evaluate(multiplayer,'writes.length');
  for(const request of [{enabled:true,context:'old-world'},{enabled:'true',context:'world-a'},{enabled:true,context:''}])assert.equal(evaluate(multiplayer,`setRepairPolicy(${literal(request)})`),false);
  evaluate(multiplayer,'native.state.canIssueOrders=false;');assert.equal(evaluate(multiplayer,"setRepairPolicy({enabled:false,context:'world-a'})"),false);
  assert.equal(evaluate(multiplayer,'writes.length'),count);
});
const selections=[
  [{combatIds:[1,2],commandableIds:[1],protectedIds:[2],selectedIds:[1]},true],
  [{combatIds:[1,2],commandableIds:[],protectedIds:[1,2],selectedIds:[]},true],
  [{combatIds:[],commandableIds:[],protectedIds:[],selectedIds:[]},true],
  [{combatIds:[1,2],commandableIds:[1],protectedIds:[2],selectedIds:[1,2]},false],
  [{combatIds:[1,2],commandableIds:[1],protectedIds:[2],selectedIds:[3]},false],
  [{combatIds:[1,2],commandableIds:[1,1],protectedIds:[2],selectedIds:[1,1]},false],
  [{combatIds:[1,2],commandableIds:[1],protectedIds:[1],selectedIds:[1]},false],
  [{combatIds:[1,2],commandableIds:[1],protectedIds:[],selectedIds:[1]},false],
  [{combatIds:[1,2],commandableIds:[1],protectedIds:[2.1],selectedIds:[1]},false],
  [{combatIds:[1,2],selectedIds:[2,1]},true]
];
checked('Offline and MP selection ACKs require the exact commandable/protected partition',()=>{
  for(const ctx of [offline,multiplayer])for(const [value,expected]of selections)assert.equal(evaluate(ctx,`exactCombatSelection(${literal(value)})`),expected,literal(value));
});
async function orders(){
 const offlineOrder=context(`
 const window={};const state={combatLock:true,battleActive:true,queueMode:false,combatOrders:0};
 let combatActivation='activation',combatWorld={context:'world-a'},combatOrderSerial=0,combatSerial=1,combatOverride='',combatError='',clicks=0;
 let combatPacket={playing:true,combatLock:{enabled:true,activation:'activation',context:'world-a'},combatSelection:null};
 function refreshCombatLock(){}function combatNow(){return 1;}function contextualClick(){clicks++;}function feedback(){}function vibrate(){}
 `+extract(shared,'exactCombatSelection')+'\n'+extract(shared,'queueCombatOrder'));
 for(const [value,expected]of [[selections[0][0],true],[selections[1][0],false],[selections[2][0],false]]){
   evaluate(offlineOrder,'combatPacket.combatSelection='+literal(value));assert.equal(await evaluate(offlineOrder,'queueCombatOrder(20,30,false)'),expected);
 }
 assert.equal(evaluate(offlineOrder,'clicks'),1);assert.equal(evaluate(offlineOrder,'combatError'),'');
 results.checks.push('Offline mass movement dispatches ready combat only; all-repairing and empty armies no-op without timeout');
 const mpOrder=context(`
 let combatActivation='activation',combatContext='world-a',combatLock=true,combatOverride='',combatGestureSerial=1,lastError='',lastAction='';
 const window={PcMultiplayerNative:{state:{combatLock:null}}};function live(){return true;}function refreshCombatLock(){}
 `+extract(mp,'exactCombatSelection')+'\n'+extract(mp,'awaitCombatSelection'));
 for(const [value,expected]of [[selections[0][0],true],[selections[1][0],false],[selections[2][0],false]]){
   evaluate(mpOrder,'window.PcMultiplayerNative.state.combatLock={enabled:true,activation:"activation",context:"world-a",...'+literal(value)+'};');
   assert.equal(await evaluate(mpOrder,'awaitCombatSelection({combatGesture:1},0)'),expected);
 }
 assert.equal(evaluate(mpOrder,'lastError'),'');assert.equal(evaluate(mpOrder,'combatLock'),true);
 results.checks.push('MP empty/all-protected selection safely no-ops while ALL COMBAT remains latched');
}
orders().then(()=>{
 checked('All four modes use canonical controls and approved black/green Repair faces',()=>{
   assert(shared.includes("makeButton('wt-repair', 'REPAIR'"));assert(source('warzone-campaign-hud.js').includes("repair.id='wt-campaign-repair'"));
   assert(source('multiplayer/index.html').includes('id="blocknight-repair" data-command="repair"'));
   assert(source('multiplayer/session.js').includes("'blocknight-combat','blocknight-repair'"));
   const css=source('warzone/ui/towers-game-controls.css');assert(css.includes('[data-repair-enabled=true]'));assert(css.includes('--wt-button-ink:#63e682!important'));
   assert(source('warzone/ui/icons/wrench.svg').includes('<svg'));
   assert(source('multiplayer/session.js').includes("if(action==='repair')return w.PcMultiplayerControls?.toggleRepairPolicy"));
 });
 results.passed=true;results.checkCount=results.checks.length;console.log(JSON.stringify(results,null,2));
}).catch(error=>{console.error(error);process.exitCode=1;});
