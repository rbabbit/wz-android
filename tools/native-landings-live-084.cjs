'use strict';
// Actual device observations only: no Windows focus or desktop interaction.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const out=path.resolve(__dirname,'../qa/native-landings-084'),pkg='com.rbabbit.warzonetowers.lab',main=pkg+'/com.rbabbit.blocknight.warzone.MainActivity';
fs.mkdirSync(out,{recursive:true});
const exe='C:/Users/punke/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const adb=(...a)=>execFileSync(exe,['-s','emulator-5558',...a],{timeout:45000,maxBuffer:32*1024*1024});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const decode=s=>s?.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&#10;','\n');
function bounds(n){return [...n.bounds.matchAll(/\d+/g)].map(x=>+x[0]);}
function observe(){
 const dumped=adb('shell','uiautomator','dump','/sdcard/landings084.xml').toString();
 const xml=dumped.includes('dumped')?adb('shell','cat','/sdcard/landings084.xml').toString():'';
 const rows=[...xml.matchAll(/<node\s[^>]+>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],decode(a[2])])));
 const png=adb('exec-out','screencap','-p'),width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 const activity=adb('shell','dumpsys','activity','activities').toString();
 return{xml,rows,png,width,height,landscape:width>height,valid:!!rows[0]&&bounds(rows[0])[2]<=width&&bounds(rows[0])[3]<=height&&bounds(rows[0])[2]>bounds(rows[0])[0]&&bounds(rows[0])[3]>bounds(rows[0])[1],mainTokens:[...new Set([...activity.matchAll(/\* Hist\s+#\d+: ActivityRecord\{([^\s}]+)[^\n]*com\.rbabbit\.blocknight\.warzone\.MainActivity/g)].map(x=>x[1]))],resumed:activity.split('\n').filter(s=>/mResumedActivity|topResumedActivity/.test(s))};
}
function save(name,s=observe()){
 fs.writeFileSync(path.join(out,name+'.png'),s.png);fs.writeFileSync(path.join(out,name+'.xml'),s.xml);
 const {png,xml,...value}=s;fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2));return value;
}
function find(s,label){return s.rows.find(n=>n.enabled==='true'&&[n.text,n['content-desc']].some(v=>v?.toLowerCase()===label.toLowerCase()));}
function tap(s,label){const n=find(s,label);assert(n,'Actual control missing: '+label);const b=bounds(n);assert(b[2]>b[0]&&b[3]>b[1]&&b[0]>=0&&b[1]>=0&&b[2]<=s.width&&b[3]<=s.height,'Control outside screen: '+label);adb('shell','input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));}
async function wait(name,predicate,ms=20000){let s;const until=Date.now()+ms;do{s=observe();if(s.valid&&predicate(s))return save(name,s);await delay(150);}while(Date.now()<until);save('failure-'+name,s);throw Error('Actual screen did not settle: '+name);}
const home=s=>s.landscape&&!!find(s,'Towers')&&!!find(s,'Multiplayer')
 && !s.rows.some(n=>['android.widget.CheckBox','android.widget.ScrollView','android.widget.ListView'].includes(n.class))
 && !s.rows.some(n=>['NEW CAMPAIGN','START FFA','PLAY','CAMPAIGN SAVES','SAVED GAMES'].includes(n.text));
async function homeState(name){const s=await wait(name,home);assert.equal(s.mainTokens.length,1);return s;}
async function run(){const stage=process.argv[2]||'capture';
 if(stage==='capture'){const s=save(process.argv[3]||'current');console.log(JSON.stringify({landscape:s.landscape,width:s.width,height:s.height,text:s.rows.filter(n=>n.text||n['content-desc']).map(n=>({text:n.text,desc:n['content-desc'],bounds:n.bounds,enabled:n.enabled,class:n.class}))}));return;}
 if(stage==='tap'){const label=process.argv.slice(3).join(' ');const s=await wait('before-last-native-tap',s=>!!find(s,label));tap(s,label);return;}
 if(stage==='reference'){adb('shell','wm','size','780x1688');adb('shell','wm','density','320');adb('shell','settings','put','system','font_scale','1.0');await homeState('delivery-home-reference');return;}
 if(stage==='home'){await homeState('delivery-home');return;}
 if(stage==='restore'){const d=JSON.parse(fs.readFileSync(path.join(out,'device-before.json')));adb('shell','settings','put','system','font_scale',d.fontScale.trim()==='null'?'1.0':d.fontScale.trim());adb('shell','wm','size',d.size.match(/Override size: (\d+x\d+)/)?.[1]||'reset');adb('shell','wm','density',d.density.match(/Override density: (\d+)/)?.[1]||'reset');await homeState('delivery-home-restored');return;}
 if(stage==='resume'){const before=await homeState('delivery-home-resume-before');adb('shell','input','keyevent','3');adb('shell','am','start','-W','--activity-single-top','-n',main);const after=await homeState('delivery-home-resume-after');assert.deepEqual(after.mainTokens,before.mainTokens);return;}
 throw Error('Unknown stage: '+stage);
}
if(require.main===module)run().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={adb,delay,observe,save,find,tap,wait,homeState,home,bounds,out,main};
