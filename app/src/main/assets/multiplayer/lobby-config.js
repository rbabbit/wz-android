/* Configure the native join flow and stock controls for the MP-only engine. */
(() => {
  'use strict';
  const address = 'https://wzlobby.wz2100.net/lobby';
  // Stock 4.7 input.h: LMB=1, MMB=2, RMB=3. Panning is disabled by
  // default. Keep contextual left-click orders and reserve MMB for our swipe.
  // Older configs ignore mouseKeyRotate and upgrade MiddleClickRotate instead.
  const settings = Object.freeze({lobbyserver:address, RightClickOrders:'0',
    mouseKeyPan:'2', mouseKeyRotate:'3', MiddleClickRotate:'0', groupmenu:'0', optionsButtonVisibility:'0',music_enabled:'0'});
  const videoNotification = 'campaignVideoNotification';
  function playerBaseName(value) {
    let base=String(value??'').trim();
    while (/\(m\)$/iu.test(base)) base=base.slice(0,-3).trim();
    return base;
  }
  function validatePlayerName(value) {
    const raw=String(value??''),base=playerBaseName(raw),points=Array.from(base);
    if(!base||points.length>12||/[\u0000-\u001f\u007f-\u009f\p{Cf}\p{Zl}\p{Zp}]/u.test(raw)||/\p{Zs}/u.test(raw.replace(/ /gu,''))
      ||/[\ud800-\udfff]/u.test(base)||/[^A-Za-z0-9 +_\[\]-]/u.test(base.replace(/[^\x00-\x7f]/gu,''))||base.includes('  '))
      throw new Error('Use a valid player name up to 12 characters.');
    return base+'(m)';
  }
  function storedPlayerName(text) {
    let section='';
    for(const line of String(text||'').split(/\r?\n/u)){
      const heading=line.match(/^\s*\[([^\]]+)\]\s*$/u);if(heading){section=heading[1].trim().toLowerCase();continue;}
      const setting=section==='general'&&line.match(/^\s*playerName\s*=(.*)$/iu);
      if(setting){try{return validatePlayerName(Array.from(playerBaseName(setting[1])).slice(0,12).join('').trim());}catch{return 'Player(m)';}}
    }
    return 'Player(m)';
  }
  function update(text, playerName) {
    const applied = {...settings,playerName:playerName===undefined?storedPlayerName(text):validatePlayerName(playerName)};
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const keys = new Map(Object.keys(applied).map(key => [key.toLowerCase(), key]));
    const found = new Set(), result = [];
    let section = '', general = -1, end = -1;
    for (const line of lines) {
      const heading = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (heading) {
        if (section === 'general' && end < 0) end = result.length;
        section = heading[1].trim().toLowerCase();
        if (section === 'general' && general < 0) general = result.length;
      }
      const setting = section === 'general' && line.match(/^\s*([^=;#]+?)\s*=/);
      const key = setting && keys.get(setting[1].trim().toLowerCase());
      if (key) {
        // Remove duplicate settings so no stale last-wins value can undo them.
        if (!found.has(key)) result.push(key + '=' + applied[key]);
        found.add(key);
      } else {
        result.push(line);
      }
    }
    const missing = Object.keys(applied).filter(key => !found.has(key))
      .map(key => key + '=' + applied[key]);
    if (general < 0) result.push('[General]', ...missing);
    else result.splice(end < 0 ? result.length : end, 0, ...missing);
    return result.join('\n').replace(/\n*$/, '\n');
  }
  function updateNotifications(text) {
    const prefs = text.trim() ? JSON.parse(text) : {};
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
      throw new Error('Invalid multiplayer notification preferences.');
    }
    if (!prefs.notifications || typeof prefs.notifications !== 'object' || Array.isArray(prefs.notifications)) {
      prefs.notifications = {};
    }
    const existing = prefs.notifications[videoNotification];
    prefs.notifications[videoNotification] = {
      ...(existing && typeof existing === 'object' && !Array.isArray(existing) ? existing : {}), skip:true
    };
    // notifications.cpp consumes this exact preference; other notices stay on.
    return JSON.stringify(prefs, null, 2) + '\n';
  }
  function readOptional(fs, path) {
    try { return fs.readFile(path, {encoding:'utf8'}); } catch (error) {
      if (fs.analyzePath(path).exists) throw error;
      return '';
    }
  }
  function apply(fs, dir, playerName) {
    fs.writeFile(dir + '/config', update(readOptional(fs, dir + '/config'),playerName));
    fs.writeFile(dir + '/notifications.json', updateNotifications(readOptional(fs, dir + '/notifications.json')));
  }
  globalThis.PcLobbyConfig = Object.freeze({address, update, updateNotifications, apply, validatePlayerName, playerBaseName});
})();
