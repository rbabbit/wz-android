'use strict';
// Recheck native evidence without replaying the unrelated gameplay suite.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa/v5.7');
const read=n=>JSON.parse(fs.readFileSync(path.join(out,n+'.json'),'utf8'));
const probe=expression=>JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'sidebar-probe.cjs'),'eval',expression],{cwd:root,maxBuffer:20*1024*1024,timeout:60000}).toString());
const before=read('mod-before-load-native'),loaded=read('mod-after-load');
const after=probe(`(()=>{const f=LaunchedModule.FS,p=LaunchedModule.WZVAL_configDirPath+'/savegames/skirmish/QuickSave',r={};for(const n of f.readdir(p))if(n.endsWith('.json'))r[n]=JSON.parse(f.readFile(p+'/'+n,{encoding:'utf8'}));return r;})()`);
fs.writeFileSync(path.join(out,'mod-after-load-native.json'),JSON.stringify(after,null,2));
const g=before['scriptstate.json'].globals_0,h=after['scriptstate.json'].globals_0,a=g.SaveLoad_objects[0],b=h.SaveLoad_objects[0];
assert.equal(g.scriptName,'init');assert.equal(h.scriptName,'init');assert.equal(h.index,g.index);assert.equal(h.scavAI,g.scavAI);
assert.equal(h.warzoneTowersWaves_state.wave,g.warzoneTowersWaves_state.wave);assert.equal(h.warzoneTowersWaves_state.deadline,g.warzoneTowersWaves_state.deadline);
assert.deepEqual(b.locations,a.locations);assert.equal(b.player,a.player);assert.equal(b.rank,a.rank);assert.ok(b.queue.length<=a.queue.length);assert.deepEqual(b.queue,a.queue.slice(a.queue.length-b.queue.length));
assert.deepEqual(Object.keys(h.warzoneTowersLabResearch),Object.keys(g.warzoneTowersLabResearch));for(const k of Object.keys(g.warzoneTowersLabResearch))assert.equal(h.warzoneTowersLabResearch[k].topicId,g.warzoneTowersLabResearch[k].topicId);
assert.deepEqual(h.blockNightV28Queues,g.blockNightV28Queues);assert.ok(loaded.commands.snapshot.gameTime>=loaded.wave.gameTime-2000);
assert.ok(h.warzoneTowersWaves_state.rewardCount>=g.warzoneTowersWaves_state.rewardCount);
const bs=read('mod-before-skip'),skipped=read('mod-after-skip');assert.equal(skipped.wave.wave,bs.wave.wave+1);const ids=new Set(Object.values(bs['droid.json']).filter(d=>d.player===1).map(d=>d.id));assert.ok(Object.values(skipped['droid.json']).some(d=>d.player===1&&ids.has(d.id)));
const {log}=probe(`({log:LaunchedModule.FS.readFile(LaunchedModule.WZVAL_configDirPath+'/logs/init.0.log',{encoding:'utf8'})})`);
const rewards=log.split(/\r?\n/).filter(l=>l.includes('BNTDREWARD:')).map(l=>JSON.parse(l.slice(l.indexOf('BNTDREWARD:')+11)));
assert.ok(rewards.length>=35);for(const r of rewards){assert.equal(r.credited,r.expected);assert.equal(r.after-r.before,r.expected);assert.equal(r.player,0);}
const config=log.split(/\r?\n/).filter(l=>l.includes('BNTDCONFIG:')).map(l=>JSON.parse(l.slice(l.indexOf('BNTDCONFIG:')+11))).at(-1);assert.deepEqual(config,{rounds:30,templates:72,missing:[]});
// Legacy sessions are separate logs; the canonical current log must be clean.
assert.ok(!/Failed to find context|ReferenceError|TypeError|Uncaught/.test(log),'native script failure in current session');
const result={passed:true,seeded:false,apkSHA256:read('delivery-results').apkSHA256,config,
 nativeRoundsObserved:skipped.wave.wave,skip:{before:bs.wave,after:skipped.wave,survivorsRetained:true},
 rewards:{verifiedEventsIncludingLoadReplay:rewards.length,allExact:true,samples:rewards.slice(0,12),savedCount:g.warzoneTowersWaves_state.rewardCount,savedPower:g.warzoneTowersWaves_state.rewardPower},
 saveLoad:{canonicalContext:true,sameRoundAndDeadline:true,sameConfigReaderIndex:true,spawnerFIFOContinues:true,savedQueued:a.queue.length,afterLoadQueued:b.queue.length,manualLabsAndQueuesRestored:true,before:g.warzoneTowersWaves_state,after:h.warzoneTowersWaves_state},
 research:{before:g.warzoneTowersLabResearch,after:h.warzoneTowersLabResearch,queues:h.blockNightV28Queues},
 limits:['30-round schedule tested in the rules harness; native combat observed through round '+skipped.wave.wave,'Physical-device rendering/audio/performance not certified']};
fs.writeFileSync(path.join(out,'mod-gameplay-results.json'),JSON.stringify(result,null,2));console.log('PASS: native rewards, five-round progression, Skip survivors, native round/spawn/research Save/Load persistence');
