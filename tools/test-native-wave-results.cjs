'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function run(phase){let log='',poll;const calls=[];const FS={readdir:()=>['engine.log'],stat:()=>({size:Buffer.byteLength(log)}),open:()=>1,close(){},read(fd,buffer,offset,length,position){const data=Buffer.from(log).subarray(position,position+length);buffer.set(data,offset);return data.length;}};
 const c={console,JSON,Date,TextDecoder,Uint8Array,setTimeout(){},setInterval(fn){poll=fn;},LaunchedModule:{FS,WZVAL_configDirPath:'/game'},__towersNative:{session:'battle-one',publish(){}},__kalaWarzoneTouch:{releaseAll(){}},BlockNightAndroid:{battleWon:s=>calls.push(['won',s]),battleFinished:s=>calls.push(['finished',s])}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('app/src/main/assets/warzone-wave-core.js','utf8'),c);poll();log='BNWAVE:'+JSON.stringify({phase})+'\n';c.__warzoneTowersWaves.engineExited();poll();c.__warzoneTowersWaves.engineExited();return calls;
}
assert.deepEqual(run('victory'),[['won','battle-one']],'Native victory must be read before the generic exit fallback, with one captured session.');
assert.deepEqual(run('defeated'),[['finished','battle-one']]);
assert.deepEqual(run('countdown'),[['finished','battle-one']],'A plain engine quit still produces one result.');
console.log('PASS: active wave adapter sends one session-bound native result; generic exit preserves native victory');
