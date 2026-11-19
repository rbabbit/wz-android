/* Downloaded maps use the existing FFA engine and its ordinary native AI slots. */
(function () {
  'use strict';
  const bots = Object.freeze({
    cobra:{name:'Cobra',script:'multiplay/skirmish/Cobra.js'},
    nexus:{name:'Nexus',script:'multiplay/skirmish/nexus.js'},
    nullbot:{name:'NullBot',script:'multiplay/skirmish/nb_generic.js'},
    semperfi:{name:'SemperFi',script:'multiplay/skirmish/semperfi.js'},
    bonecrusher:{name:'BoneCrusher!',script:'multiplay/skirmish/bonecrusher/bonecrusher.js'},
    hover:{name:'Hover AI',script:'multiplay/skirmish/nb_hover.js'},
    turtle:{name:'Turtle AI',script:'multiplay/skirmish/nb_turtle.js'},
    dumbot25a:{name:'Dumbot25a',script:'multiplay/skirmish/maps-dumbot25a.js',bundled:true},
    ratbot:{name:'RatBot',script:'multiplay/skirmish/ratbot/personality_cannons.js',bundled:true},
    ratbot_mg:{name:'RatBot MG',script:'multiplay/skirmish/ratbot/personality_mg.js',bundled:true},
    squeedlerbot:{name:'Squeedlerbot',script:'multiplay/skirmish/ratbot/personality_squeedlers.js',bundled:true},
    wally:{name:'Wally',script:'multiplay/skirmish/wally.js',bundled:true}
  });
  let bundle = null;
  function load(catalogue) {
    const query = new URLSearchParams(location.search), id = query.get('bnFfaMap') || '';
    if (!id.startsWith('download-')) return null;
    if (!/^download-[a-f0-9]{64}$/.test(id)) throw Error('Invalid downloaded map identity.');
    try { if (parent !== window) bundle = parent.WarzoneDownloadedMaps?.bundle; } catch (_) { }
    if (!bundle) bundle = JSON.parse(window.BlockNightAndroid?.mapsLaunchPayload?.(query.get('battle_session') || '') || '{}');
    const map = bundle.map, bot = bots[query.get('bnFfaBotType')];
    if (!map || map.id !== id || map.sourceSHA256 !== id.slice(9)
        || map.level !== 'FFA-' + id.slice(9,21) + '-T1' || map.mapDirectory !== id
        || !Number.isInteger(map.players) || map.players < 2 || map.players > 10 || map.bots !== map.players - 1
        || !Number.isInteger(map.width) || !Number.isInteger(map.height) || map.width < 1 || map.width > 512 || map.height < 1 || map.height > 512
        || !bot || bundle.bot?.id !== query.get('bnFfaBotType') || bundle.bot?.script !== bot.script || bundle.bot?.name !== bot.name
        || bot.bundled && (!Array.isArray(bundle.botFiles) || !bundle.botFiles.length || bundle.botFiles.length > 256)
        || !Array.isArray(bundle.files) || !bundle.files.length || bundle.files.length > 1024
        || typeof bundle.lev !== 'string' || bundle.lev.length > 8192) throw Error('Downloaded map setup is unavailable. Reopen Maps and try again.');
    const gameType = bundle.gameType === undefined ? 'ffa' : bundle.gameType;
    if (gameType !== 'ffa' && gameType !== 'teams') throw Error('Invalid downloaded map game type.');
    const teams = gameType === 'teams' ? bundle.teams : Array.from({length:map.players}, (_, player) => player);
    if (!Array.isArray(teams) || teams.length !== map.players
        || teams.some(team => !Number.isInteger(team) || team < 0 || team >= map.players)
        || new Set(teams).size < 2) throw Error('Invalid downloaded map teams. Reopen Maps and try again.');
    bundle = Object.freeze({...bundle,gameType,teams:Object.freeze(teams.slice())});
    if (!catalogue.some(value => value.id === id)) catalogue.push(map);
    return bundle;
  }
  function nativeBot(type) {
    if (bundle && bots[type]) return bots[type];
    return type === 'cobra' ? {name:'Cobra',script:'multiplay/skirmish/Cobra.js'}
      : type === 'nullbot' ? {name:'NullBot (ground)',script:'multiplay/skirmish/ffa-nullbot.js'} : null;
  }
  function install(module, config) {
    if (!bundle) return;
    const fs = module.FS, map = bundle.map, bot = nativeBot(config.botType);
    if (module.calledRun || config.map !== map.id || !bot) throw Error('Downloaded map installation was too late.');
    if (config.gameType !== bundle.gameType || !Array.isArray(config.teams)
        || config.teams.length !== map.players || config.teams.some((team, player) => team !== bundle.teams[player])) {
      throw Error('Downloaded map teams changed during launch.');
    }
    if (bot.bundled) {
      const seen = new Set(); let botBytes = 0;
      for (const file of bundle.botFiles) {
        if (typeof file.path !== 'string' || !/^\/data\/mp\/multiplay\/skirmish\/[A-Za-z0-9_.\/-]+\.(js|json)$/.test(file.path)
            || file.path.length > 240 || file.path.split('/').some(part => part === '.' || part === '..') || seen.has(file.path)
            || typeof file.data !== 'string' || file.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw Error('Invalid bundled map bot file.');
        seen.add(file.path);
        const raw = atob(file.data); botBytes += raw.length;
        if (botBytes > 8 * 1024 * 1024) throw Error('Bundled map bots are too large.');
        fs.mkdirTree(file.path.slice(0, file.path.lastIndexOf('/')));
        fs.writeFile(file.path, Uint8Array.from(raw, character => character.charCodeAt(0)));
      }
      if (!seen.has('/data/mp/' + bot.script)) throw Error('The selected map bot is missing its script.');
    }
    const root = '/data/mp/multiplay/maps/' + map.id;
    let bytes = 0;
    for (const file of bundle.files) {
      if (typeof file.path !== 'string' || !(file.path === root + '.gam' || file.path.startsWith(root + '/'))
          || file.path.split('/').some(part => part === '.' || part === '..' || part.includes('\\'))
          || typeof file.data !== 'string' || file.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw Error('Invalid downloaded map file.');
      const raw = atob(file.data); bytes += raw.length;
      if (bytes > 64 * 1024 * 1024) throw Error('The downloaded map is too large.');
      fs.mkdirTree(file.path.slice(0,file.path.lastIndexOf('/')));
      fs.writeFile(file.path, Uint8Array.from(raw, character => character.charCodeAt(0)));
    }
    if (!fs.analyzePath(root + '.gam').exists) throw Error('The downloaded map has no game settings.');
    if (!window.WarzoneMapsStock) throw Error('The stock Maps rules are unavailable.');
    for (const [path,value] of Object.entries(window.WarzoneMapsStock)) fs.writeFile(path,JSON.stringify(value));
    // The Java installer constructs this descriptor from validated map metadata.
    const lev = '/data/mp/addon.lev';
    fs.writeFile(lev, fs.readFile(lev,{encoding:'utf8'}) + '\n' + bundle.lev + '\n');
    for (const folder of ['/data/mp/multiplay/script','/data/mp/multiplay/script/rules','/data/mp/multiplay/skirmish']) {
      const path = folder + '/ffa-maps.json', catalogue = JSON.parse(fs.readFile(path,{encoding:'utf8'}));
      catalogue.maps.push(map); fs.writeFile(path,JSON.stringify(catalogue));
    }
    const categories = Object.fromEntries(Object.entries(window.WarzoneMapsStock['/data/mp/stats/research.json'])
      .filter(([id]) => !id.startsWith('_')).map(([id,value]) => [id,value.category || '']));
    for (const folder of ['/data/mp/multiplay/script','/data/mp/multiplay/script/rules']) {
      const path = folder + '/ffa-policy.json', policy = JSON.parse(fs.readFile(path,{encoding:'utf8'}));
      Object.assign(policy,{vtol:true,airComponents:[],airStructures:[],blockedResearch:[],researchCategory:categories});
      fs.writeFile(path,JSON.stringify(policy));
    }
    const difficulty = {easy:'Easy',medium:'Medium',hard:'Hard'}[config.difficulty];
    if (!difficulty) throw Error('Invalid map difficulty.');
    // Upstream src/ai.h: NO_ALLIANCES=0, ALLIANCES_TEAMS=2. Locked native
    // teams share research/vision and use the stock team victory conditions.
    const teamGame = config.gameType === 'teams';
    const challenge = {challenge:{bases:3,description:teamGame ? 'Defeat the opposing teams with your allies.' : 'Independent opponents. Be the last commander standing.',difficulty,
      map:map.level,maxPlayers:map.players,name:map.name,alliances:teamGame?2:0,powerLevel:1,scavengers:map.scavengers?1:0,techLevel:1,version:2},
      locked:{ai:true,alliances:true,bases:true,difficulty:true,position:true,power:true,scavengers:true,teams:true},
      player_0:{name:'Commander',position:0,team:config.teams[0]}};
    for (let player = 1; player < map.players; player++) challenge['player_' + player] = {
      ai:bot.script,difficulty,name:bot.name + ' ' + player,position:player,team:config.teams[player]};
    fs.writeFile('/data/mp/tests/ffa-' + map.id + '-' + config.difficulty + '.json',JSON.stringify(challenge));
    // Existing native telemetry verifies the actual loaded AI script, not its label.
    const rulesPath = '/data/mp/tests/ffa-rules.js';
    let rules = fs.readFile(rulesPath,{encoding:'utf8'});
    const oldType = 'return file === "Cobra.js" ? "cobra" : file === "ffa-nullbot.js" ? "nullbot" : "unknown";';
    const oldAllowed = '["cobra","nullbot"].indexOf(player.botType)';
    const oldTelemetry = 'vtol:false, alliancesType:alliancesType';
    if (!rules.includes(oldType) || !rules.includes(oldAllowed) || !rules.includes(oldTelemetry)) throw Error('The native Maps adapter is incompatible.');
    const identities = Object.fromEntries(Object.entries(bots).map(([id,value]) => [value.script.split('/').pop(),id]));
    rules = rules.replace(oldType,'return (' + JSON.stringify(identities) + ')[file] || "unknown";')
      .replace(oldAllowed,JSON.stringify(Object.keys(bots)) + '.indexOf(player.botType)')
      .replace(oldTelemetry,
        'vtol:true, gameType:ffaConfig.gameType || "ffa", teams:players.map(function (player) { return player.team; }), alliancesType:alliancesType');
    fs.writeFile(rulesPath,rules);
    // The native skirmish entry loads init.js; the tests copy is also retained
    // for includes and native save contexts. Keep both exact adapters aligned.
    fs.writeFile('/data/mp/multiplay/script/rules/init.js',rules);
    const commandsPath = '/data/mp/tests/ffa-commands.js';
    let commands = fs.readFile(commandsPath,{encoding:'utf8'});
    const noAirFactory = 'ffaDesignAllowed(design) && factory.stattype !== VTOL_FACTORY && ffaOriginalFactoryAllows(design, factory)';
    if (!commands.includes(noAirFactory)) throw Error('The native Maps manufacturing adapter is incompatible.');
    commands = commands.replace(noAirFactory,'ffaDesignAllowed(design) && ffaOriginalFactoryAllows(design, factory)');
    fs.writeFile(commandsPath,commands);
    module.downloadedMapInstalled = map.id;
  }
  window.WarzoneDownloadedMaps = {load,install,nativeBot,bots,get bundle(){return bundle;}};
})();
