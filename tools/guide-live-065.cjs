'use strict';
/* Owned real emulator capture helper. No gameplay/world state injection. */
process.env.WZ_QA_DEVICE='emulator-5558';
process.env.WZ_NATIVE_QA=require('node:path').resolve(__dirname,'../qa/guide-065');
process.env.WZ_QA_UI_INPUT='trusted-cdp';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),q=require('./campaign-live-051.cjs');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),rel=p=>path.relative(q.root,p).replaceAll('\\','/'),put=(name,value)=>{const p=path.join(q.out,name+'.json');fs.writeFileSync(p,JSON.stringify(value,null,2)+'\n');return{path:rel(p),sha256:sha(fs.readFileSync(p)),bytes:fs.statSync(p).size};};
async function connect(){let c,last;const deadline=Date.now()+70000;while(!c&&Date.now()<deadline){try{c=await q.connect();}catch(e){last=e;await q.delay(200);}}if(!c)throw last;await c.wait('Boolean(window.WarzoneSavedGames?.ready&&window.__towersHtml?.isActive?.()&&window.__warzoneCommands?.report?.().snapshot?.trucks?.length)',70000,{timeoutMs:70000});const end=Date.now()+20000;while(Date.now()<end){if(!q.tree().nodes.some(n=>/^(OPENING THE|PREPARING THE|DEPLOYING TO|ASSEMBLING THE|FINALISING BATTLEFIELD)/.test(n.text||'')))break;await q.delay(150);}await c.paint();return c;}
async function coldHome(){q.adb('shell','am','force-stop',q.packageId);q.adb('shell','am','start','-n',q.packageId+'/com.rbabbit.blocknight.warzone.MainActivity');await q.nativeTap('FFA');}
async function loadCobra(){await coldHome();await q.nativeTap('FFA SAVES');await q.nativeTap('Load EMAG FFA, EASY · Cobra · Free for all');const c=await connect();const state=await c.evaluate('({saved:WarzoneSavedGames.report(),ffa:__warzoneFfa.report(),commands:__warzoneCommands.report(),html:__towersHtml.report()})');assert.equal(state.ffa.snapshot.botType,'cobra');assert(state.commands.snapshot.hasHQ&&state.commands.snapshot.trucks.length);return{c,state};}
function installed(){const p=q.adb('shell','pm','path',q.packageId).toString().trim().replace(/^package:/,'');return q.adb('shell','sha256sum',p).toString().split(/\s/)[0];}
async function capture(c,name){if(c)await c.paint();const tree=q.tree(),p=q.screen(name),bytes=fs.readFileSync(p);return{path:rel(p),sha256:sha(bytes),bytes:bytes.length,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),native:tree.nodes.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,label:n['content-desc'],bounds:n.bounds}))};}
module.exports={q,sha,rel,put,connect,coldHome,loadCobra,installed,capture};
