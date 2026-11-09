'use strict';
// Runs the actual loader in a deterministic Node VM. Synthetic fetch/media
// fixtures verify cancellation and failure recovery, not decoding or playback.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),sourcePath=path.join(root,'app/src/main/assets/warzone/music-loader.js');
const source=fs.readFileSync(sourcePath,'utf8'),catalogContext={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'app/src/main/assets/warzone/music-catalog.js'),'utf8'),catalogContext);
const catalog=catalogContext.window.WarzoneMusicCatalog;
const trackId='original_soundtrack/track1.opus',entry=catalog.files.find(v=>v.filename==='/data/music/albums/'+trackId),trackBytes=entry.end-entry.start;
const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function fixture(options={}){
  let now=0,serial=0;const timers=new Map(),requests=[],audios=[],created=[],revoked=[],events=new Map();
  const config={fetchMode:'ok',playMode:'playing',status:200,length:trackBytes,ignoreAbort:false,...options};
  const prefs={cached:true,enabled:true,suspended:false,mapId:'beginner',trackId,title:'Track 1',author:'Martin Severn',url:'https://appassets.androidplatform.net/warzone/optional/map-music/'+trackId};
  const listen=(target,name,fn)=>{const key=target+':'+name;if(!events.has(key))events.set(key,new Set());events.get(key).add(fn);};
  const unlisten=(target,name,fn)=>events.get(target+':'+name)?.delete(fn);
  const document={hidden:false,getElementById(){return null;},querySelector(){return null;},
    addEventListener(name,fn){listen('document',name,fn);},removeEventListener(name,fn){unlisten('document',name,fn);}};
  class LocalURL extends URL{
    static createObjectURL(blob){const url='blob:https://appassets.androidplatform.net/'+(created.length+1);created.push({url,blob});return url;}
    static revokeObjectURL(url){revoked.push(url);}
  }
  class FakeAudio{
    constructor(){this.paused=true;this.readyState=0;this.listeners=new Map();this.src='';this.calls=0;this.pending=null;audios.push(this);}
    addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
    emit(name){for(const fn of this.listeners.get(name)||[])fn();}
    play(){
      this.calls++;
      if(config.playMode==='hang'){this.pending=deferred();return this.pending.promise;}
      if(config.playMode==='reject')return Promise.reject(Error('Synthetic decoder failure'));
      this.paused=false;this.readyState=4;
      if(config.playMode==='playing')this.emit('playing');
      return Promise.resolve();
    }
    pause(){const was=this.paused;this.paused=true;if(!was)this.emit('pause');}
    removeAttribute(name){if(name==='src')this.src='';}
    load(){}
  }
  function fetchTrack(url,init){
    const request={url,init,aborted:false,deferred:deferred()};requests.push(request);
    assert.equal(init.method,'GET');assert.equal(init.cache,'no-store');
    assert.ok(!init.headers||!Object.keys(init.headers).some(k=>k.toLowerCase()==='range'),'Single-track fetch must not request a media byte range');
    assert.equal(url,prefs.url);assert.ok(!url.endsWith('music-v1.data'),'Must not fetch entire music pack');
    init.signal.addEventListener('abort',()=>{request.aborted=true;if(!config.ignoreAbort){const e=Error('Aborted');e.name='AbortError';request.deferred.reject(e);request.body?.reject(e);}});
    const response={status:config.status,headers:{get(name){return name.toLowerCase()==='content-length'?String(config.length):null;}},
      arrayBuffer(){if(config.bodyMode==='hang'){request.body=deferred();return request.body.promise;}return Promise.resolve(new ArrayBuffer(config.length));}};
    request.response=response;
    if(config.fetchMode==='ok')request.deferred.resolve(response);
    return request.deferred.promise;
  }
  const window={WarzoneMusicCatalog:catalog,BlockNightAndroid:{musicState(){return JSON.stringify(prefs);},setMusicEnabled(on,session){assert.equal(session,'fixture-session');prefs.enabled=on;return JSON.stringify(prefs);}},
    addEventListener(name,fn){listen('window',name,fn);},removeEventListener(name,fn){unlisten('window',name,fn);}};
  window.parent={document};
  const location={origin:'https://appassets.androidplatform.net',pathname:options.duel?'/warzone/index-duel.html':'/warzone/index.html',search:'?battle_session=fixture-session&map=beginner&music=1',href:'https://appassets.androidplatform.net/warzone/index.html?map=beginner'};
  const context={window,document,location,URL:LocalURL,URLSearchParams,Audio:FakeAudio,Blob,AbortController,Promise,fetch:fetchTrack,
    setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(source,context,{filename:'music-loader.js'});
  const api=window.WarzoneMusic;
  return {api,requests,audios,created,revoked,timers,config,prefs,document,
    async advance(ms){const end=now+ms;await settle();for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await settle();}now=end;await settle();},
    async emit(target,name){for(const fn of events.get(target+':'+name)||[])fn();await settle();}};
}
const results=[];
async function check(name,run){await run();results.push({name,passed:true});}
(async()=>{
  await check('Complete assigned track becomes Blob media; native engine music stays disabled',async()=>{
    const f=fixture();f.api.setBattleActive(true);await settle();
    assert.equal(f.requests.length,1);assert.equal(f.audios.length,1);assert.ok(f.audios[0].src.startsWith('blob:'));
    assert.equal(f.created[0].blob.size,trackBytes);assert.equal(f.api.report().loadedBytes,trackBytes);
    assert.equal(f.api.enabled,false);assert.equal(f.api.report().nativeMusicEnabled,false);assert.equal(f.api.report().playing,true);assert.equal(f.timers.size,0);
    f.api.setBattleActive(true);f.api.setEnabled(true);await settle();assert.equal(f.requests.length,1,'Healthy playback must not restart');
    f.api.dispose();assert.equal(f.revoked.length,1);
  });
  await check('Hung single-track fetch ends with retry message and aborted request',async()=>{
    const f=fixture({fetchMode:'hang'});f.api.setBattleActive(true);await f.advance(20000);
    assert.match(f.api.report().error,/too long to load/);assert.equal(f.api.report().loading,false);assert.equal(f.requests[0].aborted,true);
    f.api.setBattleActive(true);await settle();assert.equal(f.requests.length,1,'HUD refresh must not auto retry');
    f.api.dispose();
  });
  await check('On restarts an unresolved fetch immediately, before timeout or error',async()=>{
    const f=fixture({fetchMode:'hang'});f.api.setBattleActive(true);await settle();f.config.fetchMode='ok';f.api.setEnabled(true);await settle();
    assert.equal(f.requests.length,2);assert.equal(f.requests[0].aborted,true);assert.equal(f.api.report().playing,true);f.api.dispose();
  });
  await check('A response whose body never finishes is also bounded and explicitly retryable',async()=>{
    const f=fixture({bodyMode:'hang'});f.api.setBattleActive(true);await settle();assert.ok(f.requests[0].body);await f.advance(20000);
    assert.equal(f.requests[0].aborted,true);assert.match(f.api.report().error,/too long to load/);assert.equal(f.created.length,0);
    f.config.bodyMode='ok';f.api.setEnabled(true);await settle();assert.equal(f.api.report().playing,true);f.api.dispose();
  });
  await check('Never-settling play promise times out and a later On restarts it',async()=>{
    const f=fixture({playMode:'hang'});f.api.setBattleActive(true);await settle();await f.advance(12000);
    assert.match(f.api.report().error,/too long to start/);assert.equal(f.revoked.length,1);assert.equal(f.api.report().loading,false);
    f.config.playMode='playing';f.api.setEnabled(true);await settle();assert.equal(f.requests.length,2);assert.equal(f.api.report().playing,true);f.api.dispose();
  });
  await check('On also restarts a pending play promise before an error exists',async()=>{
    const f=fixture({playMode:'hang'});f.api.setBattleActive(true);await settle();const old=f.audios[0];
    f.config.playMode='playing';f.api.setEnabled(true);await settle();assert.equal(f.requests.length,2);assert.equal(f.api.report().playing,true);
    old.pending.resolve();await settle();assert.equal(f.audios[1].paused,false,'Old completion must not stop replacement');f.api.dispose();
  });
  await check('Resolved play promise without playing event cannot leave startup unbounded',async()=>{
    const f=fixture({playMode:'resolve-no-event'});f.api.setBattleActive(true);await settle();f.api.setBattleActive(true);await f.advance(12000);
    assert.match(f.api.report().error,/too long to start/);assert.equal(f.api.report().playing,false);assert.equal(f.revoked.length,1);f.api.dispose();
  });
  await check('Decoder/play rejection is nonfatal and only explicit On retries',async()=>{
    const f=fixture({playMode:'reject'});f.api.setBattleActive(true);await settle();assert.match(f.api.report().error,/Tap On to try again/);
    f.api.setBattleActive(true);await settle();assert.equal(f.requests.length,1);f.config.playMode='playing';f.api.setEnabled(true);await settle();assert.equal(f.api.report().playing,true);f.api.dispose();
  });
  await check('Repeated stalled events cannot perpetually extend buffering deadline',async()=>{
    const f=fixture();f.api.setBattleActive(true);await settle();const a=f.audios[0];a.emit('waiting');await f.advance(6000);a.emit('stalled');await f.advance(6000);
    assert.match(f.api.report().error,/stopped buffering/);assert.equal(f.api.report().loading,false);assert.equal(f.revoked.length,1);f.api.dispose();
  });
  await check('Playback recovery clears a buffering deadline',async()=>{
    const f=fixture();f.api.setBattleActive(true);await settle();const a=f.audios[0];a.emit('waiting');await f.advance(6000);a.emit('playing');await f.advance(12000);
    assert.equal(f.api.report().error,'');assert.equal(f.api.report().playing,true);assert.equal(f.timers.size,0);f.api.dispose();
  });
  await check('Off aborts pending IO; ignored late fetch completion cannot create audio',async()=>{
    const f=fixture({fetchMode:'hang',ignoreAbort:true});f.api.setBattleActive(true);await settle();const r=f.requests[0];f.api.setEnabled(false);r.deferred.resolve(r.response);await settle();
    assert.equal(r.aborted,true);assert.equal(f.audios.length,0);assert.equal(f.created.length,0);assert.equal(f.timers.size,0);assert.equal(f.api.report().enabled,false);f.api.dispose();
  });
  await check('Background aborts fetch; resume uses fresh current metadata',async()=>{
    const f=fixture({fetchMode:'hang'});f.api.setBattleActive(true);await settle();f.prefs.suspended=true;f.api.setSuspended(true);
    assert.equal(f.requests[0].aborted,true);assert.equal(f.timers.size,0);f.config.fetchMode='ok';f.prefs.suspended=false;f.api.setSuspended(false);await settle();
    assert.equal(f.requests.length,2);assert.equal(f.api.report().playing,true);f.api.dispose();
  });
  await check('Off, hidden document and disposal each release Blob/player without changing native audio',async()=>{
    const f=fixture();f.api.setBattleActive(true);await settle();f.api.setEnabled(false);assert.equal(f.revoked.length,1);
    f.api.setEnabled(true);await settle();f.document.hidden=true;await f.emit('document','visibilitychange');assert.equal(f.revoked.length,2);
    f.document.hidden=false;await f.emit('document','visibilitychange');f.api.dispose();assert.equal(f.revoked.length,3);assert.equal(f.api.enabled,false);assert.equal(f.timers.size,0);
  });
  await check('Disposed player ignores late play promise and media events',async()=>{
    const f=fixture({playMode:'hang'});f.api.setBattleActive(true);await settle();const a=f.audios[0];f.api.dispose();a.pending.resolve();a.emit('playing');await settle();
    assert.equal(f.api.report().disposed,true);assert.equal(f.api.report().playing,false);assert.equal(a.paused,true);assert.equal(f.revoked.length,1);assert.equal(f.timers.size,0);
  });
  await check('Truncated track and partial HTTP response fail without exposing media Blob',async()=>{
    for(const config of [{length:trackBytes-1},{status:206}]){
      const f=fixture(config);f.api.setBattleActive(true);await settle();assert.notEqual(f.api.report().error,'');assert.equal(f.created.length,0);assert.equal(f.audios.length,0);assert.equal(f.api.report().loading,false);f.api.dispose();
    }
  });
  await check('Retained Duel initialization still uses its native playlist path',async()=>{
    const f=fixture({duel:true});assert.equal(f.api.enabled,true);assert.equal(f.api.report().transport,undefined);assert.equal(f.requests.length,0);
  });
  const report={schemaVersion:1,scope:'Deterministic Node VM checks of actual loader with synthetic fetch/media and clock. No browser decoder, audible playback, Android UI, emulator or gameplay execution.',
    source:'app/src/main/assets/warzone/music-loader.js',sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),
    sources:[{path:'app/src/main/assets/warzone/music-loader.js',sha256:crypto.createHash('sha256').update(source).digest('hex')},
      {path:'tools/check-map-music-022.cjs',sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}],
    emulatorUsed:false,playbackVerified:false,runtimeVerified:false,simulatedSourceChecks:true,checks:results};
  const index=process.argv.indexOf('--report');if(index>=0){const out=path.resolve(process.argv[index+1]);fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({passed:results.length,simulatedSourceChecks:true,emulatorUsed:false,playbackVerified:false,checks:results.map(v=>v.name)},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
