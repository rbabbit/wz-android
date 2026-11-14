const q=require('./mp-live-070.cjs');
(async()=>{const c=await q.connect();try{
const p=await c.evaluate(`(()=>{const r=[...document.querySelectorAll('.room')].find(e=>/1 vs A[lI] Bots Battle/i.test(e.textContent));const b=r.querySelector('button').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()`);
await c.touch(p.x,p.y);await c.wait('PcMultiplayerSession.phase==="room"','room',25000);await c.save('small-first-room');const first=await c.evaluate('PcMultiplayerSession.report().sockets[0].id');q.adb('shell','input','tap','975','205');
await c.wait(`PcMultiplayerSession.phase==='room'&&PcMultiplayerSession.report().sockets.some(s=>s.id!==${first})`,'transferred room',20000);
await c.wait(`PcMultiplayerSession.events.some(e=>/File has been received|MAP DOWNLOADED/.test(e.detail||''))`,'map download',6000).catch(()=>{});
await c.save('small-match-room');const player=await c.child('PcMultiplayerNative.state.player');q.adb('shell','input','tap','992',String(110+46*player));
await c.wait('PcMultiplayerSession.phase==="game"','world',25000);await c.save('small-world');console.log('Small joined '+player);
}finally{c.close();}})().catch(e=>{console.error(e);process.exitCode=1});
