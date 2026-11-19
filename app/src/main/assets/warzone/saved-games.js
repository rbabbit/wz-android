/* Complete native saved games. The phone archive never rewrites world state. */
(() => {
  'use strict';
  if (window.WarzoneSavedGames || window.__warzoneDuelConfig?.mode === 'duel') return;
  if(window.__warzoneFfaMode===true||window.__warzoneFfaConfig?.mode==='ffa'||new URLSearchParams(location.search).get('mode')==='ffa'){installCampaignSaves(true);return;}
  if(window.__warzoneCampaignMode===true||new URLSearchParams(location.search).get('mode')==='campaign'){installCampaignSaves();return;}
  const survivalConfig=window.__warzoneSurvivalConfig;
  const survival=survivalConfig?.mode==='survival'&&Object.isFrozen(survivalConfig);
  const docSession = window.__towersHtml?.session || window.__towersHtmlSession || '';
  const MAX_BYTES = 32 * 1024 * 1024, MAX_FILES = 256;
  const state = {loading:false,ready:true,busy:false,ended:false,error:'',serial:0,savedId:'',hydrated:false,
    phase:'idle',status:'',statusAt:0};
  const persistence = {started:0,completed:new Set()};
  const bridge = () => window.BlockNightAndroid;
  const module = () => window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
  const wave = () => window.__warzoneTowersWaves?.report?.().snapshot;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const notice = message => bridge()?.showNotice?.(message);
  let payload = null, files = null;

  // Header feedback observes the real operation; it never decides whether a
  // save succeeded. Keep a durable snapshot for a header created after an event.
  function emitState() {
    try { window.dispatchEvent(new CustomEvent('warzone-save-state', {detail:{
      phase:state.phase,status:state.status,statusAt:state.statusAt,busy:state.busy,
      ready:state.ready,ended:state.ended,error:state.error,savedId:state.savedId
    }})); } catch (_) { /* A display listener must not interrupt persistence. */ }
  }
  function feedback(phase, status) {
    state.phase = phase; state.status = status; state.statusAt = Date.now(); emitState();
  }
  function rejectSave(message) {
    state.error = message; feedback('error', message); notice(message); return false;
  }

  function safeName(name) {
    if (typeof name !== 'string' || !name || name.length > 240 || name.includes('\\')
        || name.startsWith('/') || name.split('/').some(part => !/^[A-Za-z0-9_.-]{1,80}$/.test(part) || part === '.' || part === '..'))
      throw Error('The saved game contains an invalid file name.');
    return name;
  }
  function decodeFiles(encoded) {
    if (!encoded || Array.isArray(encoded) || typeof encoded !== 'object') throw Error('The saved game files are missing.');
    const entries = Object.entries(encoded);
    if (!entries.length || entries.length > MAX_FILES) throw Error('The saved game has too many files.');
    const decoded = new Map(); let total = 0;
    for (const [name, value] of entries) {
      safeName(name);
      if (typeof value !== 'string' || value.length > Math.ceil(MAX_BYTES / 3) * 4 || value.length % 4
          || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
        throw Error('The saved game contains invalid file data.');
      const binary = atob(value), bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      total += bytes.length;
      if (total > MAX_BYTES) throw Error('The saved game is too large.');
      decoded.set(name, bytes);
    }
    for (const name of ['gam.json','main.json','gameinfo.json','scriptstate.json','game.map'])
      if (!decoded.has(name)) throw Error('The saved game is incomplete: ' + name + '.');
    return decoded;
  }
  function jsonBytes(bytes) { return JSON.parse(new TextDecoder().decode(bytes)); }
  function savedGlobals(script, logicalSession) {
    return Object.values(script).find(value => value && typeof value === 'object'
      && value.wtreward_match?.session === logicalSession && value.warzoneTowersWaves_state
      && (!survival || value.survivalIdentity?.version===94 && value.survivalIdentity.mode==='survival'
        && value.survivalIdentity.profile==='survival' && value.survivalIdentity.map===survivalConfig.map
        && value.survivalIdentity.level===survivalConfig.level && value.survivalIdentity.player===0 && value.survivalIdentity.enemyPlayer===1));
  }
  function validatePayload(value) {
    if (!value?.metadata || !/^wt_[a-f0-9]{32}$/.test(value.metadata.id || '')) throw Error('The saved game slot is invalid.');
    const decoded = decodeFiles(value.files), gam = jsonBytes(decoded.get('gam.json'));
    const meta = value.metadata;
    if(survival ? meta.mode!=='survival'||meta.profile!=='survival'||meta.mapId!==survivalConfig.map||meta.nativeLevel!==survivalConfig.level||meta.totalRounds!==60
      : meta.mode==='survival'||meta.profile==='survival') throw Error('The saved game belongs to another mode.');
    if (typeof meta.session !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(meta.session)
        || !Number.isInteger(meta.gameTime) || meta.gameTime < 0 || gam.gameTime !== meta.gameTime
        || !meta.nativeLevel || gam.levelName !== meta.nativeLevel
        || !savedGlobals(jsonBytes(decoded.get('scriptstate.json')), meta.session))
      throw Error('The saved game identity does not match its native files.');
    const map = new URLSearchParams(location.search).get('map');
    if (!meta.mapId || map && map !== meta.mapId) throw Error('The saved game belongs to another map.');
    return decoded;
  }
  try {
    const value = JSON.parse(bridge()?.savedGamePayload?.(docSession) || '{}');
    if (value.metadata || value.files || value.error) {
      state.loading = true; state.ready = false;
      if (value.error) throw Error(String(value.error));
      files = validatePayload(value); payload = value;
    }
  } catch (error) { state.loading = true; state.ready = false; state.error = error.message; }

  // Native F7 calls this original browser persistence callback while its main
  // loop is paused. Observe completion without changing pause/resume behavior.
  const originalPersist = window.wz_js_save_config_dir_to_persistent_storage;
  if (typeof originalPersist === 'function') window.wz_js_save_config_dir_to_persistent_storage = function(user, callback) {
    const serial = user ? ++persistence.started : 0;
    return originalPersist.call(this, user, function(...args) {
      if (serial) persistence.completed.add(serial);
      return callback?.apply(this, args);
    });
  };
  const originalConfig = window.constructWZModuleConfig;
  if (typeof originalConfig === 'function') window.constructWZModuleConfig = function(...args) {
    const result = originalConfig.apply(this, args);
    if (!state.loading) return result;
    if (state.error || !payload || !files) throw Error(state.error || 'The saved game could not be read.');
    result.arguments = (result.arguments || []).filter(arg => !/^--(?:skirmish|loadskirmish)=/.test(arg));
    result.arguments.push('--loadskirmish=' + payload.metadata.id);
    result.preRun ||= [];
    result.preRun.push(current => {
      const originalRemove = current.removeRunDependency;
      current.removeRunDependency = function(id) {
        if (id === 'persistent_warzone2100_config_dir' && !state.hydrated) {
          if (state.ended) throw Error('The saved game was cancelled.');
          const fs = current.FS, config = current.WZVAL_configDirPath || window.wz_js_get_config_dir_path?.();
          if (!fs || !config) throw Error('Native saved game storage is unavailable.');
          const root = config + '/savegames/skirmish/' + payload.metadata.id;
          fs.mkdirTree(root);
          for (const [name, bytes] of files) {
            const target = root + '/' + name, parent = target.slice(0, target.lastIndexOf('/'));
            fs.mkdirTree(parent); fs.writeFile(target, bytes);
          }
          state.hydrated = true;
        }
        return originalRemove.call(this, id);
      };
    });
    return result;
  };

  function active(token) {
    if (state.ended || token !== state.serial || window.__towersHtml?.isEnded?.()) throw Error('The saved game operation was cancelled.');
  }
  function bounded(promise, deadline, token, message) {
    return new Promise((resolve,reject) => {
      // Callers may have started work before a synchronous battle retirement.
      // Always consume its rejection, even when this operation is already stale.
      let timer;
      Promise.resolve(promise).then(value => { clearTimeout(timer); try { active(token); resolve(value); } catch(error) { reject(error); } },
        error => { clearTimeout(timer); reject(error); });
      try {
        active(token);
        const remaining = deadline - Date.now();
        if (remaining <= 0) { reject(Error(message)); return; }
        timer = setTimeout(() => reject(Error(message)), remaining);
      } catch (error) { reject(error); }
    });
  }
  function paintFeedback(deadline, token) {
    // Let the accepted tap paint before native F7 / archive work. A hidden
    // WebView may not deliver animation frames, so this wait is always bounded.
    return bounded(new Promise(resolve => {
      let first = 0, second = 0, finished = false;
      const finish = () => {
        if (finished) return; finished = true; clearTimeout(timer);
        if (first) window.cancelAnimationFrame?.(first);
        if (second) window.cancelAnimationFrame?.(second);
        resolve();
      };
      const timer = setTimeout(finish, 250);
      if (typeof window.requestAnimationFrame === 'function')
        first = window.requestAnimationFrame(() => { second = window.requestAnimationFrame(finish); });
    }), deadline, token, 'The saved game operation was cancelled.');
  }
  async function until(predicate, deadline, token, message) {
    for (;;) {
      active(token);
      const result = predicate(); if (result) return result;
      if (Date.now() >= deadline) throw Error(message);
      await pause(50);
    }
  }
  async function inventory(commands, deadline, token) {
    const reply = await bounded(commands.send('reward-inventory', {}, {fresh:true}), deadline, token, 'The native inventory did not respond.');
    if (!reply.ok || reply.result?.ok !== true || !Number.isInteger(reply.gameTime))
      throw Error(reply.result?.error || reply.reason || 'The native inventory is unavailable.');
    return reply;
  }
  async function resumeRewards(commands, expectedDocumentSession) {
    if (!state.loading) return true;
    if (state.ready) return true;
    if (expectedDocumentSession !== docSession || state.error || !payload || !state.hydrated)
      throw Error(state.error || 'The saved game was not restored.');
    const token = ++state.serial, deadline = Date.now() + 15000;
    try {
      if (typeof window.WarzoneRewards?.reconcilePending !== 'function') throw Error('Saved purchase recovery is unavailable.');
      await bounded(window.WarzoneRewards.reconcilePending(commands, docSession), deadline, token, 'The saved purchases did not respond.');
      const caps = JSON.parse(bridge()?.rewardResumeCaps?.(docSession) || '{}');
      if (caps.session !== payload.metadata.session) throw Error('The saved purchase identity does not match this game.');
      const resumed = await bounded(commands.send('resume-rewards', {rewards:caps}), deadline, token, 'The saved purchases did not respond.');
      if (!resumed.ok || resumed.result?.ok !== true || resumed.result.session !== caps.session || !resumed.result.resumed)
        throw Error(resumed.result?.error || resumed.reason || 'The saved purchases could not be restored.');
      const fresh = await inventory(commands, deadline, token);
      if (fresh.result.session !== caps.session || fresh.gameTime < payload.metadata.gameTime)
        throw Error('The native game did not restore the saved battle.');
      const proof = {ok:true,session:caps.session,mapId:payload.metadata.mapId,nativeLevel:payload.metadata.nativeLevel,
        gameTime:fresh.gameTime,savedGameTime:payload.metadata.gameTime,rewards:fresh.result};
      if(survival) Object.assign(proof,{mode:'survival',profile:'survival'});
      if (bridge()?.savedGameRestored?.(docSession, payload.metadata.id, JSON.stringify(proof)) !== true)
        throw Error('The saved game could not be verified.');
      active(token); state.ready = true; emitState(); return true;
    } catch (error) { state.error = error.message; feedback('error', error.message); throw error; }
  }
  function quickSave(fs, root) {
    try { return {mtime:Number(fs.stat(root + '/gam.json').mtime),gam:JSON.parse(fs.readFile(root + '/gam.json',{encoding:'utf8'}))}; }
    catch (_) { return null; }
  }
  function capture(fs, root) {
    const values = {}, raw = new Map(); let total = 0;
    function visit(directory, prefix) {
      for (const name of fs.readdir(directory).filter(name => name !== '.' && name !== '..')) {
        const relative = safeName(prefix + name), path = directory + '/' + name, stat = fs.lstat(path);
        if (fs.isDir(stat.mode)) { visit(path, relative + '/'); continue; }
        if (!fs.isFile(stat.mode)) throw Error('The native save contains an unsupported file.');
        if (raw.size >= MAX_FILES || stat.size > MAX_BYTES - total) throw Error('The native saved game is too large.');
        const bytes = fs.readFile(path); total += bytes.length;
        if (total > MAX_BYTES) throw Error('The native saved game is too large.');
        raw.set(relative, bytes);
        const chunks = [];
        for (let offset=0;offset<bytes.length;offset+=8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset+8192)));
        values[relative] = btoa(chunks.join(''));
      }
    }
    visit(root, ''); decodeFiles(values); return {values,raw};
  }
  async function closeMenus(commands, deadline, token) {
    const owner = window.parent?.WarzoneHost ? window.parent : window;
    window.WarzoneRewards?.cancelTarget?.();
    window.WarzoneRewards?.closeDrawer?.();
    await until(() => !window.WarzoneRewards?.report?.().nativeDrawerOpen,
      deadline, token, 'The Rewards menu could not close before saving.');
    window.__blockNightResearch?.close?.(); owner.TowersStatus?.close?.();
    window.WarzoneMusic?.closeMenu?.(false);
    const help = owner.document.getElementById('warzone-towers-help-overlay');
    if (help && !help.hidden) window.__kalaWarzoneTouch?.closeHelp?.();
    const closed = await bounded(commands.afterBuildExit(() => { active(token); return true; }), deadline, token, 'The game is still finishing accepted input.');
    if (closed !== true) throw Error('Finish the current action before saving.');
    await until(() => !window.__kalaWarzoneTouch?.report?.().pendingClicks && !commands.report?.().pending,
      deadline, token, 'The game is still finishing accepted input.');
    window.__kalaWarzoneTouch?.releaseAll?.(true);
    active(token);
    const target = module()?.canvas || document.getElementById('canvas');
    if (!target?.dispatchEvent) throw Error('The native game input is unavailable.');
    try { target.focus({preventScroll:true}); } catch (_) { target.focus(); }
    // SDL tracks left/right modifiers independently. A native Right Shift left
    // held by a keyboard return consumes F7 as Toggle Radar instead of saving.
    for (const [key, number] of [['Control',17],['Shift',16],['Alt',18],['Meta',91]])
      for (const [side,location] of [['Left',1],['Right',2]]) target.dispatchEvent(new KeyboardEvent('keyup', {
        key,code:key+side,location,keyCode:number,which:number,bubbles:true,cancelable:true,repeat:false,
        ctrlKey:false,shiftKey:false,altKey:false,metaKey:false
      }));
  }
  async function save() {
    if (state.ended) return false;
    if (state.busy) { emitState(); return false; }
    if (window.WarzoneRewards?.busy === true)
      return rejectSave('Wait until the current purchase finishes before saving.');
    if (!state.ready || !window.__towersHtml?.isActive?.() || window.WarzoneRewards?.ready !== true) {
      return rejectSave('Wait until the battle is ready before saving.');
    }
    state.busy = true; state.error = '';
    const token = ++state.serial, deadline = Date.now() + 15000;
    feedback('start', 'Preparing save…');
    try {
      await paintFeedback(deadline, token);
      const commands = window.__warzoneCommands, current = module(), fs = current?.FS;
      if (!commands || !fs?.syncfs || typeof originalPersist !== 'function') throw Error('Native saved game storage is unavailable.');
      await closeMenus(commands, deadline, token);
      if (typeof window.WarzoneRewards?.reconcilePending !== 'function') throw Error('Saved purchase recovery is unavailable.');
      await bounded(window.WarzoneRewards.reconcilePending(commands, docSession), deadline, token, 'The pending purchases did not respond.');
      const before = await inventory(commands, deadline, token), clock = wave()?.gameTime;
      // A later native scenario tick confirms SDL has processed the releases.
      await until(() => Number(wave()?.gameTime) > Number(clock), Math.min(deadline,Date.now()+2000), token, 'Resume the game before saving.');
      const root = (current.WZVAL_configDirPath || window.wz_js_get_config_dir_path?.()) + '/savegames/skirmish/QuickSave';
      const previous = quickSave(fs, root), syncSerial = persistence.started;
      const errorCursor = Array.isArray(window.errorLog) ? window.errorLog.length : 0;
      active(token);
      feedback('save', 'Saving…');
      await paintFeedback(deadline, token);
      if (typeof window.__kalaWarzoneTouch?.nativePressKey !== 'function'
          || window.__kalaWarzoneTouch.nativePressKey('F7','F7',118) === false) throw Error('The native Save command is unavailable.');
      const saved = await until(() => {
        const errors = Array.isArray(window.errorLog) ? window.errorLog.slice(errorCursor).map(String).join('\n') : '';
        if (/Unable to save level name.*too long/i.test(errors)) throw Error('This map’s internal name is too long to save.');
        if (/\bwriteGameFile\b|\bsaveGame\b[^\n]*failed|QuickSave failed/i.test(errors)) throw Error('The game could not create this save.');
        const value = quickSave(fs, root);
        return value && (!previous || value.mtime !== previous.mtime) && value.gam.gameTime >= before.gameTime
          && persistence.started > syncSerial && persistence.completed.has(syncSerial + 1) ? value : false;
      }, deadline, token, 'The native game did not finish saving. Try again with the game running.');
      await until(() => Number(wave()?.gameTime) > saved.gam.gameTime, deadline, token, 'The native game did not resume after saving.');
      feedback('write', 'Writing save…');
      await paintFeedback(deadline, token);
      await bounded(new Promise((resolve,reject) => fs.syncfs(false, error => error ? reject(Error('The native save could not be written to storage.')) : resolve())),
        deadline, token, 'Saving to storage took too long.');
      const captured = capture(fs, root), gam = jsonBytes(captured.raw.get('gam.json'));
      if (gam.gameTime !== saved.gam.gameTime || gam.levelName !== saved.gam.levelName) throw Error('The native saved game changed during capture.');
      const fresh = await inventory(commands, deadline, token), logicalSession = fresh.result.session;
      const globals = savedGlobals(jsonBytes(captured.raw.get('scriptstate.json')), logicalSession);
      if (!globals || logicalSession !== before.result.session || !gam.levelName || !fresh.result.baseConfig)
        throw Error('The native saved game identity could not be verified.');
      const savedWave = globals.warzoneTowersWaves_state, liveWave = wave();
      const metadata = {session:logicalSession,mapId:new URLSearchParams(location.search).get('map') || 'td2',nativeLevel:gam.levelName,
        gameTime:gam.gameTime,wave:savedWave.wave,totalRounds:liveWave?.totalRounds,totalWaves:liveWave?.totalRounds,
        baseConfig:fresh.result.baseConfig,rewards:fresh.result};
      if(survival) {
        if(gam.levelName!==survivalConfig.level||liveWave?.mode!=='survival'||liveWave.map!==survivalConfig.map||liveWave.totalRounds!==60)
          throw Error('The Survival save identity could not be verified.');
        Object.assign(metadata,{mode:'survival',profile:'survival'});
      }
      active(token);
      if (bridge()?.rewardInventorySnapshot?.(docSession,JSON.stringify(fresh.result)) !== true)
        throw Error('The saved purchase inventory could not be verified.');
      const result = JSON.parse(bridge()?.storeSavedGame?.(docSession,JSON.stringify(metadata),JSON.stringify(captured.values)) || '{}');
      if (result.ok !== true || !/^wt_[a-f0-9]{32}$/.test(result.id || '')) throw Error(result.error || 'The saved game could not be archived.');
      active(token); state.savedId = result.id;
      state.phase = 'saved'; state.status = 'Game saved'; state.statusAt = Date.now();
      if (window.WarzoneNotices) window.WarzoneNotices.show('Game saved');
      else notice('Game saved');
      return true;
    } catch (error) {
      if (!state.ended) {
        state.error = error.message; state.phase = 'error'; state.status = error.message; state.statusAt = Date.now(); notice(error.message);
      }
      return false;
    } finally { if (token === state.serial) { ++state.serial; state.busy = false; emitState(); } }
  }
  window.addEventListener('warzone-battle-ended', () => {
    state.ended=true; state.ready=false; state.busy=false; ++state.serial; feedback('ended', '');
  });
  window.WarzoneSavedGames = {get loading(){return state.loading;},get ready(){return state.ready;},get busy(){return state.busy;},save,resumeRewards,
    report:() => ({...state,docSession,logicalSession:payload?.metadata.session || '',slotId:payload?.metadata.id || '',
      persistenceStarted:persistence.started,persistenceCompleted:Array.from(persistence.completed)})};

  function installCampaignSaves(ffa=false){
    const mode=ffa?'ffa':'campaign',label=ffa?'FFA':'campaign',folder=ffa?'skirmish':'campaign';
    const config=window.__warzoneFfaConfig,controller=()=>ffa?window.__warzoneFfa:window.__warzoneCampaign;
    const ffaDescriptor=()=>window.__warzoneFfaMaps?.find(value=>value.id===config?.map)
      ||(config?.map==='emag'?{id:'emag',name:'EMAG FFA',players:4,bots:3,level:'FFA-EMAG-T1'}:null);
    const docSession=window.__towersHtml?.session||new URLSearchParams(location.search).get('battle_session')||'';
    const state={loading:false,ready:true,busy:false,ended:false,hydrated:false,error:'',phase:'idle',status:'',statusAt:0,savedId:''};
    const bridge=()=>window.BlockNightAndroid,current=()=>window.LaunchedModule||window.Module;
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    let payload=null,files=null,persistStarted=0,persistCompleted=0,serial=0;
    const frame=()=>{try{
      const native=JSON.parse(current().FS.readFile('/tmp/warzone-campaign-state-v51.json',{encoding:'utf8'}));
      if(!ffa)return native;
      const snapshot=controller()?.report?.().snapshot;if(snapshot?.mode!=='ffa')return null;
      const playing=snapshot.playing===true&&snapshot.phase==='active';
      return{...native,mode,map:snapshot.map,mapName:snapshot.mapName,players:snapshot.maxPlayers,bots:snapshot.maxPlayers-1,session:snapshot.session,difficulty:snapshot.difficulty,botType:snapshot.botType,playing,
        worldSafe:playing&&!native.paused&&!native.video&&!native.nativeMenuOpen&&!native.transportOpen&&!native.intelligenceOpen};
    }catch(_){return null;}};
    const emit=()=>window.dispatchEvent(new CustomEvent('warzone-save-state',{detail:{...state}}));
    const feedback=(phase,status)=>{state.phase=phase;state.status=status;state.statusAt=Date.now();emit();};
    const validName=name=>{if(typeof name!=='string'||!name||name.length>240||name.startsWith('/')||name.includes('\\')||name.split('/').some(part=>!part||part==='.'||part==='..'||!/^[A-Za-z0-9_.-]{1,80}$/.test(part)))throw Error('The '+label+' save contains an invalid file name.');return name;};
    const json=bytes=>JSON.parse(new TextDecoder().decode(bytes));
    function teamSetup(value,count=ffaDescriptor()?.players){
      const gameType=value?.gameType??'ffa',entries=value?.teams;
      if(!Number.isInteger(count)||count<2||count>10||!['ffa','teams'].includes(gameType))throw Error('The saved map game type is invalid.');
      const teams=entries===undefined&&gameType==='ffa'?Array.from({length:count},(_,i)=>i):entries;
      if(!Array.isArray(teams)||teams.length!==count||teams.some((team,i)=>!Number.isInteger(team)||team<0||team>=count||(gameType==='ffa'&&team!==i))
          ||gameType==='teams'&&new Set(teams).size<2)throw Error('The saved map teams are invalid.');
      return{gameType,teams:[...teams]};
    }
    function sameTeamSetup(left,right){
      const first=teamSetup(left),second=teamSetup(right);
      return first.gameType===second.gameType&&first.teams.every((team,i)=>team===second.teams[i]);
    }
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
        &&value.ffaSession===metadata.session&&value.ffaConfig?.mode==='ffa'&&value.ffaConfig.map===metadata.mapId
        &&value.ffaConfig.difficulty===metadata.difficulty&&value.ffaConfig.player===0&&!value.ffaOutcome&&sameTeamSetup(value.ffaConfig,metadata));
    }
    function savedBotType(metadata){
      if(!Object.prototype.hasOwnProperty.call(metadata,'botType'))return 'nullbot';
      if(!window.WarzoneDownloadedMaps?.nativeBot(metadata.botType))throw Error('The FFA save bot identity is invalid.');
      return metadata.botType;
    }
    function liveBotType(snapshot){
      const type=snapshot?.botType,identity=window.WarzoneDownloadedMaps?.nativeBot(type),script=identity?.script.split('/').pop();
      if(!identity||!Array.isArray(snapshot.players))throw Error('The native FFA bot identity is unavailable.');
      if(type!==config?.botType)throw Error('The native FFA bots do not match the requested match.');
      const count=ffaDescriptor()?.players;
      if(!count||snapshot.map!==config.map||snapshot.maxPlayers!==count||snapshot.players.length!==count)throw Error('The native FFA map or player count is unavailable.');
      if(!sameTeamSetup(snapshot,config))throw Error('The native map teams do not match this match.');
      const setup=teamSetup(config);
      if(setup.gameType==='teams')for(let player=0;player<count;player++){
        const slots=snapshot.players.filter(value=>value.player===player);
        if(slots.length!==1||slots[0].team!==setup.teams[player])throw Error('The native player slots do not match their teams.');
      }
      for(let player=1;player<count;player++){
        const bots=snapshot.players.filter(value=>value.player===player);
        if(bots.length!==1||bots[0].botType!==type||String(bots[0].scriptName||'').split(/[\\/]/).pop()!==script)
          throw Error('The native FFA bots do not match this match.');
      }
      return type;
    }
    function validateFfaBots(decoded,metadata,gam){
      const type=savedBotType(metadata),identity=window.WarzoneDownloadedMaps.nativeBot(type),name=identity.name,script=identity.script.split('/').pop().replace(/\.js$/,'');
      const main=json(decoded.get('main.json')),savedScripts=json(decoded.get('scriptstate.json'));
      const difficulty={easy:1,medium:2,hard:3}[metadata.difficulty];
      const map=ffaDescriptor(),count=map?.players;
      const setup=teamSetup(metadata,count),alliance=setup.gameType==='teams'?2:0;
      if(!count||!Array.isArray(gam.netPlayers)||!Array.isArray(main.players)||gam.multiMaxPlayers!==count||main.maxPlayers!==count
          ||main.levelName!==map.level||gam.levelName!==map.level||main.selectedPlayer!==0||gam.netSelectedPlayer!==0
          ||main.allianceSetting!==alliance||gam.multiAlliance!==alliance)throw Error('The saved map or bot identity is missing.');
      for(let player=0;player<count;player++){
        const slot=main.players.filter(value=>value.index===player),native=gam.netPlayers[player];
        if(slot.length!==1||!native||slot[0].position!==player||slot[0].team!==setup.teams[player]||native.position!==player||native.team!==setup.teams[player]
            ||Boolean(slot[0].allocated)!==(player===0)||Boolean(native.allocated)!==(player===0)
            ||!Array.isArray(slot[0].alliances)||slot[0].alliances.length<count||slot[0].alliances.slice(0,count).some((value,other)=>value!==(setup.teams[player]===setup.teams[other]?3:0)))
          throw Error('The saved player slots or alliances do not match their teams.');
      }
      for(let player=1;player<count;player++){
        const native=gam.netPlayers[player],players=main.players.filter(value=>value.index===player);
        const contexts=Object.entries(savedScripts).filter(([key,value])=>/^globals_\d+$/.test(key)&&value?.me===player);
        if(!native||native.aiName!==name||native.difficulty!==difficulty||players.length!==1
            ||players[0].nameAI!==name||players[0].difficulty!==difficulty||contexts.length!==1||contexts[0][1].scriptName!==script)
          throw Error('The saved FFA bots do not match their native files.');
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
            ||!['easy','medium','hard'].includes(metadata.difficulty)||config?.mode!=='ffa'
            ||config.difficulty!==metadata.difficulty||!ffaGlobals(decoded,metadata))throw Error('The FFA save identity does not match its native rules.');
      }
      if(ffa){
        const type=validateFfaBots(decoded,metadata,gam);
        if(restoring&&(config.botType!==type||!sameTeamSetup(config,metadata)))throw Error('The saved match belongs to different bots or teams.');
      }
      return decoded;
    }
    try{
      const value=JSON.parse((ffa?bridge()?.savedGamePayload?.(docSession):bridge()?.campaignSavePayload?.(docSession))||'{}');
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
            if(ffa&&state.ended)throw Error('The FFA save was cancelled.');
            const fs=module.FS,root=(module.WZVAL_configDirPath||window.wz_js_get_config_dir_path?.())+'/savegames/'+folder+'/'+payload.metadata.id;
            if(!fs)throw Error((ffa?'FFA':'Campaign')+' save storage is unavailable.');
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
      if(state.ended)throw Error('The FFA save was cancelled.');
      if(!state.loading||state.ready)return true;
      if(state.error)throw Error(state.error);
      const native=frame(),metadata=payload?.metadata;
      if(!metadata||!state.hydrated||!native?.playing||!Number.isFinite(Number(native.gameTime)))return false;
      if(snapshot?.mode!=='ffa'||snapshot.map!==metadata.mapId||snapshot.maxPlayers!==ffaDescriptor()?.players||snapshot.session!==metadata.session||native.session!==metadata.session
          ||snapshot.difficulty!==metadata.difficulty||native.difficulty!==metadata.difficulty
          ||native.nativeLevel!==metadata.nativeLevel||Number(native.gameTime)<metadata.gameTime)return false;
      const botType=liveBotType(snapshot);
      if(botType!==savedBotType(metadata)||native.botType!==botType)throw Error('The restored FFA bots did not match the saved match.');
      const proof={ok:true,mode:'ffa',session:metadata.session,mapId:metadata.mapId,mapName:metadata.mapName,players:ffaDescriptor().players,bots:ffaDescriptor().bots,difficulty:metadata.difficulty,
        botType,...teamSetup(metadata),nativeLevel:native.nativeLevel,gameTime:Number(native.gameTime),savedGameTime:metadata.gameTime};
      if(bridge()?.ffaRestored?.(docSession,metadata.id,JSON.stringify(proof))!==true)throw Error('The restored FFA could not be verified.');
      if(state.ended)throw Error('The FFA save was cancelled.');
      state.ready=true;emit();return true;
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
      if(!state.ready||!window.__towersHtml?.isActive?.()||controller()?.nativeUiActive?.()){
        state.error='Return to the '+label+' battlefield before saving.';feedback('error',state.error);bridge()?.showNotice?.(state.error);return false;
      }
      state.busy=true;state.error='';const token=++serial,deadline=Date.now()+18000;
      controller()?.refreshIntent?.();
      feedback('start','Preparing save…');
      try{
        const campaign=controller(),commands=window.__warzoneCommands,module=current(),fs=module?.FS;
        if(!commands||!fs?.syncfs||typeof persist!=='function')throw Error((ffa?'FFA':'Campaign')+' save storage is unavailable.');
        window.__blockNightResearch?.close?.();window.__kalaWarzoneTouch?.closeHelp?.();
        const closed=await commands.afterBuildExit(()=>true);if(closed===false)throw Error('Finish the current '+label+' action before saving.');
        await commands.close();window.__kalaWarzoneTouch?.releaseAll?.(true,false);
        const before=frame();if(!before?.worldSafe||!Number.isFinite(Number(before.gameTime)))throw Error('Resume the '+label+' before saving.');
        const mission=campaign.report().snapshot,missionSession=mission?.session;
        await until(()=>Number(frame()?.gameTime)>Number(before.gameTime),deadline,token,'The '+label+' is paused. Resume before saving.');
        const target=module.canvas||document.getElementById('canvas');target?.focus?.({preventScroll:true});
        for(const[key,number]of[['Control',17],['Shift',16],['Alt',18],['Meta',91]])for(const[side,location]of[['Left',1],['Right',2]])target.dispatchEvent(new KeyboardEvent('keyup',{key,code:key+side,location,keyCode:number,which:number,bubbles:true,cancelable:true,ctrlKey:false,shiftKey:false,altKey:false,metaKey:false}));
        if(ffa){const releasedAt=Number(frame()?.gameTime);await until(()=>Number(frame()?.gameTime)>releasedAt,deadline,token,'Resume the FFA before saving.');}
        const root=(module.WZVAL_configDirPath||window.wz_js_get_config_dir_path?.())+'/savegames/'+folder+'/QuickSave';
        const previous=quick(fs,root),operation=persistStarted;
        feedback('save','Saving…');await pause(40);
        if((ffa&&typeof window.__kalaWarzoneTouch?.nativePressKey!=='function')||window.__kalaWarzoneTouch?.nativePressKey?.('F7','F7',118)===false)throw Error('The native '+label+' Save command is unavailable.');
        const saved=await until(()=>{const value=quick(fs,root);return value&&(!previous||value.mtime!==previous.mtime)&&value.gam.gameTime>=Number(before.gameTime)&&persistStarted>operation&&persistCompleted>operation?value:false;},deadline,token,'The '+label+' did not finish saving.');
        await until(()=>Number(frame()?.gameTime)>saved.gam.gameTime,deadline,token,'The '+label+' did not resume after saving.');
        if(campaign.report().snapshot?.session!==missionSession)throw Error(ffa?'The FFA changed while saving.':'The mission changed while saving. Save again in the new mission.');
        feedback('write','Writing save…');
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Writing the '+label+' save took too long.')),Math.max(1,deadline-Date.now()));fs.syncfs(false,error=>{clearTimeout(timer);error?reject(Error('The '+label+' save could not be written.')):resolve();});});
        const captured=capture(fs,root),gam=json(captured.decoded.get('gam.json'));
        if(gam.gameTime!==saved.gam.gameTime||gam.levelName!==saved.gam.levelName)throw Error('The '+label+' checkpoint changed while saving.');
        const metadata=ffa?{mode:'ffa',session:missionSession,mapId:mission.map,mapName:ffaDescriptor().name,players:ffaDescriptor().players,bots:ffaDescriptor().bots,difficulty:mission?.difficulty,botType:liveBotType(mission),...teamSetup(config),nativeLevel:gam.levelName,gameTime:gam.gameTime}
          :{mode:'campaign',session:missionSession||docSession,mission:mission?.mission||gam.levelName,nativeLevel:gam.levelName,mapId:gam.levelName,gameTime:gam.gameTime};
        if(ffa){
          validate({metadata:{...metadata,id:'wt_'+'0'.repeat(32)},files:captured.values});
          if(state.ended||token!==serial||!frame()?.playing||campaign.report().snapshot?.session!==missionSession)throw Error('The FFA changed while saving.');
          if(liveBotType(campaign.report().snapshot)!==metadata.botType)throw Error('The FFA bots changed while saving.');
        }
        const result=JSON.parse((ffa?bridge()?.ffaSave?.(docSession,JSON.stringify(metadata),JSON.stringify(captured.values))
          :bridge()?.storeCampaignSave?.(docSession,JSON.stringify(metadata),JSON.stringify(captured.values)))||'{}');
        if(result.ok!==true||!/^wt_[a-f0-9]{32}$/.test(result.id||''))throw Error(result.error||'The '+label+' save could not be archived.');
        state.savedId=result.id;feedback('saved','Game saved');bridge()?.showNotice?.('Game saved');return true;
      }catch(error){if(!ffa||!state.ended){state.error=String(error.message||error);feedback('error',state.error);bridge()?.showNotice?.(state.error);}return false;}
      finally{state.busy=false;emit();controller()?.refreshIntent?.();}
    }
    window.addEventListener('warzone-battle-ended',()=>{state.ended=true;state.ready=false;state.busy=false;++serial;feedback('ended','');});
    window.WarzoneSavedGames={get loading(){return state.loading;},get restoring(){return state.loading&&!state.ready;},get ready(){return state.ready;},get busy(){return state.busy;},save:saveCampaign,
      ...(ffa?{resumeFfa}:{resumeCampaign}),
      report:()=>({...state,mode,docSession,slotId:payload?.metadata.id||'',persistenceStarted:persistStarted,persistenceCompleted:persistCompleted})};
  }
})();
