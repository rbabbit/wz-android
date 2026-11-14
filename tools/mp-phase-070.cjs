const q=require('./mp-live-070.cjs');(async()=>{const c=await q.connect();console.log(await c.evaluate('PcMultiplayerSession.phase'));c.close();})();
