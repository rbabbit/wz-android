/* Source-only event delivery contract; actual native gameplay is checked separately. */
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),files=new Map(),writes=[],emitted=[];
const bodyListeners=new Map(),canvas={},body={addEventListener(type,handler){bodyListeners.set(type,handler);}};
let rejectAck=false;
const sandbox={Promise,Date,performance,console:{warn(){}},setInterval(){},setTimeout,addEventListener(){},
 CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
 dispatchEvent(event){emitted.push(event.detail.text);},document:{body,documentElement:{},getElementById(){return canvas;}},parent:{PcMultiplayerSession:{nativeState(){}}}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'app/src/main/assets/multiplayer/native-ui-adapter.js'),'utf8'),sandbox);
const nativeModule={FS:{readFile(name){if(!files.has(name))throw Error('ENOENT');return files.get(name);},writeFile(name,value){
 if(rejectAck&&name.endsWith('-ack'))throw Error('fixture write failure');files.set(name,value);writes.push([name,value]);},
 rename(from,to){if(!files.has(from))throw Error('ENOENT');files.set(to,files.get(from));files.delete(from);},
 unlink(name){if(!files.delete(name))throw Error('ENOENT');}}};
const batch=(first,messages)=>files.set('/tmp/mp-mobile-events.json',JSON.stringify({serial:first+messages.length-1,first,messages}));
batch(1,Array.from({length:160},(_,i)=>'BNTECH:'+i));
sandbox.PcMultiplayerNativeUI.attach(nativeModule);
assert.equal(emitted.length,160);assert.equal(files.get('/tmp/mp-mobile-events-ack'),'160');
const initialWrites=writes.length;sandbox.PcMultiplayerNative.poll();
assert.equal(emitted.length,160);assert.equal(writes.length,initialWrites);
batch(161,['WTCMD:reply161','BNTECH:162']);sandbox.PcMultiplayerNative.poll();
assert.equal(emitted.length,162);assert.equal(files.get('/tmp/mp-mobile-events-ack'),'162');
rejectAck=true;batch(163,['WTCMD:reply163']);sandbox.PcMultiplayerNative.poll();
assert.equal(emitted.length,163);assert.equal(files.get('/tmp/mp-mobile-events-ack'),'162');
rejectAck=false;sandbox.PcMultiplayerNative.poll();
assert.equal(emitted.length,163);assert.equal(files.get('/tmp/mp-mobile-events-ack'),'163');
assert.equal(sandbox.PcMultiplayerNativeUI.report().lastEvent,163);
sandbox.PcMultiplayerNative.state={worldReady:true};
let fenced=0;
for(const type of ['pointerdown','mousedown','touchstart','wheel']){
 bodyListeners.get(type)({target:{},stopImmediatePropagation(){fenced++;}});
 bodyListeners.get(type)({target:canvas,stopImmediatePropagation(){throw Error('Canvas input was blocked');}});
}
assert.equal(fenced,4);assert.deepEqual({...sandbox.PcMultiplayerNativeUI.report().fencedInput},{pointer:1,mouse:1,touch:1,wheel:1});
sandbox.PcMultiplayerNative.state.worldSafe=true;
assert.equal(sandbox.PcMultiplayerNative.setCamera({yaw:70000,pitch:58000,distance:1400}),true);
assert.equal(sandbox.PcMultiplayerNative.setCamera({yaw:80000}),true);
assert.equal(JSON.parse(files.get('/tmp/mp-mobile-camera.json')).yaw,80000);
assert.equal(files.has('/tmp/mp-mobile-camera.json.tmp'),false);
assert.equal(sandbox.PcMultiplayerNative.setCamera({distance:NaN}),false);
assert.equal(JSON.parse(files.get('/tmp/mp-mobile-camera.json')).yaw,80000);
assert.equal(sandbox.PcMultiplayerNative.cancelCamera(),true);assert.equal(files.has('/tmp/mp-mobile-camera.json'),false);
assert.equal(sandbox.PcMultiplayerNative.cancelCamera(),true);
sandbox.PcMultiplayerNative.state.worldSafe=false;
assert.equal(sandbox.PcMultiplayerNative.setCamera({yaw:50000}),false);
const result={passed:true,fixture:'Actual adapter in a source-only FS/event fixture; not native gameplay',deliveredOnce:emitted.length,
 acknowledgements:writes.filter(x=>x[0].endsWith('-ack')).map(x=>Number(x[1])),failedAcknowledgementRetried:true,
 overlayInputFenced:['pointer','mouse','touch','wheel'],canvasInputPreserved:true,
 cameraLatestWriteWins:true,cameraRejectsInvalidAndUnsafe:true,cameraCancellationNonthrowing:true};
fs.writeFileSync(path.join(root,'qa/multiplayer-070/native-event-contract.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
