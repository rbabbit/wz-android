/* Data/engine bridge only. Android View instances own all app controls. */
(()=>{
 'use strict';
 if(window.__towersNative)return;
 const session=String(window.__towersNativeSession||'');
 let timer=null,last='',active=0;
 function publish(){if(timer)return;timer=setTimeout(()=>{timer=null;const commands=window.__warzoneCommands?.model();
   if(!commands)return;
   // The immutable catalogue is read by Android from the packaged asset.
   const {catalog,...model}=commands;
   const data=JSON.stringify({session,commands:model,research:window.__blockNightResearch?.model(),waves:window.__warzoneTowersWaves?.report(),touch:window.__kalaWarzoneTouch?.report()});
   if(data!==last){last=data;window.BlockNightAndroid.nativeModel(data);}
 },150);}
 function notice(text,error=false){window.BlockNightAndroid.nativeNotice(session,String(text),error);}
 function consume(name,nonce){
   if(!nonce||!['warzone-towers-wave-command.json','blocknight-zoom-command.json','warzone-towers-control-command.json'].includes(name))return false;
   const fs=(window.LaunchedModule?.FS?window.LaunchedModule:window.Module)?.FS,path='/data/mp/multiplay/script/rules/'+name;
   if(!fs?.readFile||!fs?.writeFile||!fs?.rename)return false;
   try{if(JSON.parse(fs.readFile(path,{encoding:'utf8'})).nonce===nonce){fs.writeFile(path+'.tmp',JSON.stringify({nonce:''}),{encoding:'utf8'});fs.rename(path+'.tmp',path);return true;}}catch(_){}
   return false;
 }
 async function dispatch(request){
   if(!request||request.session!==session||!Number.isSafeInteger(request.id)||active>=32)return;
   active++;
   const c=window.__warzoneCommands,r=window.__blockNightResearch,t=window.__kalaWarzoneTouch,d=request.data||{};
   try{let result;
     switch(request.action){
       case 'open':result=await c.open(d.page);break;
       case 'research-open':result=await c.openResearch();break;
       case 'close':result=await c.exit();break;
       case 'build':result=await c.beginPlacement(String(d.itemId));break;
       case 'map':result=await c.selectMode(false,true);break;
       case 'nearby-trucks':result=await c.selectNearbyTrucks();break;
       case 'research-add':result=r.enqueue(Number(d.labId),String(d.topicId));if(!result)throw Error(r.model().error);break;
       case 'research-remove':result=r.remove(Number(d.labId),String(d.topicId));break;
       case 'research-retry':r.open();result=r.processQueues();break;
       case 'validate-design':result=await c.send('validate-design',{design:d.design});break;
       case 'save-design':result=await c.saveBlueprint(d.design);break;
       case 'delete-design':result=c.deleteBlueprint(String(d.id));break;
       case 'produce':result=await c.send('queue-production',{factoryId:Number(d.factoryId),count:Number(d.count),...(d.templateId?{templateId:String(d.templateId)}:{design:d.design})});break;
       case 'clear-production':case 'retry-production':result=await c.send(request.action,{factoryId:Number(d.factoryId)});break;
       case 'remove-production':result=await c.send('remove-production',{factoryId:Number(d.factoryId),jobIds:(Array.isArray(d.jobIds)?d.jobIds:[d.jobId]).map(String)});break;
       case 'cancel-job':case 'retry-job':result=await c.send(request.action,{jobId:String(d.jobId)});break;
       case 'engine-menu':result=await c.openNative(d.menu);break;
       case 'skip-wave':result=window.__warzoneTowersWaves.nextWave();break;
       case 'control':{
         const allowed=['selectAllCombat','selectAllUnits','selectAllTrucks','toggleCombatLock','toggleAutoFight','toggleBoxMode','toggleQueueMode','stopSelected','jumpToBase'];
         if(!allowed.includes(d.name))throw Error('Unknown control.');
         result=await c.afterBuildExit(()=>t[d.name](typeof d.enabled==='boolean'?d.enabled:undefined),d.name==='stopSelected');break;
       }
       case 'zoom':result=await c.afterBuildExit(()=>t.applyZoomPreset(d.preset));break;
       case 'engine-pause':result=await c.afterBuildExit(()=>{t.releaseAll(true);t.nativePressKey('Escape','Escape',27);return true;});break;
       // Engine menus pause scenario timers, so resuming must not await a file command.
       case 'engine-resume':t.releaseAll(true);t.nativePressKey('Escape','Escape',27);result=true;break;
       default:throw Error('Unknown native request.');
     }
     if(result?.ok===false){
       const reason=String(result.reason||'Warzone rejected the command.');
       const message=request.action==='remove-production'
         ? ({'job-missing':'That unit has already started or left the waiting queue.','factory-missing':'That factory is no longer available.'}[reason]||reason)
         : reason;
       throw Error(message);
     }
     window.BlockNightAndroid.nativeResult(request.id,JSON.stringify({session,ok:true,result:result??null}));
   }catch(e){window.BlockNightAndroid.nativeResult(request.id,JSON.stringify({session,ok:false,error:String(e.message||e)}));}
   finally{active--;publish();}
 }
 window.__towersNative={version:1,session,publish,notice,dispatch,consume};
 setInterval(publish,500);
})();
