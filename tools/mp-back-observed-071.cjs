'use strict';const q=require('./mp-live-071.cjs'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{execFileSync}=require('child_process');
const normal=process.argv.includes('normal'),px=normal?1520:944,py=normal?565:395,stay=normal?['1294','597']:['708','423'],ret=normal?['1460','600']:['884','423'];
const python='C:/Users/punke/AppData/Local/Python/pythoncore-3.15-64/python.exe';
const bright=file=>JSON.parse(execFileSync(python,['-c','from PIL import Image; import sys,json; p=Image.open(sys.argv[1]).convert("RGB").getpixel((int(sys.argv[2]),int(sys.argv[3]))); print(json.dumps(min(p)>190 and max(p)-min(p)<25))',file,String(px),String(py)]).toString());
async function dialog(c,name){const start=Date.now();do{if(bright(q.screen(name)))return Date.now()-start;await q.delay(80);}while(Date.now()-start<2500);throw Error('Native Back prompt did not become visibly ready within 2.5s');}
(async()=>{const c=await q.connect(),proof={stayCycles:[]};try{
await c.wait('PcMultiplayerSession.phase==="game"','live game');
for(let i=0;i<2;i++){q.adb('shell','input','keyevent','4');const latency=await dialog(c,'final-back-dialog-'+i);q.adb('shell','input','tap',...stay);await q.delay(180);await c.wait('PcMultiplayerSession.phase==="game"','Stay preserves game');assert.equal(bright(q.screen('final-after-stay-'+i)),false);proof.stayCycles.push({latency,game:true});}
q.adb('shell','input','keyevent','4');proof.returnLatency=await dialog(c,'final-return-dialog');q.adb('shell','input','tap',...ret);await c.wait('typeof PcMultiplayerSession!=="undefined"&&!PcMultiplayerSession.active&&PcMultiplayerSession.phase==="lobby"','native Return to app lobby',10000);await c.wait('document.querySelectorAll(".room").length>0','room list');await c.save('final-return-lobby');assert.equal(await c.evaluate('!!document.querySelector("#warzone-game-frame")'),false);
proof.passed=true;console.log(JSON.stringify(proof));
}catch(e){proof.error=String(e);throw e;}finally{fs.writeFileSync(path.join(q.out,'final-return-proof.json'),JSON.stringify(proof,null,2));c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
