'use strict';
// Actual ad pause bridge under a deterministic clock/input model. No engine,
// Android, Google SDK or real gameplay is executed by this source fixture.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sourcePath = 'app/src/main/assets/warzone/rewarded-ads.js';
const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
const checks = [];
function check(value, name) { assert.ok(value, name); checks.push(name); }

function fixture(options = {}) {
  const model = {now:0, timers:[], seq:0, running:options.paused !== true, base:10_000, started:0,
    active:true, saveBusy:false, purchaseBusy:false, invalidClock:false, keys:[], ready:[], restored:[],
    buildOpen:false, nativeMenu:'', page:'', closes:[], ignorePause:false, ignoreResume:false};
  function clock() {
    if (model.invalidClock) return NaN;
    return model.base + (model.running ? Math.floor((model.now - model.started) / 500) * 500 : 0);
  }
  function setRunning(value) { model.base = clock(); model.started = model.now; model.running = value; }
  function press(key) {
    model.keys.push({key, time:model.now});
    if (model.running && model.ignorePause || !model.running && model.ignoreResume) return;
    setRunning(!model.running);
  }
  const window = {
    __towersHtml:{session:'native-document-1', isActive:() => model.active},
    __warzoneTowersWaves:{report:() => ({snapshot:{gameTime:clock()}})},
    WarzoneSavedGames:{report:() => ({busy:model.saveBusy})},
    WarzoneRewards:{get busy(){return model.purchaseBusy;}, cancelTarget:() => {}},
    BlockNightAndroid:{adScreenReady:(session,token,ok) => model.ready.push({session,token,ok}),
      adScreenRestored:(session,token,ok) => model.restored.push({session,token,ok})},
    __kalaWarzoneTouch:{nativePressKey:press, cancelFacilityNavigation:() => {}, releaseAll:() => {}},
    __blockNightResearch:{close:() => model.closes.push('research')},
    __warzoneCommands:{report:() => ({buildOpen:model.buildOpen,nativeMenu:model.nativeMenu,page:model.page}),
      selectMode:async () => { model.closes.push('build'); model.buildOpen=false; model.nativeMenu=''; },
      close:async () => { model.closes.push('page'); model.page=''; },
      closeNative:async () => { model.closes.push('native'); model.nativeMenu=''; }},
  };
  const context = vm.createContext({window, performance:{now:() => model.now},
    setTimeout:(run, ms) => {const token=++model.seq; model.timers.push({token,run,due:model.now+ms});return token;}});
  vm.runInContext(source, context, {filename:sourcePath});
  const ads = window.WarzoneRewardedAds;
  async function tick(ms = 50) {
    model.now += ms;
    let count=0;
    while (true) {
      model.timers.sort((a,b) => a.due-b.due || a.token-b.token);
      const next=model.timers[0]; if(!next || next.due>model.now) break;
      model.timers.shift(); next.run();
      if(++count>1000) throw Error('Fixture timer loop');
    }
    for (let i=0;i<6;i++) await Promise.resolve();
  }
  async function advance(ms) {const end=model.now+ms;while(model.now<end)await tick(Math.min(50,end-model.now));}
  async function finish(promise, timeout=12_000) {
    let done=false,result,error; promise.then(value=>{done=true;result=value;},failure=>{done=true;error=failure;});
    const end=model.now+timeout;
    while(!done && model.now<end)await tick();
    assert.ok(done,'fixture promise completed within bounded simulated time');
    if(error)throw error;return result;
  }
  return {model,window,ads,advance,finish,setRunning,clock};
}

