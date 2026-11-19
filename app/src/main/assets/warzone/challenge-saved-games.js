/* Challenge saves retain native skirmish, bot branch and the separate crystal run. */
(() => {
  'use strict';
  if(window.WarzoneSavedGames||window.__warzoneFfaConfig?.mode!=='challenge')return;
  installChallengeSaves();
  function installChallengeSaves(){
    const ffa=true;
    const mode='challenge',label='Challenge',folder='skirmish';
    const config=window.__warzoneFfaConfig,controller=()=>ffa?window.__warzoneFfa:window.__warzoneCampaign;
    const ffaDescriptor=()=>window.__warzoneFfaMaps?.find(value=>value.id===config?.map)||null;
    const docSession=window.__towersHtml?.session||new URLSearchParams(location.search).get('battle_session')||'';
    const state={loading:false,ready:true,busy:false,ended:false,hydrated:false,error:'',phase:'idle',status:'',statusAt:0,savedId:''};
    const bridge=()=>window.BlockNightAndroid,current=()=>window.LaunchedModule||window.Module;
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    let payload=null,files=null,persistStarted=0,persistCompleted=0,serial=0;
    const frame=()=>{try{
      const native=JSON.parse(current().FS.readFile('/tmp/warzone-campaign-state-v51.json',{encoding:'utf8'}));
      if(!ffa)return native;
      const snapshot=controller()?.report?.().snapshot;if(snapshot?.mode!=='challenge')return null;
      const playing=snapshot.playing===true&&snapshot.phase==='active';
      return{...native,mode,map:snapshot.map,mapName:snapshot.mapName,players:snapshot.maxPlayers,bots:snapshot.maxPlayers-1,session:snapshot.session,difficulty:snapshot.difficulty,botType:snapshot.botType,playing,
        worldSafe:playing&&!native.paused&&!native.video&&!native.nativeMenuOpen&&!native.transportOpen&&!native.intelligenceOpen};
    }catch(_){return null;}};
    const emit=()=>window.dispatchEvent(new CustomEvent('warzone-save-state',{detail:{...state}}));
    const feedback=(phase,status)=>{state.phase=phase;state.status=status;state.statusAt=Date.now();emit();};
    const validName=name=>{if(typeof name!=='string'||!name||name.length>240||name.startsWith('/')||name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..'||!/^[A-Za-z0-9_.-]{1,80}$/.test(part)))throw Error('The '+label+' save contains an invalid file name.');return name;};
    const json=bytes=>JSON.parse(new TextDecoder().decode(bytes));
    function decode(values){
      if(!values||Array.isArray(values)||typeof values!=='object')throw Error('The '+label+' save files are missing.');
      const entries=Object.entries(values);if(!entries.length||entries.length>256)throw Error('The '+label+' save has too many files.');
      const decoded=new Map();let size=0;
      for(const [name,value]of entries){validName(name);if(typeof value!=='string'||value.length>Math.ceil(32*1024*1024/3)*4||value.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('The '+label+' save contains invalid file data.');
        const binary=atob(value);size+=binary.length;if(size>32*1024*1024)throw Error('The '+label+' save is too large.');decoded.set(name,Uint8Array.from(binary,c=>c.charCodeAt(0)));}
      for(const name of ['gam.json','main.json','gameinfo.json','scriptstate.json','game.map'])if(!decoded.has(name))throw Error('The '+label+' save is incomplete: '+name+'.');
      return decoded;
    }
    function ffaGlobals(decoded,metadata){
      return Object.values(json(decoded.get('scriptstate.json'))).find(value=>value&&typeof value==='object'
        &&value.ffaSession===metadata.session&&value.ffaConfig?.mode==='challenge'&&value.ffaConfig.map===metadata.mapId
        &&value.ffaConfig.difficulty===metadata.difficulty&&value.ffaConfig.weapon===metadata.weapon&&value.ffaConfig.player===0&&!value.ffaOutcome);
    }
    function savedBotType(metadata){
      if(!Object.prototype.hasOwnProperty.call(metadata,'botType'))throw Error('The Challenge bot identity is missing.');
      if(!['dumbot25a'].includes(metadata.botType))throw Error('The Challenge save bot identity is invalid.');
      return metadata.botType;
    }
    function liveBotType(snapshot){
      const type=snapshot?.botType,script='challenge-dumb25a.js';
      if(!['dumbot25a'].includes(type)||!Array.isArray(snapshot.players))throw Error('The native Challenge bot identity is unavailable.');
      if(type!==config?.botType)throw Error('The native Challenge bots do not match the requested match.');
      const count=ffaDescriptor()?.players;
      if(!count||snapshot.map!==config.map||snapshot.maxPlayers!==count||snapshot.players.length!==count)throw Error('The native Challenge map or player count is unavailable.');
      for(let player=1;player<count;player++){
        const bots=snapshot.players.filter(value=>value.player===player);
        if(bots.length!==1||bots[0].botType!==type||String(bots[0].scriptName||'').split(/[\\/]/).pop()!==script)
          throw Error('The native Challenge bots do not match this match.');
      }
      return type;
    }
    function validateFfaBots(decoded,metadata,gam){
      const type=savedBotType(metadata),name='Dumbot25a',script='challenge-dumb25a';
      const main=json(decoded.get('main.json')),savedScripts=json(decoded.get('scriptstate.json'));
      const difficulty={easy:1,medium:2,hard:3}[metadata.difficulty];
      const map=ffaDescriptor(),count=map?.players;
      if(!count||!Array.isArray(gam.netPlayers)||!Array.isArray(main.players)||gam.multiMaxPlayers!==count||main.maxPlayers!==count
          ||main.levelName!==map.level||gam.levelName!==map.level||main.selectedPlayer!==0||gam.netSelectedPlayer!==0
          ||main.allianceSetting!==0||gam.multiAlliance!==0)throw Error('The saved Challenge map or bot identity is missing.');
      for(let player=0;player<count;player++){
        const slot=main.players.filter(value=>value.index===player),native=gam.netPlayers[player];
        if(slot.length!==1||!native||slot[0].position!==player||slot[0].team!==player||native.position!==player||native.team!==player
            ||Boolean(slot[0].allocated)!==(player===0)||Boolean(native.allocated)!==(player===0)
            ||!Array.isArray(slot[0].alliances)||slot[0].alliances.length<count||slot[0].alliances.slice(0,count).some((value,other)=>other!==player&&value!==0))
          throw Error('The saved Challenge slots are not independent opponents.');
      }
      for(let player=1;player<count;player++){
        const native=gam.netPlayers[player],players=main.players.filter(value=>value.index===player);
        const contexts=Object.entries(savedScripts).filter(([key,value])=>/^globals_\d+$/.test(key)&&value?.me===player);
        if(!native||native.aiName!==name||native.difficulty!==difficulty||players.length!==1
            ||players[0].nameAI!==name||players[0].difficulty!==difficulty||contexts.length!==1||contexts[0][1].scriptName!==script)
          throw Error('The saved Challenge bots do not match their native files.');
      }
      return type;
    }
    function validate(value,restoring=false){
      const metadata=value?.metadata;
      if(metadata?.mode!==mode||!/^wt_[a-f0-9]{32}$/.test(metadata.id||'')||!/^[A-Za-z0-9_-]{1,96}$/.test(metadata.session||'')||!Number.isInteger(metadata.gameTime)||metadata.gameTime<0||!/^[A-Za-z0-9_-]{1,19}$/.test(metadata.nativeLevel||''))throw Error('The '+label+' save identity is invalid.');
      const decoded=decode(value.files),gam=json(decoded.get('gam.json'));
      if(gam.gameTime!==metadata.gameTime||gam.levelName!==metadata.nativeLevel)throw Error('The '+label+' save does not match its native files.');
      if(ffa){
        const map=ffaDescriptor();
        if(!map||metadata.mapId!==map.id||metadata.mapName!==map.name||metadata.nativeLevel!==map.level
            ||(metadata.players??(map.id==='emag'?4:NaN))!==map.players||(metadata.bots??(map.id==='emag'?3:NaN))!==map.bots
            ||!['easy','medium','hard'].includes(metadata.difficulty)||config?.mode!=='challenge'
            ||config.difficulty!==metadata.difficulty||config.weapon!==metadata.weapon||metadata.profile!=='challenge'||metadata.vtol!==true||metadata.botType!=='dumbot25a'||!/^[-A-Za-z0-9_]{1,96}$/.test(metadata.rewardRunId||'')||!ffaGlobals(decoded,metadata))throw Error('The Challenge save identity does not match its native rules.');
      }
      if(ffa){
        const type=validateFfaBots(decoded,metadata,gam);
        if(restoring&&config.botType!==type)throw Error('The Challenge save belongs to different bots.');
      }
      return decoded;
    }
    try{
      const value=JSON.parse((ffa?bridge()?.challengeSavePayload?.(docSession):bridge()?.campaignSavePayload?.(docSession))||'{}');
      if(value.metadata||value.files||value.error){state.loading=true;state.ready=false;if(value.error)throw Error(value.error);files=validate(value,true);payload=value;}
    }catch(error){state.loading=true;state.ready=false;state.error=error.message;}
    const persist=window.wz_js_save_config_dir_to_persistent_storage;
    if(typeof persist==='function')window.wz_js_save_config_dir_to_persistent_storage=function(user,callback){
      const operation=user?++persistStarted:0;
      return persist.call(this,user,function(...args){if(operation)persistCompleted=Math.max(persistCompleted,operation);return callback?.apply(this,args);});
    };
    const construct=window.constructWZModuleConfig;
    if(typeof construct==='function')window.constructWZModuleConfig=function(...args){
      const result=construct.apply(this,args);if(!state.loading)return result;
      if(state.error||!payload||!files)throw Error(state.error||'The '+label+' save could not be loaded.');
      result.arguments=(result.arguments||[]).filter(argument=>!/^--(?:game|loadcampaign|loadskirmish|skirmish)=/.test(argument));
      result.arguments.push((ffa?'--loadskirmish=':'--loadcampaign=')+payload.metadata.id);result.preRun||=[];
      result.preRun.push(module=>{
        const remove=module.removeRunDependency;
        module.removeRunDependency=function(id){
          if(id==='persistent_warzone2100_config_dir'&&!state.hydrated){
            if(ffa&&state.ended)throw Error('The Challenge save was cancelled.');
            const fs=module.FS,root=(module.WZVAL_configDirPath||window.wz_js_get_config_dir_path?.())+'/savegames/'+folder+'/'+payload.metadata.id;
            if(!fs)throw Error((ffa?'Challenge':'Campaign')+' save storage is unavailable.');
            fs.mkdirTree(root);
            for(const[name,bytes]of files){const target=root+'/'+name;fs.mkdirTree(target.slice(0,target.lastIndexOf('/')));fs.writeFile(target,bytes);}
            state.hydrated=true;
          }
          return remove.call(this,id);
        };
      });return result;
    };
    async function resumeCampaign(snapshot){
      if(!state.loading||state.ready)return true;
      if(state.error)throw Error(state.error);
      const native=frame();if(!payload||!state.hydrated||!native?.playing||!Number.isFinite(Number(native.gameTime)))return false;
      if(native.nativeLevel!==payload.metadata.nativeLevel||Number(native.gameTime)<payload.metadata.gameTime)return false;
      const proof={ok:true,mode:'campaign',nativeLevel:native.nativeLevel,gameTime:Number(native.gameTime),mission:snapshot?.mission||payload.metadata.mission};
      if(bridge()?.campaignSaveRestored?.(docSession,payload.metadata.id,JSON.stringify(proof))!==true)throw Error('The restored campaign could not be verified.');
      state.ready=true;emit();return true;
    }
    async function resumeFfa(snapshot){
      if(state.ended)throw Error('The Challenge save was cancelled.');
      if(!state.loading||state.ready)return true;
      if(state.error)throw Error(state.error);
      const native=frame(),metadata=payload?.metadata;
      if(!metadata||!state.hydrated||!native?.playing||!Number.isFinite(Number(native.gameTime)))return false;
      if(snapshot?.mode!=='challenge'||snapshot.map!==metadata.mapId||snapshot.maxPlayers!==ffaDescriptor()?.players||snapshot.session!==metadata.session||native.session!==metadata.session
          ||snapshot.difficulty!==metadata.difficulty||native.difficulty!==metadata.difficulty
          ||native.nativeLevel!==metadata.nativeLevel||Number(native.gameTime)<metadata.gameTime)return false;
      const botType=liveBotType(snapshot);
      if(botType!==savedBotType(metadata)||native.botType!==botType)throw Error('The restored Challenge bots did not match the saved match.');
      const proof={ok:true,mode:'challenge',session:metadata.session,mapId:metadata.mapId,mapName:metadata.mapName,players:ffaDescriptor().players,bots:ffaDescriptor().bots,difficulty:metadata.difficulty,
        botType,nativeLevel:native.nativeLevel,gameTime:Number(native.gameTime),savedGameTime:metadata.gameTime};
      if(bridge()?.challengeRestored?.(docSession,metadata.id,JSON.stringify(proof))!==true)throw Error('The restored Challenge could not be verified.');
      if(state.ended)throw Error('The Challenge save was cancelled.');
      state.ready=true;emit();return true;
    }
    async function resumeRewards(commands,expectedDocumentSession){
      if(expectedDocumentSession!==docSession||state.ended||!payload||!state.hydrated)throw Error('The saved Challenge was cancelled.');
      if(state.ready)return true;
      const deadline=Date.now()+12000,token=serial;
      const currentRestore=()=>{if(state.ended||token!==serial)throw Error('The saved Challenge was cancelled.');};
      const bounded=async(promise,message)=>{
        let timer;
        try{
          const result=await Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),Math.max(1,deadline-Date.now()));})]);
          currentRestore();return result;
        }finally{clearTimeout(timer);}
      };
      feedback('restore','Restoring saved purchases…');
      try{
        const caps=JSON.parse(bridge()?.rewardResumeCaps?.(docSession)||'{}');
        if(caps.session!==payload.metadata.rewardRunId||caps.profile!=='challenge'||caps.map!==config.map)throw Error('The saved Challenge purchases do not match.');
        await bounded(window.WarzoneRewards.reconcilePending(commands,docSession),'The saved purchases did not respond. Return Home and load this save again.');
        const resumed=await bounded(commands.send('resume-rewards',{rewards:caps}),'The saved Challenge purchases did not resume. Return Home and load this save again.');
        if(!resumed.ok||resumed.result?.ok!==true)throw Error('The saved Challenge purchases could not resume.');
        const fresh=await bounded(commands.send('reward-inventory'),'The saved purchase inventory did not respond. Return Home and load this save again.');
        if(!fresh.ok||fresh.result?.session!==caps.session)throw Error('The saved Challenge purchase state is missing.');
        const native=frame(),metadata=payload.metadata,snapshot=controller()?.report?.().snapshot;
        if(!native?.playing||snapshot?.session!==metadata.session||native.nativeLevel!==metadata.nativeLevel||Number(native.gameTime)<metadata.gameTime)throw Error('The restored Challenge native state does not match.');
        liveBotType(snapshot);
        const proof={ok:true,mode:'challenge',profile:'challenge',session:metadata.session,rewardRunId:caps.session,mapId:metadata.mapId,nativeLevel:native.nativeLevel,difficulty:metadata.difficulty,weapon:metadata.weapon,vtol:true,botType:'dumbot25a',players:2,bots:1,gameTime:Number(native.gameTime),rewards:fresh.result};
        if(bridge()?.challengeRestored?.(docSession,metadata.id,JSON.stringify(proof))!==true)throw Error('The restored Challenge could not be verified.');
        currentRestore();state.ready=true;feedback('ready','');return true;
      }catch(error){
        if(!state.ended){state.error=String(error.message||error);feedback('error',state.error);}
        throw error;
      }
    }
    async function until(predicate,deadline,token,message){
      for(;;){if(state.ended||token!==serial)throw Error('The '+label+' save was cancelled.');const value=predicate();if(value)return value;if(Date.now()>=deadline)throw Error(message);await pause(50);}
    }
    function quick(fs,root){try{return{mtime:Number(fs.stat(root+'/gam.json').mtime),gam:JSON.parse(fs.readFile(root+'/gam.json',{encoding:'utf8'}))};}catch(_){return null;}}
    function capture(fs,root){
      const values={};let size=0,count=0;
      const visit=(directory,prefix)=>{for(const name of fs.readdir(directory).filter(name=>name!=='.'&&name!=='..')){
        const relative=validName(prefix+name),path=directory+'/'+name,stat=fs.lstat(path);
        if(fs.isDir(stat.mode)){visit(path,relative+'/');continue;}
        if(!fs.isFile(stat.mode)||++count>256||stat.size>32*1024*1024-size)throw Error('The '+label+' save is too large.');
        const bytes=fs.readFile(path);size+=bytes.length;const chunks=[];
        for(let offset=0;offset<bytes.length;offset+=8192)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+8192)));
        values[relative]=btoa(chunks.join(''));
      }};visit(root,'');return{values,decoded:decode(values)};
    }
    async function saveCampaign(){
      if(state.busy||state.ended)return false;
      if(!state.ready||!window.__towersHtml?.isActive?.()||window.WarzoneRewards?.ready!==true||controller()?.nativeUiActive?.()){
        state.error='Return to the '+label+' battlefield before saving.';feedback('error',state.error);bridge()?.showNotice?.(state.error);return false;
      }
      state.busy=true;state.error='';const token=++serial,deadline=Date.now()+18000;
      controller()?.refreshIntent?.();
      feedback('start','Preparing save…');
      try{
        const campaign=controller(),commands=window.__warzoneCommands,module=current(),fs=module?.FS;
        if(!commands||!fs?.syncfs||typeof persist!=='function')throw Error((ffa?'Challenge':'Campaign')+' save storage is unavailable.');
        window.__blockNightResearch?.close?.();window.__kalaWarzoneTouch?.closeHelp?.();
        const closed=await commands.afterBuildExit(()=>true);if(closed===false)throw Error('Finish the current '+label+' action before saving.');
        await commands.close();window.__kalaWarzoneTouch?.releaseAll?.(true,false);
        await window.WarzoneRewards.reconcilePending(commands,docSession);
        const inventory=await commands.send('reward-inventory');
        if(!inventory.ok||bridge()?.rewardInventorySnapshot?.(docSession,JSON.stringify(inventory.result))!==true)throw Error('The match purchases could not be saved.');
        const before=frame();if(!before?.worldSafe||!Number.isFinite(Number(before.gameTime)))throw Error('Resume the '+label+' before saving.');
        const mission=campaign.report().snapshot,missionSession=mission?.session;
        await until(()=>Number(frame()?.gameTime)>Number(before.gameTime),deadline,token,'The '+label+' is paused. Resume before saving.');
        const target=module.canvas||document.getElementById('canvas');target?.focus?.({preventScroll:true});
        for(const[key,number]of[['Control',17],['Shift',16],['Alt',18],['Meta',91]])for(const[side,location]of[['Left',1],['Right',2]])target.dispatchEvent(new KeyboardEvent('keyup',{key,code:key+side,location,keyCode:number,which:number,bubbles:true,cancelable:true,ctrlKey:false,shiftKey:false,altKey:false,metaKey:false}));
        if(ffa){const releasedAt=Number(frame()?.gameTime);await until(()=>Number(frame()?.gameTime)>releasedAt,deadline,token,'Resume the Challenge before saving.');}
        const root=(module.WZVAL_configDirPath||window.wz_js_get_config_dir_path?.())+'/savegames/'+folder+'/QuickSave';
        const previous=quick(fs,root),operation=persistStarted;
        feedback('save','Saving…');await pause(40);
        if((ffa&&typeof window.__kalaWarzoneTouch?.nativePressKey!=='function')||window.__kalaWarzoneTouch?.nativePressKey?.('F7','F7',118)===false)throw Error('The native '+label+' Save command is unavailable.');
        const saved=await until(()=>{const value=quick(fs,root);return value&&(!previous||value.mtime!==previous.mtime)&&value.gam.gameTime>=Number(before.gameTime)&&persistStarted>operation&&persistCompleted>operation?value:false;},deadline,token,'The '+label+' did not finish saving.');
        await until(()=>Number(frame()?.gameTime)>saved.gam.gameTime,deadline,token,'The '+label+' did not resume after saving.');
        if(campaign.report().snapshot?.session!==missionSession)throw Error(ffa?'The Challenge changed while saving.':'The mission changed while saving. Save again in the new mission.');
        feedback('write','Writing save…');
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Writing the '+label+' save took too long.')),Math.max(1,deadline-Date.now()));fs.syncfs(false,error=>{clearTimeout(timer);error?reject(Error('The '+label+' save could not be written.')):resolve();});});
        const captured=capture(fs,root),gam=json(captured.decoded.get('gam.json'));
        if(gam.gameTime!==saved.gam.gameTime||gam.levelName!==saved.gam.levelName)throw Error('The '+label+' checkpoint changed while saving.');
        const metadata=ffa?{mode:'challenge',profile:'challenge',session:missionSession,mapId:mission.map,mapName:ffaDescriptor().name,players:2,bots:1,difficulty:mission?.difficulty,botType:liveBotType(mission),weapon:config.weapon,vtol:true,rewardRunId:JSON.parse(bridge()?.rewardConfig?.(docSession)||'{}').session,nativeLevel:gam.levelName,gameTime:gam.gameTime}
          :{mode:'campaign',session:missionSession||docSession,mission:mission?.mission||gam.levelName,nativeLevel:gam.levelName,mapId:gam.levelName,gameTime:gam.gameTime};
        if(ffa){
          validate({metadata:{...metadata,id:'wt_'+'0'.repeat(32)},files:captured.values});
          if(state.ended||token!==serial||!frame()?.playing||campaign.report().snapshot?.session!==missionSession)throw Error('The Challenge changed while saving.');
          if(liveBotType(campaign.report().snapshot)!==metadata.botType)throw Error('The Challenge bots changed while saving.');
        }
        const result=JSON.parse((ffa?bridge()?.challengeSave?.(docSession,JSON.stringify(metadata),JSON.stringify(captured.values))
          :bridge()?.storeCampaignSave?.(docSession,JSON.stringify(metadata),JSON.stringify(captured.values)))||'{}');
        if(result.ok!==true||!/^wt_[a-f0-9]{32}$/.test(result.id||''))throw Error(result.error||'The '+label+' save could not be archived.');
        state.savedId=result.id;feedback('saved','Game saved');bridge()?.showNotice?.('Game saved');return true;
      }catch(error){if(!ffa||!state.ended){state.error=String(error.message||error);feedback('error',state.error);bridge()?.showNotice?.(state.error);}return false;}
      finally{state.busy=false;emit();controller()?.refreshIntent?.();}
    }
    window.addEventListener('warzone-battle-ended',()=>{state.ended=true;state.ready=false;state.busy=false;++serial;feedback('ended','');});
    window.WarzoneSavedGames={get loading(){return state.loading;},get restoring(){return state.loading&&!state.ready;},get ready(){return state.ready;},get busy(){return state.busy;},save:saveCampaign,resumeRewards,
      ...(ffa?{resumeFfa}:{resumeCampaign}),
      report:()=>({...state,mode,docSession,slotId:payload?.metadata.id||'',persistenceStarted:persistStarted,persistenceCompleted:persistCompleted})};
  }
})();
