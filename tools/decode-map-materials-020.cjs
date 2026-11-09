'use strict';
// Asset decoding only. The vendored Basis transcoder and native KTX2 source
// provenance are recorded under map/art-assets-020/. No game engine is run.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const basis=require(path.join(root,'map/art-assets-020/decoder/basis_transcoder.cjs'));
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,bytes){const tag=Buffer.from(type),out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);tag.copy(out,4);bytes.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([tag,bytes])),bytes.length+8);return out;}
function png(width,height,rgba){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(raw,y*(width*4+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
(async()=>{
 const targets=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const wasm=fs.readFileSync(path.join(root,'map/art-assets-020/decoder/basis_transcoder.wasm'));
 const module=await basis({wasmBinary:wasm});module.initializeBasis();
 const format=module.transcoder_texture_format.cTFRGBA32.value;
 for(const item of targets){
  const native=fs.readFileSync(item.ktx),file=new module.KTX2File(new Uint8Array(native));
  if(!file.isValid()||!file.startTranscoding())throw Error('Cannot decode native material '+item.material);
  const width=file.getWidth(),height=file.getHeight(),size=file.getImageTranscodedSizeInBytes(0,0,0,format);
  if(size!==width*height*4)throw Error('Unexpected RGBA size '+item.material);
  const rgba=new Uint8Array(size);
  if(!file.transcodeImage(rgba,0,0,0,format,0,-1,-1))throw Error('Material transcode failed '+item.material);
  fs.mkdirSync(path.dirname(item.png),{recursive:true});fs.writeFileSync(item.png,png(width,height,rgba));
  item.width=width;item.height=height;item.nativeKTX2_SHA256=crypto.createHash('sha256').update(native).digest('hex');
  item.rgba_SHA256=crypto.createHash('sha256').update(rgba).digest('hex');
  item.png_SHA256=crypto.createHash('sha256').update(fs.readFileSync(item.png)).digest('hex');
  file.close();file.delete();
 }
 fs.writeFileSync(process.argv[2],JSON.stringify(targets,null,2)+'\n');
 console.log(JSON.stringify({nativeMaterialsDecoded:targets.length,scope:'Native KTX2 asset decoding only; no engine/emulator.'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
