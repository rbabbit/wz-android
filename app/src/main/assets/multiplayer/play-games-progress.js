/* Read the engine's terminal game-history report; no synchronized rules are changed. */
(() => {
  'use strict';
  const session=new URLSearchParams(location.search).get('battle_session')||'',bootedAt=Date.now();
  const delivered=new Set();let context=null,wasWorld=false;
  function logs(module) {
    const dir=(module.WZVAL_configDirPath||window.wz_js_get_config_dir_path?.()||'/warzone2100-online')+'/logs';
    try { return module.FS.readdir(dir).filter(name=>/^gamelog_[0-9]+\.log$/.test(name))
      .map(name=>({path:dir+'/'+name,start:Number(name.slice(8,-4))})).filter(value=>value.start>=bootedAt-5000).sort((a,b)=>b.start-a.start); }
    catch(_) { return []; }
  }
  function state(value,module) {
    if(!module?.FS)return;
    if(value?.worldReady===true&&!wasWorld) {
      const id=value.realPlayer;
      context={id,allowed:value.spectator===false&&value.canIssueOrders===true&&id===value.player
        &&Number.isInteger(id)&&id>=0&&id<10,log:null};
    }
    wasWorld=value?.worldReady===true;
    if(context&&!context.log)context.log=logs(module)[0]?.path||null;
    poll(module);
  }
  function poll(module) {
    if(!session||!context?.allowed||!context.log||!module?.FS||delivered.has(context.log))return;
    try {
      const size=module.FS.stat(context.log).size;
      if(size<1||size>2*1024*1024)return;
      const text=module.FS.readFile(context.log,{encoding:'utf8'});
      const start=text.lastIndexOf('__REPORTextended__'),end=text.indexOf('__ENDREPORTextended__',start);
      if(start<0||end<0)return;
      const report=JSON.parse(text.slice(start+'__REPORTextended__'.length,end)),game=report.game;
      const me=Array.isArray(report.playerData)?report.playerData.find(player=>player?.index===context.id):null;
      if(!game||!me||!['winner','loser'].includes(me.usertype)||game.cheated===true||game.timeout===true
          ||!Number.isSafeInteger(game.startDate)||game.startDate<bootedAt-5000
          ||!Number.isSafeInteger(game.timeGameEnd)||game.timeGameEnd<=0||report.gameTime!==game.timeGameEnd
          ||!Number.isSafeInteger(report.endDate)||report.endDate<game.startDate
          ||!Number.isInteger(game.maxPlayers)||game.maxPlayers<2||game.maxPlayers>10
          ||typeof game.mapName!=='string'||!game.mapName||game.mapName.length>160)return;
      const runId='mp-'+session+'-'+game.startDate;
      const packet={eventId:runId+':finished',runId,kind:'match_finished',mode:'multiplayer',
        map:game.mapName,difficulty:'online',won:me.usertype==='winner',spectator:false,
        verifiedResult:true,nativeCompleted:true,serverVerified:false,elapsedMs:game.timeGameEnd,
        players:game.maxPlayers,source:'native-gameover-report',localPlayer:context.id,
        mapHash:typeof game.mapHash==='string'?game.mapHash:'',classification:'online_unverified'};
      const bridge=window.AndroidMultiplayer||parent.AndroidMultiplayer;
      if(typeof bridge?.playGamesEvent!=='function')return;
      bridge.playGamesEvent(session,JSON.stringify(packet));delivered.add(context.log);
    } catch(_) { /* No terminal proof means no award. Local/network play continues. */ }
  }
  window.WarzoneMultiplayerProgress={state,poll};
})();
