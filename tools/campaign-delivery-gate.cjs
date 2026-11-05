/* Validate observed emulator state; do not use script success as gameplay proof. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa/campaign-v1');
const read=name=>JSON.parse(fs.readFileSync(path.join(out,name+'.json'),'utf8'));
const write=(name,value)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
const probe=expression=>JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'campaign-probe.cjs'),'eval',expression],{cwd:root,encoding:'utf8',timeout:20000,maxBuffer:8*1024*1024}));
const hash=filename=>crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
if(process.argv[2]==='layout') {
 const result=probe(`JSON.stringify((()=>{const d=parent.document,f=d.getElementById('warzone-game-frame'),r=e=>e.getBoundingClientRect().toJSON();return{viewport:[parent.innerWidth,parent.innerHeight],frame:r(f),buffer:[LaunchedModule.ctx.drawingBufferWidth,LaunchedModule.ctx.drawingBufferHeight],scroll:[parent.scrollX,parent.scrollY,scrollX,scrollY],buttons:Array.from(d.querySelectorAll('#blocknight-combat-hud button,#wt-field-centre button,#warzone-towers-next-wave')).filter(e=>r(e).width).map(e=>({id:e.id,rect:r(e),hit:e.contains(d.elementFromPoint(r(e).x+r(e).width/2,r(e).y+r(e).height/2))})),toolbar:r(d.getElementById('blocknight-combat-hud')),campaign:r(d.getElementById('warzone-towers-wave-hud')),menu:d.getElementById('warzone-towers-next-wave').textContent};})())`);
 const [w,h]=result.viewport;
 for(const b of result.buttons){assert(b.rect.x>=0&&b.rect.y>=0&&b.rect.right<=w+.1&&b.rect.bottom<=h+.1,b.id+' clipped');assert(b.hit,b.id+' covered');}
 assert.equal(result.buttons.length,18);assert(result.toolbar.right<result.campaign.left);
 assert(result.scroll.every(n=>n===0));assert.equal(result.menu,'MENU');
 assert(Math.abs(result.buffer[0]/result.buffer[1]-result.frame.width/result.frame.height)<.001);
 write(process.argv[3]+'-layout',result);console.log('PASS: visible controls, hit targets, scrolling and native framebuffer at',result.viewport);process.exit();
}
const apk=path.join(root,'app/build/outputs/apk/debug/app-debug.apk'),apkSHA256=hash(apk);
const adb=path.join(process.env.ANDROID_HOME||'C:/Users/punke/AppData/Local/Android/Sdk','platform-tools/adb.exe');
const run=(...args)=>execFileSync(adb,['-s','emulator-5554',...args],{encoding:'utf8',timeout:20000});
const installed=run('shell','pm','path','com.rbabbit.warzonecampaign').trim().replace(/^package:/,'');
assert.equal(run('shell','sha256sum',installed).trim().split(/\s+/)[0],apkSHA256);
assert.equal(read('preservation').candidateAPK_SHA256,apkSHA256);
assert.equal(read('preservation').additiveCampaignMissionHooks.length,52);
const initial=read('final-intel-return'),produced=read('final-produced'),orders=read('final-construction-orders'),built=read('final-built'),last=read('final-journey');
const units=s=>Object.values(s['droid.json']),structures=s=>Object.values(s['struct.json']);
const original=new Set(units(initial).map(d=>d.id));
const newUnits=units(produced).filter(d=>d.player===0&&!original.has(d.id));
assert(newUnits.some(d=>d.name.startsWith('CampaignMG')));assert(newUnits.some(d=>d.droidType===3));
const gen=structures(built).find(s=>s.player===0&&s.name==='A0PowerGenerator');
assert(gen&&gen.currentBuildPts===500);
const active=structures(orders).find(s=>s.id===gen.id);assert(active&&active.currentBuildPts<500);
const workers=units(orders).filter(d=>d.player===0&&d.droidType===3&&d.selected&&d['order/stats']==='A0PowerGenerator');
assert.equal(workers.length,5);
const before=new Map(units(built).map(d=>[d.id,d]));
const moved=units(last).filter(d=>d.player===0&&d.droidType===3).map(d=>({id:d.id,before:before.get(d.id).position,after:d.position}));
assert.equal(moved.length,5);assert(moved.every(d=>Math.hypot(d.before[0]-d.after[0],d.before[1]-d.after[1])>64));
assert.equal(last.research.labCount,1);assert.equal(last.research.catalogCount,0);
for(const name of ['compact','wide'])read(name+'-layout');
const live=probe('JSON.stringify({args:LaunchedModule.arguments,campaign:__warzoneCampaign.report(),commands:__warzoneCommands.report(),research:__blockNightResearch.report(),touch:__kalaWarzoneTouch.report(),errors:errorLog,towers:Boolean(window.__warzoneTowersWaves)})');
assert(live.args.includes('--game=CAM_1A')&&!live.args.some(a=>a.startsWith('--skirmish')));
assert.equal(live.campaign.snapshot.mission,'cam1a');assert(!live.campaign.paused&&!live.towers);
assert(!live.commands.page&&!live.commands.nativeMenu&&!live.touch.pendingClicks);
assert(!live.research.open);
const errors=live.errors.filter(e=>!e.startsWith('wasm streaming compile failed:')&&!e.startsWith('falling back to ArrayBuffer'));
assert.deepEqual(errors,[]);
write('delivery-gate',{passed:true,scope:'Original Alpha opening mission and mobile screen journey; not a campaign playthrough',apkSHA256,installedAPKMatches:true,completedAt:new Date().toISOString(),
 cases:['native splash and direct Alpha 1 startup','available structures on initial Build tab','Intel/native pause and repeated page returns','normal factory production and waiting queue','five native constructors and completed generator','native truck movement after page/keyboard returns','native campaign QuickSave/QuickLoad','idle lab and original research availability','1080x600 and 1280x576 screen/hit-target checks'],
 produced:newUnits.map(d=>({id:d.id,name:d.name,type:d.droidType})),generator:{id:gen.id,buildPoints:gen.currentBuildPts,workerIds:workers.map(d=>d.id)},truckMovements:moved,
 limitations:['Known emulator black terrain remains','No full Alpha/Beta/Gamma or off-world/transporter/mission-transition playthrough','Active campaign research after artefact recovery not exercised','No new physical-device, HQ, audio or general Save/Load certification'],
 live});
console.log('PASS: exact installed APK and observed campaign evidence agree');
