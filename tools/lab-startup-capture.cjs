'use strict';
const {adb,tree,screen,delay,packageId,assertLabForeground}=require('./native-live.cjs');
(async()=>{
 adb('shell','am','force-stop',packageId);
 adb('shell','am','start','-n',packageId+'/com.rbabbit.blocknight.warzone.MainActivity','--es','map','td2');
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){
  try{assertLabForeground();const t=tree();if(t.nodes.some(n=>n['content-desc']==='Start game, Iron Valley'&&n.enabled==='true')){console.log(screen('lab-startup-observed'));return;}}catch(_){}
  await delay(150);
 }
 throw Error('Lab start screen did not expose its enabled Play control');
})().catch(e=>{console.error(e);process.exitCode=1;});
