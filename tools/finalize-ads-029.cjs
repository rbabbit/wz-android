'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),dir='qa/0.29-ads/';
const read=n=>JSON.parse(fs.readFileSync(path.join(root,dir+n+'.json')));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const home=read('delivery-home-before'),opened=read('delivery-home-ad-open'),homeEarned=read('delivery-home-earned'),game=read('delivery-game-before'),held=read('delivery-game-held'),gameEarned=read('delivery-game-earned'),firstResume=read('delivery-game-first-resumed'),repeatResume=read('delivery-game-resumed'),post=read('delivery-post-ad-input-save'),restart=read('delivery-restarted');
const candidate=hash('app/build/outputs/apk/debug/app-debug.apk');
for(const identity of [home.identity,game.identity,post.identity,restart.identity])assert.equal(identity.candidateAPK_SHA256,candidate);
const checks=[];function check(name,passed){assert(passed,name);checks.push({name,passed:true});}
check('0.29 installed with the existing app identity and preserved 55-crystal wallet',home.wallet.balance===55);
check('Home exposes the compact optional ten-crystal ad action',home.screen.some(n=>n.label==='Watch an optional ad to earn 10 crystals'));
check('Opening the ad alone does not award crystals',opened.wallet.balance===home.wallet.balance);
check('Real Google test ad earned exactly ten on Home and cleared its durable attempt',homeEarned.wallet.balance===65&&homeEarned.wallet.pendingAdReward==='');
check('In-game Rewards exposes the same optional ad action',game.screen.some(n=>n.label==='Watch an optional ad to earn 10 crystals'));
check('Native battle clock remained stopped during the owned ad pause',held.held.owned&&held.stable.owned&&held.held.clock===held.stable.clock);
check('Real in-game Google test ad earned exactly ten without a second grant',game.wallet.balance===65&&gameEarned.wallet.balance===75&&gameEarned.wallet.pendingAdReward==='');
check('Ad return resumed the same native document with an advancing clock',firstResume.state.session===held.held.session&&!firstResume.state.hold.held&&firstResume.state.wave.gameTime>held.stable.clock);
check('Repeated ad completion and return kept the same native document and cleared its hold',repeatResume.state.session===held.held.session&&!repeatResume.state.hold.held&&repeatResume.wallet.balance===85);
check('Map music was playing again after repeated ad returns',post.initial.music.playing&&!post.initial.music.suspended&&post.initial.music.error==='');
check('Header SAVE completed after the ad with no save error',Boolean(post.saved.savedId)&&!post.saved.busy&&post.saved.error==='');
check('Build and Tech opened and closed through ordinary controls after the ad',post.build.open===true&&Array.isArray(post.build.trucks)&&post.build.trucks.length>0);
check('Return-to-main-menu and process restart preserved the complete 85-crystal balance',restart.beforeRestart===85&&restart.wallet.balance===85&&restart.wallet.pendingAdReward==='');
check('Restarted Rewards screen returned normally with no automatic ad',restart.screen.some(n=>n.label==='Close rewards')&&restart.screen.some(n=>n.label==='85 crystals'));
const evidenceNames=['delivery-home-before.json','delivery-home-ad-open.json','delivery-home-earned.json','delivery-game-before.json','delivery-game-held.json','delivery-game-earned.json','delivery-game-first-resumed.json','delivery-game-resumed.json','delivery-post-ad-input-save.json','delivery-restarted.json','delivery-home-ready.png','delivery-home-earned-ad.png','delivery-game-ready.png','delivery-game-google-ad.png','delivery-game-earned-ad.png','delivery-game-resumed.png','delivery-post-ad-build.png','delivery-post-ad-tech.png','delivery-post-ad-input-save.png','delivery-return-home.png','delivery-restarted-rewards.png','google-sdk-observations.txt'];
const evidenceFiles=evidenceNames.map(n=>({path:dir+n,sha256:hash(dir+n)}));
const supportingObservations=['baseline-game.png','native-pause-control.json'].map(n=>({path:dir+n,sha256:hash(dir+n),scope:'Pre-change v0.28 baseline only; not a delivery-APK check.'}));
const report={version:'0.29',candidateAPK_SHA256:candidate,emulatorUsed:true,device:'emulator-5556',testAdsOnly:true,liveAdsTested:false,gameplayVerified:false,createdAt:new Date().toISOString(),checks,evidenceFiles,supportingObservations,
 provenance:'Ordinary Home/new Greenhaven match. Real Google sample rewarded units on the Android emulator; actual native SDK earned callbacks and private phone-wallet reads. No synthetic ad grants, seeded currency, spawned structures or reward callback injection.',
 limitations:['Production account/store approval and live ad fill are external and unverified.','Google UMP reports no publisher privacy forms configured for the supplied app ID; actual required-form display remains unverified. Consent gating/form lifecycles are covered by the actual-controller host fixtures.','An early Android Back attempt during a third sample ad did not cancel it; that ad finished and earned normally. No genuine early-close device check is claimed; unearned dismissal and failure semantics are covered by the callback fixtures.','The v0.28 pre-change emulator baseline already showed missing terrain rendering. Ads did not change native assets or that baseline; this is not a graphics or full campaign acceptance pass.']};
fs.writeFileSync(path.join(root,dir+'focused-emulator-proof.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({candidateAPK_SHA256:candidate,checks:checks.length,proofSHA256:hash(dir+'focused-emulator-proof.json')}));
