'use strict';
// Disclosed one-request directory failure fixture. No TCP/game responses change.
const q=require('./device-086.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const c=await q.connect();try{
 assert.equal(await c.evaluate('PcMultiplayerSession.active'),false);
 await c.wait('!PcLobbyUi.snapshot().loading','idle public directory');
 const before=await c.evaluate('PcLobbyUi.snapshot()');
 await c.evaluate(`(()=>{const original=globalThis.fetch;globalThis.__qa086Fetch=original;globalThis.fetch=(url,...args)=>String(url).includes('wzlobby.wz2100.net/lobby/api/v1/games')?Promise.reject(Error('UnknownHostException: Unable to resolve host wzlobby.wz2100.net: No address associated with hostname')):original(url,...args)})()`);
 q.nativeTap('REFRESH');await c.wait('!PcLobbyUi.snapshot().loading&&PcLobbyUi.snapshot().error','directory failure');
 const failed=await c.evaluate('PcLobbyUi.snapshot()');const labels=q.nativeRows().map(r=>r.text).filter(Boolean);
 assert(failed.error.includes('DNS lookup failed'));assert(!failed.error.includes('UnknownHostException'));
 assert.equal(labels.filter(s=>s.includes('DNS lookup failed')).length,1);
 if(before.games.length)assert.equal(failed.games.length,before.games.length);
 q.screen('delivery-directory-dns-once');
 await c.evaluate('globalThis.fetch=globalThis.__qa086Fetch;delete globalThis.__qa086Fetch');
 q.nativeTap('REFRESH');await c.wait('!PcLobbyUi.snapshot().loading&&!PcLobbyUi.snapshot().error','real directory retry',25000);
 const after=await c.evaluate('PcLobbyUi.snapshot()');q.screen('delivery-directory-retry');
 fs.writeFileSync(path.join(q.out,'directory-error-runtime.json'),JSON.stringify({passed:true,actualAndroid:true,directoryFailureInjected:true,actualNetworkRetry:true,gameplayResponsesMocked:false,before,failed,after,labels},null,2));
 console.log(JSON.stringify({passed:true,oneError:true,cachedRooms:failed.games.length,retryRooms:after.games.length}));
}finally{await c.evaluate('if(globalThis.__qa086Fetch){globalThis.fetch=globalThis.__qa086Fetch;delete globalThis.__qa086Fetch}').catch(()=>{});c.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
