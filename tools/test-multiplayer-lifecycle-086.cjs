'use strict';
// Execute shipped scheduling and directory code with deterministic browser/API
// fixtures. Android scheduling and native connection survival need the APK test.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process'),os=require('node:os');
const root=path.resolve(__dirname,'..'),mp='app/src/main/assets/multiplayer/',java='app/src/main/java/com/rbabbit/blocknight/warzone/';
const files=[mp+'background-frames.js',mp+'lobby-ui.js',mp+'native-landing.js',mp+'session.js',mp+'engine.html',java+'MultiplayerActivity.java',java+'MultiplayerSessionService.java',java+'MultiplayerLobbyView.java','tools/test-multiplayer-lifecycle-086.cjs'];
const read=name=>fs.readFileSync(path.join(root,name),'utf8'),checks=[];
async function check(label,fn){await fn();checks.push(label);console.log('PASS '+label);}
const ticks=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function frames(){
 let clock=0,serial=0;const callbacks=new Map(),cancelled=[],events=new Map();
 const s={performance:{now:()=>clock},parent:{PcMultiplayerSession:{background:false}},requestAnimationFrame(cb){const id=++serial;callbacks.set(id,cb);return id;},cancelAnimationFrame(id){cancelled.push(id);callbacks.delete(id);},addEventListener:(name,fn)=>events.set(name,fn)};
 vm.runInNewContext(read(mp+'background-frames.js'),s);
 return{s,callbacks,cancelled,api:s.PcBackgroundFrames,now(value){clock=value;},fire(id,time=clock){const cb=callbacks.get(id);callbacks.delete(id);cb?.(time);},hide:()=>events.get('pagehide')()};
}
const raw=JSON.stringify({id:'room',name:'Waiting room',map:'Actual map',players:{cur:1,max:4},v:'4.7.0',netv:[16384,104],conn:['tcp:ip4']});
function directory(){
 let clock=10000,fetches=0,failure=null;const nodes=new Map(),events=new Map(),timers=new Map(),published=[];let seq=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',children:[],checked:false,style:{setProperty(){}},dataset:{},clientHeight:300,replaceChildren(){this.children=[];},append(...v){this.children.push(...v);},setAttribute(){},addEventListener(name,fn){events.set(id+':'+name,fn);}});return nodes.get(id);};
 const s={Date:{now:()=>clock},console:{warn(){}},innerWidth:1000,innerHeight:500,PcMultiplayerSession:{active:false},PcNativeLobby:{publish:value=>published.push(value)},localStorage:{getItem(){return null;}},setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>events.set(name,fn),document:{readyState:'loading',hidden:false,querySelector:id=>node(id.slice(1)),createElement:()=>node('new'+nodes.size),addEventListener:(name,fn)=>events.set(name,fn)},fetch:async()=>{fetches++;if(failure)throw Error(failure);return{ok:true,text:async()=>raw};}};
 vm.runInNewContext(read(mp+'lobby-ui.js'),s);
 return{s,node,events,published,api:s.PcLobbyUi,wire:()=>events.get('DOMContentLoaded')(),fail(value){failure=value;},advance(ms){clock+=ms;},fetches:()=>fetches,timers};
}
(async()=>{let fatal;try{
 await check('Foreground uses original RAF, preserves timestamps and supports cancellation',()=>{
  const f=frames(),seen=[];const a=f.s.requestAnimationFrame(t=>seen.push(t)),b=f.s.requestAnimationFrame(t=>seen.push(t));f.s.cancelAnimationFrame(b);
  assert.equal(f.callbacks.size,1);f.fire([...f.callbacks.keys()][0],23.5);assert.deepEqual(seen,[23.5]);assert.equal(f.api.pulse(),false);assert.equal(f.api.report().pending,0);assert.equal(a,1);
 });
 await check('Background pulse advances one pending generation, never runs cancelled/native callbacks twice',()=>{
  const f=frames();let count=0;function frame(){count++;if(count<3)f.s.requestAnimationFrame(frame);}
  f.s.requestAnimationFrame(frame);const nativeCallback=[...f.callbacks.values()][0];f.api.setBackground(true);f.now(100);assert.equal(f.api.pulse(),true);assert.equal(count,1);nativeCallback(100);assert.equal(count,1);
  f.now(110);assert.equal(f.api.pulse(),false);assert.equal(count,1);f.now(134);f.api.pulse();assert.equal(count,2);assert.equal(f.api.report().pending,1);
  f.api.setBackground(false);f.now(200);assert.equal(f.api.pulse(),false);f.fire([...f.callbacks.keys()][0],201);assert.equal(count,3);
 });
 await check('Recents compositor frames and background pulses cannot multiply frame rate; disposal drains pending work',()=>{
  const f=frames();let count=0;f.api.setBackground(true);f.s.requestAnimationFrame(()=>count++);f.fire([...f.callbacks.keys()][0],100);f.s.requestAnimationFrame(()=>count++);f.now(115);assert.equal(f.api.pulse(),false);assert.equal(count,1);f.hide();assert.equal(f.callbacks.size,0);f.now(300);assert.equal(f.api.pulse(),false);assert.equal(count,1);
 });
 await check('Activity background callback releases input and preserves the same active session and child',()=>{
  const source=read(mp+'session.js'),snippet=source.slice(source.indexOf(' session.setBackground='),source.indexOf(' function viewport()'));
  let releases=0,pulses=0;const changes=[],child={PcBackgroundFrames:{setBackground:v=>changes.push(v),pulse(){pulses++;}},PcMultiplayerControls:{releaseAll(){releases++;}}},session={active:true},s={session,child:()=>child,record(){}};
  vm.runInNewContext(snippet,s);session.setBackground(true);session.backgroundPulse();session.setBackground(false);session.backgroundPulse();assert.equal(session.active,true);assert.equal(releases,1);assert.equal(pulses,1);assert.deepEqual(changes,[true,false]);session.active=false;session.setBackground(true);session.backgroundPulse();assert.equal(pulses,1);
 });
 await check('Actual Java Join protection precedes posted UI work and survives immediate Home without duplicate service starts',()=>{
  const activity=read(java+'MultiplayerActivity.java');function method(name){const start=activity.indexOf('  private void '+name+'(');assert(start>=0);let at=activity.indexOf('{',start),depth=1,end=at+1;for(;depth&&end<activity.length;end++){if(activity[end]==='{')depth++;if(activity[end]==='}')depth--;}assert.equal(depth,0);return activity.slice(start,end);}
  const setter=activity.slice(activity.indexOf('@JavascriptInterface public void setSessionActive('),activity.indexOf('@JavascriptInterface public void landingReady('));assert(setter.indexOf('startSessionProtectionFromJoin()')<setter.indexOf('runOnUiThread('));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mp-protection-086-')),source=`import java.util.*;import java.util.concurrent.atomic.AtomicBoolean;
   final class SessionProtection086 {static final String TAG="test";final Object sessionProtectionLock=new Object();final AtomicBoolean destroyed=new AtomicBoolean();volatile boolean sessionActive,activityResumed;boolean sessionServiceStarted,backgroundPulsePending,reject;int starts,updates,stops,attempts;
    static class Intent {Intent(Object a,Class<?> b){}Intent putExtra(String key,boolean value){return this;}}
    static class MultiplayerSessionService {static final String BACKGROUND="background";}static class Log {static void w(String t,String m,Exception e){}}
    static class Handler {int posts;void removeCallbacks(Runnable r){}void post(Runnable r){posts++;}}final Handler lifecycleHandler=new Handler();final Runnable backgroundPulse=()->{};
    static class Web {void syncSessionVisibility(){}}Web webView=new Web();
    void startForegroundService(Intent i){attempts++;if(reject)throw new IllegalStateException("restricted");starts++;}void startService(Intent i){updates++;}void stopService(Intent i){stops++;}
    ${method('startSessionProtectionFromJoin')} ${method('syncSessionProtection')}
    static void check(boolean v,String why){if(!v)throw new AssertionError(why);}
    public static void main(String[] args)throws Exception{SessionProtection086 v=new SessionProtection086();v.sessionActive=true;v.activityResumed=true;
     v.startSessionProtectionFromJoin();check(v.starts==1,"Join deferred service start");v.activityResumed=false;v.syncSessionProtection();check(v.starts==1&&v.updates==1&&v.lifecycleHandler.posts==1,"Immediate Home lost or duplicated protection");
     List<Thread> threads=new ArrayList<>();for(int i=0;i<20;i++){Thread t=new Thread(v::startSessionProtectionFromJoin);threads.add(t);t.start();}for(Thread t:threads)t.join();check(v.starts==1,"Concurrent bridge requests duplicated service");
     v.sessionActive=false;v.syncSessionProtection();v.startSessionProtectionFromJoin();check(v.stops==1&&!v.sessionServiceStarted&&v.starts==1,"Ended session resurrected");
     SessionProtection086 w=new SessionProtection086();w.sessionActive=true;w.activityResumed=true;w.reject=true;w.startSessionProtectionFromJoin();check(!w.sessionServiceStarted,"Rejected service reported as started");w.activityResumed=false;w.syncSessionProtection();check(w.attempts==1,"Background retried restricted service");w.reject=false;w.activityResumed=true;w.syncSessionProtection();check(w.starts==1&&w.sessionServiceStarted,"Foreground return did not retry once");
     w.destroyed.set(true);w.syncSessionProtection();w.startSessionProtectionFromJoin();check(w.stops==1&&w.starts==1,"Destroyed Activity retained service");
     System.out.println("Actual Java lifecycle protection: immediate Home, concurrent start, end, restriction, resume and destroy passed");}}
  `;
  try{const file=path.join(dir,'SessionProtection086.java'),jbr=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';fs.writeFileSync(file,source);cp.execFileSync(path.join(jbr,'bin/javac.exe'),['-encoding','UTF-8','-d',dir,file],{stdio:'pipe'});cp.execFileSync(path.join(jbr,'bin/java.exe'),['-cp',dir,'SessionProtection086'],{stdio:'pipe'});}finally{assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(dir).startsWith('mp-protection-086-'));fs.rmSync(dir,{recursive:true,force:true});}
 });
 await check('Initial DNS failure is short and actionable, with no exception dump',async()=>{
  const f=directory();f.fail('UnknownHostException: Unable to resolve host "wzlobby.wz2100.net": No address associated with hostname');f.wire();await ticks();const state=f.api.snapshot();assert.equal(state.loading,false);assert.equal(state.games.length,0);assert.match(state.error,/DNS lookup failed/);assert.doesNotMatch(state.error,/UnknownHostException|wzlobby|No address/);assert(state.error.length<130);assert.equal(f.node('rooms').children[0].textContent,state.error);assert.equal(f.timers.size,0);
 });
 await check('Directory outage retains the last actual list and labels it stale; success clears the error',async()=>{
  const f=directory();f.wire();await ticks();assert.equal(f.api.snapshot().games[0].id,'room');f.fail('offline');await f.s.refreshPcLobby();assert.equal(f.api.snapshot().games[0].id,'room');assert.equal(f.api.snapshot().stale,true);assert.match(f.api.snapshot().error,/Showing the last room list/);f.fail(null);await f.s.refreshPcLobby();assert.equal(f.api.snapshot().stale,false);assert.equal(f.api.snapshot().error,'');
 });
 await check('Live room/match fences manual, online, visibility and native resume directory fetches',async()=>{
  const f=directory();f.wire();await ticks();f.s.PcMultiplayerSession.active=true;f.advance(60000);await f.s.refreshPcLobby();f.events.get('online')();f.events.get('visibilitychange')();assert.equal(f.api.resume(),false);await ticks();assert.equal(f.fetches(),1);assert.equal(f.s.PcMultiplayerSession.active,true);
 });
 await check('Resume/network retry is bounded by cooldown, in-flight state and freshness',async()=>{
  const f=directory();f.fail('offline');f.wire();await ticks();assert.equal(f.api.resume(),false);f.advance(6000);assert.equal(f.api.resume(),true);assert.equal(f.api.resume(),false);await ticks();assert.equal(f.fetches(),2);f.fail(null);f.advance(6000);f.events.get('online')();await ticks();assert.equal(f.fetches(),3);f.advance(6000);assert.equal(f.api.resume(),false);f.advance(30000);assert.equal(f.api.resume(),true);await ticks();assert.equal(f.fetches(),4);
 });
 await check('Native list shows directory error once and keeps independent host-return notices',()=>{
  const view=read(java+'MultiplayerLobbyView.java'),start=view.indexOf('    void state(');let at=view.indexOf('{',start),depth=1,end=at+1;for(;depth&&end<view.length;end++){if(view[end]==='{')depth++;if(view[end]==='}')depth--;}assert.equal(depth,0);const method=view.slice(start,end),dir=fs.mkdtempSync(path.join(os.tmpdir(),'mp-lobby-error-086-'));
  const source=`import java.util.*; final class LobbyError086 {
   static final int GONE=8,VISIBLE=0;boolean ready,loading,busy,settingFilter;List<MultiplayerLobbyModel.Room> rooms=List.of();
   static class MultiplayerLobbyModel {static class Room {boolean empty;Room(boolean value){empty=value;}}}
   static class Text {String value="";int visibility;void setText(String text){value=text;}void setVisibility(int v){visibility=v;}}
   static class Filter {boolean checked;void setChecked(boolean v){checked=v;}}
   Text status=new Text(),empty=new Text();Filter hide=new Filter();final Adapter adapter=new Adapter();
   class Adapter {int count;void refresh(){count=(int)rooms.stream().filter(r->!hide.checked||!r.empty).count();}int getCount(){return count;}}
   void updateControls(){} ${method}
   static void check(boolean v,String why){if(!v)throw new AssertionError(why);}
   public static void main(String[] args){LobbyError086 v=new LobbyError086();
    v.state(true,false,false,List.of(),"DNS failed","");check(v.status.visibility==GONE&&v.empty.value.equals("DNS failed"),"Fresh failure repeated");
    v.state(true,false,false,List.of(),"DNS failed","Host connection ended");check(v.status.value.equals("Host connection ended")&&v.empty.value.equals("DNS failed"),"Directory replaced host reason");
    v.state(true,false,false,List.of(new MultiplayerLobbyModel.Room(false)),"Last list is stale","");check(v.adapter.count==1&&v.status.value.equals("Last list is stale"),"Cached rows lost warning");
    v.state(true,false,true,List.of(new MultiplayerLobbyModel.Room(true)),"DNS failed","");check(v.adapter.count==0&&v.status.visibility==GONE&&v.empty.value.equals("DNS failed"),"Filtered cached rows duplicated error");
    v.state(true,true,true,List.of(new MultiplayerLobbyModel.Room(true)),"","");check(v.status.visibility==GONE&&v.empty.value.equals("Loading public rooms…"),"Empty retry repeats status");
    v.state(true,false,false,List.of(new MultiplayerLobbyModel.Room(false)),"","");check(v.status.visibility==GONE,"Successful retry kept old error");
    System.out.println("Actual native state method: six error/cache/filter/retry cases passed");}}
  `;
  try{const file=path.join(dir,'LobbyError086.java'),jbr=process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr';fs.writeFileSync(file,source);cp.execFileSync(path.join(jbr,'bin/javac.exe'),['-encoding','UTF-8','-d',dir,file],{stdio:'pipe'});cp.execFileSync(path.join(jbr,'bin/java.exe'),['-cp',dir,'LobbyError086'],{stdio:'pipe'});}finally{assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(dir).startsWith('mp-lobby-error-086-'));fs.rmSync(dir,{recursive:true,force:true});}
 });
}catch(error){fatal=error.stack||String(error);console.error(fatal);process.exitCode=1;}
const proof={version:'0.86',passed:!fatal,emulatorUsed:false,engineExecuted:false,scope:'Actual shipped MP RAF adapter, lifecycle callbacks and directory functions in deterministic host VM. Android/native survival remains a separate runtime check.',checks,checksPassed:checks.length,fatal:fatal||null,sources:files.map(name=>({path:name,sha256:crypto.createHash('sha256').update(read(name)).digest('hex')}))};
fs.mkdirSync(path.join(root,'qa/mp-updates-manufacturing-086'),{recursive:true});fs.writeFileSync(path.join(root,'qa/mp-updates-manufacturing-086/lifecycle-host.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify({passed:!fatal,checksPassed:checks.length}));})();
