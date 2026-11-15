'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const web=require('./mp-live-082.cjs');
const out=path.resolve(__dirname,'../qa/portrait-home-083'),pkg='com.rbabbit.warzonetowers.lab',main=pkg+'/com.rbabbit.blocknight.warzone.MainActivity';
const exe='C:/Users/punke/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const adb=(...a)=>execFileSync(exe,['-s','emulator-5558',...a],{timeout:45000,maxBuffer:32*1024*1024});
const delay=ms=>new Promise(r=>setTimeout(r,ms)),decode=s=>s?.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&apos;',"'");
function nodes(xml){return [...xml.matchAll(/<node\s[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],decode(a[2])])));}
function bounds(n){return [...n.bounds.matchAll(/\d+/g)].map(x=>+x[0]);}
function observe(){const dumped=adb('shell','uiautomator','dump','/sdcard/home083.xml').toString();const xml=dumped.includes('dumped')?adb('shell','cat','/sdcard/home083.xml').toString():'',rows=nodes(xml),png=adb('exec-out','screencap','-p'),width=png.readUInt32BE(16),height=png.readUInt32BE(20),activity=adb('shell','dumpsys','activity','activities').toString();return{xml,rows,png,width,height,portrait:height>width,valid:!!rows[0]&&bounds(rows[0])[2]<=width&&bounds(rows[0])[3]<=height&&bounds(rows[0])[2]>bounds(rows[0])[0]&&bounds(rows[0])[3]>bounds(rows[0])[1],mainTokens:[...new Set([...activity.matchAll(/\* Hist\s+#\d+: ActivityRecord\{([^\s}]+)[^\n]*com\.rbabbit\.blocknight\.warzone\.MainActivity/g)].map(x=>x[1]))],resumed:activity.split('\n').filter(s=>/mResumedActivity|topResumedActivity/.test(s))};}
function save(name,s){fs.writeFileSync(path.join(out,name+'.png'),s.png);fs.writeFileSync(path.join(out,name+'.xml'),s.xml);const {png,xml,...value}=s;fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2));return value;}
function find(s,label){return s.rows.find(n=>n.enabled==='true'&&[n.text,n['content-desc']].some(v=>v?.toLowerCase()===label.toLowerCase()));}
function tap(s,label){const n=find(s,label);assert(n,'Actual control missing: '+label);const b=bounds(n);assert(b[2]>b[0]&&b[3]>b[1]);adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));}
async function wait(name,predicate,ms=20000){let s;const until=Date.now()+ms;do{s=observe();if(s.valid&&predicate(s))return save(name,s);await delay(200);}while(Date.now()<until);save('failure-'+name,s);throw Error('Actual screen did not settle: '+name);}
const home=s=>s.portrait&&!!find(s,'Towers')&&!!find(s,'Multiplayer');
async function homeState(name){const s=await wait(name,home);assert.equal(s.mainTokens.length,1);return s;}
async function run(){const stage=process.argv[2]||'home';
 if(stage==='home'){await homeState('delivery-home-default');return;}
 if(stage==='reference'){adb('shell','wm','size','780x1688');adb('shell','wm','density','320');adb('shell','settings','put','system','font_scale','1.0');await homeState('delivery-home-reference');return;}
 if(stage==='routes'){
  const initial=await homeState('delivery-routes-before');const journey=[];
  for(const [label,key]of [['Campaign','campaign'],['Towers','towers'],['Free for all','ffa'],['Multiplayer','multiplayer'],['Guide: research paths and how to play','guide'],['Game Hub: public multiplayer results and rankings','hub']]){
   const before=observe();tap(before,label);await wait('transition-'+key,s=>!s.portrait,25000);
   if(['multiplayer','guide','hub'].includes(key)){const c=await web.connect(key==='multiplayer'?'/multiplayer/index.html':'/assets/'+key+'/index.html');try{await c.wait('document.readyState==="complete" && document.body.innerText.trim().length>60','Loaded '+key,25000);}finally{c.close();}}
   const entered=await wait('delivery-route-'+key,s=>!s.portrait&&(key==='towers'?!!find(s,'PLAY'):key==='campaign'?!!find(s,'NEW CAMPAIGN'):true),25000);assert.deepEqual(entered.mainTokens,initial.mainTokens,'Main Activity recreated entering '+key);
   adb('shell','input','keyevent','4');const returned=await homeState('delivery-return-'+key);assert.deepEqual(returned.mainTokens,initial.mainTokens,'Main Activity recreated returning '+key);journey.push({mode:key,landscape:true,portraitReturn:true,mainToken:initial.mainTokens[0]});
  }
  fs.writeFileSync(path.join(out,'routes.json'),JSON.stringify({passed:true,journey},null,2));return;
 }
 if(stage==='compact'){
  adb('shell','wm','size','720x1480');adb('shell','wm','density','320');adb('shell','settings','put','system','font_scale','1.0');await wait('delivery-home-compact',s=>s.portrait&&!!find(s,'Campaign'));
  adb('shell','settings','put','system','font_scale','1.3');let s=await wait('delivery-home-large-text-top',s=>s.portrait&&!!find(s,'Campaign'));
  let end;for(let i=0;i<7;i++){const raw=observe();if(find(raw,'HUB')&&find(raw,'GUIDE')){end=save('delivery-home-large-text-bottom',raw);break;}adb('shell','input','swipe',String(Math.round(raw.width*.75)),String(Math.round(raw.height*.82)),String(Math.round(raw.width*.75)),String(Math.round(raw.height*.25)),'320');}
  assert(end,'Guide and Hub inaccessible with enlarged text');tap(observe(),'HUB');await wait('delivery-large-text-hub',s=>!s.portrait);adb('shell','input','keyevent','4');await wait('delivery-large-text-return',s=>s.portrait);return;
 }
 if(stage==='restore'){
  const d=JSON.parse(fs.readFileSync(path.join(out,'device-before.json')));const size=d.size.match(/Override size: (\d+x\d+)/)?.[1]||'reset',density=d.density.match(/Override density: (\d+)/)?.[1]||'reset';
  adb('shell','settings','put','system','font_scale',d.fontScale.trim()==='null'?'1.0':d.fontScale.trim());adb('shell','wm','size',size);adb('shell','wm','density',density);await homeState('delivery-home-restored');return;
 }
 if(stage==='resume'){
  const before=await homeState('delivery-resume-before');adb('shell','input','keyevent','3');adb('shell','am','start','-W','--activity-single-top','-n',main);const after=await homeState('delivery-resume-after');assert.deepEqual(after.mainTokens,before.mainTokens);return;
 }
 if(stage==='tap'){tap(observe(),process.argv.slice(3).join(' '));return;}
 if(stage==='capture'){save(process.argv[3]||'current',observe());return;}
 throw Error('Unknown portrait verification stage');
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={adb,delay,observe,save,find,tap,wait,homeState,home,out,main};
