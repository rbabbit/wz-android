'use strict';
// Actual native model and existing/new JS contract. No Android or network execution.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),java='app/src/main/java/com/rbabbit/blocknight/warzone/',mp='app/src/main/assets/multiplayer/',sources=new Set(),checks=[];
function read(p){sources.add(p);return fs.readFileSync(path.join(root,p),'utf8');}
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
const ui=read(mp+'lobby-ui.js'),bridge=read(mp+'native-landing.js'),activity=read(java+'MultiplayerActivity.java'),view=read(java+'MultiplayerLobbyView.java');
function fixture(lines,fail=false){
 const published=[],started=[],nativeReady=[],nativeStarted=[],listeners=[],nodes=new Map(),classes=new Set(),saved=new Map();let fetches=0;
 function node(id){if(!nodes.has(id))nodes.set(id,{id,textContent:'',value:'',checked:false,disabled:false,hidden:false,clientHeight:220,style:{setProperty(){}},dataset:{},children:[],listeners:new Map(),replaceChildren(){this.children=[];},append(...n){this.children.push(...n);},setAttribute(){},addEventListener(k,fn){this.listeners.set(k,fn);},dispatchEvent(e){this.listeners.get(e.type)?.(e);}});return nodes.get(id);}
 class Event { constructor(type){this.type=type;} }
 const doc={body:{classList:{add:v=>classes.add(v)}},readyState:'loading',getElementById:node,querySelector:s=>node(s.replace(/^#/,'')),createElement:()=>node('generated-'+nodes.size),addEventListener:(kind,fn)=>{if(kind==='DOMContentLoaded')listeners.push(fn);}};
 const s={console:{warn(){}},document:doc,Event,innerWidth:900,innerHeight:420,setTimeout(){return 1;},clearTimeout(){},addEventListener(){},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},AndroidMultiplayer:{landingReady:t=>nativeReady.push(t),landingState:(t,v)=>published.push({token:t,...JSON.parse(v)}),landingSessionStarted:t=>nativeStarted.push(t),getPlayerBaseName:()=>"Test'Name"},PcMultiplayerSession:{active:false},start(args){started.push(args);s.PcMultiplayerSession.active=true;return true;},fetch:async()=>{fetches++;if(fail)throw Error('offline');return{ok:true,text:async()=>lines};}};
 vm.runInNewContext(bridge,s);vm.runInNewContext(ui,s);listeners.forEach(fn=>fn());
 return {s,published,started,nativeReady,nativeStarted,nodes,classes,saved,fetches:()=>fetches,node};
}
const ticks=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
(async()=>{let fatal,model;try{
await check('Actual pure-Java model preserves real map/counts, hide-empty, ordering, blocked states and codepoint bounds',()=>{
 const dir=path.join(root,'qa/native-landings-084/mp-host-classes');fs.mkdirSync(dir,{recursive:true});
 const inputs=[java+'MultiplayerLobbyModel.java','tools/test-multiplayer-native-landing-084.java'];inputs.forEach(p=>sources.add(p));
 const jbr=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';cp.execFileSync(path.join(jbr,'bin/javac.exe'),['-encoding','UTF-8','-d',dir,...inputs.map(p=>path.join(root,p))],{stdio:'pipe'});
 model=JSON.parse(cp.execFileSync(path.join(jbr,'bin/java.exe'),['-cp',dir,'com.rbabbit.blocknight.warzone.CheckMultiplayerLanding084'],{encoding:'utf8'}));assert.equal(model.passed,true);assert.ok(model.assertions>=20);
});
const raw=[{type:'header',motd:'Official'},{id:'real',name:'EMAG FFA [4p]',map:'EMAJ',players:{cur:1,max:4},v:'4.7.0',netv:[16384,104],conn:['tcp:ip4']},{id:'unknown',name:'Unknown',map:'Actual map',players:{max:6},v:'4.7.0',netv:[16384,104],conn:['tcp:ip4']},{id:'empty',name:'Empty',map:'Empty map',players:{cur:0,max:4},v:'4.7.0',netv:[16384,104],conn:['tcp:ip4']},{id:'full',name:'Full',map:'Other',players:{cur:4,max:4},v:'4.7.0',netv:[16384,104],conn:['tcp:ip4']}].map(JSON.stringify).join('\n');
await check('Actual existing list parser and HTTP request publish loading and true official rows to native landing',async()=>{const f=fixture(raw);await ticks();assert.equal(f.fetches(),1);assert.equal(f.nativeReady.length,1);assert(f.classes.has('mp-native-landing'));assert(f.published.some(v=>v.loading));const last=f.published.at(-1);assert.equal(last.loading,false);assert.equal(last.games.length,4);assert.equal(last.games[0].map,'EMAJ');assert.equal(last.games[1].players.current,null);assert.equal(last.games[3].joinable,false);});
await check('Native JOIN calls the existing session with the exact advertised ID and current saved base name',async()=>{const f=fixture(raw);await ticks();assert.equal(f.s.PcNativeLobby.join('real'),true);assert.deepEqual(Array.from(f.started[0]),['--lobbyjoin=real','--window','--resolution=900x420','--noshadows']);assert.equal(f.node('player-name').value,"Test'Name");assert.equal(f.nativeStarted[0],f.nativeReady[0]);assert.equal(f.s.PcNativeLobby.join('real'),false);assert.equal(f.started.length,1);});
await check('Full/unlisted/malformed rooms cannot bypass existing Join authority',async()=>{const f=fixture(raw);await ticks();for(const id of['full','not-listed',null])assert.equal(f.s.PcNativeLobby.join(id),false);assert.equal(f.started.length,0);assert.equal(f.s.PcLobbyUi.parseListings(raw+'\n'+JSON.stringify({id:'bad',players:{cur:0.5,max:4}})).games.length,4);});
await check('Native Hide Empty uses the existing checkbox/localStorage preference and retains unknown capacity',async()=>{const f=fixture(raw);await ticks();assert.equal(f.s.PcNativeLobby.setHideEmpty(true),true);assert.equal(f.saved.get('mp.lobby.hide-empty.v1'),'1');assert.equal(f.published.at(-1).hideEmpty,true);const rows=f.s.PcLobbyUi.selectListings(f.s.PcLobbyUi.snapshot().games,true);assert.equal(rows.length,3);assert(rows.some(v=>v.id==='unknown'));assert(!rows.some(v=>v.id==='empty'));});
await check('Fetch failure and session-start failure stay on native landing with truthful retry errors',async()=>{const f=fixture('',true);await ticks();assert.match(f.published.at(-1).error,/offline/);assert.equal(f.published.at(-1).loading,false);const g=fixture(raw);await ticks();g.s.start=()=>false;g.node('profile-status').textContent='Invalid player name';assert.equal(g.s.PcNativeLobby.join('real'),false);assert.equal(g.nativeStarted.length,0);assert.equal(g.published.at(-1).error,'Invalid player name');});
await check('Native view follows approved map-first rows, CheckBox and suffix with no webpage/IP/version headings',()=>{
 assert.match(view,/new CheckBox\(context\)/);assert.match(view,/text\("\(m\)"/);assert.match(view,/new ListView\(context\)/);assert.match(view,/row\.map\.setText\(room\.mapLabel\(\)\)/);assert.match(view,/row\.details\.setText\(room\.roomLabel\(\)\)/);assert.match(view,/source\.subSequence\(start,start\+insert\.offsetByCodePoints\(0,remaining\)\)/);assert.doesNotMatch(view,/WebView|Join by IP|PLAYERS|game\.version|setText\("4\.7/);
 assert.match(read(mp+'multiplayer.css'),/body\.mp-native-landing #setup\{display:none!important\}/);assert.match(read(mp+'index.html'),/src="native-landing\.js"/);
});
await check('Actual Java IME Done listener retains error focus/keyboard on failed save and dismisses only after success',()=>{
 const body=view.match(/name\.setOnEditorActionListener\(\(v,action,event\)->\{([^\n]*)\}\);/)[1];
 const dir=path.join(root,'qa/native-landings-084/mp-host-classes'),file=path.join(dir,'CheckMpIme084.java');
 const source='package com.rbabbit.blocknight.warzone; final class CheckMpIme084 {'+
  'static final class EditorInfo {static final int IME_ACTION_DONE=6;} static boolean valid;static int saves,clears,hides;'+
  'static final class Actions {boolean saveName(String s){saves++;return valid;}} static final class Name {String getText(){return "draft";}void clearFocus(){clears++;}}'+
  'static Actions actions=new Actions();static Name name=new Name();static void hideKeyboard(){hides++;}static boolean done(int action){'+body+'}'+
  'public static void main(String[] a){valid=false;if(!done(6)||saves!=1||clears!=0||hides!=0)throw new AssertionError("Rejected name lost focus/IME");'+
  'valid=true;saves=0;if(!done(6)||saves!=1||clears!=1||hides!=1)throw new AssertionError("Accepted name did not finish");'+
  'saves=clears=hides=0;if(done(0)||saves!=0||clears!=0||hides!=0)throw new AssertionError("Unrelated action consumed");System.out.println("IME branches passed");}}';
 fs.writeFileSync(file,source);const jbr=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';
 cp.execFileSync(path.join(jbr,'bin/javac.exe'),['-encoding','UTF-8','-d',dir,file],{stdio:'pipe'});
 cp.execFileSync(path.join(jbr,'bin/java.exe'),['-cp',dir,'com.rbabbit.blocknight.warzone.CheckMpIme084'],{stdio:'pipe'});
});
await check('Native player-name field requests inline Done with no extract or fullscreen editor, leaving room IME untouched',()=>{
 const options=view.match(/name\.setImeOptions\(([^;]+)\);/)[1];
 assert.deepEqual(options.split('|').map(v=>v.trim()).sort(),['EditorInfo.IME_ACTION_DONE','EditorInfo.IME_FLAG_NO_EXTRACT_UI','EditorInfo.IME_FLAG_NO_FULLSCREEN'].sort());
 assert.equal((view.match(/setImeOptions\(/g)||[]).length,1,'Only the native landing name editor is configured');
});
await check('Activity fences stale landing callbacks, keeps opaque overlay until session start and uses IME-first Back',()=>{
 assert.match(activity,/!generation\.equals\(landingGeneration\)/);assert.match(activity,/landingSessionStarted[\s\S]*?!sessionActive[\s\S]*?nativeLobby\.setVisibility\(View\.GONE\)/);assert.match(activity,/private void returnToLobbyNative\(\)[\s\S]*?showNativeLanding\(\)[\s\S]*?webView\.loadUrl\(START_URL\)/);
 assert(activity.indexOf('if (isKeyboardVisible())')<activity.indexOf('if (!sessionActive) { if(nativeLobby'));
 assert.match(activity,/new JSONObject\(new Navigation\(\)\.setPlayerName\(base\)\)/);assert.match(activity,/landingPageReady = false/);
});
await check('Original socket/HTTP transport, native profile validation and room/game asset source are frozen versus083',()=>{
 const script="from zipfile import ZipFile\nfrom pathlib import Path\nimport json,hashlib\nr=Path('.')\nf=json.loads((r/'qa/native-landings-084/fallback.json').read_text())\nz=next(v['path'] for v in f['immutableFallbacks'] if v['path'].endswith('.zip'))\nwith ZipFile(z) as old:\n a=old.read('"+java+"MultiplayerActivity.java').decode('utf-8').replace('\\r\\n','\\n');b=(r/'"+java+"MultiplayerActivity.java').read_text()\n for start,end in [('  public final class SocketBridge',None),('  private void restorePlayerName()', '  private void fitViewport()')]:\n  x=a[a.index(start):a.index(end) if end else None];y=b[b.index(start):b.index(end) if end else None];assert x==y,start\n for name in ['room-ui.js','room-ui.css','session.js','engine.html','native-ui-adapter.js','mobile-controls.js','warzone2100.js','warzone2100.wasm','warzone2100.data']:\n  p='"+mp+"'+name;assert hashlib.sha256(old.read(p)).digest()==hashlib.sha256((r/p).read_bytes()).digest(),name\nprint('Frozen transport/profile/room/game checks passed')";
 cp.execFileSync('python',['-c',script],{cwd:root,stdio:'pipe'});
});
}catch(error){fatal=error.stack||String(error);console.error(fatal);process.exitCode=1;}
sources.add('tools/test-multiplayer-native-landing-084.cjs');
const proof={version:'0.84',passed:!fatal,emulatorUsed:false,actualAndroidViewsExecuted:false,actualNativeEngineExecuted:false,actualJavaModelExecuted:true,checks,checksPassed:checks.length,model,scope:'Actual Java lobby model and actual JS parser/native landing bridge in local VM with synthetic official responses; native View source/API compilation checked separately. No Android rendering, touch, IME or gameplay claim.',sources:[...sources].sort().map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')})),fatal:fatal||null};
fs.mkdirSync(path.join(root,'qa/native-landings-084'),{recursive:true});fs.writeFileSync(path.join(root,'qa/native-landings-084/mp-landing.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:!fatal,checksPassed:checks.length}));
})();
