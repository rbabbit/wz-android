'use strict';
// Executes the actual selection observers and header clients in bounded VM
// fixtures. Native eligibility/rendering and Android geometry need APK evidence.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'app/src/main/assets');
const read=name=>fs.readFileSync(path.join(assets,name),'utf8');
const touch=read('warzone-touch-controls.js'),mp=read('multiplayer/session.js'),campaign=read('warzone-campaign-hud.js');
const checks=[];
const check=(name,run)=>{run();checks.push(name);console.log('PASS '+name);};
const between=(s,start,end)=>{const a=s.indexOf(start),b=s.indexOf(end,a);assert(a>=0&&b>a,start);return s.slice(a,b);};
function node(){const classes=new Set();return{dataset:{},attributes:{},style:{},disabled:false,classList:{toggle:(k,on)=>on?classes.add(k):classes.delete(k),contains:k=>classes.has(k)},setAttribute(k,v){this.attributes[k]=v;}};}
function offline(){
 let now=1000,packet={schemaVersion:89,frame:1,gameTime:2000,realTime:4000,player:0,playing:true,worldSafe:true,combatSelection:{player:0,combatIds:[11,12],selectedIds:[11,12]}};
 const header=node(),cam=node(),doc={hidden:false,getElementById:id=>({'wt-all-combat':header,'wt-campaign-all-combat':cam}[id]||null)};
 const state={battleActive:true,hudVisible:true},window={__towersHtml:{session:'match1',isEnded:()=>false}};
 const module=()=>({FS:{readFile:()=>JSON.stringify(packet)}});window.LaunchedModule=module();
 const context=vm.createContext({window,document:doc,state,commandDocument:()=>doc,Date:{now:()=>now},performance:{now:()=>now},JSON,Number,Set});
 vm.runInContext(between(touch,'  let combatSelectionWatch =','  function updateCombatHud()')+'\nthis.refresh=refreshCombatSelection;this.actual=()=>allCombatSelected;',context);
 return{context,window,state,header,cam,doc,get packet(){return packet;},set packet(v){packet=v;},refresh:()=>context.refresh(),tick(ms=150){now+=ms;},advance(){packet.frame++;packet.gameTime+=100;packet.realTime+=150;now+=150;return context.refresh();},newModule(){window.LaunchedModule=module();}};
}
function multiplayer(){
 let now=1000;const button=node(),document={hidden:false};
 const value={phase:'game',worldReady:true,worldSafe:true,canIssueOrders:true,spectator:false,player:0,realPlayer:0,gameTime:2000,view:{frame:1},combatLock:{enabled:false,combatIds:[11,12],selectedIds:[11,12]}};
 const controls={combatLock:false,combatLockSuspended:false},child={PcMultiplayerNative:{state:value},PcMultiplayerControls:{report:()=>controls}};
 const session={phase:'game'},context=vm.createContext({document,session,child:()=>child,ownerAllowed:()=>value.canIssueOrders&&!value.spectator,generation:1,Date:{now:()=>now},performance:{now:()=>now},byId:()=>button,Number,Set});
 vm.runInContext(between(mp,' let combatSelectionWatch=null;',' function syncChrome()')+'\nthis.sync=syncCombatButton;',context);
 return{button,document,value,session,controls,context,sync:()=>context.sync(),advance(){value.view.frame++;value.gameTime+=100;now+=250;context.sync();},tick(ms){now+=ms;}};
}
check('Offline requires advancing current native frames, then confirms exact selection with lock off',()=>{
 const f=offline();assert.equal(f.refresh(),false);assert.equal(f.advance(),true);assert.equal(f.header.dataset.combatSelected,'true');assert.equal(f.cam.classList.contains('active'),true);assert.equal(f.state.combatLock,undefined);
});
check('Offline rejects empty, partial, mixed, duplicate and malformed native ID sets',()=>{
 const f=offline();f.refresh();f.advance();
 for(const [combat,selected]of[[[],[]],[[11,12],[11]],[[11,12],[11,99]],[[11,11],[11,11]],[[11,12],[11,'12']]]){f.packet.combatSelection={player:0,combatIds:combat,selectedIds:selected};assert.equal(f.advance(),false);}
 f.packet.combatSelection={player:1,combatIds:[11],selectedIds:[11]};assert.equal(f.advance(),false);
});
check('Offline clears stale, unsafe, hidden, ended, changed-player/module/session and rewound world observations',()=>{
 const f=offline();f.refresh();assert.equal(f.advance(),true);f.tick(1500);assert.equal(f.refresh(),false);assert.equal(f.advance(),true);
 for(const patch of[{worldSafe:false},{playing:false},{schemaVersion:88}]){const before={...f.packet};Object.assign(f.packet,patch);assert.equal(f.refresh(),false);f.packet=before;assert.equal(f.advance(),false);assert.equal(f.advance(),true);}
 f.doc.hidden=true;assert.equal(f.refresh(),false);f.doc.hidden=false;
 f.state.battleActive=false;assert.equal(f.refresh(),false);f.state.battleActive=true;
 f.newModule();assert.equal(f.refresh(),false);assert.equal(f.advance(),true);
 f.window.__towersHtml.session='match2';assert.equal(f.refresh(),false);assert.equal(f.advance(),true);
 f.packet.player=1;f.packet.combatSelection.player=1;assert.equal(f.advance(),false);assert.equal(f.advance(),true);
 f.packet.gameTime=0;assert.equal(f.advance(),false);assert.equal(f.advance(),true);
 f.window.__towersHtml.isEnded=()=>true;assert.equal(f.refresh(),false);
 f.packet=null;assert.equal(f.refresh(),false);assert.equal(f.header.dataset.combatSelected,'false');
});
check('MP display follows exact native selection independently of acknowledged lock intent',()=>{
 const f=multiplayer();f.sync();assert.equal(f.button.dataset.combatSelected,'false');f.advance();assert.equal(f.button.dataset.combatSelected,'true');assert.equal(f.button.attributes['aria-pressed'],'false');
 f.controls.combatLock=true;f.value.combatLock.selectedIds=[11];f.advance();assert.equal(f.button.dataset.combatSelected,'false');assert.equal(f.button.attributes['aria-pressed'],'true');
 f.value.combatLock.selectedIds=[11,12];f.advance();assert.equal(f.button.classList.contains('active'),true);
});
check('Wall-clock reversal cannot extend the native freshness window',()=>{
 const f=offline();f.refresh();assert.equal(f.advance(),true);f.context.Date.now=()=>-100000;f.tick(1500);assert.equal(f.refresh(),false);
 const m=multiplayer();m.sync();m.advance();m.context.Date.now=()=>-100000;m.tick(1500);m.sync();assert.equal(m.button.dataset.combatSelected,'false');
});
check('MP fails closed for stale, spectator, viewed-other-player, unsafe and transitioned sessions',()=>{
 const f=multiplayer();f.sync();f.advance();f.tick(1500);f.sync();assert.equal(f.button.dataset.combatSelected,'false');f.advance();
 for(const patch of[{spectator:true},{realPlayer:1},{canIssueOrders:false},{worldSafe:false},{phase:'room'}]){const before={...f.value};Object.assign(f.value,patch);f.sync();assert.equal(f.button.dataset.combatSelected,'false');Object.assign(f.value,before);f.advance();assert.equal(f.button.dataset.combatSelected,'false');f.advance();assert.equal(f.button.dataset.combatSelected,'true');}
 f.context.generation++;f.sync();assert.equal(f.button.dataset.combatSelected,'false');f.advance();assert.equal(f.button.dataset.combatSelected,'true');
 f.value.combatLock.selectedIds=[11,99];f.advance();assert.equal(f.button.dataset.combatSelected,'false');f.session.phase='lobby';f.sync();assert.equal(f.button.attributes['aria-pressed'],'false');
});
check('Campaign keeps lock aria intent but visual selection comes only from native observer',()=>{
 const button=node(),footer=node(),hud=node(),state={snapshot:{},frame:{},ended:false,allCombat:true};let actual=false;
 const context=vm.createContext({state,window:{__kalaWarzoneTouch:{report:()=>({allCombatSelected:actual})}},element:id=>({'wt-campaign-all-combat':button,'blocknight-select-all':footer,'blocknight-combat-hud':hud}[id]||null),nativeUiActive:()=>false,install(){}});
 vm.runInContext(between(campaign,'  function render() {','  function accept(')+'\nthis.render=render;',context);
 context.render();assert.equal(button.attributes['aria-pressed'],'true');assert.equal(button.classList.contains('active'),false);assert.equal(footer.classList.contains('active'),true);
 actual=true;context.render();assert.equal(button.dataset.combatSelected,'true');state.allCombat=false;context.render();assert.equal(button.attributes['aria-pressed'],'false');assert.equal(button.classList.contains('active'),true);
});
check('Towers and FFA restore one header control while Campaign and legacy Duel retain their existing layouts',()=>{
 const code=between(touch,'      const orderGroup =','      const techGroup =');
 for(const mode of['towers','ffa','campaign','duel']){const made=[],context={document:{createElement:()=>({append(){},appendChild(v){made.push(v);}})},all:{},auto:{},box:{},queue:{},stop:{},base:{},campaign:mode==='campaign',state:{combatLock:false},window:{__warzoneCommands:{tower:true},__warzoneDuelConfig:mode==='duel'?{mode:'duel'}:undefined},makeButton:(id,label,title,action)=>({id,label,title,action,dataset:{},setAttribute(){}})};vm.runInNewContext(code,context);assert.equal(made.filter(v=>v.id==='wt-all-combat').length,['towers','ffa'].includes(mode)?1:0);}
});
for(const [name,source]of[['touch',touch],['campaign',campaign],['mp',mp]])new vm.Script(source,{filename:name});
const report={passed:true,checks,scope:'Actual JavaScript observers and header clients in VM fixtures; no APK/native rendering or browser geometry claims.',sources:['warzone-touch-controls.js','warzone-campaign-hud.js','multiplayer/session.js','warzone/ui/towers-game-controls.css'].map(name=>({path:name,sha256:crypto.createHash('sha256').update(read(name)).digest('hex')}))};
fs.writeFileSync(path.join(root,'release-records/all-combat-ui-089-checks.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,checks:checks.length}));
