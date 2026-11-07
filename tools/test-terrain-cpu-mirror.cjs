'use strict';
// Exercise the actual observer against native-like WebGL2 uploads. After the
// one cold GPU snapshot, disable GPU reads so stale mirrors or hidden readbacks
// fail directly. Actual Android paint latency is measured separately.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/warzone-terrain-picker.js'),'utf8');
const flat=h=>new Float32Array([0,h,0,128,h,0,128,h,-128,0,h,-128]);
const initialVertices=flat(0),initialIndices=new Uint32Array([0,1,2,0,2,3]);
let vb={},ib={},allowRead=true,gpuReads=0,nativeError=0,getErrorCalls=0,throwNext=false;
const copy={},program={},stores=new Map([[vb,new Uint8Array(initialVertices.buffer).slice()],[ib,new Uint8Array(initialIndices.buffer).slice()]]),bound=new Map(),events=new Map();
const matrix=new Float32Array([1/128,0,0,0,0,1/128,0,0,0,1/128,0,-.001,-.5,.5,0,2]);
function nativeSource(data,offset=0,length=0){
 if(ArrayBuffer.isView(data)){const stride=data.BYTES_PER_ELEMENT||1,start=offset*stride,bytes=length===0?data.byteLength-start:length*stride;return new Uint8Array(new Uint8Array(data.buffer,data.byteOffset+start,bytes));}
 if(data instanceof ArrayBuffer||(typeof SharedArrayBuffer!=='undefined'&&data instanceof SharedArrayBuffer))return new Uint8Array(new Uint8Array(data));
 throw new TypeError('Native upload rejected');
}
const gl={LINK_STATUS:1,ACTIVE_UNIFORMS:2,ARRAY_BUFFER:34962,ELEMENT_ARRAY_BUFFER:34963,ELEMENT_ARRAY_BUFFER_BINDING:34965,COPY_READ_BUFFER:36662,COPY_WRITE_BUFFER:36663,COPY_READ_BUFFER_BINDING:36662,BUFFER_SIZE:34660,
 VERTEX_ATTRIB_ARRAY_STRIDE:34340,VERTEX_ATTRIB_ARRAY_POINTER:34373,VERTEX_ATTRIB_ARRAY_BUFFER_BINDING:34975,UNSIGNED_INT:5125,
 STREAM_DRAW:35040,STREAM_READ:35041,STREAM_COPY:35042,STATIC_DRAW:35044,STATIC_READ:35045,STATIC_COPY:35046,DYNAMIC_DRAW:35048,DYNAMIC_READ:35049,DYNAMIC_COPY:35050,
 useProgram:()=>7,bindBuffer(target,buffer){bound.set(target,buffer);return 11;},
 bufferData(target,data,usage,offset,length){
  if(throwNext){throwNext=false;throw new TypeError('Native upload rejected');}
  if(![35040,35041,35042,35044,35045,35046,35048,35049,35050].includes(usage)){nativeError=1280;return 17;}
  stores.set(bound.get(target),typeof data==='number'?new Uint8Array(data):nativeSource(data,offset,length));return 17;
 },
 bufferSubData(target,destination,data,offset,length){
  if(throwNext){throwNext=false;throw new TypeError('Native upload rejected');}
  const bytes=nativeSource(data,offset,length),old=stores.get(bound.get(target));
  if(destination<0||destination+bytes.byteLength>old.byteLength){nativeError=1281;return 19;}
  old.set(bytes,destination);return 19;
 },
 copyBufferSubData(readTarget,writeTarget,readOffset,writeOffset,size){const src=stores.get(bound.get(readTarget)),dst=stores.get(bound.get(writeTarget));dst.set(src.slice(readOffset,readOffset+size),writeOffset);return 29;},
 deleteBuffer(buffer){stores.delete(buffer);return 31;},drawElements:()=>23,getProgramParameter:(p,key)=>key===1?true:2,
 getActiveUniform:(p,i)=>({name:i===0?'ModelViewProjectionMatrix':'groundScale'}),getUniformLocation:()=>1,getAttribLocation:()=>0,getUniform:()=>matrix,
 getVertexAttrib:(a,key)=>key===34340?12:vb,getVertexAttribOffset:()=>0,getParameter:key=>bound.get(key===34965?34963:key),
 getBufferParameter:target=>stores.get(bound.get(target)).byteLength,
 getBufferSubData(target,offset,output){gpuReads++;if(!allowRead)throw Error('Unexpected synchronous GPU readback');output.set(stores.get(bound.get(target)).subarray(offset,offset+output.byteLength));},
 getError(){getErrorCalls++;const result=nativeError;nativeError=0;return result;}};
