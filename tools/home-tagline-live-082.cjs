'use strict';
const q=require('./mp-live-082.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../qa/multiplayer-spectator-082');
function rows(xml){return [...xml.matchAll(/<node\s[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
const bounds=r=>[...r.bounds.matchAll(/\d+/g)].map(m=>+m[0]);
async function capture(name){
 let xml,list,line;const until=Date.now()+15000;do{q.adb('shell','uiautomator','dump','/sdcard/home082.xml');xml=q.adb('shell','cat','/sdcard/home082.xml').toString();list=rows(xml);line=list.find(r=>r.text?.startsWith('Advance Research Tech'));if(line)break;await q.delay(250);}while(Date.now()<until);
 assert(line,'Actual native Home tagline missing');assert.equal(line.text,'Advance Research Tech · Build &amp; Deploy Units · Upgrade Structures');
 const labels=['CAMPAIGN','TOWERS','FFA','MULTIPLAYER','GUIDE','HUB'],buttons=labels.map(label=>list.find(r=>r.text===label));assert(buttons.every(Boolean),'A Home action is missing');
 const b=bounds(line);assert(b[2]>b[0]&&b[3]>b[1]);for(const r of buttons)assert(b[3]<=bounds(r)[1],'Tagline overlaps Home actions');
 const v={version:'0.82',emulatorUsed:true,device:'emulator-5558',size:q.adb('shell','wm','size').toString(),density:q.adb('shell','wm','density').toString(),tagline:line,buttons,versionLabel:list.find(r=>r.text==='rbabbit v0.82')};assert(v.versionLabel);
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(v,null,2));fs.writeFileSync(path.join(out,name+'.xml'),xml);fs.writeFileSync(path.join(out,name+'.png'),q.adb('exec-out','screencap','-p'));return v;
}
(async()=>{if(process.argv[2]==='normal'){q.adb('shell','input','keyevent','4');await capture('delivery-home');}
 else if(process.argv[2]==='compact'){q.adb('shell','wm','size','480x960');q.adb('shell','wm','density','240');await capture('delivery-home-compact');}
 else if(process.argv[2]==='restore'){q.adb('shell','wm','size','1080x2400');q.adb('shell','wm','density','300');await capture('delivery-home-restored');}
 else throw Error('Unknown Home stage');})().catch(e=>{console.error(e);process.exitCode=1;});
