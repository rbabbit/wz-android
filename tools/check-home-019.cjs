'use strict';
// The explicitly authorized short native HOME check. Never starts gameplay.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
process.env.WZ_NATIVE_QA=path.join(root,'qa/0.19-home');
const l=require('./native-live.cjs'),out=process.env.WZ_NATIVE_QA;
const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function selected(){const t=l.tree();fs.writeFileSync(path.join(out,'latest-ui.xml'),t.xml);return t.nodes.find(n=>/, selected map$/.test(n['content-desc']||''));}
async function waitSelected(changedFrom){const end=Date.now()+7000;while(Date.now()<end){const n=selected();if(n&&n.text!==changedFrom)return n;await l.delay(150);}throw Error('Home map selection did not update');}
(async()=>{
 const apk=path.join(root,'app/build/outputs/apk/debug/app-debug.apk');
 const installed=l.adb('shell','pm','path','com.rbabbit.warzonetowers.lab').toString().trim().replace(/^package:/,'');
 const installedHash=l.adb('shell','sha256sum',installed).toString().trim().split(/\s/)[0];
 if(installedHash!==digest(apk))throw Error('Installed APK differs from candidate');
 const checks=[];
 for(const label of ['Easy maps, 16, not selected','Medium maps, 15, not selected','Hard maps, 15, not selected']){
   // Select the actual tab by its stable visible text, regardless of selection.
   const text=label.startsWith('Easy')?'Easy · 16':label.startsWith('Medium')?'Medium · 15':'Hard · 15';
   await l.nativeTap(text);const current=await waitSelected();
   checks.push({action:text,selected:current.text});
   l.screen('home-'+text.split(' ')[0].toLowerCase());
 }
 await l.nativeTap('Easy · 16');const before=await waitSelected();
 const bounds=l.tree().nodes.find(n=>n.class==='android.widget.HorizontalScrollView').bounds;
 const [x1,y1,x2,y2]=[...bounds.matchAll(/\d+/g)].map(m=>+m[0]);
 l.adb('shell','input','swipe',String(x2-45),String(Math.round((y1+y2)/2)),String(x1+45),String(Math.round((y1+y2)/2)),'280');
 const after=await waitSelected(before.text);l.screen('home-swipe');
 const tree=l.tree();const play=tree.nodes.find(n=>(n['content-desc']||'').startsWith('Start game, '));
 if(!play||play['content-desc']!=='Start game, '+after['content-desc'].replace(', selected map',''))throw Error('Play label differs from selected card');
 checks.push({action:'Swipe Easy carousel',before:before.text,after:after.text,play:play.text});
 fs.writeFileSync(path.join(out,'home-check.json'),JSON.stringify({scope:'Brief native home only; no Play or gameplay input.',candidateSHA256:installedHash,normalViewport:[1080,600],checks,gameplayTested:false,dragTested:false,difficultyPlaytested:false},null,2)+'\n');
 console.log(JSON.stringify({homeOnly:true,candidateSHA256:installedHash,checks}));
})().catch(e=>{console.error(e);process.exitCode=1;});
