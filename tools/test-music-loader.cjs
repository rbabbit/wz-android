'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),code=fs.readFileSync(path.join(root,'app/src/main/assets/warzone/music-loader.js'),'utf8');
const catalogContext={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'app/src/main/assets/warzone/music-catalog.js'),'utf8'),catalogContext);
const catalog=catalogContext.window.WarzoneMusicCatalog;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let payload;
if(process.env.WZ_MUSIC_DATA){const b=fs.readFileSync(process.env.WZ_MUSIC_DATA);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),catalog.sha256);payload=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
 for(const entry of catalog.files)assert.equal(crypto.createHash('sha256').update(b.subarray(entry.start,entry.end)).digest('hex'),entry.sha256,entry.filename);
 for(const entry of catalog.files.filter(f=>f.filename.endsWith('.opus')))assert.equal(b.toString('ascii',entry.start,entry.start+4),'OggS');
}else payload=new ArrayBuffer(catalog.bytes);
function setup(query,response){const calls={fetch:[],added:[],removed:[],files:[],failures:[]};
 const prefs=new Map();
 const module={addRunDependency:x=>calls.added.push(x),removeRunDependency:x=>calls.removed.push(x),FS_createPath(){},FS_createDataFile:(...args)=>calls.files.push(args),FS:{open:path=>({path}),read:()=>128,readFile:p=>{if(!prefs.has(p))throw Error('Missing');return prefs.get(p)},writeFile:(p,v)=>prefs.set(p,v),rename:(a,b)=>{prefs.set(b,prefs.get(a));prefs.delete(a)}}};
 const window={WarzoneMusicCatalog:catalog,BlockNightAndroid:{musicFailed:e=>calls.failures.push(e)}};
 vm.runInNewContext(code,{window,location:{search:query},URLSearchParams,Uint8Array,fetch:(...args)=>{calls.fetch.push(args);return response()}});
 return {calls,module,music:window.WarzoneMusic,window,prefs};
}
(async()=>{
 assert.equal(catalog.albums.length,4);assert.equal(catalog.files.filter(e=>e.filename.endsWith('.opus')).length,40);
 const off=setup('?music=0',()=>{throw Error('Music off must not fetch')});off.music.prepare(off.module);assert.equal(off.calls.fetch.length,0);assert.equal(off.calls.added.length,0);
 const on=setup('?music=1&music_probe=1',async()=>({ok:true,arrayBuffer:async()=>payload}));on.music.prepare(on.module);
 assert.equal(on.calls.removed.length,0);await tick();
 assert.equal(on.calls.fetch.length,1);assert.equal(on.calls.fetch[0][0],'/warzone/optional/music-v1.data','runtime reads only the verified local copy of the VPS download');
 assert.equal(on.calls.files.length,55);assert.equal(on.music.report().loaded,true);assert.deepEqual(on.calls.added,on.calls.removed);
 for(let i=0;i<catalog.files.length;i++){const e=catalog.files[i],[dir,name,view,r,w,own]=on.calls.files[i];assert.equal(dir+'/'+name,e.filename);assert.equal(view.buffer,payload,'original buffer bytes are mounted unchanged');assert.equal(view.byteOffset,e.start);assert.equal(view.byteLength,e.end-e.start);assert.ok(r&&w&&own)}
 for(const a of catalog.albums){const stream=on.module.FS.open('/data/music/'+a.path);on.module.FS.read(stream)}
 const track=on.module.FS.open('/data/music/menu.opus');on.module.FS.read(track);
 assert.equal(on.music.report().nativeAlbums.length,4);assert.equal(on.music.report().nativeTracks.length,1);assert.equal(on.music.report().nativeReadBytes,640);
 on.module.FS.open('/data/music/albums/original_soundtrack/albumcover.png');assert.equal(on.music.report().nativeCoverReads,1);
 assert.equal(catalog.trackIds.length,39);
 assert.equal(on.music.applySelection(on.module,'/config'),false,'missing user choice must not select the entire catalogue');
 assert.equal(on.music.report().selectedTracks.length,0);
 on.window.BlockNightAndroid.musicSelection=()=>JSON.stringify(catalog.trackIds);
 assert.equal(on.music.applySelection(on.module,'/config'),true,'all tracks require an explicit selection');
 assert.equal(on.music.report().selectedTracks.length,39);
 const selection=['original_soundtrack/track2.opus'];
 on.window.BlockNightAndroid.musicSelection=()=>JSON.stringify(selection);
 assert.equal(on.music.applySelection(on.module,'/config'),true);
 const saved=JSON.parse(on.prefs.get('/config/music.json'));
 for(const id of catalog.trackIds)assert.deepEqual(saved.tracks[id].settings.music_modes,Array(4).fill(selection.includes(id)),'each native mode must honor the exact user selection');
 assert.equal(on.prefs.has('/config/music.json.tmp'),false,'preferences must replace atomically');
 on.module.FS.open('/config/music.json');assert.equal(on.music.report().nativePreferenceOpens,1);
 for(const raw of ['[]','["../outside.opus"]','{}','not json']){
  on.window.BlockNightAndroid.musicSelection=()=>raw;
  const previous=on.prefs.get('/config/music.json');
  assert.equal(on.music.applySelection(on.module,'/config'),false);
  assert.equal(on.prefs.get('/config/music.json'),previous,'invalid/empty selections cannot overwrite working preferences');
 }
 for(const response of [async()=>({ok:false}),async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(7)}),async()=>{throw Error('Unavailable')}]){
  const bad=setup('?music=1',response);bad.music.prepare(bad.module);await tick();assert.equal(bad.calls.files.length,0);assert.equal(bad.calls.failures.length,1);assert.equal(bad.calls.removed.length,0,'failed requested music cannot silently pretend to be loaded');
 }
 console.log('PASS: Music off, four albums/40 tracks, all 55 original file views, native-read probe, failure blocking'+(process.env.WZ_MUSIC_DATA?', actual VPS pack and every original file SHA-256':''));
})().catch(error=>{console.error(error);process.exitCode=1});
