'use strict';
// Differential height semantics and bounded candidate work. This exercises the
// actual terrain observer with native-like buffers, not a reimplementation of
// the index. Wall-clock emulator paint performance is verified separately.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/warzone-terrain-picker.js'),'utf8');
function fixture(positions,faces){
 let vertices=new Float32Array(positions),indices=new Uint32Array(faces),bufferReads=0;
 const vb={},ib={},copy={},program={},bound=new Map([[4,ib],[5,copy]]);
 const matrix=new Float32Array([1/128,0,0,0,0,1/128,0,0,0,1/128,0,-.001,-.5,.5,0,2]);
 const gl={LINK_STATUS:1,ACTIVE_UNIFORMS:2,ELEMENT_ARRAY_BUFFER_BINDING:4,COPY_READ_BUFFER:5,COPY_READ_BUFFER_BINDING:6,BUFFER_SIZE:7,
  VERTEX_ATTRIB_ARRAY_STRIDE:8,VERTEX_ATTRIB_ARRAY_POINTER:9,VERTEX_ATTRIB_ARRAY_BUFFER_BINDING:10,UNSIGNED_INT:11,
  useProgram(){},bindBuffer:(target,buffer)=>bound.set(target,buffer),bufferData(){},bufferSubData(){},drawElements(){},getProgramParameter:(p,key)=>key===1?true:2,
  getActiveUniform:(p,i)=>({name:i===0?'ModelViewProjectionMatrix':'groundScale'}),getUniformLocation:()=>1,getAttribLocation:()=>0,
  getUniform:()=>matrix,getVertexAttrib:(a,key)=>key===8?12:vb,getVertexAttribOffset:()=>0,getParameter:key=>bound.get(key===6?5:key),
  getBufferParameter:()=>bound.get(5)===vb?vertices.byteLength:indices.byteLength,
  getBufferSubData(target,offset,out){bufferReads++;out.set(new Uint8Array((bound.get(5)===vb?vertices:indices).buffer));}};
 const window={LaunchedModule:{ctx:gl},addEventListener(){}};
 vm.runInNewContext(source,{window,document:{getElementById:()=>({getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})})},setTimeout(){},setInterval(){},clearInterval(){},performance});
 const picker=window.WarzoneTerrain;picker.active(true);gl.useProgram(program);gl.drawElements(0,indices.length,11,0);
 return {picker,buffers:()=>({vertices,indices}),bufferReads:()=>bufferReads,camera(){matrix[12]+=.1;gl.useProgram(program);gl.drawElements(0,indices.length,11,0);},
  replace(positions,faces=indices){vertices=new Float32Array(positions);indices=new Uint32Array(faces);gl.bindBuffer(20,vb);gl.bufferData(20,vertices);gl.bindBuffer(20,ib);gl.bufferData(20,indices);},copyRestored:()=>bound.get(5)===copy};
}
// The pre-index heightAt full scan is the compatibility oracle. Preserve its
// bounding tolerance, barycentric tolerances and first-native-triangle choice.
function fullScan(v,ix,x,y){
 const z=-y;
 for(let i=0;i+2<ix.length;i+=3){
  const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3;
  if(x<Math.min(v[a],v[b],v[c])-.01||x>Math.max(v[a],v[b],v[c])+.01||z<Math.min(v[a+2],v[b+2],v[c+2])-.01||z>Math.max(v[a+2],v[b+2],v[c+2])+.01)continue;
  const den=(v[b+2]-v[c+2])*(v[a]-v[c])+(v[c]-v[b])*(v[a+2]-v[c+2]);if(Math.abs(den)<1e-8)continue;
  const u=((v[b+2]-v[c+2])*(x-v[c])+(v[c]-v[b])*(z-v[c+2]))/den,t=((v[c+2]-v[a+2])*(x-v[c])+(v[a]-v[c])*(z-v[c+2]))/den;
  if(u>=-.0001&&t>=-.0001&&u+t<=1.0001)return u*v[a+1]+t*v[b+1]+(1-u-t)*v[c+1];
 }
 return null;
}
function compare(f,queries,label){const {vertices,indices}=f.buffers();for(const [x,y]of queries)assert.equal(f.picker.heightAt(x,y),fullScan(vertices,indices,x,y),label+' '+x+','+y);}
const width=40,height=36,vertices=[],indices=[];
for(let y=0;y<=height;y++)for(let x=0;x<=width;x++)vertices.push(x*128,24+x*2.5+y*1.75,-y*128);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=y*(width+1)+x,b=a+1,d=a+width+1,c=d+1;indices.push(a,b,c,a,c,d);}
assert.equal(indices.length/3,2880);
const large=fixture(vertices,indices);assert.equal(large.picker.report().heightIndexBuilds,0,'height index is lazy');
const queries=[[0,0],[512,512],[1024,512],[512-.009,512],[512+.009,512],[128,128],[256,256],[width*128,height*128],[-.009,128],[-.011,128],[128,-.009],[128,-.011],[width*128+.009,256],[width*128+.011,256],[NaN,128],[Infinity,128],['64','64']];
for(let n=0;n<200;n++)queries.push([((n*137)%5119)+.125,((n*313)%4607)+.25]);
compare(large,queries,'large-grid exact full-scan semantics');
const r=large.picker.report();assert.equal(r.heightIndexBuilds,1);assert.equal(r.reads,1);assert.equal(large.bufferReads(),2,'all static height queries share one native vertex/index read');
assert.ok(r.maxHeightCandidates<=72,'512-unit cells bound query candidates on a 2880-triangle terrain');assert.ok(r.heightTriangleTests<=queries.length*72,'candidate tests stay local instead of rescanning 2880 faces per sample');
const analytic=large.picker.heightAt(3000.5,2000.25),expected=24+3000.5/128*2.5+2000.25/128*1.75;assert.ok(Math.abs(analytic-expected)<1e-8,'barycentric height retains the exact sloped plane');
large.camera();compare(large,[[512,512],[3000.5,2000.25]],'camera-only change');assert.equal(large.picker.report().heightIndexBuilds,1,'camera movement does not rebuild world-height cells');assert.equal(large.bufferReads(),2);
assert.ok(large.copyRestored(),'GPU copy-read binding restored after indexed height reads');
const padded=fixture(vertices,indices.concat(Array(30000).fill(0)));compare(padded,[[0,0],[.001,.001],[512,512],[3000.5,2000.25]],'unused native degenerate index padding');
assert.equal(padded.picker.report().heightCells,r.heightCells,'unused zero-area native triangles do not allocate extra cells');
assert.equal(padded.picker.report().maxHeightCandidates,r.maxHeightCandidates,'10000 unused degenerate triangles do not enlarge query candidate buckets');
assert.equal(padded.picker.report().heightWideTriangles,0);

