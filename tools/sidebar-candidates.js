(async()=>{
 WarzoneTerrain.active(true);
 const frame=parent.document.getElementById('warzone-game-frame').getBoundingClientRect();
 const tests=[];
 for(let x=7;x<=15;x++)for(let y=33;y<=44;y++){
  const wx=x*128+1,wy=y*128+1;let z=0,p,valid=false;
  for(let i=0;i<24;i++){p=WarzoneTerrain.project(wx,wy,z);const pick=p&&WarzoneTerrain.pick(p.x,p.y);if(!pick)break;if(Math.hypot(pick.worldX-wx,pick.worldY-wy)<2){valid=true;break;}z=(z+pick.height)/2;}
  if(!valid||p.y>innerHeight-150||p.y<30||parent.document.elementFromPoint(p.x+frame.x,p.y+frame.y)?.id!=='warzone-game-frame')continue;
  tests.push({x,y,screen:p});
 }
 const checked=await Promise.all(tests.map(async p=>{const r=await __warzoneCommands.send('preview-build',{itemId:'A0ResearchFacility',x:p.x,y:p.y});return{...p,ok:r.ok,reason:r.reason,workers:r.result?.workers};}));
 return {available:checked.filter(r=>r.ok).slice(0,8),reasons:checked.reduce((r,p)=>{r[p.reason||'ok']=(r[p.reason||'ok']||0)+1;return r;},{})};
})()