bound.set(gl.ELEMENT_ARRAY_BUFFER,ib);bound.set(gl.COPY_READ_BUFFER,copy);
const canvas={getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),addEventListener:(type,fn)=>events.set(type,fn)},window={LaunchedModule:{ctx:gl},addEventListener(){}};
vm.runInNewContext(source,{window,document:{getElementById:()=>canvas},setTimeout(){},setInterval(){},clearInterval(){},performance});
const p=window.WarzoneTerrain,draw=()=>{gl.useProgram(program);gl.drawElements(0,stores.get(ib).byteLength/4,gl.UNSIGNED_INT,0);};
function pickedAt(x,y,h){const point=p.project(x,y,h),hit=p.pick(point.x,point.y);assert.ok(hit);assert.ok(Math.abs(hit.worldX-x)<.001&&Math.abs(hit.worldY-y)<.001);assert.ok(Math.abs(hit.height-h)<.001);}
function unchangedGPU(count,label){assert.equal(gpuReads,count,label);assert.equal(p.report().gpuBufferReads,count);assert.equal(getErrorCalls,0,'observer never consumes native GL errors');}

p.active(true);draw();assert.equal(p.heightAt(64,64),0);assert.equal(gpuReads,2,'one cold vertex/index GPU snapshot');assert.equal(p.report().cpuCopies,2);assert.equal(bound.get(gl.COPY_READ_BUFFER),copy);allowRead=false;
gl.bindBuffer(gl.ARRAY_BUFFER,vb);assert.equal(gl.bufferSubData(gl.ARRAY_BUFFER,0,flat(32)),19);assert.equal(p.heightAt(64,64),32);pickedAt(32,32,32);unchangedGPU(2,'native sector height edit uses CPU bytes');
const one=new Float32Array([999,44,999]);gl.bufferSubData(gl.ARRAY_BUFFER,4,one,1,1);assert.equal(p.heightAt(0,0),44,'source float offset counts elements while destination counts bytes');gl.bufferSubData(gl.ARRAY_BUFFER,16,one,1,1);assert.equal(p.heightAt(128,0),44);
const offsetBuffer=new ArrayBuffer(40),offsetView=new Uint16Array(offsetBuffer,6,6);offsetView.fill(65535);new DataView(offsetBuffer).setFloat32(10,80,true);gl.bufferSubData(gl.ARRAY_BUFFER,4,offsetView,2,2);assert.equal(p.heightAt(0,0),80,'source view.byteOffset plus element offset is applied');
const dataBuffer=new ArrayBuffer(16),dataView=new DataView(dataBuffer,4,8);dataView.setFloat32(2,88,true);gl.bufferSubData(gl.ARRAY_BUFFER,16,dataView,2,4);assert.equal(p.heightAt(128,0),88,'DataView range uses bytes');
const remainingView=new DataView(dataBuffer,4,6);remainingView.setFloat32(2,92,true);gl.bufferSubData(gl.ARRAY_BUFFER,16,remainingView,2,0);assert.equal(p.heightAt(128,0),92,'DataView length zero copies remaining bytes');
const heap=new Uint8Array(64);heap.fill(255);new DataView(heap.buffer).setFloat32(12,96,true);const heapView=new Uint8Array(heap.buffer,8,8);gl.bufferSubData(gl.ARRAY_BUFFER,16,heapView,4,0);heap.fill(0);assert.equal(p.heightAt(128,0),96,'explicit zero length means remainder and source HEAP mutations do not alias mirror');
const replacementBuffer=new ArrayBuffer(80),replacement=new Float32Array(replacementBuffer,4,16);replacement.fill(999);replacement.set(flat(64),2);assert.equal(gl.bufferData(gl.ARRAY_BUFFER,replacement,gl.DYNAMIC_DRAW,2,12),17);assert.equal(p.heightAt(64,64),64,'bufferData element range excludes prefix/suffix bytes');pickedAt(32,32,64);
gl.bufferData(gl.ARRAY_BUFFER,60,gl.DYNAMIC_DRAW);assert.equal(p.heightAt(64,64),null,'numeric orphan is genuinely zero-filled');gl.bufferSubData(gl.ARRAY_BUFFER,0,flat(80));assert.equal(p.heightAt(64,64),80,'partial upload after orphan/resize keeps complete zero-filled CPU buffer');assert.equal(p.report().cpuBytes,60+24);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array([99,0,2,3,99]),gl.STATIC_DRAW,1,3);assert.equal(p.heightAt(100,10),null,'new native index bytes remove first triangle');assert.equal(p.heightAt(10,100),80);
const indexHeap=new Uint8Array(48);new Uint32Array(indexHeap.buffer,20,3).set([0,1,2]);gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER,0,new Uint8Array(indexHeap.buffer,4,32),16,12);indexHeap.fill(0);assert.equal(p.heightAt(100,10),80,'native Emscripten HEAPU8 pointer/byte-count index update is mirrored');assert.equal(p.heightAt(10,100),null);
if(typeof SharedArrayBuffer!=='undefined'){
 const shared=new SharedArrayBuffer(32),view=new Uint32Array(shared,4,5);view.set([999,0,2,3,999]);gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER,0,view,1,3);view.fill(0);assert.equal(p.heightAt(10,100),80,'SharedArrayBuffer uploads are copied into owned bytes');assert.equal(p.heightAt(100,10),null);
}
const largeHeap=new Uint8Array(20*1024*1024);new DataView(largeHeap.buffer).setFloat32(19000000,184,true);gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferSubData(gl.ARRAY_BUFFER,4,largeHeap,19000000,4);largeHeap.fill(0,19000000,19000004);assert.equal(p.heightAt(0,0),184,'a native HEAP larger than mirror cap copies only its bounded uploaded window');assert.ok(p.report().cpuBytes<=60+12,'source HEAP size does not increase retained terrain mirror bytes');
const wasmMemory=new WebAssembly.Memory({initial:1,maximum:2}),oldHeap=new Uint8Array(wasmMemory.buffer);new DataView(wasmMemory.buffer).setFloat32(1024,200,true);gl.bufferSubData(gl.ARRAY_BUFFER,4,oldHeap,1024,4);wasmMemory.grow(1);assert.equal(oldHeap.byteLength,0);assert.equal(p.heightAt(0,0),200,'Wasm heap growth/detachment does not invalidate owned uploaded bytes');const grownHeap=new Uint8Array(wasmMemory.buffer);new DataView(wasmMemory.buffer).setFloat32(2048,208,true);gl.bufferSubData(gl.ARRAY_BUFFER,4,grownHeap,2048,4);assert.equal(p.heightAt(0,0),208,'later uploads from the grown HEAP are mirrored correctly');
gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,flat(96).buffer,gl.STATIC_DRAW);assert.equal(p.heightAt(10,100),96,'plain ArrayBuffer upload is mirrored');unchangedGPU(2,'height edits, index edits, offsets, DataView, SAB and resizing require no extra GPU reads');
const revision=p.report().revision;throwNext=true;assert.throws(()=>gl.bufferSubData(gl.ARRAY_BUFFER,0,flat(777)),/Native upload rejected/);assert.equal(p.report().revision,revision,'native JavaScript exception prevents observer commit');assert.equal(p.heightAt(10,100),96);unchangedGPU(2,'failed native upload leaves correct mirror untouched');

