/* MP display-only terrain access from the matching native engine's explicit snapshot. */
(() => {
  'use strict';
  if (window.WarzoneTerrain) return;
  const state = {active:false,disposed:false,generation:0,grid:null,gridKey:'',gridSource:null,
    view:null,viewToken:'',matrixKey:'',inverse:null,revision:0,observations:0,observedAt:0,
    reads:0,picks:0,heightQueries:0,triangleTests:0,lastPickMs:0,maxPickMs:0,error:''};
  const EPS = 1e-8;
  const clock = () => performance.now();
  const native = () => window.PcMultiplayerNative;
  const source = () => native()?.state;
  const canvas = () => document.getElementById('canvas');
  const finite = value => typeof value === 'number' && Number.isFinite(value);

  function inverse(matrix) {
    const rows = Array.from({length:4},(_,r) => [matrix[r],matrix[4+r],matrix[8+r],matrix[12+r],
      Number(r===0),Number(r===1),Number(r===2),Number(r===3)]);
    for (let column=0;column<4;column++) {
      let pivot=column;
      for (let r=column+1;r<4;r++) if (Math.abs(rows[r][column])>Math.abs(rows[pivot][column])) pivot=r;
      if (Math.abs(rows[pivot][column])<1e-12) return null;
      [rows[column],rows[pivot]]=[rows[pivot],rows[column]];
      const divisor=rows[column][column];
      for (let c=0;c<8;c++) rows[column][c]/=divisor;
      for (let r=0;r<4;r++) if (r!==column) {
        const multiplier=rows[r][column];
        for (let c=0;c<8;c++) rows[r][c]-=multiplier*rows[column][c];
      }
    }
    return Float64Array.from({length:16},(_,i) => rows[i%4][4+Math.floor(i/4)]);
  }

  function sync() {
    if (state.disposed) {state.view=null;state.grid=null;state.error='The terrain view has closed.';return false;}
    const snapshot=source(), input=snapshot?.view, terrain=native()?.terrain || snapshot?.terrain;
    if (!snapshot || !input) { state.view=null; state.error='Native terrain view is not ready.'; return false; }
    const matrix=input.matrix || input.matrix16;
    if (!matrix || matrix.length!==16 || !Array.from(matrix).every(finite)
        || !finite(input.width) || !finite(input.height) || input.width<=0 || input.height<=0) {
      state.view=null; state.error='Native terrain projection is unavailable.'; return false;
    }
    const matrixKey=Array.from(matrix).join(',');
    if (matrixKey!==state.matrixKey) {
      state.inverse=inverse(matrix);
      state.matrixKey=matrixKey;
    }
    if (!state.inverse) { state.view=null; state.error='Native terrain projection is singular.'; return false; }
    const token=String(input.frame ?? input.revision ?? input.capturedAt ?? '')+':'+matrixKey;
    if (token!==state.viewToken) {
      state.viewToken=token; state.observations++; state.observedAt=clock();
    }
    const bounds=canvas()?.getBoundingClientRect();
    const width=bounds?.width ?? input.width, height=bounds?.height ?? input.height;
    if (!finite(width) || !finite(height) || width<=0 || height<=0) {
      state.view=null; state.error='The battlefield viewport is hidden.'; return false;
    }
    state.view={matrix:Float64Array.from(matrix),left:bounds?.left ?? input.left ?? 0,
      top:bounds?.top ?? input.top ?? 0,width,height,nativeWidth:input.width,nativeHeight:input.height,
      camera:input.camera,frame:input.frame};
    if (!terrain) { state.grid=null; state.error='Native terrain heights are not ready.'; return false; }
    const w=terrain.width,h=terrain.height,vw=terrain.vertexWidth ?? w+1,vh=terrain.vertexHeight ?? h+1;
    const tileSize=terrain.tileSize ?? 128;
    if (!Number.isInteger(w) || !Number.isInteger(h) || w<1 || h<1 || w>1024 || h>1024
        || vw!==w+1 || vh!==h+1 || !finite(tileSize) || tileSize<=0) {
      state.grid=null; state.error='Native terrain dimensions are invalid.'; return false;
    }
    const key=[w,h,vw,vh,tileSize,terrain.revision ?? 'unversioned'].join(':');
    if (!state.grid || key!==state.gridKey || (terrain.revision==null && terrain!==state.gridSource)) {
      let heights=terrain.heights;
      if (Array.isArray(heights?.[0])) heights=heights.flat();
      if (!heights || heights.length!==vw*vh || !Array.from(heights).every(finite)) {
        state.grid=null; state.error='Native terrain heights are incomplete.'; return false;
      }
      state.grid={width:w,height:h,vertexWidth:vw,vertexHeight:vh,tileSize,heights:Float64Array.from(heights)};
      state.gridKey=key; state.gridSource=terrain; state.revision++; state.reads++;
    }
    state.error=''; return true;
  }

  function corners(x,y) {
    const g=state.grid,k=y*g.vertexWidth+x,z=g.heights,s=g.tileSize;
    const a=z[k],b=z[k+1],c=z[k+g.vertexWidth+1],d=z[k+g.vertexWidth];
    // terrain.cpp getGridPos/averagePos uses a four-triangle fan with integer centre height.
    return [[x*s,y*s,a],[(x+1)*s,y*s,b],[(x+1)*s,(y+1)*s,c],[x*s,(y+1)*s,d],
      [(x+.5)*s,(y+.5)*s,Math.trunc((a+b+c+d)/4)]];
  }

  function heightAt(x,y) {
    state.heightQueries++;
    if (!finite(x) || !finite(y) || !sync()) return null;
    const g=state.grid,s=g.tileSize;
    if (x<0 || y<0 || x>g.width*s || y>g.height*s) return null;
    const tx=Math.min(g.width-1,Math.floor(x/s)),ty=Math.min(g.height-1,Math.floor(y/s));
    const u=x/s-tx,v=y/s-ty,p=corners(tx,ty),a=p[0][2],b=p[1][2],c=p[2][2],d=p[3][2],m=p[4][2];
    if (v<=u) return u+v<=1 ? a*(1-u-v)+b*(u-v)+m*2*v : b*(u-v)+c*(u+v-1)+m*2*(1-u);
    return u+v>=1 ? c*(u+v-1)+d*(v-u)+m*2*(1-v) : d*(v-u)+a*(1-u-v)+m*2*u;
  }

  function project(x,y,height=0) {
    if (![x,y,height].every(finite) || !sync()) return null;
    const v=state.view,m=v.matrix,w=m[3]*x+m[7]*height-m[11]*y+m[15];
    if (!finite(w) || w<=1e-10) return null;
    return {x:v.left+((m[0]*x+m[4]*height-m[8]*y+m[12])/w+1)*v.width/2,
      y:v.top+(1-(m[1]*x+m[5]*height-m[9]*y+m[13])/w)*v.height/2};
  }

  function unproject(x,y,z) {
    const m=state.inverse,w=m[3]*x+m[7]*y+m[11]*z+m[15];
    if (!finite(w) || Math.abs(w)<1e-12) return null;
    // Convert graphics (x, height, -mapY) to native map (x, mapY, height).
    return [(m[0]*x+m[4]*y+m[8]*z+m[12])/w,-(m[2]*x+m[6]*y+m[10]*z+m[14])/w,
      (m[1]*x+m[5]*y+m[9]*z+m[13])/w];
  }
  const cross=(a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const minus=(a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  function triangle(origin,direction,a,b,c) {
    state.triangleTests++;
    const ab=minus(b,a),ac=minus(c,a),p=cross(direction,ac),det=dot(ab,p);
    if (Math.abs(det)<1e-9) return null;
    const t=minus(origin,a),u=dot(t,p)/det;
    if (u<-EPS || u>1+EPS) return null;
    const q=cross(t,ab),v=dot(direction,q)/det;
    if (v<-EPS || u+v>1+EPS) return null;
    const distance=dot(ac,q)/det;
    return distance>=-EPS ? Math.max(0,distance) : null;
  }

  function pick(clientX,clientY) {
    const started=clock(); state.picks++;
    try {
      if (![clientX,clientY].every(finite) || !sync()) return null;
      const view=state.view,g=state.grid,x=(clientX-view.left)/view.width,y=(clientY-view.top)/view.height;
      if (x<0 || y<0 || x>=1 || y>=1) return null;
      const near=unproject(x*2-1,1-y*2,-1),far=unproject(x*2-1,1-y*2,1) || unproject(x*2-1,1-y*2,.999999);
      if (!near || !far) return null;
      const delta=minus(far,near),length=Math.hypot(...delta);
      if (!finite(length) || length<EPS) return null;
      const direction=delta.map(n=>n/length),limits=[g.width*g.tileSize,g.height*g.tileSize];
      let entry=0,exit=length;
      for (let axis=0;axis<2;axis++) {
        if (Math.abs(direction[axis])<1e-12) {
          if (near[axis]<0 || near[axis]>limits[axis]) return null;
        } else {
          const a=-near[axis]/direction[axis],b=(limits[axis]-near[axis])/direction[axis];
          entry=Math.max(entry,Math.min(a,b)); exit=Math.min(exit,Math.max(a,b));
        }
      }
      if (entry>exit+EPS || exit<0) return null;
      const s=g.tileSize,point=near.map((n,i)=>n+direction[i]*entry);
      let tx=Math.min(g.width-1,Math.max(0,Math.floor(point[0]/s))),ty=Math.min(g.height-1,Math.max(0,Math.floor(point[1]/s)));
      const stepX=Math.sign(direction[0]),stepY=Math.sign(direction[1]);
      let nextX=stepX ? ((tx+(stepX>0?1:0))*s-near[0])/direction[0] : Infinity;
      let nextY=stepY ? ((ty+(stepY>0?1:0))*s-near[1])/direction[1] : Infinity;
      const advanceX=stepX ? s/Math.abs(direction[0]) : Infinity,advanceY=stepY ? s/Math.abs(direction[1]) : Infinity;
      for (let traversed=0;traversed<g.width+g.height+4 && tx>=0 && ty>=0 && tx<g.width && ty<g.height;traversed++) {
        const end=Math.min(nextX,nextY,exit),vertices=corners(tx,ty);
        let hit=null;
        for (let side=0;side<4;side++) {
          const t=triangle(near,direction,vertices[4],vertices[side],vertices[(side+1)%4]);
          if (t!=null && t>=entry-1e-5 && t<=end+1e-5 && (hit==null || t<hit)) hit=t;
        }
        if (hit!=null) {
          const worldX=near[0]+direction[0]*hit,worldY=near[1]+direction[1]*hit,height=near[2]+direction[2]*hit;
          if (worldX< -EPS || worldY< -EPS || worldX>=limits[0] || worldY>=limits[1]) return null;
          return {x:Math.floor(Math.max(0,worldX)/s),y:Math.floor(Math.max(0,worldY)/s),worldX:Math.max(0,worldX),worldY:Math.max(0,worldY),height};
        }
        if (end>=exit-EPS) break;
        const crossX=nextX<=nextY+EPS,crossY=nextY<=nextX+EPS;
        entry=end;
        if (crossX) {tx+=stepX;nextX+=advanceX;}
        if (crossY) {ty+=stepY;nextY+=advanceY;}
      }
      return null;
    } finally {state.lastPickMs=clock()-started;state.maxPickMs=Math.max(state.maxPickMs,state.lastPickMs);}
  }

  window.WarzoneTerrain={
    active(value) {state.active=!state.disposed&&Boolean(value);if(!state.active)state.generation++;if(state.active)sync();},
    async refresh(timeout=1500) {
      if (!finite(timeout) || timeout<0) return false;
      this.active(true);const generation=state.generation,before=state.viewToken,started=clock();
      while (!state.disposed && state.active && generation===state.generation) {
        if (typeof native()?.refresh==='function') await native().refresh();
        if (sync() && state.viewToken!==before) return true;
        if (clock()-started>=timeout) return false;
        await new Promise(resolve=>setTimeout(resolve,16));
      }
      return false;
    },
    pick,heightAt,project,
    view() {sync();return state.view;},
    report() {const ready=sync();return {ready,active:state.active,revision:state.revision,
      observations:state.observations,observedAt:state.observedAt,reads:state.reads,picks:state.picks,
      heightQueries:state.heightQueries,triangleTests:state.triangleTests,lastPickMs:state.lastPickMs,
      maxPickMs:state.maxPickMs,error:state.error};}
  };
  window.addEventListener('pagehide',()=>{state.disposed=true;state.active=false;state.generation++;},{once:true});
})();
