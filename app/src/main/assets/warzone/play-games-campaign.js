/* Observe the original campaign victory callback; never decide a mission result. */
(() => {
  'use strict';
  const query=new URLSearchParams(location.search),session=query.get('battle_session')||'';
  const runId=query.get('bnProgressRunId')||window.__warzoneProgressRunId||session;
  const delivered=new Set();
  function consume(text) {
    if (session && String(text).trim() === 'BNPGSCAMPAIGN-LOSS') {
      (window.BlockNightAndroid || parent.BlockNightAndroid)?.battleFinished?.(session);
      return;
    }
    const marker='BNPGSCAMPAIGN:',start=String(text).indexOf(marker);
    if(start<0||!session)return;
    try {
      const packet=JSON.parse(String(text).slice(start+marker.length));
      if(packet.mode!=='campaign'||packet.runId!==runId||packet.nativeCompleted!==true||packet.won!==true
          ||!['mission_completed','campaign_completed'].includes(packet.kind)
          ||typeof packet.eventId!=='string'||delivered.has(packet.eventId))return;
      const bridge=window.BlockNightAndroid||parent.BlockNightAndroid;
      if(typeof bridge?.playGamesEvent!=='function')return;
      bridge.playGamesEvent(session,JSON.stringify(packet));delivered.add(packet.eventId);
    } catch(_) { /* Optional progress must never interrupt a mission. */ }
  }
  const observer=`
// Saved native globals retain mission identity and deduplication across restores.
var campmobile_pgsRunId = "";
var campmobile_pgsCompleted = false;
function campmobile_statsDifficulty() {
    if (typeof difficulty !== "undefined") {
        if (typeof EASY !== "undefined" && difficulty === EASY) return "easy";
        if (typeof MEDIUM !== "undefined" && difficulty === MEDIUM) return "medium";
        if (typeof HARD !== "undefined" && difficulty === HARD) return "hard";
        if (typeof INSANE !== "undefined" && difficulty === INSANE) return "insane";
    }
    return "unknown";
}
function campmobile_progressWon() {
    if (campmobile_pgsCompleted || selectedPlayer !== CAM_HUMAN_PLAYER) return;
    if (!campmobile_pgsRunId) {
        try { campmobile_pgsRunId = includeJSON("mobile/play-games-progress.json").runId || ""; } catch (_) {}
    }
    if (!campmobile_pgsRunId) return;
    var native = typeof campaignMobileState === "function" ? campaignMobileState() : {};
    var level = String(native.nativeLevel || campmobile_level || "");
    if (!level) return;
    campmobile_pgsCompleted = true;
    var nativeDifficulty = campmobile_statsDifficulty(), knownDifficulty = nativeDifficulty !== "unknown";
    var event = {kind:"mission_completed",mode:"campaign",runId:campmobile_pgsRunId,
        eventId:campmobile_pgsRunId+":mission:"+level,map:level,
        difficulty:knownDifficulty?nativeDifficulty:"normal",classification:knownDifficulty?"native-v1":"campaign-difficulty-unclassified",
        elapsedMs:Math.max(0,gameTime),gameTime:gameTime,
        won:true,nativeCompleted:true,verifiedResult:true,serverVerified:false,spectator:false};
    dump("BNPGSCAMPAIGN:"+JSON.stringify(event));
    if (typeof __camNextLevel !== "undefined" && __camNextLevel === CAM_GAMMA_OUT) {
        event.kind = "campaign_completed";
        event.eventId = campmobile_pgsRunId+":campaign:completed";
        dump("BNPGSCAMPAIGN:"+JSON.stringify(event));
    }
}
`;
  function prepare(module) {
    if(module.playGamesCampaignPrepared||!module.FS?.readFile||module.calledRun)return;
    try {
      const fs=module.FS,base='/data/base/script/campaign/';
      const victoryPath=base+'libcampaign_includes/victory.js',bridgePath=base+'mobile/campaign-bridge.js';
      let victory=fs.readFile(victoryPath,{encoding:'utf8'});
      const nativeBridge=fs.readFile(bridgePath,{encoding:'utf8'});
      const anchor=/function __camGameWon\(\)\r?\n\{\r?\n\t__camLevelEnded = true;/;
      if(!anchor.test(victory)||!runId||runId.length>160) return;
      victory=victory.replace(anchor,match=>match+'\n\t// Observe the actual native win before its original mission transition.\n\tif (typeof campmobile_progressWon === "function") { try { campmobile_progressWon(); } catch (_) {} }');
      victory=victory.replace(/(function __camGameLostCB\(\)\s*\{)(\s*gameOverMessage\(false, false\);)/,
        '$1\n\ttry { dump("BNPGSCAMPAIGN-LOSS"); } catch (_) {}$2');
      fs.writeFile(base+'mobile/play-games-progress.json',JSON.stringify({runId}));
      fs.writeFile(bridgePath,nativeBridge.replace('missionType:getMissionType(), nativeLevel:',
        'missionType:getMissionType(), statsDifficulty:campmobile_statsDifficulty(), nativeLevel:')+'\n'+observer);
      fs.writeFile(victoryPath,victory);
      module.playGamesCampaignPrepared=true;
    } catch(_) { /* Older payloads keep their original campaign behaviour. */ }
  }
  window.WarzoneCampaignProgress={prepare,consume};
  window.addEventListener('blocknight-engine-output',event=>consume(event.detail?.text||''));
})();