async function run() {
  let f=fixture();
  f.model.buildOpen=true;f.model.page='factory';
  assert.equal(await f.finish(f.ads.acquire('owned')),true);
  check(f.model.closes.includes('build') && f.model.closes.includes('page') && f.model.closes.includes('research'),
    'native build and compact page paths close before ad pause');
  check(f.ads.report().owned && f.ads.report().held && f.model.keys.length===1 && !f.model.running,
    'running match pauses once and acknowledges owned hold');
  const stopped=f.clock();await f.advance(3_000);
  check(f.clock()===stopped,'held model clock stays stopped through simulated ad');
  assert.equal(await f.finish(f.ads.release('owned')),true);
  check(!f.ads.report().held && f.model.running && f.model.keys.length===2 && f.clock()>stopped,
    'owned release resumes once and waits for clock advancement');
  assert.equal(await f.finish(f.ads.release('owned')),true);
  check(f.model.keys.length===2,'duplicate completed release never toggles native pause');

  f=fixture({paused:true});
  assert.equal(await f.finish(f.ads.acquire('prior')),true);
  check(!f.ads.report().owned && f.model.keys.length===0,'pre-existing paused clock is preserved without Escape');
  assert.equal(await f.finish(f.ads.release('prior')),true);
  check(!f.model.running && f.model.keys.length===0 && !f.ads.report().held,
    'releasing another owner pause leaves native simulation stopped');

  f=fixture();const acquiring=f.ads.acquire('cancel');await f.advance(600);
  assert.equal(await f.finish(f.ads.release('cancel')),true);
  assert.equal(await f.finish(acquiring),false);
  check(f.model.keys.length===0 && f.model.ready.every(v=>!v.ok) && !f.ads.report().held,
    'cancelled acquisition ignores late baseline observation and never shows ad');

  f=fixture();f.model.saveBusy=true;
  assert.equal(await f.finish(f.ads.acquire('saving')),false);
  check(!f.ads.report().held && f.model.keys.length===0 && f.model.ready.at(-1).ok===false,
    'native save busy refuses before holding or sending input');
  f=fixture();f.model.purchaseBusy=true;
  assert.equal(await f.finish(f.ads.acquire('purchase')),false);
  check(!f.ads.report().held && f.model.keys.length===0,'native purchase busy refuses the ad pause gate');

  f=fixture();assert.equal(await f.finish(f.ads.acquire('same-document')),true);
  f.model.active=false;
  assert.equal(await f.finish(f.ads.release('same-document')),true);
  check(f.model.keys.length===1 && !f.ads.report().held,'inactive document release never sends resume into another match');

  f=fixture();assert.equal(await f.finish(f.ads.acquire('slow-resume')),true);
  f.model.ignoreResume=true;
  assert.equal(await f.finish(f.ads.release('slow-resume')),false);
  check(f.ads.report().held && f.ads.report().resumeSent && f.model.keys.length===2,
    'failed resume retains hold and records its single native resume attempt');
  f.model.ignoreResume=false;f.setRunning(true);
  assert.equal(await f.finish(f.ads.release('slow-resume')),true);
  check(f.model.keys.length===2 && !f.ads.report().held,'resume retry observes recovery without toggling Escape twice');

  f=fixture();assert.equal(await f.finish(f.ads.acquire('first')),true);
  assert.equal(await f.finish(f.ads.acquire('second')),false);
  check(f.ads.report().token==='first' && f.model.keys.length===1,
    'second acquisition cannot replace the active native hold identity');
  assert.equal(await f.finish(f.ads.release('first')),true);

  f=fixture();f.model.ignorePause=true;
  assert.equal(await f.finish(f.ads.acquire('ignored-pause')),false);
  assert.equal(await f.finish(f.ads.release('ignored-pause')),true);
  check(f.model.running && f.model.keys.length===1 && !f.ads.report().held,
    'ignored pause failure never sends a blind second Escape that pauses live gameplay');

  f=fixture();const invalid=f.ads.acquire('invalid-clock');await f.advance(300);f.model.invalidClock=true;
  assert.equal(await f.finish(invalid),false);
  check(f.model.keys.length===0,'clock becoming unavailable refuses acquisition without native Escape');

  const record={version:'0.29',emulatorUsed:false,actualNativeEngineExecuted:false,
    actualPauseBridgeExecuted:true,checksPassed:checks.length,checks,
    source:{path:sourcePath,sha256:crypto.createHash('sha256').update(source).digest('hex')},
    scope:'Real rewarded-ads.js in Node vm with deterministic model native clock, input and bridge. Not Google SDK, Android, native engine or gameplay verification.'};
  fs.writeFileSync(path.join(root,'archive/rewarded-ads-0.29-web-checks.json'),JSON.stringify(record,null,2)+'\n');
  checks.forEach(name=>console.log('PASS '+name));console.log('Actual pause bridge fixture checks: '+checks.length);
}
run().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