// Unknown GPU copy writes must invalidate the destination, never serve stale
// bytes. Only that missing buffer is read again; the unchanged index stays CPU.
const scratch={};gl.bindBuffer(gl.ARRAY_BUFFER,scratch);gl.bufferData(gl.ARRAY_BUFFER,flat(128),gl.STATIC_DRAW);assert.equal(p.report().cpuCopies,2,'unobserved native uploads do not accumulate CPU copies');
gl.bindBuffer(gl.COPY_READ_BUFFER,scratch);gl.bindBuffer(gl.COPY_WRITE_BUFFER,vb);assert.equal(gl.copyBufferSubData(gl.COPY_READ_BUFFER,gl.COPY_WRITE_BUFFER,0,0,48),29);allowRead=true;assert.equal(p.heightAt(10,100),128);assert.equal(gpuReads,3,'unknown destination write falls back for only its vertex buffer');assert.equal(bound.get(gl.COPY_READ_BUFFER),scratch,'fallback restores the actual prior GPU binding');
allowRead=false;gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferSubData(gl.ARRAY_BUFFER,0,flat(144));assert.equal(p.heightAt(10,100),144);unchangedGPU(3,'known partial upload resumes mirroring after fallback seed');
gl.bufferData(gl.ARRAY_BUFFER,flat(999),12345);allowRead=true;assert.equal(p.heightAt(10,100),144,'unsupported/native-rejected upload cannot replace the CPU snapshot with false data');assert.equal(gpuReads,4);assert.equal(nativeError,1280,'native INVALID_ENUM remains unconsumed');assert.equal(getErrorCalls,0);
assert.equal(gl.getError(),1280);getErrorCalls=0;gl.bufferSubData(gl.ARRAY_BUFFER,-4,new Uint8Array([1,2,3,4]));assert.equal(p.heightAt(10,100),144);assert.equal(gpuReads,5);assert.equal(nativeError,1281,'native INVALID_VALUE remains unconsumed');assert.equal(getErrorCalls,0);assert.equal(gl.getError(),1281);getErrorCalls=0;

