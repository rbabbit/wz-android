/* Read the original terrain geometry/projection. No engine or artwork changes. */
(() => {
  'use strict';
  if (window.WarzoneTerrain) return;
  const state={active:false,gl:null,meta:new WeakMap(),bound:new Map(),current:null,
    vertexBuffer:null,indexBuffer:null,vertices:null,indices:null,matrix:null,dirty:true,
    cpuBuffers:new Map(),gpuBufferReads:0,cpuBufferReads:0,mirroredUploads:0,cpuInvalidations:0,
    projected:null,projectionKey:'',heightIndex:null,heightIndexBuilds:0,heightQueries:0,lastHeightCandidates:0,maxHeightCandidates:0,heightTriangleTests:0,
    lastMeshReadMs:0,maxMeshReadMs:0,lastHeightIndexMs:0,maxHeightIndexMs:0,lastHeightMs:0,maxHeightMs:0,
    revision:0,observations:0,observedAt:0,reads:0,picks:0,lastPickMs:0,maxPickMs:0,error:''};
  const heightCellSize=512,heightBoundsSlop=.01;
  const canvas=()=>document.getElementById('canvas');
  const observedBuffer=buffer=>Boolean(buffer)&&(buffer===state.vertexBuffer||buffer===state.indexBuffer);
  function invalidateCopy(buffer,forgetSize=false){if(!observedBuffer(buffer))return;const old=state.cpuBuffers.get(buffer);state.cpuBuffers.set(buffer,{bytes:null,size:forgetSize?undefined:old?.size});state.cpuInvalidations++;}
  function clearMesh(){state.cpuBuffers.clear();state.vertexBuffer=null;state.indexBuffer=null;state.vertices=null;state.indices=null;state.matrix=null;state.projected=null;state.heightIndex=null;state.current=null;state.bound.clear();state.dirty=true;state.revision++;}
  function cpuByteCount(){let bytes=0;for(const copy of state.cpuBuffers.values())bytes+=copy.bytes?.byteLength||0;return bytes;}
  function uploadBytes(data,srcOffset,length,hasRange){
    let buffer,offset,bytes,elementSize=1;
    if(ArrayBuffer.isView(data)){buffer=data.buffer;offset=data.byteOffset;bytes=data.byteLength;elementSize=data.BYTES_PER_ELEMENT||1;}
    else if(Object.prototype.toString.call(data)==='[object ArrayBuffer]'||Object.prototype.toString.call(data)==='[object SharedArrayBuffer]'){
      if(hasRange)return null;buffer=data;offset=0;bytes=data.byteLength;
    }else return null;
    const start=srcOffset===undefined?0:srcOffset,count=length===undefined?0:length;
    if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(count)||count<0)return null;
    const first=start*elementSize,size=count===0?bytes-first:count*elementSize;
    if(!Number.isSafeInteger(first)||!Number.isSafeInteger(size)||first>bytes||size<0||first+size>bytes||size>16*1024*1024)return null;
    // Own the uploaded bytes; retaining a HEAP view would alias later Wasm/SAB
    // writes that were never uploaded to the native graphics buffer.
    return new Uint8Array(new Uint8Array(buffer,offset+first,size));
  }
  function preparedUpload(gl,args,replace){
    try{
      if(replace){
        const usage=args[2];if(!Number.isInteger(usage)||(usage!==gl.STREAM_DRAW&&usage!==gl.STREAM_READ&&usage!==gl.STREAM_COPY&&usage!==gl.STATIC_DRAW&&usage!==gl.STATIC_READ&&usage!==gl.STATIC_COPY&&usage!==gl.DYNAMIC_DRAW&&usage!==gl.DYNAMIC_READ&&usage!==gl.DYNAMIC_COPY))return null;
        if(typeof args[1]==='number')return args.length===3&&Number.isSafeInteger(args[1])&&args[1]>=0&&args[1]<=16*1024*1024?new Uint8Array(args[1]):null;
        return uploadBytes(args[1],args[3],args[4],args.length>3);
      }
      return uploadBytes(args[2],args[3],args[4],args.length>3);
    }catch(_){return null;}
  }
  function mirrorUpload(buffer,args,replace,bytes){
    if(!bytes){invalidateCopy(buffer,replace);return;}
    if(replace){state.cpuBuffers.set(buffer,{bytes,size:bytes.byteLength});state.mirroredUploads++;return;}
    const old=state.cpuBuffers.get(buffer),offset=args[1];
    if(!old||!Number.isSafeInteger(offset)||offset<0||offset+bytes.byteLength>old.size){invalidateCopy(buffer);return;}
    if(old.bytes){old.bytes.set(bytes,offset);state.mirroredUploads++;}
    else if(offset===0&&bytes.byteLength===old.size){old.bytes=bytes;state.mirroredUploads++;}
  }
  function install(gl){
    if(!gl?.getBufferSubData||gl.__wtTerrainObserved)return;
    if(state.gl&&state.gl!==gl)clearMesh();
    gl.__wtTerrainObserved=true;state.gl=gl;state.dirty=true;
    canvas()?.addEventListener?.('webglcontextlost',clearMesh);
    const use=gl.useProgram,bind=gl.bindBuffer,upload=gl.bufferData,update=gl.bufferSubData,copy=gl.copyBufferSubData,remove=gl.deleteBuffer,draw=gl.drawElements;
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
    function invalidate(target){const buffer=state.bound.get(target);if(buffer&&(buffer===state.vertexBuffer||buffer===state.indexBuffer)){state.dirty=true;state.revision++;}}
    gl.bufferData=function(target){const buffer=state.bound.get(target),tracked=observedBuffer(buffer),bytes=tracked?preparedUpload(gl,arguments,true):null,result=upload.apply(this,arguments);if(tracked)mirrorUpload(buffer,arguments,true,bytes);invalidate(target);return result;};
    gl.bufferSubData=function(target){const buffer=state.bound.get(target),tracked=observedBuffer(buffer),bytes=tracked?preparedUpload(gl,arguments,false):null,result=update.apply(this,arguments);if(tracked)mirrorUpload(buffer,arguments,false,bytes);invalidate(target);return result;};
    if(copy)gl.copyBufferSubData=function(readTarget,writeTarget){const result=copy.apply(this,arguments),buffer=state.bound.get(writeTarget);if(observedBuffer(buffer))invalidateCopy(buffer);invalidate(writeTarget);return result;};
    if(remove)gl.deleteBuffer=function(buffer){const result=remove.apply(this,arguments);if(observedBuffer(buffer))clearMesh();return result;};
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
              if(vertex!==state.vertexBuffer||index!==state.indexBuffer){state.dirty=true;state.revision++;for(const buffer of state.cpuBuffers.keys())if(buffer!==vertex&&buffer!==index)state.cpuBuffers.delete(buffer);}
              state.vertexBuffer=vertex;state.indexBuffer=index;state.matrix=Float64Array.from(matrix);state.observations++;state.observedAt=performance.now();state.error='';
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
    const started=performance.now();let previous,copyBound=false;
    const read=buffer=>{
      const cached=state.cpuBuffers.get(buffer)?.bytes;
      if(cached){if(!(cached.byteLength>0&&cached.byteLength<=16*1024*1024))throw Error('Terrain buffer is unavailable');state.cpuBufferReads++;return cached;}
      if(!copyBound){previous=gl.getParameter(gl.COPY_READ_BUFFER_BINDING);copyBound=true;}
      gl.bindBuffer(gl.COPY_READ_BUFFER,buffer);
      const length=gl.getBufferParameter(gl.COPY_READ_BUFFER,gl.BUFFER_SIZE);
      if(!(length>0&&length<=16*1024*1024))throw Error('Terrain buffer is unavailable');
      const bytes=new Uint8Array(length);state.gpuBufferReads++;gl.getBufferSubData(gl.COPY_READ_BUFFER,0,bytes);state.cpuBuffers.set(buffer,{bytes,size:length});return bytes;
    };
    try{
      state.vertices=new Float32Array(read(state.vertexBuffer).buffer);
      state.indices=new Uint32Array(read(state.indexBuffer).buffer);
      state.dirty=false;state.projected=null;state.heightIndex=null;state.reads++;return true;
    }catch(error){state.error=String(error.message||error);return false;}
    finally{if(copyBound)gl.bindBuffer(gl.COPY_READ_BUFFER,previous);state.lastMeshReadMs=performance.now()-started;state.maxMeshReadMs=Math.max(state.maxMeshReadMs,state.lastMeshReadMs);}
  }
  function heightIndex(){
    if(state.heightIndex)return state.heightIndex;
    const started=performance.now(),v=state.vertices,ix=state.indices,cells=new Map(),wide=[];
    for(let i=0;i+2<ix.length;i+=3){
      const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3;
      const den=(v[b+2]-v[c+2])*(v[a]-v[c])+(v[c]-v[b])*(v[a+2]-v[c+2]);if(Math.abs(den)<1e-8)continue;
      const minX=Math.min(v[a],v[b],v[c]),maxX=Math.max(v[a],v[b],v[c]),minZ=Math.min(v[a+2],v[b+2],v[c+2]),maxZ=Math.max(v[a+2],v[b+2],v[c+2]);
      if(!Number.isFinite(minX)||!Number.isFinite(maxX)||!Number.isFinite(minZ)||!Number.isFinite(maxZ))continue;
      const left=Math.floor((minX-heightBoundsSlop)/heightCellSize),right=Math.floor((maxX+heightBoundsSlop)/heightCellSize),top=Math.floor((minZ-heightBoundsSlop)/heightCellSize),bottom=Math.floor((maxZ+heightBoundsSlop)/heightCellSize);
      // Normal terrain triangles cover at most a few cells. Keep a bounded
      // fallback for unusual large triangles without allocating a giant grid.
      if(!Number.isSafeInteger(left)||!Number.isSafeInteger(right)||!Number.isSafeInteger(top)||!Number.isSafeInteger(bottom)||(right-left+1)*(bottom-top+1)>4096){wide.push(i);continue;}
      for(let z=top;z<=bottom;z++)for(let x=left;x<=right;x++){
        const key=x+','+z;let list=cells.get(key);if(!list){list=[];cells.set(key,list);}list.push(i);
      }
    }
    state.heightIndex={cells,wide};state.heightIndexBuilds++;
    state.lastHeightIndexMs=performance.now()-started;state.maxHeightIndexMs=Math.max(state.maxHeightIndexMs,state.lastHeightIndexMs);return state.heightIndex;
  }
  function heightAt(x,y){
    const started=performance.now();state.heightQueries++;state.lastHeightCandidates=0;
    try{
      if(!readMesh())return null;
      const v=state.vertices,ix=state.indices,z=-y,index=heightIndex(),local=index.cells.get(Math.floor(x/heightCellSize)+','+Math.floor(z/heightCellSize))||[],wide=index.wide;
      state.lastHeightCandidates=local.length+wide.length;state.maxHeightCandidates=Math.max(state.maxHeightCandidates,state.lastHeightCandidates);
      // Both lists retain native index order. Merge them so overlapping or
      // shared-edge faces return the exact same first triangle as the original
      // full scan, including unusual wide faces and multi-height terrain.
      let p=0,q=0;
      while(p<local.length||q<wide.length){
        const i=q>=wide.length||(p<local.length&&local[p]<wide[q])?local[p++]:wide[q++],a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3;state.heightTriangleTests++;
        if(x<Math.min(v[a],v[b],v[c])-heightBoundsSlop||x>Math.max(v[a],v[b],v[c])+heightBoundsSlop||z<Math.min(v[a+2],v[b+2],v[c+2])-heightBoundsSlop||z>Math.max(v[a+2],v[b+2],v[c+2])+heightBoundsSlop)continue;
        const den=(v[b+2]-v[c+2])*(v[a]-v[c])+(v[c]-v[b])*(v[a+2]-v[c+2]);if(Math.abs(den)<1e-8)continue;
        const u=((v[b+2]-v[c+2])*(x-v[c])+(v[c]-v[b])*(z-v[c+2]))/den,t=((v[c+2]-v[a+2])*(x-v[c])+(v[a]-v[c])*(z-v[c+2]))/den;
        if(u>=-.0001&&t>=-.0001&&u+t<=1.0001)return u*v[a+1]+t*v[b+1]+(1-u-t)*v[c+1];
      }
      return null;
    }finally{state.lastHeightMs=performance.now()-started;state.maxHeightMs=Math.max(state.maxHeightMs,state.lastHeightMs);}
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
    async refresh(timeout=1500){
      const before=state.observations,started=performance.now();this.active(true);
      // A retained matrix is not evidence for the current camera. Wait for an
      // actual perspective terrain draw, including after a pan while inactive.
      while(state.observations<=before){
        if(performance.now()-started>=timeout)return false;
        await new Promise(resolve=>setTimeout(resolve,16));
      }
      return Boolean(state.matrix&&readMesh());
    },
    pick,
    // Display-only access to the already observed camera and static ground.
    // Never changes the native viewport, camera, geometry or input pipeline.
    view(){const b=canvas()?.getBoundingClientRect();return b&&state.matrix?{matrix:state.matrix,left:b.left,top:b.top,width:b.width,height:b.height}:null;},
    heightAt,
    project(x,y,height=0){const b=canvas()?.getBoundingClientRect();const p=b&&projectPoint(x,height,-y,b.width,b.height);return p?{x:p.x+b.left,y:p.y+b.top}:null;},
    report(){return {ready:Boolean(state.matrix&&state.vertexBuffer),active:state.active,revision:state.revision,observations:state.observations,observedAt:state.observedAt,reads:state.reads,picks:state.picks,lastPickMs:state.lastPickMs,maxPickMs:state.maxPickMs,
      heightIndexBuilds:state.heightIndexBuilds,heightCells:state.heightIndex?.cells.size||0,heightWideTriangles:state.heightIndex?.wide.length||0,heightQueries:state.heightQueries,lastHeightCandidates:state.lastHeightCandidates,maxHeightCandidates:state.maxHeightCandidates,heightTriangleTests:state.heightTriangleTests,
      gpuBufferReads:state.gpuBufferReads,cpuBufferReads:state.cpuBufferReads,cpuCopies:state.cpuBuffers.size,cpuBytes:cpuByteCount(),mirroredUploads:state.mirroredUploads,cpuInvalidations:state.cpuInvalidations,
      lastMeshReadMs:state.lastMeshReadMs,maxMeshReadMs:state.maxMeshReadMs,lastHeightIndexMs:state.lastHeightIndexMs,maxHeightIndexMs:state.maxHeightIndexMs,lastHeightMs:state.lastHeightMs,maxHeightMs:state.maxHeightMs,error:state.error};}
  };
  const timer=setInterval(()=>install(window.LaunchedModule?.ctx),250);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
