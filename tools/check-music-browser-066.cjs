'use strict';
/* Real Chromium Audio/Opus regression. Only Java metadata and native context are synthetic. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..'), asset = 'app/src/main/assets/warzone/';
const helperName = 'tools/check-guide-browser-066.cjs';
const context = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(root, asset, 'music-catalog.js'), 'utf8'), context);
const catalog = context.window.WarzoneMusicCatalog;
const titles = JSON.parse(fs.readFileSync(path.join(root, asset, 'music-tracks.json'))).albums.flatMap(album => album.tracks);
const soundtrack = path.join(root, asset, 'music/music.data'), streams = [];
const escapeJS = value => JSON.stringify(value).replaceAll('<', '\\u003c');
function fixturePage(mode) {
  const tracks = catalog.playlists[mode].tracks.map(id => ({...titles.find(track => track.id === id), id, url: '/warzone/optional/map-music/' + id}));
  return `<!doctype html><meta charset="utf-8"><title>Real decoder regression fixture</title><h1>Music decoder fixture — no game engine</h1><button id="blocknight-music">MUSIC</button><script>
    window.fixtureEvents=[];window.fixtureAudios=[];window.fixtureBridgeCalls=[];
    window.fixtureCampaign={nativeState:{nativeLevel:'CAM_1A',video:false,paused:false,nativeMode:0},snapshot:{session:'synthetic-campaign-1',nativeLevel:'CAM_1A',mission:'CAM_1A'}};
    const fixtureTracks=${escapeJS(tracks)};
    function fixtureSettings(){return{mode:${escapeJS(mode)},cached:true,enabled:localStorage.getItem('fixture-music-enabled')!=='false',suspended:false,mapId:${escapeJS(mode === 'ffa' ? 'emag' : '')},missionId:'CAM_1A',tracks:fixtureTracks.map(t=>({...t,url:new URL(t.url,location.href).href}))};}
    window.BlockNightAndroid={musicState:()=>JSON.stringify(fixtureSettings()),setMusicEnabled(on,session){if(session!=='browser-fixture-session')throw Error('Wrong synthetic bridge session');localStorage.setItem('fixture-music-enabled',String(Boolean(on)));fixtureBridgeCalls.push({on:Boolean(on),session});return JSON.stringify(fixtureSettings())}};
    window.__warzoneCampaign={report:()=>fixtureCampaign};
    const OriginalAudio=window.Audio;
    window.Audio=new Proxy(OriginalAudio,{construct(target,args){const audio=Reflect.construct(target,args),number=fixtureAudios.length+1,track=window.WarzoneMusic?.report().trackId||'';audio.fixtureNumber=number;fixtureAudios.push(audio);for(const type of ['loadedmetadata','playing','pause','ended','seeked','error'])audio.addEventListener(type,event=>fixtureEvents.push({number,track,type,trusted:event.isTrusted,time:performance.now(),mediaTime:audio.currentTime,duration:Number.isFinite(audio.duration)?audio.duration:null,paused:audio.paused,ended:audio.ended,error:audio.error?.code||0}));return audio}});
    window.fixtureSnapshot=()=>{const a=fixtureAudios.at(-1);return{report:window.WarzoneMusic?.report(),audioCount:fixtureAudios.length,audio:a?{number:a.fixtureNumber,native:a instanceof HTMLAudioElement&&a.play.toString().includes('[native code]'),time:a.currentTime,duration:Number.isFinite(a.duration)?a.duration:null,ready:a.readyState,paused:a.paused,ended:a.ended,error:a.error?.code||0}:null,events:fixtureEvents.slice(),bridge:fixtureBridgeCalls.slice()}};
  </script><script src="/assets/warzone/music-catalog.js"></script><script src="/assets/warzone/music-loader.js"></script>`;
}
function streamTrack(request, response) {
  const id = decodeURIComponent(new URL(request.url, 'http://local').pathname.slice('/warzone/optional/map-music/'.length));
  const entry = catalog.files.find(file => file.filename === '/data/music/albums/' + id);
  if (!entry || request.method !== 'GET' || request.headers.range) { response.writeHead(416); response.end(); return; }
  const record = {id, start: entry.start, end: entry.end, expectedSHA256: entry.sha256, bytes: 0, complete: false, rangeRequested: false};
  streams.push(record);
  response.writeHead(200, {'Content-Type': 'audio/ogg', 'Content-Length': entry.end - entry.start, 'Cache-Control': 'no-store'});
  const hash = crypto.createHash('sha256'), input = fs.createReadStream(soundtrack, {start: entry.start, end: entry.end - 1});
  input.on('data', chunk => { record.bytes += chunk.length; hash.update(chunk); });
  input.on('end', () => { record.sha256 = hash.digest('hex'); record.complete = true; });
  input.on('error', error => { record.error = error.message; response.destroy(error); });
  input.pipe(response);
}
let helper = fs.readFileSync(path.join(root, helperName), 'utf8').split('\nasync function run() {')[0];
helper = helper.replace("qa/maps-music-066/headless-browser", "qa/maps-music-066/headless-music-browser");
const launchSeam = "'--force-device-scale-factor=1',";
if (helper.split(launchSeam).length !== 2) throw Error('Edge launch seam changed');
helper = helper.replace(launchSeam, launchSeam + " '--autoplay-policy=no-user-gesture-required', '--mute-audio',");
const serverSeam = '    let requested;';
if (helper.split(serverSeam).length !== 2) throw Error('Static-server seam changed');
helper = helper.replace(serverSeam, `
    const fixturePath=new URL(request.url,'http://local').pathname;
    if(fixturePath==='/warzone/index-ffa.html'||fixturePath==='/warzone/index-campaign.html'){
      response.writeHead(200,{'Content-Type':'text/html','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Document-Isolation-Policy':'isolate-and-require-corp'});
      response.end(fixturePage(fixturePath.includes('campaign')?'campaign':'ffa'));return;
    }
    if(fixturePath.startsWith('/warzone/optional/map-music/')){streamTrack(request,response);return;}
    let requested;`);
const runner = String.raw`
(async()=>{
  let fatal,deadline=Date.now()+55000;
  const observations=[],nativeEndOrders=[];
  const remaining=()=>Math.max(1,Math.min(3000,deadline-Date.now()));
  const snap=()=>cdp.evaluate('fixtureSnapshot()');
  async function mediaReady(label){if(Date.now()>=deadline)throw Error('55-second fixture bound reached');return until(async()=>{const s=await snap();if(s.report?.error)throw Error(s.report.error);return s.report?.playing&&s.audio?.native&&s.audio.ready>=2&&s.audio.duration>1?s:false},label,remaining())}
  async function mode(name){await cdp.send('Page.navigate',{url:origin+'/warzone/index-'+name+'.html?battle_session=browser-fixture-session'});await until(()=>cdp.evaluate('document.readyState==="complete"&&Boolean(window.WarzoneMusic)'),name+' fixture ready',remaining());await cdp.evaluate('WarzoneMusic.setBattleActive(true)')}
  async function naturalEnd(label){
    const before=await mediaReady(label+' before');
    await cdp.evaluate('(()=>{const a=fixtureAudios.at(-1);a.playbackRate=4;a.currentTime=a.duration-.12})()');
    const next=await until(async()=>{const s=await snap();if(s.report?.error)throw Error(s.report.error);return s.report?.playing&&s.report.trackId!==before.report.trackId&&s.audio?.number!==before.audio.number?s:false},label+' natural next',remaining());
    const events=next.events.filter(e=>e.number===before.audio.number),pause=events.findIndex(e=>e.type==='pause'&&e.ended),ended=events.findIndex(e=>e.type==='ended');
    assert(pause>=0&&ended>pause,label+' must observe actual pause-before-ended');
    assert(events[pause].trusted&&events[ended].trusted,label+' browser-generated media events');
    nativeEndOrders.push({label,from:before.report.trackId,to:next.report.trackId,audio:before.audio.number,order:events.map(e=>({type:e.type,ended:e.ended,time:e.time,trusted:e.trusted}))});
    return next;
  }
  async function retainedPause(label,enter,leave){
    await cdp.evaluate('(()=>{const a=fixtureAudios.at(-1);a.playbackRate=1;a.currentTime=12})()');
    await mediaReady(label+' seek');
    await cdp.evaluate(enter+';WarzoneMusic.setBattleActive(true);WarzoneMusic.setBattleActive(true)');
    const paused=await until(async()=>{const s=await snap();return !s.report.playing&&s.report.retained&&s.audio.paused?s:false},label+' retained pause',remaining());
    await cdp.evaluate(leave+';WarzoneMusic.setBattleActive(true);WarzoneMusic.setBattleActive(true)');
    const resumed=await mediaReady(label+' resumed');
    assert.equal(resumed.audio.number,paused.audio.number,label+' retains real Audio');
    assert.equal(resumed.report.trackId,paused.report.trackId,label+' retains selected song');
    assert(resumed.audio.time>=paused.audio.time-.05&&resumed.audio.time<paused.audio.time+1,label+' retains media position');
    observations.push({label,audio:paused.audio.number,pausedTime:paused.audio.time,resumedTime:resumed.audio.time,sameRealAudio:true});
  }
  try{
    await start();
    await check('All 39 FFA tracks decode and naturally advance through one shuffle plus boundary without immediate repeats',async()=>{
      await mode('ffa');const first=await mediaReady('FFA initial decode');
      await until(async()=>{const s=await snap();return s.audio.time>.1},'actual media clock advances',remaining());
      const ids=[first.report.trackId];
      for(let i=0;i<39;i++)ids.push((await naturalEnd('FFA '+(i+1))).report.trackId);
      assert.equal(new Set(ids.slice(0,39)).size,39);assert(ids.every((id,i)=>!i||id!==ids[i-1]));
      assert.deepEqual(new Set(ids.slice(0,39)),new Set(musicCatalog.playlists.ffa.tracks));
      observations.push({label:'FFA shuffle',selectedTracks:ids,nativeAudio:true});
      return{decodedDistinctTracks:39,naturalCompletions:39,selectionCount:40};
    });
    await check('OFF stops playback and ON restarts the selected song without consuming the shuffle',async()=>{
      const before=await mediaReady('OFF before');
      await cdp.evaluate('WarzoneMusic.setEnabled(false)');const off=await snap();assert.equal(off.report.enabled,false);assert.equal(off.report.playing,false);
      await cdp.evaluate('WarzoneMusic.setEnabled(true)');const on=await mediaReady('ON real decode');
      assert.equal(on.report.trackId,before.report.trackId);assert(on.audio.number>before.audio.number);assert.deepEqual(on.report.playlistSelections,before.report.playlistSelections);
      observations.push({label:'OFF/ON',track:on.report.trackId,oldAudio:before.audio.number,newAudio:on.audio.number});
    });
    await check('Synthetic global bridge preference is respected across mode changes and Campaign uses its three original tracks in ordered wrap',async()=>{
      await cdp.evaluate('WarzoneMusic.setEnabled(false)');await mode('campaign');
      const off=await snap();assert.equal(off.report.enabled,false);assert.equal(off.audioCount,0);
      await cdp.evaluate('WarzoneMusic.setEnabled(true)');const first=await mediaReady('Campaign initial decode');
      const policy=musicCatalog.playlists.campaign.tracks,start=policy.indexOf(first.report.trackId),ids=[first.report.trackId];assert(start>=0);
      for(let i=1;i<=4;i++){const next=await naturalEnd('Campaign '+i);assert.equal(next.report.trackId,policy[(start+i)%3]);ids.push(next.report.trackId)}
      observations.push({label:'Campaign ordered cycle',selectedTracks:ids,nativeAudio:true});
      return{decodedOriginalTracks:3,naturalCompletions:4,syntheticPreferenceBridge:true};
    });
    await check('Campaign video exit with nested HUD activation retains the same real Audio and media position',async()=>{
      await retainedPause('Campaign video','fixtureCampaign.nativeState.video=true','fixtureCampaign.nativeState.video=false');
    });
    await check('Background and native mission-results pause resume retain the decoder and position',async()=>{
      await retainedPause('Background','WarzoneMusic.setSuspended(true)','WarzoneMusic.setSuspended(false)');
      const results=musicCatalog.playlists.campaign.nativeMissionResultsMode;assert(Number.isInteger(results));
      await retainedPause('Native results','fixtureCampaign.nativeState.nativeMode='+results,'fixtureCampaign.nativeState.nativeMode=0');
    });
    await check('Original Opus slices match their catalogue hashes and browser playback has no resource or script errors',async()=>{
      assert(streams.length>=45);for(const item of streams){assert(item.complete&&item.bytes===item.end-item.start,item.id+' complete original slice');assert.equal(item.sha256,item.expectedSHA256,item.id+' original bytes')}
      assert.deepEqual(exceptions,[]);assert.deepEqual(badResponses,[]);assert.deepEqual(externalRequests,[]);
      assert.equal(fs.statSync(soundtrack).size,musicCatalog.bytes);assert.equal(sha(soundtrack),musicCatalog.sha256);
    });
  }catch(e){fatal=e.stack||e.message;console.error(fatal)}
  finally{if(cdp){try{await cdp.send('Browser.close')}catch{}cdp.close()}if(edge&&edge.exitCode===null){try{edge.kill()}catch{}}if(server)await new Promise(resolve=>server.close(resolve))}
  const files=['tools/check-music-browser-066.cjs','tools/check-guide-browser-066.cjs','app/src/main/assets/warzone/music-loader.js','app/src/main/assets/warzone/music-catalog.js','app/src/main/assets/warzone/music-tracks.json','app/src/main/assets/warzone/music/music.data'];
  const passed=!fatal&&checks.length===6&&checks.every(c=>c.passed);
  const report={version:'0.66',passed,checksPassed:checks.filter(c=>c.passed).length,checks,fatal:fatal||null,actualChromiumHTMLAudio:true,actualOriginalOpusBytes:true,syntheticJavaMetadataBridge:true,syntheticNativeSessionVideoFlags:true,engineExecuted:false,emulatorUsed:false,speakerOutputVerified:false,mutedHostOutput:true,autoplayPermission:'headless fixture flag',seekedNearEnd:true,wholeTracksListenedInRealTime:false,observations,nativeEndOrders,streams,exceptions,badResponses,externalRequests,elapsedSeconds:Number(((Date.now()-(deadline-55000))/1000).toFixed(3)),sources:files.map(name=>({path:name,sha256:sha(path.join(root,name))})),recordedUTC:new Date().toISOString()};
  fs.writeFileSync(path.join(root,'archive/music-0.66-browser-checks.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed,checksPassed:report.checksPassed,decodedDistinctTracks:new Set(streams.filter(s=>s.complete).map(s=>s.id)).size,naturalCompletions:nativeEndOrders.length,elapsedSeconds:report.elapsedSeconds,fatal:report.fatal},null,2));if(!passed)process.exitCode=1;
})();
`;
vm.runInNewContext(helper + runner, {require, __dirname: path.join(root, 'tools'), process, console, Buffer, URL, fetch, AbortSignal, WebSocket, setTimeout, clearTimeout,
  fixturePage, streamTrack, streams, soundtrack, musicCatalog: catalog}, {filename: 'real music browser regression'});
