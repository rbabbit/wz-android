'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../scenario/warzone-towers-commands.js'),'utf8');
const start=source.indexOf('else if (command.action === "remove-production")'),end=source.indexOf('else if (command.action === "clear-production")',start);
assert.ok(start>0&&end>start);
const queues={'11':[{id:'batch-1',design:{name:'MG'}},{id:'batch-2',design:{name:'MG'}},{id:'different-1',design:{name:'Cannon'}}],'12':[{id:'other-1'}]};
const active={'11':{id:'batch-0',design:{name:'MG'},started:100}};
const replies=[];
const context=vm.createContext({STRUCTURE:1,FACTORY:2,CYBORG_FACTORY:3,VTOL_FACTORY:4,selectedPlayer:0,
 wtcmd_production:queues,wtcmd_factoryActive:active,
 getObject:(type,player,id)=>player===0&&[11,12].includes(id)?{id,stattype:2}:null,
 wtcmd_answer:(command,ok,reason,result)=>replies.push({ok,reason,result})});
const remove=vm.runInContext('(function(command){'+source.slice(start,end).replace(/^else /,'')+'})',context);
const run=(factoryId,jobId)=>remove({action:'remove-production',factoryId,jobId});
const activeBefore=JSON.stringify(active),otherBefore=JSON.stringify(queues['12']);
run(11,'batch-2');assert.deepEqual(queues['11'].map(j=>j.id),['batch-1','different-1']);assert.equal(replies.at(-1).ok,true);
run(11,'batch-2');assert.equal(replies.at(-1).ok,false,'a repeated old row cannot remove a different unit');
run(11,'batch-0');assert.equal(replies.at(-1).reason,'job-missing','an already active job is never cancelled');
run(11,'other-1');assert.equal(replies.at(-1).ok,false,'factory scope is exact');
run(99,'batch-1');assert.equal(replies.at(-1).reason,'factory-missing');
queues['11'].push({id:'next-1'},{id:'next-2'});
remove({action:'remove-production',factoryId:11,jobIds:['next-1','batch-0','next-2']});
assert.deepEqual(Array.from(replies.at(-1).result.jobIds),['next-1','next-2'],'group removal removes only the exact IDs still waiting');
remove({action:'remove-production',factoryId:11,jobIds:[]});assert.equal(replies.at(-1).reason,'invalid');
remove({action:'remove-production',factoryId:11,jobIds:['bad/path']});assert.equal(replies.at(-1).reason,'invalid');
assert.equal(JSON.stringify(active),activeBefore);assert.equal(JSON.stringify(queues['12']),otherBefore);
assert.deepEqual(queues['11'].map(j=>j.id),['batch-1','different-1']);
console.log('PASS: exact waiting-group removal preserves active/promoted units, other orders/factories and stale-row identity');
