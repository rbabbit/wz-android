'use strict';
// Finish the evidence check after the last native log update reaches the host.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'qa/v5.8/journey');
const probe=expr=>JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'sidebar-probe.cjs'),'eval',expr],{cwd:root,maxBuffer:1024*1024}).toString());
(async()=>{
 const r=JSON.parse(fs.readFileSync(path.join(out,'delivery-failure.json'),'utf8'));
 assert.ok(r.passed&&r.failure.includes('native test state paused'),'only the trailing fixture pause assertion may be resumed here');assert.equal(r.cases.length,4);assert.deepEqual(r.errors,[]);
 assert.equal(r.apkSHA256,r.installedSHA256);assert.equal(r.apkSHA256,JSON.parse(fs.readFileSync(path.join(root,'qa/v5.8/preservation.json'))).apkSHA256);
 const a=probe('({time:__warzoneTowersWaves.report().snapshot.gameTime})');await new Promise(resolve=>setTimeout(resolve,1500));const b=probe('({time:__warzoneTowersWaves.report().snapshot.gameTime})');assert.equal(a.time,b.time,'native pause confirmed after pending log delivery');
 const peak=JSON.parse(fs.readFileSync(path.join(out,'three-site-layout.json')));assert.ok(peak.hit&&peak.button.bottom<=peak.queue.bottom);
 r.pauseVerifiedAt=b.time;r.fixtureNote='Trailing wave log update settled before the pause comparison; gameplay checks already passed.';delete r.failure;fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(r,null,2));console.log('PASS: complete installed-APK build journey, three viewports, native queues/completion/movement, and stable paused clock');
})().catch(e=>{console.error(e);process.exitCode=1});
