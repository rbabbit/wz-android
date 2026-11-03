/* Read the original terrain geometry/projection. No engine or artwork changes. */
(() => {
  'use strict';
  if (window.WarzoneTerrain) return;
  const state={active:false,gl:null,meta:new WeakMap(),bound:new Map(),current:null,
    vertexBuffer:null,indexBuffer:null,vertices:null,indices:null,matrix:null,dirty:true,
    projected:null,projectionKey:'',reads:0,picks:0,lastPickMs:0,maxPickMs:0,error:''};
  const canvas=()=>document.getElementById('canvas');
  function install(gl){
    if(!gl?.getBufferSubData||gl.__wtTerrainObserved)return;
    gl.__wtTerrainObserved=true;state.gl=gl;state.dirty=true;
    const use=gl.useProgram,bind=gl.bindBuffer,upload=gl.bufferData,update=gl.bufferSubData,draw=gl.drawElements;
    gl.useProgram=function(program){
      const result=use.apply(this,arguments);state.current=null;
      if(program){
        let meta=state.meta.get(program);
        if(!meta&&gl.getProgramParameter(program,gl.LINK_STATUS)){
          const names=Array.from({length:gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS)},(_,i)=>gl.getActiveUniform(program,i).name);
          // The depth fragment shader consumes uv2 only. GPU linkers may
          // remove paramx1/uv1; paramx2 and lightmap_tex remain active.
          const terrain=names.includes('ModelViewProjectionMatrix')&&(names.includes('groundScale')||names.includes('paramx1')||(names.includes('paramx2')&&names.includes('lightmap_tex')));
          meta={terrain,program,needed:true};
          if(terrain){meta.mvp=gl.getUniformLocation(program,'ModelViewProjectionMatrix');meta.vertex=gl.getAttribLocation(program,'vertex');}
          state.meta.set(program,meta);
        }
        if(meta){meta.needed=true;state.current=meta;}
      }
      return result;
    };
    gl.bindBuffer=function(target,buffer){const result=bind.apply(this,arguments);state.bound.set(target,buffer);return result;};
    function invalidate(target){if(state.bound.get(target)===state.vertexBuffer||state.bound.get(target)===state.indexBuffer)state.dirty=true;}
    gl.bufferData=function(target){const result=upload.apply(this,arguments);invalidate(target);return result;};
    gl.bufferSubData=function(target){const result=update.apply(this,arguments);invalidate(target);return result;};
    gl.drawElements=function(){
      const meta=state.current;
      if(state.active&&meta?.terrain&&meta.needed){
        meta.needed=false;
        try{
          const matrix=gl.getUniform(meta.program,meta.mvp);
          // Exclude orthographic shadow passes and invalid/lost contexts.
          if(matrix?.length===16&&Math.abs(matrix[3])+Math.abs(matrix[7])+Math.abs(matrix[11])>1e-6&&Array.from(matrix).every(Number.isFinite)){
            const stride=gl.getVertexAttrib(meta.vertex,gl.VERTEX_ATTRIB_ARRAY_STRIDE);
            const offset=gl.getVertexAttribOffset(meta.vertex,gl.VERTEX_ATTRIB_ARRAY_POINTER);
            const vertex=gl.getVertexAttrib(meta.vertex,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
            const index=gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
            if(stride===12&&offset===0&&vertex&&index&&arguments[2]===gl.UNSIGNED_INT){
              if(vertex!==state.vertexBuffer||index!==state.indexBuffer)state.dirty=true;
              state.vertexBuffer=vertex;state.indexBuffer=index;state.matrix=Float64Array.from(matrix);state.error='';
            }
          }
        }catch(error){state.error=String(error.message||error);}
      }
      return draw.apply(this,arguments);
    };
  }
  function readMesh(){
    if(!state.dirty&&state.vertices)return true;
    const gl=state.gl;if(!gl||!state.vertexBuffer||!state.indexBuffer)return false;
    const previous=gl.getParameter(gl.COPY_READ_BUFFER_BINDING);
    const read=buffer=>{
      gl.bindBuffer(gl.COPY_READ_BUFFER,buffer);
      const length=gl.getBufferParameter(gl.COPY_READ_BUFFER,gl.BUFFER_SIZE);
      if(!(length>0&&length<=16*1024*1024))throw Error('Terrain buffer is unavailable');
      const bytes=new Uint8Array(length);gl.getBufferSubData(gl.COPY_READ_BUFFER,0,bytes);return bytes;
    };
    try{
      state.vertices=new Float32Array(read(state.vertexBuffer).buffer);
      state.indices=new Uint32Array(read(state.indexBuffer).buffer);
      state.dirty=false;state.projected=null;state.reads++;return true;
    }catch(error){state.error=String(error.message||error);return false;}
    finally{gl.bindBuffer(gl.COPY_READ_BUFFER,previous);}
  }
  function projectPoint(x,y,z,width,height,m=state.matrix){
    if(!m)return null;
    const w=m[3]*x+m[7]*y+m[11]*z+m[15];
    if(w<=0)return null;
    return {x:((m[0]*x+m[4]*y+m[8]*z+m[12])/w+1)*width/2,
      y:(1-(m[1]*x+m[5]*y+m[9]*z+m[13])/w)*height/2,w};
  }
  function projectedMesh(bounds){
    const key=Array.from(state.matrix).join(',')+':'+bounds.width+','+bounds.height;
    if(state.projected&&key===state.projectionKey)return state.projected;
    const v=state.vertices,p=new Float64Array(v.length/3*3);
    for(let i=0;i<v.length;i+=3){const q=projectPoint(v[i],v[i+1],v[i+2],bounds.width,bounds.height);
      p[i]=q?.x??NaN;p[i+1]=q?.y??NaN;p[i+2]=q?1/q.w:0;}
    state.projectionKey=key;state.projected=p;return p;
  }
  function pick(clientX,clientY){
    const started=performance.now();
    try{
      const bounds=canvas()?.getBoundingClientRect();
      if(!bounds||!state.matrix||!readMesh())return null;
      const x=clientX-bounds.left,y=clientY-bounds.top;
      if(x<0||y<0||x>=bounds.width||y>=bounds.height)return null;
      const p=projectedMesh(bounds),v=state.vertices,indices=state.indices;
      let nearest=null,bestInverseDepth=0;
      for(let i=0;i+2<indices.length;i+=3){
        const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
        if(a+2>=p.length||b+2>=p.length||c+2>=p.length||!p[a+2]||!p[b+2]||!p[c+2])continue;
        if(x<Math.min(p[a],p[b],p[c])-0.01||x>Math.max(p[a],p[b],p[c])+0.01||y<Math.min(p[a+1],p[b+1],p[c+1])-0.01||y>Math.max(p[a+1],p[b+1],p[c+1])+0.01)continue;
        const divisor=(p[b+1]-p[c+1])*(p[a]-p[c])+(p[c]-p[b])*(p[a+1]-p[c+1]);
        if(Math.abs(divisor)<1e-8)continue;
        const u=((p[b+1]-p[c+1])*(x-p[c])+(p[c]-p[b])*(y-p[c+1]))/divisor;
        const t=((p[c+1]-p[a+1])*(x-p[c])+(p[a]-p[c])*(y-p[c+1]))/divisor,k=1-u-t;
        if(u<-.00001||t<-.00001||k<-.00001)continue;
        const depth=u*p[a+2]+t*p[b+2]+k*p[c+2];
        if(depth<=bestInverseDepth)continue;
        const wx=(u*v[a]*p[a+2]+t*v[b]*p[b+2]+k*v[c]*p[c+2])/depth;
        const wz=(u*v[a+2]*p[a+2]+t*v[b+2]*p[b+2]+k*v[c+2]*p[c+2])/depth;
        const height=(u*v[a+1]*p[a+2]+t*v[b+1]*p[b+2]+k*v[c+1]*p[c+2])/depth;
        if(wx<0||wz>0)continue;
        bestInverseDepth=depth;nearest={x:Math.floor(wx/128),y:Math.floor(-wz/128),worldX:wx,worldY:-wz,height};
      }
      state.picks++;return nearest;
    }finally{state.lastPickMs=performance.now()-started;state.maxPickMs=Math.max(state.maxPickMs,state.lastPickMs);}
  }
  window.WarzoneTerrain={
    active(value){state.active=Boolean(value);if(value){install(window.LaunchedModule?.ctx);
      // Warm the cached projection between choosing a structure and tapping the
      // battlefield, rather than paying the first mesh read in the tap handler.
      setTimeout(()=>{if(state.active&&state.matrix&&readMesh()){const b=canvas()?.getBoundingClientRect();if(b)projectedMesh(b);}},100);
    }},
    pick,
    project(x,y,height=0){const b=canvas()?.getBoundingClientRect();const p=b&&projectPoint(x,height,-y,b.width,b.height);return p?{x:p.x+b.left,y:p.y+b.top}:null;},
    report(){return {ready:Boolean(state.matrix&&state.vertexBuffer),active:state.active,reads:state.reads,picks:state.picks,lastPickMs:state.lastPickMs,maxPickMs:state.maxPickMs,error:state.error};}
  };
  const timer=setInterval(()=>install(window.LaunchedModule?.ctx),250);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
