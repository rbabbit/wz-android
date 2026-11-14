/* Math checks for the explicit native snapshot terrain adapter; no device or native memory reads. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const code=fs.readFileSync('app/src/main/assets/multiplayer/terrain.js','utf8');
const bounds={left:13,top:27,width:800,height:600};
const native={state:null},events={};
const window={PcMultiplayerNative:native,addEventListener:(name,fn)=>events[name]=fn};
const document={getElementById:id=>id==='canvas'?{getBoundingClientRect:()=>bounds}:null};
vm.runInNewContext(code,{window,document,performance,setTimeout,Float64Array,console});
const api=window.WarzoneTerrain;
let checks=0;
const check=(value,label)=>{checks++;assert.ok(value,label);};
const close=(a,b,epsilon=1e-5,label='Values differ')=>check(Math.abs(a-b)<=epsilon,`${label}: ${a} vs ${b}`);
const minus=(a,b)=>a.map((n,i)=>n-b[i]),dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normal=a=>a.map(n=>n/Math.hypot(...a));
function multiply(a,b){return Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);let n=0;for(let k=0;k<4;k++)n+=a[k*4+r]*b[c*4+k];return n;});}
function matrix(eye,target,up=[0,1,0]) {
  const z=normal(minus(eye,target)),x=normal(cross(up,z)),y=cross(z,x);
  const view=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];
  const f=1/Math.tan(Math.PI/6),aspect=bounds.width/bounds.height,near=1,far=20000;
  const projection=[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
  return multiply(projection,view);
}
function fixture(width,height,heights,matrixValue) {
  native.state={view:{matrix:matrixValue,width:1600,height:1200,left:0,top:0,frame:1}};
  native.terrain={width,height,tileSize:128,vertexWidth:width+1,vertexHeight:height+1,heights,revision:1};
}
const topDown=matrix([256,800,-256],[256,0,-256],[0,0,-1]);
fixture(4,4,Array(25).fill(0),topDown);
check(api.report().ready,'Valid native state is not ready');
for(const point of [[64,64],[256,256],[448,400]]) {
  const projected=api.project(...point,0),hit=api.pick(projected.x,projected.y);
  check(hit,'Flat terrain missed');close(hit.worldX,point[0]);close(hit.worldY,point[1]);close(hit.height,0);
}
check(api.pick(bounds.left-1,bounds.top+10)===null,'Outside viewport accepted');
check(api.heightAt(-1,0)===null,'Negative map coordinate accepted');
check(api.heightAt(513,0)===null,'Outside map coordinate accepted');
close(api.project(256,256,0).x,bounds.left+400,1e-6,'Framebuffer dimensions confused with CSS width');
close(api.project(256,256,0).y,bounds.top+300,1e-6,'Canvas offsets lost');
for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2,Math.PI/5]) {
  native.state.view.matrix=matrix([256+Math.sin(yaw)*900,650,-256+Math.cos(yaw)*900],[256,0,-256]);
  native.state.view.frame++;
  for(const p of [[80,80],[256,256],[430,400]]) {
    const pixel=api.project(...p,0),hit=api.pick(pixel.x,pixel.y);
    check(hit,'Rotated perspective missed');close(hit.worldX,p[0]);close(hit.worldY,p[1]);close(hit.height,0);
  }
}
fixture(1,1,[0,100,300,200],matrix([64,500,-64],[64,0,-64],[0,0,-1]));
for(const [x,y,height]of [[32,16,50],[112,96,175],[16,112,262.5],[16,64,150]]) {
  close(api.heightAt(x,y),height,1e-6,'Wrong four-triangle fan height');
  const p=api.project(x,y,height),hit=api.pick(p.x,p.y);
  check(hit,'Fan surface missed');close(hit.worldX,x);close(hit.worldY,y);close(hit.height,height);
}
native.terrain.heights=[0,0,0,3];native.terrain.revision++;
close(api.heightAt(64,64),0,1e-8,'Native integer centre averaging lost');
const previous=api.report(),h=api.heightAt(96,96);
check(api.report().reads===previous.reads,'Unchanged terrain copied again');
native.terrain.heights=[4,4,4,4];native.terrain.revision++;
close(api.heightAt(96,96),4);check(api.report().revision>previous.revision,'Flattening revision not propagated');

// Independent reference: project every fan triangle, then perspective-correct
// screen-space barycentric interpolation and nearest inverse-depth selection.
function reference(clientX,clientY,snapshot) {
  const g=snapshot.terrain,m=snapshot.view.matrix,s=g.tileSize,heights=g.heights;
  const project=([x,y,z])=>{
    const w=m[3]*x+m[7]*z-m[11]*y+m[15];if(w<=0)return null;
    return [bounds.left+((m[0]*x+m[4]*z-m[8]*y+m[12])/w+1)*bounds.width/2,
      bounds.top+(1-(m[1]*x+m[5]*z-m[9]*y+m[13])/w)*bounds.height/2,1/w];
  };
  let best=null,depth=0;
  for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){
    const k=y*g.vertexWidth+x,a=heights[k],b=heights[k+1],c=heights[k+g.vertexWidth+1],d=heights[k+g.vertexWidth];
    const vertices=[[x*s,y*s,a],[(x+1)*s,y*s,b],[(x+1)*s,(y+1)*s,c],[x*s,(y+1)*s,d],[(x+.5)*s,(y+.5)*s,Math.trunc((a+b+c+d)/4)]];
    for(let side=0;side<4;side++){
      const world=[vertices[4],vertices[side],vertices[(side+1)%4]],p=world.map(project);if(p.some(v=>!v))continue;
      const [a,b,c]=p,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-10)continue;
      const u=((b[1]-c[1])*(clientX-c[0])+(c[0]-b[0])*(clientY-c[1]))/den;
      const v=((c[1]-a[1])*(clientX-c[0])+(a[0]-c[0])*(clientY-c[1]))/den,t=1-u-v;
      if(Math.min(u,v,t)<-1e-8)continue;
      const inverseDepth=u*a[2]+v*b[2]+t*c[2];if(inverseDepth<=depth)continue;
      const weights=[u,v,t];best=[0,1,2].map(i=>world.reduce((sum,w,j)=>sum+w[i]*weights[j]*p[j][2],0)/inverseDepth);depth=inverseDepth;
    }
  }
  return best;
}
const w=8,hg=6,heights=Array.from({length:(w+1)*(hg+1)},(_,i)=>Math.round(60+50*Math.sin(i*1.37)));
fixture(w,hg,heights,matrix([1450,600,500],[512,30,-384]));
for(const yaw of [0,1.1,2.6]) {
  native.state.view.matrix=matrix([512+Math.sin(yaw)*1300,700,-384+Math.cos(yaw)*1300],[512,30,-384]);native.state.view.frame++;
  for(let y=60;y<600;y+=60)for(let x=60;x<800;x+=60){
    const px=x+bounds.left,py=y+bounds.top,expected=reference(px,py,{...native.state,terrain:native.terrain}),actual=api.pick(px,py);
    check(Boolean(actual)===Boolean(expected),'DDA/reference hit disagreement');
    if(expected){close(actual.worldX,expected[0],.001);close(actual.worldY,expected[1],.001);close(actual.height,expected[2],.001);}
  }
}
const valid=native.state.view.matrix;
native.state.view.matrix=Array(16).fill(0);check(api.pick(400,300)===null,'Singular projection accepted');
native.state.view.matrix=valid;
const oldTerrain=native.terrain;native.terrain={...oldTerrain,heights:[NaN],revision:999};
check(api.pick(400,300)===null,'Incomplete/nonfinite heights accepted');native.terrain=oldTerrain;
(async()=>{
  native.refresh=()=>native.state.view.frame++;
  check(await api.refresh(50),'Fresh native frame was not observed');
  native.refresh=()=>{};check(!await api.refresh(0),'Stale native frame accepted');
  const pending=api.refresh(200);setTimeout(()=>api.active(false),0);check(!await pending,'Deactivated refresh was not cancelled');
  events.pagehide();check(!await api.refresh(0),'Disposed terrain refreshed');
  console.log(`Multiplayer terrain: ${checks} checks passed (independent projected-mesh reference included)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
