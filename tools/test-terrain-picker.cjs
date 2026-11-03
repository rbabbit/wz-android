'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const vertices=new Float32Array([0,0,0,128,0,0,128,0,-128,0,0,-128]),indices=new Uint32Array([0,1,2,0,2,3]);
const vb={},ib={},originalCopy={},program={},bound=new Map([[4,ib],[5,originalCopy]]),calls=[];
let matrix=new Float32Array([1/128,0,0,0,0,1/128,0,0,0,1/128,0,-.001,-.5,.5,0,2]);
const gl={LINK_STATUS:1,ACTIVE_UNIFORMS:2,ELEMENT_ARRAY_BUFFER_BINDING:4,COPY_READ_BUFFER:5,COPY_READ_BUFFER_BINDING:6,BUFFER_SIZE:7,
 VERTEX_ATTRIB_ARRAY_STRIDE:8,VERTEX_ATTRIB_ARRAY_POINTER:9,VERTEX_ATTRIB_ARRAY_BUFFER_BINDING:10,UNSIGNED_INT:11,
 useProgram:p=>{calls.push(['use',p]);return 7;},bindBuffer:(t,b)=>{bound.set(t,b);calls.push(['bind',t,b]);},bufferData:()=>17,bufferSubData:()=>19,
 drawElements:(...a)=>{calls.push(['draw',...a]);return 23;},getProgramParameter:(p,key)=>key===1?true:2,
 getActiveUniform:(p,i)=>({name:i===0?'ModelViewProjectionMatrix':'groundScale'}),getUniformLocation:()=>1,getAttribLocation:()=>0,
 getUniform:()=>matrix,getVertexAttrib:(a,key)=>key===8?12:vb,getVertexAttribOffset:()=>0,
 getParameter:key=>bound.get(key===6?5:key),getBufferParameter:()=>bound.get(5)===vb?vertices.byteLength:indices.byteLength,
 getBufferSubData:(target,offset,out)=>out.set(new Uint8Array((bound.get(5)===vb?vertices:indices).buffer))};
let interval;const window={LaunchedModule:{ctx:gl},addEventListener(){}};
const c=vm.createContext({window,document:{getElementById:()=>({getBoundingClientRect:()=>({left:5,top:10,width:800,height:600})})},setTimeout(){},setInterval:fn=>(interval=fn),clearInterval(){},performance});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/src/main/assets/warzone-terrain-picker.js'),'utf8'),c);
const picker=window.WarzoneTerrain;picker.active(true);assert.equal(gl.useProgram(program),7);assert.equal(gl.drawElements(0,6,11,0),23,'native rendering return is preserved');
assert.equal(picker.report().ready,true);const point=picker.project(64,64,0),picked=picker.pick(point.x,point.y);
assert.ok(Math.abs(picked.worldX-64)<.001);assert.ok(Math.abs(picked.worldY-64)<.001);assert.equal(picked.x,0);assert.equal(picked.y,0);
assert.equal(bound.get(5),originalCopy,'GPU copy-read binding is restored');assert.equal(picker.report().reads,1);
picker.pick(point.x,point.y);assert.equal(picker.report().reads,1,'mesh is cached between taps');
gl.bindBuffer(20,vb);assert.equal(gl.bufferSubData(20,0,vertices),19);picker.pick(point.x,point.y);assert.equal(picker.report().reads,2,'terraform updates invalidate cached geometry');
assert.equal(picker.pick(-10,-20),null);assert.equal(bound.get(5),originalCopy);
// Real GPU linkers remove the unused uv1/paramx1 from the depth shader.
const optimizedProgram={};
matrix=Float32Array.from(matrix);matrix[12]+=.25;
gl.getProgramParameter=(p,key)=>key===1?true:3;
gl.getActiveUniform=(p,i)=>({name:['ModelViewProjectionMatrix','paramx2','lightmap_tex'][i]});
assert.equal(gl.useProgram(optimizedProgram),7);assert.equal(gl.drawElements(0,6,11,0),23);
const optimizedPoint=picker.project(64,64,0);assert.ok(optimizedPoint.x>point.x+40,'optimized depth shader updates the live matrix');
const optimized=picker.pick(optimizedPoint.x,optimizedPoint.y);assert.ok(optimized&&Math.abs(optimized.worldX-64)<.001);
console.log('PASS: perspective terrain picking, projection, native GL delegation, buffer-state restoration and mesh invalidation');
