/* Complete native saved games. The phone archive never rewrites world state. */
(() => {
  'use strict';
  if (window.WarzoneSavedGames || window.__warzoneDuelConfig?.mode === 'duel') return;
  const docSession = window.__towersHtml?.session || window.__towersHtmlSession || '';
  const MAX_BYTES = 32 * 1024 * 1024, MAX_FILES = 256;
  const state = {loading:false,ready:true,busy:false,ended:false,error:'',serial:0,savedId:'',hydrated:false};
  const persistence = {started:0,completed:new Set()};
  const bridge = () => window.BlockNightAndroid;
  const module = () => window.LaunchedModule?.FS ? window.LaunchedModule : window.Module;
  const wave = () => window.__warzoneTowersWaves?.report?.().snapshot;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const notice = message => bridge()?.showNotice?.(message);
  let payload = null, files = null;

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
      && value.wtreward_match?.session === logicalSession && value.warzoneTowersWaves_state);
  }
  function validatePayload(value) {
    if (!value?.metadata || !/^wt_[a-f0-9]{32}$/.test(value.metadata.id || '')) throw Error('The saved game slot is invalid.');
    const decoded = decodeFiles(value.files), gam = jsonBytes(decoded.get('gam.json'));
    const meta = value.metadata;
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
      if (bridge()?.savedGameRestored?.(docSession, payload.metadata.id, JSON.stringify(proof)) !== true)
        throw Error('The saved game could not be verified.');
      active(token); state.ready = true; return true;
    } catch (error) { state.error = error.message; throw error; }
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
    if (state.busy || state.ended) return false;
    if (window.WarzoneRewards?.busy === true) { notice('Wait until the current purchase finishes before saving.'); return false; }
    if (!state.ready || !window.__towersHtml?.isActive?.() || window.WarzoneRewards?.ready !== true) {
      notice('Wait until the battle is ready before saving.'); return false;
    }
    state.busy = true; state.error = '';
    const token = ++state.serial, deadline = Date.now() + 15000;
    try {
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
      if (window.__kalaWarzoneTouch?.nativePressKey?.('F7','F7',118) === false) throw Error('The native Save command is unavailable.');
      const saved = await until(() => {
        const errors = Array.isArray(window.errorLog) ? window.errorLog.slice(errorCursor).map(String).join('\n') : '';
        if (/Unable to save level name.*too long/i.test(errors)) throw Error('This map’s internal name is too long to save.');
        if (/\bwriteGameFile\b|\bsaveGame\b[^\n]*failed|QuickSave failed/i.test(errors)) throw Error('The game could not create this save.');
        const value = quickSave(fs, root);
        return value && (!previous || value.mtime !== previous.mtime) && value.gam.gameTime >= before.gameTime
          && persistence.started > syncSerial && persistence.completed.has(syncSerial + 1) ? value : false;
      }, deadline, token, 'The native game did not finish saving. Try again with the game running.');
      await until(() => Number(wave()?.gameTime) > saved.gam.gameTime, deadline, token, 'The native game did not resume after saving.');
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
      active(token);
      if (bridge()?.rewardInventorySnapshot?.(docSession,JSON.stringify(fresh.result)) !== true)
        throw Error('The saved purchase inventory could not be verified.');
      const result = JSON.parse(bridge()?.storeSavedGame?.(docSession,JSON.stringify(metadata),JSON.stringify(captured.values)) || '{}');
      if (result.ok !== true || !/^wt_[a-f0-9]{32}$/.test(result.id || '')) throw Error(result.error || 'The saved game could not be archived.');
      active(token); state.savedId = result.id; notice('Game saved. Open Saved Games from the main menu to continue.'); return true;
    } catch (error) { if (!state.ended) { state.error = error.message; notice(error.message); } return false; }
    finally { if (token === state.serial) { ++state.serial; state.busy = false; } }
  }
  window.addEventListener('warzone-battle-ended', () => { state.ended=true; state.ready=false; state.busy=false; ++state.serial; });
  window.WarzoneSavedGames = {get loading(){return state.loading;},get ready(){return state.ready;},get busy(){return state.busy;},save,resumeRewards,
    report:() => ({...state,docSession,logicalSession:payload?.metadata.session || '',slotId:payload?.metadata.id || '',
      persistenceStarted:persistence.started,persistenceCompleted:Array.from(persistence.completed)})};
})();