const cliffVertices=[0,16,0,128,16,0,128,16,-128,0,16,-128,128,96,0,256,96,0,256,96,-128,128,96,-128],cliffFaces=[0,1,2,0,2,3,4,5,6,4,6,7],cliff=fixture(cliffVertices,cliffFaces);
const cliffQueries=[[64,64],[128-.009,64],[128,64],[128+.001,64],[128+.009,64],[128+.011,64],[192,64]];compare(cliff,cliffQueries,'flat cliff/shared-edge ordering');
assert.equal(cliff.picker.heightAt(128,64),16,'shared edge returns original first low face, not the higher overlapping face');assert.equal(cliff.picker.heightAt(128+.001,64),16,'original barycentric/bounding tolerance is preserved');assert.equal(cliff.picker.heightAt(128+.011,64),96);
const flattened=cliffVertices.map((n,i)=>i%3===1?64:n);cliff.replace(flattened);compare(cliff,cliffQueries,'native terrain flatten upload');assert.equal(cliff.picker.heightAt(192,64),64);assert.equal(cliff.picker.report().heightIndexBuilds,2,'native buffer upload invalidates the old spatial index');assert.equal(cliff.picker.report().reads,2);
const raised=cliffVertices.map((n,i)=>i%3===1?n+128:n);cliff.replace(raised);compare(cliff,cliffQueries,'native cliff returns at new height');assert.equal(cliff.picker.heightAt(64,64),144);assert.equal(cliff.picker.heightAt(192,64),224);assert.equal(cliff.picker.report().heightIndexBuilds,3);assert.ok(cliff.copyRestored());

// Overlap at different heights must not sort by nearest/highest face. Exercise
// both ordinary local bins and the bounded wide-face fallback merge.
const overlap=[0,25,0,128,25,0,0,25,-128,0,250,0,128,250,0,0,250,-128],multi=fixture(overlap,[0,1,2,3,4,5]);compare(multi,[[16,16],[64,64],[0,0]],'multiple native heights');assert.equal(multi.picker.heightAt(16,16),25);
const wideVertices=[0,10,0,65536,10,0,0,10,-65536,0,50,0,128,50,0,0,50,-128];
for(const [faces,expectedHeight]of [[[0,1,2,3,4,5],10],[[3,4,5,0,1,2],50]]){const wide=fixture(wideVertices,faces);compare(wide,[[32,32],[8192,8192]],'wide and local original order');assert.equal(wide.picker.heightAt(32,32),expectedHeight);assert.equal(wide.picker.report().heightWideTriangles,1);assert.ok(wide.picker.report().heightCells<=4,'huge triangles do not allocate an unbounded cell grid');}
const extreme=fixture([3e30,0,3e30,3.1e30,0,3e30,3e30,0,3.1e30],[0,1,2]);assert.equal(extreme.picker.heightAt(0,0),null);assert.equal(extreme.picker.report().heightWideTriangles,1,'unsafe integer cell coordinates use bounded fallback');
console.log(JSON.stringify({passed:true,triangles:2880,queries:queries.length,maxCandidates:r.maxHeightCandidates,fullScanCandidateBound:2880,indexBuilds:r.heightIndexBuilds,nativeReads:r.reads,scope:'code checks only; actual emulator paint timing is separate'}));