// Changing the observed identity or losing/deleting its context drops old
// copies. Fresh identities may cold-read once, without retaining old buffers.
const oldVB=vb;vb={};stores.set(vb,new Uint8Array(flat(160).buffer));draw();assert.equal(p.heightAt(10,100),160);assert.equal(p.report().cpuCopies,2);assert.ok(p.report().cpuBytes<=48+12);assert.equal(gpuReads,6);
assert.equal(gl.deleteBuffer(vb),31);assert.equal(p.heightAt(10,100),null);assert.equal(p.report().cpuCopies,0,'deleted observed buffer drops retained snapshots');
vb={};stores.set(vb,new Uint8Array(flat(176).buffer));draw();assert.equal(p.heightAt(10,100),176);assert.equal(p.report().cpuCopies,2);
events.get('webglcontextlost')();assert.equal(p.report().cpuCopies,0);assert.equal(p.heightAt(10,100),null,'context loss cannot serve stale CPU geometry');
draw();assert.equal(p.heightAt(10,100),176);assert.equal(p.report().cpuCopies,2);assert.equal(getErrorCalls,0);assert.ok(stores.has(oldVB),'observer never deletes or changes native buffers itself');
console.log(JSON.stringify({passed:true,coldGpuReads:2,additionalGpuReadsForKnownUploads:0,knownUploadKinds:'native HEAPU8, typed ranges/byteOffset, DataView, explicit length0, ArrayBuffer, SAB, orphan/resize, vertex/index updates',safeFallbacks:'unknown copy and rejected uploads',scope:'observer code checks; actual Android latency measured separately'}));
