/* Display only: original PIE meshes and accepted construction sites. */
(() => {
  'use strict';
  if(window.WarzoneBuildDisplay)return;
  const state={models:{},sites:[],preview:null,heights:new Map(),terrainRevision:null,drawn:[],frames:0,paintMs:0,maxPaintMs:0,error:'',dirty:true,key:'',owned:false,
    catalog:new Map(),activeModule:null,moduleTargets:[],parents:new Map(),geometry:new Map(),moduleDrawn:[],targetSignature:'',
    facilityTargets:[],facilityBlockers:[]};
  const canvas=document.createElement('canvas');canvas.id='wt-build-models';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100%',height:'100%',zIndex:'2147483599',pointerEvents:'none'});
  document.body.appendChild(canvas);const ctx=canvas.getContext('2d');
  fetch('/warzone/build-ghost-models.json').then(r=>{if(!r.ok)throw Error('Building meshes unavailable');return r.json()}).then(d=>{state.models=d.models;state.dirty=true}).catch(e=>state.error=String(e));
  function centre(item,x,y){return [(x+(item.width%2?.5:0))*128,(y+(item.breadth%2?.5:0))*128]}
  function project(view,x,y,z){const m=view.matrix,w=m[3]*x+m[7]*z-m[11]*y+m[15];if(w<=0)return null;return {x:view.left+((m[0]*x+m[4]*z-m[8]*y+m[12])/w+1)*view.width/2,y:view.top+(1-(m[1]*x+m[5]*z-m[9]*y+m[13])/w)*view.height/2,w}}
  function syncTerrain(){
    const revision=window.WarzoneTerrain?.report().revision;
    if(Number.isFinite(revision)&&revision!==state.terrainRevision){state.terrainRevision=revision;state.heights.clear();state.geometry.clear();state.dirty=true;}
  }
  function ground(x,y,fallback){
    syncTerrain();
    const key=x+','+y;let h=state.heights.get(key);
    if(h==null){h=window.WarzoneTerrain?.heightAt(x,y);if(Number.isFinite(h))state.heights.set(key,h);}
    return Number.isFinite(h)?h:Number.isFinite(fallback)?fallback:null;
  }
  function siteHeight(site,item,model,x,y){
    const existing=Boolean(site.structureId)||['building','waiting-power','waiting-trucks'].includes(site.status);
    // The native queued blueprint rests on the highest footprint grid vertex.
    // Once a foundation exists, base buildings have already flattened the mesh;
    // defensive structures instead follow the four corners of their real model.
    if(existing&&!['DEFENSE','WALL','CORNER WALL','GATE','REARM PAD'].includes(item.kind))return ground(x,y);
    const key=(existing?'model:':'foot:')+item.id+':'+x+','+y;
    if(state.heights.has(key))return state.heights.get(key);
    let points;
    if(existing&&model){
      const bounds=model.structureBounds;if(!bounds)return ground(x,y);
      // alignStructure samples the structure mesh's native +PIE-z corners,
      // excluding separate base/weapon meshes and their asymmetric overhangs.
      const left=bounds.min[0],right=bounds.max[0],top=bounds.min[2],bottom=bounds.max[2];
      points=[[left,top],[left,bottom],[right,top],[right,bottom]].map(([a,b])=>[x+a,y+b]);
    }else{
      const left=site.x-Math.floor(item.width/2),top=site.y-Math.floor(item.breadth/2);points=[];
      for(let b=0;b<=item.breadth;b++)for(let a=0;a<=item.width;a++)points.push([(left+a)*128,(top+b)*128]);
    }
    const heights=points.map(([a,b])=>ground(a,b));
    if(heights.some(h=>!Number.isFinite(h)))return ground(x,y);
    const h=Math.max(...heights);state.heights.set(key,h);return h;
  }
  function viewKey(view){return Array.from(view.matrix).join(',')+':'+view.left+','+view.top+','+view.width+','+view.height;}
  function hidden(){const d=window.parent?.document;return document.hidden||window.__towersHtml?.isEnded?.()||window.__warzoneCommands?.isOpen?.()||d?.body.dataset.research==='true'||d?.getElementById('warzone-towers-help-overlay')?.hidden===false;}
  function blockedRects(view){
    const s=window.__warzoneCommands?.report().snapshot,mw=s?.mapWidth||64,mh=s?.mapHeight||64,span=Math.max(mw,mh),side=192;
    const rw=side*mw/span,rh=side*mh/span,result=[{x:view.left+view.width-120-rw/2,y:view.top+view.height-120-rh/2,width:rw,height:rh},
      {x:view.left,y:view.top+view.height-20,width:view.width,height:20}];
    const d=window.parent?.document,sidebar=d?.getElementById('wt-build-sidebar'),frame=d?.getElementById('warzone-game-frame');
    if(sidebar&&!sidebar.hidden){const r=sidebar.getBoundingClientRect(),f=frame?.getBoundingClientRect()||{left:0,top:0};if(r.width&&r.height)result.push({x:r.left-f.left,y:r.top-f.top,width:r.width,height:r.height});}
    return result;
  }
  const within=(r,x,y)=>x>=r.x&&y>=r.y&&x<=r.x+r.width&&y<=r.y+r.height;
  function unmaskedPoint(view,masks,x,y){
    if(x<view.left||y<view.top||x>=view.left+view.width||y>=view.top+view.height||masks.some(r=>within(r,x,y)))return false;
    return true;
  }
  function fieldPoint(view,masks,x,y){
    if(!unmaskedPoint(view,masks,x,y))return false;
    return !window.__kalaWarzoneTouch?.isBattlefieldPoint||window.__kalaWarzoneTouch.isBattlefieldPoint(x,y);
  }
  function intersects(a,b){return a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;}
  function hull(points){
    const values=Array.from(new Map(points.filter(Boolean).map(p=>[p.x.toFixed(3)+','+p.y.toFixed(3),p])).values()).sort((a,b)=>a.x-b.x||a.y-b.y);
    if(values.length<3)return values;
    const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),lower=[],upper=[];
    for(const p of values){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
    for(const p of values.slice().reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
    return lower.slice(0,-1).concat(upper.slice(0,-1));
  }
  function targetGeometry(view,target){
    const [x,y]=centre(target,target.x,target.y),h=ground(x,y,Number.isFinite(target.z)?target.z*128:undefined);
    if(h==null)return null;
    // Module resources contain the official upgraded parent mesh. Use it only
    // for hit geometry when it is already present, never as a floating clone.
    const modelId=target.modules>0&&state.models[target.moduleId]?target.moduleId:target.itemId,model=state.models[modelId];
    const key=viewKey(view)+':'+modelId+':'+(model?.p.length||0)+':'+x+','+y+','+h+','+target.width+','+target.breadth,cached=state.geometry.get(target.id);
    if(cached?.key===key)return cached;
    const left=target.x-Math.floor(target.width/2),top=target.y-Math.floor(target.breadth/2);
    const foot=[[left,top],[left+target.width,top],[left+target.width,top+target.breadth],[left,top+target.breadth]].map(([a,b])=>project(view,a*128,b*128,h+1));
    const vertices=model?Array.from({length:model.p.length/3},(_,i)=>project(view,x+model.p[i*3],y-model.p[i*3+2],h+model.p[i*3+1])):[];
    const faces=[];if(model)for(let i=0;i<model.f.length;i+=3){const p=model.f.slice(i,i+3).map(j=>vertices[j]);if(p.every(Boolean))faces.push({points:p,index:i/3});}
    const outline=hull(vertices.concat(foot)),at=project(view,x,y,h);if(!outline.length||!at)return null;
    const bounds={left:Math.min(...outline.map(p=>p.x)),top:Math.min(...outline.map(p=>p.y)),right:Math.max(...outline.map(p=>p.x)),bottom:Math.max(...outline.map(p=>p.y))};
    const geometry={key,id:target.id,modelId,foot:foot.every(Boolean)?foot:[],faces,outline,at,bounds,height:h};
    state.geometry.set(target.id,geometry);return geometry;
  }
  function targetLabel(target){
    const maximum=Number(target.maximum)||1,used=Math.min(maximum,Number(target.modules||0)+Number(target.reserved||0));
    if(target.eligible)return ['queued','upgrading'].includes(target.status)?`QUEUE ${Math.min(maximum,used+1)}/${maximum}`:`UPGRADE ${target.modules||0}/${maximum}`;
    if(target.status==='upgrading')return `UPGRADING ${used}/${maximum}`;
    if(target.status==='queued')return `QUEUED ${used}/${maximum}`;
    if(target.status==='full'||target.statusReason==='module-limit')return `FULL ${used}/${maximum}`;
    return target.status==='unfinished'?'BUILD FIRST':'UNAVAILABLE';
  }
  function labelRect(view,masks,geometry,label){
    ctx.font='600 11px system-ui,sans-serif';const width=Math.ceil(ctx.measureText(label).width)+12,height=18,b=geometry.bounds;
    const candidates=[{x:geometry.at.x-width/2,y:b.top-height-5},{x:b.right+5,y:b.top+2},{x:geometry.at.x-width/2,y:b.bottom+5}];
    for(const candidate of candidates){const r={x:Math.max(view.left+4,Math.min(view.left+view.width-width-4,candidate.x)),y:Math.max(view.top+4,Math.min(view.top+view.height-height-4,candidate.y)),width,height};if(!masks.some(mask=>intersects(r,mask)))return r;}
    return null;
  }
  function targetEntries(view,masks){
    return state.moduleTargets.map(target=>{
      const g=targetGeometry(view,target),visible=!!g&&g.bounds.right>=view.left&&g.bounds.left<=view.left+view.width&&g.bounds.bottom>=view.top&&g.bounds.top<=view.top+view.height
        &&(g.outline.some(p=>unmaskedPoint(view,masks,p.x,p.y))||g.faces.some(f=>unmaskedPoint(view,masks,(f.points[0].x+f.points[1].x+f.points[2].x)/3,(f.points[0].y+f.points[1].y+f.points[2].y)/3)));
      const label=targetLabel(target),box=visible?labelRect(view,masks,g,label):null;
      return {target,geometry:g,visible,label,labelRect:box};
    });
  }
  function outline(points){if(!points.length)return;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();}
  function paintModuleTarget(entry,now){
    if(!entry.visible)return;const t=entry.target,g=entry.geometry,selected=state.preview?.parentId===t.id;
    const rejected=selected&&state.preview?.rejected,colour=rejected?'#f48d7d':t.eligible?(selected?'#c6ed78':'#72e6c0'):['queued','upgrading'].includes(t.status)?'#d9b36a':'#91a5ac';
    ctx.strokeStyle=colour;ctx.lineWidth=selected?1.8:1.1;ctx.globalAlpha=selected&&t.eligible ? .72+.22*Math.sin(now/180) : .72;outline(g.outline);ctx.globalAlpha=.9;outline(g.foot);
    const box=entry.labelRect;if(box){ctx.globalAlpha=.94;ctx.fillStyle='#071b22';ctx.fillRect(box.x,box.y,box.width,box.height);ctx.strokeStyle=colour;ctx.lineWidth=1;ctx.strokeRect(box.x,box.y,box.width,box.height);ctx.globalAlpha=1;ctx.font='600 11px system-ui,sans-serif';ctx.fillStyle=colour;ctx.fillText(entry.label,box.x+6,box.y+12);}
    state.moduleDrawn.push({id:t.id,itemId:t.itemId,moduleId:t.moduleId,status:t.status,eligible:t.eligible,selected,colour,label:entry.label,labelRect:box,bounds:g.bounds});
  }
  function triangleHit(points,x,y,slop=6){
    const [a,b,c]=points,divisor=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);
    if(Math.abs(divisor)<1e-7)return null;
    const u=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/divisor,v=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/divisor,k=1-u-v;
    if(u>=0&&v>=0&&k>=0)return {distance:0,depth:1/(u/a.w+v/b.w+k/c.w)};
    let nearest=null;for(const [p,q]of [[a,b],[b,c],[c,a]]){const dx=q.x-p.x,dy=q.y-p.y,n=dx*dx+dy*dy;if(!n)continue;const t=Math.max(0,Math.min(1,((x-p.x)*dx+(y-p.y)*dy)/n)),distance=Math.hypot(x-p.x-t*dx,y-p.y-t*dy);if(distance<=slop&&(!nearest||distance<nearest.distance))nearest={distance,depth:1/((1-t)/p.w+t/q.w)};}return nearest;
  }
  function hitEntry(entry,x,y){
    const g=entry.geometry;if(!entry.visible||!g||x<g.bounds.left-6||x>g.bounds.right+6||y<g.bounds.top-24||y>g.bounds.bottom+6){if(!entry.labelRect||!within(entry.labelRect,x,y))return null;}
    let best=null;for(const face of g.faces){const h=triangleHit(face.points,x,y);if(h&&(!best||(h.distance===0&&best.distance>0)||((h.distance===0)===(best.distance===0)&&h.depth<best.depth)))best={...h,source:'mesh'};}
    if(!best&&g.foot.length===4)for(const p of [[g.foot[0],g.foot[1],g.foot[2]],[g.foot[0],g.foot[2],g.foot[3]]]){const h=triangleHit(p,x,y);if(h&&(!best||h.depth<best.depth))best={...h,source:'footprint'};}
    if(!best&&entry.labelRect&&within(entry.labelRect,x,y))best={distance:0,depth:g.at.w,source:'label'};
    return best;
  }
  function pickModuleTarget(x,y){
    const view=window.WarzoneTerrain?.view();if(!view||hidden()||!state.activeModule)return null;const masks=blockedRects(view);if(!fieldPoint(view,masks,x,y))return null;
    const hits=targetEntries(view,masks).map(entry=>({entry,hit:hitEntry(entry,x,y)})).filter(v=>v.hit);
    hits.sort((a,b)=>(a.hit.distance>0)-(b.hit.distance>0)||a.hit.depth-b.hit.depth||a.hit.distance-b.hit.distance);
    const found=hits[0];if(!found)return null;
    // Reject a parent hidden behind the terrain itself. This is a local mesh
    // pick at touch time, never an engine/native query in the draw loop.
    const terrain=window.WarzoneTerrain,groundHit=terrain.pick?.(x,y),surface=groundHit&&project(view,groundHit.worldX,groundHit.worldY,groundHit.height);
    if(surface&&surface.w+1e-4<found.hit.depth&&found.hit.source!=='label')return null;
    return {...found.entry.target,hit:found.hit};
  }
  function facilitiesEnabled(){return window.__warzoneDuelConfig?.mode!=='duel'&&document.body.classList?.contains?.('wt-towers-polished')===true;}
  function facilityMasks(view){
    const masks=blockedRects(view),d=window.parent?.document,frame=d?.getElementById('warzone-game-frame')?.getBoundingClientRect()||{left:0,top:0};
    for(const id of ['wt-status-panel','wt-field-centre','wt-field-toggle','lab-ops','wt-native-back']){
      const e=d?.getElementById(id);if(!e||e.hidden||e.closest?.('[inert]'))continue;
      const css=window.parent?.getComputedStyle?.(e),b=e.getBoundingClientRect();
      if(css&&(css.display==='none'||css.visibility==='hidden'||css.pointerEvents==='none')||!b.width||!b.height)continue;
      masks.push({x:b.left-frame.left,y:b.top-frame.top,width:b.width,height:b.height});
    }
    return masks;
  }
  function facilityPoint(view,masks,x,y){
    if(!fieldPoint(view,masks,x,y))return false;
    // Host overlays live outside the engine document. Respect actual hit
    // testing as well as the measured radar/panel masks above.
    const d=window.parent?.document,frame=d?.getElementById('warzone-game-frame')?.getBoundingClientRect();
    if(frame&&typeof d.elementFromPoint==='function'){
      const hit=d.elementFromPoint(x+frame.left,y+frame.top);
      if(!hit||!hit.closest?.('#warzone-game-frame'))return false;
    }
    return true;
  }
  function facilityDroidHit(view,x,y){
    // Native mouseTarget prioritises every visible droid before structures.
    // Script positions are whole tiles, so cover the complete possible body
    // volume, not a guessed sub-tile centre. This deliberately favours unit
    // interaction in an ambiguous overlap. Blockers are native visible-only.
    for(const d of state.facilityBlockers){
      const size=Math.max(0,Math.min(3,Number(d.bodySize)||0)),pad=64+size*32,points=[];
      for(const wx of [d.x*128-pad,(d.x+1)*128+pad])for(const wy of [d.y*128-pad,(d.y+1)*128+pad])for(const wz of [d.z*128-32,(d.z+1)*128+96+size*48]){
        const p=project(view,wx,wy,wz);if(p)points.push(p);
      }
      if(points.length!==8)continue;
      if(x>=Math.min(...points.map(p=>p.x))-4&&x<=Math.max(...points.map(p=>p.x))+4
        &&y>=Math.min(...points.map(p=>p.y))-4&&y<=Math.max(...points.map(p=>p.y))+4)return true;
    }
    return false;
  }
  function facilityEntries(view,masks){
    return state.facilityTargets.map(target=>{
      const g=targetGeometry(view,target),visible=!!g&&g.bounds.right>=view.left&&g.bounds.left<=view.left+view.width&&g.bounds.bottom>=view.top&&g.bounds.top<=view.top+view.height
        &&(g.outline.some(p=>unmaskedPoint(view,masks,p.x,p.y))||g.faces.some(f=>unmaskedPoint(view,masks,(f.points[0].x+f.points[1].x+f.points[2].x)/3,(f.points[0].y+f.points[1].y+f.points[2].y)/3)));
      return {target,geometry:g,visible,labelRect:null};
    });
  }
  function facilityTerrainOccluded(view,hit,x,y){
    const terrain=window.WarzoneTerrain,groundHit=terrain?.pick?.(x,y),surface=groundHit&&project(view,groundHit.worldX,groundHit.worldY,groundHit.height);
    return !!surface&&surface.w+1e-4<hit.depth;
  }
  function pickFacilityTarget(x,y){
    const view=window.WarzoneTerrain?.view();if(!facilitiesEnabled()||!view||hidden()||!state.facilityTargets.length)return null;
    const masks=facilityMasks(view);if(!facilityPoint(view,masks,x,y)||facilityDroidHit(view,x,y))return null;
    const hits=facilityEntries(view,masks).map(entry=>({entry,hit:hitEntry(entry,x,y)})).filter(v=>v.hit);
    hits.sort((a,b)=>(a.hit.distance>0)-(b.hit.distance>0)||a.hit.depth-b.hit.depth||a.hit.distance-b.hit.distance);
    const found=hits[0];if(!found||facilityTerrainOccluded(view,found.hit,x,y))return null;
    return {...found.entry.target,hit:found.hit};
  }
  function facilityReport(withGeometry){
    if(!withGeometry)return state.facilityTargets.map(t=>({...t}));
    const view=window.WarzoneTerrain?.view();if(!facilitiesEnabled()||!view||hidden())return state.facilityTargets.map(t=>({...t,visible:false,hitPoints:[]}));
    const masks=facilityMasks(view);
    return facilityEntries(view,masks).map(({target,geometry:g,visible})=>({...target,visible,bounds:g?.bounds||null,footprint:g?.foot||[],outline:g?.outline||[],
      hitPoints:visible?hitPoints(view,masks,g).filter(p=>facilityPoint(view,masks,p.x,p.y)&&!facilityDroidHit(view,p.x,p.y)&&!facilityTerrainOccluded(view,{depth:p.depth},p.x,p.y)):[]}));
  }
  function hitPoints(view,masks,g){
    const points=g.faces.map(face=>{const p=face.points;return {x:(p[0].x+p[1].x+p[2].x)/3,y:(p[0].y+p[1].y+p[2].y)/3,depth:3/(1/p[0].w+1/p[1].w+1/p[2].w),source:'mesh',face:face.index,area:Math.abs((p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[2].x-p[0].x)*(p[1].y-p[0].y))};}).filter(p=>p.area>4&&fieldPoint(view,masks,p.x,p.y)).sort((a,b)=>b.area-a.area||a.depth-b.depth),result=[];
    for(const p of points){if(result.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>=8)){const {area,...point}=p;result.push(point);if(result.length>=10)break;}}
    return result;
  }
  function paintSite(view,site,preview){
    const item=site.item,model=state.models[item.id],moduleWork=item.category==='MODULES';
    const parent=moduleWork?state.parents.get(site.parentId):null,parentGeometry=parent?targetGeometry(view,parent):null,footprint=parent||item;
    const [x,y]=centre(footprint,site.x,site.y),h=parentGeometry?.height??siteHeight(site,footprint,model,x,y);if(h==null)return;
    const at=project(view,x,y,h);if(!at||at.x< -250||at.x>view.width+250||at.y< -300||at.y>view.height+300)return;
    const validation=site.rejected?'invalid':site.validation||'pending',colour=validation==='invalid'?'#f48d7d':preview?(validation==='valid'?'#c6ed78':'#bac7cc'):moduleWork?'#d9b36a':'#72e6c0';
    const left=site.x-Math.floor(footprint.width/2),top=site.y-Math.floor(footprint.breadth/2);
    const foot=parentGeometry?.foot||[[left,top],[left+footprint.width,top],[left+footprint.width,top+footprint.breadth],[left,top+footprint.breadth]].map(([a,b])=>project(view,a*128,b*128,h+1));
    if(foot.every(Boolean)){ctx.beginPath();foot.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.globalAlpha=preview?.15:.07;ctx.fillStyle=colour;ctx.fill();ctx.globalAlpha=preview?.95:.65;ctx.strokeStyle=colour;ctx.lineWidth=preview?1.4:1;ctx.stroke()}
    const showModel=!moduleWork&&(preview||!site.structureId&&!['building','waiting-power','waiting-trucks'].includes(site.status));
    let topY=parentGeometry?.bounds?.top??at.y,triangles=0;
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
    if(!preview&&!(moduleWork&&state.moduleTargets.some(t=>t.id===site.parentId))){const text='#'+site.number;ctx.font='600 11px system-ui,sans-serif';const width=ctx.measureText(text).width+10,bx=at.x-width/2,by=topY-19;ctx.globalAlpha=.9;ctx.fillStyle='#061b21';ctx.fillRect(bx,by,width,17);ctx.strokeStyle=colour;ctx.lineWidth=1;ctx.strokeRect(bx,by,width,17);ctx.globalAlpha=1;ctx.fillStyle=colour;ctx.fillText(text,bx+5,by+12)}
    state.drawn.push({id:site.id||'preview',number:site.number,itemId:item.id,parentId:site.parentId||0,x:site.x,y:site.y,height:h,screenX:at.x,screenY:at.y,colour,validation:preview?validation:'accepted',model:showModel&&!!model,triangles});
  }
  function frame(){
    requestAnimationFrame(frame);
    syncTerrain();
    const terrain=window.WarzoneTerrain,needed=!!state.preview||state.sites.length>0||state.moduleTargets.length>0;
    // Facilities retain only the lightweight current-camera observation. They
    // are never painted or projected in this frame loop; picking is on demand.
    const observing=needed||(state.facilityTargets.length>0&&facilitiesEnabled()&&!hidden());
    if(observing&&terrain&&!terrain.report().active){terrain.active(true);state.owned=true}
    if(!observing&&state.owned&&!window.__warzoneCommands?.nativeBuildOpen?.()){terrain?.active(false);state.owned=false}
    const view=needed&&terrain?.view(),concealed=hidden(),now=performance.now(),pulse=state.preview?.parentId&&state.parents.get(state.preview.parentId)?.eligible&&!state.preview.rejected?Math.floor(now/80):0;
    const masks=view&&!concealed?blockedRects(view):[];
    const key=(!concealed&&view?viewKey(view):'hidden')+':'+innerWidth+','+innerHeight+':'+JSON.stringify(masks)+':'+pulse;
    if(!state.dirty&&key===state.key)return;state.key=key;state.dirty=false;
    const started=performance.now(),ratio=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(innerWidth*ratio)||canvas.height!==Math.round(innerHeight*ratio)){canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio)}
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,innerWidth,innerHeight);state.drawn=[];state.moduleDrawn=[];
    if(!view||concealed)return;
    // Keep native minimap pixels and navigation unobstructed.
    ctx.save();ctx.beginPath();ctx.rect(view.left,view.top,view.width,view.height);ctx.clip();
    for(const mask of masks){ctx.beginPath();ctx.rect(view.left,view.top,view.width,view.height);ctx.rect(mask.x,mask.y,mask.width,mask.height);ctx.clip('evenodd');}
    try{for(const site of state.sites)paintSite(view,site,false);for(const entry of targetEntries(view,masks))paintModuleTarget(entry,now);if(state.preview&&state.preview.item.category!=='MODULES')paintSite(view,state.preview,true);state.frames++}catch(e){state.error=String(e.message||e)}finally{ctx.restore();ctx.globalAlpha=1;state.paintMs=performance.now()-started;state.maxPaintMs=Math.max(state.maxPaintMs,state.paintMs)}
  }
  window.WarzoneBuildDisplay={
    update(rows,catalog){const byId=new Map((catalog?.buildings||[]).map(b=>[b.id,b]));state.sites=rows.filter(r=>!['done','interrupted','cancelled'].includes(r.status)&&byId.has(r.itemId)).map(r=>({...r,item:byId.get(r.itemId)}));state.dirty=true},
    setModuleTargets(targets,catalog,activeModuleItem){
      for(const item of catalog?.buildings||[])state.catalog.set(item.id,item);
      const active=typeof activeModuleItem==='string'?state.catalog.get(activeModuleItem):activeModuleItem;
      state.activeModule=active?.category==='MODULES'?active:null;
      const rows=(targets||[]).filter(t=>Number.isFinite(t.id)&&Number.isFinite(t.x)&&Number.isFinite(t.y)).map(t=>{const item=state.catalog.get(t.itemId);return {...t,width:Number(t.width||item?.width||1),breadth:Number(t.breadth||item?.breadth||1),eligible:t.eligible===true};});
      rows.forEach(t=>state.parents.set(t.id,t));
      const matching=state.activeModule?rows.filter(t=>t.moduleId===state.activeModule.id):[],signature=JSON.stringify([state.activeModule?.id||'',matching]);
      if(signature!==state.targetSignature){state.moduleTargets=matching;state.targetSignature=signature;state.dirty=true;}
      if(!state.activeModule){state.moduleDrawn=[];if(state.preview?.item.category==='MODULES'){state.preview=null;state.dirty=true;}}
    },
    pickModuleTarget,
    setFacilityTargets(targets,blockers,catalog){
      if(!facilitiesEnabled()){state.facilityTargets=[];state.facilityBlockers=[];return;}
      for(const item of catalog?.buildings||[])state.catalog.set(item.id,item);
      state.facilityTargets=(targets||[]).filter(t=>Number.isFinite(t.id)&&t.id>0&&Number.isFinite(t.x)&&Number.isFinite(t.y)&&Number.isFinite(t.z)
        &&t.ready===true&&t.nativeStatus===1&&['research','factory','cyborg','vtol'].includes(t.kind)&&state.catalog.has(t.itemId)).map(t=>{
          const item=state.catalog.get(t.itemId);return {...t,width:Number(t.width||item.width||1),breadth:Number(t.breadth||item.breadth||1),modules:Number(t.modules)||0};
        });
      state.facilityBlockers=(blockers||[]).filter(d=>Number.isFinite(d.id)&&[d.x,d.y,d.z].every(Number.isFinite)).map(d=>({...d}));
    },
    pickFacilityTarget,
    preview(item,point){
      if(item.category==='MODULES'){
        const parentId=Number(point.parentId||point.target?.id),target=state.parents.get(parentId)||point.target;
        if(!target||target.moduleId!==item.id){window.WarzoneBuildDisplay.clearPreview();return false;}
        state.preview={item,x:target.x,y:target.y,parentId:target.id,rejected:!target.eligible};
      }else state.preview={item,x:point.x,y:point.y,validation:['valid','invalid'].includes(point.validation)?point.validation:'pending'};state.dirty=true;return true;
    },
    clearPreview(){if(state.preview){state.preview=null;state.dirty=true}},
    reject(item,x,y,parentId){if(state.preview?.item.id===item&&(parentId?state.preview.parentId===parentId:state.preview.x===x&&state.preview.y===y)){state.preview.rejected=true;state.preview.validation='invalid';state.dirty=true}},
    reset(){state.heights.clear();state.terrainRevision=null;state.sites=[];state.preview=null;state.moduleTargets=[];state.activeModule=null;state.parents.clear();state.geometry.clear();state.moduleDrawn=[];state.drawn=[];state.targetSignature='';state.facilityTargets=[];state.facilityBlockers=[];ctx.clearRect(0,0,innerWidth,innerHeight);state.dirty=true},
    report(options={}){const view=window.WarzoneTerrain?.view(),masks=view?blockedRects(view):[],entries=view&&!hidden()?targetEntries(view,masks):state.moduleTargets.map(target=>({target,geometry:null,visible:false,label:targetLabel(target),labelRect:null}));return {models:Object.keys(state.models).length,acceptedSites:state.sites.map(s=>({id:s.id,number:s.number,itemId:s.item.id,parentId:s.parentId||0,x:s.x,y:s.y,status:s.status})),drawn:state.drawn,preview:state.preview?.item.id||'',previewParentId:state.preview?.parentId||0,previewPoint:state.preview?{x:state.preview.x,y:state.preview.y,parentId:state.preview.parentId||0}:null,moduleItem:state.activeModule?.id||'',
      moduleTargets:entries.map(({target,geometry:g,visible,label,labelRect:box})=>({...target,label,visible,bounds:g?.bounds||null,footprint:g?.foot||[],outline:g?.outline||[],labelRect:box,hitPoints:visible?hitPoints(view,masks,g):[]})),moduleDrawn:state.moduleDrawn,
      facilityTargets:facilityReport(options.facilityGeometry===true),facilityBlockerCount:state.facilityBlockers.length,
      frames:state.frames,terrainRevision:state.terrainRevision,previewValidation:state.preview?state.preview.rejected?'invalid':state.preview.validation||'pending':'',paintMs:state.paintMs,maxPaintMs:state.maxPaintMs,error:state.error}}
  };
  window.addEventListener('warzone-command-reply',event=>{
    if(window.__towersHtml?.isEnded?.())return;
    const r=event.detail,p=state.preview;
    if(r?.action==='queue-build'&&r.ok&&p&&r.result?.itemId===p.item.id&&(p.parentId?r.result.parentId===p.parentId:r.result.x===p.x&&r.result.y===p.y))window.WarzoneBuildDisplay.clearPreview();
  });
  window.addEventListener('warzone-battle-ended',()=>window.WarzoneBuildDisplay.reset());
  window.dispatchEvent(new Event('warzone-build-display-ready'));
  requestAnimationFrame(frame);
})();
