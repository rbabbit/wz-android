/* Display only: original PIE meshes and accepted construction sites. */
(() => {
  'use strict';
  if(window.WarzoneBuildDisplay)return;
  const state={models:{},sites:[],preview:null,heights:new Map(),drawn:[],frames:0,paintMs:0,maxPaintMs:0,error:'',dirty:true,key:'',owned:false};
  const canvas=document.createElement('canvas');canvas.id='wt-build-models';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:'2147483599',pointerEvents:'none'});
  document.body.appendChild(canvas);const ctx=canvas.getContext('2d');
  fetch('/warzone/build-ghost-models.json').then(r=>{if(!r.ok)throw Error('Building meshes unavailable');return r.json()}).then(d=>{state.models=d.models;state.dirty=true}).catch(e=>state.error=String(e));
  function centre(item,x,y){return [(x+(item.width%2?.5:0))*128,(y+(item.breadth%2?.5:0))*128]}
  function project(view,x,y,z){const m=view.matrix,w=m[3]*x+m[7]*z-m[11]*y+m[15];if(w<=0)return null;return {x:view.left+((m[0]*x+m[4]*z-m[8]*y+m[12])/w+1)*view.width/2,y:view.top+(1-(m[1]*x+m[5]*z-m[9]*y+m[13])/w)*view.height/2,w}}
  function paintSite(view,site,preview){
    const item=site.item,model=state.models[item.id],[x,y]=centre(item,site.x,site.y),hkey=x+','+y;
    let h=state.heights.get(hkey);if(h==null){h=window.WarzoneTerrain.heightAt(x,y);if(h==null)return;state.heights.set(hkey,h)}
    const at=project(view,x,y,h);if(!at||at.x< -250||at.x>view.width+250||at.y< -300||at.y>view.height+300)return;
    const colour=site.rejected?'#f48d7d':preview?'#c6ed78':'#72e6c0';
    const left=site.x-Math.floor(item.width/2),top=site.y-Math.floor(item.breadth/2);
    const foot=[[left,top],[left+item.width,top],[left+item.width,top+item.breadth],[left,top+item.breadth]].map(([a,b])=>project(view,a*128,b*128,h+1));
    if(foot.every(Boolean)){ctx.beginPath();foot.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.globalAlpha=preview?.15:.07;ctx.fillStyle=colour;ctx.fill();ctx.globalAlpha=preview?.95:.65;ctx.strokeStyle=colour;ctx.lineWidth=preview?1.4:1;ctx.stroke()}
    const showModel=preview||!site.structureId&&!['building','waiting-power','waiting-trucks'].includes(site.status);
    let topY=at.y,triangles=0;
    if(model&&showModel){
      const pts=[];for(let i=0;i<model.p.length;i+=3)pts.push(project(view,x+model.p[i],y-model.p[i+2],h+model.p[i+1]));
      topY=Math.min(...pts.filter(Boolean).map(p=>p.y));
      const faces=[];for(let i=0;i<model.f.length;i+=3){const f=model.f.slice(i,i+3).map(j=>pts[j]);if(f.every(Boolean))faces.push(f)}
      faces.sort((a,b)=>(b[0].w+b[1].w+b[2].w)-(a[0].w+a[1].w+a[2].w));
      ctx.fillStyle=colour;ctx.globalAlpha=preview?.17:.09;
      for(const f of faces){ctx.beginPath();ctx.moveTo(f[0].x,f[0].y);ctx.lineTo(f[1].x,f[1].y);ctx.lineTo(f[2].x,f[2].y);ctx.closePath();ctx.fill();triangles++}
      ctx.globalAlpha=preview?.95:.72;ctx.strokeStyle=colour;ctx.lineWidth=preview?1.1:.8;ctx.beginPath();
      for(let i=0;i<model.e.length;i+=2){const a=pts[model.e[i]],b=pts[model.e[i+1]];if(a&&b){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y)}}ctx.stroke();
    }
    if(!preview){const text='#'+site.number;ctx.font='600 11px system-ui,sans-serif';const width=ctx.measureText(text).width+10,bx=at.x-width/2,by=topY-19;ctx.globalAlpha=.9;ctx.fillStyle='#061b21';ctx.fillRect(bx,by,width,17);ctx.strokeStyle=colour;ctx.lineWidth=1;ctx.strokeRect(bx,by,width,17);ctx.globalAlpha=1;ctx.fillStyle=colour;ctx.fillText(text,bx+5,by+12)}
    state.drawn.push({id:site.id||'preview',number:site.number,itemId:item.id,x:site.x,y:site.y,height:h,screenX:at.x,screenY:at.y,model:showModel&&!!model,triangles});
  }
  function frame(){
    requestAnimationFrame(frame);
    const terrain=window.WarzoneTerrain,needed=!!state.preview||state.sites.length>0;
    if(needed&&terrain&&!terrain.report().active){terrain.active(true);state.owned=true}
    if(!needed&&state.owned&&!window.__warzoneCommands?.nativeBuildOpen?.()){terrain?.active(false);state.owned=false}
    const view=needed&&terrain?.view(),parentDoc=window.parent?.document;
    const hidden=document.hidden||window.__warzoneCommands?.isOpen?.()||parentDoc?.body.dataset.research==='true'||parentDoc?.getElementById('warzone-towers-help-overlay')?.hidden===false;
    const key=(!hidden&&view?Array.from(view.matrix).join(',')+':'+view.width+','+view.height:'hidden')+':'+innerWidth+','+innerHeight;
    if(!state.dirty&&key===state.key)return;state.key=key;state.dirty=false;
    const started=performance.now(),ratio=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(innerWidth*ratio)||canvas.height!==Math.round(innerHeight*ratio)){canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio)}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,innerWidth,innerHeight);state.drawn=[];
    if(!view||hidden)return;
    // Keep native minimap pixels and navigation unobstructed.
    const s=window.__warzoneCommands?.report().snapshot,mw=s?.mapWidth||64,mh=s?.mapHeight||64,span=Math.max(mw,mh),side=192;
    const rw=side*mw/span,rh=side*mh/span,rx=view.left+view.width-120-rw/2,ry=view.top+view.height-120-rh/2;
    ctx.save();ctx.beginPath();ctx.rect(view.left,view.top,view.width,view.height);ctx.rect(rx,ry,rw,rh);ctx.clip('evenodd');
    try{for(const site of state.sites)paintSite(view,site,false);if(state.preview)paintSite(view,state.preview,true);state.frames++}catch(e){state.error=String(e.message||e)}finally{ctx.restore();ctx.globalAlpha=1;state.paintMs=performance.now()-started;state.maxPaintMs=Math.max(state.maxPaintMs,state.paintMs)}
  }
  window.WarzoneBuildDisplay={
    update(rows,catalog){const byId=new Map((catalog?.buildings||[]).map(b=>[b.id,b]));state.sites=rows.filter(r=>!['done','interrupted','cancelled'].includes(r.status)&&byId.has(r.itemId)).map(r=>({...r,item:byId.get(r.itemId)}));state.dirty=true},
    preview(item,point){state.preview={item,x:point.x,y:point.y};state.dirty=true},
    clearPreview(){if(state.preview){state.preview=null;state.dirty=true}},
    reject(item,x,y){if(state.preview?.item.id===item&&state.preview.x===x&&state.preview.y===y){state.preview.rejected=true;state.dirty=true}},
    reset(){state.heights.clear();state.sites=[];state.preview=null;state.dirty=true},
    report(){return {models:Object.keys(state.models).length,acceptedSites:state.sites.map(s=>({id:s.id,number:s.number,itemId:s.item.id,x:s.x,y:s.y,status:s.status})),drawn:state.drawn,preview:state.preview?.item.id||'',frames:state.frames,paintMs:state.paintMs,maxPaintMs:state.maxPaintMs,error:state.error}}
  };
  window.addEventListener('warzone-command-reply',event=>{
    const r=event.detail,p=state.preview;
    if(r?.action==='queue-build'&&r.ok&&p&&r.result?.itemId===p.item.id&&r.result.x===p.x&&r.result.y===p.y)window.WarzoneBuildDisplay.clearPreview();
  });
  window.dispatchEvent(new Event('warzone-build-display-ready'));
  requestAnimationFrame(frame);
})();
